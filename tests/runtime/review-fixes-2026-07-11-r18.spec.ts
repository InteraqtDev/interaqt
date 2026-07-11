import { describe, expect, test } from "vitest";
import {
    Controller, MonoSystem, Entity, Property, Relation, MatchExp,
    StateMachine, StateNode, StateTransfer, Transform, Every, Dictionary,
    ScopedSequence, UniqueConstraint, InteractionEventEntity
} from 'interaqt';
import { PGLiteDB } from '@drivers';
import { createMigrationManifest } from '../../src/runtime/migration.js';

// 第十八轮深度 review 的修复回归（见 agentspace/output/deep-review-2026-07-11-r18.md）。
//
// F-1 事件驱动计算（StateMachine trigger / Transform eventDeps）监听 filtered
//     entity/relation 名的 update 事件：storage 只以物理 base 名发字段 update 事件，
//     此前该监听是死监听（转移/派生永不触发、零告警）。修复：ComputationSourceMap
//     把事件驱动的 filtered update 监听与数据驱动同构地挂到物理名上，Scheduler
//     路由时做成员资格守卫并把事件名改写回 filtered 名。
// F-2 migration manifest 对"普通值参数"全盲：trigger.keys / trigger.record 模式、
//     StateMachine 状态图拓扑（next 状态）、Every.notEmpty、Transform eventDeps 的
//     record 模式等都不进入签名——改这些参数迁移零感知，存量数据带旧语义静默放行。
//     修复：argsSignature（规范化普通值参数）进入 structuralSignature，
//     manifest generator 版本 2 → 3。
// F-4 ScopedSequence 的 scope 输入字段在编号后被修改：序号不重分配，目标 scope 出现
//     重复号码；配合文档推荐的 UniqueConstraint(scope+number) 时目标 scope 的后续
//     create 永久撞唯一约束（计数器随事务回滚，不可自愈）。修复：scope 输入不可变
//     守卫（值字段 update / scope 关系 delete 均 fail-fast；未编号记录不受限）。

