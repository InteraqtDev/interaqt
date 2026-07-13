/**
 * r27b — 写路径结构化 fuzzer 首跑战果的回归固化（F-3 / F-4 / F-5）。
 *
 * 三个 bug 全部由 `writePathStructuralFuzz.spec.ts` 在 27 轮人肉审查过的代码库上首跑抓获
 * （种子日志定位 → 手工最小化 → 兄弟轨扫描 → 收敛点修复）。详见
 * `agentspace/output/quality-foundation-plan-r27.md`。
 *
 * F-3：字符串 id 经公开 API 传入（签名本就声明 string；HTTP 载荷天然字符串）时，
 *  写路径的 JS `===` id 身份判定与 SQL 相等判定分裂（1 vs '1'）——行匹配查到了行、
 *  身份判定说"不是同一个"，flashOut 行合并/同 id 原地判定被静默跳过：重复逻辑 id 行、
 *  字段丢失。修复：8 处判定收敛到 `sameRecordId`（String 归一）。
 * F-4：reliance 生命周期契约（依赖只能随 owner 删除）只在 update 轨有 unlink 守卫；
 *  addRelation / 直建 link record / create-ref 领养三条兄弟轨可以给已持有依赖的 owner
 *  绑定新依赖——combined 行搬迁把旧依赖的同行列静默物理销毁（无 delete 事件）。
 *  修复：置换 fail-fast；改嫁依赖、领养空闲 owner 等合法面保留。
 * F-5：link-endpoint 认领的行搬迁子树受 attributeQuery 递归深度限制——被认领记录经
 *  **其他** mergeLinks combined 关系同住的 link 在清行时静默消失（零事件）。
 *  修复：完整深度行搬运实现之前 fail-fast。
 */
import { expect, test, describe, afterEach } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { SQLiteDB } from '@drivers';
import { RecordMutationEvent } from "@runtime";

