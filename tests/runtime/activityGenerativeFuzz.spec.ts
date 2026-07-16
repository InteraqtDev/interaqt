/**
 * Activity 层生成式测试（quality-plan §1.5 未覆盖域：activity/interaction 层——r30-D2
 * 逃逸分析明示「整层不在任何生成器辖区」；r29 探索报告点名 race 组运行期基本未测）。
 *
 * 动机：手写活动测试只写「有意义的」图与「正确顺序的」dispatch（夹具偏置）。本 fuzzer
 * 把图形态与 dispatch 序列同时放进生成域：
 *
 * - 图生成：随机活动树——每层 1..3 个节点单链相连（start/end 基数约束由构造保证），
 *   节点 = interaction 或 group（any / every / race，2..3 个分支，分支为子活动，
 *   嵌套至多两层）；全部 interaction/group 为独立实例、全局唯一名。
 * - 驱动：两个并行实例 × 均匀随机抽取任意 interaction dispatch——合法（模型判可用）与
 *   非法（乱序 / 已剪枝分支 / 已完成 / 非头无 activityId）自然混合；头 dispatch 建实例。
 * - 预言机：按文档语义**独立重实现**的 JS 状态机模型（ActivitySeqState / any 剪枝 /
 *   every 全完成 / race 端点完成 / 单链 transferToNext），逐 op 断言：
 *   1. 可用性判定 = dispatch 成败（不可用 ⇒ error，且错误族匹配：非头无 activityId vs
 *      not available）；
 *   2. 每次成功后持久化 state JSON（经 canonical 序列化）与模型逐字节相等；失败后状态不变；
 *   3. stateVersion 每次成功推进恰好 +1（CAS 乐观锁面）；
 *   4. 实例隔离：两实例各自演化互不干扰。
 *
 * 生成域刻意未含（登记为后续扩张点）：group-as-root 第二分支头不带 activityId 的
 * 实例分叉（footgun，文档化行为）、跨活动定义 activityId 混用、payload/attributive 守卫面
 * （interaction 守卫已有独立套件）、并发 dispatch（CAS 竞争面走真实 PG 并发套件）。
 *
 * 预言机敏感性已验证（开发期）：模型注入「race 组提前完成」坏真值后种子当场变红。
 *
 * 再现：FUZZ_ACT_SEED_START / FUZZ_ACT_SEED_COUNT / FUZZ_ACT_OPS；FUZZ_VERBOSE=1。
 */
import { describe, expect, test } from "vitest";
import {
    Action, Activity, ActivityGroup, ActivityManager, Controller, Interaction,
    KlassByName, MonoSystem, Transfer,
} from 'interaqt';
import { PGLiteDB } from '@drivers';
import { mulberry32, chance, int, pick, type Rng } from "../storage/helpers/fuzzRandom.js";

// ---------- 图生成 ----------
type GenNode =
    | { kind: 'interaction', name: string, uuid: string, instance: unknown }
    | { kind: 'group', type: 'any' | 'every' | 'race', uuid: string, instance: unknown, branches: GenSeq[] }
type GenSeq = { nodes: GenNode[] }

