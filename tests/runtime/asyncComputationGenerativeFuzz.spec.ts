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
 *   **自定义 freshnessKey 轴（r34 扩域）**：偶数种子的 async/resolved 产出携带
 *   args.freshnessKey = f(input)——分区是 task 表全局的（跨记录同 input 碰撞同一分区，
 *   最新性按分区内全局 max id 判定），而作废范围必须按数据上下文身份（r34-A 修复面）。
 * - 驱动：createHost / updateHost（改 mode/input）/ **deleteHost（r34 扩域：悬挂 task）** /
 *   workerComplete（外部 worker 盲写 result+success）/ daemonReturn（handleAsyncReturn，
 *   含对 pending / 陈旧 / 已作废 / **孤儿** task 的调用）/ staleBlindWrite（对已被作废删除的
 *   task 行盲写——必须 no-op）；
 * - 预言机（独立 JS 模型按框架契约重实现 task 生命周期）：
 *   1. 值收敛：每个数据上下文的可见值 = 最后一次「已提交产出」（sync/resolved 即时产出；
 *      async 产出仅当 handleAsyncReturn 时该 task 仍是本**分区**的最新存活行）；
 *   2. task 行对账：每宿主记录的 task 行按 id 序 = 模型按创建序的存活 task
 *      （status + freshnessKey 逐位相等）；孤儿行（宿主已删，record link 缺席）单独成桶对账；
 *   3. 作废语义：sync/resolved 作废按**数据上下文**（property=宿主记录 / global=整表）
 *      物理删除 pending/success 行——与 freshnessKey 分区解耦（r34-A）；
 *   4. 孤儿停放：宿主已删的 task 投递 ⇒ skipped（orphaned-record），重投递 already-handled
 *      短路，绝不裸 TypeError（r34-B）；
 *   5. 触发面：update 只有依赖属性**值变化**才重算（shouldTriggerUpdateComputation 契约）。
 *
 * 契约笔记（模型据实实现）：
 * - global 自定义计算在 setup 期不做初始 compute（globalAsyncComputed.spec 固化）；
 * - handleAsyncReturn 对非最新 task：任何状态（含 pending）都标记 skipped（stale-task）；
 *   对最新但未 success 的 task：no-op（task-not-success，保持 pending）；
 * - 最新性按「同 freshnessKey 全部存活行的最大 id」判定（applied/skipped/孤儿行也参与，
 *   且**跨记录**——分区字符串是 task 表全局的）。
 *
 * 生成域刻意未含（登记为后续扩张点）：entity/relation 级 async、并发 daemon 投递
 * （CAS/锁竞争面走真实 PG 并发套件）。
 *
 * 预言机敏感性已验证（开发期）：模型注入「作废不删行」「陈旧 task 允许 apply」坏真值后
 * 种子当场变红；r34 扩域后以「作废按默认分区键（旧实现）」坏真值复验当场变红。
 *
 * 再现：FUZZ_ASYNC_SEED_START / FUZZ_ASYNC_SEED_COUNT / FUZZ_ASYNC_OPS；FUZZ_VERBOSE=1。
 * CAUTION 决策流契约（r34 版）：per-seed customKeys 旗标 + deleteHost 入菜单改变了
 *  rng 消耗序——r33 种子池已整体失效并以新池（1–40）重验，外部不得引用旧种子编号。
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
/** property 级计算类工厂：useCustomKeys 决定 async/resolved 是否携带自定义 freshnessKey */
function makePropComputationClass(useCustomKeys: boolean) {
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
            if (mode === 'resolved') return ComputationResult.resolved(`res:${input}`, useCustomKeys ? { via: 'resolved', freshnessKey: `crawl-${input}` } : { via: 'resolved' })
            if (mode === 'async') return ComputationResult.async(useCustomKeys ? { input, freshnessKey: `crawl-${input}` } : { input })
            return ComputationResult.skip()
        }
        async asyncReturn(result: any, args: any) { return `ret(${result})` }
    }
    return FzAsyncPropComputation
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
function makeGlobalComputationClass(hostEntity: unknown, useCustomKeys: boolean) {
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
            if (branch === 1) return ComputationResult.resolved(`gres:${sum}`, useCustomKeys ? { via: 'g', freshnessKey: `g-${sum}` } : { via: 'g' })
            if (branch === 2) return ComputationResult.async(useCustomKeys ? { sum, freshnessKey: `g-${sum}` } : { sum })
            return ComputationResult.skip()
        }
        async asyncReturn(result: any, args: any) { return `ret(${result})` }
    }
    return FzAsyncGlobalComputation
}

