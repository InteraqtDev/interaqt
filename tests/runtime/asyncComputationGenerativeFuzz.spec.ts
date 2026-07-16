/**
 * 异步计算生成式测试（quality-plan §1.3 第 2 步剩余扩张点 / §1.5 未覆盖域：async 计算；
 * r30 操作性规则 3：「同一 freshnessKey 上 async / sync / resolved / skip 的任意交错序列，
 * 都要能收敛到最后一次产出胜出」——本套件把该规则内建为预言机）。
 *
 * 动机：r30-B（同步/resolved 新值被陈旧 pending task 覆写）逃逸的根因是手写 async 夹具
 * 只测单一路径（纯 async→apply / 纯 resolved→apply），从不构造混合返回类型的时序交错。
 * 本 fuzzer 把「返回类型序列 × task 完成时序」放进生成域：
 *
 * - 声明：property 级 + global 级各一个 async-capable 自定义计算（返回类型由数据驱动：
 *   record.mode / Σinput%4 决定 sync / resolved / async / skip——序列即交错轴）；
 * - 驱动：createHost / updateHost（改 mode/input）/ workerComplete（外部 worker 盲写
 *   result+success）/ daemonReturn（handleAsyncReturn，含对 pending / 陈旧 / 已作废 task
 *   的调用）/ staleBlindWrite（对已被 sync/resolved 作废删除的 task 行盲写——必须 no-op）；
 * - 预言机（独立 JS 模型按框架契约重实现 task 生命周期）：
 *   1. 值收敛：每个 freshnessKey 的可见值 = 最后一次「已提交产出」（sync/resolved 即时产出；
 *      async 产出仅当 handleAsyncReturn 时该 task 仍是本 key 的最新 task 行）；
 *   2. task 行对账：每 key 的 task 行按 id 序 = 模型按创建序的存活 task（status 逐位相等）——
 *      sync/resolved 作废必须物理删除 pending/success 行（r30-B 的删除语义）；
 *   3. 触发面：update 只有依赖属性**值变化**才重算（shouldTriggerUpdateComputation 契约，
 *      同值写入不触发）；global 记录依赖对 attributeQuery 外的属性更新不触发。
 *
 * 契约笔记（模型据实实现）：
 * - global 自定义计算在 setup 期不做初始 compute（globalAsyncComputed.spec 固化：
 *   setup 后 task 数为 0，dict 值为初始 null/undefined）；
 * - handleAsyncReturn 对非最新 task：任何状态（含 pending）都标记 skipped（stale-task）；
 *   对最新但未 success 的 task：no-op（task-not-success，保持 pending）；
 * - 最新性按「同 freshnessKey 全部存活行的最大 id」判定（applied/skipped 行也参与）。
 *
 * 生成域刻意未含（登记为后续扩张点）：宿主删除 ×悬挂 task、自定义 args.freshnessKey
 * （r30-B 诚实边界：纯同步路径只能按默认键作废）、entity/relation 级 async。
 *
 * 预言机敏感性已验证（开发期）：模型注入「作废不删行」坏真值后种子当场变红。
 *
 * 再现：FUZZ_ASYNC_SEED_START / FUZZ_ASYNC_SEED_COUNT / FUZZ_ASYNC_OPS；FUZZ_VERBOSE=1。
 */
import { describe, expect, test } from "vitest";
import {
    ComputationResult, Controller, DataBasedComputation, DataDep, Dictionary, Entity,
    GlobalDataContext, KlassByName, MonoSystem, Property, PropertyDataContext,
} from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import { mulberry32, chance, int, pick } from "../storage/helpers/fuzzRandom.js";

type Row = Record<string, unknown>

const MODE_MENU = ['sync', 'resolved', 'async', 'skip'] as const
type Mode = typeof MODE_MENU[number]

