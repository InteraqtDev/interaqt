import { describe, test, expect, beforeEach } from 'vitest';
import { Entity, Property, Relation, clearAllInstances } from '@core';

beforeEach(() => {
    clearAllInstances(Entity, Property, Relation);
});

describe('Entity.stringify() and Entity.parse()', () => {
    test('round-trip preserves name and properties', () => {
        const prop = Property.create({ name: 'email', type: 'string' }, { uuid: 'prop-1' });
        const entity = Entity.create({
            name: 'User',
            properties: [prop],
        }, { uuid: 'ent-1' });

        const json = Entity.stringify(entity);
        const data = JSON.parse(json);
        expect(data.type).toBe('Entity');
        expect(data.uuid).toBe('ent-1');
        expect(data.public.name).toBe('User');

        clearAllInstances(Entity, Property);
        const parsed = Entity.parse(json);
        expect(parsed.uuid).toBe('ent-1');
        expect(parsed.name).toBe('User');
    });

    test('round-trip preserves computation reference', () => {
        const entity = Entity.create({
            name: 'Computed',
            computation: { _type: 'Custom', uuid: 'comp-ref' } as any,
        }, { uuid: 'ent-comp' });

        const json = Entity.stringify(entity);
        const data = JSON.parse(json);
        expect(data.public.computation).toBeTruthy();
    });

    test('round-trip preserves baseEntity for filtered entity', () => {
        const base = Entity.create({ name: 'BaseEntity' }, { uuid: 'base-1' });
        const matchExp = { key: 'active', value: ['=', true] };
        const filtered = Entity.create({
            name: 'ActiveEntity',
            baseEntity: base,
            matchExpression: matchExp,
        }, { uuid: 'filtered-1' });

        const json = Entity.stringify(filtered);
        const data = JSON.parse(json);
        expect(data.public.baseEntity).toBeTruthy();
        expect(data.public.matchExpression).toEqual(matchExp);
    });
});

describe('Entity.clone()', () => {
    test('creates independent copy with new uuid', () => {
        const prop = Property.create({ name: 'name', type: 'string' });
        const entity = Entity.create({ name: 'Item', properties: [prop] });

        const cloned = Entity.clone(entity, false);
        expect(cloned.uuid).not.toBe(entity.uuid);
        expect(cloned.name).toBe('Item');
        expect(cloned.properties).toHaveLength(1);
    });

    test('preserves computation and baseEntity references', () => {
        const base = Entity.create({ name: 'Base' });
        const entity = Entity.create({
            name: 'Derived',
            baseEntity: base,
            matchExpression: { key: 'x' },
        });

        const cloned = Entity.clone(entity, false);
        expect(cloned.baseEntity).toBe(base);
        expect(cloned.matchExpression).toEqual({ key: 'x' });
    });

    test('preserves inputEntities for merged entity', () => {
        const e1 = Entity.create({ name: 'E1' });
        const e2 = Entity.create({ name: 'E2' });
        const merged = Entity.create({
            name: 'Merged',
            inputEntities: [e1, e2],
            commonProperties: [Property.create({ name: 'shared', type: 'string' })],
        });

        const cloned = Entity.clone(merged, false);
        expect(cloned.inputEntities).toEqual([e1, e2]);
        expect(cloned.commonProperties).toBeTruthy();
    });
});

describe('Entity.is()', () => {
    test('positive: recognizes Entity instance', () => {
        const entity = Entity.create({ name: 'Test' });
        expect(Entity.is(entity)).toBe(true);
    });

    test('negative: rejects null, non-object, wrong _type', () => {
        expect(Entity.is(null)).toBe(false);
        expect(Entity.is(42)).toBe(false);
        expect(Entity.is({ _type: 'Relation' })).toBe(false);
    });
});

