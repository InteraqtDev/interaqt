/**
 * r27 深度 review 修复回归（runtime 面）。
 *
 * F-1（runtime 轨）：reliance 1:1 自动 combined 的拓扑经 Controller 即可触达——
 *  同一逻辑声明在 merged 拓扑下工作、combined 拓扑下静默丢失，用户完全无从感知。
 * F-2：同一计算的多个 property dataDeps 各注册监听，一次变更命中 N 个 dep 时
 *  同一事件跑 N 次（useLastValue 增量双叠加、create 初始计算双跑）。
 *  两次调用收到同一事件对象，用户层无从去重，必须由框架合并。
 * I-1：BoolExpressionData.create({ left })（单边包装，声明期明确合法）此前在求值时
 *  抛 "missing the right operand"——带此 Conditions 的 Interaction 每次 dispatch 都以
 *  内部错误失败。修复为左透传（and/or 幺元语义），De Morgan 取反随左子树正常传播。
 * I-2：聚合计算 record 与 property 同给时运行期静默偏好 property（record 被忽略，
 *  错误数字零告警）。声明期 XOR 拒绝。
 * I-4：StateTransfer.clone(deep) 共享 trigger 引用（改克隆的 trigger 会隔空篡改原状态机）。
 */
import { describe, expect, test } from "vitest";
import {
    Entity, Property, Relation, KlassByName, Custom,
    Count, Every, Any, Summation, Average, WeightedSummation,
    BoolExpressionData, BoolAtomData, BoolExp,
    StateNode, StateTransfer,
} from '@core';
import { Controller, MonoSystem } from '@runtime';
import { MatchExp } from '@storage';
import { PGLiteDB } from '@drivers';
import { Interaction, Action, Condition, Conditions } from '../../src/builtins/index.js';

async function waitForListeners() { await new Promise(r => setTimeout(r, 50)); }

describe('r27 F-1 — reliance-combined child nested relations fail fast (runtime track)', () => {
    test('create with nested relation under reliance-combined child throws instead of silently dropping links', async () => {
        const User = Entity.create({ name: 'R27User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const Profile = Entity.create({ name: 'R27Profile', properties: [Property.create({ name: 'title', type: 'string' })] });
        const Team = Entity.create({ name: 'R27Team', properties: [Property.create({ name: 'teamName', type: 'string' })] });
        const owns = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1', isTargetReliance: true // 自动三表合一
        });
        const membership = Relation.create({
            source: Profile, sourceProperty: 'teams', target: Team, targetProperty: 'profiles', type: 'n:n'
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User, Profile, Team], relations: [owns, membership] });
        await controller.setup(true);

        const team = await system.storage.create('R27Team', { teamName: 't1' });
        await expect(system.storage.create('R27User', { name: 'u1', profile: { title: 'p1', teams: [{ id: team.id }] } }))
            .rejects.toThrowError(/combined.*teams/s);

        // 两步写法（错误信息给出的 workaround）完整工作：先建 Profile（自己处理关系），再 ref 装配。
        const p = await system.storage.create('R27Profile', { title: 'p1', teams: [{ id: team.id }] });
        await system.storage.create('R27User', { name: 'u1', profile: { id: p.id } });
        await waitForListeners();
        const profiles = await system.storage.find('R27Profile', undefined, undefined,
            ['title', ['teams', { attributeQuery: ['teamName'] }], ['owner', { attributeQuery: ['name'] }]]);
        expect(profiles).toHaveLength(1);
        expect(profiles[0].teams).toHaveLength(1);
        expect(profiles[0].owner?.name).toBe('u1');
        await system.destroy();
    });
});

