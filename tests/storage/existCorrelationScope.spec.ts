import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Entity, Property, Relation, MatchExp, KlassByName } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';

/**
 * r35：EXIST 原子的关联作用域矩阵（MatchExp.existAtomCorrelation 收敛点）。
 *
 * 两个修复：
 * 1. 父路径含 x:n 段的 EXIST 原子整条折叠进 EXISTS（反向路径关联到根，外层零 JOIN）。
 *    此前父路径入树 + EXISTS 关联直接父别名：NOT(exist) 按外层扇出行量化（∃ 中间行使
 *    ¬∃ 终端），本应排除的根记录被静默多返回——同一 match 驱动 find/update/delete。
 * 2. EXISTS 关联原子的引用预解析绑定到**直接外层查询**的别名（isResolvedFieldReference）。
 *    此前经 isReferenceValue 路径按 contextRootEntity（最外层根）解析：嵌套 EXIST
 *    （exist 载荷内再 exist）的关联绑到最外层根的列上，跨实体 id 比较静默返回空集（r25#7）。
 *
 * 维度：{正向, NOT} × {单段, x:1 前缀, x:n 中段(1:n), x:n 中段(n:n), 双 x:n 中段, 嵌套 exist,
 *       x:n 中段→x:1 终段} × {find, update 选择, delete 选择} × {PGLite, SQLite}。
 * 对称段中间路径维持 legacy 编译（existAtomCorrelation='parent'，登记边界）。
 */

type World = {
    system: MonoSystem
    destroy: () => Promise<void>
    statements: { sql: string, name: string }[]
}

async function setupWorld(dbKind: 'pglite' | 'sqlite', suffix: string): Promise<World> {
    const Company = Entity.create({ name: `Company${suffix}`, properties: [Property.create({ name: 'name', type: 'string' })] })
    const Org = Entity.create({ name: `Org${suffix}`, properties: [Property.create({ name: 'name', type: 'string' })] })
    const Group = Entity.create({ name: `Group${suffix}`, properties: [Property.create({ name: 'name', type: 'string' }), Property.create({ name: 'flag', type: 'string' })] })
    const Member = Entity.create({ name: `Member${suffix}`, properties: [Property.create({ name: 'role', type: 'string' })] })
    const Leader = Entity.create({ name: `Leader${suffix}`, properties: [Property.create({ name: 'level', type: 'number' })] })
    const Dept = Entity.create({ name: `Dept${suffix}`, properties: [Property.create({ name: 'deptName', type: 'string' })] })
    Relation.create({ source: Company, sourceProperty: 'orgs', target: Org, targetProperty: 'company', type: '1:n' })
    Relation.create({ source: Org, sourceProperty: 'groups', target: Group, targetProperty: 'org', type: '1:n' })
    Relation.create({ source: Group, sourceProperty: 'members', target: Member, targetProperty: 'group', type: '1:n' })
    // n:n 中段
    Relation.create({ source: Org, sourceProperty: 'sharedGroups', target: Group, targetProperty: 'sharedBy', type: 'n:n' })
    // x:n 中段 → x:1 终段
    Relation.create({ source: Group, sourceProperty: 'leader', target: Leader, targetProperty: 'groups', type: 'n:1' })
    // x:1 前缀
    Relation.create({ source: Org, sourceProperty: 'dept', target: Dept, targetProperty: 'orgs', type: 'n:1' })

    const db = dbKind === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
    const statements: { sql: string, name: string }[] = []
    const originalQuery = db.query.bind(db);
    (db as unknown as { query: typeof db.query }).query = (async (sql: string, params: unknown[] = [], name = '') => {
        statements.push({ sql, name })
        return originalQuery(sql, params, name)
    }) as typeof db.query

    const system = new MonoSystem(db)
    system.conceptClass = KlassByName
    const entities = [Company, Org, Group, Member, Leader, Dept]
    const controller = new Controller({
        system,
        entities,
        relations: Relation.instances.filter(r => entities.includes(r.source as never)),
        eventSources: []
    })
    await controller.setup(true)

    // orgA: G1(user, leader lv1) + G2(admin, leader lv9)；orgB: G3(user)；orgC: 无 groups
    await system.storage.create(`Org${suffix}`, {
        name: 'orgA',
        dept: { deptName: 'D-A' },
        groups: [
            { name: 'G1', flag: 'f1', members: [{ role: 'user' }], leader: { level: 1 } },
            { name: 'G2', flag: 'f2', members: [{ role: 'admin' }], leader: { level: 9 } },
        ]
    })
    await system.storage.create(`Org${suffix}`, {
        name: 'orgB',
        dept: { deptName: 'D-B' },
        groups: [{ name: 'G3', flag: 'f3', members: [{ role: 'user' }], leader: { level: 1 } }]
    })
    await system.storage.create(`Org${suffix}`, { name: 'orgC', dept: { deptName: 'D-C' } })

    return { system, destroy: () => system.destroy(), statements }
}

