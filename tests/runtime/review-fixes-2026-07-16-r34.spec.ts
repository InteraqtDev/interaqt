/**
 * r34 修复回归（quality-plan 登记子域的探针出货，async 任务生命周期面）。
 *
 * A｜自定义 args.freshnessKey 下同步/resolved 产出不作废旧 task（fatal，静默陈旧覆写）。
 *   r30-B 把「同步产出后作废未 apply task」按 freshnessKey 匹配删除——freshnessKey 却承担着
 *   两个语义：并发 task 的**排序分区**（isLatestAsyncTask 按它比最大 id，用户可经
 *   ComputationResult.async({freshnessKey}) 自定义）与陈旧性**作废范围**。作废按默认键
 *   （record id / context 名）求值，自定义分区里的 pending task 匹配不中而存活，
 *   完成时在自己的分区里是"最新"→ 把陈旧结果覆写在更新的同步值之上（r30-B 借自定义
 *   分区还魂）。收敛修复：作废范围 = **数据上下文身份**（property ⇒ 本记录的全部
 *   未 apply task；global/entity/relation ⇒ 本计算独占 task 表的全部未 apply task），
 *   与分区键彻底解耦——排序分区管「并发 async 谁赢」，数据上下文管「同步产出之后
 *   谁都不许再写」。
 *
 * B｜宿主删除后悬挂 task 的完成是毒丸（裸 TypeError，永不收敛）。
 *   宿主硬删除级联移除 task 行的 record link；此后 handleAsyncReturn 走到 apply 在
 *   `taskRecord.record.id` 上抛裸 TypeError，task 停在 success——daemon 每次重投递
 *   都再抛一次。修复：record link 缺席（宿主已删）⇒ 标记 skipped 并返回
 *   { skipped: true, reason: 'orphaned-record' }（标记而非删除：worker 盲写已发生过，
 *   重投递经 already-handled/skipped 短路收敛；对 pending 悬挂 task 同样生效）。
 *
 * A5｜迁移回填轨是同一「绕过 task 代理的产出」家族的第三个成员（fix-the-class 枚举顺产）：
 *   迁移 rebuild 经 writeComputationResult 直写新值、不建 task 行——迁移前遗留的
 *   pending task 在迁移后完成时仍是自己分区的"最新"，把旧纪元的结果覆写在迁移产出
 *   之上。修复：MigrationScheduler 对 rebuildOutput 的 async 计算在重建前作废全部
 *   未 apply task（重建纪元 = 整表作废；kill-resume 下随事务回滚/重放收敛）。
 */
import { describe, expect, test } from "vitest";
import {
    ComputationResult, Controller, Custom, DataBasedComputation, DataDep, Dictionary, Entity,
    GlobalDataContext, KlassByName, MonoSystem, Property, PropertyDataContext,
} from 'interaqt';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";

// 自定义 freshnessKey 的 async 计算（url 变化 ⇒ 分区变化；mode 控制返回类型）
interface FkArgs { source: string }
class FkComputed {
    public uuid: string; public _type = 'FkComputed'; public _options?: { uuid?: string }; public source: string;
    constructor(args: FkArgs, options?: { uuid?: string }) { this._options = options; this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9); this.source = args.source }
    static isKlass = true as const; static displayName = 'FkComputed'; static instances: FkComputed[] = [];
    static public = { source: { type: 'string' as const, required: true as const } };
    static create(args: FkArgs, options?: { uuid?: string }): FkComputed { const i = new FkComputed(args, options); FkComputed.instances.push(i); return i }
    static stringify(i: FkComputed): string { return JSON.stringify({ type: 'FkComputed', options: i._options, uuid: i.uuid, public: { source: i.source } }) }
    static parse(json: string): FkComputed { const d = JSON.parse(json); return FkComputed.create(d.public, d.options) }
    static clone(i: FkComputed): FkComputed { return FkComputed.create({ source: i.source }) }
    static is(obj: unknown): obj is FkComputed { return obj !== null && typeof obj === 'object' && (obj as any)._type === 'FkComputed' }
    static check(data: unknown): boolean { return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string' }
}
class FkComputation implements DataBasedComputation {
    static computationType = FkComputed
    static contextType = 'property' as const
    state = {}
    dataDeps: { [key: string]: DataDep }
    constructor(public controller: Controller, public args: FkComputed, public dataContext: PropertyDataContext) {
        this.dataDeps = { _current: { type: 'property', attributeQuery: ['url', 'mode'] } }
    }
    async compute({ _current }: { _current: any }) {
        if (_current.mode === 'sync') return `sync:${_current.url}`
        if (_current.mode === 'resolved') return ComputationResult.resolved(`res:${_current.url}`, { via: 'resolved', freshnessKey: `crawl-${_current.url}` })
        return ComputationResult.async({ url: _current.url, freshnessKey: `crawl-${_current.url}` })
    }
    async asyncReturn(result: any, args: any) { return `ret(${result})` }
}