describe('Entity.check()', () => {
    test('positive: recognizes entity instance by _type', () => {
        const entity = Entity.create({ name: 'Test' });
        expect(Entity.check(entity)).toBe(true);
    });

    test('positive: recognizes entity reference by id', () => {
        expect(Entity.check({ id: 'some-id' })).toBe(true);
    });

    test('positive: recognizes non-empty object as entity data', () => {
        expect(Entity.check({ name: 'User' })).toBe(true);
    });

    test('negative: rejects null and non-object', () => {
        expect(Entity.check(null)).toBe(false);
        expect(Entity.check(42)).toBe(false);
    });

    test('negative: rejects empty object', () => {
        expect(Entity.check({})).toBe(false);
    });
});

describe('Entity.create() edge cases', () => {
    test('throws on duplicate uuid', () => {
        Entity.create({ name: 'A' }, { uuid: 'dup' });
        expect(() => Entity.create({ name: 'B' }, { uuid: 'dup' })).toThrow(/duplicate uuid/);
    });

    test('defaults properties to empty array', () => {
        const entity = Entity.create({ name: 'Empty' });
        expect(entity.properties).toEqual([]);
    });
});

describe('Relation.stringify() and Relation.parse()', () => {
    test('round-trip preserves normal relation fields', () => {
        const source = Entity.create({ name: 'Author' }, { uuid: 'author' });
        const target = Entity.create({ name: 'Book' }, { uuid: 'book' });

        const rel = Relation.create({
            source,
            sourceProperty: 'books',
            target,
            targetProperty: 'author',
            type: '1:n',
        }, { uuid: 'rel-1' });

        const json = Relation.stringify(rel);
        const data = JSON.parse(json);
        expect(data.type).toBe('Relation');
        expect(data.uuid).toBe('rel-1');
        expect(data.public.type).toBe('1:n');
        expect(data.public.sourceProperty).toBe('books');
        expect(data.public.targetProperty).toBe('author');
    });

    test('preserves name in serialization', () => {
        const source = Entity.create({ name: 'A' });
        const target = Entity.create({ name: 'B' });
        const rel = Relation.create({
            name: 'MyRelation',
            source,
            sourceProperty: 'bs',
            target,
            targetProperty: 'a',
            type: '1:1',
        });

        const json = Relation.stringify(rel);
        const data = JSON.parse(json);
        expect(data.public.name).toBe('MyRelation');
    });
});

describe('Relation.clone()', () => {
    test('creates independent copy of normal relation', () => {
        const source = Entity.create({ name: 'X' });
        const target = Entity.create({ name: 'Y' });
        const prop = Property.create({ name: 'weight', type: 'number' });

        const rel = Relation.create({
            source,
            sourceProperty: 'ys',
            target,
            targetProperty: 'x',
            type: 'n:n',
            properties: [prop],
        });

        const cloned = Relation.clone(rel, false);
        expect(cloned.uuid).not.toBe(rel.uuid);
        expect(cloned.sourceProperty).toBe('ys');
        expect(cloned.type).toBe('n:n');
        expect(cloned.source).toBe(source);
        expect(cloned.target).toBe(target);
    });

    test('deep clone creates copies of properties', () => {
        const source = Entity.create({ name: 'A' });
        const target = Entity.create({ name: 'B' });
        const prop = Property.create({ name: 'score', type: 'number' });

        const rel = Relation.create({
            source,
            sourceProperty: 'bs',
            target,
            targetProperty: 'a',
            type: '1:n',
            properties: [prop],
        });

        const cloned = Relation.clone(rel, true);
        expect(cloned.properties).toHaveLength(1);
        expect(cloned.properties[0].uuid).not.toBe(prop.uuid);
        expect(cloned.properties[0].name).toBe('score');
    });

    test('preserves baseRelation for filtered relation', () => {
        const source = Entity.create({ name: 'S' });
        const target = Entity.create({ name: 'T' });
        const base = Relation.create({
            source,
            sourceProperty: 'ts',
            target,
            targetProperty: 's',
            type: '1:n',
        });

        const filtered = Relation.create({
            baseRelation: base,
            sourceProperty: 'activeTs',
            targetProperty: 'activeS',
            matchExpression: { key: 'active' },
        });

        const cloned = Relation.clone(filtered, false);
        expect(cloned.baseRelation).toBe(base);
        expect(cloned.matchExpression).toEqual({ key: 'active' });
    });
});

