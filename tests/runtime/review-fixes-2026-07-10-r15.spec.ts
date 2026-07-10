import { describe, expect, test } from "vitest";
import {
    Controller, MonoSystem, Entity, Property, Dictionary,
    StateMachine, StateNode, StateTransfer,
    Interaction, InteractionEventEntity, Action, Payload, PayloadItem, Condition,
    Custom, MatchExp, DICTIONARY_RECORD, KlassByName,
    ComputationResult, createMigrationManifest, hashMigrationDiff,
} from 'interaqt';
import { PGLiteDB } from '@drivers';

// 第十五轮 review 修复回归（deep-review-2026-07-10-r15.md）
describe('r15 review fixes', () => {

    // F-1: StateNode.computeValue 返回 undefined（漏写 return）必须 fail-fast。
    //  此前 bound currentState 已 setInternal 推进、applyResult 对 undefined skip，
    //  可见属性与状态机内部状态静默脱钩（下一跳从新状态出发，读方还看到旧值）。
    test('F-1 property statemachine computeValue returning undefined fails fast and keeps state consistent', async () => {
        const pendingState = StateNode.create({ name: 'r15pending' })
        const approvedState = StateNode.create({
            name: 'r15approved',
            computeValue: async function () {
                // 用户漏写 return 的形态
            }
        })
        const doneState = StateNode.create({ name: 'r15done' })

        const taskEntity = Entity.create({
            name: 'R15Task',
            properties: [
                Property.create({
                    name: 'status',
                    type: 'string',
                    computation: StateMachine.create({
                        states: [pendingState, approvedState, doneState],
                        initialState: pendingState,
                        transfers: [
                            StateTransfer.create({
                                current: pendingState,
                                next: approvedState,
                                trigger: {
                                    recordName: InteractionEventEntity.name,
                                    type: 'create',
                                    record: { interactionName: 'r15advance' }
                                },
                                computeTarget: (event: any) => ({ id: event.record.payload.content.id })
                            }),
                            StateTransfer.create({
                                current: approvedState,
                                next: doneState,
                                trigger: {
                                    recordName: InteractionEventEntity.name,
                                    type: 'create',
                                    record: { interactionName: 'r15advance' }
                                },
                                computeTarget: (event: any) => ({ id: event.record.payload.content.id })
                            })
                        ]
                    })
                }),
                Property.create({ name: 'title', type: 'string' })
            ]
        })

        const advanceInteraction = Interaction.create({
            name: 'r15advance',
            action: Action.create({ name: 'r15advance' }),
            payload: Payload.create({
                items: [PayloadItem.create({ name: 'content', type: 'object', isRef: true, base: taskEntity })]
            })
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [taskEntity],
            relations: [],
            eventSources: [advanceInteraction],
        })
        await controller.setup(true)

        const task = await system.storage.create('R15Task', { title: 't1' })
        const user = { id: 'u1' }

        // 第一跳触发 computeValue 返回 undefined → dispatch 必须失败（事务回滚，含 bound state 推进）
        const r1 = await controller.dispatch(advanceInteraction, { user, payload: { content: { id: task.id } } })
        expect(r1.error).toBeDefined()
        expect(String((r1.error as any)?.causedBy?.message ?? r1.error)).toMatch(/computeValue of state "r15approved" returned undefined/)

        // 可见属性保持初始值，且状态机内部没有偷偷前进：再次 dispatch 仍然从 pending 出发（同样失败），
        // 绝不允许出现「第一跳没生效、第二跳直接到 done」的脱钩序列。
        const after1 = await system.storage.findOne('R15Task', MatchExp.atom({ key: 'id', value: ['=', task.id] }), undefined, ['*'])
        expect(after1.status).toBe('r15pending')
        const r2 = await controller.dispatch(advanceInteraction, { user, payload: { content: { id: task.id } } })
        expect(r2.error).toBeDefined()
        const after2 = await system.storage.findOne('R15Task', MatchExp.atom({ key: 'id', value: ['=', task.id] }), undefined, ['*'])
        expect(after2.status).toBe('r15pending')

        await system.destroy()
    })

    // F-1 正向：合法的 computeValue（返回值 / null）不受影响
    test('F-1 legal computeValue forms still work (value and null)', async () => {
        const offState = StateNode.create({ name: 'r15off', computeValue: () => null })
        const onState = StateNode.create({ name: 'r15on', computeValue: (lastValue: unknown) => 'lit' })

        const lampEntity = Entity.create({
            name: 'R15Lamp',
            properties: [
                Property.create({
                    name: 'display',
                    type: 'string',
                    computation: StateMachine.create({
                        states: [offState, onState],
                        initialState: offState,
                        transfers: [
                            StateTransfer.create({
                                current: offState,
                                next: onState,
                                trigger: {
                                    recordName: InteractionEventEntity.name,
                                    type: 'create',
                                    record: { interactionName: 'r15toggle' }
                                },
                                computeTarget: (event: any) => ({ id: event.record.payload.lamp.id })
                            })
                        ]
                    })
                })
            ]
        })
        const toggleInteraction = Interaction.create({
            name: 'r15toggle',
            action: Action.create({ name: 'r15toggle' }),
            payload: Payload.create({
                items: [PayloadItem.create({ name: 'lamp', type: 'object', isRef: true, base: lampEntity })]
            })
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [lampEntity],
            relations: [],
            eventSources: [toggleInteraction],
        })
        await controller.setup(true)

        const lamp = await system.storage.create('R15Lamp', {})
        const created = await system.storage.findOne('R15Lamp', MatchExp.atom({ key: 'id', value: ['=', lamp.id] }), undefined, ['*'])
        // SQL NULL 在读取形态中表现为键缺失（既有读语义，r4-I-1）——断言不是状态名即可
        expect(created.display ?? null).toBeNull()

        const r = await controller.dispatch(toggleInteraction, { user: { id: 'u1' }, payload: { lamp: { id: lamp.id } } })
        expect(r.error).toBeUndefined()
        const after = await system.storage.findOne('R15Lamp', MatchExp.atom({ key: 'id', value: ['=', lamp.id] }), undefined, ['*'])
        expect(after.display).toBe('lit')

        await system.destroy()
    })

    // F-2: compute() 返回 ComputationResult 信封（fullRecompute 等）必须 fail-fast，
    //  不允许把信封对象当值写进 dict/property（此前 dict 值会变成 {"reason":"..."}）。
    test('F-2 compute returning a ComputationResult envelope fails fast instead of writing it raw', async () => {
        const itemEntity = Entity.create({
            name: 'R15EnvelopeItem',
            properties: [Property.create({ name: 'val', type: 'number' })]
        })
        const trapDict = Dictionary.create({
            name: 'r15TrapValue',
            type: 'number',
            collection: false,
            computation: Custom.create({
                name: 'R15TrapCompute',
                dataDeps: {
                    items: { type: 'records', source: itemEntity, attributeQuery: ['val'] }
                },
                compute: async function () {
                    return ComputationResult.fullRecompute('confused user')
                },
            })
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [itemEntity],
            relations: [],
            dict: [trapDict],
        })
        await controller.setup(true)

        await expect(system.storage.create('R15EnvelopeItem', { val: 5 })).rejects.toThrow(/ComputationResultFullRecompute envelope where a plain value is expected/)
        // dict 未被信封污染（保持 install 时的初始计算值）
        const value = await system.storage.dict.get('r15TrapValue')
        expect(typeof value === 'object' && value !== null && 'reason' in (value as object)).toBe(false)

        await system.destroy()
    })

    // S-2: dict defaultValue 工厂在注册时求值一次；读 miss 返回稳定值（且对象为独立副本）
    test('S-2 dict defaultValue read-fallback is evaluated once and stable across reads', async () => {
        let invocations = 0
        const cfgDict = Dictionary.create({
            name: 'r15CfgObject',
            type: 'object',
            collection: false,
            defaultValue: () => {
                invocations++
                return { seq: invocations }
            }
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [],
            relations: [],
            dict: [cfgDict],
        })
        await controller.setup(true)
        const invocationsAfterSetup = invocations

        // 删除持久化行，模拟 setup(false) 下新增声明未 migrate / 行被手工删除
        await system.storage.delete(DICTIONARY_RECORD, MatchExp.atom({ key: 'key', value: ['=', 'r15CfgObject'] }))

        const v1 = await system.storage.dict.get('r15CfgObject') as { seq: number }
        const v2 = await system.storage.dict.get('r15CfgObject') as { seq: number }
        // 读 miss 不再重新求值工厂
        expect(invocations).toBe(invocationsAfterSetup)
        // 两次读到同一个稳定值
        expect(v1.seq).toBe(v2.seq)
        // 且是独立副本（与存储路径的 JSON codec 读语义一致），互不共享可变引用
        v1.seq = 999
        const v3 = await system.storage.dict.get('r15CfgObject') as { seq: number }
        expect(v3.seq).toBe(v2.seq)

        await system.destroy()
    })

    // S-3: teardown 清除 dict 读回退（旧 controller 的声明不再影响后续读取）
    test('S-3 teardown unregisters dict default read-fallback', async () => {
        const cfgDict = Dictionary.create({
            name: 'r15TeardownCfg',
            type: 'number',
            collection: false,
            defaultValue: () => 42
        })
        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [],
            relations: [],
            dict: [cfgDict],
        })
        await controller.setup(true)
        await system.storage.delete(DICTIONARY_RECORD, MatchExp.atom({ key: 'key', value: ['=', 'r15TeardownCfg'] }))

        expect(await system.storage.dict.get('r15TeardownCfg')).toBe(42)
        controller.teardown()
        expect(await system.storage.dict.get('r15TeardownCfg')).toBeUndefined()

        await system.destroy()
    })

    // S-4: context.skip 由框架集中收口——自定义 planIncremental 忽略 skip 也不会用无关事件跑增量
    test('S-4 framework enforces context.skip even when a custom planIncremental ignores it', async () => {
        let incrementalRuns = 0
        const itemEntity = Entity.create({
            name: 'R15SkipItem',
            properties: [
                Property.create({ name: 'kind', type: 'string' }),
                Property.create({ name: 'val', type: 'number' })
            ]
        })
        const sumDict = Dictionary.create({
            name: 'r15IgnorantSum',
            type: 'number',
            collection: false,
            computation: Custom.create({
                name: 'R15IgnorantSum',
                useLastValue: true,
                dataDeps: {
                    matched: {
                        type: 'records',
                        source: itemEntity,
                        match: MatchExp.atom({ key: 'kind', value: ['=', 'counted'] }),
                        attributeQuery: ['val', 'kind']
                    }
                },
                getInitialValue: () => 0,
                compute: async function (deps: any) {
                    return (deps.matched ?? []).reduce((acc: number, item: any) => acc + (item.val ?? 0), 0)
                },
                // 有意忽略 context.skip 的错误实现
                planIncremental: () => ({ type: 'incremental', dataDepKeys: [], needsLastValue: { mode: 'normal' } }),
                incrementalCompute: async function (lastValue: number, event: any) {
                    incrementalRuns++
                    if (event.type === 'create') return (lastValue ?? 0) + (event.record?.val ?? 0)
                    return lastValue
                }
            })
        })

        const system = new MonoSystem(new PGLiteDB())
        system.conceptClass = KlassByName
        const controller = new Controller({
            system,
            entities: [itemEntity],
            relations: [],
            dict: [sumDict],
        })
        await controller.setup(true)

        await system.storage.create('R15SkipItem', { kind: 'counted', val: 10 })
        expect(await system.storage.dict.get('r15IgnorantSum')).toBe(10)
        const runsAfterMatched = incrementalRuns

        // match 之外的记录（kind !== 'counted'）：框架必须在 planIncremental 之前 skip
        await system.storage.create('R15SkipItem', { kind: 'ignored', val: 999 })
        expect(incrementalRuns).toBe(runsAfterMatched)
        expect(await system.storage.dict.get('r15IgnorantSum')).toBe(10)

        await system.destroy()
    })

    // S-7: Condition.create 声明期校验 content
    test('S-7 Condition.create rejects missing content at declaration time', async () => {
        expect(() => Condition.create({ name: 'r15Broken' } as any)).toThrow(/requires a function "content"/)
        expect(() => Condition.create({ name: 'r15Broken2', content: 'not-a-function' as any })).toThrow(/requires a function "content"/)
    })
})