// ---------- 独立 JS 模型 ----------
// CAUTION task↔record 关系声明为 1:1（宿主侧排他）：同一记录的新 task 建立 link 时，
//  旧 task 的 link 被置换删除（写路径 replace 语义）——任一时刻每记录至多一个「持链」task
//  （最近创建的那个），更早的 task 全部脱链。脱链行在读取面 record=null，与宿主已删的
//  悬挂行同一形态；投递时统一由 orphaned-record 守卫中和。record 作废（produceSync）
//  只删得到持链行——脱链开放行的陈旧性由孤儿守卫兜底（两个机制合起来 = 无陈旧 apply）。
type ModelTask = {
    globalSeq: number           // 全表创建序（= task 行 id 序）
    partition: string           // freshnessKey（默认键或自定义键；分区是表全局的）
    status: 'pending' | 'success' | 'applied' | 'skipped'
    args: Row
    result?: unknown
    linkedTo: string | null     // 当前持链宿主（脱链/宿主已删 = null）
    realId?: unknown            // 对账时回填，供 worker/daemon 驱动
}
type GlobalState = { value: unknown, tasks: ModelTask[] }

class NaiveAsyncModel {
    hosts = new Map<string, { input: number, mode: Mode }>()
    propertyValues = new Map<string, unknown>()  // 宿主记录 id -> 可见值
    propertyTasks: ModelTask[] = []              // property task 表全部存活行（按创建序）
    globalKey: GlobalState = { value: null, tasks: [] }
    private nextGlobalSeq = 0

    constructor(public useCustomKeys: boolean) {}

    private produceSyncProperty(id: string, value: unknown) {
        // sync/resolved 产出：按数据上下文（宿主记录）作废——物理删除**持链**的 pending/success 行。
        // 脱链开放行不在 record.id 匹配范围内（见类头 CAUTION），由 orphaned-record 守卫兜底。
        this.propertyTasks = this.propertyTasks.filter(t =>
            !(t.linkedTo === id && (t.status === 'pending' || t.status === 'success')))
        this.propertyValues.set(id, value)
    }
    private produceAsyncProperty(id: string, args: Row, partition: string) {
        // link 置换：旧持链 task 脱链
        for (const task of this.propertyTasks) {
            if (task.linkedTo === id) task.linkedTo = null
        }
        this.propertyTasks.push({ globalSeq: this.nextGlobalSeq++, partition, status: 'pending', args, linkedTo: id })
    }

    /** property 计算触发（create 恒触发；update 仅当 input/mode 值变化） */
    recomputeProperty(id: string) {
        const host = this.hosts.get(id)!
        if (host.mode === 'sync') this.produceSyncProperty(id, `sync:${host.input}`)
        else if (host.mode === 'resolved') this.produceSyncProperty(id, `ret(res:${host.input})`)
        else if (host.mode === 'async') {
            const partition = this.useCustomKeys ? `crawl-${host.input}` : id
            this.produceAsyncProperty(id, { input: host.input }, partition)
        }
        // skip：无产出
    }
    recomputeGlobal(dictPartitionName: string) {
        const sum = [...this.hosts.values()].reduce((acc, h) => acc + h.input, 0)
        const branch = ((sum % 4) + 4) % 4
        if (branch === 0) this.produceGlobalSync(`gsync:${sum}`)
        else if (branch === 1) this.produceGlobalSync(`ret(gres:${sum})`)
        else if (branch === 2) {
            const partition = this.useCustomKeys ? `g-${sum}` : dictPartitionName
            this.globalKey.tasks.push({ globalSeq: this.nextGlobalSeq++, partition, status: 'pending', args: { sum }, linkedTo: null })
        }
        // branch 3 skip
    }
    private produceGlobalSync(value: unknown) {
        // global：task 表按计算独占 ⇒ 上下文身份 = 整表作废
        this.globalKey.tasks = this.globalKey.tasks.filter(t => t.status === 'applied' || t.status === 'skipped')
        this.globalKey.value = value
    }

