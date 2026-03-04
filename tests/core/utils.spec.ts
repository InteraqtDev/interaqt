import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
    isObject,
    isPlainObject,
    indexBy,
    stringifyAttribute,
    deepClone,
    clearAllInstances,
    KlassByName,
    registerKlass,
    stringifyAllInstances,
    createInstances,
    createInstancesFromString,
    Entity,
    Property,
} from '@core';

beforeEach(() => {
    clearAllInstances(Entity, Property);
});

describe('isObject', () => {
    test('returns true for objects', () => {
        expect(isObject({})).toBe(true);
        expect(isObject([])).toBe(true);
        expect(isObject(new Date())).toBe(true);
    });

    test('returns false for non-objects', () => {
        expect(isObject(null)).toBe(false);
        expect(isObject(undefined)).toBe(false);
        expect(isObject(42)).toBe(false);
        expect(isObject('str')).toBe(false);
        expect(isObject(true)).toBe(false);
    });
});

describe('isPlainObject', () => {
    test('returns true for plain objects', () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
    });

    test('returns true for null-prototype objects', () => {
        expect(isPlainObject(Object.create(null))).toBe(true);
    });

    test('returns false for class instances', () => {
        class Foo {}
        expect(isPlainObject(new Foo())).toBe(false);
    });

    test('returns false for non-objects', () => {
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject(42)).toBe(false);
        expect(isPlainObject('str')).toBe(false);
        expect(isPlainObject([])).toBe(false);
    });
});

describe('indexBy', () => {
    test('indexes array by key', () => {
        const items = [
            { id: 'a', name: 'Alice' },
            { id: 'b', name: 'Bob' },
        ];
        const result = indexBy(items, 'id');
        expect(result['a']).toEqual({ id: 'a', name: 'Alice' });
        expect(result['b']).toEqual({ id: 'b', name: 'Bob' });
    });

    test('handles empty array', () => {
        expect(indexBy([], 'id')).toEqual({});
    });

    test('skips items with undefined key', () => {
        const items = [{ id: 'a', name: 'A' }, { name: 'B' }] as any;
        const result = indexBy(items, 'id');
        expect(Object.keys(result)).toEqual(['a']);
    });
});

describe('stringifyAttribute', () => {
    test('serializes functions with func:: prefix', () => {
        const fn = () => 42;
        const result = stringifyAttribute(fn);
        expect(typeof result).toBe('string');
        expect(result).toMatch(/^func::/);
    });

    test('returns arrays as-is', () => {
        const arr = [1, 2, 3];
        expect(stringifyAttribute(arr)).toBe(arr);
    });

    test('serializes Klass instances with uuid:: prefix', () => {
        const entity = Entity.create({ name: 'Test' });
        const result = stringifyAttribute(entity);
        expect(result).toBe(`uuid::${entity.uuid}`);
    });

    test('returns primitives as-is', () => {
        expect(stringifyAttribute(42)).toBe(42);
        expect(stringifyAttribute('hello')).toBe('hello');
        expect(stringifyAttribute(true)).toBe(true);
        expect(stringifyAttribute(null)).toBe(null);
        expect(stringifyAttribute(undefined)).toBe(undefined);
    });

    test('returns plain objects as-is', () => {
        const obj = { key: 'val' };
        expect(stringifyAttribute(obj)).toBe(obj);
    });
});

describe('deepClone', () => {
    test('clones primitives', () => {
        expect(deepClone(42)).toBe(42);
        expect(deepClone('hello')).toBe('hello');
        expect(deepClone(null)).toBe(null);
        expect(deepClone(undefined)).toBe(undefined);
    });

    test('clones arrays deeply', () => {
        const arr = [1, [2, 3]];
        const cloned = deepClone(arr);
        expect(cloned).toEqual(arr);
        expect(cloned).not.toBe(arr);
        expect(cloned[1]).not.toBe(arr[1]);
    });

    test('clones plain objects deeply', () => {
        const obj = { a: 1, b: { c: 2 } };
        const cloned = deepClone(obj);
        expect(cloned).toEqual(obj);
        expect(cloned).not.toBe(obj);
        expect(cloned.b).not.toBe(obj.b);
    });

    test('clones Sets', () => {
        const set = new Set([1, 2, 3]);
        const cloned = deepClone(set);
        expect(cloned).toEqual(set);
        expect(cloned).not.toBe(set);
    });

    test('clones Maps', () => {
        const map = new Map([['a', 1], ['b', 2]]);
        const cloned = deepClone(map);
        expect(cloned).toEqual(map);
        expect(cloned).not.toBe(map);
    });

    test('returns Klass instances as-is without deepCloneKlass', () => {
        const entity = Entity.create({ name: 'Test' });
        const cloned = deepClone(entity, false);
        expect(cloned).toBe(entity);
    });
});

describe('clearAllInstances', () => {
    test('clears instances from multiple classes', () => {
        Entity.create({ name: 'E1' });
        Property.create({ name: 'P1', type: 'string' });
        expect(Entity.instances.length).toBeGreaterThan(0);
        expect(Property.instances.length).toBeGreaterThan(0);

        clearAllInstances(Entity, Property);
        expect(Entity.instances).toHaveLength(0);
        expect(Property.instances).toHaveLength(0);
    });
});

describe('registerKlass and KlassByName', () => {
    test('registers a valid klass', () => {
        const hadEntity = KlassByName.has('Entity');
        expect(hadEntity).toBe(true);
    });

    test('ignores invalid objects', () => {
        const sizeBefore = KlassByName.size;
        registerKlass('Invalid', { notAKlass: true });
        expect(KlassByName.size).toBe(sizeBefore);
    });
});

describe('stringifyAllInstances', () => {
    test('serializes all registered instances', () => {
        Entity.create({ name: 'TestEntity' });
        const result = stringifyAllInstances();
        expect(result.startsWith('[')).toBe(true);
        expect(result.endsWith(']')).toBe(true);
        expect(result).toContain('TestEntity');
    });
});

describe('createInstances and createInstancesFromString', () => {
    test('createInstances creates from serialized data', () => {
        const entity = Entity.create({ name: 'Orig' });
        const uuid = entity.uuid;
        clearAllInstances(Entity);

        const result = createInstances([
            { type: 'Entity', uuid, public: { name: 'Orig' } },
        ]);
        expect(result.size).toBe(1);
        expect(result.get(uuid)).toBeTruthy();
    });

    test('createInstancesFromString parses JSON string', () => {
        const uuid = 'test-uuid-123';
        const json = JSON.stringify([
            { type: 'Entity', uuid, public: { name: 'FromStr' } },
        ]);
        const result = createInstancesFromString(json);
        expect(result.size).toBe(1);
        expect(result.get(uuid)).toBeTruthy();
    });

    test('createInstances warns for unknown types', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = createInstances([
            { type: 'NonExistentKlass', uuid: 'x', public: {} },
        ]);
        expect(result.size).toBe(0);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});
