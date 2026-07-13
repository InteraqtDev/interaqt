/**
 * 第十三轮深度 review 修复回归（2026-07-10）
 *
 * F-1 守卫回调严格 boolean 契约：非 boolean 返回值（含 not() 组合下 fail-open 的 null/0/''）一律拒绝
 * F-2 applyResult 对 undefined 统一 skip：compute/incrementalCompute 漏写 return 不再抹掉 dict 值 / property 列
 * F-3 Transform 回调返回顶层 id → fail-fast（此前静默写入外部 id，与派生实体自己的发号序列冲突产生重复 id）
 * R-1 storage.set(concept, key, undefined) 归一为 null（此前存入字面量 "undefined"，读回必炸）
 * R-2 global 聚合缺 record → 声明期明确错误（此前 createStates 处裸 TypeError）
 * R-5 StateMachine trigger 的 null pattern 精确匹配（此前 null 匹配任何值，声明了 null 约束的转移被静默误触发）
 */
import { describe, expect, test } from "vitest";
import {
    Action,
    BoolExp,
    Condition,
    Conditions,
    Controller,
    Custom,
    Dictionary,
    Entity,
    Interaction,
    MatchExp,
    MonoSystem,
    Property,
    StateMachine,
    StateNode,
    StateTransfer,
    Summation,
    Transform,
} from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';

