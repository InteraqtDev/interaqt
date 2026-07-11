/**
 * r17 deep-review reproductions — runtime layer
 * (agentspace/output/deep-review-2026-07-11-r17.md)
 *
 * Committed as failing-by-design (`test.fails`) reproductions, following the
 * repo convention (see review-repro-computations.spec.ts). Each test asserts
 * the CORRECT behavior and currently fails because of the bug it documents.
 * When a bug is fixed, flip its test from `test.fails` to `test`.
 *
 * - F-3 (runtime face): symmetric n:n relation + property-level aggregation
 *   WITH callback. A single link row carries BOTH endpoints' contributions,
 *   but the per-item RecordBoundState is keyed by the link row alone, so the
 *   two hosts' contributions collide: the second endpoint reads the first
 *   endpoint's item state. Symptom on create: one side counts 0; symptom on
 *   delete: "count became negative" ComputationError, transaction rolled back
 *   (the delete becomes impossible).
 * - F-4: '&' link-property change via same-id ref update emits no events
 *   (storage face in tests/storage/review-repro-r17.spec.ts), so aggregations
 *   over link properties go permanently stale.
 */
import { describe, expect, test } from "vitest";
import { Entity, Property, Relation, Count, WeightedSummation, KlassByName, MonoSystem, Controller, MatchExp } from 'interaqt';
import { PGLiteDB } from '@drivers';

async function bootstrap(entities: any[], relations: any[]) {
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities, relations });
    await controller.setup(true);
    return system.storage;
}

describe('r17 F-3: symmetric relation + callback aggregation collides item state', () => {
    test.fails('Count with callback on a symmetric relation must count on both endpoints and survive deletion', async () => {
        const User = Entity.create({
            name: 'U',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'active', type: 'boolean' })
            ]
        });
        const friends = Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            type: 'n:n',
        });
        User.properties.push(Property.create({
            name: 'activeFriendCount',
            type: 'number',
            computation: Count.create({
                property: 'friends',
                attributeQuery: ['active'],
                callback: (friend: any) => !!friend.active
            }) as any
        }));

        const storage = await bootstrap([User], [friends]);
        const a = await storage.create('U', { name: 'A', active: true });
        const b = await storage.create('U', { name: 'B', active: true });
        await storage.addRelationByNameById(friends.name!, a.id, b.id, {});

        const a1 = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['*']);
        const b1 = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', b.id] }), undefined, ['*']);
        // 现状：isItemMatchCount 以 link 行为 key，两个宿主共享一个状态槽——
        // 第二个宿主的增量读到第一个宿主写入的 oldValue=true，delta=0，计数停在 0。
        expect(a1.activeFriendCount).toBe(1);
        expect(b1.activeFriendCount).toBe(1);

        // 删边：现状下 A 侧状态被 B 侧提前复位/读走，increment(-1) 把 0 减成 -1，
        // assertNonNegative 抛 ComputationError，整个删除事务回滚（删除操作不可用）。
        const links = await storage.findRelationByName(friends.name!, undefined, undefined, ['id']);
        await storage.removeRelationByName(friends.name!, MatchExp.atom({ key: 'id', value: ['=', links[0].id] }));

        const a2 = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['*']);
        const b2 = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', b.id] }), undefined, ['*']);
        expect(a2.activeFriendCount).toBe(0);
        expect(b2.activeFriendCount).toBe(0);
    });
});

describe('r17 F-4: & link-property change via same-id ref update must propagate', () => {
    test.fails('WeightedSummation over link property must update when & data changes through entity update', async () => {
        const Customer = Entity.create({
            name: 'Customer',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const Product = Entity.create({
            name: 'Product',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const purchase = Relation.create({
            source: Customer, sourceProperty: 'boughtProduct', target: Product, targetProperty: 'buyers',
            type: 'n:1',
            properties: [Property.create({ name: 'quantity', type: 'number' })]
        });
        Customer.properties.push(Property.create({
            name: 'totalQuantity',
            type: 'number',
            computation: WeightedSummation.create({
                property: 'boughtProduct',
                attributeQuery: [['&', { attributeQuery: ['quantity'] }]],
                callback: (product: any) => ({ weight: 1, value: product?.['&']?.quantity ?? 0 })
            }) as any
        }));

        const storage = await bootstrap([Customer, Product], [purchase]);
        const prod = await storage.create('Product', { title: 'T' });
        const cust = await storage.create('Customer', { name: 'C', boughtProduct: { id: prod.id, '&': { quantity: 2 } } });

        const row1 = await storage.findOne('Customer', MatchExp.atom({ key: 'id', value: ['=', cust.id] }), undefined, ['*']);
        expect(row1.totalQuantity).toBe(2);

        // 同 id ref + '&' 改成 5：数据写入了 link 列，但 storage 不发任何事件
        // （preprocessSameRowData 只在 related id 变化时生成 link 事件）→ 计算保持 2。
        // 对照组：直接 updateRelationByName 改 quantity 会正确传播到 5。
        await storage.update('Customer', MatchExp.atom({ key: 'id', value: ['=', cust.id] }), { boughtProduct: { id: prod.id, '&': { quantity: 5 } } });

        const relRows = await storage.findRelationByName(purchase.name!, undefined, undefined, ['quantity']);
        expect(relRows[0]?.quantity).toBe(5);  // 数据面已经是 5

        const row2 = await storage.findOne('Customer', MatchExp.atom({ key: 'id', value: ['=', cust.id] }), undefined, ['*']);
        expect(row2.totalQuantity).toBe(5);    // 计算面必须跟上
    });
});
