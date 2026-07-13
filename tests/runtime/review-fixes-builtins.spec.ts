/**
 * Regression tests for the builtins findings of
 * agentspace/output/core-runtime-builtins-review.md:
 * - S17 (post-Attributive): collection payload membership checks are expressed as a
 *   Condition that queries the activity's own interaction events.
 * - S19: findStateNode must return the matched node itself in nested groups,
 *   not the `.current` of the first-level child sequence.
 * - S20: PayloadItem.type ('string'/'number'/'boolean'/'object') is enforced at runtime.
 * - S22: an unknown ActivityGroup type fails at definition/build time with a clear
 *   error instead of `new undefined()` at dispatch time.
 * - S23: head and non-head activity interactions share the same guard runner
 *   (conditions/payload checks cannot drift apart).
 */
import { describe, expect, test } from 'vitest';
import {
    Entity, Property, KlassByName, MatchExp,
    Controller, MonoSystem,
    Interaction, Action, Activity, ActivityGroup, Transfer, ActivityManager,
    Payload, PayloadItem, Condition, InteractionEventEntity,
    USER_ENTITY,
} from 'interaqt';
import { SQLiteDB } from '@drivers';

function makeInteraction(name: string, args: Record<string, unknown> = {}) {
    return Interaction.create({ name, action: Action.create({ name }), ...args });
}

async function buildController(activities: any[], eventSources: any[] = []) {
    const User = Entity.create({ name: USER_ENTITY, properties: [Property.create({ name: 'name', type: 'string' })] });
    const activityManager = new ActivityManager(activities);
    const out = activityManager.getOutput();
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system,
        entities: [User, ...out.entities],
        relations: [...out.relations],
        eventSources: [...out.eventSources, ...eventSources],
    });
    await controller.setup(true);
    return { controller, system, activityManager };
}

describe('S17: collection payload membership in activities (via Condition)', () => {
    test('membership against the assigning event payload is checked for later interactions', async () => {
        // PayloadItem.base 引用的 User entity 需要先存在于 registry：buildController 里创建。
        const User = Entity.create({ name: USER_ENTITY, properties: [Property.create({ name: 'name', type: 'string' })] });
        const start = makeInteraction('assignReviewers', {
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'reviewers',
                        type: 'Entity',
                        base: User,
                        isRef: true,
                        isCollection: true,
                    }),
                ],
            }),
        });
        const mustBeAssignedReviewer = Condition.create({
            name: 'mustBeAssignedReviewer',
            content: async function (this: Controller, event: any) {
                if (!event.activityId) return false;
                const assignEvent = await this.system.storage.findOne(
                    InteractionEventEntity.name,
                    MatchExp.atom({ key: 'interactionName', value: ['=', 'assignReviewers'] })
                        .and({ key: 'activity.id', value: ['=', event.activityId] }),
                    undefined,
                    ['*']
                );
                const reviewers = (assignEvent?.payload?.reviewers ?? []) as { id: string }[];
                return reviewers.some(r => r.id === event.user.id);
            }
        });
        const review = makeInteraction('submitReview', { conditions: mustBeAssignedReviewer });
        const activity = Activity.create({
            name: 'reviewFlow',
            interactions: [start, review],
            transfers: [Transfer.create({ name: 't', source: start, target: review })],
        });

        const activityManager = new ActivityManager([activity]);
        const out = activityManager.getOutput();
        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [User, ...out.entities],
            relations: [...out.relations],
            eventSources: [...out.eventSources],
        });
        await controller.setup(true);

        const owner = await system.storage.create(USER_ENTITY, { name: 'owner' });
        const reviewer1 = await system.storage.create(USER_ENTITY, { name: 'r1' });
        const reviewer2 = await system.storage.create(USER_ENTITY, { name: 'r2' });
        const outsider = await system.storage.create(USER_ENTITY, { name: 'outsider' });

        const startES = controller.findEventSourceByName('reviewFlow:assignReviewers')!;
        const reviewES = controller.findEventSourceByName('reviewFlow:submitReview')!;

        const res1 = await controller.dispatch(startES, {
            user: owner,
            payload: { reviewers: [{ id: reviewer1.id }, { id: reviewer2.id }] },
        });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // a non-member must be rejected by the membership condition
        const resOutsider = await controller.dispatch(reviewES, { user: outsider, activityId });
        expect(resOutsider.error).toBeTruthy();

        // a member must pass
        const resMember = await controller.dispatch(reviewES, { user: reviewer2, activityId });
        expect(resMember.error).toBeUndefined();

        await system.destroy();
    });
});

