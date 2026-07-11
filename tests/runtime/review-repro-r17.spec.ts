/**
 * r17 deep-review regressions — runtime layer
 * (agentspace/output/deep-review-2026-07-11-r17.md)
 *
 * Originally committed as failing-by-design (`test.fails`) reproductions;
 * the bugs are fixed, so these now assert the correct behavior:
 *
 * - F-3: symmetric n:n relation + property-level aggregation WITH callback.
 *   A single link row carries BOTH endpoints' contributions, so per-link item
 *   state cannot be attributed to one host — the aggregation template now
 *   falls back to full recompute for symmetric relations (and skips writing
 *   the per-item state). Both endpoints count correctly and edge deletion no
 *   longer crashes with "count became negative".
 * - F-2 (runtime face): '&' link-property change via same-id ref update now
 *   emits a link update event (storage face in
 *   tests/storage/review-repro-r17.spec.ts), so aggregations over link
 *   properties propagate.
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
    test('Count with callback on a symmetric relation must count on both endpoints and survive deletion', async () => {
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
        // 对称关系下同一条 link 行承载两端宿主的贡献，逐项状态无法归属单一宿主——
        // 聚合模板对对称关系退回全量重算，两端都必须计入。
        expect(a1.activeFriendCount).toBe(1);
        expect(b1.activeFriendCount).toBe(1);

        // 删边：两端都归零，且不允许出现 "count became negative" 崩溃（事务回滚导致删除不可用）。
        const links = await storage.findRelationByName(friends.name!, undefined, undefined, ['id']);
        await storage.removeRelationByName(friends.name!, MatchExp.atom({ key: 'id', value: ['=', links[0].id] }));

        const a2 = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', a.id] }), undefined, ['*']);
        const b2 = await storage.findOne('U', MatchExp.atom({ key: 'id', value: ['=', b.id] }), undefined, ['*']);
        expect(a2.activeFriendCount).toBe(0);
        expect(b2.activeFriendCount).toBe(0);
    });
});

describe('r17 F-4: & link-property change via same-id ref update must propagate', () => {
    test('WeightedSummation over link property must update when & data changes through entity update', async () => {
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

        // 同 id ref + '&' 改成 5：数据面与事件面必须同步——
        // preprocessSameRowData 对同 id 原地更新补发 link update 事件，聚合增量跟进。
        await storage.update('Customer', MatchExp.atom({ key: 'id', value: ['=', cust.id] }), { boughtProduct: { id: prod.id, '&': { quantity: 5 } } });

        const relRows = await storage.findRelationByName(purchase.name!, undefined, undefined, ['quantity']);
        expect(relRows[0]?.quantity).toBe(5);  // 数据面

        const row2 = await storage.findOne('Customer', MatchExp.atom({ key: 'id', value: ['=', cust.id] }), undefined, ['*']);
        expect(row2.totalQuantity).toBe(5);    // 计算面
    });
});