describe('r13 review fixes', () => {
    // ============ F-1 守卫严格 boolean 契约 ============
    test('F-1: not(condition returning null) is rejected (fail-closed), boolean still works', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const returnsNull = Condition.create({
            name: 'returnsNull',
            // 典型形态：短路表达式产出 null（如 user.profile && user.profile.isBanned）
            content: async () => null as any,
        });
        const NotNullGuarded = Interaction.create({
            name: 'NotNullGuarded',
            action: Action.create({ name: 'doA' }),
            conditions: Conditions.create({ content: BoolExp.atom(returnsNull).not() }) as any,
        });

        const returnsFalse = Condition.create({
            name: 'returnsFalse',
            content: async () => false,
        });
        const NotFalseGuarded = Interaction.create({
            name: 'NotFalseGuarded',
            action: Action.create({ name: 'doB' }),
            conditions: Conditions.create({ content: BoolExp.atom(returnsFalse).not() }) as any,
        });

        const returnsTruthyString = Condition.create({
            name: 'returnsTruthyString',
            content: async () => 'admin' as any,
        });
        const TruthyGuarded = Interaction.create({
            name: 'TruthyGuarded',
            action: Action.create({ name: 'doC' }),
            conditions: Conditions.create({ content: BoolExp.atom(returnsTruthyString) }) as any,
        });

        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system, entities: [User], relations: [],
            eventSources: [NotNullGuarded, NotFalseGuarded, TruthyGuarded]
        });
        await controller.setup(true);
        const user = await system.storage.create('User', { name: 'u' });

        // not(null)：修复前 fail-open 放行，现在 fail-closed 拒绝
        const nullResult = await controller.dispatch(NotNullGuarded, { user });
        expect(nullResult.error).toBeTruthy();

        // not(false) = true：合法 boolean 契约正常放行
        const falseResult = await controller.dispatch(NotFalseGuarded, { user });
        expect(falseResult.error).toBeUndefined();

        // truthy 非 boolean（'admin'）：同样拒绝（r9-I-4 的 truthy 放行一并收口）
        const truthyResult = await controller.dispatch(TruthyGuarded, { user });
        expect(truthyResult.error).toBeTruthy();
        await system.destroy();
    });

    // ============ F-2 applyResult undefined 统一 skip ============
    test('F-2: incrementalCompute returning undefined keeps global dict and property values', async () => {
        const Item = Entity.create({
            name: 'R13Item',
            properties: [
                Property.create({ name: 'n', type: 'number' }),
                Property.create({
                    name: 'derived',
                    type: 'number',
                    computation: Custom.create({
                        name: 'R13PropTrap',
                        dataDeps: { _current: { type: 'property', attributeQuery: ['n'] } },
                        incrementalDataDeps: [],
                        compute: async function () { return 42; },
                        incrementalCompute: async function () { /* 漏写 return */ },
                        getInitialValue: () => 7,
                    } as any)
                })
            ]
        });
        const dict = Dictionary.create({
            name: 'r13TrapDict',
            type: 'number',
            collection: false,
            computation: Custom.create({
                name: 'R13GlobalTrap',
                dataDeps: { items: { type: 'records', source: Item, attributeQuery: ['n'] } },
                incrementalDataDeps: [],
                compute: async function (deps: any) { return (deps.items || []).length; },
                incrementalCompute: async function () { /* 漏写 return */ },
                getInitialValue: () => 99,
            } as any),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system, entities: [Item], relations: [], eventSources: [], dict: [dict]
        });
        await controller.setup(true);
        expect(await system.storage.dict.get('r13TrapDict')).toBe(99);

        const item = await system.storage.create('R13Item', { n: 1 });
        // dict：修复前被写成 undefined（{raw:undefined} → 读回 undefined），现在保持 99
        expect(await system.storage.dict.get('r13TrapDict')).toBe(99);

        // property：初始值 7 不被 create 后的增量 undefined 抹掉
        const created = await system.storage.findOne('R13Item', MatchExp.atom({ key: 'id', value: ['=', item.id] }), undefined, ['*']);
        expect(created.derived).toBe(7);

        await system.storage.update('R13Item', MatchExp.atom({ key: 'id', value: ['=', item.id] }), { n: 2 });
        const updated = await system.storage.findOne('R13Item', MatchExp.atom({ key: 'id', value: ['=', item.id] }), undefined, ['*']);
        // 修复前 update 触发的增量 undefined 把列写成 NULL
        expect(updated.derived).toBe(7);
        await system.destroy();
    });

    test('F-2: incrementalCompute returning explicit null still writes null (value domain preserved)', async () => {
        const Doc = Entity.create({
            name: 'R13NullDoc',
            properties: [Property.create({ name: 'n', type: 'number' })]
        });
        const dict = Dictionary.create({
            name: 'r13NullableDict',
            type: 'number',
            collection: false,
            computation: Custom.create({
                name: 'R13NullableGlobal',
                dataDeps: { items: { type: 'records', source: Doc, attributeQuery: ['n'] } },
                incrementalDataDeps: [],
                compute: async function (deps: any) { return (deps.items || []).length; },
                incrementalCompute: async function () { return null; },
                getInitialValue: () => 5,
            } as any),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system, entities: [Doc], relations: [], eventSources: [], dict: [dict]
        });
        await controller.setup(true);
        expect(await system.storage.dict.get('r13NullableDict')).toBe(5);
        await system.storage.create('R13NullDoc', { n: 1 });
        expect(await system.storage.dict.get('r13NullableDict')).toBe(null);
        await system.destroy();
    });

    // ============ F-3 Transform 回调返回 id fail-fast ============
    test('F-3: Transform callback returning a top-level id fails fast with guidance', async () => {
        const Order = Entity.create({
            name: 'R13Order',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const Archived = Entity.create({
            name: 'R13Archived',
            properties: [Property.create({ name: 'title', type: 'string' })],
            computation: Transform.create({
                record: Order,
                attributeQuery: ['*'],
                // 自然写法陷阱：展开源记录会携带 id
                callback: (order: any) => ({ ...order }),
            })
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system, entities: [Order, Archived], relations: [], eventSources: [],
            forceThrowDispatchError: true
        });
        await controller.setup(true);
        await expect(system.storage.create('R13Order', { title: 'x' }))
            .rejects.toThrow(/top-level "id" field/);
        // 派生表未被污染
        const archived = await system.storage.find('R13Archived', undefined, undefined, ['*']);
        expect(archived.length).toBe(0);
        await system.destroy();
    });

    test('F-3: Transform callback stripping id keeps working (positive control)', async () => {
        const Order = Entity.create({
            name: 'R13Order2',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const Archived = Entity.create({
            name: 'R13Archived2',
            properties: [Property.create({ name: 'title', type: 'string' })],
            computation: Transform.create({
                record: Order,
                attributeQuery: ['*'],
                callback: ({ id: _id, ...rest }: any) => ({ ...rest }),
            })
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system, entities: [Order, Archived], relations: [], eventSources: []
        });
        await controller.setup(true);
        const o = await system.storage.create('R13Order2', { title: 'ok' });
        const archived = await system.storage.find('R13Archived2', undefined, undefined, ['*']);
        expect(archived.length).toBe(1);
        expect(archived[0].title).toBe('ok');
        expect(String(archived[0].id)).not.toBe(String(o.id));
        await system.destroy();
    });

    // ============ R-1 storage.set undefined 归一 ============
    test('R-1: storage.set with undefined round-trips as null instead of corrupting the key', async () => {
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [], relations: [], eventSources: [] });
        await controller.setup(true);
        await system.storage.set('r13Concept', 'k1', undefined);
        expect(await system.storage.get('r13Concept', 'k1')).toBe(null);
        // 二次覆盖写（update 分支）同样安全
        await system.storage.set('r13Concept', 'k1', { a: 1 });
        expect(await system.storage.get('r13Concept', 'k1')).toEqual({ a: 1 });
        await system.storage.set('r13Concept', 'k1', undefined);
        expect(await system.storage.get('r13Concept', 'k1')).toBe(null);
        await system.destroy();
    });

    // ============ R-2 global 聚合缺 record 声明期错误 ============
    test('R-2: global Summation without record fails at declaration time, not a bare TypeError', async () => {
        // r26 遗留收口：record/property 缺失的错误从 Controller 构造期（r13）继续前移到
        // Summation.create()（统一声明期校验）。
        expect(() => Summation.create({ attributeQuery: ['value'] } as any))
            .toThrow(/requires either "record".*or "property"/s);
    });

    // ============ R-5 StateMachine trigger null pattern 精确匹配 ============
    test('R-5: trigger record pattern with null only matches null values', async () => {
        const pendingState = StateNode.create({ name: 'pending' });
        const clearedState = StateNode.create({ name: 'cleared' });
        const Doc = Entity.create({
            name: 'R13SMDoc',
            properties: [
                Property.create({ name: 'flag', type: 'string' }),
                Property.create({
                    name: 'status',
                    type: 'string',
                    computation: StateMachine.create({
                        states: [pendingState, clearedState],
                        initialState: pendingState,
                        transfers: [
                            StateTransfer.create({
                                current: pendingState,
                                next: clearedState,
                                trigger: {
                                    recordName: 'R13SMDoc',
                                    type: 'update',
                                    record: { flag: null }
                                },
                                computeTarget: (event: any) => ({ id: event.record.id })
                            })
                        ]
                    })
                })
            ]
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system, entities: [Doc], relations: [], eventSources: []
        });
        await controller.setup(true);
        const doc = await system.storage.create('R13SMDoc', { flag: 'set' });

        // flag 改成非 null：修复前 null pattern 匹配任何值 → 被误触发
        await system.storage.update('R13SMDoc', MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { flag: 'other' });
        let current = await system.storage.findOne('R13SMDoc', MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['*']);
        expect(current.status).toBe('pending');

        // flag 改成 null：精确命中，转移触发
        await system.storage.update('R13SMDoc', MatchExp.atom({ key: 'id', value: ['=', doc.id] }), { flag: null });
        current = await system.storage.findOne('R13SMDoc', MatchExp.atom({ key: 'id', value: ['=', doc.id] }), undefined, ['*']);
        expect(current.status).toBe('cleared');
        await system.destroy();
    });
});