function genActivityTree(rng: Rng, tag: string) {
    let interactionCounter = 0
    let branchCounter = 0
    const allInteractions: { name: string, uuid: string }[] = []

    const mkInteraction = (): GenNode => {
        const name = `fzAct${tag}i${interactionCounter++}`
        const instance = Interaction.create({ name, action: Action.create({ name }) })
        allInteractions.push({ name, uuid: (instance as { uuid: string }).uuid })
        return { kind: 'interaction', name, uuid: (instance as { uuid: string }).uuid, instance }
    }

    const genSeq = (depth: number): GenSeq => {
        const nodeCount = 1 + int(rng, 3) // 1..3
        const nodes: GenNode[] = []
        for (let i = 0; i < nodeCount; i++) {
            const makeGroup = depth < 2 && chance(rng, depth === 0 ? 0.45 : 0.3)
            if (makeGroup) {
                const type = pick(rng, ['any', 'every', 'race'] as const)
                const branchCount = 2 + int(rng, 2) // 2..3
                const branches: GenSeq[] = []
                for (let b = 0; b < branchCount; b++) branches.push(genSeq(depth + 1))
                const branchActivities = branches.map(branch => buildActivity(`fzAct${tag}b${branchCounter++}`, branch))
                const instance = ActivityGroup.create({ type, activities: branchActivities as any })
                nodes.push({ kind: 'group', type, uuid: (instance as { uuid: string }).uuid, instance, branches })
            } else {
                nodes.push(mkInteraction())
            }
        }
        return { nodes }
    }

    const buildActivity = (name: string, seq: GenSeq) => {
        const interactions = seq.nodes.filter(n => n.kind === 'interaction').map(n => n.instance)
        const groups = seq.nodes.filter(n => n.kind === 'group').map(n => n.instance)
        const transfers = []
        for (let i = 0; i + 1 < seq.nodes.length; i++) {
            transfers.push(Transfer.create({
                name: `${name}_t${i}`,
                source: seq.nodes[i].instance as any,
                target: seq.nodes[i + 1].instance as any,
            }))
        }
        return Activity.create({ name, interactions: interactions as any, groups: groups as any, transfers: transfers as any })
    }

    const rootSeq = genSeq(0)
    const activityName = `fzAct${tag}root`
    const activity = buildActivity(activityName, rootSeq)
    return { activity, activityName, rootSeq, allInteractions }
}

// ---------- 独立 JS 模型（按文档语义重实现的活动状态机） ----------
type NodePosition = { seq: GenSeq, index: number }

class ModelGraph {
    positions = new Map<string, NodePosition>()
    nodesByUuid = new Map<string, GenNode>()
    headUuids = new Set<string>() // isActivityHead 集合（穿透 group 的分支头）
    constructor(public rootSeq: GenSeq) {
        const walk = (seq: GenSeq) => {
            seq.nodes.forEach((node, index) => {
                this.positions.set(node.uuid, { seq, index })
                this.nodesByUuid.set(node.uuid, node)
                if (node.kind === 'group') node.branches.forEach(walk)
            })
        }
        walk(rootSeq)
        const collectHeads = (node: GenNode) => {
            if (node.kind === 'interaction') { this.headUuids.add(node.uuid); return }
            for (const branch of node.branches) collectHeads(branch.nodes[0])
        }
        collectHeads(rootSeq.nodes[0])
    }
    isStartNode(uuid: string) { return this.positions.get(uuid)!.index === 0 }
    isEndNode(uuid: string) { const p = this.positions.get(uuid)!; return p.index === p.seq.nodes.length - 1 }
    nextOf(uuid: string): GenNode | undefined { const p = this.positions.get(uuid)!; return p.seq.nodes[p.index + 1] }
}

class ModelSeqState {
    current?: ModelNodeState
    constructor(public graph: ModelGraph, public parentGroup?: ModelNodeState) {}
    initFrom(node: GenNode) { this.current = makeNodeState(node, this.graph, this) }
    isAvailable(uuid: string): boolean {
        if (!this.current) return false
        if (this.current.children) return this.current.children.some(child => child.isAvailable(uuid))
        return this.current.node.uuid === uuid
    }
    findStateNode(uuid: string): ModelNodeState | undefined {
        if (!this.current) return undefined
        if (this.current.node.uuid === uuid) return this.current
        for (const child of this.current.children ?? []) {
            const found = child.findStateNode(uuid)
            if (found) return found
        }
        return undefined
    }
    transferToNext(uuid: string) {
        const next = this.graph.nextOf(uuid)
        this.current = undefined
        if (next) this.initFrom(next)
        this.parentGroup?.onChange(uuid, next?.uuid)
    }
    toJSON(): { current?: unknown } {
        return { current: this.current?.toJSON() }
    }
}

