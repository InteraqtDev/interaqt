/**
 * Regression tests for review findings F4 (Gateway) and F7 (any-group
 * exclusivity + concurrent state advancement)
 * (agentspace/output/core-runtime-builtins-review.md).
 *
 * Originally committed as failing-by-design (`test.fails`) reproductions;
 * the bugs are fixed, so these now assert the correct behavior:
 * - F4: Gateway control flow is not implemented by the activity runtime, so
 *   building the runtime state machine for an activity that uses Gateway
 *   nodes fails loudly instead of silently producing a stuck state machine.
 * - F7(a): 'any' groups are exclusive - once one branch advances, sibling
 *   branches are pruned and can no longer be dispatched.
 * - F7(b): activity state advancement is guarded by an optimistic version
 *   (stateVersion); a lost-update or an already-advanced state produces a
 *   clear error instead of an unhandled TypeError.
 */
import { describe, expect, test } from 'vitest';
import {
    Entity, Property, KlassByName,
    Controller, MonoSystem,
    Interaction, Action, Activity, ActivityGroup, Transfer, Gateway, ActivityManager,
} from 'interaqt';
import { SQLiteDB } from '@drivers';
import { MatchExp } from '@storage';

function makeInteraction(name: string) {
    return Interaction.create({ name, action: Action.create({ name }) });
}

async function buildActivityController(activity: any) {
    const User = Entity.create({ name: 'User', properties: [Property.create({ name: 'name', type: 'string' })] });
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
    const user = await system.storage.create('User', { name: 'u' });
    return { controller, system, user, activityManager };
}

describe('F4: Activity Gateway is explicitly rejected by the runtime', () => {
    // Gateway definitions carry no branching conditions and the activity state
    // machine tracks a single current node per sequence, so Gateway control flow
    // cannot be executed. Building the runtime must fail loudly instead of
    // producing an activity that gets stuck on an undispatchable node.
    test('an activity routed through a gateway is rejected when building the runtime', () => {
        const step1 = makeInteraction('gwStep1');
        const step2 = makeInteraction('gwStep2');
        const gw = Gateway.create({ name: 'gw1' });
        const activity = Activity.create({
            name: 'gatewayLinear',
            interactions: [step1, step2],
            gateways: [gw],
            transfers: [
                Transfer.create({ name: 't1', source: step1, target: gw }),
                Transfer.create({ name: 't2', source: gw, target: step2 }),
            ],
        });

        expect(() => new ActivityManager([activity])).toThrowError(/Gateway/);
    });

    test('a gateway declared but unused in transfers is also rejected', () => {
        const a = makeInteraction('gwOnlyA');
        const b = makeInteraction('gwOnlyB');
        const gw = Gateway.create({ name: 'gwUnusedInTransfers' });
        const activity = Activity.create({
            name: 'gatewayDeclared',
            interactions: [a, b],
            gateways: [gw],
            transfers: [Transfer.create({ name: 't', source: a, target: b })],
        });

        expect(() => new ActivityManager([activity])).toThrowError(/Gateway/);
    });
});

