/**
 * 对称关系 × 聚合矩阵（r17 复盘落地项，盲区 3：交叉格必须成积）。
 *
 * 背景：r17 F-3 暴露「对称关系」与「带逐项状态的聚合」两个维度各自有测试、
 * 交叉格为空——而六种聚合中五种（Summation/Average/Every/Any/WeightedSummation）
 * 无论有无 callback 都持有以 link 行为 key 的逐项状态，全部落在碰撞半径内。
 * 本矩阵把全部六种聚合放到同一个对称关系上，用「与朴素全量重算对照」的预言机
 * 覆盖完整操作序列：建边（双向都建）、改端点字段、改关系(&)字段、删边、删实体。
 * 每步之后对**所有**宿主断言**所有**聚合值。
 *
 * 另含 2 跳对称路径（friends.friends）收敛回归——F-3 × F-4 的组合曾使删边
 * 直接崩溃（count became negative + 事务回滚）。
 */
import { describe, expect, test } from "vitest";
import {
    Entity, Property, Relation,
    Count, Summation, Average, Every, Any, WeightedSummation,
    KlassByName, MonoSystem, Controller, MatchExp
} from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('symmetric relation x aggregation matrix', () => {

    test('all six aggregations stay consistent with naive recomputation through add/update/&-update/remove/delete', async () => {
        const User = Entity.create({
            name: 'U',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'active', type: 'boolean' }),
                Property.create({ name: 'score', type: 'number' })
            ]
        });
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            type: 'n:n',
            properties: [Property.create({ name: 'weight', type: 'number' })]
        });
        User.properties.push(
            // Count 无 callback（存在性路径，历史健康格，防回归）
            Property.create({
                name: 'friendCount', type: 'number',
                computation: Count.create({ property: 'friends' }) as any
            }),
            // Count 带 callback（r17 F-3 崩溃格）
            Property.create({
                name: 'activeFriendCount', type: 'number',
                computation: Count.create({
                    property: 'friends',
                    attributeQuery: ['active'],
                    callback: (f: any) => !!f.active
                }) as any
            }),
            // Summation（无 callback 但有逐项状态——碰撞半径内）
            Property.create({
                name: 'friendScoreSum', type: 'number',
                computation: Summation.create({ property: 'friends', attributeQuery: ['score'] }) as any
            }),
            // Average
            Property.create({
                name: 'friendScoreAvg', type: 'number',
                computation: Average.create({ property: 'friends', attributeQuery: ['score'] }) as any
            }),
            // Every（requireCallback）
            Property.create({
                name: 'allFriendsActive', type: 'boolean',
                computation: Every.create({
                    property: 'friends',
                    attributeQuery: ['active'],
                    callback: (f: any) => !!f.active,
                    notEmpty: true
                }) as any
            }),
            // Any（requireCallback）
            Property.create({
                name: 'anyFriendActive', type: 'boolean',
                computation: Any.create({
                    property: 'friends',
                    attributeQuery: ['active'],
                    callback: (f: any) => !!f.active
                }) as any
            }),
            // WeightedSummation（callback 读端点字段 + & 关系字段）
            Property.create({
                name: 'weightedFriendScore', type: 'number',
                computation: WeightedSummation.create({
                    property: 'friends',
                    attributeQuery: ['score', ['&', { attributeQuery: ['weight'] }]],
                    callback: (f: any) => ({ weight: f?.['&']?.weight ?? 1, value: f?.score ?? 0 })
                }) as any
            })
        );

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [friends] });
        await controller.setup(true);
        const storage = system.storage;

        // 朴素预言机：从当前 DB 重查每个用户的朋友（含 & weight），用测试自身的 JS 重算全部聚合。
        async function assertAllUsersConsistent(label: string) {
            const users = await storage.find('U', undefined, undefined,
                ['name', 'active', 'score', 'friendCount', 'activeFriendCount', 'friendScoreSum', 'friendScoreAvg', 'allFriendsActive', 'anyFriendActive', 'weightedFriendScore',
                    ['friends', { attributeQuery: ['name', 'active', 'score', ['&', { attributeQuery: ['weight'] }]] }]]);
            for (const user of users) {
                const fs: any[] = user.friends || [];
                const expected = {
                    friendCount: fs.length,
                    activeFriendCount: fs.filter(f => !!f.active).length,
                    friendScoreSum: fs.reduce((acc, f) => acc + (Number.isFinite(f.score) ? f.score : 0), 0),
                    friendScoreAvg: fs.length ? fs.reduce((acc, f) => acc + (Number.isFinite(f.score) ? f.score : 0), 0) / fs.length : 0,
                    allFriendsActive: fs.length === 0 ? false : fs.every(f => !!f.active),
                    anyFriendActive: fs.some(f => !!f.active),
                    weightedFriendScore: fs.reduce((acc, f) => acc + (f['&']?.weight ?? 1) * (f.score ?? 0), 0)
                };
                for (const [prop, expectedValue] of Object.entries(expected)) {
                    expect(user[prop], `${label}: ${user.name}.${prop} (friends=${JSON.stringify(fs.map(f => f.name))})`).toBe(expectedValue);
                }
            }
        }

        const a = await storage.create('U', { name: 'A', active: true, score: 10 });
        const b = await storage.create('U', { name: 'B', active: true, score: 20 });
        const c = await storage.create('U', { name: 'C', active: false, score: 30 });
        await assertAllUsersConsistent('after creates');

        // 1. 建边：A—B（A 在 source 侧）、C—A（A 在 target 侧）——两个方向都要在两端计入
        await storage.addRelationByNameById(friends.name!, a.id, b.id, { weight: 2 });
        await assertAllUsersConsistent('after add A-B');
        await storage.addRelationByNameById(friends.name!, c.id, a.id, { weight: 3 });
        await assertAllUsersConsistent('after add C-A');

        // 2. 改端点字段：B 变 inactive、改 score——A 的聚合要跟；B 自身的聚合不受影响
        await storage.update('U', MatchExp.atom({ key: 'id', value: ['=', b.id] }), { active: false, score: 25 });
        await assertAllUsersConsistent('after update B fields');

        // 3. 改关系（&）字段：直接更新关系记录
        const abLink = (await storage.findRelationByName(friends.name!, undefined, undefined,
            ['id', 'weight', ['source', { attributeQuery: ['name'] }], ['target', { attributeQuery: ['name'] }]]))
            .find((l: any) => [l.source.name, l.target.name].sort().join() === 'A,B');
        await storage.updateRelationByName(friends.name!, MatchExp.atom({ key: 'id', value: ['=', abLink!.id] }), { weight: 9 });
        await assertAllUsersConsistent('after update A-B weight');

        // 4. 删边：C—A（A 在 target 侧的边）——两端都要减，且不允许负数崩溃
        const caLink = (await storage.findRelationByName(friends.name!, undefined, undefined,
            ['id', ['source', { attributeQuery: ['name'] }], ['target', { attributeQuery: ['name'] }]]))
            .find((l: any) => [l.source.name, l.target.name].sort().join() === 'A,C');
        await storage.removeRelationByName(friends.name!, MatchExp.atom({ key: 'id', value: ['=', caLink!.id] }));
        await assertAllUsersConsistent('after remove C-A');

        // 5. 删实体：B 消失，B 的边级联删除，A 的聚合回到空集语义
        await storage.delete('U', MatchExp.atom({ key: 'id', value: ['=', b.id] }));
        await assertAllUsersConsistent('after delete B');

        // 6. 空集语义抽查（A 现在没有朋友）
        const aFinal = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['*']);
        expect(aFinal.friendCount).toBe(0);
        expect(aFinal.allFriendsActive).toBe(false);   // notEmpty: true → 空集为 false
        expect(aFinal.anyFriendActive).toBe(false);
        expect(aFinal.friendScoreAvg).toBe(0);
    });

    test('2-hop symmetric path aggregation converges through edge add/remove (F-3 x F-4 combination)', async () => {
        const User = Entity.create({
            name: 'U2',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            type: 'n:n',
        });
        User.properties.push(Property.create({
            name: 'fofCount',
            type: 'number',
            computation: Count.create({
                property: 'friends',
                attributeQuery: [['friends', { attributeQuery: ['id'] }]],
                callback: (friend: any) => (friend.friends || []).length > 0
            }) as any
        }));

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [friends] });
        await controller.setup(true);
        const storage = system.storage;

        async function assertFofConsistent(label: string) {
            const users = await storage.find('U2', undefined, undefined,
                ['name', 'fofCount', ['friends', { attributeQuery: ['name', ['friends', { attributeQuery: ['id'] }]] }]]);
            for (const user of users) {
                const expected = (user.friends || []).filter((f: any) => (f.friends || []).length > 0).length;
                expect(user.fofCount, `${label}: ${user.name}.fofCount`).toBe(expected);
            }
        }

        const a = await storage.create('U2', { name: 'A' });
        const b = await storage.create('U2', { name: 'B' });
        const c = await storage.create('U2', { name: 'C' });

        await storage.addRelationByNameById(friends.name!, a.id, b.id, {});
        await assertFofConsistent('after add A-B');
        await storage.addRelationByNameById(friends.name!, b.id, c.id, {});
        await assertFofConsistent('after add B-C');

        // 删中间边 B-C：曾经的 F-3×F-4 组合崩溃点（count became negative + 事务回滚）
        const links = await storage.findRelationByName(friends.name!, undefined, undefined,
            ['id', ['source', { attributeQuery: ['name'] }], ['target', { attributeQuery: ['name'] }]]);
        const bcLink = links.find((l: any) => [l.source.name, l.target.name].sort().join() === 'B,C');
        await storage.removeRelationByName(friends.name!, MatchExp.atom({ key: 'id', value: ['=', bcLink!.id] }));
        await assertFofConsistent('after remove B-C');

        const abLink = links.find((l: any) => [l.source.name, l.target.name].sort().join() === 'A,B');
        await storage.removeRelationByName(friends.name!, MatchExp.atom({ key: 'id', value: ['=', abLink!.id] }));
        await assertFofConsistent('after remove A-B');

        const aRow = await storage.findOne('U2', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['*']);
        expect(aRow.fofCount).toBe(0);
    });
});