// ---------- 自定义 async 计算（Klass + Computation 实现，r30 Crawler 模式） ----------
interface FzAsyncPropArgs { source: string }
class FzAsyncProp {
    public uuid: string; public _type = 'FzAsyncProp'; public _options?: { uuid?: string }; public source: string;
    constructor(args: FzAsyncPropArgs, options?: { uuid?: string }) { this._options = options; this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9); this.source = args.source }
    static isKlass = true as const; static displayName = 'FzAsyncProp'; static instances: FzAsyncProp[] = [];
    static public = { source: { type: 'string' as const, required: true as const } };
    static create(args: FzAsyncPropArgs, options?: { uuid?: string }): FzAsyncProp { const i = new FzAsyncProp(args, options); FzAsyncProp.instances.push(i); return i }
    static stringify(i: FzAsyncProp): string { return JSON.stringify({ type: 'FzAsyncProp', options: i._options, uuid: i.uuid, public: { source: i.source } }) }
    static parse(json: string): FzAsyncProp { const d = JSON.parse(json); return FzAsyncProp.create(d.public, d.options) }
    static clone(i: FzAsyncProp): FzAsyncProp { return FzAsyncProp.create({ source: i.source }) }
    static is(obj: unknown): obj is FzAsyncProp { return obj !== null && typeof obj === 'object' && (obj as any)._type === 'FzAsyncProp' }
    static check(data: unknown): boolean { return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string' }
}
class FzAsyncPropComputation implements DataBasedComputation {
    static computationType = FzAsyncProp
    static contextType = 'property' as const
    state = {}
    dataDeps: { [key: string]: DataDep }
    constructor(public controller: Controller, public args: FzAsyncProp, public dataContext: PropertyDataContext) {
        this.dataDeps = { _current: { type: 'property', attributeQuery: ['input', 'mode'] } }
    }
    async compute({ _current }: { _current: any }) {
        const mode = _current.mode as Mode
        const input = _current.input
        if (mode === 'sync') return `sync:${input}`
        if (mode === 'resolved') return ComputationResult.resolved(`res:${input}`, { via: 'resolved' })
        if (mode === 'async') return ComputationResult.async({ input })
        return ComputationResult.skip()
    }
    async asyncReturn(result: any, args: any) { return `ret(${result})` }
}

interface FzAsyncGlobalArgs { entityName: string }
class FzAsyncGlobal {
    public uuid: string; public _type = 'FzAsyncGlobal'; public _options?: { uuid?: string }; public entityName: string;
    constructor(args: FzAsyncGlobalArgs, options?: { uuid?: string }) { this._options = options; this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9); this.entityName = args.entityName }
    static isKlass = true as const; static displayName = 'FzAsyncGlobal'; static instances: FzAsyncGlobal[] = [];
    static public = { entityName: { type: 'string' as const, required: true as const } };
    static create(args: FzAsyncGlobalArgs, options?: { uuid?: string }): FzAsyncGlobal { const i = new FzAsyncGlobal(args, options); FzAsyncGlobal.instances.push(i); return i }
    static stringify(i: FzAsyncGlobal): string { return JSON.stringify({ type: 'FzAsyncGlobal', options: i._options, uuid: i.uuid, public: { entityName: i.entityName } }) }
    static parse(json: string): FzAsyncGlobal { const d = JSON.parse(json); return FzAsyncGlobal.create(d.public, d.options) }
    static clone(i: FzAsyncGlobal): FzAsyncGlobal { return FzAsyncGlobal.create({ entityName: i.entityName }) }
    static is(obj: unknown): obj is FzAsyncGlobal { return obj !== null && typeof obj === 'object' && (obj as any)._type === 'FzAsyncGlobal' }
    static check(data: unknown): boolean { return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string' }
}
// 全局计算的实体依赖需要实例引用：工厂按 seed 生成（每个种子有独立实体）
function makeGlobalComputationClass(hostEntity: unknown) {
    class FzAsyncGlobalComputation implements DataBasedComputation {
        static computationType = FzAsyncGlobal
        static contextType = 'global' as const
        state = {}
        dataDeps: { [key: string]: DataDep }
        constructor(public controller: Controller, public args: FzAsyncGlobal, public dataContext: GlobalDataContext) {
            this.dataDeps = { hosts: { type: 'records', source: hostEntity as any, attributeQuery: ['input'] } }
        }
        async compute({ hosts }: { hosts: any[] }) {
            const sum = hosts.reduce((acc, h) => acc + (typeof h.input === 'number' ? h.input : 0), 0)
            const branch = ((sum % 4) + 4) % 4
            if (branch === 0) return `gsync:${sum}`
            if (branch === 1) return ComputationResult.resolved(`gres:${sum}`, { via: 'g' })
            if (branch === 2) return ComputationResult.async({ sum })
            return ComputationResult.skip()
        }
        async asyncReturn(result: any, args: any) { return `ret(${result})` }
    }
    return FzAsyncGlobalComputation
}

