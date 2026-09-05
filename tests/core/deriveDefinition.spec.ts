import { describe, test, expect, beforeEach } from 'vitest';
import {
    Entity, Relation, Property, RefContainer,
    clearAllInstances, stringifyAllInstances,
} from '@core';
import type { EntityInstance, RelationInstance, PropertyInstance } from '@core';

// M-02（controller-retention-via-property-instances）：Entity/Relation/Property.derive
// 是框架合成派生定义的唯一构造路径——与 create 共享同一声明期校验（合法面与错误信息逐字
// 一致），但不写入 X.instances、不参与 stringifyAllInstances、每次产生新 uuid。
// 本 spec 在生产代码未改走 derive 的当前阶段就必须全绿：它固定的是 derive 自身的合同。

beforeEach(() => {
    clearAllInstances(Entity, Relation, Property);
});

function errorMessage(action: () => unknown): string {
    try {
        action();
        return '(no throw)';
    } catch (e) {
        return e instanceof Error ? e.message : String(e);
    }
}

describe('derive does not register into the user declaration registry', () => {
    test('Property.derive leaves Property.instances untouched', () => {
        const before = Property.instances.length;
        const derived = Property.derive({ name: 'score', type: 'number', defaultValue: () => 0 });
        expect(Property.instances.length).toBe(before);
        expect(Property.instances).not.toContain(derived);
    });

    test('Entity.derive leaves Entity.instances untouched', () => {
        const before = Entity.instances.length;
        const derived = Entity.derive({ name: 'Box', properties: [] });
        expect(Entity.instances.length).toBe(before);
        expect(Entity.instances).not.toContain(derived);
    });

    test('Relation.derive leaves Relation.instances untouched', () => {
        const a = Entity.derive({ name: 'SrcA', properties: [] });
        const b = Entity.derive({ name: 'TgtB', properties: [] });
        const before = Relation.instances.length;
        const derived = Relation.derive({
            source: a, sourceProperty: 'items',
            target: b, targetProperty: 'owner',
            type: '1:n',
        });
        expect(Relation.instances.length).toBe(before);
        expect(Relation.instances).not.toContain(derived);
    });

    test('derive does not appear in stringifyAllInstances output', () => {
        const before = stringifyAllInstances();
        Property.derive({ name: 'p1', type: 'string' });
        Entity.derive({ name: 'E1', properties: [Property.derive({ name: 'f', type: 'string' })] });
        Relation.derive({
            source: Entity.derive({ name: 'S', properties: [] }),
            sourceProperty: 'xs',
            target: Entity.derive({ name: 'T', properties: [] }),
            targetProperty: 'ys',
            type: 'n:n',
        });
        expect(stringifyAllInstances()).toBe(before);
    });

    test('create still registers (the purity assertions above are not vacuous)', () => {
        const before = stringifyAllInstances();
        const created = Property.create({ name: 'ctl', type: 'string' });
        expect(Property.instances).toContain(created);
        expect(stringifyAllInstances()).not.toBe(before);
    });
});

describe('derive produces a fresh unregistered identity', () => {
    test('two derives of identical args get distinct uuids', () => {
        const args = { name: 'same', type: 'string' } as const;
        const d1 = Property.derive(args);
        const d2 = Property.derive(args);
        expect(d1.uuid).toBeTruthy();
        expect(d1.uuid).not.toBe(d2.uuid);
    });

    test('derive accepts no options and leaves _options undefined (no explicit uuid reuse)', () => {
        // 形态由签名保证（TS 层面无第二参数）；arity 是运行时可见的同一事实。
        expect(Property.derive.length).toBe(1);
        expect(Entity.derive.length).toBe(1);
        expect(Relation.derive.length).toBe(1);
        const derived = Property.derive({ name: 'noOpts', type: 'string' });
        expect(derived._options).toBeUndefined();
    });

    test('derived instances are distinguishable from created ones by uuid', () => {
        const created = Property.create({ name: 'created', type: 'string' });
        const derived = Property.derive({ name: 'created', type: 'string' });
        expect(derived.uuid).not.toBe(created.uuid);
    });
});