describe('Relation.is()', () => {
    test('positive: recognizes Relation instance', () => {
        const source = Entity.create({ name: 'A' });
        const target = Entity.create({ name: 'B' });
        const rel = Relation.create({
            source, sourceProperty: 'b', target, targetProperty: 'a', type: '1:1',
        });
        expect(Relation.is(rel)).toBe(true);
    });

    test('negative: rejects non-Relation', () => {
        expect(Relation.is(null)).toBe(false);
        expect(Relation.is({ _type: 'Entity' })).toBe(false);
    });
});

describe('Relation.check()', () => {
    test('positive and negative', () => {
        expect(Relation.check({ uuid: 'x' })).toBe(true);
        expect(Relation.check(null)).toBe(false);
        expect(Relation.check({})).toBe(false);
    });
});

describe('Relation.create() edge cases', () => {
    test('throws on duplicate uuid', () => {
        const s = Entity.create({ name: 'S' });
        const t = Entity.create({ name: 'T' });
        Relation.create({
            source: s, sourceProperty: 'ts', target: t, targetProperty: 's', type: '1:1',
        }, { uuid: 'rel-dup' });
        expect(() => Relation.create({
            source: s, sourceProperty: 'ts2', target: t, targetProperty: 's2', type: '1:1',
        }, { uuid: 'rel-dup' })).toThrow(/duplicate uuid/);
    });

    test('throws when normal relation missing required fields', () => {
        expect(() => Relation.create({
            sourceProperty: 'x',
            targetProperty: 'y',
            type: '1:1',
        })).toThrow('Relation requires source');
    });

    test('computed name from source/target when name not provided', () => {
        const s = Entity.create({ name: 'Foo' });
        const t = Entity.create({ name: 'Bar' });
        const rel = Relation.create({
            source: s, sourceProperty: 'bars', target: t, targetProperty: 'foo', type: '1:n',
        });
        expect(rel.name).toBe('Foo_bars_foo_Bar');
    });

    test('filtered relation requires sourceProperty and targetProperty', () => {
        const s = Entity.create({ name: 'S2' });
        const t = Entity.create({ name: 'T2' });
        const base = Relation.create({
            source: s, sourceProperty: 'ts', target: t, targetProperty: 's', type: '1:n',
        });
        expect(() => Relation.create({
            baseRelation: base,
        })).toThrow('Filtered relation must have sourceProperty and targetProperty');
    });

    test('merged relation inherits source/target from inputRelations', () => {
        const s = Entity.create({ name: 'MS' });
        const t = Entity.create({ name: 'MT' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'ts1', target: t, targetProperty: 's1', type: '1:n',
        });
        const r2 = Relation.create({
            source: s, sourceProperty: 'ts2', target: t, targetProperty: 's2', type: '1:n',
        });
        const merged = Relation.create({
            inputRelations: [r1, r2],
            sourceProperty: 'allTs',
            targetProperty: 'allS',
        });
        expect(merged.source).toBe(s);
        expect(merged.target).toBe(t);
    });
});

describe('Relation name getter', () => {
    test('explicit name overrides computed', () => {
        const s = Entity.create({ name: 'A' });
        const t = Entity.create({ name: 'B' });
        const rel = Relation.create({
            name: 'explicit',
            source: s, sourceProperty: 'bs', target: t, targetProperty: 'a', type: '1:1',
        });
        expect(rel.name).toBe('explicit');
    });
});

