import {
    Controller, Entity, MonoSystem, Property, MatchExp, DataDep, PropertyDataContext,
    DataBasedComputation, ComputationResult, Dictionary, GlobalDataContext, KlassByName
} from "interaqt";
import { PGLiteDB } from '@drivers';
import { describe, expect, test } from "vitest";

/**
 * C1（performance-debt-plan §六 3.1 / r2-I-6）：async task 表只增不减的保留收口。
 *
 * 契约（Controller.cleanupAsyncTasks）：
 *  - 只清终态行（applied / skipped）——审计痕迹；协议态（pending / success）是投递
 *    机制的活跃状态，传入即 fail-fast；
 *  - 陈旧复活防护：分区（freshnessKey）内仍有未投递行时整个分区跳过——
 *    isLatestAsyncTask 按分区内最大 id 判"最新"，删掉后来的终态行会让更早的
 *    pending 任务被误判为最新并覆写更新的值（r30-B 的清理版还魂形态）；
 *  - 框架不自动清理（显式控制原则），由用户显式调用。
 */

interface AsyncFieldInstance {
    _type: string;
    _options?: { uuid?: string };
    uuid: string;
    source: string;
}

class AsyncFieldComputed implements AsyncFieldInstance {
    public uuid: string;
    public _type = 'AsyncFieldComputed';
    public _options?: { uuid?: string };
    public source: string;
    constructor(args: { source: string }, options?: { uuid?: string }) {
        this._options = options;
        this.uuid = options?.uuid || Math.random().toString(36).slice(2, 11);
        this.source = args.source;
    }
    static isKlass = true as const;
    static displayName = 'AsyncFieldComputed';
    static instances: AsyncFieldInstance[] = [];
    static public = { source: { type: 'string' as const, required: true as const } };
    static create(args: { source: string }, options?: { uuid?: string }): AsyncFieldInstance {
        const instance = new AsyncFieldComputed(args, options);
        this.instances.push(instance);
        return instance;
    }
    static stringify(instance: AsyncFieldInstance): string {
        return JSON.stringify({ type: 'AsyncFieldComputed', options: instance._options, uuid: instance.uuid, public: { source: instance.source } });
    }
    static parse(json: string): AsyncFieldInstance {
        const data = JSON.parse(json);
        return this.create(data.public, data.options);
    }
    static clone(instance: AsyncFieldInstance): AsyncFieldInstance {
        return this.create({ source: instance.source });
    }
    static is(obj: unknown): obj is AsyncFieldInstance {
        return obj !== null && typeof obj === 'object' && (obj as { _type?: string })._type === 'AsyncFieldComputed';
    }
    static check(data: unknown): boolean {
        return data !== null && typeof data === 'object' && typeof (data as { uuid?: unknown }).uuid === 'string';
    }
}

class AsyncFieldComputation implements DataBasedComputation {
    static computationType = AsyncFieldComputed
    static contextType = 'property' as const
    state = {}
    dataDeps: { [key: string]: DataDep } = {}
    constructor(public controller: Controller, public args: AsyncFieldInstance, public dataContext: PropertyDataContext) {
        this.dataDeps = { _current: { type: 'property', attributeQuery: [this.args.source] } }
    }
    async compute() {
        return ComputationResult.async({ kind: 'field' })
    }
    async asyncReturn(result: unknown) {
        return `computed_${result}`
    }
}

class AsyncDictComputation implements DataBasedComputation {
    static computationType = AsyncFieldComputed
    static contextType = 'global' as const
    state = {}
    dataDeps: { [key: string]: DataDep } = {}
    constructor(public controller: Controller, public args: AsyncFieldInstance, public dataContext: GlobalDataContext) {
        // 依赖一个种子 dict：设置它即触发本 async 计算（global 计算无自发首跑）
        this.dataDeps = { seed: { type: 'global', source: Dictionary.instances.find(d => d.name === this.args.source)! } }
    }
    async compute() {
        return ComputationResult.async({ kind: 'dict' })
    }
    async asyncReturn(result: unknown) {
        return `dict_${result}`
    }
}