describe('r18 F-1: filtered update listeners for event-based computations', () => {
    test('StateMachine transfer with update trigger on filtered entity name fires on member field update', async () => {
        const active = StateNode.create({ name: "active" });
        const done = StateNode.create({ name: "done" });
        const sm = StateMachine.create({
            states: [active, done],
            initialState: active,
            transfers: [StateTransfer.create({
                trigger: { recordName: 'R18ActiveTicket', type: 'update', keys: ['title'] },
                current: active,
                next: done,
                computeTarget: (e: any) => ({ id: e.record.id }),
            })],
        });
        const Ticket = Entity.create({
            name: 'R18Ticket',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'phase', type: 'string', computation: sm }),
            ],
        });
        const ActiveTicket = Entity.create({
            name: 'R18ActiveTicket',
            baseEntity: Ticket,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Ticket, ActiveTicket], relations: [], eventSources: [] });
        await controller.setup(true);

        const read = async (id: unknown) => system.storage.findOne('R18Ticket', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, ['*']);

        // 成员记录的字段更新 → 触发转移
        const member = await system.storage.create('R18Ticket', { title: 'a', isActive: true });
        expect((await read(member.id)).phase).toBe('active');
        await system.storage.update('R18Ticket', MatchExp.atom({ key: 'id', value: ['=', member.id] }), { title: 'b' });
        expect((await read(member.id)).phase).toBe('done');

        // 非成员记录的字段更新 → 成员资格守卫拦截，不触发
        const outsider = await system.storage.create('R18Ticket', { title: 'x', isActive: false });
        await system.storage.update('R18Ticket', MatchExp.atom({ key: 'id', value: ['=', outsider.id] }), { title: 'y' });
        expect((await read(outsider.id)).phase).toBe('active');
        await system.destroy();
    });

    test('Transform with eventDeps update on filtered entity name derives on member field update only', async () => {
        const Ticket = Entity.create({
            name: 'R18TTicket',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
            ],
        });
        const ActiveTicket = Entity.create({
            name: 'R18TActiveTicket',
            baseEntity: Ticket,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
        });
        const AuditLog = Entity.create({
            name: 'R18AuditLog',
            properties: [Property.create({ name: 'note', type: 'string' })],
            computation: Transform.create({
                eventDeps: {
                    activeUpdated: { recordName: 'R18TActiveTicket', type: 'update' },
                },
                callback: function (event: any) {
                    // 改写后的事件必须以 filtered 名到达 callback
                    return { note: `${event.recordName}:${event.record?.id}` };
                },
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Ticket, ActiveTicket, AuditLog], relations: [], eventSources: [] });
        await controller.setup(true);

        const member = await system.storage.create('R18TTicket', { title: 'a', isActive: true });
        const outsider = await system.storage.create('R18TTicket', { title: 'x', isActive: false });
        await system.storage.update('R18TTicket', MatchExp.atom({ key: 'id', value: ['=', member.id] }), { title: 'b' });
        await system.storage.update('R18TTicket', MatchExp.atom({ key: 'id', value: ['=', outsider.id] }), { title: 'y' });

        const logs = await system.storage.find('R18AuditLog', undefined, undefined, ['*']);
        expect(logs.length).toBe(1);
        expect(logs[0].note).toBe(`R18TActiveTicket:${member.id}`);
        await system.destroy();
    });

    test('update that ENTERS the filtered set is driven by the membership create event, not double-fired', async () => {
        const idle = StateNode.create({ name: "idle" });
        const entered = StateNode.create({ name: "entered" });
        const updatedInSet = StateNode.create({ name: "updatedInSet" });
        const sm = StateMachine.create({
            states: [idle, entered, updatedInSet],
            initialState: idle,
            transfers: [
                StateTransfer.create({
                    trigger: { recordName: 'R18EnterActive', type: 'create' },
                    current: idle,
                    next: entered,
                    computeTarget: (e: any) => ({ id: e.record.id }),
                }),
                StateTransfer.create({
                    // keys 限定 label：不带 keys 的 update trigger 会连状态机自身写 phase 的
                    // 回声事件也匹配（宿主自更新回声是既有语义，与 filtered 路由无关）。
                    trigger: { recordName: 'R18EnterActive', type: 'update', keys: ['label'] },
                    current: entered,
                    next: updatedInSet,
                    computeTarget: (e: any) => ({ id: e.record.id }),
                }),
            ],
        });
        const Item = Entity.create({
            name: 'R18EnterItem',
            properties: [
                Property.create({ name: 'label', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'phase', type: 'string', computation: sm }),
            ],
        });
        const Active = Entity.create({
            name: 'R18EnterActive',
            baseEntity: Item,
            matchExpression: MatchExp.atom({ key: 'isActive', value: ['=', true] }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Item, Active], relations: [], eventSources: [] });
        await controller.setup(true);
        const read = async (id: unknown) => system.storage.findOne('R18EnterItem', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, ['*']);

        // 进入集合的 update：只由成员资格 create 事件驱动（idle→entered），update 监听不重复触发
        const item = await system.storage.create('R18EnterItem', { label: 'a', isActive: false });
        await system.storage.update('R18EnterItem', MatchExp.atom({ key: 'id', value: ['=', item.id] }), { isActive: true });
        expect((await read(item.id)).phase).toBe('entered');

        // 集合内的后续字段更新走 update 监听（entered→updatedInSet）
        await system.storage.update('R18EnterItem', MatchExp.atom({ key: 'id', value: ['=', item.id] }), { label: 'b' });
        expect((await read(item.id)).phase).toBe('updatedInSet');
        await system.destroy();
    });
});

