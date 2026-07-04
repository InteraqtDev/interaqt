import { describe, test, expect, beforeEach } from 'vitest';
import {
    Entity, Relation, Property, Dictionary,
    Count, Transform, StateMachine, StateNode, StateTransfer, Custom,
    UniqueConstraint, NonNullConstraint,
    stringifyAllInstances, createInstancesFromString, clearAllInstances,
    KlassByName,
} from '@core';
import type {
    EntityInstance, RelationInstance, PropertyInstance,
    CountInstance, TransformInstance, StateMachineInstance, DictionaryInstance,
    UniqueConstraintInstance, NonNullConstraintInstance, CustomInstance,
} from '@core';

// S10/S11 回归：stringifyAllInstances / createInstancesFromString 必须是完整可
// round-trip 的 public API —— 嵌套实例引用、函数、循环引用（property.computation ->
// relation -> entity -> property）都要还原为真正的 Instance / Function。
const allKlasses = [
    Entity, Relation, Property, Dictionary,
    Count, Transform, StateMachine, StateNode, StateTransfer, Custom,
    UniqueConstraint, NonNullConstraint,
];

beforeEach(() => {
    clearAllInstances(...allKlasses);
});

function buildModel() {
    const draft = StateNode.create({ name: 'draft' });
    const published = StateNode.create({ name: 'published', computeValue: () => 'published' });
    const publishTransfer = StateTransfer.create({
        trigger: { recordName: '_Interaction_', type: 'create', record: { interactionName: 'Publish' } },
        current: draft,
        next: published,
    });

    const User = Entity.create({
        name: 'User',
        properties: [
            Property.create({ name: 'name', type: 'string', defaultValue: () => 'anonymous' }),
        ],
        constraints: [
            UniqueConstraint.create({ name: 'uniqueUserName', properties: ['name'] }),
            NonNullConstraint.create({ name: 'userNameNotNull', property: 'name' }),
        ],
    });

    // likeCount 的 computation 引用 LikeRelation，而 LikeRelation.target 又引用 Post：
    // 这是实例图中典型的循环引用。
    const likeCountProperty = Property.create({ name: 'likeCount', type: 'number' });
    const statusProperty = Property.create({
        name: 'status',
        type: 'string',
        computation: StateMachine.create({
            states: [draft, published],
            transfers: [publishTransfer],
            initialState: draft,
        }),
    });
    const titleProperty = Property.create({
        name: 'title',
        type: 'string',
        computed: (post: { name?: string }) => `title-of-${post.name ?? 'unknown'}`,
    });
    const Post = Entity.create({
        name: 'Post',
        properties: [likeCountProperty, statusProperty, titleProperty],
    });

    const LikeRelation = Relation.create({
        source: User,
        sourceProperty: 'likedPosts',
        target: Post,
        targetProperty: 'likedBy',
        type: 'n:n',
        properties: [Property.create({ name: 'likedAt', type: 'number' })],
    });
    likeCountProperty.computation = Count.create({
        record: LikeRelation,
        callback: (relation: { likedAt?: number }) => !!relation.likedAt,
    });

    const PublishedPost = Entity.create({
        name: 'PublishedPost',
        baseEntity: Post,
        matchExpression: { key: 'status', value: ['=', 'published'] },
    });

    const ActiveLike = Relation.create({
        name: 'ActiveLike',
        baseRelation: LikeRelation,
        sourceProperty: 'activeLikedPosts',
        targetProperty: 'activeLikedBy',
        matchExpression: { key: 'likedAt', value: ['not', null] },
    });

    const AuditLog = Entity.create({
        name: 'AuditLog',
        properties: [Property.create({ name: 'action', type: 'string' })],
        computation: Transform.create({
            eventDeps: {
                like: { recordName: LikeRelation.name!, type: 'create' },
            },
            callback: () => ({ action: 'like' }),
        }),
    });

    const totalPosts = Dictionary.create({
        name: 'totalPosts',
        type: 'number',
        defaultValue: () => 0,
        computation: Count.create({ record: Post }),
    });

    const customDict = Dictionary.create({
        name: 'customValue',
        type: 'number',
        computation: Custom.create({
            name: 'customValueComputation',
            compute: () => 42,
        }),
    });

    return { User, Post, LikeRelation, PublishedPost, ActiveLike, AuditLog, totalPosts, customDict };
}