async function setupFixture() {
    const itemEntity = Entity.create({
        name: 'RetItem',
        properties: [
            Property.create({ name: 'title', type: 'string' }),
            Property.create({
                name: 'summary', type: 'string',
                computation: AsyncFieldComputed.create({ source: 'title' }) as never
            })
        ]
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({
        system,
        entities: [itemEntity],
        relations: [],
        computations: [AsyncFieldComputation]
    })
    await controller.setup(true)
    const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
        c => c.dataContext.type === 'property'
    )! as DataBasedComputation
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation)
    return { system, controller, computation, taskRecordName }
}

async function deliverTask(controller: Controller, computation: DataBasedComputation, system: MonoSystem, taskRecordName: string, taskId: unknown, result: string) {
    await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', taskId] }), { result, status: 'success' })
    const task = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', taskId] }), {}, ['*'])
    await controller.scheduler.handleAsyncReturn(computation, task)
}

describe('async task retention (C1)', () => {
    test('cleanup removes applied/skipped rows and keeps live protocol rows', async () => {
        const { system, controller, computation, taskRecordName } = await setupFixture()

        // 三条记录：r1/r2 完整投递（applied），r3 保持 pending
        const r1 = await system.storage.create('RetItem', { title: 't1' })
        const r2 = await system.storage.create('RetItem', { title: 't2' })
        await system.storage.create('RetItem', { title: 't3' })

        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*', ['record', { attributeQuery: ['id'] }]])
        expect(tasks).toHaveLength(3)
        const taskOf = (recordId: unknown) => tasks.find(t => String(t.record?.id) === String(recordId))!
        await deliverTask(controller, computation, system, taskRecordName, taskOf(r1.id).id, 'one')
        await deliverTask(controller, computation, system, taskRecordName, taskOf(r2.id).id, 'two')

        // r1 再触发一轮（源更新 → 旧 pending 作废删除 + 新 task）→ 投递 → 又一条 applied
        await system.storage.update('RetItem', MatchExp.atom({ key: 'id', value: ['=', r1.id] }), { title: 't1b' })
        const tasksAfterUpdate = await system.storage.find(taskRecordName, undefined, undefined, ['*', ['record', { attributeQuery: ['id'] }]])
        const pendingOfR1 = tasksAfterUpdate.find(t => String(t.record?.id) === String(r1.id) && t.status === 'pending')!
        await deliverTask(controller, computation, system, taskRecordName, pendingOfR1.id, 'one-b')

        const beforeCleanup = await system.storage.find(taskRecordName, undefined, undefined, ['id', 'status'])
        expect(beforeCleanup.filter(t => t.status === 'applied')).toHaveLength(3)
        expect(beforeCleanup.filter(t => t.status === 'pending')).toHaveLength(1)

        const summary = await controller.cleanupAsyncTasks()
        const entry = summary.find(s => s.taskRecordName === taskRecordName)!
        expect(entry.removed).toBe(3)

        const afterCleanup = await system.storage.find(taskRecordName, undefined, undefined, ['id', 'status'])
        expect(afterCleanup).toHaveLength(1)
        expect(afterCleanup[0].status).toBe('pending')

        // 清理后投递协议不受影响：pending 正常投递
        await deliverTask(controller, computation, system, taskRecordName, afterCleanup[0].id, 'three')
        const r3Row = await system.storage.findOne('RetItem', MatchExp.atom({ key: 'title', value: ['=', 't3'] }), {}, ['id', 'summary'])
        expect(r3Row.summary).toBe('computed_three')

        // 属性值不受清理影响
        const r1Row = await system.storage.findOne('RetItem', MatchExp.atom({ key: 'id', value: ['=', r1.id] }), {}, ['summary'])
        expect(r1Row.summary).toBe('computed_one-b')

        await system.destroy()
    })

    test('partitions with an older undelivered task are skipped (stale-resurrection protection)', async () => {
        const { system, controller, computation, taskRecordName } = await setupFixture()

        const r1 = await system.storage.create('RetItem', { title: 'x1' })
        const tasks1 = await system.storage.find(taskRecordName, undefined, undefined, ['id'])
        expect(tasks1).toHaveLength(1)
        const oldPendingId = tasks1[0].id

        // 同一宿主（同 freshnessKey 分区）：直接经 storage 注入一条更新的 applied 行，
        // 构造「旧 pending（id 小）+ 新 applied（id 大）」形态——这是 isLatest 判定
        // 依赖后到终态行压住旧 pending 的形态。
        const stale = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', oldPendingId] }), {}, ['freshnessKey'])
        await system.storage.create(taskRecordName, {
            status: 'applied',
            args: { kind: 'field' },
            record: { id: r1.id },
            result: 'newer',
            freshnessKey: stale.freshnessKey
        })

        const summary = await controller.cleanupAsyncTasks()
        const entry = summary.find(s => s.taskRecordName === taskRecordName)!
        // 分区内有未投递的旧 pending → applied 行必须保留（清掉它会让旧 pending 复活为"最新"）
        expect(entry.removed).toBe(0)
        const remaining = await system.storage.find(taskRecordName, undefined, undefined, ['id', 'status'])
        expect(remaining.map(t => t.status).sort()).toEqual(['applied', 'pending'])

        // 旧 pending 完成投递 → 必须被停放（本构造下注入 applied 行抢走了 1:1 record link，
        // r34 契约按 orphaned-record 停放；无链抢占形态则按 stale-task——两者都保证无陈旧 apply）
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', oldPendingId] }), { result: 'stale', status: 'success' })
        const staleTask = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', oldPendingId] }), {}, ['*'])
        const outcome = await controller.scheduler.handleAsyncReturn(computation, staleTask) as { skipped?: boolean, reason?: string }
        expect(outcome.skipped).toBe(true)
        expect(['stale-task', 'orphaned-record']).toContain(outcome.reason)

        // 分区不再有未投递行 → 终态行可全部回收
        const summary2 = await controller.cleanupAsyncTasks()
        expect(summary2.find(s => s.taskRecordName === taskRecordName)!.removed).toBe(2)

        await system.destroy()
    })

    test('protocol states are rejected; global-context task tables are covered too', async () => {
        const seedDict = Dictionary.create({ name: 'retSeed', type: 'string', collection: false })
        const dict = Dictionary.create({
            name: 'retGlobal', type: 'string', collection: false,
            computation: AsyncFieldComputed.create({ source: 'retSeed' }) as never
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [],
            relations: [],
            dict: [seedDict, dict],
            computations: [AsyncDictComputation]
        })
        await controller.setup(true)
        const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
            c => c.dataContext.type === 'global'
        )! as DataBasedComputation
        const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation)

        await expect(controller.cleanupAsyncTasks({ statuses: ['pending' as never] })).rejects.toThrow(/terminal task rows/)

        // 设置种子 dict 触发 async 计算 → 建 task；投递后清理
        await system.storage.dict.set('retSeed', 'go')
        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(tasks.length).toBeGreaterThan(0)
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), { result: 'g1', status: 'success' })
        const task = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), {}, ['*'])
        await controller.scheduler.handleAsyncReturn(computation, task)
        expect(await system.storage.dict.get('retGlobal')).toBe('dict_g1')

        const summary = await controller.cleanupAsyncTasks()
        expect(summary.find(s => s.taskRecordName === taskRecordName)!.removed).toBe(1)
        expect(await system.storage.dict.get('retGlobal')).toBe('dict_g1')

        await system.destroy()
    })
})
