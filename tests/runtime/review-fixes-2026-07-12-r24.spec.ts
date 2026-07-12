/**
 * r24 深度审查回归（r23 遗留项收口轮）。
 *
 * I-1 —— atomic 读路径 boolean/JSON 不归一化（r22 §三 #1 + r23 §三 #1 的收口）：
 *   QueryExecutor.structureRawReturns 把 SQLite/MySQL 的 boolean 0/1 归一化为 boolean、
 *   JSON 文本 parse 为对象；atomic.get / atomic.replace（record-target 与 global boolean 列）
 *   原样返回驱动值——同一字段 find 返回 true、atomic 返回 1 的跨路径类型分裂。
 *   修复：parseRecordFieldValue / parseGlobalValue 与 structureRawReturns 同一契约。
 *
 * I-2 —— migration 签名对显式 undefined 键与 NaN/Infinity（r19 #3 / r22 §三 #2 / r23 §三 #4）：
 *   canonicalizeArgsForSignature/stableStringify 此前把「键=undefined」与「键缺席」签成不同值
 *   （JSON.stringify(undefined) 非字符串，拼接出非法片段），把 NaN/±Infinity 坍缩为 null
 *   （与真 null 碰撞）。修复：undefined 键按缺席跳过（JSON 语义），非有限数字带标签保持可区分；
 *   语义变更随 MIGRATION_MANIFEST_GENERATOR_VERSION bump 到 "4"（旧 manifest 走 re-baseline 门）。
 *
 * G-1 —— settlePostWriteChecks × 写失败（r21 #2 / r23 §三 #2）的守护测试：
 *   经复现探针证实自然失败路径（insert 失败 + 同数组重试）在 r22 F-2 的 per-attempt
 *   隔离下已经健康（视图事件恰好一份、无幻影）。此用例把该行为固化，防未来回归。
 */
import { describe, expect, test } from "vitest";
import {
    Controller, Custom, Dictionary, Entity, KlassByName, MatchExp,
    MonoSystem, Property, Relation,
} from "interaqt";
import { PGLiteDB, SQLiteDB } from "@drivers";
import { createMigrationManifest } from "../../src/runtime/migration.js";
import type { RecordMutationEvent } from "@runtime";

describe('r24 I-1 — atomic read paths normalize boolean/JSON like find paths', () => {
    test('SQLite record-target: get/replace on boolean and json fields return JS types', async () => {
        const Item = Entity.create({
            name: 'R24BoolItem',
            properties: [
                Property.create({ name: 'flag', type: 'boolean' }),
                Property.create({ name: 'meta', type: 'object' }),
            ],
        });
        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);

        const rec = await system.storage.create('R24BoolItem', { flag: true, meta: { a: 1 } });

        // find 路径（参照系）
        const found = await system.storage.findOne('R24BoolItem',
            MatchExp.atom({ key: 'id', value: ['=', rec.id] }), undefined, ['id', 'flag', 'meta']);
        expect(found.flag).toBe(true);
        expect(found.meta).toEqual({ a: 1 });

        // atomic 路径必须与 find 同型
        const atomicFlag = await system.storage.atomic.get({ recordName: 'R24BoolItem', id: rec.id, field: 'flag' });
        expect(atomicFlag).toBe(true);

        const replaced = await system.storage.atomic.replace(
            { recordName: 'R24BoolItem', id: rec.id, field: 'flag' }, false);
        expect(replaced.oldValue).toBe(true);
        expect(replaced.newValue).toBe(false);

        const atomicMeta = await system.storage.atomic.get({ recordName: 'R24BoolItem', id: rec.id, field: 'meta' });
        expect(atomicMeta).toEqual({ a: 1 });
    });

    test('SQLite global: get with valueType boolean returns boolean', async () => {
        const Item = Entity.create({
            name: 'R24GBoolItem',
            properties: [Property.create({ name: 'n', type: 'number' })],
        });
        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);

        await system.storage.atomic.replace({ key: 'r24flag', valueType: 'boolean', defaultValue: false }, true);
        const value = await system.storage.atomic.get({ key: 'r24flag', valueType: 'boolean', defaultValue: false });
        expect(value).toBe(true);

        const replacedBack = await system.storage.atomic.replace(
            { key: 'r24flag', valueType: 'boolean', defaultValue: false }, false);
        expect(replacedBack.oldValue).toBe(true);
        expect(replacedBack.newValue).toBe(false);
    });

    test('PGLite control group: native boolean semantics unchanged', async () => {
        const Item = Entity.create({
            name: 'R24PgBoolItem',
            properties: [Property.create({ name: 'flag', type: 'boolean' })],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);
        const rec = await system.storage.create('R24PgBoolItem', { flag: true });
        expect(await system.storage.atomic.get({ recordName: 'R24PgBoolItem', id: rec.id, field: 'flag' })).toBe(true);
        await system.destroy();
    });
});

