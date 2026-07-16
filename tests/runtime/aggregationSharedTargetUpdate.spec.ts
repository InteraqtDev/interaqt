import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import {
    Controller,
    KlassByName,
    MatchExp,
    MonoSystem,
    Summation,
    WeightedSummation,
} from 'interaqt';

/**
 * 回归：property 聚合 update 分支的反查必须带宿主端约束（aggregationTemplate）。
 *
 * 缺陷形态：关联实体被多个宿主共享（n:n 共享 target / 深路径共享深层记录）时，
 * 旧实现 findOne(relation, { side.id = 更新实体 id }) 不约束宿主——每个宿主的增量
 * 读写"第一条指向该实体的 link"的贡献状态，聚合值静默算错。
 *
 * 掩蔽机理（escape 分析）：PGLite/PG 的 MVCC 把被更新行移到扫描序末尾，逐宿主处理时
 * findOne 恰好"轮转"到各自正确的 link——计算层 fuzz 只跑 PGLite 因此十余轮失明；
 * SQLite 的稳定 rowid 序让两个宿主都读到同一条 link，确定性出错。
 * 教训：无唯一性约束的 findOne 语义上是"任取一条"，凡是把它当"恰好那条"用的地方
 * 都是潜伏缺陷；本回归按方言矩阵跑（SQLite 必须在列，r27 I-3 规则 7）。
 */

const DRIVERS = [
    { name: 'SQLiteDB', create: () => new SQLiteDB() },
    { name: 'PGLiteDB', create: () => new PGLiteDB() },
] as const