describe('full instance graph round-trip', () => {
    test('stringifyAllInstances -> createInstancesFromString restores instances, references, functions and cycles', () => {
        const original = buildModel();
        const json = stringifyAllInstances();

        clearAllInstances(...allKlasses);
        const restored = createInstancesFromString(json);

        const User = restored.get(original.User.uuid) as EntityInstance;
        const Post = restored.get(original.Post.uuid) as EntityInstance;
        const LikeRelation = restored.get(original.LikeRelation.uuid) as RelationInstance;
        const PublishedPost = restored.get(original.PublishedPost.uuid) as EntityInstance;
        const ActiveLike = restored.get(original.ActiveLike.uuid) as RelationInstance;
        const AuditLog = restored.get(original.AuditLog.uuid) as EntityInstance;
        const totalPosts = restored.get(original.totalPosts.uuid) as DictionaryInstance;
        const customDict = restored.get(original.customDict.uuid) as DictionaryInstance;

        // entities and nested properties are real instances
        expect(Entity.is(User)).toBe(true);
        expect(User.properties.every(p => Property.is(p))).toBe(true);
        const nameProperty = User.properties.find(p => p.name === 'name')!;
        expect(typeof nameProperty.defaultValue).toBe('function');
        expect(nameProperty.defaultValue!()).toBe('anonymous');

        // constraints restored as instances
        expect(User.constraints).toHaveLength(2);
        expect(UniqueConstraint.is(User.constraints![0])).toBe(true);
        expect((User.constraints![0] as UniqueConstraintInstance).properties).toEqual(['name']);
        expect(NonNullConstraint.is(User.constraints![1])).toBe(true);
        expect((User.constraints![1] as NonNullConstraintInstance).property).toBe('name');

        // relation structural refs point to the restored entity instances
        expect(Relation.is(LikeRelation)).toBe(true);
        expect(LikeRelation.source).toBe(User);
        expect(LikeRelation.target).toBe(Post);
        expect(LikeRelation.properties.every(p => Property.is(p))).toBe(true);

        // cyclic reference: Post.likeCount.computation -> Count -> LikeRelation -> Post
        const likeCount = Post.properties.find(p => p.name === 'likeCount')!;
        expect(Count.is(likeCount.computation)).toBe(true);
        const count = likeCount.computation as CountInstance;
        expect(count.record).toBe(LikeRelation);
        expect(typeof count.callback).toBe('function');
        expect(count.callback!({ likedAt: 1 })).toBe(true);

        // computed function restored
        const title = Post.properties.find(p => p.name === 'title')!;
        expect(typeof title.computed).toBe('function');
        expect(title.computed!({ name: 'p1' })).toBe('title-of-p1');

        // state machine graph restored with shared state node identity
        const status = Post.properties.find(p => p.name === 'status')!;
        expect(StateMachine.is(status.computation)).toBe(true);
        const stateMachine = status.computation as StateMachineInstance;
        expect(stateMachine.states).toHaveLength(2);
        expect(stateMachine.states.every(s => StateNode.is(s))).toBe(true);
        expect(stateMachine.initialState).toBe(stateMachine.states.find(s => s.name === 'draft'));
        const transfer = stateMachine.transfers[0];
        expect(StateTransfer.is(transfer)).toBe(true);
        expect(transfer.current).toBe(stateMachine.states.find(s => s.name === 'draft'));
        expect(transfer.next).toBe(stateMachine.states.find(s => s.name === 'published'));
        expect(transfer.trigger).toEqual({ recordName: '_Interaction_', type: 'create', record: { interactionName: 'Publish' } });
        expect(typeof stateMachine.states.find(s => s.name === 'published')!.computeValue).toBe('function');

        // filtered entity / filtered relation
        expect(PublishedPost.baseEntity).toBe(Post);
        expect(PublishedPost.matchExpression).toEqual({ key: 'status', value: ['=', 'published'] });
        expect(ActiveLike.baseRelation).toBe(LikeRelation);
        expect(ActiveLike.source).toBe(User);
        expect(ActiveLike.target).toBe(Post);

        // Transform keeps eventDeps (previously dropped by stringify)
        const transform = AuditLog.computation as TransformInstance;
        expect(Transform.is(transform)).toBe(true);
        expect(transform.eventDeps).toEqual({ like: { recordName: original.LikeRelation.name, type: 'create' } });
        expect(typeof transform.callback).toBe('function');

        // Dictionary keeps defaultValue and computation (previously dropped fields)
        expect(typeof totalPosts.defaultValue).toBe('function');
        expect(totalPosts.defaultValue!()).toBe(0);
        expect(Count.is(totalPosts.computation)).toBe(true);
        expect((totalPosts.computation as CountInstance).record).toBe(Post);

        // Custom is registered (S11) and round-trips
        expect(KlassByName.has('Custom')).toBe(true);
        expect(KlassByName.has('NonNullConstraint')).toBe(true);
        const custom = customDict.computation as CustomInstance;
        expect(Custom.is(custom)).toBe(true);
        expect(custom.compute!()).toBe(42);
    });

    test('merged relation round-trips with derived source/target and inherited type', () => {
        const A = Entity.create({ name: 'A' });
        const B = Entity.create({ name: 'B' });
        const r1 = Relation.create({ name: 'R1', source: A, sourceProperty: 'r1b', target: B, targetProperty: 'r1a', type: '1:n' });
        const r2 = Relation.create({ name: 'R2', source: A, sourceProperty: 'r2b', target: B, targetProperty: 'r2a', type: '1:n' });
        const merged = Relation.create({
            name: 'Merged',
            inputRelations: [r1, r2],
            sourceProperty: 'mergedB',
            targetProperty: 'mergedA',
        });

        const json = stringifyAllInstances();
        clearAllInstances(...allKlasses);
        const restored = createInstancesFromString(json);

        const restoredMerged = restored.get(merged.uuid) as RelationInstance;
        const restoredA = restored.get(A.uuid) as EntityInstance;
        const restoredB = restored.get(B.uuid) as EntityInstance;
        expect(restoredMerged.inputRelations).toHaveLength(2);
        expect(restoredMerged.inputRelations![0]).toBe(restored.get(r1.uuid));
        expect(restoredMerged.source).toBe(restoredA);
        expect(restoredMerged.target).toBe(restoredB);
        expect(restoredMerged.type).toBe('1:n');
    });

    test('property-level Summation/Average/Every/Count keep their `property` field through stringify', () => {
        // 直接检查序列化输出，防止字段再次丢失
        const E = Entity.create({ name: 'E', properties: [Property.create({ name: 'score', type: 'number' })] });
        const R = Relation.create({ source: E, sourceProperty: 'others', target: E, targetProperty: 'owner', type: 'n:n' });
        const count = Count.create({ record: R, property: 'score', direction: 'source' });
        const data = JSON.parse(Count.stringify(count));
        expect(data.public.property).toBe('score');
        expect(data.public.direction).toBe('source');
        expect(data.public.record).toBe(`uuid::${R.uuid}`);
    });
});
