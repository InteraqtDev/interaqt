/**
 * r23 深度审查回归。
 *
 * F-1 —— 同一 source 上多条 1:1 isTargetReliance 指向同一 target 实体：
 *   第一条合表成功后第二条被 joinTables 早退当成成功，两条 link 都标 combined，
 *   但 target 列只分配一份 → create 时 INSERT「column specified more than once」。
 *   修复：合表前按 (source, target) 认领，第二条 fail-fast。
 *
 * I-1 —— runInTransaction 回滚后调用方 events 数组残留幻影事件：
 *   r22 F-2 只隔离了事务外重试路径；事务内 callWithEvents 仍在 COMMIT 前 push。
 *   修复：事务上下文记录数组基线，最外层回滚时截断。
 *
 * I-2 —— Dictionary defaultValue ∥ computation 竞争写通道（Property 已有对称守卫）。
 * I-3 —— Entity.inputEntities: [] 空合并体（Relation.inputRelations 已拒）。
 * I-4 —— Property/Dictionary.type 白名单（未知类型静默落到非法 SQL 类型）。
 * I-5 —— Entity.clone(deep=true) 此前忽略 deep，与 Relation.clone 不对齐。
 */
import { describe, expect, test } from "vitest";
import {
    Controller, Entity, KlassByName, MatchExp,
    MonoSystem, Property, Relation, Dictionary,
} from "interaqt";
import { PGLiteDB } from "@drivers";
import type { RecordMutationEvent } from "@runtime";

describe('r23 F-1 — dual same-target 1:1 isTargetReliance must fail-fast at setup', () => {
    test('setup rejects two 1:1 reliance relations from User to Profile', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const Profile = Entity.create({
            name: 'Profile',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'kind', type: 'string' }),
            ],
        });
        const MainProfile = Relation.create({
            source: User,
            sourceProperty: 'mainProfile',
            target: Profile,
            targetProperty: 'mainOwner',
            type: '1:1',
            isTargetReliance: true,
        });
        const AltProfile = Relation.create({
            source: User,
            sourceProperty: 'altProfile',
            target: Profile,
            targetProperty: 'altOwner',
            type: '1:1',
            isTargetReliance: true,
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [User, Profile],
            relations: [MainProfile, AltProfile],
        });

        await expect(controller.setup(true)).rejects.toThrow(
            /Cannot combine multiple 1:1 isTargetReliance relations from "User" to "Profile"/
        );
    });

    test('single 1:1 isTargetReliance still sets up and supports create/delete', async () => {
        const User = Entity.create({
            name: 'User',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const Profile = Entity.create({
            name: 'Profile',
            properties: [Property.create({ name: 'title', type: 'string' })],
        });
        const OwnProfile = Relation.create({
            source: User,
            sourceProperty: 'profile',
            target: Profile,
            targetProperty: 'owner',
            type: '1:1',
            isTargetReliance: true,
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [User, Profile],
            relations: [OwnProfile],
        });
        await controller.setup(true);

        const user = await system.storage.create('User', {
            name: 'u1',
            profile: { title: 'vip' },
        });
        const found = await system.storage.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user.id] }),
            undefined,
            ['id', ['profile', { attributeQuery: ['id', 'title'] }]]
        );
        expect(found.profile.title).toBe('vip');
    });
});

describe('r23 I-1 — runInTransaction rollback must not leave phantom events', () => {
    test('mid-txn throw truncates caller events array to pre-txn baseline', async () => {
        const Item = Entity.create({
            name: 'R23PhantomItem',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);

        const events: RecordMutationEvent[] = [];
        await expect(system.storage.runInTransaction({ name: 'r23-abort' }, async () => {
            await system.storage.create('R23PhantomItem', { name: 'a' }, events);
            throw new Error('abort');
        })).rejects.toThrow('abort');

        const rows = await system.storage.find('R23PhantomItem', undefined, undefined, ['id', 'name']);
        expect(rows).toHaveLength(0);
        expect(events).toHaveLength(0);
    });

    test('partial batch: first create then throw — no phantom prefix after rollback', async () => {
        const Item = Entity.create({
            name: 'R23PartialItem',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [Item], relations: [] });
        await controller.setup(true);

        const events: RecordMutationEvent[] = [];
        // Seed a successful event outside the aborting txn so baseline > 0.
        await system.storage.create('R23PartialItem', { name: 'seed' }, events);
        expect(events).toHaveLength(1);
        const baseline = events.length;

        await expect(system.storage.runInTransaction({ name: 'r23-partial' }, async () => {
            await system.storage.create('R23PartialItem', { name: 'a' }, events);
            await system.storage.create('R23PartialItem', { name: 'b' }, events);
            throw new Error('abort-partial');
        })).rejects.toThrow('abort-partial');

        expect(events).toHaveLength(baseline);
        const rows = await system.storage.find('R23PartialItem', undefined, undefined, ['id', 'name']);
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('seed');
    });
});

describe('r23 I-2/I-3/I-4 — declaration guards', () => {
    test('Entity rejects empty inputEntities', () => {
        expect(() => Entity.create({ name: 'EmptyMerged', inputEntities: [] as any }))
            .toThrow(/empty array/);
    });

    test('Property rejects unknown type strings', () => {
        expect(() => Property.create({ name: 'bad', type: 'strng' as any }))
            .toThrow(/unsupported type "strng"/);
        expect(() => Property.create({ name: 'bad2', type: 'String' as any }))
            .toThrow(/unsupported type "String"/);
        expect(() => Property.create({ name: 'ok', type: 'object' })).not.toThrow();
        expect(() => Property.create({ name: 'okJson', type: 'json' })).not.toThrow();
        expect(() => Property.create({ name: 'okId', type: 'id' })).not.toThrow();
    });

    test('Dictionary rejects unknown type strings', () => {
        expect(() => Dictionary.create({ name: 'bad', type: 'strng' as any }))
            .toThrow(/unsupported type "strng"/);
        expect(() => Dictionary.create({ name: 'ok', type: 'object' })).not.toThrow();
    });
});

describe('r23 I-5 — Entity.clone honors deep', () => {
    test('deep clone does not share Property instances with the original', () => {
        const original = Entity.create({
            name: 'CloneHost',
            properties: [Property.create({ name: 'title', type: 'string' })],
        });
        const cloned = Entity.clone(original, true);
        expect(cloned.properties).not.toBe(original.properties);
        expect(cloned.properties[0]).not.toBe(original.properties[0]);
        expect(cloned.properties[0].name).toBe('title');
        // Mutating the clone must not leak into the declaration graph.
        cloned.properties[0].name = 'mutated';
        expect(original.properties[0].name).toBe('title');
    });
});
