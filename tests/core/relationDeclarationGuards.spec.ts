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

    // r20：filtered/merged relation 的 type/source/target 一律继承，显式传入的矛盾值此前
    // 通过 create 校验后被静默丢弃（声明形同虚设）——现在 fail-fast；与 base 一致的显式值
    // 放行（Relation.clone 会原样携带这些字段）。
    test('filtered relation with contradictory type/source/target is rejected; consistent explicit values stay legal (r20)', () => {
        const { User, Doc } = makeEntities();
        const base = Relation.create({
            source: User, sourceProperty: 'docs', target: Doc, targetProperty: 'owner',
            type: '1:n',
            properties: [Property.create({ name: 'pinned', type: 'boolean' })]
        });
        const matchExpression = { type: 'atom', data: { key: 'pinned', value: ['=', true] } };
        expect(() => Relation.create({
            baseRelation: base, matchExpression,
            sourceProperty: 'pinnedDocs', targetProperty: 'pinnedOwner',
            type: '1:1'
        })).toThrow(/always inherits the base relation's type/);
        expect(() => Relation.create({
            baseRelation: base, matchExpression,
            sourceProperty: 'pinnedDocs', targetProperty: 'pinnedOwner',
            source: Doc
        })).toThrow(/inherits the base relation's endpoints/);
        expect(() => Relation.create({
            baseRelation: base, matchExpression,
            sourceProperty: 'pinnedDocs', targetProperty: 'pinnedOwner',
            target: User
        })).toThrow(/inherits the base relation's endpoints/);
        // 与 base 一致的显式值（clone 形态）合法
        expect(() => Relation.create({
            baseRelation: base, matchExpression,
            sourceProperty: 'pinnedDocs2', targetProperty: 'pinnedOwner2',
            type: '1:n', source: User, target: Doc
        })).not.toThrow();
        // clone 往返不受守卫影响
        const filtered = Relation.create({
            baseRelation: base, matchExpression,
            sourceProperty: 'pinnedDocs3', targetProperty: 'pinnedOwner3'
        });
        expect(() => Relation.clone(filtered, false)).not.toThrow();
    });

    test('merged relation with contradictory type is rejected (r20)', () => {
        const { User, Doc } = makeEntities();
        const r1 = Relation.create({ source: User, sourceProperty: 'a', target: Doc, targetProperty: 'ra', type: 'n:n' });
        const r2 = Relation.create({ source: User, sourceProperty: 'b', target: Doc, targetProperty: 'rb', type: 'n:n' });
        expect(() => Relation.create({
            name: 'MergedAB', inputRelations: [r1, r2],
            sourceProperty: 'ab', targetProperty: 'rab',
            type: '1:n'
        })).toThrow(/always inherits its input relations' type/);
        expect(() => Relation.create({
            name: 'MergedAB2', inputRelations: [r1, r2],
            sourceProperty: 'ab2', targetProperty: 'rab2',
            type: 'n:n'
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