describe('derive validation is identical to create', () => {
    // 同一份非法 args：derive 与 create 必须抛出逐字相同的错误信息（共享校验块），
    // 且都真实抛错（'(no throw)' 哨兵防止两侧都静默通过）。
    const propertyBadCases: Array<[string, () => unknown]> = [
        ['invalid name', () => ({ name: 'has space!', type: 'string' })],
        ['unsupported type', () => ({ name: 't', type: 'notAType' })],
        ['non-function defaultValue', () => ({ name: 't', type: 'string', defaultValue: 'user' })],
        ['async defaultValue', () => ({ name: 't', type: 'number', defaultValue: async () => 1 })],
        ['computed + computation', () => ({ name: 't', type: 'number', computed: (r: object) => 1, computation: {} as never })],
    ];
    for (const [label, makeArgs] of propertyBadCases) {
        test(`Property.derive: ${label}`, () => {
            const createMessage = errorMessage(() => Property.create(makeArgs() as never));
            const deriveMessage = errorMessage(() => Property.derive(makeArgs() as never));
            expect(createMessage).not.toBe('(no throw)');
            expect(deriveMessage).toBe(createMessage);
        });
    }

    const entityBadCases: Array<[string, () => unknown]> = [
        ['invalid name', () => ({ name: 'bad name!' })],
        ['baseEntity without matchExpression', () => ({ name: 'F', baseEntity: Entity.create({ name: 'BaseE' }) })],
        ['matchExpression without baseEntity', () => ({ name: 'F', matchExpression: { key: 'k', value: ['=', 1] } })],
        ['merged entity with properties', () => ({
            name: 'M',
            inputEntities: [Entity.create({ name: 'InA' }), Entity.create({ name: 'InB' })],
            properties: [Property.create({ name: 'extra', type: 'string' })],
        })],
        ['empty inputEntities', () => ({ name: 'M', inputEntities: [] })],
    ];
    for (const [label, makeArgs] of entityBadCases) {
        test(`Entity.derive: ${label}`, () => {
            const createMessage = errorMessage(() => Entity.create(makeArgs() as never));
            const deriveMessage = errorMessage(() => Entity.derive(makeArgs() as never));
            expect(createMessage).not.toBe('(no throw)');
            expect(deriveMessage).toBe(createMessage);
        });
    }

    const user = () => Entity.create({ name: 'U' });
    const post = () => Entity.create({ name: 'P' });
    const relationBadCases: Array<[string, () => unknown]> = [
        ['invalid explicit name', () => ({ name: 'bad name!', source: user(), sourceProperty: 'a', target: post(), targetProperty: 'b', type: '1:n' })],
        ['invalid type', () => ({ source: user(), sourceProperty: 'a', target: post(), targetProperty: 'b', type: 'many' })],
        ['invalid sourceProperty', () => ({ source: user(), sourceProperty: 'not ok', target: post(), targetProperty: 'b', type: '1:n' })],
        ['missing required fields', () => ({ source: user(), sourceProperty: 'a' })],
        ['matchExpression without baseRelation', () => ({ source: user(), sourceProperty: 'a', target: post(), targetProperty: 'b', type: '1:n', matchExpression: { key: 'k', value: ['=', 1] } })],
        ['merged relation with properties', () => ({
            inputRelations: [
                Relation.create({ source: user(), sourceProperty: 'a1', target: post(), targetProperty: 'b1', type: '1:n' }),
                Relation.create({ source: user(), sourceProperty: 'a2', target: post(), targetProperty: 'b2', type: '1:n' }),
            ],
            sourceProperty: 'merged',
            targetProperty: 'mergedBy',
            properties: [Property.create({ name: 'extra', type: 'string' })],
        })],
        ['merged relation missing sourceProperty', () => ({
            inputRelations: [
                Relation.create({ source: user(), sourceProperty: 'a1', target: post(), targetProperty: 'b1', type: '1:n' }),
            ],
            targetProperty: 'mergedBy',
        })],
    ];
    for (const [label, makeArgs] of relationBadCases) {
        test(`Relation.derive: ${label}`, () => {
            const createMessage = errorMessage(() => Relation.create(makeArgs() as never));
            const deriveMessage = errorMessage(() => Relation.derive(makeArgs() as never));
            expect(createMessage).not.toBe('(no throw)');
            expect(deriveMessage).toBe(createMessage);
        });
    }

    test('derive rejects reused registry uuid only via create (derive never sees options)', () => {
        const created = Entity.create({ name: 'Dup' });
        const message = errorMessage(() => Entity.create({ name: 'Dup2' }, { uuid: created.uuid }));
        expect(message).toContain('duplicate uuid');
        // derive 没有登记轨，同一 uuid 不可能与注册表冲突——它根本不接受 options。
        expect(Entity.derive.length).toBe(1);
    });
});

