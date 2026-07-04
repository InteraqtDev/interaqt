/**
 * Reproduction tests for review findings F5 (Gateway broken) and
 * F8b/S18 (any-group pruning discarded)
 * (agentspace/output/core-runtime-builtins-review.md).
 *
 * Every test asserts the CORRECT behavior and is marked `test.fails`:
 * it passes today because the bug makes the assertion fail. When a bug is
 * fixed, the corresponding test will turn red - remove `.fails` then.
 */
import { describe, expect, test } from 'vitest';
import {
    Entity, Property, KlassByName,
    Controller, MonoSystem,
    Interaction, Action, Activity, ActivityGroup, Transfer, Gateway, ActivityManager,
} from 'interaqt';
import { SQLiteDB } from '@drivers';

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

describe('F5: Activity Gateway', () => {
    // BUG: transferToNext parks the persisted state on the GatewayNode's uuid.
    // isInteractionAvailable only ever matches Interaction/Group uuids, and a
    // Gateway uuid can never be dispatched, so the activity is stuck forever.
    test.fails('F5a: linear activity with a gateway in the middle can proceed past the gateway', async () => {
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
        const { controller, system, user } = await buildActivityController(activity);

        const step1ES = controller.findEventSourceByName('gatewayLinear:gwStep1')!;
        const step2ES = controller.findEventSourceByName('gatewayLinear:gwStep2')!;

        const res1 = await controller.dispatch(step1ES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // Gateway should be transparent: step2 must now be available.
        const res2 = await controller.dispatch(step2ES, { user, activityId });
        expect(res2.error).toBeUndefined();
        await system.destroy();
    });

    // BUG: in buildGraph, `Gateway.is(sourceNode)` tests the graph-node wrapper
    // (which has no `_type`), so it is always false and `sourceNode.next = targetNode`
    // overwrites the GatewayNode's `next: []` array - only the last outgoing
    // edge survives, destroying fork topology.
    test.fails('F5b: gateway with two outgoing transfers keeps both edges in the graph', async () => {
        const a = makeInteraction('gwA');
        const b = makeInteraction('gwB');
        const c = makeInteraction('gwC');
        const d = makeInteraction('gwD');
        const gw = Gateway.create({ name: 'gwFork' });
        const activity = Activity.create({
            name: 'gatewayFork',
            interactions: [a, b, c, d],
            gateways: [gw],
            transfers: [
                Transfer.create({ name: 'f1', source: a, target: gw }),
                Transfer.create({ name: 'f2', source: gw, target: b }),
                Transfer.create({ name: 'f3', source: gw, target: c }),
                Transfer.create({ name: 'f4', source: b, target: d }),
                Transfer.create({ name: 'f5', source: c, target: d }),
            ],
        });

        const activityManager = new ActivityManager([activity]);
        const activityCall = activityManager.getActivityCallByName('gatewayFork')!;
        const gwNode = activityCall.getNodeByUUID(gw.uuid)! as any;

        expect(Array.isArray(gwNode.next)).toBe(true);
        expect(gwNode.next.length).toBe(2);
    });
});

describe('F8b/S18: any-group exclusivity with multi-step branches', () => {
    // BUG: AnyActivityStateNode.onChange returns `{ children: <pruned> }` but
    // nothing consumes the return value, so after one branch of an 'any' group
    // advances, sibling branches remain live. Mutually exclusive branches can
    // then BOTH be executed to completion - sequentially, no concurrency needed.
    test.fails('advancing one branch of an any-group prunes the sibling branch', async () => {
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
        const { controller, system, user } = await buildActivityController(activity);

        const sendES = controller.findEventSourceByName('xorActivity:xorSend')!;
        const approve1ES = controller.findEventSourceByName('xorActivity:xorApprove1')!;
        const reject1ES = controller.findEventSourceByName('xorActivity:xorReject1')!;

        const res1 = await controller.dispatch(sendES, { user });
        expect(res1.error).toBeUndefined();
        const activityId = res1.context!.activityId as string;

        // Take the approve branch: this must prune the reject branch.
        const res2 = await controller.dispatch(approve1ES, { user, activityId });
        expect(res2.error).toBeUndefined();

        // 'any' = exclusive choice; the reject branch must no longer be available.
        const res3 = await controller.dispatch(reject1ES, { user, activityId });
        expect(res3.error).toBeTruthy();
        await system.destroy();
    });
});