describe.each(DRIVERS)('aggregation update-branch host constraint ($name)', ({ create }) => {
    test('n:n shared target: per-host weighted contribution uses own link data', async () => {
        const ownerEntity = Entity.create({
            name: 'StOwner',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const itemEntity = Entity.create({
            name: 'StItem',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'score', type: 'number' })
            ]
        });
        const relation = Relation.create({
            source: ownerEntity,
            sourceProperty: 'items',
            target: itemEntity,
            targetProperty: 'owners',
            type: 'n:n',
            properties: [Property.create({ name: 'weight', type: 'number' })]
        });
        ownerEntity.properties.push(
            Property.create({
                name: 'weightedScore', type: 'number',
                computation: WeightedSummation.create({
                    property: 'items',
                    attributeQuery: ['score', ['&', { attributeQuery: ['weight'] }]],
                    callback: (item: { score?: number, ['&']?: { weight?: number } }) =>
                        ({ weight: item['&']?.weight ?? 0, value: item.score ?? 0 })
                })
            }),
            Property.create({
                name: 'scoreSum', type: 'number',
                computation: Summation.create({ property: 'items', attributeQuery: ['score'] })
            })
        );

        const system = new MonoSystem(create());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [ownerEntity, itemEntity], relations: [relation] });
        await controller.setup(true);

        const ownerA = await system.storage.create('StOwner', { name: 'A' })
        const ownerB = await system.storage.create('StOwner', { name: 'B' })
        const item = await system.storage.create('StItem', { title: 'shared', score: 10 })
        await system.storage.addRelationByNameById('StOwner_items_owners_StItem', ownerA.id, item.id, { weight: 2 })
        await system.storage.addRelationByNameById('StOwner_items_owners_StItem', ownerB.id, item.id, { weight: 5 })

        const read = async (id: unknown) => await system.storage.findOne('StOwner',
            MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, ['id', 'weightedScore', 'scoreSum'])

        let a = await read(ownerA.id)
        let b = await read(ownerB.id)
        expect(a.weightedScore).toBe(20)
        expect(b.weightedScore).toBe(50)

        // 共享 target 的实体字段更新：每个宿主的增量必须用自己 link 的 weight（2 / 5）
        await system.storage.update('StItem', MatchExp.atom({ key: 'id', value: ['=', item.id] }), { score: 30 })
        a = await read(ownerA.id)
        b = await read(ownerB.id)
        expect(a.weightedScore).toBe(60)
        expect(b.weightedScore).toBe(150)
        expect(a.scoreSum).toBe(30)
        expect(b.scoreSum).toBe(30)

        // 第二轮更新：贡献状态若写错行，这里会以累积漂移现形
        await system.storage.update('StItem', MatchExp.atom({ key: 'id', value: ['=', item.id] }), { score: 100 })
        a = await read(ownerA.id)
        b = await read(ownerB.id)
        expect(a.weightedScore).toBe(200)
        expect(b.weightedScore).toBe(500)

        // removeRelation 读逐项状态做负增量：状态错行在这里现形
        const linkB = await system.storage.findOne('StOwner_items_owners_StItem',
            MatchExp.atom({ key: 'source.id', value: ['=', ownerB.id] }), undefined, ['id'])
        await system.storage.removeRelationByName('StOwner_items_owners_StItem',
            MatchExp.atom({ key: 'id', value: ['=', linkB.id] }))
        a = await read(ownerA.id)
        b = await read(ownerB.id)
        expect(a.weightedScore).toBe(200)
        expect(a.scoreSum).toBe(100)
        expect(b.weightedScore).toBe(0)
        expect(b.scoreSum).toBe(0)

        await system.destroy()
    })

    test('deep path shared record: aggregation converges when one deep record feeds multiple links', async () => {
        // 同一宿主的两条 link 经深路径共享同一深层记录（items.detail）。
        // 当前实现对 >1 段的 relatedAttribute 走全量重算守卫（aggregationTemplate L405+），
        // 本用例是该邻域格的行为固化：若未来把深路径改为增量（A3 收口），
        // 「一次深层更新影响同宿主多条 link 贡献」必须保持收敛——修复后的 find + 逐条
        // 重算已为此准备好（单条命中时与旧行为一致）。
        const ownerEntity = Entity.create({
            name: 'DpOwner',
            properties: [Property.create({ name: 'name', type: 'string' })]
        });
        const itemEntity = Entity.create({
            name: 'DpItem',
            properties: [Property.create({ name: 'title', type: 'string' })]
        });
        const detailEntity = Entity.create({
            name: 'DpDetail',
            properties: [Property.create({ name: 'cost', type: 'number' })]
        });
        const ownerItemRelation = Relation.create({
            source: ownerEntity,
            sourceProperty: 'items',
            target: itemEntity,
            targetProperty: 'owner',
            type: '1:n'
        });
        const itemDetailRelation = Relation.create({
            source: itemEntity,
            sourceProperty: 'detail',
            target: detailEntity,
            targetProperty: 'items',
            type: 'n:1'
        });
        ownerEntity.properties.push(
            Property.create({
                name: 'totalCost', type: 'number',
                computation: Summation.create({
                    property: 'items',
                    attributeQuery: [['detail', { attributeQuery: ['cost'] }]]
                })
            })
        );

        const system = new MonoSystem(create());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [ownerEntity, itemEntity, detailEntity],
            relations: [ownerItemRelation, itemDetailRelation]
        });
        await controller.setup(true);

        const owner = await system.storage.create('DpOwner', { name: 'o' })
        const detail = await system.storage.create('DpDetail', { cost: 10 })
        await system.storage.create('DpItem', { title: 'i1', owner: { id: owner.id }, detail: { id: detail.id } })
        await system.storage.create('DpItem', { title: 'i2', owner: { id: owner.id }, detail: { id: detail.id } })

        const read = async () => await system.storage.findOne('DpOwner',
            MatchExp.atom({ key: 'id', value: ['=', owner.id] }), undefined, ['id', 'totalCost'])

        let snapshot = await read()
        expect(snapshot.totalCost).toBe(20)  // 两条 item 各贡献 10

        // 共享 detail 更新：两条 link 的贡献都要变成 25
        await system.storage.update('DpDetail', MatchExp.atom({ key: 'id', value: ['=', detail.id] }), { cost: 25 })
        snapshot = await read()
        expect(snapshot.totalCost).toBe(50)

        // 二轮更新暴露单边陈旧状态
        await system.storage.update('DpDetail', MatchExp.atom({ key: 'id', value: ['=', detail.id] }), { cost: 7 })
        snapshot = await read()
        expect(snapshot.totalCost).toBe(14)

        await system.destroy()
    })
})