    registerCreate(id: unknown, input: number, mode: Mode, dictPartitionName: string) {
        const idKey = String(id)
        this.hosts.set(idKey, { input, mode })
        this.propertyValues.set(idKey, null)
        this.recomputeProperty(idKey)
        this.recomputeGlobal(dictPartitionName) // 记录依赖：create 恒触发
    }
    registerUpdate(id: unknown, payload: { input?: number, mode?: Mode }, dictPartitionName: string) {
        const idKey = String(id)
        const host = this.hosts.get(idKey)!
        const inputChanged = payload.input !== undefined && payload.input !== host.input
        const modeChanged = payload.mode !== undefined && payload.mode !== host.mode
        if (payload.input !== undefined) host.input = payload.input
        if (payload.mode !== undefined) host.mode = payload.mode
        // 触发面契约：依赖属性值变化才重算（同值写入不触发）
        if (inputChanged || modeChanged) this.recomputeProperty(idKey)
        if (inputChanged) this.recomputeGlobal(dictPartitionName) // global 只依赖 input
    }
    registerDelete(id: unknown, dictPartitionName: string) {
        const idKey = String(id)
        this.hosts.delete(idKey)
        this.propertyValues.delete(idKey)
        // 持链行脱链（宿主级联解除 link；行本身保留）
        for (const task of this.propertyTasks) {
            if (task.linkedTo === idKey) task.linkedTo = null
        }
        this.recomputeGlobal(dictPartitionName) // 记录依赖：delete 恒触发
    }

    isLatestInPartition(task: ModelTask, table: 'property' | 'global'): boolean {
        const pool = table === 'property' ? this.propertyTasks : this.globalKey.tasks
        const maxSeq = Math.max(...pool.filter(t => t.partition === task.partition).map(t => t.globalSeq))
        return task.globalSeq === maxSeq
    }

    /** worker 盲写：pending → success（对脱链行同样生效——行存在即可写） */
    workerComplete(task: ModelTask, result: unknown) {
        task.status = 'success'
        task.result = result
    }
    /** handleAsyncReturn 契约（r34：孤儿守卫先于最新性判定与 apply） */
    daemonReturn(task: ModelTask, table: 'property' | 'global') {
        if (task.status === 'applied' || task.status === 'skipped') return 'already-handled'
        if (table === 'property' && task.linkedTo === null) {
            task.status = 'skipped'
            return 'orphaned-record'
        }
        if (!this.isLatestInPartition(task, table)) {
            task.status = 'skipped'
            return 'stale-task'
        }
        if (task.status === 'success') {
            task.status = 'applied'
            if (table === 'property') this.propertyValues.set(task.linkedTo!, `ret(${task.result})`)
            else this.globalKey.value = `ret(${task.result})`
            return 'applied'
        }
        return 'task-not-success'
    }
}

