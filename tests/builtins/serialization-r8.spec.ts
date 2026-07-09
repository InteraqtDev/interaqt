/**
 * r8 显著改进项回归：序列化往返收尾（r1 I-10 遗留）。
 *
 * - Payload.stringify / PayloadItem.stringify 走统一 stringifyInstance 管线：
 *   items/base/itemRef 编码为 uuid:: 引用，graph round-trip 保持实例身份；
 *   itemRef 不再被手写字段清单静默丢弃。
 * - DataPolicy.stringify 编码 match 函数（func::），round-trip 后过滤语义保留。
 * - EventSource 注册进 core 的 KlassByName；stringify/parse 走统一管线，
 *   guard/resolve 等回调 round-trip 后可用。
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { clearAllInstances, createInstances, KlassByName, Entity, Property, EventSource, EventSourceInstance } from '@core';
import { Interaction, InteractionInstance } from '../../src/builtins/interaction/Interaction.js';
import { Action } from '../../src/builtins/interaction/Action.js';
import { Payload, PayloadInstance } from '../../src/builtins/interaction/Payload.js';
import { PayloadItem, PayloadItemInstance } from '../../src/builtins/interaction/PayloadItem.js';
import { Attributive, AttributiveInstance } from '../../src/builtins/interaction/Attributive.js';
import { DataPolicy, DataPolicyInstance } from '../../src/builtins/interaction/Data.js';
import '../../src/builtins/init.js';

const allKlasses = [Interaction, Action, Payload, PayloadItem, Attributive, DataPolicy, Entity, Property, EventSource];

beforeEach(() => {
    clearAllInstances(...allKlasses);
});

function roundTrip(jsons: string[]) {
    const serialized = `[${jsons.join(',')}]`;
    clearAllInstances(...allKlasses);
    return createInstances(JSON.parse(serialized));
}

describe('r8 serialization fixes', () => {
    test('Payload/PayloadItem round-trip keeps item identity, base reference and itemRef', () => {
        const Post = Entity.create({
            name: 'SerPost',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const authorRef = Attributive.create({ name: 'SerAuthorRef', content: function() { return true } });
        const item = PayloadItem.create({
            name: 'post',
            type: 'object',
            base: Post,
            isRef: true,
            required: true,
            itemRef: authorRef
        });
        const payload = Payload.create({ items: [item] });
        const interaction = Interaction.create({
            name: 'SerCreatePost',
            action: Action.create({ name: 'serCreatePost' }),
            payload
        });

        const jsons = [
            Entity.stringify(Post),
            ...Post.properties.map(p => Property.stringify(p)),
            Attributive.stringify(authorRef),
            PayloadItem.stringify(item),
            Payload.stringify(payload),
            Action.stringify(interaction.action!),
            Interaction.stringify(interaction),
        ];
        const instances = roundTrip(jsons);

        const parsedPayload = instances.get(payload.uuid) as PayloadInstance;
        expect(parsedPayload.items).toHaveLength(1);
        const parsedItem = parsedPayload.items[0];
        // 修复前：items 是裸对象（无 Klass 身份），itemRef 被 stringify 丢弃
        expect(PayloadItem.is(parsedItem)).toBe(true);
        expect(parsedItem.uuid).toBe(item.uuid);
        expect(Entity.is(parsedItem.base)).toBe(true);
        expect(parsedItem.base).toBe(instances.get(Post.uuid));
        expect(Attributive.is(parsedItem.itemRef)).toBe(true);
        expect((parsedItem.itemRef as AttributiveInstance).name).toBe('SerAuthorRef');

        const parsedInteraction = instances.get(interaction.uuid) as InteractionInstance;
        expect(parsedInteraction.payload).toBe(parsedPayload);
    });

    test('DataPolicy round-trip preserves match function', () => {
        const policy = DataPolicy.create({
            match: function(this: unknown, user: { id: string }) {
                return { key: 'author.id', value: ['=', user.id] };
            },
            attributeQuery: ['id', 'title'],
            modifier: { limit: 10 }
        });
        const instances = roundTrip([DataPolicy.stringify(policy)]);
        const parsed = instances.get(policy.uuid) as DataPolicyInstance;
        // 修复前：match 函数被 JSON.stringify 丢成 undefined
        expect(typeof parsed.match).toBe('function');
        expect(parsed.match({ id: 'u1' })).toEqual({ key: 'author.id', value: ['=', 'u1'] });
        expect(parsed.attributeQuery).toEqual(['id', 'title']);
        expect(parsed.modifier).toEqual({ limit: 10 });
    });

    test('EventSource is registered and round-trips callbacks + entity reference', () => {
        expect(KlassByName.get('EventSource')).toBe(EventSource);

        const Log = Entity.create({
            name: 'SerLog',
            properties: [Property.create({ name: 'message', type: 'string' })]
        });
        const source = EventSource.create({
            name: 'SerCron',
            entity: Log,
            guard: async function(args: unknown) { if (!args) throw new Error('no args') },
            mapEventData: (args: unknown) => ({ message: String(args) })
        });

        const jsons = [
            Entity.stringify(Log),
            ...Log.properties.map(p => Property.stringify(p)),
            EventSource.stringify(source as EventSourceInstance),
        ];
        const instances = roundTrip(jsons);

        const parsed = instances.get(source.uuid) as EventSourceInstance;
        expect(parsed.name).toBe('SerCron');
        // 修复前：EventSource 未注册（graph 反序列化直接抛 unknown class）、
        //  stringify 只序列化 name/entity（guard/mapEventData 全部丢失）。
        expect(Entity.is(parsed.entity)).toBe(true);
        expect(parsed.entity).toBe(instances.get(Log.uuid));
        expect(typeof parsed.guard).toBe('function');
        expect(typeof parsed.mapEventData).toBe('function');
        expect((parsed.mapEventData as (args: unknown) => Record<string, unknown>)('hello')).toEqual({ message: 'hello' });
    });
});
