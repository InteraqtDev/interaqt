/**
 * r30 深度 review 修复回归（runtime / builtins 面）。
 *
 * B｜异步计算的"最新性"此前只按 task 行 id 排序（isLatestAsyncTask）。同一 freshnessKey 上
 *   一次经同步/resolved 路径产出的新值不创建 task 行，于是仍 pending/success 的旧 task 完成时
 *   被判为"最新"，把新值覆写回陈旧结果（silent stale overwrite）。修复：应用同步/resolved 结果前，
 *   删除该 freshnessKey 上所有未 apply 的 task（源已变，旧异步结果必陈旧；删除对外部 worker 的
 *   盲写回填幂等收敛）。
 *
 * D｜isRef payload 传入 null / 非对象（HTTP 客户端常发 null）此前在 `.id` 上抛裸 TypeError，
 *   而非干净的守卫错误。修复：ref 校验先判「非空对象且有 id」。
 *
 * D2｜父级 Transfer 的 source/target 指向 group 内嵌套节点时，rawToNode 能解析到该节点并把
 *   其 next 指针跨分支改写（buildGraph 的 start/end 校验只看本层节点，漏网）→ 运行期 transferToNext
 *   走进错误子图，静默破坏 every/any/race 语义。修复：buildGraph 对「transfer 端点不属于本层
 *   interactions/groups」fail-fast。
 */
import { Controller, Entity, MonoSystem, Property, MatchExp, DataDep, PropertyDataContext, DataBasedComputation, ComputationResult, Interaction, Action, Activity, ActivityGroup, Transfer, Payload, PayloadItem, ActivityManager } from "interaqt";
import { PGLiteDB } from '@drivers';
import { describe, expect, test } from "vitest";

// ---- B: async freshness ----
interface CrawlerArgs { source: string }
class Crawler {
    public uuid: string; public _type = 'Crawler'; public _options?: { uuid?: string }; public source: string;
    constructor(args: CrawlerArgs, options?: { uuid?: string }) { this._options = options; this.uuid = options?.uuid || Math.random().toString(36).substr(2, 9); this.source = args.source; }
    static isKlass = true as const; static displayName = 'Crawler'; static instances: Crawler[] = [];
    static public = { source: { type: 'string' as const, required: true as const } };
    static create(args: CrawlerArgs, options?: { uuid?: string }): Crawler { const i = new Crawler(args, options); Crawler.instances.push(i); return i; }
    static stringify(i: Crawler): string { return JSON.stringify({ type: 'Crawler', options: i._options, uuid: i.uuid, public: { source: i.source } }); }
    static parse(json: string): Crawler { const d = JSON.parse(json); return Crawler.create(d.public, d.options); }
    static clone(i: Crawler): Crawler { return Crawler.create({ source: i.source }); }
    static is(obj: unknown): obj is Crawler { return obj !== null && typeof obj === 'object' && (obj as any)._type === 'Crawler'; }
    static check(data: unknown): boolean { return data !== null && typeof data === 'object' && typeof (data as any).uuid === 'string'; }
}
class CrawlerComputation implements DataBasedComputation {
    static computationType = Crawler
    static contextType = 'property' as const
    state = {}
    dataDeps: { [key: string]: DataDep } = {}
    constructor(public controller: Controller, public args: Crawler, public dataContext: PropertyDataContext) {
        this.dataDeps = { _current: { type: 'property', attributeQuery: [this.args.source] } }
    }
    async compute({ _current }: { _current: any }) {
        if (_current.url === 'preset') return ComputationResult.resolved('FAST', { type: 'preset' })
        return ComputationResult.async({ type: 'crawl' })
    }
    async asyncReturn(result: any, args: any) { return `${result}_via_${args.type}` }
}