// ---------- runner ----------
async function runAsyncComputationFuzzCase(seed: number, opsCount: number) {
    const rng = mulberry32(seed)
    const useCustomKeys = chance(rng, 0.5) // r34 扩域轴：自定义 freshnessKey 分区
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
        computations: [makePropComputationClass(useCustomKeys), makeGlobalComputationClass(hostEntity, useCustomKeys)],
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

    const model = new NaiveAsyncModel(useCustomKeys)
    const opLog: { step: number, op: string, detail: unknown, outcome: string }[] = []
    const invalidatedTaskIds: { recordName: string, id: unknown }[] = [] // 被 sync/resolved 作废删除的行（用于 staleBlindWrite）

    const failWith = (message: string): never => {
        const logSlice = process.env.FUZZ_VERBOSE ? opLog : opLog.slice(-8)
        throw new Error(`[async-fuzz seed=${seed}${useCustomKeys ? ' customKeys' : ''}] ${message}\nop log${process.env.FUZZ_VERBOSE ? '' : ' tail'}: ${JSON.stringify(logSlice, null, 2)}`)
    }

    /** 对账 task 表 ⇄ 模型：行按 id 序 = 模型按创建序（status/partition/link 三面逐位相等），并回填 realId */
    const reconcileTasks = async (context: string) => {
        const propRows = await storage.find(propTaskRecord, undefined, { orderBy: { id: 'ASC' } },
            ['*', ['record', { attributeQuery: ['id'] }]]) as Row[]
        const expectedProp = [...model.propertyTasks].sort((a, b) => a.globalSeq - b.globalSeq)
        if (propRows.length !== expectedProp.length) {
            failWith(`${context}: property task rows ${propRows.length} vs model ${expectedProp.length}\n` +
                `rows:  ${JSON.stringify(propRows.map(r => `${r.status}/${r.freshnessKey}@${(r.record as Row | undefined)?.id ?? 'null'}`))}\n` +
                `model: ${JSON.stringify(expectedProp.map(t => `${t.status}/${t.partition}@${t.linkedTo ?? 'null'}`))}`)
        }
        for (let i = 0; i < propRows.length; i++) {
            const row = propRows[i], task = expectedProp[i]
            const rowLink = (row.record as { id?: unknown } | undefined)?.id ?? null
            if (row.status !== task.status || String(row.freshnessKey) !== task.partition ||
                (rowLink === null ? task.linkedTo !== null : String(rowLink) !== task.linkedTo)) {
                failWith(`${context}: property task #${i} is ${JSON.stringify(`${row.status}/${row.freshnessKey}@${rowLink ?? 'null'}`)}, ` +
                    `model expects ${JSON.stringify(`${task.status}/${task.partition}@${task.linkedTo ?? 'null'}`)}`)
            }
            task.realId = row.id
        }
        const globalRows = await storage.find(globalTaskRecord, undefined, { orderBy: { id: 'ASC' } }, ['*']) as Row[]
        if (globalRows.length !== model.globalKey.tasks.length) {
            failWith(`${context}: global task rows ${globalRows.length} vs model ${model.globalKey.tasks.length} ` +
                `(rows: ${JSON.stringify(globalRows.map(r => `${r.status}/${r.freshnessKey}`))}, model: ${JSON.stringify(model.globalKey.tasks.map(t => `${t.status}/${t.partition}`))})`)
        }
        for (let i = 0; i < globalRows.length; i++) {
            if (globalRows[i].status !== model.globalKey.tasks[i].status || String(globalRows[i].freshnessKey) !== model.globalKey.tasks[i].partition) {
                failWith(`${context}: global task #${i} is ${JSON.stringify(`${globalRows[i].status}/${globalRows[i].freshnessKey}`)}, model expects ${JSON.stringify(`${model.globalKey.tasks[i].status}/${model.globalKey.tasks[i].partition}`)}`)
            }
            model.globalKey.tasks[i].realId = globalRows[i].id
        }
    }

    const assertValues = async (context: string) => {
        const hosts = await storage.find(hostName, undefined, undefined, ['id', 'input', 'mode', 'output']) as Row[]
        if (hosts.length !== model.hosts.size) failWith(`${context}: host count ${hosts.length} != model ${model.hosts.size}`)
        for (const host of hosts) {
            const key = String(host.id)
            const expected = model.propertyValues.get(key) ?? null
            if ((host.output ?? null) !== expected) {
                failWith(`${context}: output of #${key} = ${JSON.stringify(host.output)}, model expects ${JSON.stringify(expected)} ` +
                    `(host: input=${host.input} mode=${host.mode}; model tasks: ${JSON.stringify(model.propertyTasks.filter(t => t.linkedTo === key).map(t => `${t.status}/${t.partition}`))})`)
            }
        }
        const globalValue = await storage.dict.get(dictName)
        if ((globalValue ?? null) !== (model.globalKey.value ?? null)) {
            failWith(`${context}: global dict = ${JSON.stringify(globalValue)}, model expects ${JSON.stringify(model.globalKey.value)} ` +
                `(model tasks: ${JSON.stringify(model.globalKey.tasks.map(t => `${t.status}/${t.partition}`))})`)
        }
        await reconcileTasks(context)
    }

    await assertValues('after setup')

    /** 驱动 worker/daemon 的目标选择：全部 (task, 表) 汇总 */
    type Target = { task: ModelTask, computation: DataBasedComputation, recordName: string, table: 'property' | 'global', scope: string }
    const collectTargets = (statuses: ModelTask['status'][]): Target[] => {
        const targets: Target[] = []
        for (const task of model.propertyTasks) {
            if (statuses.includes(task.status)) targets.push({ task, computation: propComputation, recordName: propTaskRecord, table: 'property', scope: `prop@${task.linkedTo ?? 'orphan'}` })
        }
        for (const task of model.globalKey.tasks) {
            if (statuses.includes(task.status)) targets.push({ task, computation: globalComputation, recordName: globalTaskRecord, table: 'global', scope: 'global' })
        }
        return targets
    }

    /** 记录 sync/resolved 作废前后被删除的行（供 staleBlindWrite 用） */
    const snapshotOpenTasks = () => ({
        prop: model.propertyTasks.filter(t => (t.status === 'pending' || t.status === 'success') && t.realId !== undefined).map(t => ({ id: t.realId })),
        global: model.globalKey.tasks.filter(t => (t.status === 'pending' || t.status === 'success') && t.realId !== undefined).map(t => ({ id: t.realId })),
    })
    const collectInvalidated = (before: ReturnType<typeof snapshotOpenTasks>) => {
        const survivingProp = new Set(model.propertyTasks.map(t => t.realId))
        const survivingGlobal = new Set(model.globalKey.tasks.map(t => t.realId))
        invalidatedTaskIds.push(
            ...before.prop.filter(x => !survivingProp.has(x.id)).map(x => ({ recordName: propTaskRecord, id: x.id })),
            ...before.global.filter(x => !survivingGlobal.has(x.id)).map(x => ({ recordName: globalTaskRecord, id: x.id })),
        )
    }

    const OP_MENU = ['create', 'update', 'update', 'delete', 'workerComplete', 'workerComplete', 'daemonReturn', 'daemonReturn', 'daemonReturnRaw', 'staleBlindWrite'] as const
    const opFeasible = (op: typeof OP_MENU[number]): boolean => {
        if (op === 'create') return true
        if (op === 'update' || op === 'delete') return model.hosts.size > 0
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
            const before = snapshotOpenTasks()
            const created = await storage.create(hostName, { input, mode }) as Row
            model.registerCreate(created.id, input, mode, dictName)
            collectInvalidated(before)
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
            const before = snapshotOpenTasks()
            await storage.update(hostName, MatchExp.atom({ key: 'id', value: ['=', id] }), payload)
            model.registerUpdate(id, payload, dictName)
            collectInvalidated(before)
            opLog.push({ step, op, detail: { id, payload }, outcome: 'ok' })
            executed++
        } else if (op === 'delete') {
            const pool = [...model.hosts.keys()]
            if (!pool.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: empty pool' }); continue }
            const id = pick(rng, pool)
            const before = snapshotOpenTasks()
            await storage.delete(hostName, MatchExp.atom({ key: 'id', value: ['=', id] }))
            model.registerDelete(id, dictName)
            collectInvalidated(before)
            opLog.push({ step, op, detail: { id }, outcome: 'ok' })
            executed++
        } else if (op === 'workerComplete') {
            const targets = collectTargets(['pending'])
            if (!targets.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: no pending' }); continue }
            const target = pick(rng, targets)
            const result = target.table === 'global' ? `gcrawl:${(target.task.args as any).sum}` : `crawl:${(target.task.args as any).input}`
            await storage.update(target.recordName, MatchExp.atom({ key: 'id', value: ['=', target.task.realId] }), { result, status: 'success' })
            model.workerComplete(target.task, result)
            opLog.push({ step, op, detail: { scope: target.scope, seq: target.task.globalSeq }, outcome: 'ok' })
            executed++
        } else if (op === 'daemonReturn') {
            const targets = collectTargets(['pending', 'success'])
            if (!targets.length) { opLog.push({ step, op, detail: {}, outcome: 'skipped: no open task' }); continue }
            const target = pick(rng, targets)
            const statusBefore = target.task.status
            const actual = await controller.scheduler.handleAsyncReturn(target.computation, { id: String(target.task.realId) }) as { skipped?: boolean, reason?: string }
            const expected = model.daemonReturn(target.task, target.table)
            // 返回语义对账：applied ⇔ 非 skipped；其余 reason 逐字相等
            if (expected === 'applied' ? actual.skipped !== false : actual.reason !== expected) {
                failWith(`step ${step} daemonReturn(${target.scope}, ${statusBefore}) returned ${JSON.stringify(actual)}, model expects ${JSON.stringify(expected)}`)
            }
            opLog.push({ step, op, detail: { scope: target.scope, seq: target.task.globalSeq, statusBefore, outcome: expected }, outcome: 'ok' })
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
            opLog.push({ step, op, detail: { scope: target.scope, seq: target.task.globalSeq }, outcome: 'ok (no-op)' })
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
    test.each(seeds.map(s => [s]))('seed %i: last committed produce wins on every data context; task rows match the lifecycle model', async (seed) => {
        const result = await runAsyncComputationFuzzCase(seed, OPS)
        expect(result.executed, `async seed ${seed} executed no ops`).toBeGreaterThan(0)
    }, 300000)
})