describe('S19: findStateNode with nested groups', () => {
    test('an interaction nested two group levels deep advances only its own sequence', async () => {
        const head = makeInteraction('nestedHead');
        const x1 = makeInteraction('nestedX1');
        const x2 = makeInteraction('nestedX2');
        const y = makeInteraction('nestedY');

        const innerGroup = ActivityGroup.create({
            type: 'every',
            activities: [
                Activity.create({
                    name: 'innerSeq',
                    interactions: [x1, x2],
                    transfers: [Transfer.create({ name: 'x12', source: x1, target: x2 })],
                }),
            ],
        });
        const outerGroup = ActivityGroup.create({
            type: 'every',
            activities: [
                Activity.create({ name: 'branchA', groups: [innerGroup], interactions: [] }),
                Activity.create({ name: 'branchB', interactions: [y] }),
            ],
        });
        const activity = Activity.create({
            name: 'nestedActivity',
            interactions: [head],
            groups: [outerGroup],
            transfers: [Transfer.create({ name: 't', source: head, target: outerGroup })],
        });

        const { controller, system } = await buildController([activity]);
        const user = await system.storage.create(USER_ENTITY, { name: 'u' });

        const headES = controller.findEventSourceByName('nestedActivity:nestedHead')!;
        const x1ES = controller.findEventSourceByName('nestedActivity:nestedX1')!;
        const x2ES = controller.findEventSourceByName('nestedActivity:nestedX2')!;
        const yES = controller.findEventSourceByName('nestedActivity:nestedY')!;

        const res1 = await controller.dispatch(headES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // completing x1 must advance the *inner* sequence to x2, not complete the
        // whole inner group (previously findStateNode returned the group node).
        const res2 = await controller.dispatch(x1ES, { user, activityId });
        expect(res2.error).toBeUndefined();

        const res3 = await controller.dispatch(x2ES, { user, activityId });
        expect(res3.error).toBeUndefined();

        const res4 = await controller.dispatch(yES, { user, activityId });
        expect(res4.error).toBeUndefined();

        await system.destroy();
    });
});

describe('S20: PayloadItem.type is enforced at runtime', () => {
    async function buildTypedInteraction() {
        const typed = makeInteraction('typedInteraction', {
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'title', type: 'string' }),
                    PayloadItem.create({ name: 'amount', type: 'number' }),
                    PayloadItem.create({ name: 'tags', type: 'string', isCollection: true }),
                    PayloadItem.create({ name: 'meta', type: 'object' }),
                ],
            }),
        });
        const User = Entity.create({ name: USER_ENTITY, properties: [Property.create({ name: 'name', type: 'string' })] });
        const system = new MonoSystem(new SQLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({ system, entities: [User], relations: [], eventSources: [typed] });
        await controller.setup(true);
        const user = await system.storage.create(USER_ENTITY, { name: 'u' });
        return { controller, system, user, typed };
    }

    test('rejects values that do not match the declared primitive type', async () => {
        const { controller, system, user, typed } = await buildTypedInteraction();

        const wrongString = await controller.dispatch(typed, { user, payload: { title: { some: 'object' } } });
        expect(wrongString.error).toBeTruthy();
        expect(String((wrongString.error as any).message ?? wrongString.error)).toMatch(/expected string/);

        const wrongNumber = await controller.dispatch(typed, { user, payload: { amount: '42' } });
        expect(wrongNumber.error).toBeTruthy();

        const wrongCollectionItem = await controller.dispatch(typed, { user, payload: { tags: ['ok', 42] } });
        expect(wrongCollectionItem.error).toBeTruthy();

        const nullObject = await controller.dispatch(typed, { user, payload: { meta: null } });
        expect(nullObject.error).toBeTruthy();

        await system.destroy();
    });

    test('accepts values matching the declared type', async () => {
        const { controller, system, user, typed } = await buildTypedInteraction();
        const ok = await controller.dispatch(typed, {
            user,
            payload: { title: 'hello', amount: 42, tags: ['a', 'b'], meta: { k: 'v' } },
        });
        expect(ok.error).toBeUndefined();
        await system.destroy();
    });
});

describe('S22: unknown ActivityGroup type fails at declaration time', () => {
    // r26 遗留收口：type 白名单从 ActivityManager 构造期前移到 ActivityGroup.create()
    //  （统一声明期校验）。ActivityCall.buildGraph 的运行期守卫保留为图手术路径的兜底。
    test('ActivityGroup.create rejects an unsupported group type with a clear message', () => {
        expect(() => ActivityGroup.create({ type: 'parallel-nonsense' }))
            .toThrowError(/ActivityGroup.*invalid "type".*"parallel-nonsense".*"any", "every", "race"/s);
    });
});

describe('S23: head and non-head interactions share the same guard runner', () => {
    test('conditions and payload type checks apply to non-head activity interactions', async () => {
        const head = makeInteraction('guardHead');
        const gated = makeInteraction('guardGated', {
            conditions: Condition.create({
                name: 'alwaysDeny',
                content: async function() { return false; },
            }),
            payload: Payload.create({
                items: [PayloadItem.create({ name: 'note', type: 'string' })],
            }),
        });
        const activity = Activity.create({
            name: 'guardActivity',
            interactions: [head, gated],
            transfers: [Transfer.create({ name: 't', source: head, target: gated })],
        });
        const { controller, system } = await buildController([activity]);
        const user = await system.storage.create(USER_ENTITY, { name: 'u' });

        const headES = controller.findEventSourceByName('guardActivity:guardHead')!;
        const gatedES = controller.findEventSourceByName('guardActivity:guardGated')!;

        const res1 = await controller.dispatch(headES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // condition check runs through the shared runner
        const denied = await controller.dispatch(gatedES, { user, activityId, payload: { note: 'x' } });
        expect(denied.error).toBeTruthy();

        await system.destroy();
    });

    test('payload type validation applies to head activity interactions too', async () => {
        const head = makeInteraction('typedHead', {
            payload: Payload.create({
                items: [PayloadItem.create({ name: 'title', type: 'string' })],
            }),
        });
        const activity = Activity.create({ name: 'typedHeadActivity', interactions: [head] });
        const { controller, system } = await buildController([activity]);
        const user = await system.storage.create(USER_ENTITY, { name: 'u' });

        const headES = controller.findEventSourceByName('typedHeadActivity:typedHead')!;
        const bad = await controller.dispatch(headES, { user, payload: { title: 123 } });
        expect(bad.error).toBeTruthy();

        const ok = await controller.dispatch(headES, { user, payload: { title: 'fine' } });
        expect(ok.error).toBeUndefined();

        await system.destroy();
    });
});