describe('Entity.public constraint functions', () => {
    test('commonProperties.constraints.eachNameUnique validates unique property names', () => {
        const constraint = Entity.public.commonProperties.constraints.eachNameUnique;
        const p1 = Property.create({ name: 'a', type: 'string' });
        const p2 = Property.create({ name: 'b', type: 'string' });
        const p3 = Property.create({ name: 'a', type: 'number' });
        expect(constraint({ properties: [p1, p2] })).toBe(true);
        expect(constraint({ properties: [p1, p3] })).toBe(false);
    });

    test('inputEntities.constraints.mergedEntityNoProperties rejects properties on merged entity', () => {
        const constraint = Entity.public.inputEntities.constraints.mergedEntityNoProperties;
        const e1 = Entity.create({ name: 'I1' });
        const p1 = Property.create({ name: 'x', type: 'string' });
        expect(constraint({ properties: [p1], inputEntities: [e1] })).toBe(false);
        expect(constraint({ properties: [], inputEntities: [e1] })).toBe(true);
        expect(constraint({ properties: [p1], inputEntities: undefined })).toBe(true);
    });

    test('properties.defaultValue returns empty array', () => {
        expect(Entity.public.properties.defaultValue()).toEqual([]);
    });

    test('commonProperties.defaultValue returns empty array', () => {
        expect(Entity.public.commonProperties.defaultValue()).toEqual([]);
    });
});

describe('Relation.public constraint and computed functions', () => {
    test('name.computed generates name from source/target', () => {
        const s = Entity.create({ name: 'User' });
        const t = Entity.create({ name: 'Post' });
        const rel = Relation.create({
            source: s, sourceProperty: 'posts', target: t, targetProperty: 'author', type: '1:n',
        });
        const computed = Relation.public.name.computed!(rel);
        expect(computed).toBe('User_posts_author_Post');
    });

    test('name.computed returns empty string when source/target missing', () => {
        const result = Relation.public.name.computed!({ source: undefined, target: undefined } as any);
        expect(result).toBe('');
    });

    test('properties.constraints.eachNameUnique validates unique property names', () => {
        const s = Entity.create({ name: 'CX' });
        const t = Entity.create({ name: 'CY' });
        const p1 = Property.create({ name: 'a', type: 'string' });
        const p2 = Property.create({ name: 'b', type: 'string' });
        const p3 = Property.create({ name: 'a', type: 'number' });

        const relUnique = Relation.create({
            source: s, sourceProperty: 'cys', target: t, targetProperty: 'cx', type: '1:n',
            properties: [p1, p2],
        });
        expect(Relation.public.properties.constraints.eachNameUnique(relUnique)).toBe(true);

        const relDup = Relation.create({
            source: s, sourceProperty: 'cys2', target: t, targetProperty: 'cx2', type: '1:n',
            properties: [p1, p3],
        });
        expect(Relation.public.properties.constraints.eachNameUnique(relDup)).toBe(false);
    });

    test('inputRelations.constraints.mergedRelationNoProperties rejects properties on merged', () => {
        const s = Entity.create({ name: 'MR1' });
        const t = Entity.create({ name: 'MR2' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'mr2a', target: t, targetProperty: 'mr1a', type: '1:n',
        });
        const constraint = Relation.public.inputRelations.constraints.mergedRelationNoProperties;
        expect(constraint({
            inputRelations: [r1], properties: [Property.create({ name: 'x', type: 'string' })],
        } as any)).toBe(false);
        expect(constraint({
            inputRelations: [r1], properties: [],
        } as any)).toBe(true);
    });

    test('inputRelations.constraints.sameSourceTarget validates same source/target', () => {
        const s = Entity.create({ name: 'SS' });
        const t = Entity.create({ name: 'ST' });
        const t2 = Entity.create({ name: 'ST2' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'st1', target: t, targetProperty: 'ss1', type: '1:n',
        });
        const r2 = Relation.create({
            source: s, sourceProperty: 'st2', target: t, targetProperty: 'ss2', type: '1:n',
        });
        const r3 = Relation.create({
            source: s, sourceProperty: 'st2x', target: t2, targetProperty: 'ss2x', type: '1:n',
        });

        const constraint = Relation.public.inputRelations.constraints.sameSourceTarget;
        expect(constraint({ inputRelations: [r1, r2] } as any)).toBe(true);
        expect(constraint({ inputRelations: [r1, r3] } as any)).toBe(false);
        expect(constraint({ inputRelations: [r1] } as any)).toBe(true);
    });

    test('isTargetReliance.defaultValue returns false', () => {
        expect(Relation.public.isTargetReliance.defaultValue()).toBe(false);
    });

    test('properties.defaultValue returns empty array', () => {
        expect(Relation.public.properties.defaultValue()).toEqual([]);
    });
});