// ---------- 独立 JS 模型 ----------
type ModelTask = {
    seq: number
    status: 'pending' | 'success' | 'applied' | 'skipped'
    args: Row
    result?: unknown
    realId?: unknown            // 对账时回填，供 worker/daemon 驱动
}
type KeyState = {
    value: unknown              // 可见值（最后一次已提交产出）
    tasks: ModelTask[]          // 存活 task 行（按创建序 = id 序）
    nextSeq: number
}

class NaiveAsyncModel {
    hosts = new Map<string, { input: number, mode: Mode }>()
    propertyKeys = new Map<string, KeyState>()   // freshnessKey = String(host id)
    globalKey: KeyState = { value: null, tasks: [], nextSeq: 0 }

    private produceSync(state: KeyState, value: unknown) {
        // sync/resolved 产出：作废（物理删除）本 key 全部 pending/success task，再落值
        state.tasks = state.tasks.filter(t => t.status === 'applied' || t.status === 'skipped')
        state.value = value
    }
    private produceAsync(state: KeyState, args: Row) {
        state.tasks.push({ seq: state.nextSeq++, status: 'pending', args })
    }

    /** property 计算触发（create 恒触发；update 仅当 input/mode 值变化） */
    recomputeProperty(id: string) {
        const host = this.hosts.get(id)!
        const state = this.propertyKeys.get(id)!
        if (host.mode === 'sync') this.produceSync(state, `sync:${host.input}`)
        else if (host.mode === 'resolved') this.produceSync(state, `ret(res:${host.input})`)
        else if (host.mode === 'async') this.produceAsync(state, { input: host.input })
        // skip：无产出
    }
    recomputeGlobal() {
        const sum = [...this.hosts.values()].reduce((acc, h) => acc + h.input, 0)
        const branch = ((sum % 4) + 4) % 4
        if (branch === 0) this.produceSync(this.globalKey, `gsync:${sum}`)
        else if (branch === 1) this.produceSync(this.globalKey, `ret(gres:${sum})`)
        else if (branch === 2) this.produceAsync(this.globalKey, { sum })
        // branch 3 skip
    }

    registerCreate(id: unknown, input: number, mode: Mode) {
        const idKey = String(id)
        this.hosts.set(idKey, { input, mode })
        this.propertyKeys.set(idKey, { value: null, tasks: [], nextSeq: 0 })
        this.recomputeProperty(idKey)
        this.recomputeGlobal() // 记录依赖：create 恒触发
    }
    registerUpdate(id: unknown, payload: { input?: number, mode?: Mode }) {
        const idKey = String(id)
        const host = this.hosts.get(idKey)!
        const inputChanged = payload.input !== undefined && payload.input !== host.input
        const modeChanged = payload.mode !== undefined && payload.mode !== host.mode
        if (payload.input !== undefined) host.input = payload.input
        if (payload.mode !== undefined) host.mode = payload.mode
        // 触发面契约：依赖属性值变化才重算（同值写入不触发）
        if (inputChanged || modeChanged) this.recomputeProperty(idKey)
        if (inputChanged) this.recomputeGlobal() // global 只依赖 input
    }
    /** worker 盲写：pending → success（result 由 worker 决定） */
    workerComplete(state: KeyState, task: ModelTask, result: unknown) {
        task.status = 'success'
        task.result = result
    }
    /** handleAsyncReturn 契约 */
    daemonReturn(state: KeyState, task: ModelTask) {
        if (task.status === 'applied' || task.status === 'skipped') return // already-handled
        const latestSeq = state.tasks.length ? Math.max(...state.tasks.map(t => t.seq)) : -1
        if (task.seq !== latestSeq) {
            task.status = 'skipped' // stale-task：pending/success 都标 skipped
            return
        }
        if (task.status === 'success') {
            task.status = 'applied'
            state.value = `ret(${task.result})`
        }
        // pending 最新：task-not-success，保持 pending
    }
}

