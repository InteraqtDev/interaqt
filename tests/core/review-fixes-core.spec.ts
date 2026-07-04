import { describe, test, expect, beforeEach } from 'vitest';
import {
    Entity, Relation, Property, Dictionary,
    UniqueConstraint, NonNullConstraint,
    BoolExp, clearAllInstances,
} from '@core';

// 针对 core review 显著问题（S9/S12/S13/S14/S15）的回归测试。

beforeEach(() => {
    clearAllInstances(Entity, Relation, Property, Dictionary, UniqueConstraint, NonNullConstraint);
});

describe('S9: Relation.isTargetReliance inheritance', () => {
    function createBase(isTargetReliance: boolean, suffix = '') {
        const User = Entity.create({ name: `User${suffix}` });
        const Profile = Entity.create({ name: `Profile${suffix}` });
        const base = Relation.create({
            source: User,
            sourceProperty: `profile${suffix}`,
            target: Profile,
            targetProperty: `owner${suffix}`,
            type: '1:1',
            isTargetReliance,
        });
        return { User, Profile, base };
    }

    test('filtered relation inherits isTargetReliance from baseRelation', () => {
        const { base } = createBase(true);
        const filtered = Relation.create({
            baseRelation: base,
            sourceProperty: 'activeProfile',
            targetProperty: 'activeOwner',
            matchExpression: { key: 'active', value: ['=', true] },
        });
        expect(filtered.isTargetReliance).toBe(true);
    });

    test('filtered relation can explicitly override isTargetReliance', () => {
        const { base } = createBase(true);
        const filtered = Relation.create({
            baseRelation: base,
            sourceProperty: 'p',
            targetProperty: 'o',
            isTargetReliance: false,
        });
        expect(filtered.isTargetReliance).toBe(false);
    });

    test('merged relation inherits isTargetReliance from inputRelations', () => {
        const A = Entity.create({ name: 'MA' });
        const B = Entity.create({ name: 'MB' });
        const r1 = Relation.create({ source: A, sourceProperty: 'r1', target: B, targetProperty: 'r1b', type: '1:n', isTargetReliance: true });
        const r2 = Relation.create({ source: A, sourceProperty: 'r2', target: B, targetProperty: 'r2b', type: '1:n', isTargetReliance: true });
        const merged = Relation.create({ inputRelations: [r1, r2], sourceProperty: 'm', targetProperty: 'mb' });
        expect(merged.isTargetReliance).toBe(true);
    });

    test('merged relation with disagreeing inputRelations requires explicit isTargetReliance', () => {
        const A = Entity.create({ name: 'DA' });
        const B = Entity.create({ name: 'DB' });
        const r1 = Relation.create({ source: A, sourceProperty: 'd1', target: B, targetProperty: 'd1b', type: '1:n', isTargetReliance: true });
        const r2 = Relation.create({ source: A, sourceProperty: 'd2', target: B, targetProperty: 'd2b', type: '1:n', isTargetReliance: false });
        expect(() => Relation.create({ inputRelations: [r1, r2], sourceProperty: 'dm', targetProperty: 'dmb' }))
            .toThrow(/isTargetReliance/);
        const merged = Relation.create({ inputRelations: [r1, r2], sourceProperty: 'dm2', targetProperty: 'dmb2', isTargetReliance: true });
        expect(merged.isTargetReliance).toBe(true);
    });

    test('normal relation still defaults to false', () => {
        const { base } = createBase(false, 'N');
        expect(base.isTargetReliance).toBe(false);
    });
});

