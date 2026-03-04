import { describe, test, expect } from 'vitest';

import {
    assert as storageAssert,
    setByPath,
    mapTree,
    deepMerge,
    indexBy as storageIndexBy,
} from '../../src/storage/utils.js';

import {
    flatten,
    someAsync,
    isRelation,
    indexBy as erstorageIndexBy,
    assert as erstorageAssert,
} from '../../src/storage/erstorage/util.js';

describe('storage/utils', () => {
    describe('assert', () => {
        test('does nothing when condition is truthy', () => {
            expect(() => storageAssert(true, 'msg')).not.toThrow();
        });

        test('throws when condition is falsy', () => {
            expect(() => storageAssert(false, 'fail')).toThrow('fail');
            expect(() => storageAssert(null, 'null')).toThrow('null');
        });
    });

    describe('setByPath', () => {
        test('sets value at simple path', () => {
            const obj: any = {};
            setByPath(obj, ['name'], 'Alice');
            expect(obj.name).toBe('Alice');
        });

        test('sets value at nested path, creating intermediates', () => {
            const obj: any = {};
            setByPath(obj, ['a', 'b', 'c'], 42);
            expect(obj.a.b.c).toBe(42);
        });

        test('sets value on existing nested object', () => {
            const obj: any = { a: { b: { existing: true } } };
            setByPath(obj, ['a', 'b', 'c'], 'new');
            expect(obj.a.b.c).toBe('new');
            expect(obj.a.b.existing).toBe(true);
        });

        test('returns true', () => {
            const result = setByPath({} as any, ['x'], 1);
            expect(result).toBe(true);
        });
    });

    describe('mapTree', () => {
        test('transforms root without children', () => {
            const root = { val: 1 };
            const result = mapTree(root, ['children'], (obj) => ({ ...obj, val: obj.val * 2 }));
            expect(result.val).toBe(2);
        });

        test('recursively transforms nested tree', () => {
            const root = {
                val: 1,
                children: {
                    val: 2,
                    children: { val: 3 },
                },
            };
            const result = mapTree(root, ['children'], (obj) => ({ ...obj, val: obj.val + 10 }));
            expect(result.val).toBe(11);
            expect(result.children.val).toBe(12);
            expect(result.children.children.val).toBe(13);
        });

        test('passes context path to callback', () => {
            const contexts: string[][] = [];
            const root = { data: 'root', sub: { data: 'child' } };
            mapTree(root, ['sub'], (obj, ctx) => {
                contexts.push([...ctx]);
                return { ...obj };
            });
            expect(contexts[0]).toEqual([]);
            expect(contexts[1]).toEqual(['sub']);
        });
    });

    describe('deepMerge', () => {
        test('merges non-overlapping keys', () => {
            const result = deepMerge({ a: 1 }, { b: 2 });
            expect(result).toEqual({ a: 1, b: 2 });
        });

        test('deeply merges overlapping object keys', () => {
            const result = deepMerge(
                { x: { a: 1 } },
                { x: { b: 2 } }
            );
            expect(result.x).toEqual({ a: 1, b: 2 });
        });

        test('throws when overlapping key is not an object', () => {
            expect(() => deepMerge({ a: 1 }, { a: 2 })).toThrow();
        });
    });

    describe('indexBy', () => {
        test('indexes array by key', () => {
            const arr = [{ k: 'a', v: 1 }, { k: 'b', v: 2 }];
            const result = storageIndexBy(arr, 'k');
            expect(result['a']).toEqual({ k: 'a', v: 1 });
        });
    });
});

describe('erstorage/util', () => {
    describe('flatten', () => {
        test('flattens one level', () => {
            expect(flatten([1, [2, 3], 4])).toEqual([1, 2, 3, 4]);
        });

        test('handles empty array', () => {
            expect(flatten([])).toEqual([]);
        });

        test('handles all-flat array', () => {
            expect(flatten([1, 2, 3])).toEqual([1, 2, 3]);
        });
    });

    describe('someAsync', () => {
        test('returns true when any match', async () => {
            const result = await someAsync([1, 2, 3], async (n) => n === 2);
            expect(result).toBe(true);
        });

        test('returns false when none match', async () => {
            const result = await someAsync([1, 2, 3], async (n) => n > 10);
            expect(result).toBe(false);
        });

        test('returns false for empty array', async () => {
            expect(await someAsync([], async () => true)).toBe(false);
        });
    });

    describe('isRelation', () => {
        test('returns true for relation-like objects', () => {
            expect(isRelation({ source: 'A', target: 'B' })).toBe(true);
        });

        test('returns false for non-relation objects', () => {
            expect(isRelation({ name: 'test' })).toBe(false);
            expect(isRelation(null)).toBe(false);
            expect(isRelation(42)).toBe(false);
            expect(isRelation('str')).toBe(false);
        });
    });

    describe('indexBy', () => {
        test('indexes array by key', () => {
            const arr = [{ id: '1' }, { id: '2' }];
            const result = erstorageIndexBy(arr, 'id');
            expect(result['1']).toEqual({ id: '1' });
        });
    });

    describe('assert', () => {
        test('throws when condition is false', () => {
            expect(() => erstorageAssert(false, 'fail')).toThrow('fail');
        });

        test('does nothing when condition is true', () => {
            expect(() => erstorageAssert(true, 'ok')).not.toThrow();
        });
    });
});