// S-1: 迁移跨进程 resume（DDL 已应用、phase 已记 schema-applied、进程崩溃）
//  必须在全新进程（queryHandle 未初始化）上完成重算——此前会抛
//  "Cannot read properties of undefined (reading 'find')" 并永久卡死。
describe('r15 migration resume on a fresh process', () => {
    async function approveGeneratedMigrationDiff(controller: Controller) {
        const diff = await controller.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true });
        const decisions = [
            ...diff.decisions,
            ...diff.requiredDecisions.map((requirement: any) => {
                if (requirement.kind === "computation") {
                    return {
                        kind: "computation" as const,
                        id: requirement.id,
                        dataContext: requirement.dataContext,
                        decision: requirement.recommendedDecision,
                        reason: "approved by r15 regression",
                    };
                }
                return { ...requirement, reason: "approved by r15 regression" };
            }),
        ];
        return { ...diff, status: "approved" as const, decisions };
    }

    test('S-1 crash-resume with a non-empty rebuild plan recomputes on a fresh system', async () => {
        const db = new PGLiteDB();

        const ItemV1 = new Entity({
            name: 'R15ResumeItem',
            properties: [new Property({ name: 'score', type: 'number' }, { uuid: 'r15-resume-score' })]
        }, { uuid: 'r15-resume-item' });
        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [ItemV1], relations: [] });
        await controllerV1.setup(true);
        await systemV1.storage.create('R15ResumeItem', { score: 1 });
        await systemV1.storage.create('R15ResumeItem', { score: 5 });

        const buildV2Entity = () => new Entity({
            name: 'R15ResumeItem',
            properties: [
                new Property({ name: 'score', type: 'number' }, { uuid: 'r15-resume-score' }),
                new Property({
                    name: 'doubled',
                    type: 'number',
                    computation: new Custom({
                        name: 'R15ResumeDoubleScore',
                        dataDeps: { _self: { type: 'property', attributeQuery: ['score'] } },
                        compute: async function (deps: any) {
                            return (deps._self?.score ?? 0) * 2
                        }
                    }, { uuid: 'r15-resume-custom' })
                }, { uuid: 'r15-resume-doubled' })
            ]
        }, { uuid: 'r15-resume-item' });

        // 迁移规划进程：拿到 approvedDiff 并模拟「DDL 已应用、phase 已记 schema-applied 后进程崩溃」
        const ItemV2 = buildV2Entity();
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [ItemV2], relations: [] });
        const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
        const dryPlan = await controllerV2.migrate({ approvedDiff, dryRun: true });
        for (const operation of dryPlan.schemaPlan!.preRecomputeDDL) {
            if ((operation as any).sql) await db.scheme((operation as any).sql);
        }
        const states = controllerV2.scheduler.createStates();
        const schemaPlan = await (systemV2 as any).prepareMigrationSchema(controllerV2.entities, controllerV2.relations, states);
        const modelHash = createMigrationManifest(controllerV2, schemaPlan.schema).modelHash;
        await db.scheme(`INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "phase", "status", "createdAt", "updatedAt") VALUES ('r15-crashed-resume', '${modelHash}', '${hashMigrationDiff(approvedDiff)}', 'schema-applied', 'failed', 'now', 'now')`);

        // 全新进程（fresh MonoSystem，queryHandle 未初始化）resume：必须成功并完成重算
        const systemV3 = new MonoSystem(db);
        systemV3.conceptClass = KlassByName;
        const controllerV3 = new Controller({ system: systemV3, entities: [ItemV2], relations: [] });
        await controllerV3.migrate({ approvedDiff });

        const items = await systemV3.storage.find('R15ResumeItem', undefined, undefined, ['score', 'doubled'])
        expect(items.map((item: any) => item.doubled).sort((a: number, b: number) => a - b)).toEqual([2, 10])
        await db.close();
    }, 60000)
})
