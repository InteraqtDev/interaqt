import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
    Controller,
    Count,
    KlassByName,
    MatchExp,
    MonoSystem,
    Summation,
} from 'interaqt';
import { attachPerfProbe, type PerfProbe } from './helpers/perfProbe.js';

/**
 * A1（performance-debt-plan §四 1.1）：filtered relation 上的 property 级聚合必须走增量。
 *
 * 记录背景（r19#4 → r21#1 → … → r32，≥10 轮复确）：filtered 源的字段 update 事件以
 * 物理 base 名到达，property 级（targetPath）监听绕过 resolveFilteredUpdateEvent 的
 * 成员资格守卫/事件名改写 → 聚合增量分支不识别 → 恒退全量重算 + RequireSerializableRetry
 * 隔离级升级（事务作废重跑）。正确性由全量兜底，代价是热路径重算风暴。
 *
 * 本 spec 是该项的红-绿判据（perfProbe 计数器）+ 值正确性回归：
 *  - 每个写场景后：聚合值 = 期望值（正确性）；
 *  - 全量重算执行次数 = 0、无 SERIALIZABLE 隔离级升级（增量性）；
 *  - 非 filtered 的对照组（同 base 关系上的聚合）保证修复不伤及普通关系路径。
 *
 * 场景轴（成员资格 × 操作）：enter-by-create / stay-in link 字段更新 / exit-by-update /
 * enter-by-update / stay-out 更新 / 目标实体字段更新（成员与非成员）/ removeRelation /
 * 目标实体删除级联。聚合形态轴：Count 无 callback（无逐项状态）/ Count 带 callback
 * （逐项状态）/ Summation 目标字段 / Summation link (&) 字段。
 */

async function setupFixture() {
    const ownerEntity = Entity.create({
        name: 'PerfOwner',
        properties: [Property.create({ name: 'name', type: 'string' })]
    });
    const taskEntity = Entity.create({
        name: 'PerfTask',
        properties: [
            Property.create({ name: 'title', type: 'string' }),
            Property.create({ name: 'score', type: 'number' })
        ]
    });
    const ownerTaskRelation = Relation.create({
        source: ownerEntity,
        sourceProperty: 'tasks',
        target: taskEntity,
        targetProperty: 'owner',
        type: '1:n',
        properties: [
            Property.create({ name: 'weight', type: 'number' })
        ]
    });
    const heavyRelation = Relation.create({
        name: 'PerfHeavyOwnerTask',
        baseRelation: ownerTaskRelation,
        sourceProperty: 'heavyTasks',
        targetProperty: 'heavyOwner',
        matchExpression: MatchExp.atom({ key: 'weight', value: ['>', 50] })
    });

    ownerEntity.properties.push(
        // filtered 源：四种聚合形态
        Property.create({
            name: 'heavyCount', type: 'number',
            computation: Count.create({ property: 'heavyTasks' })
        }),
        Property.create({
            name: 'heavyCallbackCount', type: 'number',
            computation: Count.create({
                property: 'heavyTasks',
                attributeQuery: ['score'],
                callback: (task: { score?: number }) => (task.score ?? 0) > 10
            })
        }),
        Property.create({
            name: 'heavyScoreSum', type: 'number',
            computation: Summation.create({ property: 'heavyTasks', attributeQuery: ['score'] })
        }),
        Property.create({
            name: 'heavyWeightSum', type: 'number',
            computation: Summation.create({ property: 'heavyTasks', attributeQuery: [['&', { attributeQuery: ['weight'] }]] })
        }),
        // 对照组：base 关系上的同形聚合（修复不得伤及普通关系路径）
        Property.create({
            name: 'taskCount', type: 'number',
            computation: Count.create({ property: 'tasks' })
        }),
        Property.create({
            name: 'taskScoreSum', type: 'number',
            computation: Summation.create({ property: 'tasks', attributeQuery: ['score'] })
        })
    );

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system,
        entities: [ownerEntity, taskEntity],
        relations: [ownerTaskRelation, heavyRelation]
    });
    await controller.setup(true);
    const probe = attachPerfProbe(controller);
    return { system, controller, probe };
}

type OwnerSnapshot = {
    heavyCount: number
    heavyCallbackCount: number
    heavyScoreSum: number
    heavyWeightSum: number
    taskCount: number
    taskScoreSum: number
}