describe('F7(a): any-group exclusivity with multi-step branches', () => {
    test('advancing one branch of an any-group prunes the sibling branch', async () => {
        const send = makeInteraction('xorSend');
        const approve1 = makeInteraction('xorApprove1');
        const approve2 = makeInteraction('xorApprove2');
        const reject1 = makeInteraction('xorReject1');
        const reject2 = makeInteraction('xorReject2');

        const responseGroup = ActivityGroup.create({
            type: 'any',
            activities: [
                Activity.create({
                    name: 'xorApproveSeq',
                    interactions: [approve1, approve2],
                    transfers: [Transfer.create({ name: 'a12', source: approve1, target: approve2 })],
                }),
                Activity.create({
                    name: 'xorRejectSeq',
                    interactions: [reject1, reject2],
                    transfers: [Transfer.create({ name: 'r12', source: reject1, target: reject2 })],
                }),
            ],
        });

        const activity = Activity.create({
            name: 'xorActivity',
            interactions: [send],
            groups: [responseGroup],
            transfers: [Transfer.create({ name: 't', source: send, target: responseGroup })],
        });
        const { controller, system, user, activityManager } = await buildActivityController(activity);

        const sendES = controller.findEventSourceByName('xorActivity:xorSend')!;
        const approve1ES = controller.findEventSourceByName('xorActivity:xorApprove1')!;
        const approve2ES = controller.findEventSourceByName('xorActivity:xorApprove2')!;
        const reject1ES = controller.findEventSourceByName('xorActivity:xorReject1')!;
        const reject2ES = controller.findEventSourceByName('xorActivity:xorReject2')!;

        const res1 = await controller.dispatch(sendES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // Take the approve branch: this must prune the reject branch.
        const res2 = await controller.dispatch(approve1ES, { user, activityId });
        expect(res2.error).toBeUndefined();

        // 'any' = exclusive choice; the reject branch must no longer be available.
        const res3 = await controller.dispatch(reject1ES, { user, activityId });
        expect(res3.error).toBeTruthy();
        const res4 = await controller.dispatch(reject2ES, { user, activityId });
        expect(res4.error).toBeTruthy();

        // The surviving branch keeps working and completes the group (and here the
        // whole activity, since the group is the tail).
        const res5 = await controller.dispatch(approve2ES, { user, activityId });
        expect(res5.error).toBeUndefined();

        const activityCall = activityManager.getActivityCallByName('xorActivity')!;
        const finalState = await activityCall.getState(controller, activityId);
        expect(finalState.current).toBeUndefined();
        await system.destroy();
    });
});

describe('F7(b): activity state advancement is version-guarded', () => {
    async function buildTwoStepActivity() {
        const step1 = makeInteraction('casStep1');
        const step2 = makeInteraction('casStep2');
        const activity = Activity.create({
            name: 'casActivity',
            interactions: [step1, step2],
            transfers: [Transfer.create({ name: 't', source: step1, target: step2 })],
        });
        const built = await buildActivityController(activity);
        return { ...built, step1, step2 };
    }

    test('stateVersion increments on every state advancement', async () => {
        const { controller, system, user } = await buildTwoStepActivity();
        const step1ES = controller.findEventSourceByName('casActivity:casStep1')!;
        const step2ES = controller.findEventSourceByName('casActivity:casStep2')!;

        const res1 = await controller.dispatch(step1ES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        let record = await system.storage.findOne('_Activity_',
            MatchExp.atom({ key: 'id', value: ['=', activityId] }), undefined, ['*']);
        expect(record.stateVersion).toBe(1);

        const res2 = await controller.dispatch(step2ES, { user, activityId });
        expect(res2.error).toBeUndefined();

        record = await system.storage.findOne('_Activity_',
            MatchExp.atom({ key: 'id', value: ['=', activityId] }), undefined, ['*']);
        expect(record.stateVersion).toBe(2);
        await system.destroy();
    });

    test('completing an interaction that is no longer in the state fails with a clear error, not a TypeError', async () => {
        const { controller, system, user, activityManager, step1 } = await buildTwoStepActivity();
        const step1ES = controller.findEventSourceByName('casActivity:casStep1')!;

        const res1 = await controller.dispatch(step1ES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // Simulate the loser of a concurrent race: the state has already advanced
        // past step1, so completing it again must produce a clear business error
        // (previously: `TypeError: Cannot read properties of undefined (reading 'complete')`).
        const activityCall = activityManager.getActivityCallByName('casActivity')!;
        await expect(activityCall.completeInteractionState(controller, activityId, step1.uuid))
            .rejects.toThrowError(/not available/);
        await system.destroy();
    });

    test('a concurrent state bump makes the conditional update fail with a clear error', async () => {
        const { controller, system, user, activityManager, step2 } = await buildTwoStepActivity();
        const step1ES = controller.findEventSourceByName('casActivity:casStep1')!;

        const res1 = await controller.dispatch(step1ES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // Simulate a lost update: another dispatch bumped stateVersion between our
        // read and write. Intercept getActivity to return a stale version.
        const activityCall = activityManager.getActivityCallByName('casActivity')!;
        const originalGetActivity = activityCall.getActivity.bind(activityCall);
        activityCall.getActivity = async (storage: any, id: string) => {
            const activity = await originalGetActivity(storage, id);
            return { ...activity, stateVersion: (activity.stateVersion ?? 0) - 1 };
        };
        try {
            await expect(activityCall.completeInteractionState(controller, activityId, step2.uuid))
                .rejects.toThrowError(/concurrently/);
        } finally {
            activityCall.getActivity = originalGetActivity;
        }
        await system.destroy();
    });
});
