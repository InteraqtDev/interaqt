/**
 * r17 内部假设审计（盲区 4）落地：把「注释里的不可能」变成声明期可执行断言。
 *
 * - A-1/A-3：对称（source===target 且同名属性）关系只在 n:n 上有实现——
 *   存储层的方向变体展开与写路径双侧匹配都以 isLinkManyToManySymmetric 为前提。
 *   对称 1:1/n:1/1:n 此前被静默接受但只有单侧可读写（spouse 建边后另一侧查不到）。
 * - A-2/A-4/A-5：DeletionExecutor 的注释断言「reliance 只可能是 1:x」，但声明期
 *   从未校验——n:n/n:1 + isTargetReliance 被静默接受，共享 target 会在任一 source
 *   删除时被级联过删（另一个 source 仍持有它）。
 */
import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';

function makeEntities() {
    const User = Entity.create({ name: `U_${Math.random().toString(36).slice(2, 8)}`, properties: [Property.create({ name: 'name', type: 'string' })] });
    const Doc = Entity.create({ name: `D_${Math.random().toString(36).slice(2, 8)}`, properties: [Property.create({ name: 'title', type: 'string' })] });
    return { User, Doc };
}

describe('relation declaration guards (r17 assumption audit)', () => {
    test('symmetric non-n:n relations are rejected at declaration', () => {
        for (const type of ['1:1', 'n:1', '1:n'] as const) {
            const { User } = makeEntities();
            expect(() => Relation.create({
                source: User, sourceProperty: 'peer', target: User, targetProperty: 'peer',
                type
            }), `symmetric ${type} must be rejected`).toThrow(/Symmetric .* only supported for type 'n:n'/);
        }
    });

    test('symmetric n:n stays legal; directed self-reference with distinct properties stays legal', () => {
        const { User } = makeEntities();
        expect(() => Relation.create({
            source: User, sourceProperty: 'friends', target: User, targetProperty: 'friends',
            type: 'n:n'
        })).not.toThrow();

        const { User: User2 } = makeEntities();
        expect(() => Relation.create({
            source: User2, sourceProperty: 'mentor', target: User2, targetProperty: 'mentees',
            type: 'n:1'
        })).not.toThrow();
    });

    test('isTargetReliance with shared-target cardinality (n:1 / n:n) is rejected at declaration', () => {
        for (const type of ['n:1', 'n:n'] as const) {
            const { User, Doc } = makeEntities();
            expect(() => Relation.create({
                source: User, sourceProperty: 'docs', target: Doc, targetProperty: 'holders',
                type,
                isTargetReliance: true
            }), `reliance ${type} must be rejected`).toThrow(/isTargetReliance with type/);
        }
    });

    test('isTargetReliance with exclusive-target cardinality (1:1 / 1:n) stays legal', () => {
        for (const type of ['1:1', '1:n'] as const) {
            const { User, Doc } = makeEntities();
            expect(() => Relation.create({
                source: User, sourceProperty: 'docs', target: Doc, targetProperty: 'holder',
                type,
                isTargetReliance: true
            }), `reliance ${type} must stay legal`).not.toThrow();
        }
    });
});
