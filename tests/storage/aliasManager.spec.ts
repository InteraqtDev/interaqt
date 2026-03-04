import { describe, test, expect, beforeEach } from 'vitest';
import { AliasManager } from '../../src/storage/erstorage/util/AliasManager.js';

describe('AliasManager', () => {
    let manager: AliasManager;

    beforeEach(() => {
        manager = new AliasManager();
    });

    describe('registerTablePath', () => {
        test('returns short path as-is (no alias needed)', () => {
            const alias = manager.registerTablePath('User');
            expect(alias).toBe('User');
        });

        test('generates alias for long path exceeding 63 chars', () => {
            const longPath = 'A'.repeat(64);
            const alias = manager.registerTablePath(longPath);
            expect(alias).toBe('T1');
        });

        test('returns same alias for duplicate registration', () => {
            const alias1 = manager.registerTablePath('User');
            const alias2 = manager.registerTablePath('User');
            expect(alias1).toBe(alias2);
        });

        test('increments counter for multiple long paths', () => {
            const a1 = manager.registerTablePath('A'.repeat(64));
            const a2 = manager.registerTablePath('B'.repeat(64));
            expect(a1).toBe('T1');
            expect(a2).toBe('T2');
        });
    });

    describe('getTableAlias / getTablePath', () => {
        test('retrieves alias after registration', () => {
            manager.registerTablePath('User');
            expect(manager.getTableAlias('User')).toBe('User');
        });

        test('retrieves path from alias', () => {
            const longPath = 'X'.repeat(64);
            manager.registerTablePath(longPath);
            expect(manager.getTablePath('T1')).toBe(longPath);
        });

        test('returns undefined for unregistered path', () => {
            expect(manager.getTableAlias('Unknown')).toBeUndefined();
        });

        test('returns undefined for unregistered alias', () => {
            expect(manager.getTablePath('T999')).toBeUndefined();
        });
    });

    describe('registerFieldPath', () => {
        test('generates sequential field aliases', () => {
            const a1 = manager.registerFieldPath(['User', 'name']);
            const a2 = manager.registerFieldPath(['User', 'email']);
            expect(a1).toBe('FIELD_1');
            expect(a2).toBe('FIELD_2');
        });

        test('returns same alias for duplicate field path', () => {
            const a1 = manager.registerFieldPath(['User', 'name']);
            const a2 = manager.registerFieldPath(['User', 'name']);
            expect(a1).toBe(a2);
        });
    });

    describe('getFieldAlias / getFieldPath', () => {
        test('retrieves field alias after registration', () => {
            manager.registerFieldPath(['User', 'name']);
            expect(manager.getFieldAlias(['User', 'name'])).toBe('FIELD_1');
        });

        test('retrieves field path from alias', () => {
            manager.registerFieldPath(['User', 'posts', 'title']);
            expect(manager.getFieldPath('FIELD_1')).toEqual(['User', 'posts', 'title']);
        });

        test('returns undefined for unregistered field path', () => {
            expect(manager.getFieldAlias(['Unknown'])).toBeUndefined();
        });

        test('returns undefined for unregistered field alias', () => {
            expect(manager.getFieldPath('FIELD_999')).toBeUndefined();
        });
    });

    describe('preregisterTablePaths', () => {
        test('batch-registers multiple paths', () => {
            manager.preregisterTablePaths(['User', 'Post', 'Comment']);
            expect(manager.getTableAlias('User')).toBe('User');
            expect(manager.getTableAlias('Post')).toBe('Post');
            expect(manager.getTableAlias('Comment')).toBe('Comment');
        });

        test('handles mix of short and long paths', () => {
            const longPath = 'Z'.repeat(64);
            manager.preregisterTablePaths(['Short', longPath]);
            expect(manager.getTableAlias('Short')).toBe('Short');
            expect(manager.getTableAlias(longPath)).toBe('T1');
        });
    });

    describe('getTableAliasMap / getFieldAliasMap / getFieldPathMap', () => {
        test('returns copy of table alias map', () => {
            manager.registerTablePath('User');
            const map = manager.getTableAliasMap();
            expect(map.get('User')).toBe('User');
            map.set('Extra', 'E');
            expect(manager.getTableAlias('Extra')).toBeUndefined();
        });

        test('returns copy of field alias map', () => {
            manager.registerFieldPath(['A', 'b']);
            const map = manager.getFieldAliasMap();
            expect(map.get('A.b')).toBe('FIELD_1');
        });

        test('returns copy of field path map', () => {
            manager.registerFieldPath(['X', 'y']);
            const map = manager.getFieldPathMap();
            expect(map.get('FIELD_1')).toEqual(['X', 'y']);
            map.set('FIELD_99', ['extra']);
            expect(manager.getFieldPath('FIELD_99')).toBeUndefined();
        });
    });

    describe('clear', () => {
        test('resets all state', () => {
            manager.registerTablePath('User');
            manager.registerFieldPath(['User', 'name']);
            const longPath = 'L'.repeat(64);
            manager.registerTablePath(longPath);

            manager.clear();

            expect(manager.getTableAlias('User')).toBeUndefined();
            expect(manager.getFieldAlias(['User', 'name'])).toBeUndefined();
            expect(manager.getTableAlias(longPath)).toBeUndefined();
        });

        test('resets counters', () => {
            const long1 = 'A'.repeat(64);
            manager.registerTablePath(long1);
            expect(manager.getTableAlias(long1)).toBe('T1');

            manager.clear();

            const long2 = 'B'.repeat(64);
            manager.registerTablePath(long2);
            expect(manager.getTableAlias(long2)).toBe('T1');
        });
    });
});