const adminExistPayload = { key: 'role', value: ['=', 'admin'] } as const

describe.each([['pglite'], ['sqlite']] as const)('EXIST correlation scope (%s)', (dbKind) => {
    test('positive multi-segment exist over x:n intermediate: per-root existential, zero outer joins, LIMIT pushdown', async () => {
        const { system, destroy, statements } = await setupWorld(dbKind, `A${dbKind}`)
        statements.length = 0
        const orgs = await system.storage.find(`OrgA${dbKind}`,
            MatchExp.atom({ key: 'groups.members', value: ['exist', adminExistPayload] }),
            { limit: 2, orderBy: { name: 'ASC' } },
            ['name'])
        expect(orgs.map(o => o.name)).toEqual(['orgA'])
        const rootSelect = statements.find(s => s.sql.includes('EXISTS'))!
        // 整条路径折叠进 EXISTS：外层零 JOIN、LIMIT 直接下推（不再触发 post-pagination/两段式）
        const outerSQL = rootSelect.sql.slice(0, rootSelect.sql.indexOf('EXISTS'))
        expect(outerSQL).not.toMatch(/JOIN/i)
        expect(rootSelect.sql).toMatch(/LIMIT\s+2/i)
        await destroy()
    })

    test('NOT multi-segment exist over x:n intermediate quantifies per root (the r35 false-positive family)', async () => {
        const { system, destroy } = await setupWorld(dbKind, `B${dbKind}`)
        // orgA 有 G2(admin)：¬∃ 语义必须排除 orgA。修复前 G1 的扇出行使 NOT EXISTS 为真，orgA 被误返回。
        const orgs = await system.storage.find(`OrgB${dbKind}`,
            MatchExp.atom({ key: 'groups.members', value: ['exist', adminExistPayload] }).not(),
            undefined, ['name'])
        expect(orgs.map(o => o.name).sort()).toEqual(['orgB', 'orgC'])
        await destroy()
    })

    test('NOT multi-segment exist over n:n intermediate quantifies per root', async () => {
        const { system, destroy } = await setupWorld(dbKind, `C${dbKind}`)
        // 通过 n:n sharedGroups 把 orgB 也挂上 G2（admin 组）——orgB 必须被排除
        const g2 = await system.storage.findOne(`GroupC${dbKind}`, MatchExp.atom({ key: 'name', value: ['=', 'G2'] }), undefined, ['id'])
        const orgB = await system.storage.findOne(`OrgC${dbKind}`, MatchExp.atom({ key: 'name', value: ['=', 'orgB'] }), undefined, ['id'])
        await system.storage.addRelationByNameById(`Org${'C' + dbKind}_sharedGroups_sharedBy_Group${'C' + dbKind}`, orgB.id, g2.id, {})
        const positive = await system.storage.find(`OrgC${dbKind}`,
            MatchExp.atom({ key: 'sharedGroups.members', value: ['exist', adminExistPayload] }),
            undefined, ['name'])
        expect([...new Set(positive.map(o => o.name))].sort()).toEqual(['orgB'])
        const negated = await system.storage.find(`OrgC${dbKind}`,
            MatchExp.atom({ key: 'sharedGroups.members', value: ['exist', adminExistPayload] }).not(),
            undefined, ['name'])
        expect(negated.map(o => o.name).sort()).toEqual(['orgA', 'orgC'])
        await destroy()
    })

    test('double x:n intermediates (3-hop reverse path) stay per-root under NOT', async () => {
        const { system, destroy } = await setupWorld(dbKind, `D${dbKind}`)
        const orgA = await system.storage.findOne(`OrgD${dbKind}`, MatchExp.atom({ key: 'name', value: ['=', 'orgA'] }), undefined, ['id'])
        const orgB = await system.storage.findOne(`OrgD${dbKind}`, MatchExp.atom({ key: 'name', value: ['=', 'orgB'] }), undefined, ['id'])
        await system.storage.create(`CompanyD${dbKind}`, { name: 'c1', orgs: [{ id: orgA.id }, { id: orgB.id }] })
        await system.storage.create(`CompanyD${dbKind}`, { name: 'c2', orgs: [{ id: orgB.id }] })

        const positive = await system.storage.find(`CompanyD${dbKind}`,
            MatchExp.atom({ key: 'orgs.groups.members', value: ['exist', adminExistPayload] }),
            undefined, ['name'])
        expect([...new Set(positive.map(c => c.name))].sort()).toEqual(['c1'])
        const negated = await system.storage.find(`CompanyD${dbKind}`,
            MatchExp.atom({ key: 'orgs.groups.members', value: ['exist', adminExistPayload] }).not(),
            undefined, ['name'])
        expect(negated.map(c => c.name).sort()).toEqual(['c2'])
        await destroy()
    })

    test('x:n intermediate with x:1 terminal exist stays per-root under NOT', async () => {
        const { system, destroy } = await setupWorld(dbKind, `E${dbKind}`)
        const positive = await system.storage.find(`OrgE${dbKind}`,
            MatchExp.atom({ key: 'groups.leader', value: ['exist', { key: 'level', value: ['>', 5] }] }),
            undefined, ['name'])
        expect([...new Set(positive.map(o => o.name))].sort()).toEqual(['orgA'])
        const negated = await system.storage.find(`OrgE${dbKind}`,
            MatchExp.atom({ key: 'groups.leader', value: ['exist', { key: 'level', value: ['>', 5] }] }).not(),
            undefined, ['name'])
        expect(negated.map(o => o.name).sort()).toEqual(['orgB', 'orgC'])
        await destroy()
    })

    test('nested exist (exist payload containing exist) correlates to the enclosing subquery, not the outermost root (r25#7)', async () => {
        const { system, destroy } = await setupWorld(dbKind, `F${dbKind}`)
        const positive = await system.storage.find(`OrgF${dbKind}`,
            MatchExp.atom({
                key: 'groups',
                value: ['exist', MatchExp.atom({ key: 'members', value: ['exist', adminExistPayload] })]
            }),
            undefined, ['name'])
        expect([...new Set(positive.map(o => o.name))].sort()).toEqual(['orgA'])
        const negated = await system.storage.find(`OrgF${dbKind}`,
            MatchExp.atom({
                key: 'groups',
                value: ['exist', MatchExp.atom({ key: 'members', value: ['exist', adminExistPayload] })]
            }).not(),
            undefined, ['name'])
        expect(negated.map(o => o.name).sort()).toEqual(['orgB', 'orgC'])
        await destroy()
    })

    test('nested exist combined with a field predicate on the intermediate level', async () => {
        const { system, destroy } = await setupWorld(dbKind, `G${dbKind}`)
        // groups exist (flag = f2 AND members exist admin)：内层字段谓词与嵌套 exist 同层 AND
        const result = await system.storage.find(`OrgG${dbKind}`,
            MatchExp.atom({
                key: 'groups',
                value: ['exist', MatchExp.atom({ key: 'flag', value: ['=', 'f2'] })
                    .and({ key: 'members', value: ['exist', adminExistPayload] })]
            }),
            undefined, ['name'])
        expect([...new Set(result.map(o => o.name))].sort()).toEqual(['orgA'])
        // flag 不匹配时嵌套 exist 不能救活
        const none = await system.storage.find(`OrgG${dbKind}`,
            MatchExp.atom({
                key: 'groups',
                value: ['exist', MatchExp.atom({ key: 'flag', value: ['=', 'f3'] })
                    .and({ key: 'members', value: ['exist', adminExistPayload] })]
            }),
            undefined, ['name'])
        expect(none.map(o => o.name)).toEqual([])
        await destroy()
    })

    test('single-segment NOT exist and x:1-prefix NOT exist stay correct (controls)', async () => {
        const { system, destroy } = await setupWorld(dbKind, `H${dbKind}`)
        const groups = await system.storage.find(`GroupH${dbKind}`,
            MatchExp.atom({ key: 'members', value: ['exist', adminExistPayload] }).not(),
            undefined, ['name'])
        expect(groups.map(g => g.name).sort()).toEqual(['G1', 'G3'])
        // x:1 前缀（dept.orgs 是 Dept 的 1:n 反向——改用 Org 的 dept 前缀在 Group 上验证）
        const groupsByOrgDept = await system.storage.find(`GroupH${dbKind}`,
            MatchExp.atom({ key: 'org.groups', value: ['exist', { key: 'name', value: ['=', 'G2'] }] }),
            undefined, ['name'])
        // org 下存在名为 G2 的组 ⇒ orgA 的两个组都命中
        expect(groupsByOrgDept.map(g => g.name).sort()).toEqual(['G1', 'G2'])
        await destroy()
    })

    test('filtered relation as the INTERMEDIATE segment keeps parent correlation (same-edge semantics)', async () => {
        // 中段 filtered relation 的 rebased link 谓词 AND 在外层，与路径原子共享 JOIN 别名
        //  才有「同一条边」语义（r25 F-2 的中段同族）。exist 原子带 hasRebasedPathPredicate
        //  时必须维持父关联编译：root 折叠会把 EXISTS 的量化域扩大到全部 base 边、谓词落在
        //  独立扇出行上——orgA 的 cold 组有 admin、hot 组没有，root 折叠形态会幻影命中 orgA
        //  （r35 收口自身的邻域探针当场抓获）。NOT 在该形态维持扇出行量化（登记边界）。
        const Org = Entity.create({ name: `OrgFM${dbKind}`, properties: [Property.create({ name: 'name', type: 'string' })] })
        const Group = Entity.create({ name: `GroupFM${dbKind}`, properties: [Property.create({ name: 'name', type: 'string' })] })
        const Member = Entity.create({ name: `MemberFM${dbKind}`, properties: [Property.create({ name: 'role', type: 'string' })] })
        const baseRel = Relation.create({
            source: Org, sourceProperty: 'groups', target: Group, targetProperty: 'org', type: '1:n',
            properties: [Property.create({ name: 'kind', type: 'string' })]
        })
        const membersRel = Relation.create({ source: Group, sourceProperty: 'members', target: Member, targetProperty: 'group', type: '1:n' })
        const hotRel = Relation.create({
            name: `OrgHotGroups${dbKind}`,
            baseRelation: baseRel,
            sourceProperty: 'hotGroups',
            targetProperty: 'hotOrg',
            matchExpression: MatchExp.atom({ key: 'kind', value: ['=', 'hot'] })
        })
        const db = dbKind === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({
            system, entities: [Org, Group, Member], relations: [baseRel, membersRel, hotRel], eventSources: []
        })
        await controller.setup(true)
        await system.storage.create(`OrgFM${dbKind}`, {
            name: 'orgA',
            groups: [
                { name: 'G1', members: [{ role: 'user' }], '&': { kind: 'hot' } },
                { name: 'G2', members: [{ role: 'admin' }], '&': { kind: 'cold' } },
            ]
        })
        await system.storage.create(`OrgFM${dbKind}`, {
            name: 'orgB',
            groups: [{ name: 'G3', members: [{ role: 'admin' }], '&': { kind: 'hot' } }]
        })
        const positive = await system.storage.find(`OrgFM${dbKind}`,
            MatchExp.atom({ key: 'hotGroups.members', value: ['exist', adminExistPayload] }),
            undefined, ['name'])
        // orgA 的 admin 在 cold 组：hot 边的量化域内没有 admin ⇒ 只有 orgB 命中
        expect([...new Set(positive.map(o => o.name))].sort()).toEqual(['orgB'])
        const negated = await system.storage.find(`OrgFM${dbKind}`,
            MatchExp.atom({ key: 'hotGroups.members', value: ['exist', adminExistPayload] }).not(),
            undefined, ['name'])
        expect([...new Set(negated.map(o => o.name))].sort()).toEqual(['orgA'])
        await system.destroy()
    })

    test('symmetric paths: positive semantics pinned; NOT over symmetric intermediate stays per-fan-out-row (registered boundary)', async () => {
        // existAtomCorrelation 对含对称段的路径维持 'parent'（legacy）编译（方向变体 × 反向
        //  折叠的交互未定谳）。本格是该登记边界的**可执行 pin**（r35 复盘规则：登记项必须
        //  携带编码机制假设的可执行断言，纯文字登记的机制假设十轮无从被证伪——r25#7 教训）：
        //  - 单段对称 exist 的正向与 NOT 都正确（终段剪枝后关联到根，无外层扇出）；
        //  - 对称中段 exist 的正向正确（逐行 ∃ ≡ 链式 ∃）；
        //  - 对称中段 × NOT 是**扇出行量化**：b 的好友 a（有 hot-post）+ c（无帖子）——
        //    ¬∃ 语义应排除 b，当前编译经 c 的扇出行放行 b。该行为变化即本 pin 变红，
        //    改动时按契约决策处理（同步更新维度登记册「隐式量化算子的否定语义」轴）。
        const User = Entity.create({ name: `SyUser${dbKind}`, properties: [Property.create({ name: 'name', type: 'string' })] })
        const Post = Entity.create({ name: `SyPost${dbKind}`, properties: [Property.create({ name: 'title', type: 'string' })] })
        Relation.create({ source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends', type: 'n:n' })
        Relation.create({ source: User, sourceProperty: 'posts', target: Post, targetProperty: 'author', type: '1:n' })
        const db = dbKind === 'pglite' ? new PGLiteDB() : new SQLiteDB(':memory:')
        const system = new MonoSystem(db)
        system.conceptClass = KlassByName
        const controller = new Controller({
            system, entities: [User, Post],
            relations: Relation.instances.filter(r => (r.source as { name?: string }).name?.endsWith(`User${dbKind}`)),
            eventSources: []
        })
        await controller.setup(true)
        const a = await system.storage.create(`SyUser${dbKind}`, { name: 'a', posts: [{ title: 'hot-post' }] })
        const b = await system.storage.create(`SyUser${dbKind}`, { name: 'b', friends: [{ id: a.id }] })
        const c = await system.storage.create(`SyUser${dbKind}`, { name: 'c' })
        await system.storage.addRelationByNameById(`SyUser${dbKind}_friends_friends_SyUser${dbKind}`, b.id, c.id, {})

        // 单段对称 exist：正向 + NOT 都按根量化（friends 现为 a-b、b-c）
        const hasFriendA = await system.storage.find(`SyUser${dbKind}`,
            MatchExp.atom({ key: 'friends', value: ['exist', { key: 'name', value: ['=', 'a'] }] }), undefined, ['name'])
        expect([...new Set(hasFriendA.map(u => u.name))].sort()).toEqual(['b'])
        const noFriendA = await system.storage.find(`SyUser${dbKind}`,
            MatchExp.atom({ key: 'friends', value: ['exist', { key: 'name', value: ['=', 'a'] }] }).not(), undefined, ['name'])
        expect([...new Set(noFriendA.map(u => u.name))].sort()).toEqual(['a', 'c'])

        // 对称中段：正向正确
        const friendHasHotPost = await system.storage.find(`SyUser${dbKind}`,
            MatchExp.atom({ key: 'friends.posts', value: ['exist', { key: 'title', value: ['=', 'hot-post'] }] }), undefined, ['name'])
        expect([...new Set(friendHasHotPost.map(u => u.name))].sort()).toEqual(['b'])

        // 对称中段 × NOT：pin 当前扇出行量化行为（¬∃ 语义 = ['a','c']；per-row 经 c 放行 b）
        const negated = await system.storage.find(`SyUser${dbKind}`,
            MatchExp.atom({ key: 'friends.posts', value: ['exist', { key: 'title', value: ['=', 'hot-post'] }] }).not(), undefined, ['name'])
        expect([...new Set(negated.map(u => u.name))].sort()).toEqual(['a', 'b', 'c'])
        await system.destroy()
    })

    test('update and delete victim selection honor per-root NOT exist semantics', async () => {
        const { system, destroy } = await setupWorld(dbKind, `I${dbKind}`)
        const notHasAdminGroup = () => MatchExp.atom({ key: 'groups.members', value: ['exist', adminExistPayload] }).not()
        await system.storage.update(`OrgI${dbKind}`, notHasAdminGroup(), { name: 'marked' })
        const names = (await system.storage.find(`OrgI${dbKind}`, undefined as never, undefined, ['name'])).map(o => o.name).sort()
        // orgA（有 admin 组）不能被更新；orgB/orgC 被标记
        expect(names).toEqual(['marked', 'marked', 'orgA'])
        await system.storage.delete(`OrgI${dbKind}`, notHasAdminGroup())
        const left = (await system.storage.find(`OrgI${dbKind}`, undefined as never, undefined, ['name'])).map(o => o.name)
        expect(left).toEqual(['orgA'])
        await destroy()
    })
})
