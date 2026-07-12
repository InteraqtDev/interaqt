/**
 * r22 深度审查回归(runtime 面)。
 *
 * F-2 —— 事务重试污染调用方 events 数组(幻影事件):
 *   事务外的 storage.create/update/delete(..., events) 经 withAtomicTransaction 包装,
 *   events.push 发生在事务函数内部(COMMIT 之前)。attempt 执行到 push、却在 COMMIT 时
 *   失败(PG SERIALIZABLE 的 first-committer-wins 冲突正是在 COMMIT 时报 40001)并重试
 *   时,调用方数组残留已回滚 attempt 的事件——事件数与提交行数分裂,幻影事件指向不存在
 *   的记录 id。修复:每次 attempt 用全新数组,提交成功后一次性搬运。
 *
 * I-1 —— 用户实体遮蔽 eventSource 事件实体(_Interaction_ 等)静默丢字段:
 *   Controller 此前对同名用户实体静默跳过注入,事件按系统字段写入用户 schema,
 *   未声明字段被写路径静默丢弃——监听 record.interactionName 的下游永不触发。
 *   修复:同名不同实例 fail-fast。
 *
 * I-2 —— 监听 type 白名单(死监听不变量第二根轴):
 *   trigger/eventDep 的 type typo('updated'、'creat')此前静默注册永不命中的监听。
 *   修复:assertListenerReachable 校验 type ∈ {create,update,delete}(汇合点,
 *   覆盖 StateMachine trigger / Transform eventDeps / addSourceMap 全部生产者)。
 *
 * I-2b —— StateMachine 图完整性声明期校验:
 *   同名 StateNode(TransitionFinder 按 name 索引,同名合桶歧义)、initialState/transfer
 *   端点脱离 states 数组,此前全部静默接受。修复:StateMachine.create 声明期 fail-fast
 *   (序列化管线的未解析 uuid 引用跳过校验,由 graph 管线解析后再验)。
 *
 * I-3 —— delete 事件的 records match 旧态快照用错字段:
 *   delete 事件没有 oldRecord,删除前快照在 event.record 上。旧实现用 oldRecord
 *   (undefined)求旧态 → 每个 delete 都不可判定 → 强制 full recompute + SERIALIZABLE
 *   升级;不匹配的 delete 本应 skip。修复:delete 用 event.record 作旧态。
 *
 * I-5 —— SQLite open/openForSchemaRead 非幂等:
 *   每次 new SQLite(':memory:') 是独立空库;setup(false)/迁移路径把 this.db 换成
 *   全新空库,已建表、数据、manifest 全部"消失"。修复:已打开时复用连接(与 PG/MySQL 同构)。
 */
import { describe, expect, test } from "vitest";
import {
    Action, Controller, Custom, Dictionary, Entity, Interaction, KlassByName, MatchExp,
    MonoSystem, Property, StateMachine, StateNode, StateTransfer, Transform,
} from "interaqt";
import { PGLiteDB, SQLiteDB } from "@drivers";
import type { RecordMutationEvent } from "@runtime";

async function waitForListeners() {
    await new Promise(resolve => setTimeout(resolve, 50));
}

