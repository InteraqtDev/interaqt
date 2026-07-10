/**
 * 第十四轮改进项回归（2026-07-10）——r13 报告第四节遗留项的修复：
 *
 * I-1 entity/relation 级 Custom 的 useLastValue 默认关闭（全表 lastValue 快照是 OOM 悬崖；
 *     显式声明 useLastValue: true 仍可用——知情选择）
 * I-2 Controller.teardown()：注销计算监听，长生命周期进程可安全丢弃 controller
 * I-3 atomic.lockRows 锁后按 match 重查（漂出的行不再返回陈旧内容）
 * I-4 dict.get 对声明了 defaultValue 的 key 在无存储行时按声明回退
 * I-5 事务重试判定收录 SQLITE_BUSY / 57P01 / ECONNRESET / EPIPE
 * I-6 dispatch 错误响应与成功路径同形态（data/context 键存在）
 * I-10 Activity 运行期/声明期错误使用 FrameworkError 类型树
 */
import { describe, expect, test } from "vitest";
import {
    Action,
    Activity,
    ActivityManager,
    ActivityStateError,
    ComputationResult,
    Controller,
    Count,
    Custom,
    DICTIONARY_RECORD,
    Dictionary,
    Entity,
    Interaction,
    isRetryableTransactionError,
    KlassByName,
    MatchExp,
    MonoSystem,
    Property,
    Transfer,
    Transform,
} from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';

