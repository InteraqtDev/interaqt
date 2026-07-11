import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from '@core';
import { DBSetup } from "@storage";
import { SQLiteDB } from '@drivers';

// 第十八轮深度 review 的声明期守卫回归（见 agentspace/output/deep-review-2026-07-11-r18.md）。
//
// F-3 值属性 vs 关系属性命名空间冲突：populateRecordAttributes 把关系属性无条件写进端点
//     record 的属性表，同名值属性被静默吞掉——写入时标量值被当作关联记录 payload 展开
//     （实测字符串被逐字符摊开成对象并创建了假关联记录），查询走关系语义。零告警数据损坏。
// 附带守卫：保留属性名（id/_rowId，relation 另加 source/target）与同记录重复属性名，
//     此前分别被框架主键静默覆盖 / Object.fromEntries 静默保留最后一个。
//     Entity.create/Relation.create 声明期拒绝 + DBSetup.validatePropertyNames 兜底
//     （覆盖 create 之后 push 属性、直接 new 构造等旁路）。

describe('r18 F-3: value property vs relation property namespace collision', () => {
    test('relation sourceProperty colliding with a scalar property on the source entity fails fast at setup', async () => {
        const Contact = Entity.create({
            name: 'R18C1Contact',
            properties: [Property.create({ name: 'label', type: 'string' })],
        });
        const User = Entity.create({
            name: 'R18C1User',
            properties: [Property.create({ name: 'email', type: 'string' })],
        });
        const rel = Relation.create({
            source: User,
            sourceProperty: 'email',   // 与标量属性 email 同名
            target: Contact,
            targetProperty: 'owner',
            type: '1:n',
        });
        const db = new SQLiteDB(':memory:');
        await db.open();
        expect(() => new DBSetup([User, Contact], [rel], db))
            .toThrowError(/relation property 'email' on 'R18C1User' collides with the value property/);
        await db.close();
    });

    test('relation targetProperty colliding with a scalar property on the target entity fails fast at setup', async () => {
        const Tag = Entity.create({
            name: 'R18C2Tag',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        const Post = Entity.create({
            name: 'R18C2Post',
            properties: [Property.create({ name: 'tags', type: 'string' })],
        });
        const rel = Relation.create({
            source: Tag,
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'tags',    // 与 Post 的标量属性 tags 同名
            type: 'n:n',
        });
        const db = new SQLiteDB(':memory:');
        await db.open();
        expect(() => new DBSetup([Tag, Post], [rel], db))
            .toThrowError(/relation property 'tags' on 'R18C2Post' collides with the value property/);
        await db.close();
    });

    test('collision with a filtered variant of the endpoint family is also rejected (shared namespace)', async () => {
        const Base = Entity.create({
            name: 'R18C3Base',
            properties: [
                Property.create({ name: 'kind', type: 'string' }),
                Property.create({ name: 'assignee', type: 'string' }),
            ],
        });
        const ActiveBase = Entity.create({
            name: 'R18C3ActiveBase',
            baseEntity: Base,
            matchExpression: { key: 'kind', value: ['=', 'active'] } as any,
        });
        const Person = Entity.create({
            name: 'R18C3Person',
            properties: [Property.create({ name: 'name', type: 'string' })],
        });
        // filtered 端点上声明的关系属性与 base 的值属性同名 —— 家族共享命名空间，必须拒绝
        const rel = Relation.create({
            source: ActiveBase,
            sourceProperty: 'assignee',
            target: Person,
            targetProperty: 'items',
            type: 'n:1',
        });
        const db = new SQLiteDB(':memory:');
        await db.open();
        expect(() => new DBSetup([Base, ActiveBase, Person], [rel], db))
            .toThrowError(/collides with the value property/);
        await db.close();
    });

    test('non-colliding names keep working', async () => {
        const Contact = Entity.create({
            name: 'R18C4Contact',
            properties: [Property.create({ name: 'label', type: 'string' })],
        });
        const User = Entity.create({
            name: 'R18C4User',
            properties: [Property.create({ name: 'email', type: 'string' })],
        });
        const rel = Relation.create({
            source: User,
            sourceProperty: 'contacts',
            target: Contact,
            targetProperty: 'owner',
            type: '1:n',
        });
        const db = new SQLiteDB(':memory:');
        await db.open();
        const setup = new DBSetup([User, Contact], [rel], db);
        await setup.createTables();
        await db.close();
    });
});

describe('r18 reserved and duplicate property names', () => {
    test('Entity.create rejects a property named id', () => {
        expect(() => Entity.create({
            name: 'R18ReservedId',
            properties: [Property.create({ name: 'id', type: 'string' })],
        })).toThrowError(/Property name "id" .* is reserved/);
    });

    test('Entity.create rejects duplicate property names', () => {
        expect(() => Entity.create({
            name: 'R18DupProp',
            properties: [
                Property.create({ name: 'total', type: 'number' }),
                Property.create({ name: 'total', type: 'number' }),
            ],
        })).toThrowError(/Duplicate property name "total"/);
    });

    test('Relation.create rejects properties named source/target', () => {
        const A = Entity.create({ name: 'R18RelResA' });
        const B = Entity.create({ name: 'R18RelResB' });
        expect(() => Relation.create({
            source: A,
            sourceProperty: 'bs',
            target: B,
            targetProperty: 'as',
            type: 'n:n',
            properties: [Property.create({ name: 'source', type: 'string' })],
        })).toThrowError(/Property name "source" .* is reserved/);
    });

    test('DBSetup safety net catches properties pushed after create', async () => {
        const Sneaky = Entity.create({
            name: 'R18Sneaky',
            properties: [Property.create({ name: 'label', type: 'string' })],
        });
        // create 之后 push（绕过 create 守卫的合法路径），由 DBSetup 兜底
        Sneaky.properties.push(Property.create({ name: '_rowId', type: 'string' }));
        const db = new SQLiteDB(':memory:');
        await db.open();
        expect(() => new DBSetup([Sneaky], [], db))
            .toThrowError(/Property name '_rowId' on entity 'R18Sneaky' is reserved/);
        await db.close();
    });

    test('a plain entity property named __type on a non-merged entity stays legal', () => {
        // 与 r9 的判定一致：非 merged 家族没有判别列，用户自定义 __type 不受保留名限制
        const Legacy = Entity.create({
            name: 'R18LegacyType',
            properties: [Property.create({ name: '__type', type: 'string' })],
        });
        expect(Legacy.properties.some(p => p.name === '__type')).toBe(true);
    });
});