describe('r27 F-2 — multiple property dataDeps coalesce to one run per mutation event', () => {
    test('single update touching two property deps runs incrementalCompute once (was: twice, double-applied)', async () => {
        let incrementalCalls = 0;
        const User = Entity.create({
            name: 'R27DedupUser',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
                Property.create({ name: 'bonus', type: 'number' }),
                Property.create({
                    name: 'changeCount',
                    type: 'number',
                    computation: Custom.create({
                        name: 'R27ChangeCount',
                        dataDeps: {
                            scoreDep: { type: 'property', attributeQuery: ['score'] },
                            bonusDep: { type: 'property', attributeQuery: ['bonus'] },
                        },
                        getInitialValue: () => 0,
                        useLastValue: true,
                        incrementalCompute: async function (lastValue: any) {
                            incrementalCalls++;
                            return (lastValue ?? 0) + 1;
                        },
                        incrementalDataDeps: [],
                    })
                })
            ]
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [], dict: [] });
        await controller.setup(true);

        const u = await system.storage.create('R27DedupUser', { score: 1, bonus: 1 });
        await waitForListeners();
        const afterCreate = incrementalCalls;

        // 一次 update 同时命中两个 dep：一次逻辑变更 = 一次增量
        await system.storage.update('R27DedupUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { score: 2, bonus: 2 });
        await waitForListeners();
        expect(incrementalCalls - afterCreate).toBe(1);
        const rec1 = await system.storage.findOne('R27DedupUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), undefined, ['*']);

        // 对照：只命中一个 dep 的 update 照常触发一次
        await system.storage.update('R27DedupUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { score: 3 });
        await waitForListeners();
        const rec2 = await system.storage.findOne('R27DedupUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), undefined, ['*']);
        expect(rec2.changeCount - rec1.changeCount).toBe(1);
        await system.destroy();
    });

    test('single create with two property deps runs the initial compute once (was: twice)', async () => {
        let computeCalls = 0;
        const User = Entity.create({
            name: 'R27CreateDedupUser',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
                Property.create({ name: 'bonus', type: 'number' }),
                Property.create({
                    name: 'total',
                    type: 'number',
                    computation: Custom.create({
                        name: 'R27Total',
                        dataDeps: {
                            scoreDep: { type: 'property', attributeQuery: ['score'] },
                            bonusDep: { type: 'property', attributeQuery: ['bonus'] },
                        },
                        compute: async function (_deps: any, record: any) {
                            computeCalls++;
                            return (record?.score ?? 0) + (record?.bonus ?? 0);
                        },
                    })
                })
            ]
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [] });
        await controller.setup(true);

        await system.storage.create('R27CreateDedupUser', { score: 1, bonus: 2 });
        await waitForListeners();
        expect(computeCalls).toBe(1);
        const rec = await system.storage.findOne('R27CreateDedupUser', undefined, undefined, ['*']);
        expect(rec.total).toBe(3);
        await system.destroy();
    });

    test('deps on different related paths still run independently (no over-dedupe)', async () => {
        let calls = 0;
        const Team = Entity.create({ name: 'R27PathTeam', properties: [Property.create({ name: 'label', type: 'string' })] });
        const User = Entity.create({
            name: 'R27PathUser',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({
                    name: 'probe',
                    type: 'number',
                    computation: Custom.create({
                        name: 'R27PathProbe',
                        dataDeps: {
                            own: { type: 'property', attributeQuery: ['name'] },
                            team: { type: 'property', attributeQuery: [['team', { attributeQuery: ['label'] }]] },
                        },
                        getInitialValue: () => 0,
                        useLastValue: true,
                        incrementalCompute: async function (lastValue: any) {
                            calls++;
                            return (lastValue ?? 0) + 1;
                        },
                        incrementalDataDeps: [],
                    })
                })
            ]
        });
        const rel = Relation.create({ source: User, sourceProperty: 'team', target: Team, targetProperty: 'members', type: 'n:1' });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Team, User], relations: [rel] });
        await controller.setup(true);

        const team = await system.storage.create('R27PathTeam', { label: 'a' });
        const u = await system.storage.create('R27PathUser', { name: 'u1', team: { id: team.id } });
        await waitForListeners();
        const base = calls;

        // 自身字段更新 → own dep 触发一次
        await system.storage.update('R27PathUser', MatchExp.atom({ key: 'id', value: ['=', u.id] }), { name: 'u2' });
        await waitForListeners();
        expect(calls - base).toBe(1);

        // 关联实体字段更新 → team dep（不同 targetPath）触发一次
        await system.storage.update('R27PathTeam', MatchExp.atom({ key: 'id', value: ['=', team.id] }), { label: 'b' });
        await waitForListeners();
        expect(calls - base).toBe(2);
        await system.destroy();
    });
});