describe('r18 F-2: migration manifest captures plain-value args (argsSignature)', () => {
    function buildStateMachineController(opts: { keys: string[], nextName: string }) {
        const open = StateNode.create({ name: "open" });
        const next = StateNode.create({ name: opts.nextName });
        const sm = StateMachine.create({
            states: [open, next],
            initialState: open,
            transfers: [StateTransfer.create({
                trigger: { recordName: 'R18MTicket', type: 'update', keys: opts.keys },
                current: open,
                next,
                computeTarget: (e: any) => ({ id: e.record.id }),
            })],
        });
        const Ticket = Entity.create({
            name: 'R18MTicket',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'priority', type: 'number' }),
                Property.create({ name: 'status', type: 'string', computation: sm }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Ticket], relations: [], eventSources: [] });
        return { controller, system };
    }

    async function signatureOf(build: () => { controller: Controller, system: MonoSystem }, pick: (c: any) => boolean) {
        const { controller, system } = build();
        const manifest = createMigrationManifest(controller);
        const computation = manifest.computations.find(pick)!;
        await system.destroy();
        return computation.signature;
    }

    test('StateMachine trigger.keys change is visible in the signature', async () => {
        const s1 = await signatureOf(() => buildStateMachineController({ keys: ['title'], nextName: 'closed' }), c => c.outputProperty === 'status');
        const s2 = await signatureOf(() => buildStateMachineController({ keys: ['priority'], nextName: 'closed' }), c => c.outputProperty === 'status');
        expect(s1).not.toBe(s2);
    });

    test('StateMachine transfer next-state (state-graph topology) change is visible in the signature', async () => {
        const s1 = await signatureOf(() => buildStateMachineController({ keys: ['title'], nextName: 'closed' }), c => c.outputProperty === 'status');
        const s2 = await signatureOf(() => buildStateMachineController({ keys: ['title'], nextName: 'archived' }), c => c.outputProperty === 'status');
        expect(s1).not.toBe(s2);
    });

    test('unchanged model keeps a stable signature across processes (uuid must not leak in)', async () => {
        const s1 = await signatureOf(() => buildStateMachineController({ keys: ['title'], nextName: 'closed' }), c => c.outputProperty === 'status');
        const s2 = await signatureOf(() => buildStateMachineController({ keys: ['title'], nextName: 'closed' }), c => c.outputProperty === 'status');
        expect(s1).toBe(s2);
    });

    function buildEveryController(notEmpty: boolean) {
        const Item = Entity.create({
            name: 'R18EItem',
            properties: [Property.create({ name: 'ok', type: 'boolean' })],
        });
        const dict = [Dictionary.create({
            name: 'r18AllOk',
            type: 'boolean',
            collection: false,
            computation: Every.create({
                record: Item,
                attributeQuery: ['ok'],
                notEmpty,
                callback: (item: any) => !!item.ok,
            }),
        })];
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Item], relations: [], eventSources: [], dict });
        return { controller, system };
    }

    test('Every.notEmpty change is visible in the signature', async () => {
        const s1 = await signatureOf(() => buildEveryController(false), c => c.dataContext.includes('r18AllOk'));
        const s2 = await signatureOf(() => buildEveryController(true), c => c.dataContext.includes('r18AllOk'));
        expect(s1).not.toBe(s2);
    });

    function buildTransformController(interactionName: string) {
        const Log = Entity.create({
            name: 'R18TLog',
            properties: [Property.create({ name: 'note', type: 'string' })],
            computation: Transform.create({
                eventDeps: {
                    interactionCreated: {
                        recordName: InteractionEventEntity.name,
                        type: 'create',
                        record: { interactionName },
                    },
                },
                callback: (event: any) => ({ note: event.record?.interactionName }),
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Log], relations: [], eventSources: [] });
        return { controller, system };
    }

    test('Transform eventDeps record-pattern change is visible in the signature', async () => {
        const s1 = await signatureOf(() => buildTransformController('CreatePost'), c => c.outputRecord === 'R18TLog');
        const s2 = await signatureOf(() => buildTransformController('DeletePost'), c => c.outputRecord === 'R18TLog');
        expect(s1).not.toBe(s2);
    });

    test('function-text-only change stays out of structuralSignature (state-only classification preserved)', async () => {
        // createState 文本变化只应影响 stateSignature/functionSignature，不应把
        // structuralSignature 也改掉（否则 state-only 迁移被误判为结构变更）。
        const build = (variant: 1 | 2) => {
            const Item = Entity.create({
                name: 'R18FnItem',
                properties: [Property.create({ name: 'ok', type: 'boolean' })],
            });
            // 两个字面量不同的函数体（闭包变量不改变函数文本，必须是不同的源码）
            const callback = variant === 1
                ? (item: any) => !!item.ok
                : (item: any) => item.ok === true;
            const dict = [Dictionary.create({
                name: 'r18FnAllOk',
                type: 'boolean',
                collection: false,
                computation: Every.create({
                    record: Item,
                    attributeQuery: ['ok'],
                    callback,
                }),
            })];
            const system = new MonoSystem(new PGLiteDB());
            const controller = new Controller({ system, entities: [Item], relations: [], eventSources: [], dict });
            return { controller, system };
        };
        const v1 = build(1);
        const v2 = build(2);
        const c1 = createMigrationManifest(v1.controller).computations.find(c => c.dataContext.includes('r18FnAllOk'))!;
        const c2 = createMigrationManifest(v2.controller).computations.find(c => c.dataContext.includes('r18FnAllOk'))!;
        await v1.system.destroy();
        await v2.system.destroy();
        expect(c1.structuralSignature).toBe(c2.structuralSignature);
        expect(c1.functionSignature?.hash).not.toBe(c2.functionSignature?.hash);
        expect(c1.signature).not.toBe(c2.signature);
    });
});