describe('r22 F-2 — transaction retry must not leak rolled-back events into caller array', () => {
    test('retryable COMMIT failure + retry: external events array only holds committed events', async () => {
        const Item = Entity.create({
            name: 'R22RetryItem',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const db = new PGLiteDB();
        const originalScheme = db.scheme.bind(db);
        let injectCommitFailure = false;
        let failedOnce = false;
        (db as any).scheme = async (sql: string, name?: string) => {
            if (sql === 'COMMIT' && injectCommitFailure && !failedOnce) {
                failedOnce = true;
                // 模拟 PG SERIALIZABLE first-committer-wins:COMMIT 时报 40001(可重试)
                const err = new Error('could not serialize access due to read/write dependencies among transactions') as any;
                err.code = '40001';
                throw err;
            }
            return originalScheme(sql, name);
        };
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);

        injectCommitFailure = true;
        const events: RecordMutationEvent[] = [];
        await system.storage.create('R22RetryItem', { name: 'x' }, events);
        injectCommitFailure = false;

        expect(failedOnce).toBe(true); // 注入确实生效(第一次 attempt 的 COMMIT 失败并重试)
        const rows = await system.storage.find('R22RetryItem', undefined, undefined, ['id', 'name']);
        expect(rows).toHaveLength(1);
        // 幻影隔离:外部数组只含提交成功 attempt 的事件,且 id 与 DB 行一致
        const createEvents = events.filter(e => e.type === 'create' && e.recordName === 'R22RetryItem');
        expect(createEvents).toHaveLength(1);
        expect((createEvents[0].record as any).id).toBe(rows[0].id);
        await system.destroy();
    });
});

describe('r22 I-1 — user entity shadowing an eventSource event entity fails fast', () => {
    test('entity named _Interaction_ is rejected at Controller construction', async () => {
        const Shadow = Entity.create({
            name: '_Interaction_',
            properties: [Property.create({ name: 'note', type: 'string' })],
        });
        const Ping = Interaction.create({
            name: 'R22Ping',
            action: Action.create({ name: 'r22ping' }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        expect(() => new Controller({ system, entities: [Shadow], relations: [], eventSources: [Ping] }))
            .toThrow(/conflicts with the event entity/);
        await system.destroy();
    });
});

describe('r22 I-2 — listener type whitelist (dead-listener invariant, second axis)', () => {
    test('StateMachine trigger with typo type fails fast at setup', async () => {
        const draft = StateNode.create({ name: 'r22draft' });
        const published = StateNode.create({ name: 'r22published' });
        const Doc = Entity.create({
            name: 'R22Doc',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({
                    name: 'phase', type: 'string',
                    computation: StateMachine.create({
                        states: [draft, published],
                        initialState: draft,
                        transfers: [StateTransfer.create({
                            trigger: { recordName: 'R22Doc', type: 'updated' as any },
                            current: draft,
                            next: published,
                            computeTarget: (event: any) => ({ id: event.record.id }),
                        })]
                    })
                }),
            ],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Doc], relations: [] });
        await expect(controller.setup(true)).rejects.toThrow(/'create' \| 'update' \| 'delete'/);
        await system.destroy();
    });

    test('Transform eventDep with typo type fails fast at setup', async () => {
        const Src = Entity.create({
            name: 'R22Src',
            properties: [Property.create({ name: 'label', type: 'string' })],
        });
        const Audit = Entity.create({
            name: 'R22Audit',
            properties: [Property.create({ name: 'label', type: 'string' })],
            computation: Transform.create({
                eventDeps: {
                    onCreate: { recordName: 'R22Src', type: 'creat' as any },
                },
                callback: (event: any) => ({ label: event.record.label }),
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Src, Audit], relations: [] });
        await expect(controller.setup(true)).rejects.toThrow(/'create' \| 'update' \| 'delete'/);
        await system.destroy();
    });
});

describe('r22 I-2b — StateMachine graph integrity at declaration time', () => {
    test('duplicate state names are rejected', () => {
        const a1 = StateNode.create({ name: 'r22dup' });
        const a2 = StateNode.create({ name: 'r22dup' });
        expect(() => StateMachine.create({
            states: [a1, a2],
            initialState: a1,
            transfers: [],
        })).toThrow(/duplicate state name/);
    });

    test('initialState not in states is rejected', () => {
        const inState = StateNode.create({ name: 'r22in' });
        const outState = StateNode.create({ name: 'r22out' });
        expect(() => StateMachine.create({
            states: [inState],
            initialState: outState,
            transfers: [],
        })).toThrow(/initialState .* not in the states array/);
    });

    test('transfer endpoint not in states is rejected', () => {
        const s1 = StateNode.create({ name: 'r22s1' });
        const s2 = StateNode.create({ name: 'r22s2' });
        const orphan = StateNode.create({ name: 'r22orphan' });
        expect(() => StateMachine.create({
            states: [s1, s2],
            initialState: s1,
            transfers: [StateTransfer.create({
                trigger: { recordName: 'X', type: 'update' },
                current: orphan,
                next: s2,
            })],
        })).toThrow(/current state .* not in the states array/);
    });

    test('well-formed machine passes', () => {
        const s1 = StateNode.create({ name: 'r22ok1' });
        const s2 = StateNode.create({ name: 'r22ok2' });
        expect(() => StateMachine.create({
            states: [s1, s2],
            initialState: s1,
            transfers: [StateTransfer.create({
                trigger: { recordName: 'X', type: 'update' },
                current: s1,
                next: s2,
            })],
        })).not.toThrow();
    });
});

describe('r22 I-3 — delete event uses event.record as the old-state snapshot for records match', () => {
    test('delete of a non-matching record is skipped (no full recompute)', async () => {
        const Task = Entity.create({
            name: 'R22Task',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'value', type: 'number' }),
            ],
        });
        let fullComputeCount = 0;
        const total = Dictionary.create({
            name: 'r22ActiveTotal',
            type: 'number',
            computation: Custom.create({
                name: 'R22ActiveTotal',
                dataDeps: {
                    items: {
                        type: 'records',
                        source: Task,
                        match: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
                        attributeQuery: ['status', 'value'],
                    },
                },
                compute(dataDeps: any) {
                    fullComputeCount++;
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalDataDeps: ['items'],
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Task], relations: [], dict: [total] });
        await controller.setup(true);

        await system.storage.create('R22Task', { status: 'active', value: 7 });
        await waitForListeners();
        expect(await system.storage.dict.get('r22ActiveTotal')).toBe(7);

        const done = await system.storage.create('R22Task', { status: 'done', value: 100 });
        await waitForListeners();
        const fullBeforeDelete = fullComputeCount;

        // 不匹配记录的 delete:本应 skip(此前恒 full recompute + SERIALIZABLE 升级)
        await system.storage.delete('R22Task', MatchExp.atom({ key: 'id', value: ['=', done.id] }));
        await waitForListeners();
        expect(await system.storage.dict.get('r22ActiveTotal')).toBe(7);
        expect(fullComputeCount).toBe(fullBeforeDelete);
        await system.destroy();
    });

    test('delete of a matching record updates the aggregate (correctness preserved)', async () => {
        const Task = Entity.create({
            name: 'R22Task2',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'value', type: 'number' }),
            ],
        });
        const total = Dictionary.create({
            name: 'r22ActiveTotal2',
            type: 'number',
            computation: Custom.create({
                name: 'R22ActiveTotal2',
                dataDeps: {
                    items: {
                        type: 'records',
                        source: Task,
                        match: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
                        attributeQuery: ['status', 'value'],
                    },
                },
                compute(dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalCompute(this: any, _lastValue: unknown, _event: any, _record: any, dataDeps: any) {
                    return (dataDeps.items || []).reduce((s: number, i: any) => s + (i.value || 0), 0);
                },
                incrementalDataDeps: ['items'],
                getInitialValue: () => 0,
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Task], relations: [], dict: [total] });
        await controller.setup(true);

        const t1 = await system.storage.create('R22Task2', { status: 'active', value: 7 });
        await system.storage.create('R22Task2', { status: 'active', value: 3 });
        await waitForListeners();
        expect(await system.storage.dict.get('r22ActiveTotal2')).toBe(10);

        await system.storage.delete('R22Task2', MatchExp.atom({ key: 'id', value: ['=', t1.id] }));
        await waitForListeners();
        expect(await system.storage.dict.get('r22ActiveTotal2')).toBe(3);
        await system.destroy();
    });
});

describe('r22 I-5 — SQLite open/openForSchemaRead idempotency', () => {
    test(':memory: db survives setup(true) followed by setup(false)', async () => {
        const Item = Entity.create({
            name: 'R22SqItem',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const db = new SQLiteDB(':memory:');
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);
        await system.storage.create('R22SqItem', { name: 'x' });

        // manifest 校验路径(此前 openForSchemaRead/open 换新空库 → 数据与 manifest 全部"消失")
        await controller.setup(false);

        const after = await system.storage.find('R22SqItem', undefined, undefined, ['id']);
        expect(after).toHaveLength(1);
        await db.close();
    });
});