async function readOwner(system: MonoSystem, ownerId: string): Promise<OwnerSnapshot> {
    return await system.storage.findOne('PerfOwner',
        MatchExp.atom({ key: 'id', value: ['=', ownerId] }),
        undefined,
        ['id', 'heavyCount', 'heavyCallbackCount', 'heavyScoreSum', 'heavyWeightSum', 'taskCount', 'taskScoreSum']
    ) as unknown as OwnerSnapshot
}

function expectIncrementalOnly(probe: PerfProbe) {
    expect(probe.totalFull(), `expected zero full recomputes:\n${probe.summary()}`).toBe(0)
    expect(probe.serializableAttempts(), `expected no SERIALIZABLE isolation upgrade:\n${probe.summary()}`).toBe(0)
}

describe('filtered relation property aggregation incrementality (A1)', () => {
    test('all membership × operation cells stay incremental with correct values', async () => {
        const { system, probe } = await setupFixture()

        const owner = await system.storage.create('PerfOwner', { name: 'o1' })
        // 成员 task（weight 60 > 50，score 20 > 10）
        const memberTask = await system.storage.create('PerfTask', { title: 'member', score: 20 })
        // 非成员 task（weight 10）
        const outsideTask = await system.storage.create('PerfTask', { title: 'outside', score: 40 })

        // ---- S1 enter-by-create：addRelation weight=60 ----
        probe.reset()
        await system.storage.addRelationByNameById('PerfOwner_tasks_owner_PerfTask', owner.id, memberTask.id, { weight: 60 })
        let snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(1)
        expect(snapshot.heavyCallbackCount).toBe(1)
        expect(snapshot.heavyScoreSum).toBe(20)
        expect(snapshot.heavyWeightSum).toBe(60)
        expect(snapshot.taskCount).toBe(1)
        expect(snapshot.taskScoreSum).toBe(20)
        // 探针灵敏度自检：本场景确实有增量执行被观察到（防止包装未生效的假绿）
        expect(probe.get('PerfOwner.heavyCount').incremental).toBeGreaterThan(0)
        expectIncrementalOnly(probe)

        // ---- S2 stay-out：非成员 link（weight=10）建立，filtered 聚合不变 ----
        probe.reset()
        await system.storage.addRelationByNameById('PerfOwner_tasks_owner_PerfTask', owner.id, outsideTask.id, { weight: 10 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(1)
        expect(snapshot.heavyScoreSum).toBe(20)
        expect(snapshot.heavyWeightSum).toBe(60)
        expect(snapshot.taskCount).toBe(2)
        expect(snapshot.taskScoreSum).toBe(60)
        expectIncrementalOnly(probe)

        const memberLink = await system.storage.findOne('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'target.id', value: ['=', memberTask.id] }), undefined, ['id'])
        const outsideLink = await system.storage.findOne('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'target.id', value: ['=', outsideTask.id] }), undefined, ['id'])

        // ---- S3 stay-in link 字段更新：weight 60→70（仍是成员） ----
        probe.reset()
        await system.storage.update('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', memberLink.id] }), { weight: 70 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(1)
        expect(snapshot.heavyWeightSum).toBe(70)
        expect(snapshot.heavyScoreSum).toBe(20)
        expectIncrementalOnly(probe)

        // ---- S4 exit-by-update：weight 70→10（退出成员资格） ----
        probe.reset()
        await system.storage.update('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', memberLink.id] }), { weight: 10 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(0)
        expect(snapshot.heavyCallbackCount).toBe(0)
        expect(snapshot.heavyScoreSum).toBe(0)
        expect(snapshot.heavyWeightSum).toBe(0)
        expect(snapshot.taskCount).toBe(2)
        expectIncrementalOnly(probe)

        // ---- S5 enter-by-update：weight 10→60（重新进入，+1 恰好一次） ----
        probe.reset()
        await system.storage.update('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', memberLink.id] }), { weight: 60 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(1)
        expect(snapshot.heavyCallbackCount).toBe(1)
        expect(snapshot.heavyScoreSum).toBe(20)
        expect(snapshot.heavyWeightSum).toBe(60)
        expectIncrementalOnly(probe)

        // ---- S6 stay-out link 字段更新：非成员 weight 10→20（与谓词无交叉） ----
        probe.reset()
        await system.storage.update('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', outsideLink.id] }), { weight: 20 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(1)
        expect(snapshot.heavyWeightSum).toBe(60)
        expectIncrementalOnly(probe)

        // ---- S7 成员目标实体字段更新：score 20→30 ----
        probe.reset()
        await system.storage.update('PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', memberTask.id] }), { score: 30 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyScoreSum).toBe(30)
        expect(snapshot.heavyCallbackCount).toBe(1)
        expect(snapshot.taskScoreSum).toBe(70)
        expectIncrementalOnly(probe)

        // ---- S8 非成员目标实体字段更新：score 40→5（callback 阈值也变化） ----
        probe.reset()
        await system.storage.update('PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', outsideTask.id] }), { score: 5 })
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyScoreSum).toBe(30)
        expect(snapshot.taskScoreSum).toBe(35)
        expectIncrementalOnly(probe)

        // ---- S9 removeRelation（成员） ----
        probe.reset()
        await system.storage.removeRelationByName('PerfOwner_tasks_owner_PerfTask',
            MatchExp.atom({ key: 'id', value: ['=', memberLink.id] }))
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(0)
        expect(snapshot.heavyScoreSum).toBe(0)
        expect(snapshot.heavyWeightSum).toBe(0)
        expect(snapshot.taskCount).toBe(1)
        expectIncrementalOnly(probe)

        // ---- S10 目标实体删除（级联 link delete；先重建成员关系） ----
        await system.storage.addRelationByNameById('PerfOwner_tasks_owner_PerfTask', owner.id, memberTask.id, { weight: 80 })
        probe.reset()
        await system.storage.delete('PerfTask', MatchExp.atom({ key: 'id', value: ['=', memberTask.id] }))
        snapshot = await readOwner(system, owner.id)
        expect(snapshot.heavyCount).toBe(0)
        expect(snapshot.heavyScoreSum).toBe(0)
        expect(snapshot.heavyWeightSum).toBe(0)
        expect(snapshot.taskCount).toBe(1)
        expectIncrementalOnly(probe)

        // 探针灵敏度自检：事务观察面确实在工作
        expect(probe.transactions.length).toBeGreaterThan(0)

        await system.destroy()
    })

    test('endpoint-field predicate: membership crossing via target-entity update stays incremental', async () => {
        // filtered relation 谓词引用端点实体字段（matchExpression: target.score > 50）——
        // 成员资格变化由**实体 update** 而非 link 字段驱动，是 link 谓词形态的兄弟格。
        const ownerEntity = Entity.create({
            name: 'EpOwner',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const taskEntity = Entity.create({
            name: 'EpTask',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'score', type: 'number' })
            ]
        });
        const ownerTaskRelation = Relation.create({
            source: ownerEntity,
            sourceProperty: 'tasks',
            target: taskEntity,
            targetProperty: 'owner',
            type: 'n:n',
            properties: [Property.create({ name: 'weight', type: 'number' })]
        });
        const highScoreRelation = Relation.create({
            name: 'EpHighScoreLink',
            baseRelation: ownerTaskRelation,
            sourceProperty: 'highScoreTasks',
            targetProperty: 'highScoreOwners',
            matchExpression: MatchExp.atom({ key: 'target.score', value: ['>', 50] })
        });
        ownerEntity.properties.push(
            Property.create({
                name: 'highCount', type: 'number',
                computation: Count.create({ property: 'highScoreTasks' })
            }),
            Property.create({
                name: 'highScoreSum', type: 'number',
                computation: Summation.create({ property: 'highScoreTasks', attributeQuery: ['score'] })
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ownerEntity, taskEntity],
            relations: [ownerTaskRelation, highScoreRelation]
        });
        await controller.setup(true);
        const probe = attachPerfProbe(controller);

        const owner = await system.storage.create('EpOwner', { name: 'o1' })
        const task = await system.storage.create('EpTask', { title: 't1', score: 80 })

        const read = async () => await system.storage.findOne('EpOwner',
            MatchExp.atom({ key: 'id', value: ['=', owner.id] }), undefined,
            ['id', 'highCount', 'highScoreSum'])

        // enter-by-create（score 80 已满足谓词）
        probe.reset()
        await system.storage.addRelationByNameById('EpOwner_tasks_owner_EpTask', owner.id, task.id, { weight: 1 })
        let snapshot = await read()
        expect(snapshot.highCount).toBe(1)
        expect(snapshot.highScoreSum).toBe(80)
        expectIncrementalOnly(probe)

        // stay-in 端点字段更新：score 80→90
        probe.reset()
        await system.storage.update('EpTask', MatchExp.atom({ key: 'id', value: ['=', task.id] }), { score: 90 })
        snapshot = await read()
        expect(snapshot.highCount).toBe(1)
        expect(snapshot.highScoreSum).toBe(90)
        expectIncrementalOnly(probe)

        // exit-by-entity-update：score 90→10（跨越谓词，成员退出）
        probe.reset()
        await system.storage.update('EpTask', MatchExp.atom({ key: 'id', value: ['=', task.id] }), { score: 10 })
        snapshot = await read()
        expect(snapshot.highCount).toBe(0)
        expect(snapshot.highScoreSum).toBe(0)
        expectIncrementalOnly(probe)

        // enter-by-entity-update：score 10→60（重新进入，+1 恰好一次）
        probe.reset()
        await system.storage.update('EpTask', MatchExp.atom({ key: 'id', value: ['=', task.id] }), { score: 60 })
        snapshot = await read()
        expect(snapshot.highCount).toBe(1)
        expect(snapshot.highScoreSum).toBe(60)
        expectIncrementalOnly(probe)

        await system.destroy()
    })

    test('n:n link-attribute predicate: independent link table membership crossing stays incremental', async () => {
        // 第一个用例的 1:n 拓扑里 link 数据合并在 n 侧实体行上（in-row 写路径）；
        // n:n 拓扑 link 是独立表（separate-table 写路径）——同一守卫家族的兄弟格。
        const userEntity = Entity.create({
            name: 'NnUser',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const itemEntity = Entity.create({
            name: 'NnItem',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'score', type: 'number' })
            ]
        });
        const likeRelation = Relation.create({
            source: userEntity,
            sourceProperty: 'likedItems',
            target: itemEntity,
            targetProperty: 'likedBy',
            type: 'n:n',
            properties: [Property.create({ name: 'weight', type: 'number' })]
        });
        const strongLikeRelation = Relation.create({
            name: 'NnStrongLike',
            baseRelation: likeRelation,
            sourceProperty: 'stronglyLikedItems',
            targetProperty: 'stronglyLikedBy',
            matchExpression: MatchExp.atom({ key: 'weight', value: ['>', 50] })
        });
        userEntity.properties.push(
            Property.create({
                name: 'strongCount', type: 'number',
                computation: Count.create({ property: 'stronglyLikedItems' })
            }),
            Property.create({
                name: 'strongWeightSum', type: 'number',
                computation: Summation.create({ property: 'stronglyLikedItems', attributeQuery: [['&', { attributeQuery: ['weight'] }]] })
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [userEntity, itemEntity],
            relations: [likeRelation, strongLikeRelation]
        });
        await controller.setup(true);
        const probe = attachPerfProbe(controller);

        const user = await system.storage.create('NnUser', { name: 'u1' })
        const item = await system.storage.create('NnItem', { title: 'i1', score: 5 })

        const read = async () => await system.storage.findOne('NnUser',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', 'strongCount', 'strongWeightSum'])

        // enter-by-create
        probe.reset()
        await system.storage.addRelationByNameById('NnUser_likedItems_likedBy_NnItem', user.id, item.id, { weight: 60 })
        let snapshot = await read()
        expect(snapshot.strongCount).toBe(1)
        expect(snapshot.strongWeightSum).toBe(60)
        expectIncrementalOnly(probe)

        const link = await system.storage.findOne('NnUser_likedItems_likedBy_NnItem',
            MatchExp.atom({ key: 'target.id', value: ['=', item.id] }), undefined, ['id'])

        // stay-in link 字段更新
        probe.reset()
        await system.storage.update('NnUser_likedItems_likedBy_NnItem',
            MatchExp.atom({ key: 'id', value: ['=', link.id] }), { weight: 70 })
        snapshot = await read()
        expect(snapshot.strongCount).toBe(1)
        expect(snapshot.strongWeightSum).toBe(70)
        expectIncrementalOnly(probe)

        // exit-by-update
        probe.reset()
        await system.storage.update('NnUser_likedItems_likedBy_NnItem',
            MatchExp.atom({ key: 'id', value: ['=', link.id] }), { weight: 10 })
        snapshot = await read()
        expect(snapshot.strongCount).toBe(0)
        expect(snapshot.strongWeightSum).toBe(0)
        expectIncrementalOnly(probe)

        // enter-by-update（+1 恰好一次）
        probe.reset()
        await system.storage.update('NnUser_likedItems_likedBy_NnItem',
            MatchExp.atom({ key: 'id', value: ['=', link.id] }), { weight: 90 })
        snapshot = await read()
        expect(snapshot.strongCount).toBe(1)
        expect(snapshot.strongWeightSum).toBe(90)
        expectIncrementalOnly(probe)

        await system.destroy()
    })

    test('probe sensitivity: symmetric relation per-item aggregation is counted as full recompute', async () => {
        // 对称关系 × 逐项状态聚合按设计恒退全量（r17 F-3 守卫，correctness boundary）——
        // 用这个已知必然全量的形态验证 perfProbe 计数器确实能观察到全量执行与信封 reason，
        // 防止上面矩阵的 full=0 断言是包装未生效的假绿。
        const personEntity = Entity.create({
            name: 'SymPerson',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'score', type: 'number' })
            ]
        });
        const friendRelation = Relation.create({
            source: personEntity,
            sourceProperty: 'friends',
            target: personEntity,
            targetProperty: 'friends',
            type: 'n:n'
        });
        personEntity.properties.push(
            Property.create({
                name: 'friendScoreSum', type: 'number',
                computation: Summation.create({ property: 'friends', attributeQuery: ['score'] })
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [personEntity],
            relations: [friendRelation]
        });
        await controller.setup(true);
        const probe = attachPerfProbe(controller);

        const alice = await system.storage.create('SymPerson', { name: 'alice', score: 10 })
        const bob = await system.storage.create('SymPerson', { name: 'bob', score: 20 })

        probe.reset()
        await system.storage.addRelationByNameById('SymPerson_friends_friends_SymPerson', alice.id, bob.id, {})
        const snapshot = await system.storage.findOne('SymPerson',
            MatchExp.atom({ key: 'id', value: ['=', alice.id] }), undefined, ['id', 'friendScoreSum'])
        expect(snapshot.friendScoreSum).toBe(20)
        // 计数器必须观察到全量执行 + 对称守卫的 reason
        expect(probe.totalFull()).toBeGreaterThan(0)
        const reasons = probe.get('SymPerson.friendScoreSum').fullRecomputeReasons
        expect(reasons.some(reason => reason.includes('symmetric'))).toBe(true)

        await system.destroy()
    })

    test('filtered-entity endpoint: aggregation over relation targeting a filtered entity stays incremental', async () => {
        // 关联端点是 filtered entity（而非 filtered relation）——base 实体字段更新驱动
        // 成员资格变化，聚合源关系连接到视图实体。
        const groupEntity = Entity.create({
            name: 'FeGroup',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const memberEntity = Entity.create({
            name: 'FeMember',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'active', type: 'boolean' }),
                Property.create({ name: 'points', type: 'number' })
            ]
        });
        const activeMemberEntity = Entity.create({
            name: 'FeActiveMember',
            baseEntity: memberEntity,
            matchExpression: MatchExp.atom({ key: 'active', value: ['=', true] })
        });
        const groupActiveRelation = Relation.create({
            source: groupEntity,
            sourceProperty: 'activeMembers',
            target: activeMemberEntity,
            targetProperty: 'activeGroups',
            type: 'n:n'
        });
        groupEntity.properties.push(
            Property.create({
                name: 'activeCount', type: 'number',
                computation: Count.create({ property: 'activeMembers' })
            }),
            Property.create({
                name: 'activePointsSum', type: 'number',
                computation: Summation.create({ property: 'activeMembers', attributeQuery: ['points'] })
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [groupEntity, memberEntity, activeMemberEntity],
            relations: [groupActiveRelation]
        });
        await controller.setup(true);
        const probe = attachPerfProbe(controller);

        const group = await system.storage.create('FeGroup', { name: 'g1' })
        const member = await system.storage.create('FeMember', { name: 'm1', active: true, points: 30 })

        const read = async () => await system.storage.findOne('FeGroup',
            MatchExp.atom({ key: 'id', value: ['=', group.id] }), undefined,
            ['id', 'activeCount', 'activePointsSum'])

        // 建立与视图实体的关系
        probe.reset()
        await system.storage.addRelationByNameById('FeGroup_activeMembers_activeGroups_FeActiveMember', group.id, member.id, {})
        let snapshot = await read()
        expect(snapshot.activeCount).toBe(1)
        expect(snapshot.activePointsSum).toBe(30)
        expectIncrementalOnly(probe)

        // 成员字段更新（不跨越谓词）
        probe.reset()
        await system.storage.update('FeMember', MatchExp.atom({ key: 'id', value: ['=', member.id] }), { points: 45 })
        snapshot = await read()
        expect(snapshot.activePointsSum).toBe(45)
        expectIncrementalOnly(probe)

        await system.destroy()
    })
})
