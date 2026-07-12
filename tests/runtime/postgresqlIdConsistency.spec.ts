/**
 * r24 F-1 —— PostgreSQL 驱动 getAutoId 返回 bigint 字符串与 INT 列读回 number 的类型分裂。
 *
 * node-pg 把 nextval()（bigint）序列化为字符串（"1"），而 INT id 列读回是 JS number（1）。
 * storage 写路径大量依赖 id 严格相等（flashOut 抢夺判定、同 id 原地引用判定等）：
 * "1" !== 1 时 merged link（1:n 的 FK 合并进 n 侧行）的行合并静默不发生——
 * addRelationByNameById 把 link 写成独立的第二行（同一逻辑 id 两行、实体列 NULL），
 * 关系查询返回破损实体（只有 id 无字段），依赖关系的聚合计算全部拿到空数据。
 *
 * 修复：getAutoId 归一化为 number（与 INT4 列读回一致；SQLite 驱动同为 number）。
 * 本套件需要真实 PostgreSQL（INTERAQT_POSTGRES_DATABASE）。
 */
import { describe, expect, test } from 'vitest';
import { Average, Controller, Entity, KlassByName, MatchExp, MonoSystem, Property, Relation } from 'interaqt';
import { PostgreSQLDB } from '@drivers';

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
const dbOptions = {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
};

describeIfPostgres('r24 PostgreSQL id type consistency', () => {
    test('addRelationByNameById merges the link into the existing n-side row (no duplicate row)', async () => {
        const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_idconsistency`;
        const Task = Entity.create({
            name: 'IdcTask',
            properties: [Property.create({ name: 'score', type: 'number' })],
        });
        const User = Entity.create({
            name: 'IdcUser',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const Owns = Relation.create({
            source: User, sourceProperty: 'tasks', target: Task, targetProperty: 'owner',
            name: 'IdcOwns', type: '1:n',
        });
        const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User, Task], relations: [Owns] });
        try {
            await controller.setup(true);
            const user = await system.storage.create('IdcUser', { name: 'A' });
            const task = await system.storage.create('IdcTask', { score: 10 });
            // 分配侧与读回侧的 id 类型必须一致（此前分配侧是字符串、读回侧是 number）
            const readBack = await system.storage.findOne('IdcTask',
                MatchExp.atom({ key: 'id', value: ['=', task.id] }), undefined, ['id']);
            expect(typeof task.id).toBe(typeof readBack.id);

            await system.storage.addRelationByNameById('IdcOwns', user.id, task.id);

            // 关系查询必须返回带字段的完整实体（此前返回只有 id 的破损行）
            const withTasks = await system.storage.findOne('IdcUser',
                MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
                ['id', ['tasks', { attributeQuery: ['id', 'score'] }]]);
            expect(withTasks.tasks).toHaveLength(1);
            expect(withTasks.tasks[0].score).toBe(10);

            // 物理面：merged link 合并进任务行，不产生同一逻辑 id 的第二行
            const db = (system as unknown as { storage: { db: PostgreSQLDB } }).storage.db;
            const raw = await db.query<{ count: string }>(
                'SELECT COUNT(*) AS count FROM "IdcTask"', [], 'count task rows');
            expect(Number(raw[0].count)).toBe(1);
        } finally {
            await system.destroy();
        }
    }, 60000);

    test('relation aggregate over existing data computes correctly after migration', async () => {
        const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_idcmigrate`;
        const buildV1 = () => {
            const Task = new (Entity as any)({
                name: 'IdcMTask',
                properties: [new (Property as any)({ name: 'score', type: 'number' }, { uuid: 'idcm-task-score' })],
            }, { uuid: 'idcm-task' });
            const User = new (Entity as any)({
                name: 'IdcMUser',
                properties: [new (Property as any)({ name: 'name', type: 'string' }, { uuid: 'idcm-user-name' })],
            }, { uuid: 'idcm-user' });
            const Owns = new (Relation as any)({
                source: User, sourceProperty: 'tasks', target: Task, targetProperty: 'owner',
                name: 'IdcMOwns', type: '1:n',
            }, { uuid: 'idcm-owns' });
            return { Task, User, Owns };
        };
        const v1 = buildV1();
        const s1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        s1.conceptClass = KlassByName;
        await new Controller({ system: s1, entities: [v1.User, v1.Task], relations: [v1.Owns] }).setup(true);
        const user = await s1.storage.create('IdcMUser', { name: 'A' });
        const t1 = await s1.storage.create('IdcMTask', { score: 10 });
        const t2 = await s1.storage.create('IdcMTask', { score: 20 });
        await s1.storage.addRelationByNameById('IdcMOwns', user.id, t1.id);
        await s1.storage.addRelationByNameById('IdcMOwns', user.id, t2.id);
        await s1.destroy();

        const TaskV2 = new (Entity as any)({
            name: 'IdcMTask',
            properties: [new (Property as any)({ name: 'score', type: 'number' }, { uuid: 'idcm-task-score' })],
        }, { uuid: 'idcm-task' });
        const UserV2 = new (Entity as any)({
            name: 'IdcMUser',
            properties: [
                new (Property as any)({ name: 'name', type: 'string' }, { uuid: 'idcm-user-name' }),
                new (Property as any)({
                    name: 'avgScore', type: 'number',
                    computation: new (Average as any)({ property: 'tasks', attributeQuery: ['score'] }, { uuid: 'idcm-avg-comp' }),
                }, { uuid: 'idcm-user-avg' }),
            ],
        }, { uuid: 'idcm-user' });
        const OwnsV2 = new (Relation as any)({
            source: UserV2, sourceProperty: 'tasks', target: TaskV2, targetProperty: 'owner',
            name: 'IdcMOwns', type: '1:n',
        }, { uuid: 'idcm-owns' });
        const s2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
        s2.conceptClass = KlassByName;
        const c2 = new Controller({ system: s2, entities: [UserV2, TaskV2], relations: [OwnsV2] });
        try {
            const diff = await c2.generateMigrationDiff();
            const approvedDiff = {
                ...diff,
                status: 'approved' as const,
                decisions: [
                    ...diff.decisions,
                    ...diff.requiredDecisions.map((req: any) => req.kind === 'computation'
                        ? { kind: 'computation', id: req.id, dataContext: req.dataContext, decision: req.recommendedDecision, reason: 'r24' }
                        : { ...req, reason: 'r24' }),
                ],
            };
            await c2.migrate({ approvedDiff });
            const migrated = await s2.storage.findOne('IdcMUser',
                MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined, ['*']);
            expect(migrated.avgScore).toBe(15);
        } finally {
            await s2.destroy();
        }
    }, 60000);
});