describe('derive returns a first-class instance', () => {
    test('Property.derive carries the declared fields and evaluates defaultValue', () => {
        const derived = Property.derive({ name: 'rank', type: 'number', collection: false, defaultValue: () => 7 });
        expect(Property.is(derived)).toBe(true);
        expect(derived.name).toBe('rank');
        expect(derived.type).toBe('number');
        expect(derived.collection).toBe(false);
        expect(derived.defaultValue?.()).toBe(7);
    });

    test('Entity.derive carries properties by reference, same as create', () => {
        const prop = Property.create({ name: 'label', type: 'string' });
        const derived = Entity.derive({ name: 'Box', properties: [prop] });
        expect(derived.name).toBe('Box');
        expect(derived.properties).toBe(derived.properties);
        expect(derived.properties[0]).toBe(prop);
        expect(Entity.is(derived)).toBe(true);
    });

    test('Relation.derive computes the automatic name and inherits fields, same as create', () => {
        const src = Entity.create({ name: 'AuthorR' });
        const tgt = Entity.create({ name: 'PostR' });
        const derived = Relation.derive({
            source: src, sourceProperty: 'posts',
            target: tgt, targetProperty: 'author',
            type: '1:n',
        });
        expect(Relation.is(derived)).toBe(true);
        expect(derived.name).toBe('AuthorR_posts_author_PostR');
        expect(derived.isTargetReliance).toBe(false);
        expect(derived.properties).toEqual([]);
    });

    test('derive normalizes retention and identity the same way create does', () => {
        const prop = Property.create({ name: 'email', type: 'string' });
        const derived = Entity.derive({
            name: 'Account',
            properties: [prop],
            identity: { name: 'byEmail', properties: ['email'] },
            retention: { mode: 'forever' },
        });
        expect(derived.identity).toEqual({ name: 'byEmail', properties: ['email'] });
        expect(derived.retention).toEqual({ mode: 'forever' });
    });
});

describe('clone and RefContainer treat derived instances as first-class', () => {
    function derivedFixture() {
        const author = Entity.derive({
            name: 'Author',
            properties: [Property.derive({ name: 'name', type: 'string' })],
        });
        const post = Entity.derive({
            name: 'Post',
            properties: [Property.derive({ name: 'title', type: 'string' })],
        });
        const wrote = Relation.derive({
            source: author, sourceProperty: 'posts',
            target: post, targetProperty: 'author',
            type: '1:n',
        });
        return { author, post, wrote };
    }

    test('Entity.clone deep-copies derived entities and their properties', () => {
        const { author } = derivedFixture();
        const clone = Entity.clone(author, true);
        expect(clone).not.toBe(author);
        expect(clone.uuid).not.toBe(author.uuid);
        expect(clone.name).toBe('Author');
        expect(clone.properties[0]).not.toBe(author.properties[0]);
        expect(clone.properties[0].name).toBe('name');
        // clone 同样不登记
        expect(Entity.instances).not.toContain(clone);
    });

    test('RefContainer clones derived graphs and rewrites references', () => {
        const { author, post, wrote } = derivedFixture();
        const container = new RefContainer([author, post], [wrote]);
        const { entities, relations } = container.getAll();
        const clonedAuthor = entities.find(e => e.name === 'Author') as EntityInstance;
        const clonedPost = entities.find(e => e.name === 'Post') as EntityInstance;
        expect(clonedAuthor).not.toBe(author);
        expect(relations[0].source).toBe(clonedAuthor);
        expect(relations[0].target).toBe(clonedPost);
    });

    test('RefContainer.add accepts derived entities with normal identity dedup', () => {
        const { author } = derivedFixture();
        const container = new RefContainer([], []);
        const added = container.add(author) as EntityInstance;
        expect(added).not.toBe(author);
        expect(added.name).toBe('Author');
        // 同一实例再 add：按 === / uuid 去重拒绝——derive 实例参与与 create 相同的身份合同
        expect(() => container.add(author)).toThrowError(/already exists/i);
    });

    test('RefContainer.replace swaps a derived replacement for a clone', () => {
        const { author, post, wrote } = derivedFixture();
        const container = new RefContainer([author, post], [wrote]);
        const clonedAuthor = container.getEntityByName('Author') as EntityInstance;
        const replacement = Entity.derive({
            name: 'Author',
            properties: [
                ...author.properties,
                Property.derive({ name: 'level', type: 'number' }),
            ],
        });
        container.replace(replacement, clonedAuthor);
        expect(container.getEntityByName('Author')).toBe(replacement);
        // 指向旧 clone 的引用已被改写到 replacement
        const clonedRelation = container.getAll().relations[0];
        expect(clonedRelation.source).toBe(replacement);
    });

    test('derived relation participates in RefContainer relation handling', () => {
        const { author, post, wrote } = derivedFixture();
        const container = new RefContainer([author, post], []);
        const added = container.add(wrote) as RelationInstance;
        expect(added.name).toBe('Author_posts_author_Post');
        // add 后引用指向容器内的实体 clone
        const inContainer = container.getEntityByName('Author') as EntityInstance;
        expect(added.source).toBe(inContainer);
        expect(() => container.add(wrote)).toThrowError(/already exists/i);
    });
});