// ---------- runner ----------
async function runAsyncComputationFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const hostName = `FzAsy${seed}H`
    const hostEntity = Entity.create({
        name: hostName,
        properties: [
            Property.create({ name: 'input', type: 'number' }),
            Property.create({ name: 'mode', type: 'string' }),
            Property.create({ name: 'output', type: 'string', computation: FzAsyncProp.create({ source: 'input' }) as any }),
        ]
    })
    const dictName = `fzAsy${seed}g`
    const dictionary = Dictionary.create({
        name: dictName, type: 'string', collection: false,
        computation: FzAsyncGlobal.create({ entityName: hostName }) as any,
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: [hostEntity],
        relations: [],
        dict: [dictionary],
        computations: [FzAsyncPropComputation, makeGlobalComputationClass(hostEntity)],
    })
    await controller.setup(true)
    const storage = system.storage

    const propComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
        c => c.dataContext.type === 'property' && (c.dataContext as PropertyDataContext).id.name === 'output'
    )! as DataBasedComputation
    const globalComputation = Array.from(controller.scheduler.computationsHandles.values()).find(
        c => c.dataContext.type === 'global' && (c.dataContext as GlobalDataContext).id.name === dictName
    )! as DataBasedComputation
    const propTaskRecord = controller.scheduler.getAsyncTaskRecordKey(propComputation)
    const globalTaskRecord = controller.scheduler.getAsyncTaskRecordKey(globalComputation)

    const model = new NaiveAsyncModel()
    const opLog: { step: number, op: string, detail: unknown, outcome: string }[] = []
    const invalidatedTaskIds: { recordName: string, id: unknown }[] = [] // 被 sync/resolved 作废删除的行（用于 staleBlindWrite）

    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-8)
        throw new Error(`[async-fuzz seed=${seed}] ${message}\nop log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    /** 对账 task 表 ⇄ 模型（status 逐位相等），并回填 realId */
    const reconcileTasks = async (context: string) => {
        // property：按 freshnessKey 分组
        const propRows = await storage.find(propTaskRecord, undefined, { orderBy: { id: 'ASC' } }, ['*']) as Row[]
        const byKey = new Map<string, Row[]>()
        for (const row of propRows) {
            const key = String(row.freshnessKey)
            if (!byKey.has(key)) byKey.set(key, [])
            byKey.get(key)!.push(row)
        }
        for (const [key, state] of model.propertyKeys) {
            const rows = byKey.get(key) ?? []
            byKey.delete(key)
            if (rows.length !== state.tasks.length) {
                failWith(`${context}: property task rows for key ${key}: ${rows.length} rows vs model ${state.tasks.length} ` +
                    `(rows: ${JSON.stringify(rows.map(r => r.status))}, model: ${JSON.stringify(state.tasks.map(t => t.status))})`)
            }
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].status !== state.tasks[i].status) {
                    failWith(`${context}: property task #${i} for key ${key} status ${JSON.stringify(rows[i].status)} != model ${JSON.stringify(state.tasks[i].status)}`)
                }
                state.tasks[i].realId = rows[i].id
            }
        }
        for (const [key, rows] of byKey) {
            if (rows.length) failWith(`${context}: property task rows exist for unknown freshnessKey ${key} (${rows.length} rows)`)
        }
        // global：单 key
        const globalRows = await storage.find(globalTaskRecord, undefined, { orderBy: { id: 'ASC' } }, ['*']) as Row[]
        if (globalRows.length !== model.globalKey.tasks.length) {
            failWith(`${context}: global task rows ${globalRows.length} vs model ${model.globalKey.tasks.length} ` +
                `(rows: ${JSON.stringify(globalRows.map(r => r.status))}, model: ${JSON.stringify(model.globalKey.tasks.map(t => t.status))})`)
        }
        for (let i = 0; i < globalRows.length; i++) {
            if (globalRows[i].status !== model.globalKey.tasks[i].status) {
                failWith(`${context}: global task #${i} status ${JSON.stringify(globalRows[i].status)} != model ${JSON.stringify(model.globalKey.tasks[i].status)}`)
            }
            model.globalKey.tasks[i].realId = globalRows[i].id
        }
    }

    const assertValues = async (context: string) => {
        const hosts = await storage.find(hostName, undefined, undefined, ['id', 'input', 'mode', 'output']) as Row[]
        if (hosts.length !== model.hosts.size) failWith(`${context}: host count ${hosts.length} != model ${model.hosts.size}`)
        for (const host of hosts) {
            const key = String(host.id)
            const expected = model.propertyKeys.get(key)?.value ?? null
            if ((host.output ?? null) !== expected) {
                failWith(`${context}: output of #${key} = ${JSON.stringify(host.output)}, model expects ${JSON.stringify(expected)} ` +
                    `(host: input=${host.input} mode=${host.mode}; model tasks: ${JSON.stringify(model.propertyKeys.get(key)?.tasks.map(t => t.status))})`)
            }
        }
        const globalValue = await storage.dict.get(dictName)
        if ((globalValue ?? null) !== (model.globalKey.value ?? null)) {
            failWith(`${context}: global dict = ${JSON.stringify(globalValue)}, model expects ${JSON.stringify(model.globalKey.value)} ` +
                `(model tasks: ${JSON.stringify(model.globalKey.tasks.map(t => t.status))})`)
        }
        await reconcileTasks(context)
    }

    await assertValues('after setup')

    /** 驱动 worker/daemon 的目标选择：全部 (state, task, computation, recordName) 汇总 */
    const collectTargets = (statuses: ModelTask['status'][]) => {
        const targets: { state: KeyState, task: ModelTask, computation: DataBasedComputation, recordName: string, scope: string }[] = []
        for (const [key, state] of model.propertyKeys) {
            for (const task of state.tasks) {
                if (statuses.includes(task.status)) targets.push({ state, task, computation: propComputation, recordName: propTaskRecord, scope: `prop:${key}` })
            }
        }
        for (const task of model.globalKey.tasks) {
            if (statuses.includes(task.status)) targets.push({ state: model.globalKey, task, computation: globalComputation, recordName: globalTaskRecord, scope: 'global' })
        }
        return targets
    }

    const OP_MENU = ['create', 'update', 'update', 'workerComplete', 'workerComplete', 'daemonReturn', 'daemonReturn', 'daemonReturnRaw', 'staleBlindWrite'] as const
    // 前置条件不足（池空 / 无 task）时重抽（决策流仍由种子完全决定，与计算层 fuzz 同款）
    const opFeasible = (op: typeof OP_MENU[number]): boolean => {
        if (op === 'create') return true
        if (op === 'update') return model.hosts.size > 0
        if (op === 'workerComplete') return collectTargets(['pending']).length > 0
        if (op === 'daemonReturn') return collectTargets(['pending', 'success']).length > 0
        if (op === 'daemonReturnRaw') return collectTargets(['applied', 'skipped']).length > 0
        return invalidatedTaskIds.length > 0
    }
    let executed = 0
    for (let step = 0; step < opsCount; step++) {
        let op = pick(rng, OP_MENU as unknown as Array<typeof OP_MENU[number]>)
        for (let attempt = 0; attempt < 8 && !opFeasible(op); attempt++) {
            op = pick(rng, OP_MENU as unknown as Array<typeof OP_MENU[number]>)
        }
        if (op === 'create') {
            const input = int(rng, 20)
            const mode = pick(rng, [...MODE_MENU])
            const created = await storage.create(hostName, { input, mode }) as Row
            model.registerCreate(created.id, input, mode)
            opLog.push({ step, op, detail: { input, mode }, outcome: 'ok' })
            executed++
        } else if (op === 'update') {
            const pool = [...model.hosts.keys()]
            if (!pool.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: empty pool' }); continue }
            const id = pick(rng, pool)
            const payload: { input?: number, mode?: Mode } = {}
            if (chance(rng, 0.6)) payload.mode = pick(rng, [...MODE_MENU])
            if (chance(rng, 0.5)) payload.input = int(rng, 20)
            if (payload.mode === undefined && payload.input === undefined) payload.mode = pick(rng, [...MODE_MENU])
            // 作废候选：本次 update 若触发 sync/resolved 产出，会物理删除 pending/success 行
            const before = model.propertyKeys.get(id)!.tasks
                .filter(t => (t.status === 'pending' || t.status === 'success') && t.realId !== undefined)
                .map(t => ({ recordName: propTaskRecord, id: t.realId }))
            const beforeGlobal = model.globalKey.tasks
                .filter(t => (t.status === 'pending' || t.status === 'success') && t.realId !== undefined)
                .map(t => ({ recordName: globalTaskRecord, id: t.realId }))
            await storage.update(hostName, MatchExp.atom({ key: 'id', value: ['=', id] }), payload)
            model.registerUpdate(id, payload)
            // 作废后模型里不再存活的行 = 被删除的行
            const survivingProp = new Set(model.propertyKeys.get(id)!.tasks.map(t => t.realId))
            const survivingGlobal = new Set(model.globalKey.tasks.map(t => t.realId))
            invalidatedTaskIds.push(
                ...before.filter(x => !survivingProp.has(x.id)),
                ...beforeGlobal.filter(x => !survivingGlobal.has(x.id)),
            )
            opLog.push({ step, op, detail: { id, payload }, outcome: 'ok' })
            executed++
        } else if (op === 'workerComplete') {
            const targets = collectTargets(['pending'])
            if (!targets.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: no pending' }); continue }
            const target = pick(rng, targets)
            const result = target.scope === 'global' ? `gcrawl:${(target.task.args as any).sum}` : `crawl:${(target.task.args as any).input}`
            await storage.update(target.recordName, MatchExp.atom({ key: 'id', value: ['=', target.task.realId] }), { result, status: 'success' })
            model.workerComplete(target.state, target.task, result)
            opLog.push({ step, op, detail: { scope: target.scope, seq: target.task.seq }, outcome: 'ok' })
            executed++
        } else if (op === 'daemonReturn') {
            const targets = collectTargets(['pending', 'success'])
            if (!targets.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: no open task' }); continue }
            const target = pick(rng, targets)
            await controller.scheduler.handleAsyncReturn(target.computation, { id: String(target.task.realId) })
            model.daemonReturn(target.state, target.task)
            opLog.push({ step, op, detail: { scope: target.scope, seq: target.task.seq, statusBefore: target.task.status }, outcome: 'ok' })
            executed++
        } else if (op === 'daemonReturnRaw') {
            // 对 applied/skipped 的重复调用：already-handled，必须 no-op
            const targets = collectTargets(['applied', 'skipped'])
            if (!targets.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: no handled task' }); continue }
            const target = pick(rng, targets)
            const result = await controller.scheduler.handleAsyncReturn(target.computation, { id: String(target.task.realId) })
            if (!(result as { skipped?: boolean }).skipped) {
                failWith(`step ${step} daemonReturnRaw on ${target.task.status} task was NOT skipped: ${JSON.stringify(result)}`)
            }
            opLog.push({ step, op, detail: { scope: target.scope, seq: target.task.seq }, outcome: 'ok (no-op)' })
            executed++
        } else {
            // staleBlindWrite：对已被作废删除的行盲写 result+success，必须 no-op（r30-B 契约）
            if (!invalidatedTaskIds.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: nothing invalidated yet' }); continue }
            const target = pick(rng, invalidatedTaskIds)
            await storage.update(target.recordName, MatchExp.atom({ key: 'id', value: ['=', target.id] }), { result: 'STALE', status: 'success' })
            const resurrected = await storage.find(target.recordName, MatchExp.atom({ key: 'id', value: ['=', target.id] }), undefined, ['id', 'status']) as Row[]
            if (resurrected.length) {
                failWith(`step ${step} staleBlindWrite resurrected an invalidated task row: ${JSON.stringify(resurrected)}`)
            }
            opLog.push({ step, op, detail: { id: String(target.id) }, outcome: 'ok (no-op)' })
            executed++
        }
        await assertValues(`step ${step} ${op}`)
    }

    if (executed === 0 && opsCount > 0) failWith('executed no ops')
    await system.destroy()
    return { seed, executed }
}

// ---------- 入口 ----------
const SEED_START = Number(process.env.FUZZ_ASYNC_SEED_START ?? 1)
const SEED_COUNT = Number(process.env.FUZZ_ASYNC_SEED_COUNT ?? 6)
const OPS = Number(process.env.FUZZ_ASYNC_OPS ?? 18)

describe('async computation generative fuzz (mixed sync/resolved/async/skip interleavings vs task-lifecycle model)', () => {
    const seeds = Array.from({ length: SEED_COUNT }, (_, i) => SEED_START + i)
    test.each(seeds.map(s => [s]))('seed %i: last committed produce wins on every freshnessKey; task rows match the lifecycle model', async (seed) => {
        const result = await runAsyncComputationFuzzCase(seed, OPS)
        expect(result.executed, `async seed ${seed} executed no ops`).toBeGreaterThan(0)
    }, 300000)
})