async function setupFk(entityName: string) {
    const URL = Entity.create({
        name: entityName,
        properties: [
            Property.create({ name: 'url', type: 'string' }),
            Property.create({ name: 'mode', type: 'string' }),
            Property.create({ name: 'content', type: 'string', computation: FkComputed.create({ source: 'url' }) as any }),
        ]
    })
    const system = new MonoSystem(new PGLiteDB())
    system.conceptClass = KlassByName
    const controller = new Controller({ system, entities: [URL], relations: [], computations: [FkComputation] })
    await controller.setup(true)
    const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
        c => c.dataContext.type === 'property' && (c.dataContext as PropertyDataContext).id.name === 'content'
    )! as DataBasedComputation
    return { system, controller, computation, taskRecordName: controller.scheduler.getAsyncTaskRecordKey(computation) }
}

describe('r34 async task lifecycle fixes', () => {
    test('A1: a pending task under a CUSTOM freshnessKey is invalidated by a later sync produce (was: survived and overwrote)', async () => {
        const { system, controller, computation, taskRecordName } = await setupFk('FkUrlA1')
        const rec = await system.storage.create('FkUrlA1', { url: 'slow', mode: 'async' })
        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(tasks).toHaveLength(1)
        expect(tasks[0].freshnessKey).toBe('crawl-slow') // 自定义分区

        // 同步产出：作废范围必须是「本记录的全部未 apply task」，与分区键无关
        await system.storage.update('FkUrlA1', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), { mode: 'sync', url: 'fast' })
        expect((await system.storage.findOne('FkUrlA1', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['*'])).content).toBe('sync:fast')
        expect(await system.storage.find(taskRecordName, undefined, undefined, ['id'])).toHaveLength(0)

        // 慢 worker 的盲写命中 0 行（no-op），daemon 读不到 task
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), { result: 'STALE', status: 'success' })
        const replay = await controller.scheduler.handleAsyncReturn(computation, { id: tasks[0].id })
        expect(replay).toEqual({ skipped: true, reason: 'missing-task' })
        expect((await system.storage.findOne('FkUrlA1', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['*'])).content).toBe('sync:fast')
        await system.destroy()
    })

    test('A2: a resolved produce carrying a DIFFERENT custom key still invalidates the whole record scope (class, not instance)', async () => {
        const { system, controller, computation, taskRecordName } = await setupFk('FkUrlA2')
        const rec = await system.storage.create('FkUrlA2', { url: 'old', mode: 'async' })
        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(tasks.map(t => t.freshnessKey)).toEqual(['crawl-old'])

        // resolved 产出（args 带 freshnessKey 'crawl-new' ≠ 'crawl-old'）：按记录作废，两个分区都清
        await system.storage.update('FkUrlA2', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), { mode: 'resolved', url: 'new' })
        expect((await system.storage.findOne('FkUrlA2', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['*'])).content).toBe('ret(res:new)')
        expect(await system.storage.find(taskRecordName, undefined, undefined, ['id'])).toHaveLength(0)
        await system.destroy()
    })

    test('A3-guard: record-scoped invalidation must NOT touch other records\' pending tasks', async () => {
        const { system, taskRecordName } = await setupFk('FkUrlA3')
        const recA = await system.storage.create('FkUrlA3', { url: 'a', mode: 'async' })
        const recB = await system.storage.create('FkUrlA3', { url: 'b', mode: 'async' })
        expect(await system.storage.find(taskRecordName, undefined, undefined, ['id'])).toHaveLength(2)

        // 只有 A 的同步产出：B 的 pending task 仍然新鲜，必须存活
        await system.storage.update('FkUrlA3', MatchExp.atom({ key: 'id', value: ['=', recA.id] }), { mode: 'sync', url: 'a2' })
        const surviving = await system.storage.find(taskRecordName, undefined, undefined, ['*', ['record', { attributeQuery: ['id'] }]])
        expect(surviving).toHaveLength(1)
        expect(String((surviving[0].record as { id?: unknown })?.id)).toBe(String(recB.id))
        await system.destroy()
    })

    test('A4-guard: custom-key pure-async ordering is untouched (latest task in a partition still applies)', async () => {
        const { system, controller, computation, taskRecordName } = await setupFk('FkUrlA4')
        const rec = await system.storage.create('FkUrlA4', { url: 'u1', mode: 'async' })
        await system.storage.update('FkUrlA4', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), { url: 'u2' })
        const tasks = await system.storage.find(taskRecordName, undefined, { orderBy: { id: 'ASC' } }, ['*'])
        expect(tasks).toHaveLength(2) // 两个分区各一个 pending（async→async 不作废）

        // 完成第二个（最新）：正常 apply
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[1].id] }), { result: 'C2', status: 'success' })
        expect(await controller.scheduler.handleAsyncReturn(computation, { id: tasks[1].id })).toEqual({ skipped: false })
        expect((await system.storage.findOne('FkUrlA4', MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['*'])).content).toBe('ret(C2)')
        await system.destroy()
    })

    test('B: completing a task whose host record was deleted skips cleanly as orphaned-record (was: bare TypeError poison pill)', async () => {
        const { system, controller, computation, taskRecordName } = await setupFk('FkUrlB')
        const rec = await system.storage.create('FkUrlB', { url: 'slow', mode: 'async' })
        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(tasks).toHaveLength(1)

        await system.storage.delete('FkUrlB', MatchExp.atom({ key: 'id', value: ['=', rec.id] }))
        // 悬挂 task：worker 照常盲写完成
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), { result: 'ORPHAN', status: 'success' })

        const first = await controller.scheduler.handleAsyncReturn(computation, { id: tasks[0].id })
        expect(first).toEqual({ skipped: true, reason: 'orphaned-record' })
        const after = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), undefined, ['status'])
        expect(after.status).toBe('skipped')

        // 重投递收敛（不再抛、不再重复处理）
        const second = await controller.scheduler.handleAsyncReturn(computation, { id: tasks[0].id })
        expect(second).toEqual({ skipped: true, reason: 'already-handled' })
        await system.destroy()
    })

    test('A5: a pre-migration pending task must not overwrite the migrated value (migration rebuild is a produce epoch)', async () => {
        const db = new PGLiteDB()
        // CAUTION 两版共用代码路径的回调必须字面量相同（函数哈希参与 changed 判定）
        const COMPUTE_V1 = async () => ComputationResult.async({ epoch: 'v1' })
        const COMPUTE_V2 = async () => ComputationResult.async({ epoch: 'v2' })
        const build = (version: 1 | 2) => {
            const source = new Entity({
                name: 'Mig34Source',
                properties: [new Property({ name: 'value', type: 'number' }, { uuid: 'mig34-source-value' })],
            }, { uuid: 'mig34-source' })
            const dict = new Dictionary({
                name: 'mig34AsyncValue', type: 'string', collection: false,
                computation: new Custom({
                    name: 'Mig34AsyncCustom',
                    dataDeps: { sources: { type: 'records', source, attributeQuery: ['value'] } },
                    compute: version === 1 ? COMPUTE_V1 : COMPUTE_V2,
                    asyncReturn: async (result: unknown) => `ret(${JSON.stringify(result)})`,
                } as any, { uuid: 'mig34-async-custom' }),
            } as any, { uuid: 'mig34-async-dict' })
            return { source, dict }
        }

        // v1：setup + 一条写入触发 pending task
        const v1 = build(1)
        const systemV1 = new MonoSystem(db)
        systemV1.conceptClass = KlassByName
        const controllerV1 = new Controller({ system: systemV1, entities: [v1.source] as any, relations: [], dict: [v1.dict] as any })
        await controllerV1.setup(true)
        const computationV1 = Array.from(controllerV1.scheduler.computationsHandles.values()).find(
            c => c.dataContext.type === 'global' && (c.dataContext as GlobalDataContext).id.name === 'mig34AsyncValue'
        )! as DataBasedComputation
        const taskRecordName = controllerV1.scheduler.getAsyncTaskRecordKey(computationV1)
        await systemV1.storage.create('Mig34Source', { value: 1 })
        const preTasks = await systemV1.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(preTasks).toHaveLength(1)
        expect(preTasks[0].status).toBe('pending')

        // v2：计算变更（compute 字面量不同 ⇒ changed 决策）→ 迁移经 asyncCompletion handler 直写产出
        const v2 = build(2)
        const systemV2 = new MonoSystem(db)
        systemV2.conceptClass = KlassByName
        const controllerV2 = new Controller({ system: systemV2, entities: [v2.source] as any, relations: [], dict: [v2.dict] as any })
        const handlers = { asyncCompletion: { 'global:mig34AsyncValue': async () => 'migrated' } }
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2)
        await controllerV2.migrate({ approvedDiff, handlers })
        expect(await systemV2.storage.dict.get('mig34AsyncValue')).toBe('migrated')

        // 旧纪元 task 必须已被作废（物理删除）——worker 盲写 no-op、daemon missing-task
        const postTasks = await systemV2.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(postTasks).toHaveLength(0)
        const computationV2 = Array.from(controllerV2.scheduler.computationsHandles.values()).find(
            c => c.dataContext.type === 'global' && (c.dataContext as GlobalDataContext).id.name === 'mig34AsyncValue'
        )! as DataBasedComputation
        await systemV2.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', preTasks[0].id] }), { result: 'STALE-V1', status: 'success' })
        const replay = await controllerV2.scheduler.handleAsyncReturn(computationV2, { id: preTasks[0].id })
        expect(replay).toEqual({ skipped: true, reason: 'missing-task' })
        expect(await systemV2.storage.dict.get('mig34AsyncValue')).toBe('migrated')
        await db.close()
    })

    test('B2: a PENDING dangling task is also parked as orphaned-record on daemon delivery', async () => {
        const { system, controller, computation, taskRecordName } = await setupFk('FkUrlB2')
        const rec = await system.storage.create('FkUrlB2', { url: 'slow', mode: 'async' })
        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        await system.storage.delete('FkUrlB2', MatchExp.atom({ key: 'id', value: ['=', rec.id] }))

        const result = await controller.scheduler.handleAsyncReturn(computation, { id: tasks[0].id })
        expect(result).toEqual({ skipped: true, reason: 'orphaned-record' })
        const after = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), undefined, ['status'])
        expect(after.status).toBe('skipped')
        await system.destroy()
    })
})