class ModelNodeState {
    children?: ModelSeqState[]
    constructor(public node: GenNode, public graph: ModelGraph, public parentSeq: ModelSeqState) {}
    complete() { this.parentSeq.transferToNext(this.node.uuid) }
    isGroupCompleted() { return this.children!.every(child => !child.current) }
    onChange(childPrevUuid: string, childNextUuid?: string) {
        const type = (this.node as { type: 'any' | 'every' | 'race' }).type
        if (type === 'any') {
            if (this.graph.isStartNode(childPrevUuid)) {
                if (childNextUuid) {
                    this.children = this.children!.filter(child => child.current?.node.uuid === childNextUuid)
                } else {
                    this.complete()
                    return
                }
            }
            if (this.isGroupCompleted()) this.complete()
        } else if (type === 'every') {
            if (this.isGroupCompleted()) this.complete()
        } else {
            if (this.graph.isEndNode(childPrevUuid)) this.complete()
        }
    }
    toJSON(): Record<string, unknown> {
        return {
            uuid: this.node.uuid,
            children: this.children?.map(child => child.toJSON()),
        }
    }
}

function makeNodeState(node: GenNode, graph: ModelGraph, parentSeq: ModelSeqState): ModelNodeState {
    const state = new ModelNodeState(node, graph, parentSeq)
    if (node.kind === 'group') {
        state.children = node.branches.map(branch => {
            const seqState = new ModelSeqState(graph, state)
            seqState.initFrom(branch.nodes[0])
            return seqState
        })
    }
    return state
}

class ModelInstance {
    root: ModelSeqState
    stateVersion = 0
    constructor(public graph: ModelGraph) {
        this.root = new ModelSeqState(graph)
        this.root.initFrom(graph.rootSeq.nodes[0])
    }
    isAvailable(uuid: string) { return this.root.isAvailable(uuid) }
    complete(uuid: string) {
        const stateNode = this.root.findStateNode(uuid)
        if (!stateNode) throw new Error(`model: node ${uuid} not found in current state`)
        stateNode.complete()
        this.stateVersion++
    }
    toJSON() { return this.root.toJSON() }
}

/** canonical 序列化（键排序 + 丢 undefined）：与持久化 JSON 的键序方言解耦 */
function canonical(value: unknown): string {
    return JSON.stringify(sortDeep(JSON.parse(JSON.stringify(value ?? null))))
}
function sortDeep(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortDeep)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key => [key, sortDeep((value as Record<string, unknown>)[key])]))
    }
    return value
}

