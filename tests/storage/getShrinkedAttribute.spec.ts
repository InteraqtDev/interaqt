import { expect, test, describe } from 'vitest';
import { EntityToTableMap } from '../../src/storage/erstorage/EntityToTableMap.js';
import { entityToTableMapData } from './data/mapData.js';

describe("getShrinkedAttribute test", () => {
    const entityToTableMap = new EntityToTableMap(entityToTableMapData);

    // 测试基本的路径压缩
    test("should shrink path when source/target matches the relation's target", () => {
        // owner 是 File 指向 User 的关系
        // owner.&.target 应该指向 User，所以可以压缩
        const result = entityToTableMap.getShrinkedAttribute('File', 'owner.&.target.name');
        expect(result).toBe('owner.name');
    });

    test("should not shrink path when source/target doesn't match", () => {
        // owner 是 File 指向 User 的关系
        // owner.&.source 指向 File，而 owner 指向 User，不能压缩
        const result = entityToTableMap.getShrinkedAttribute('File', 'owner.&.source.name');
        expect(result).toBe('owner.&.source.name');
    });

    test("should handle multiple levels of paths", () => {
        // 测试嵌套路径 - 使用正确的关系
        // User.profile 指向 Profile，Profile_owner_profile_User 的 source 是 Profile
        // 所以 profile.&.source 应该指向 Profile，可以压缩
        const result = entityToTableMap.getShrinkedAttribute('User', 'profile.&.source.title');
        expect(result).toBe('profile.title');
    });

    test("should handle paths without & symbol", () => {
        // 没有 & 符号的路径应该保持不变
        const result = entityToTableMap.getShrinkedAttribute('User', 'profile.title');
        expect(result).toBe('profile.title');
    });

    test("should handle complex paths with multiple & symbols", () => {
        // 测试多个 & 符号的情况
        // owner.&.target 可以压缩为 owner（都指向 User）
        // profile.&.source 可以压缩为 profile（都指向 Profile）
        const result = entityToTableMap.getShrinkedAttribute('File', 'owner.&.target.profile.&.source.title');
        expect(result).toBe('owner.profile.title');
    });

    test("should handle invalid paths gracefully", () => {
        // 测试无效路径
        expect(() => {
            entityToTableMap.getShrinkedAttribute('User', 'nonexistent.&.target.name');
        }).toThrow();
    });

    test("should handle paths ending with &", () => {
        // 测试以 & 结尾的路径
        const result = entityToTableMap.getShrinkedAttribute('User', 'profile.&');
        expect(result).toBe('profile.&');
    });

    test("should handle relation entity paths", () => {
        // 测试关系实体的路径
        const result = entityToTableMap.getShrinkedAttribute('File_owner_file_User', 'target.name');
        expect(result).toBe('target.name');
    });

    test("should shrink self-referencing paths correctly", () => {
        // 测试自引用关系
        const result = entityToTableMap.getShrinkedAttribute('User', 'leader.&.target.name');
        expect(result).toBe('leader.name');
    });
}); 