describe('S12: clone must not pollute the global registry', () => {
    test('Entity.clone does not register the clone', () => {
        const entity = Entity.create({ name: 'CloneMe', properties: [Property.create({ name: 'p', type: 'string' })] });
        const before = Entity.instances.length;
        const cloned = Entity.clone(entity, false);
        expect(Entity.instances.length).toBe(before);
        expect(Entity.instances).not.toContain(cloned);
        expect(cloned.name).toBe('CloneMe');
        expect(cloned.uuid).not.toBe(entity.uuid);
    });

    test('Relation.clone does not register the clone and does not reuse the explicit uuid', () => {
        const A = Entity.create({ name: 'CA' });
        const B = Entity.create({ name: 'CB' });
        const relation = Relation.create(
            { source: A, sourceProperty: 'b', target: B, targetProperty: 'a', type: '1:1' },
            { uuid: 'relation-clone-original' }
        );
        const relationCountBefore = Relation.instances.length;
        const propertyCountBefore = Property.instances.length;
        const cloned = Relation.clone(relation, false);
        expect(Relation.instances.length).toBe(relationCountBefore);
        expect(Property.instances.length).toBe(propertyCountBefore);
        expect(cloned.uuid).not.toBe(relation.uuid);
        expect(cloned.source).toBe(A);
    });

    test('shallow Relation.clone shares property instances like Entity.clone', () => {
        const A = Entity.create({ name: 'SA' });
        const prop = Property.create({ name: 'weight', type: 'number' });
        const relation = Relation.create({ source: A, sourceProperty: 's', target: A, targetProperty: 't', type: 'n:n', properties: [prop] });
        const cloned = Relation.clone(relation, false);
        expect(cloned.properties[0]).toBe(prop);
        // deep clone copies properties but still must not register them
        const propertyCountBefore = Property.instances.length;
        const deepCloned = Relation.clone(relation, true);
        expect(deepCloned.properties[0]).not.toBe(prop);
        expect(Property.instances.length).toBe(propertyCountBefore);
    });
});

describe('S13: BoolExp.and/or keep falsy atoms', () => {
    test('and() keeps 0/false/empty-string atoms and only drops null/undefined', () => {
        const zero = BoolExp.and<unknown>(0, null, undefined)!;
        expect(zero.isAtom()).toBe(true);
        expect(zero.data).toBe(0);

        const combined = BoolExp.and<unknown>(false, '')!;
        expect(combined.isExpression()).toBe(true);
        expect(combined.left.data).toBe(false);
        expect(combined.right!.data).toBe('');

        expect(BoolExp.and(null, undefined)).toBeUndefined();
    });

    test('or() keeps falsy atoms', () => {
        const combined = BoolExp.or<unknown>(0, false)!;
        expect(combined.isExpression()).toBe(true);
        expect(combined.left.data).toBe(0);
        expect(combined.right!.data).toBe(false);

        expect(BoolExp.or(undefined)).toBeUndefined();
    });
});

describe('S14: sync evaluate rejects Promise-returning handlers', () => {
    test('evaluate throws when the atom handler returns a Promise', () => {
        const exp = BoolExp.atom({ ok: false });
        expect(() => exp.evaluate((async () => false) as unknown as (arg: unknown) => boolean))
            .toThrow(/evaluateAsync/);
    });

    test('evaluate still works with sync handlers', () => {
        const exp = BoolExp.atom({ ok: true });
        expect(exp.evaluate(data => (data as { ok: boolean }).ok)).toBe(true);
    });
});

describe('S15: name format validation is enforced at create()', () => {
    test('Property.create rejects invalid names', () => {
        expect(() => Property.create({ name: 'bad name', type: 'string' })).toThrow(/invalid/);
        expect(() => Property.create({ name: 'ok_name1', type: 'string' })).not.toThrow();
    });

    test('UniqueConstraint.create rejects invalid names', () => {
        expect(() => UniqueConstraint.create({ name: 'has space', properties: ['a'] })).toThrow(/invalid/);
    });

    test('NonNullConstraint.create rejects invalid names', () => {
        expect(() => NonNullConstraint.create({ name: 'has-dash', property: 'a' })).toThrow(/invalid/);
    });

    test('Dictionary.create rejects invalid names', () => {
        expect(() => Dictionary.create({ name: 'bad;drop', type: 'string' })).toThrow(/invalid/);
    });
});