describe('r24 I-2 — migration args signature: undefined keys and non-finite numbers', () => {
    function buildController(dataDepsExtra: Record<string, unknown>) {
        const Task = Entity.create({
            name: 'R24Task',
            properties: [Property.create({ name: 'value', type: 'number' })],
        });
        const d = Dictionary.create({
            name: 'r24total',
            type: 'number',
            computation: Custom.create({
                name: 'R24Total',
                dataDeps: {
                    items: {
                        type: 'records',
                        source: Task,
                        attributeQuery: ['value'],
                        ...dataDepsExtra,
                    },
                },
                compute: async function (this: unknown, deps: { items?: Array<{ value?: number }> }) {
                    return (deps.items || []).reduce((s, r) => s + (r.value || 0), 0);
                },
            }),
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        return new Controller({ system, entities: [Task], relations: [], dict: [d] });
    }

    function argsSignatureOf(controller: Controller) {
        return createMigrationManifest(controller)
            .computations.find(c => c.id.includes('r24total'))?.argsSignature;
    }

    test('explicit-undefined key and absent key sign identically', () => {
        expect(argsSignatureOf(buildController({ match: undefined })))
            .toBe(argsSignatureOf(buildController({})));
    });

    test('NaN, Infinity, and null all sign distinctly', () => {
        const sigNaN = argsSignatureOf(buildController({ threshold: NaN }));
        const sigInf = argsSignatureOf(buildController({ threshold: Infinity }));
        const sigNull = argsSignatureOf(buildController({ threshold: null }));
        expect(sigNaN).not.toBe(sigNull);
        expect(sigInf).not.toBe(sigNull);
        expect(sigNaN).not.toBe(sigInf);
    });

    test('normal literal args keep stable signatures across identical declarations', () => {
        expect(argsSignatureOf(buildController({ threshold: 5 })))
            .toBe(argsSignatureOf(buildController({ threshold: 5 })));
        expect(argsSignatureOf(buildController({ threshold: 5 })))
            .not.toBe(argsSignatureOf(buildController({ threshold: 6 })));
    });
});

describe('r24 G-1 — guard: failed write + same events array retry stays phantom-free', () => {
    test('insert failure then retry: exactly one set of create + filtered-view events', { timeout: 30000 }, async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'level', type: 'string' })],
        });
        const OwnProfile = Relation.create({
            source: User, sourceProperty: 'profile', target: Profile, targetProperty: 'owner',
            type: '1:1', isTargetReliance: true,
            properties: [Property.create({ name: 'level', type: 'string' })],
        });
        const VipLink = Relation.create({
            name: 'VipLink',
            baseRelation: OwnProfile,
            sourceProperty: 'vipProfile',
            targetProperty: 'vipOwner',
            matchExpression: MatchExp.atom({ key: 'level', value: ['=', 'vip'] }),
        });

        const db = new PGLiteDB();
        const system = new MonoSystem(db);
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [User, Profile],
            relations: [OwnProfile, VipLink],
        });
        await controller.setup(true);

        const originalInsert = db.insert.bind(db);
        let failNext = false;
        ;(db as unknown as { insert: typeof db.insert }).insert = async (sql: string, params: unknown[], name?: string) => {
            if (failNext && sql.includes('INSERT INTO')) {
                failNext = false;
                throw new Error('injected insert failure');
            }
            return originalInsert(sql, params, name);
        };

        const events: RecordMutationEvent[] = [];
        failNext = true;
        await expect(system.storage.create('User', {
            name: 'u1',
            profile: { level: 'vip', '&': { level: 'vip' } },
        }, events)).rejects.toThrow('injected insert failure');
        // 失败 attempt 不得在调用方数组留下任何事件（r22 F-2 per-attempt 隔离）
        expect(events).toHaveLength(0);

        const user = await system.storage.create('User', {
            name: 'u1',
            profile: { level: 'vip', '&': { level: 'vip' } },
        }, events);

        // 成功 attempt 恰好一份：User create + Profile create + link create + VipLink 视图 create
        expect(events.filter(e => e.type === 'create' && e.recordName === 'User')).toHaveLength(1);
        expect(events.filter(e => e.type === 'create' && e.recordName === 'VipLink')).toHaveLength(1);
        const userWithProfile = await system.storage.findOne('User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }), undefined,
            ['id', ['profile', { attributeQuery: ['id'] }]]);
        expect(userWithProfile.profile?.id).toBeTruthy();
        await system.destroy();
    });
});