describe('Relation.stringify() edge cases', () => {
    test('stringify includes computation when present', () => {
        const s = Entity.create({ name: 'SC' });
        const t = Entity.create({ name: 'TC' });
        const rel = Relation.create({
            source: s, sourceProperty: 'tcs', target: t, targetProperty: 'sc', type: '1:n',
            computation: { _type: 'Transform', uuid: 'comp-1' } as any,
        });
        const json = Relation.stringify(rel);
        const data = JSON.parse(json);
        expect(data.public.computation).toBeTruthy();
    });

    test('stringify/parse round-trip for merged relation', () => {
        const s = Entity.create({ name: 'MRS' });
        const t = Entity.create({ name: 'MRT' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'mrt1', target: t, targetProperty: 'mrs1', type: '1:n',
        });
        const r2 = Relation.create({
            source: s, sourceProperty: 'mrt2', target: t, targetProperty: 'mrs2', type: '1:n',
        });
        const merged = Relation.create({
            inputRelations: [r1, r2],
            sourceProperty: 'allMrt',
            targetProperty: 'allMrs',
        });
        const json = Relation.stringify(merged);
        const data = JSON.parse(json);
        expect(data.public.inputRelations).toBeTruthy();
        expect(data.public.source).toBeUndefined();
    });
});

describe('Relation.create() merged relation edge cases', () => {
    test('merged relation without sourceProperty throws', () => {
        const s = Entity.create({ name: 'MES' });
        const t = Entity.create({ name: 'MET' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'met1', target: t, targetProperty: 'mes1', type: '1:n',
        });
        expect(() => Relation.create({
            inputRelations: [r1],
            targetProperty: 'x',
        })).toThrow('sourceProperty and targetProperty');
    });

    test('merged relation with source/target specified throws', () => {
        const s = Entity.create({ name: 'MES2' });
        const t = Entity.create({ name: 'MET2' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'met2a', target: t, targetProperty: 'mes2a', type: '1:n',
        });
        expect(() => Relation.create({
            inputRelations: [r1],
            source: s,
            sourceProperty: 'x',
            targetProperty: 'y',
        })).toThrow('cannot specify source or target');
    });

    test('merged relation with different sources throws', () => {
        const s1 = Entity.create({ name: 'DS1' });
        const s2 = Entity.create({ name: 'DS2' });
        const t = Entity.create({ name: 'DT' });
        const r1 = Relation.create({
            source: s1, sourceProperty: 'dt1', target: t, targetProperty: 'ds1a', type: '1:n',
        });
        const r2 = Relation.create({
            source: s2, sourceProperty: 'dt2', target: t, targetProperty: 'ds2a', type: '1:n',
        });
        expect(() => Relation.create({
            inputRelations: [r1, r2],
            sourceProperty: 'allDt',
            targetProperty: 'allDs',
        })).toThrow('same source');
    });

    test('merged relation with different targets throws', () => {
        const s = Entity.create({ name: 'MDS' });
        const t1 = Entity.create({ name: 'MDT1' });
        const t2 = Entity.create({ name: 'MDT2' });
        const r1 = Relation.create({
            source: s, sourceProperty: 'mdt1', target: t1, targetProperty: 'mds1', type: '1:n',
        });
        const r2 = Relation.create({
            source: s, sourceProperty: 'mdt2', target: t2, targetProperty: 'mds2', type: '1:n',
        });
        expect(() => Relation.create({
            inputRelations: [r1, r2],
            sourceProperty: 'allMdt',
            targetProperty: 'allMds',
        })).toThrow('same target');
    });
});