describe('r30 runtime review fixes', () => {
    test('B: a pending async task completing AFTER a sync/resolved recompute must not overwrite the newer value', async () => {
        const URLEntity = Entity.create({
            name: 'URL',
            properties: [
                Property.create({ name: 'url', type: 'string' }),
                Property.create({ name: 'content', type: 'string', computation: Crawler.create({ source: 'url' }) as any }),
            ]
        })
        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [URLEntity], relations: [], computations: [CrawlerComputation] })
        await controller.setup(true)
        const comp = Array.from(controller.scheduler.computationsHandles.values()).find(
            c => c.dataContext.type === 'property' && (c.dataContext as any).id.name === 'content'
        )! as DataBasedComputation
        const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(comp)

        const url = await system.storage.create('URL', { url: 'slow-url' })
        const tasks1 = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(tasks1.length).toBe(1)

        // sync/resolved recompute applies immediately, creating NO new task row
        await system.storage.update('URL', MatchExp.atom({ key: 'id', value: ['=', url.id] }), { url: 'preset' })
        const afterSync = await system.storage.findOne('URL', MatchExp.atom({ key: 'id', value: ['=', url.id] }), {}, ['*'])
        expect(afterSync.content).toBe('FAST_via_preset')

        // the superseded task is gone (invalidated), so the slow worker's blind write-back is a no-op
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks1[0].id] }), { result: 'STALE', status: 'success' })
        const successTasks = await system.storage.find(taskRecordName, MatchExp.atom({ key: 'status', value: ['=', 'success'] }), {}, ['*'])
        expect(successTasks.length).toBe(0)
        for (const t of successTasks) await controller.scheduler.handleAsyncReturn(comp, t)

        const final = await system.storage.findOne('URL', MatchExp.atom({ key: 'id', value: ['=', url.id] }), {}, ['*'])
        expect(final.content).toBe('FAST_via_preset')
        await system.destroy()
    })

    test('B-guard: a normal async task (no superseding sync recompute) still applies', async () => {
        const URLEntity = Entity.create({
            name: 'URL2',
            properties: [
                Property.create({ name: 'url', type: 'string' }),
                Property.create({ name: 'content', type: 'string', computation: Crawler.create({ source: 'url' }) as any }),
            ]
        })
        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [URLEntity], relations: [], computations: [CrawlerComputation] })
        await controller.setup(true)
        const comp = Array.from(controller.scheduler.computationsHandles.values()).find(
            c => c.dataContext.type === 'property' && (c.dataContext as any).id.name === 'content'
        )! as DataBasedComputation
        const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(comp)
        const url = await system.storage.create('URL2', { url: 'slow-url' })
        const tasks = await system.storage.find(taskRecordName, undefined, undefined, ['*'])
        expect(tasks.length).toBe(1)
        await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), { result: 'DONE', status: 'success' })
        const taskRecord = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', tasks[0].id] }), {}, ['*'])
        await controller.scheduler.handleAsyncReturn(comp, taskRecord)
        const final = await system.storage.findOne('URL2', MatchExp.atom({ key: 'id', value: ['=', url.id] }), {}, ['*'])
        expect(final.content).toBe('DONE_via_crawl')
        await system.destroy()
    })

    test('D: null / non-object on an isRef payload gives a clean guard error, not a TypeError', async () => {
        const Doc = Entity.create({ name: 'Doc', properties: [Property.create({ name: 'title', type: 'string' })] })
        const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] })
        const EditDoc = Interaction.create({
            name: 'EditDoc', action: Action.create({ name: 'editDoc' }),
            payload: Payload.create({ items: [PayloadItem.create({ name: 'doc', type: 'Entity', base: Doc, isRef: true })] })
        })
        const EditDocs = Interaction.create({
            name: 'EditDocs', action: Action.create({ name: 'editDocs' }),
            payload: Payload.create({ items: [PayloadItem.create({ name: 'docs', type: 'Entity', base: Doc, isRef: true, isCollection: true })] })
        })
        const system = new MonoSystem(new PGLiteDB())
        const controller = new Controller({ system, entities: [Doc, User], relations: [], eventSources: [EditDoc, EditDocs] })
        await controller.setup(true)
        const u = await system.storage.create('User', { name: 'u' })

        for (const [inter, payload] of [
            [EditDoc, { doc: null }],
            [EditDocs, { docs: [null] }],
            [EditDocs, { docs: [{ id: 'x' }, 'not-an-object'] }],
        ] as const) {
            const res = await controller.dispatch(inter, { user: u, payload: payload as any })
            expect(res.error).toBeDefined()
            expect((res.error as Error).constructor.name).not.toBe('TypeError')
            expect(String((res.error as any).message || res.error)).not.toMatch(/Cannot read properties of/)
        }
        await system.destroy()
    })

    test('D2: a parent transfer reaching into a group\'s nested node is rejected at build time', () => {
        const mk = (name: string) => Interaction.create({ name, action: Action.create({ name }), payload: Payload.create({}) })
        const A1 = mk('A1'); const B1 = mk('B1'); const B2 = mk('B2'); const Head = mk('Head')
        const group = ActivityGroup.create({
            type: 'every',
            activities: [
                Activity.create({ name: 'branchA', interactions: [A1] }),
                Activity.create({ name: 'branchB', interactions: [B1, B2], transfers: [Transfer.create({ name: 'b1b2', source: B1, target: B2 })] }),
            ]
        })
        const activity = Activity.create({
            name: 'crossBranch', interactions: [Head], groups: [group],
            transfers: [
                Transfer.create({ name: 'headToGroup', source: Head, target: group }),
                Transfer.create({ name: 'crossA1toB2', source: A1, target: B2 }), // malformed: nested nodes
            ]
        })
        expect(() => new ActivityManager([activity])).toThrow(/not one of this activity's own interactions or groups/)
    })

    test('D2-guard: a well-formed activity with a group still builds', () => {
        const mk = (name: string) => Interaction.create({ name, action: Action.create({ name }), payload: Payload.create({}) })
        const Head = mk('H'); const A1 = mk('GA1'); const B1 = mk('GB1')
        const group = ActivityGroup.create({
            type: 'any',
            activities: [
                Activity.create({ name: 'gbranchA', interactions: [A1] }),
                Activity.create({ name: 'gbranchB', interactions: [B1] }),
            ]
        })
        const activity = Activity.create({
            name: 'wellFormed', interactions: [Head], groups: [group],
            transfers: [Transfer.create({ name: 'h2g', source: Head, target: group })]
        })
        expect(() => new ActivityManager([activity])).not.toThrow()
    })
})