describe('r14 improvement fixes', () => {
    // ============ I-2 teardown ============
    test('I-2: controller.teardown() detaches computation listeners', async () => {
        const Src = Entity.create({
            name: 'R14Src',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const Derived = Entity.create({
            name: 'R14Derived',
            properties: [Property.create({ name: 'title', type: 'string' })],
            computation: Transform.create({
                record: Src,
                attributeQuery: ['title'],
                callback: (r: any) => ({ title: r.title }),
            })
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Src, Derived], relations: [], eventSources: [] });
        await controller.setup(true);

        await system.storage.create('R14Src', { title: 'a' });
        expect((await system.storage.find('R14Derived', undefined, undefined, ['*'])).length).toBe(1);

        const callbacksBefore = (system.storage as any).callbacks.size;
        controller.teardown();
        const callbacksAfter = (system.storage as any).callbacks.size;
        expect(callbacksAfter).toBeLessThan(callbacksBefore);

        // 计算监听已注销：新的写入不再触发派生
        await system.storage.create('R14Src', { title: 'b' });
        expect((await system.storage.find('R14Derived', undefined, undefined, ['*'])).length).toBe(1);
        await system.destroy();
    });

    // ============ I-4 dict.get defaultValue 回退 ============
    test('I-4: dict.get falls back to the declared defaultValue when the row is missing', async () => {
        const dict = Dictionary.create({
            name: 'r14ConfigDict',
            type: 'number',
            collection: false,
            defaultValue: () => 42,
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [], relations: [], eventSources: [], dict: [dict] });
        await controller.setup(true);

        // install 持久化了默认值
        expect(await system.storage.dict.get('r14ConfigDict')).toBe(42);

        // 行被删除（新声明未迁移 / 手工清理的等价形态）→ 按声明回退而不是 undefined
        await system.storage.delete(DICTIONARY_RECORD, MatchExp.atom({ key: 'key', value: ['=', 'r14ConfigDict'] }));
        expect(await system.storage.dict.get('r14ConfigDict')).toBe(42);

        // 已存储的显式值优先于声明默认值
        await system.storage.dict.set('r14ConfigDict', 7);
        expect(await system.storage.dict.get('r14ConfigDict')).toBe(7);

        // 无声明的 key 仍然返回 undefined
        expect(await system.storage.dict.get('r14NoSuchKey')).toBe(undefined);
        await system.destroy();
    });

    // ============ I-1 entity/relation Custom useLastValue 默认关闭 ============
    test('I-1: entity-context Custom defaults useLastValue to false; explicit true still provides it', async () => {
        const seenLastValues: unknown[] = [];
        const Src = Entity.create({
            name: 'R14CustomSrc',
            properties: [Property.create({ name: 'n', type: 'number' })]
        });
        const DerivedDefault = Entity.create({
            name: 'R14CustomDerived',
            properties: [Property.create({ name: 'n', type: 'number' })],
            computation: Custom.create({
                name: 'R14EntityCustom',
                dataDeps: { src: { type: 'records', source: Src, attributeQuery: ['n'] } },
                incrementalDataDeps: [],
                compute: async function () { return ComputationResult.skip(); },
                incrementalCompute: async function (lastValue: unknown) {
                    seenLastValues.push(lastValue);
                    return ComputationResult.skip();
                },
            } as any)
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Src, DerivedDefault], relations: [], eventSources: [] });
        await controller.setup(true);
        await system.storage.create('R14CustomSrc', { n: 1 });
        expect(seenLastValues.length).toBeGreaterThan(0);
        // 默认不再拉全表：lastValue 为 undefined
        expect(seenLastValues.every(v => v === undefined)).toBe(true);
        await system.destroy();
    });

    test('I-1: explicit fullOutput opt-in on entity-context Custom still receives records', async () => {
        const seenLastValues: unknown[] = [];
        const Src = Entity.create({
            name: 'R14CustomSrc2',
            properties: [Property.create({ name: 'n', type: 'number' })]
        });
        const Derived = Entity.create({
            name: 'R14CustomDerived2',
            properties: [Property.create({ name: 'n', type: 'number' })],
            computation: Custom.create({
                name: 'R14EntityCustomExplicit',
                useLastValue: true,
                dataDeps: { src: { type: 'records', source: Src, attributeQuery: ['n'] } },
                // entity/relation 输出的 lastValue 是全表快照，必须显式声明高风险策略（知情选择）。
                planIncremental: () => ({
                    type: 'incremental',
                    dataDepKeys: [],
                    needsLastValue: { mode: 'fullOutput', reason: 'r14 test wants the previous output table' },
                }),
                compute: async function () { return ComputationResult.skip(); },
                incrementalCompute: async function (lastValue: unknown) {
                    seenLastValues.push(lastValue);
                    return ComputationResult.skip();
                },
            } as any)
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Src, Derived], relations: [], eventSources: [] });
        await controller.setup(true);
        await system.storage.create('R14CustomSrc2', { n: 1 });
        expect(seenLastValues.length).toBeGreaterThan(0);
        expect(Array.isArray(seenLastValues[0])).toBe(true);
        await system.destroy();
    });

    // ============ I-3 lockRows 锁后按 match 重查 ============
    test('I-3: lockRows returns only rows matching at lock time, with the requested attributeQuery', async () => {
        const Doc = Entity.create({
            name: 'R14LockDoc',
            properties: [
                Property.create({ name: 'status', type: 'string' }),
                Property.create({ name: 'title', type: 'string' })
            ]
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Doc], relations: [], eventSources: [] });
        await controller.setup(true);
        await system.storage.create('R14LockDoc', { status: 'open', title: 'a' });
        await system.storage.create('R14LockDoc', { status: 'open', title: 'b' });
        await system.storage.create('R14LockDoc', { status: 'closed', title: 'c' });

        const locked = await system.storage.runInTransaction({ name: 'r14lock' }, async () => {
            return system.storage.atomic.lockRows('R14LockDoc', MatchExp.atom({ key: 'status', value: ['=', 'open'] }), ['title', 'status']);
        });
        expect(locked.length).toBe(2);
        expect(locked.every((row: any) => row.status === 'open')).toBe(true);

        const none = await system.storage.runInTransaction({ name: 'r14lock2' }, async () => {
            return system.storage.atomic.lockRows('R14LockDoc', MatchExp.atom({ key: 'status', value: ['=', 'archived'] }), ['*']);
        });
        expect(none.length).toBe(0);
        await system.destroy();
    });

    // ============ I-5 事务重试判定 ============
    test('I-5: retryable error codes include SQLITE_BUSY / 57P01 / ECONNRESET; ECONNREFUSED excluded', () => {
        expect(isRetryableTransactionError({ code: '40001' })).toBe(true);
        expect(isRetryableTransactionError({ code: '40P01' })).toBe(true);
        expect(isRetryableTransactionError({ code: 'SQLITE_BUSY' })).toBe(true);
        expect(isRetryableTransactionError({ code: '57P01' })).toBe(true);
        expect(isRetryableTransactionError({ code: 'ECONNRESET' })).toBe(true);
        expect(isRetryableTransactionError({ code: 'EPIPE' })).toBe(true);
        expect(isRetryableTransactionError({ code: 'ECONNREFUSED' })).toBe(false);
        expect(isRetryableTransactionError(new Error('random'))).toBe(false);
        // 链上嵌套的 code 同样识别
        const wrapped = new Error('outer') as Error & { cause?: unknown };
        wrapped.cause = { code: 'SQLITE_BUSY' };
        expect(isRetryableTransactionError(wrapped)).toBe(true);
    });

    // ============ I-6 dispatch 错误响应形态 ============
    test('I-6: dispatch error response carries the same keys as the success response', async () => {
        const User = Entity.create({ name: 'R14User', properties: [Property.create({ name: 'name', type: 'string' })] });
        const denied = Interaction.create({
            name: 'r14Denied',
            action: Action.create({ name: 'r14Denied' }),
            conditions: {
                _type: 'Condition', uuid: 'r14-cond', name: 'deny',
                content: async () => false,
            } as any,
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [], eventSources: [denied] });
        await controller.setup(true);
        const user = await system.storage.create('R14User', { name: 'u' });
        const res = await controller.dispatch(denied, { user });
        expect(res.error).toBeTruthy();
        expect(Object.keys(res).sort()).toEqual(['context', 'data', 'effects', 'error', 'sideEffects']);
        expect(res.data).toBeUndefined();
        expect(res.context).toBeUndefined();
        await system.destroy();
    });

    // ============ I-10 Activity 类型化错误 ============
    test('I-10: activity runtime errors are ActivityStateError instances', async () => {
        const head = Interaction.create({ name: 'r14Head', action: Action.create({ name: 'r14Head' }) });
        const step2 = Interaction.create({ name: 'r14Step2', action: Action.create({ name: 'r14Step2' }) });
        const activity = Activity.create({
            name: 'R14ErrActivity',
            interactions: [head, step2],
            transfers: [Transfer.create({ name: 't', source: head, target: step2 })],
        });
        const User = Entity.create({ name: 'R14User2', properties: [Property.create({ name: 'name', type: 'string' })] });
        const manager = new ActivityManager([activity]);
        const out = manager.getOutput();
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [User, ...out.entities],
            relations: [...out.relations],
            eventSources: [...out.eventSources],
        });
        await controller.setup(true);
        const user = await system.storage.create('R14User2', { name: 'u' });

        // 非 head 交互缺 activityId → ActivityStateError
        const step2ES = controller.findEventSourceByName('R14ErrActivity:r14Step2')!;
        const missing = await controller.dispatch(step2ES, { user });
        expect(missing.error).toBeInstanceOf(ActivityStateError);

        // 不存在的 activityId → ActivityStateError
        const headES = controller.findEventSourceByName('R14ErrActivity:r14Head')!;
        const started = await controller.dispatch(headES, { user });
        expect(started.error).toBeUndefined();
        // 语法合法但不存在的 uuid（避免驱动层 "invalid input syntax for type uuid" 先行报错）
        const bogus = await controller.dispatch(step2ES, { user, activityId: '00000000-0000-7000-8000-000000000000' });
        expect(bogus.error).toBeInstanceOf(ActivityStateError);
        await system.destroy();
    });
});