describe('r27 I-1 — single-sided and/or BoolExpression evaluates as its left operand', () => {
    test('Interaction with single-sided and Conditions dispatches by guard semantics (was: internal error on every dispatch)', async () => {
        const User = Entity.create({ name: 'R27CondUser', properties: [Property.create({ name: 'isAdmin', type: 'boolean' })] });
        const adminOnly = Condition.create({ name: 'adminOnly', content: async function (event: any) { return event.user.isAdmin === true; } });
        const atom = BoolAtomData.create({ data: adminOnly as any });
        const doThing = Interaction.create({
            name: 'R27DoThing',
            action: Action.create({ name: 'r27act' }),
            conditions: Conditions.create({
                // 单边包装：create({ left }) 默认 operator 'and'、无 right —— r26 明确的合法声明形态
                content: BoolExpressionData.create({ left: atom }),
            }) as any,
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [], eventSources: [doThing] });
        await controller.setup(true);
        const admin = await system.storage.create('R27CondUser', { isAdmin: true });
        const guest = await system.storage.create('R27CondUser', { isAdmin: false });

        const ok = await controller.dispatch(doThing, { user: { id: admin.id, isAdmin: true } });
        expect(ok.error).toBeUndefined();

        // fail-closed 方向保留：条件不满足时是守卫错误而不是内部错误
        const denied = await controller.dispatch(doThing, { user: { id: guest.id, isAdmin: false } });
        expect(denied.error).toBeTruthy();
        expect(String((denied.error as any)?.message ?? denied.error)).toMatch(/Condition check failed/);
        await system.destroy();
    });

    test('BoolExp evaluate/evaluateAsync/map treat missing right as left passthrough, with De Morgan inversion intact', async () => {
        const singleAnd = new BoolExp<{ pass: boolean }>({
            type: 'expression', operator: 'and',
            left: { type: 'atom', data: { pass: true } },
        } as any);
        expect(singleAnd.evaluate(atom => atom.pass)).toBe(true);
        expect(await singleAnd.evaluateAsync(async atom => atom.pass)).toBe(true);
        expect(singleAnd.map(a => a.data).evaluate((atom: any) => atom.pass)).toBe(true);

        // NOT(single-and(A)) ≡ NOT A
        const negated = singleAnd.not();
        expect(negated.evaluate(atom => atom.pass)).not.toBe(true);

        const singleOrFalse = new BoolExp<{ pass: boolean }>({
            type: 'expression', operator: 'or',
            left: { type: 'atom', data: { pass: false } },
        } as any);
        expect(singleOrFalse.evaluate(atom => atom.pass)).not.toBe(true);
        expect(singleOrFalse.not().evaluate(atom => atom.pass)).toBe(true);
    });

    test('single-sided and inside a storage match compiles as its left atom (was: TypeError in SQL builder)', async () => {
        const User = Entity.create({ name: 'R27MatchUser', properties: [Property.create({ name: 'name', type: 'string' })] });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [] });
        await controller.setup(true);
        await system.storage.create('R27MatchUser', { name: 'alice' });
        await system.storage.create('R27MatchUser', { name: 'bob' });

        const singleSided = new BoolExp<any>({
            type: 'expression', operator: 'and',
            left: { type: 'atom', data: { key: 'name', value: ['=', 'alice'] } },
        } as any);
        const found = await system.storage.find('R27MatchUser', singleSided, undefined, ['name']);
        expect(found.map((r: any) => r.name)).toEqual(['alice']);
        await system.destroy();
    });
});

describe('r27 I-2 — aggregations reject record + property both set (was: record silently ignored)', () => {
    const Source = Entity.create({ name: 'R27AggSource', properties: [Property.create({ name: 'v', type: 'number' })] });
    const Host = Entity.create({ name: 'R27AggHost', properties: [Property.create({ name: 'name', type: 'string' })] });
    const rel = Relation.create({ source: Host, sourceProperty: 'items', target: Source, targetProperty: 'owner', type: '1:n' });

    test.each([
        ['Count', () => Count.create({ record: rel as any, property: 'items' })],
        ['Every', () => Every.create({ record: rel as any, property: 'items', callback: () => true })],
        ['Any', () => Any.create({ record: rel as any, property: 'items', callback: () => true })],
        ['Summation', () => Summation.create({ record: rel as any, property: 'items', attributeQuery: ['v'] })],
        ['Average', () => Average.create({ record: rel as any, property: 'items', attributeQuery: ['v'] })],
        ['WeightedSummation', () => WeightedSummation.create({ record: rel as any, property: 'items', callback: () => ({ weight: 1, value: 1 }) })],
    ])('%s.create rejects both record and property', (_name, create) => {
        expect(create).toThrowError(/mutually exclusive/);
    });

    test('single-target declarations stay legal', () => {
        expect(() => Count.create({ record: Source as any })).not.toThrow();
        expect(() => Count.create({ property: 'items' })).not.toThrow();
    });
});

describe('r27 I-4 — StateTransfer.clone(deep) isolates trigger', () => {
    test('mutating a deep-cloned transfer trigger does not leak into the original', () => {
        const a = StateNode.create({ name: 'r27a' });
        const b = StateNode.create({ name: 'r27b' });
        const original = StateTransfer.create({
            trigger: { recordName: 'X', type: 'create', record: { interactionName: 'Good' } } as any,
            current: a, next: b,
        });
        const deep = StateTransfer.clone(original, true);
        expect(deep.trigger).not.toBe(original.trigger);
        (deep.trigger.record as any).interactionName = 'Evil';
        expect((original.trigger.record as any).interactionName).toBe('Good');
        // 节点身份共享（必须与所属 StateMachine.states 同一实例）；浅 clone 语义不变
        expect(deep.current).toBe(a);
        const shallow = StateTransfer.clone(original, false);
        expect(shallow.trigger).toBe(original.trigger);
    });
});
