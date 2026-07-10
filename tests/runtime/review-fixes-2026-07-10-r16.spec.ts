import { describe, expect, test } from "vitest";
import {
    Controller, MonoSystem, Entity, Property, Dictionary,
    Custom, MatchExp, KlassByName, ComputationResult,
    Summation, Average, StateMachine, StateNode, StateTransfer,
} from 'interaqt';
import type { RecordMutationEvent } from 'interaqt';
import { PGLiteDB } from '@drivers';

// 第十六轮 review 修复回归（deep-review-2026-07-10-r16.md）
describe('r16 review fixes', () => {

    // F-1: applyResultPatch 对 patch.data 里的 ComputationResult 信封必须 fail-fast。
    //  r15 R-1 收口了 applyResult 直写信封，patch 路径是同族漏网：
    //  {type:'update', data: ComputationResult.fullRecompute(...)} 此前把信封对象
    //  （{"reason":"..."}）原样写进 dict，所有下游读取方拿到信封，零告警。
    test('F-1 patch envelope carrying ComputationResult in data fails fast, dict stays clean', async () => {
        const TestEntity = Entity.create({
            name: 'R16PatchEnvelopeEntity',
            properties: [Property.create({ name: 'val', type: 'number' })],
        });
        const dict = Dictionary.create({
            name: 'r16EnvelopeDict',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'R16EnvelopeCustom',
                dataDeps: {
                    records: { type: 'records', source: TestEntity, attributeQuery: ['val'] },
                },
                incrementalDataDeps: [],
                compute: async function () { return 0; },
                incrementalPatchCompute: async function (lastValue: any, mutationEvent: any) {
                    if (mutationEvent?.type === 'create') {
                        return { type: 'update', data: ComputationResult.fullRecompute('misuse') };
                    }
                    return undefined;
                },
                getInitialValue: function () { return 0; },
            }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [TestEntity], relations: [], dict: [dict] });
        await controller.setup(true);

        await expect(system.storage.create('R16PatchEnvelopeEntity', { val: 1 }))
            .rejects.toThrow(/envelope where a plain value is expected/);
        // 事务回滚：dict 保持初始值，绝不能变成 {"reason":"misuse"}
        expect(await system.storage.dict.get('r16EnvelopeDict')).toBe(0);
        await system.destroy();
    });

    // F-1 姊妹形态: insert/update patch 缺 data（回调漏赋值）必须 fail-fast。
    //  此前 {type:'update', data: undefined} 会把 undefined 写穿——已有 property 值被
    //  静默抹成 null（r13 F-2 的 patch 路径变体）。
    test('F-1 insert/update patch without data fails fast, property keeps its value', async () => {
        const HostEntity = Entity.create({
            name: 'R16PatchNoDataHost',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({
                    name: 'derived',
                    type: 'number',
                    computation: Custom.create({
                        name: 'R16PropPatchNoData',
                        dataDeps: {
                            _current: { type: 'property', attributeQuery: ['title'] },
                        },
                        incrementalDataDeps: [],
                        incrementalPatchCompute: async function (lastValue: any, mutationEvent: any) {
                            if (mutationEvent?.type === 'update') {
                                return { type: 'update', data: undefined };
                            }
                            return undefined;
                        },
                        getInitialValue: function () { return 7; },
                    }),
                }),
            ],
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [HostEntity], relations: [] });
        await controller.setup(true);

        const host = await system.storage.create('R16PatchNoDataHost', { title: 't' });
        await expect(system.storage.update('R16PatchNoDataHost', MatchExp.atom({ key: 'id', value: ['=', host.id] }), { title: 't2' }))
            .rejects.toThrow(/patch of type 'update' has no "data"/i);
        const after = await system.storage.findOne('R16PatchNoDataHost', MatchExp.atom({ key: 'id', value: ['=', host.id] }), undefined, ['*']);
        expect(after.derived).toBe(7);
        await system.destroy();
    });

    // F-1 正向: 合法的 patch（携带值 / null 清空）照常工作。
    test('F-1 legal patches (value and explicit null) still apply', async () => {
        const HostEntity = Entity.create({
            name: 'R16PatchLegalHost',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({
                    name: 'derived',
                    type: 'number',
                    computation: Custom.create({
                        name: 'R16PropPatchLegal',
                        dataDeps: {
                            _current: { type: 'property', attributeQuery: ['title'] },
                        },
                        incrementalDataDeps: [],
                        incrementalPatchCompute: async function (lastValue: any, mutationEvent: any) {
                            if (mutationEvent?.type === 'update') {
                                const title = (mutationEvent.record as any)?.title;
                                if (title === 'clear') return { type: 'delete' };
                                return { type: 'update', data: (title || '').length };
                            }
                            return undefined;
                        },
                        getInitialValue: function () { return 0; },
                    }),
                }),
            ],
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [HostEntity], relations: [] });
        await controller.setup(true);

        const host = await system.storage.create('R16PatchLegalHost', { title: 't' });
        await system.storage.update('R16PatchLegalHost', MatchExp.atom({ key: 'id', value: ['=', host.id] }), { title: 'hello' });
        let current = await system.storage.findOne('R16PatchLegalHost', MatchExp.atom({ key: 'id', value: ['=', host.id] }), undefined, ['*']);
        expect(current.derived).toBe(5);
        await system.storage.update('R16PatchLegalHost', MatchExp.atom({ key: 'id', value: ['=', host.id] }), { title: 'clear' });
        current = await system.storage.findOne('R16PatchLegalHost', MatchExp.atom({ key: 'id', value: ['=', host.id] }), undefined, ['*']);
        // delete patch 将列写成 SQL NULL；读回形态为 null/undefined（NULL 键缺失是既有遗留 r4-I-1）
        expect(current.derived == null).toBe(true);
        await system.destroy();
    });

    // R-1: filtered entity 成员资格 create 事件的 payload 必须与 base create 事件同契约
    //  （defaults + payload）。此前缺 defaultValue 字段且泄漏内部 _rowId 列。
    test('R-1 filtered create event payload carries default values and no internal _rowId', async () => {
        const Product = Entity.create({
            name: 'R16Product',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }),
            ],
        });
        const ActiveProduct = Entity.create({
            name: 'R16ActiveProduct',
            baseEntity: Product,
            matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Product, ActiveProduct], relations: [] });
        await controller.setup(true);

        const events: RecordMutationEvent[] = [];
        await system.storage.create('R16Product', { name: 'widget' }, events);

        const filteredCreate = events.find(e => e.type === 'create' && e.recordName === 'R16ActiveProduct');
        expect(filteredCreate).toBeDefined();
        expect(filteredCreate!.record!.status).toBe('active');
        expect(filteredCreate!.record!.name).toBe('widget');
        expect(filteredCreate!.record!).not.toHaveProperty('_rowId');
        await system.destroy();
    });

    // R-1 merged 形态: 以 input 视图创建时，input 视图的 create 事件必须携带 __type 判别列
    //  （base create 事件一直有，视图事件此前缺失——按 __type 匹配的下游对同一条记录
    //  "查询可见、事件不可见"）。
    test('R-1 merged input create event payload carries the __type discriminator', async () => {
        const Customer = Entity.create({
            name: 'R16Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'level', type: 'string' }),
            ],
        });
        const Vendor = Entity.create({
            name: 'R16Vendor',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'vendorCode', type: 'string' }),
            ],
        });
        const Contact = Entity.create({
            name: 'R16Contact',
            inputEntities: [Customer, Vendor],
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Customer, Vendor, Contact], relations: [] });
        await controller.setup(true);

        const events: RecordMutationEvent[] = [];
        await system.storage.create('R16Customer', { name: 'acme', level: 'gold' }, events);

        const inputViewCreate = events.find(e => e.type === 'create' && e.recordName === 'R16Customer');
        expect(inputViewCreate).toBeDefined();
        expect(inputViewCreate!.record!.__type).toBe('R16Customer');
        const mergedViewCreate = events.find(e => e.type === 'create' && e.recordName === 'R16Contact');
        expect(mergedViewCreate).toBeDefined();
        expect(mergedViewCreate!.record!.__type).toBe('R16Customer');
        await system.destroy();
    });

    // R-2: Summation/Average 的 attributeQuery 声明多个兄弟字段时声明期 fail-fast。
    //  此前静默只聚合第一个字段——用户以为在聚合多个字段，实际零告警少算。
    test('R-2 Summation/Average reject multi-field attributeQuery at declaration time', async () => {
        const Item = Entity.create({
            name: 'R16SumItem',
            properties: [
                Property.create({ name: 'score', type: 'number' }),
                Property.create({ name: 'bonus', type: 'number' }),
            ],
        });
        const buildController = (dict: any) => {
            const system = new MonoSystem(new PGLiteDB());
            system.conceptClass = KlassByName;
            return new Controller({ system, entities: [Item], relations: [], dict: [dict] });
        };

        expect(() => buildController(Dictionary.create({
            name: 'r16total',
            type: 'number',
            computation: Summation.create({ record: Item, attributeQuery: ['score', 'bonus'] }),
        }))).toThrow(/declares 2 sibling fields in attributeQuery.*WeightedSummation/s);

        expect(() => buildController(Dictionary.create({
            name: 'r16avg',
            type: 'number',
            computation: Average.create({ record: Item, attributeQuery: ['score', 'bonus'] }),
        }))).toThrow(/declares 2 sibling fields in attributeQuery/);
    });

    // R-2 正向: 单字段与单链嵌套路径照常工作。
    test('R-2 single-field and single nested path attributeQuery still work', async () => {
        const Item = Entity.create({
            name: 'R16SumOkItem',
            properties: [Property.create({ name: 'score', type: 'number' })],
        });
        const dict = Dictionary.create({
            name: 'r16okTotal',
            type: 'number',
            computation: Summation.create({ record: Item, attributeQuery: ['score'] }),
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [], dict: [dict] });
        await controller.setup(true);
        await system.storage.create('R16SumOkItem', { score: 10 });
        await system.storage.create('R16SumOkItem', { score: 32 });
        expect(await system.storage.dict.get('r16okTotal')).toBe(42);
        await system.destroy();
    });

    // F-2: 迁移链式 rebuild 驱动到 event-based property 计算（StateMachine 等）时，
    //  handler 必须按宿主记录逐条调用（与 runFullRecompute 的 property 分支同契约）。
    //  此前以 record=undefined 调 writeComputationResult，retrieveLastValue 在 record!.id
    //  处抛裸 TypeError（"Cannot read properties of undefined"），迁移失败且 resume 永远
    //  走进同一条死路。
    test('F-2 chained migration rebuild of event-based property computation applies handler per host record', async () => {
        const db = new PGLiteDB();

        const buildEntities = (multiplier: number) => {
            const score = new Custom({
                name: 'R16MigScore',
                dataDeps: { current: { type: 'property', attributeQuery: ['base'] } },
                compute: multiplier === 1
                    ? async (_deps: any, record: any) => record.base * 1
                    : async (_deps: any, record: any) => record.base * 2,
            }, { uuid: 'r16-mig-score-computation-' + multiplier });

            const fresh = new StateNode({ name: 'fresh' }, { uuid: 'r16-mig-fresh' });
            const touched = new StateNode({ name: 'touched' }, { uuid: 'r16-mig-touched' });
            const machine = new StateMachine({
                states: [fresh, touched],
                initialState: fresh,
                transfers: [
                    new StateTransfer({
                        trigger: { recordName: 'R16MigTicket', type: 'update' },
                        current: fresh,
                        next: touched,
                        computeTarget: (event: any) => ({ id: event.record.id }),
                    }, { uuid: 'r16-mig-transfer' }),
                ],
            }, { uuid: 'r16-mig-machine' });

            return new Entity({
                name: 'R16MigTicket',
                properties: [
                    new Property({ name: 'base', type: 'number' }, { uuid: 'r16-mig-base' }),
                    new Property({ name: 'score', type: 'number', computation: score }, { uuid: 'r16-mig-score' }),
                    new Property({ name: 'status', type: 'string', computation: machine }, { uuid: 'r16-mig-status' }),
                ],
            }, { uuid: 'r16-mig-ticket' });
        };

        const systemV1 = new MonoSystem(db);
        systemV1.conceptClass = KlassByName;
        const controllerV1 = new Controller({ system: systemV1, entities: [buildEntities(1)], relations: [] });
        await controllerV1.setup(true);
        const ticket = await systemV1.storage.create('R16MigTicket', { base: 5 });

        // v2: score 计算公式变更（*1 → *2）。StateMachine 的 update trigger 使其成为
        //  score 输出节点的下游——上游重算产生的 update 事件把它拉进链式 rebuild。
        const systemV2 = new MonoSystem(db);
        systemV2.conceptClass = KlassByName;
        const controllerV2 = new Controller({ system: systemV2, entities: [buildEntities(2)], relations: [] });
        const diff = await controllerV2.generateMigrationDiff({ includeFunctionText: true, includeDestructiveScope: true });
        const approvedDiff = {
            ...diff,
            status: 'approved' as const,
            decisions: [
                ...diff.decisions,
                ...diff.requiredDecisions.map((requirement: any) => {
                    if (requirement.kind === 'computation') {
                        return { kind: 'computation' as const, id: requirement.id, dataContext: requirement.dataContext, decision: requirement.recommendedDecision, reason: 'approved by r16 test' };
                    }
                    if (requirement.kind === 'event-rebuild-handler') {
                        return { kind: 'event-rebuild-handler' as const, dataContext: requirement.dataContext, handlerRef: 'r16StatusRebuild', reason: 'approved by r16 test' };
                    }
                    return { kind: 'destructive-scope' as const, dataContext: requirement.dataContext, recordName: requirement.recordName, ids: requirement.ids, reason: 'approved by r16 test' };
                }),
            ],
        };

        const handlerRecords: unknown[] = [];
        await controllerV2.migrate({
            approvedDiff,
            handlers: {
                eventRebuild: {
                    r16StatusRebuild: async (context: any) => {
                        handlerRecords.push(context.record);
                        return 'fresh';
                    },
                },
            },
        });

        // handler 按宿主记录逐条调用（收到 record，而不是 record=undefined）
        expect(handlerRecords.length).toBeGreaterThan(0);
        for (const record of handlerRecords) {
            expect(record).toBeDefined();
            expect((record as any).id).toBe(ticket.id);
        }
        const after = await systemV2.storage.findOne('R16MigTicket', MatchExp.atom({ key: 'id', value: ['=', ticket.id] }), undefined, ['*']);
        expect(after.score).toBe(10);
        expect(after.status).toBe('fresh');
        await db.close();
    });
});
