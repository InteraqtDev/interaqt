import { ActivityInstance } from '../Activity.js';
import { InteractionEventEntity, InteractionInstance, InteractionEventArgs, INTERACTION_RECORD } from '../Interaction.js';
import { Entity, Property, Relation, EventSourceInstance, EntityInstance, RelationInstance } from '@core';
import { assert } from '@runtime';
import type { Controller } from '@runtime';
import { ActivityCall } from './ActivityCall.js';
import { ActivityStateError } from '../errors/ActivityErrors.js';

export { INTERACTION_RECORD };
export const ACTIVITY_RECORD = '_Activity_'

export const ActivityStateEntity = Entity.create({
    name: ACTIVITY_RECORD,
    properties: [
        Property.create({
            name: 'name',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'uuid',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'state',
            type: 'object',
            collection: false,
        }),
        // optimistic-lock version for `state`: bumped on every state advancement so a
        // concurrent read-modify-write can be detected instead of silently lost.
        Property.create({
            name: 'stateVersion',
            type: 'number',
            collection: false,
        })
    ]
})

export const ActivityInteractionRelation = Relation.create({
    name: 'activityInteraction',
    source: ActivityStateEntity,
    sourceProperty: 'interaction',
    target: InteractionEventEntity,
    targetProperty: 'activity',
    type: '1:n',
})

export interface ActivityManagerOutput {
    eventSources: EventSourceInstance<any, any>[]
    entities: EntityInstance[]
    relations: RelationInstance[]
}

export class ActivityManager {
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()

    private activityEventSources: EventSourceInstance<any, any>[] = []
    private requiredEntities: EntityInstance[] = []
    private requiredRelations: RelationInstance[] = []

    constructor(
        activities: ActivityInstance[],
    ) {
        if (activities.length > 0) {
            this.requiredEntities.push(ActivityStateEntity, InteractionEventEntity)
            this.requiredRelations.push(ActivityInteractionRelation)
        }

        activities.forEach(activity => {
            const activityCall = new ActivityCall(activity)
            this.activityCalls.set(activity.uuid, activityCall)
            if (activity.name) {
                assert(!this.activityCallsByName.has(activity.name), `activity name ${activity.name} is duplicated`)
                this.activityCallsByName.set(activity.name, activityCall)
            }
        })

        for (const activity of activities) {
            const activityCall = this.activityCallsByName.get(activity.name)!
            const allInteractions = this.collectAllInteractions(activity)
            for (const interaction of allInteractions) {
                const scopedName = this.getActivityInteractionEventSourceName(activity.name, interaction.name)

                const wrappedEventSource = this.buildActivityInteractionEventSource(
                    scopedName, interaction, activityCall
                )
                this.activityEventSources.push(wrappedEventSource)
            }
        }
    }

    private buildActivityInteractionEventSource(
        scopedName: string,
        interaction: InteractionInstance,
        activityCall: ActivityCall
    ): EventSourceInstance<InteractionEventArgs> {
        const isHeadInteraction = activityCall.isActivityHead(interaction)

        // Phase A (admit): conditions / payload only — no Activity create/check/complete.
        const admit = async function(this: Controller, args: InteractionEventArgs) {
            await activityCall.fullGuard(this, interaction, args)
        }

        // Phase L-open: Activity bookkeeping only (create head or check step availability).
        // Skipped on idempotent replay so completed steps do not throw ActivityStateError.
        const open = async function(this: Controller, args: InteractionEventArgs) {
            if (isHeadInteraction && !args.activityId) {
                const created = await activityCall.create(this)
                args.activityId = created.activityId
            } else if (isHeadInteraction && args.activityId) {
                // Head with activityId (e.g. second branch head in every/race): check state only.
                // Admission already ran; Condition cannot leak ActivityStateError.currentState.
                await activityCall.checkActivityState(this, args.activityId, interaction.uuid)
            } else {
                if (!args.activityId) {
                    throw new ActivityStateError('activityId must be provided for non-head interaction of an activity', { activityName: activityCall.activity.name })
                }
                await activityCall.checkActivityState(this, args.activityId, interaction.uuid)
            }
        }

        // I7: Activity wrappers must always expose both phases (fail-fast if stripped).
        if (typeof admit !== 'function' || typeof open !== 'function') {
            throw new Error(
                `ActivityManager failed to install admit/open for "${scopedName}". ` +
                `Activity-wrapped event sources must split fullGuard (admit) from create/check (open).`
            )
        }

        const wrappedMapEventData = async (args: InteractionEventArgs): Promise<Record<string, unknown>> => {
            const baseData = interaction.mapEventData
                ? await interaction.mapEventData(args)
                : {}
            if (args.activityId) {
                baseData.activity = { id: args.activityId }
            }
            return baseData
        }

        const wrappedAfterDispatch = async function(this: Controller, args: InteractionEventArgs, result: { data?: unknown }) {
            const activityId = args.activityId!

            await activityCall.completeInteractionState(this, activityId, interaction.uuid)

            const interactionResult = interaction.afterDispatch
                ? await interaction.afterDispatch.call(this, args, result)
                : undefined

            return {
                ...(interactionResult || {}),
                activityId,
                nextState: (await activityCall.getState(this, activityId))
            }
        }

        return {
            uuid: `${activityCall.activity.uuid}_${interaction.uuid}`,
            _type: 'EventSource',
            name: scopedName,
            entity: interaction.entity,
            admit,
            open,
            // Same reference as admit — no synthetic wrappedGuard dual-track.
            guard: admit,
            mapEventData: wrappedMapEventData,
            resolve: interaction.resolve,
            afterDispatch: wrappedAfterDispatch,
            postCommit: interaction.postCommit,
            // Must forward interaction.idempotency (default scope remains eventSource name).
            idempotency: interaction.idempotency,
            idempotencyInteractionKey: interaction.idempotencyInteractionKey ?? interaction.uuid,
        } as EventSourceInstance<InteractionEventArgs>
    }

    private collectAllInteractions(activity: ActivityInstance): InteractionInstance[] {
        const interactions: InteractionInstance[] = [...activity.interactions]
        for (const group of activity.groups || []) {
            for (const subActivity of group.activities || []) {
                interactions.push(...this.collectAllInteractions(subActivity))
            }
        }
        return interactions
    }

    getOutput(): ActivityManagerOutput {
        return {
            eventSources: this.activityEventSources,
            entities: this.requiredEntities,
            relations: this.requiredRelations,
        }
    }

    getActivityInteractionEventSourceName(activityName: string, interactionName: string): string {
        return `${activityName}:${interactionName}`
    }

    getActivityCall(activityId: string): ActivityCall | undefined {
        return this.activityCalls.get(activityId)
    }

    getActivityCallByName(activityName: string): ActivityCall | undefined {
        return this.activityCallsByName.get(activityName)
    }
}
