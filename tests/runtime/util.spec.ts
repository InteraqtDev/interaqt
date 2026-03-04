import { describe, test, expect } from 'vitest';
import {
    assert,
    filterMap,
    indexBy,
    mapObject,
    everyAsync,
    someAsync,
    everyWithErrorAsync,
} from '../../src/runtime/util.js';

describe('assert', () => {
    test('does nothing when condition is truthy', () => {
        expect(() => assert(true, 'msg')).not.toThrow();
        expect(() => assert(1, 'msg')).not.toThrow();
        expect(() => assert('yes', 'msg')).not.toThrow();
    });

    test('throws when condition is falsy', () => {
        expect(() => assert(false, 'failure')).toThrow('failure');
        expect(() => assert(0, 'zero')).toThrow('zero');
        expect(() => assert(null, 'null')).toThrow('null');
        expect(() => assert(undefined, 'undef')).toThrow('undef');
        expect(() => assert('', 'empty')).toThrow('empty');
    });
});

describe('filterMap', () => {
    test('applies filter function to map entries', () => {
        const map = new Map<string, number>([
            ['a', 1],
            ['b', 2],
            ['c', 3],
        ]);
        const result = filterMap(map, (_key, value) => value > 1);
        expect(result.get('a')).toBe(false);
        expect(result.get('b')).toBe(true);
        expect(result.get('c')).toBe(true);
    });

    test('handles empty map', () => {
        const result = filterMap(new Map(), () => true);
        expect(result.size).toBe(0);
    });
});

describe('indexBy', () => {
    test('indexes array of objects by key', () => {
        const arr = [
            { id: '1', name: 'A' },
            { id: '2', name: 'B' },
        ];
        const result = indexBy(arr, 'id');
        expect(result['1']).toEqual({ id: '1', name: 'A' });
        expect(result['2']).toEqual({ id: '2', name: 'B' });
    });

    test('handles empty array', () => {
        expect(indexBy([], 'id')).toEqual({});
    });
});

describe('mapObject', () => {
    test('transforms object values', () => {
        const obj = { a: 1, b: 2, c: 3 };
        const result = mapObject(obj, (_k, v) => (v as number) * 2);
        expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });

    test('passes key to callback', () => {
        const obj = { x: 'val' };
        const result = mapObject(obj, (k, _v) => k.toUpperCase());
        expect(result).toEqual({ x: 'X' });
    });

    test('handles empty object', () => {
        expect(mapObject({}, () => null)).toEqual({});
    });
});

describe('everyAsync', () => {
    test('returns true when all items pass', async () => {
        const result = await everyAsync([2, 4, 6], async (n) => n % 2 === 0);
        expect(result).toBe(true);
    });

    test('returns false when any item fails', async () => {
        const result = await everyAsync([2, 3, 6], async (n) => n % 2 === 0);
        expect(result).toBe(false);
    });

    test('short-circuits on first failure', async () => {
        let count = 0;
        await everyAsync([1, 2, 3], async () => {
            count++;
            return false;
        });
        expect(count).toBe(1);
    });

    test('returns true for empty array', async () => {
        const result = await everyAsync([], async () => false);
        expect(result).toBe(true);
    });
});

describe('someAsync', () => {
    test('returns true when any item passes', async () => {
        const result = await someAsync([1, 2, 3], async (n) => n === 2);
        expect(result).toBe(true);
    });

    test('returns false when no item passes', async () => {
        const result = await someAsync([1, 2, 3], async (n) => n > 10);
        expect(result).toBe(false);
    });

    test('short-circuits on first match', async () => {
        let count = 0;
        await someAsync([1, 2, 3], async () => {
            count++;
            return true;
        });
        expect(count).toBe(1);
    });

    test('returns false for empty array', async () => {
        const result = await someAsync([], async () => true);
        expect(result).toBe(false);
    });
});

describe('everyWithErrorAsync', () => {
    test('returns true when all items return true', async () => {
        const result = await everyWithErrorAsync([1, 2, 3], async () => true);
        expect(result).toBe(true);
    });

    test('returns first error value', async () => {
        const result = await everyWithErrorAsync([1, 2, 3], async (n) => {
            if (n === 2) return 'error at 2';
            return true;
        });
        expect(result).toBe('error at 2');
    });

    test('short-circuits on first non-true result', async () => {
        let count = 0;
        await everyWithErrorAsync([1, 2, 3], async () => {
            count++;
            return 'fail';
        });
        expect(count).toBe(1);
    });

    test('returns true for empty array', async () => {
        const result = await everyWithErrorAsync([], async () => 'fail');
        expect(result).toBe(true);
    });
});