// ---------- runner ----------
async function runActivityFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const tag = `${seed}_`
    const { activity, activityName, rootSeq, allInteractions } = genActivityTree(rng, tag)

    const activityManager = new ActivityManager([activity as any])
    const output = activityManager.getOutput()
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: [...output.entities],
        relations: [...output.relations],
        eventSources: [...output.eventSources],
    })
    await controller.setup(true)
    const activityCall = activityManager.getActivityCallByName(activityName)!
    const user = { id: 'fz-activity-user' }
    const eventSourceByInteraction = new Map(allInteractions.map(i =>
        [i.uuid, controller.findEventSourceByName(`${activityName}:${i.name}`)!]))

    const graph = new ModelGraph(rootSeq)
    type Instance = { model: ModelInstance, activityId?: string }
    const instances: Instance[] = [{ model: new ModelInstance(graph) }, { model: new ModelInstance(graph) }]

    const opLog: { step: number, instance: number, interaction: string, expected: string, outcome: string }[] = []
    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-10)
        throw new Error(`[activity-fuzz seed=${seed}] ${message}\n` +
            `graph: ${JSON.stringify(describeSeq(rootSeq))}\n` +
            `op log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    const assertInstanceState = async (instance: Instance, context: string) => {
        if (!instance.activityId) return
        const persisted = await activityCall.getActivity(controller, instance.activityId)
        const actualState = canonical(persisted.state)
        const expectedState = canonical(instance.model.toJSON())
        if (actualState !== expectedState) {
            failWith(`${context}: persisted state diverges from model\nexpected: ${expectedState}\nactual:   ${actualState}`)
        }
        const actualVersion = persisted.stateVersion ?? 0
        if (actualVersion !== instance.model.stateVersion) {
            failWith(`${context}: stateVersion ${actualVersion} != model ${instance.model.stateVersion}`)
        }
    }

    let executed = 0, legalDispatches = 0
    for (let step = 0; step < opsCount; step++) {
        const instanceIndex = int(rng, instances.length)
        const instance = instances[instanceIndex]
        const target = pick(rng, allInteractions)
        const eventSource = eventSourceByInteraction.get(target.uuid)!

        if (!instance.activityId) {
            // 实例未建：只有 isActivityHead 集合内的 interaction 能以「无 activityId」建实例
            const isHead = graph.headUuids.has(target.uuid)
            const result = await controller.dispatch(eventSource as any, { user })
            if (isHead) {
                if (result.error) {
                    failWith(`step ${step}: head interaction ${target.name} failed to create an instance: ${String((result.error as any).message ?? result.error)}`)
                }
                instance.activityId = result.context!.activityId as string
                instance.model.complete(target.uuid)
                opLog.push({ step, instance: instanceIndex, interaction: target.name, expected: 'create-instance', outcome: 'ok' })
                legalDispatches++
            } else {
                if (!result.error) {
                    failWith(`step ${step}: NON-head interaction ${target.name} dispatched without activityId was silently accepted`)
                }
                const message = String((result.error as any).message ?? result.error)
                if (!/activityId must be provided/.test(message)) {
                    failWith(`step ${step}: non-head-no-activityId error family mismatch: ${message}`)
                }
                opLog.push({ step, instance: instanceIndex, interaction: target.name, expected: 'reject (no activityId)', outcome: 'ok' })
            }
        } else {
            const available = instance.model.isAvailable(target.uuid)
            const result = await controller.dispatch(eventSource as any, { user, activityId: instance.activityId })
            if (available) {
                if (result.error) {
                    failWith(`step ${step}: model says ${target.name} is AVAILABLE on instance ${instanceIndex} but dispatch failed: ${String((result.error as any).message ?? result.error)}\n` +
                        `model state: ${canonical(instance.model.toJSON())}`)
                }
                instance.model.complete(target.uuid)
                opLog.push({ step, instance: instanceIndex, interaction: target.name, expected: 'advance', outcome: 'ok' })
                legalDispatches++
            } else {
                if (!result.error) {
                    failWith(`step ${step}: model says ${target.name} is NOT available on instance ${instanceIndex} but dispatch succeeded (state machine over-accepts)\n` +
                        `model state: ${canonical(instance.model.toJSON())}`)
                }
                const message = String((result.error as any).message ?? result.error)
                if (!/not available/.test(message)) {
                    failWith(`step ${step}: unavailable-dispatch error family mismatch: ${message}`)
                }
                opLog.push({ step, instance: instanceIndex, interaction: target.name, expected: 'reject (not available)', outcome: 'ok' })
            }
        }
        executed++
        // 每步之后两个实例都对账（隔离性：另一实例不得被本次 dispatch 扰动）
        await assertInstanceState(instances[0], `step ${step} (instance 0)`)
        await assertInstanceState(instances[1], `step ${step} (instance 1)`)
    }

    if (executed === 0 && opsCount > 0) failWith('executed no ops')
    await system.destroy()
    return { seed, executed, legalDispatches }
}

function describeSeq(seq: GenSeq): unknown {
    return seq.nodes.map(node => node.kind === 'interaction'
        ? node.name
        : { [node.type]: node.branches.map(describeSeq) })
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_ACT_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_ACT_SEED_COUNT ?? 6)
const OPS = Number(process.env.FUZZ_ACT_OPS ?? 24)

describe('activity-layer generative fuzz (random activity graphs × random dispatch sequences vs independent workflow model)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: availability, state JSON, and stateVersion match the independent model after every dispatch', async (seed) => {
        const result = await runActivityFuzzCase(seed, OPS)
        expect(result.executed, `activity seed ${seed} executed no ops`).toBeGreaterThan(0)
    }, 300000)
})