describe('r27b F-3 — record id identity is JS-type-insensitive across the write path', () => {
    let db: SQLiteDB
    afterEach(async () => { if (db) await db.close() })

    test('addRelationByNameById with string ids on a numeric-id driver merges rows (was: duplicate logical-id row, host fields lost)', async () => {
        const A = Entity.create({ name: 'R27bA', properties: [Property.create({ name: 'label', type: 'string' })] })
        const B = Entity.create({ name: 'R27bB', properties: [Property.create({ name: 'label', type: 'string' })] })
        const rel = Relation.create({
            source: A, sourceProperty: 'out', target: B, targetProperty: 'in', type: 'n:1',
            properties: [Property.create({ name: 'note', type: 'string' })]
        })
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([A, B], [rel], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const a = await handle.create('R27bA', { label: 'keep-me' })
        const b = await handle.create('R27bB', { label: 'b' })
        expect(typeof a.id).toBe('number') // 驱动原生 number；公开 API 签名声明 string
        await handle.addRelationByNameById(rel.name!, String(a.id), String(b.id), { note: 'n1' })

        const as = await handle.find('R27bA', undefined, undefined, ['*', ['out', { attributeQuery: ['label'] }]])
        expect(as, 'no duplicate logical A row').toHaveLength(1)
        expect(as[0].label, 'host fields survive').toBe('keep-me')
        expect(as[0].out?.label, 'relation established').toBe('b')
    })

    test('reliance-combined create-steal via string ref keeps a single logical row (was: two rows, one identity-only)', async () => {
        const A = Entity.create({ name: 'R27bC', properties: [Property.create({ name: 'label', type: 'string' })] })
        const B = Entity.create({ name: 'R27bD', properties: [Property.create({ name: 'label', type: 'string' })] })
        const rel = Relation.create({
            source: A, sourceProperty: 'out', target: B, targetProperty: 'in', type: '1:1', isTargetReliance: true
        })
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([A, B], [rel], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const b = await handle.create('R27bD', { label: 'standalone-b' })
        await handle.create('R27bC', { label: 'a1', out: { id: String(b.id) } })
        const bs = await handle.find('R27bD', undefined, undefined, ['*'])
        expect(bs, 'single logical B row after steal').toHaveLength(1)
        expect(bs[0].label, 'stolen row carries its data').toBe('standalone-b')
    })
})

describe('r27b F-4 — reliance displacement fails fast on every producer track', () => {
    let db: SQLiteDB
    afterEach(async () => { if (db) await db.close() })

    async function bootstrap(tag: string) {
        const B = Entity.create({ name: `R27c${tag}B`, properties: [Property.create({ name: 'label', type: 'string' })] })
        const D = Entity.create({ name: `R27c${tag}D`, properties: [Property.create({ name: 'label', type: 'string' })] })
        const rel = Relation.create({
            source: B, sourceProperty: 'dep', target: D, targetProperty: 'owner', type: '1:1', isTargetReliance: true
        })
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([B, D], [rel], db)
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)
        const owner = await handle.create(`R27c${tag}B`, { label: 'owner' })
        const dep1 = await handle.create(`R27c${tag}D`, { label: 'dep1' })
        await handle.addRelationByNameById(rel.name!, owner.id, dep1.id, {})
        return { handle, rel, owner, dep1, B: `R27c${tag}B`, D: `R27c${tag}D` }
    }

    test('addRelation track rejects (was: old dependent row silently destroyed, no delete event)', async () => {
        const { handle, rel, owner, D } = await bootstrap('X')
        const dep2 = await handle.create(D, { label: 'dep2' })
        await expect(handle.addRelationByNameById(rel.name!, owner.id, dep2.id, {}))
            .rejects.toThrowError(/cannot bind a new reliance dependent/)
        // 数据面未被破坏
        const ds = await handle.find(D, undefined, undefined, ['*'])
        expect(ds.map((d: any) => d.label).sort()).toEqual(['dep1', 'dep2'])
    })

    test('direct link-record create track rejects (Transform relation patch shape)', async () => {
        const { handle, rel, owner, D } = await bootstrap('Y')
        const dep2 = await handle.create(D, { label: 'dep2' })
        await expect(handle.create(rel.name!, { source: { id: owner.id }, target: { id: dep2.id } }))
            .rejects.toThrowError(/cannot bind a new reliance dependent/)
    })

    test('create-with-owner-ref adoption track rejects', async () => {
        const { handle, owner, D } = await bootstrap('Z')
        await expect(handle.create(D, { label: 'dep2', owner: { id: owner.id } } as any))
            .rejects.toThrowError(/cannot bind a new reliance dependent/)
    })

    test('legal cells preserved: re-parenting a dependent; adopting a FREE owner; idempotent same-pair rejection stays idempotency-shaped', async () => {
        const { handle, rel, dep1, D, B } = await bootstrap('W')
        // 1. 依赖改嫁（owner 侧 steal）：数据随行完整迁移
        const owner2 = await handle.create(B, { label: 'owner2' })
        await handle.addRelationByNameById(rel.name!, owner2.id, dep1.id, {})
        const ds = await handle.find(D, undefined, undefined, ['*'])
        expect(ds).toHaveLength(1)
        expect(ds[0].label).toBe('dep1')
        const owners = await handle.find(B, undefined, undefined, ['label', ['dep', { attributeQuery: ['label'] }]])
        expect(owners.find((o: any) => o.label === 'owner2')?.dep?.label).toBe('dep1')
        // 2. 领养空闲 owner（dependent 侧 create-ref）
        const owner3 = await handle.create(B, { label: 'owner3' })
        await handle.create(D, { label: 'dep3', owner: { id: owner3.id } } as any)
        const owner3After = await handle.find(B, MatchExp.atom({ key: 'id', value: ['=', owner3.id] }), undefined, ['label', ['dep', { attributeQuery: ['label'] }]])
        expect(owner3After[0]?.dep?.label).toBe('dep3')
        // 3. 同 pair 重复 addRelation 仍然是幂等性拒绝（不是置换拒绝）
        await expect(handle.addRelationByNameById(rel.name!, owner2.id, dep1.id, {}))
            .rejects.toThrowError(/link already exist/)
    })
})

describe('r27b F-5 — endpoint claim on a cross-relation combined co-tenant row fails fast', () => {
    let db: SQLiteDB
    afterEach(async () => { if (db) await db.close() })

    test('addRelation on a second merged relation rejects (was: co-tenant combined link silently destroyed, no delete event)', async () => {
        const C = Entity.create({ name: 'R27dC', properties: [Property.create({ name: 'label', type: 'string' })] })
        const B = Entity.create({ name: 'R27dB', properties: [Property.create({ name: 'label', type: 'string' })] })
        const shared = Relation.create({ source: C, sourceProperty: 'shared', target: B, targetProperty: 'sharedOwner', type: '1:1' })
        const other = Relation.create({ source: C, sourceProperty: 'other', target: B, targetProperty: 'otherOwner', type: 'n:1' })
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([C, B], [shared, other], db, ['R27dC.shared'])
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const b1 = await handle.create('R27dB', { label: 'b1' })
        const c = await handle.create('R27dC', { label: 'c' })
        await handle.addRelationByNameById(shared.name!, c.id, b1.id, {})
        const sharedLinksBefore = await handle.findRelationByName(shared.name!, undefined, undefined, ['id'])
        expect(sharedLinksBefore).toHaveLength(1)

        const b2 = await handle.create('R27dB', { label: 'b2' })
        await expect(handle.addRelationByNameById(other.name!, c.id, b2.id, {}))
            .rejects.toThrowError(/cannot claim .* as an endpoint of new relation record/)
        // 守卫在破坏性写入之前抛出：同住 link 完好
        const sharedLinksAfter = await handle.findRelationByName(shared.name!, undefined, undefined, ['id'])
        expect(sharedLinksAfter, 'co-tenant combined link survives').toHaveLength(1)
    })

    test('update track stays the legal route for assigning merged FKs on a combined row', async () => {
        const User = Entity.create({ name: 'R27dU', properties: [Property.create({ name: 'name', type: 'string' })] })
        const Profile = Entity.create({ name: 'R27dP', properties: [Property.create({ name: 'title', type: 'string' })] })
        const Company = Entity.create({ name: 'R27dCo', properties: [Property.create({ name: 'companyName', type: 'string' })] })
        const owns = Relation.create({ source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner', type: '1:1' })
        const employment = Relation.create({ source: Profile, sourceProperty: 'company', target: Company, targetProperty: 'profiles', type: 'n:1' })
        db = new SQLiteDB(':memory:')
        await db.open()
        const setup = new DBSetup([User, Profile, Company], [owns, employment], db, ['R27dU.profile'])
        await setup.createTables()
        const handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        const u = await handle.create('R27dU', { name: 'u1', profile: { title: 'p1' } })
        const company = await handle.create('R27dCo', { companyName: 'acme' })
        const events: RecordMutationEvent[] = []
        await handle.update('R27dP', MatchExp.atom({ key: 'id', value: ['=', u.profile.id] }), { company: { id: company.id } } as any, events)
        const profiles = await handle.find('R27dP', undefined, undefined,
            ['title', ['company', { attributeQuery: ['companyName'] }], ['owner', { attributeQuery: ['name'] }]])
        expect(profiles[0]?.company?.companyName).toBe('acme')
        expect(profiles[0]?.owner?.name, 'co-tenant link intact through the update track').toBe('u1')
        expect(events.some(e => e.type === 'create' && e.recordName === employment.name)).toBe(true)
    })
})