describe('r18 F-4: ScopedSequence scope inputs are immutable after numbering', () => {
    test('value-scope field change on a numbered record fails fast; scope stays usable', async () => {
        const Task = Entity.create({
            name: 'R18SeqTask',
            properties: [
                Property.create({ name: 'project', type: 'string' }),
                Property.create({
                    name: 'seq',
                    type: 'number',
                    computation: ScopedSequence.create({
                        name: 'R18SeqTaskSeq',
                        scope: [{ name: 'project', type: 'string', path: 'project' }],
                    }),
                }),
            ],
            constraints: [
                UniqueConstraint.create({ name: 'uniqProjectSeq', properties: ['project', 'seq'] }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Task], relations: [], eventSources: [] });
        await controller.setup(true);
        const read = async (id: unknown) => system.storage.findOne('R18SeqTask', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, ['*']);

        const a1 = await system.storage.create('R18SeqTask', { project: 'A' });
        const a2 = await system.storage.create('R18SeqTask', { project: 'A' });
        await system.storage.create('R18SeqTask', { project: 'B' });

        // 修复前：a2 带着 seq=2 静默进入 B（B 的计数器仍是 1）→ B 的下一次 create 永久撞
        // uniqProjectSeq 唯一约束（计数器随事务回滚）。修复后：scope 变更 fail-fast。
        await expect(
            system.storage.update('R18SeqTask', MatchExp.atom({ key: 'id', value: ['=', a2.id] }), { project: 'B' })
        ).rejects.toThrowError(/scope field.*"project".*cannot change after a sequence number is assigned/s);

        expect((await read(a2.id)).project).toBe('A');
        const b2 = await system.storage.create('R18SeqTask', { project: 'B' });
        expect((await read(b2.id)).seq).toBe(2);

        // 非 scope 字段照常可更新（守卫只看 scope 输入的实际变化）
        await system.storage.update('R18SeqTask', MatchExp.atom({ key: 'id', value: ['=', a1.id] }), { project: 'A' });
        await system.destroy();
    });

    test('ref-scope relation replacement fails fast; record deletion is unaffected', async () => {
        const Project = Entity.create({
            name: 'R18RefProject',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const Media = Entity.create({
            name: 'R18RefMedia',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({
                    name: 'serial',
                    type: 'number',
                    computation: ScopedSequence.create({
                        name: 'R18RefMediaSerial',
                        scope: [{ name: 'project', type: 'ref', base: Project, path: 'project' }],
                    }),
                }),
            ],
        });
        const rel = Relation.create({
            source: Media,
            sourceProperty: 'project',
            target: Project,
            targetProperty: 'medias',
            type: 'n:1',
        });
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({ system, entities: [Project, Media], relations: [rel], eventSources: [] });
        await controller.setup(true);
        const read = async (id: unknown) => system.storage.findOne('R18RefMedia', MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, ['*']);

        const p1 = await system.storage.create('R18RefProject', { name: 'p1' });
        const p2 = await system.storage.create('R18RefProject', { name: 'p2' });
        const m1 = await system.storage.create('R18RefMedia', { title: 'm1', project: { id: p1.id } });
        expect((await read(m1.id)).serial).toBe(1);

        await expect(
            system.storage.update('R18RefMedia', MatchExp.atom({ key: 'id', value: ['=', m1.id] }), { project: { id: p2.id } })
        ).rejects.toThrowError(/scope relation "project".*cannot be removed or replaced/s);
        expect((await read(m1.id)).serial).toBe(1);

        // 宿主删除（级联解除 scope 关系）不受守卫影响
        await system.storage.delete('R18RefMedia', MatchExp.atom({ key: 'id', value: ['=', m1.id] }));
        expect(await read(m1.id)).toBeUndefined();

        const m2 = await system.storage.create('R18RefMedia', { title: 'm2', project: { id: p1.id } });
        expect((await read(m2.id)).serial).toBe(2);
        await system.destroy();
    });
});
