import { ActivityInstance } from '../Activity.js';
import { InteractionEventEntity, InteractionInstance, InteractionEventArgs, INTERACTION_RECORD } from '../Interaction.js';
import { Entity, Property, Relation, EventSourceInstance, EntityInstance, RelationInstance } from '@core';
import { assert } from '@runtime';
import { ActivityCall } from './ActivityCall.js';

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
        Property.create({
            name: 'refs',
            type: 'object',
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

        const wrappedGuard = async function(this: any, args: InteractionEventArgs) {
            if (isHeadInteraction && !args.activityId) {
                if (interaction.guard) {
                    await interaction.guard.call(this, args)
                }
                const created = await activityCall.create(this)
                args.activityId = created.activityId
            } else if (isHeadInteraction && args.activityId) {
                await activityCall.checkActivityState(this, args.activityId, interaction.uuid)
                if (interaction.guard) {
                    await interaction.guard.call(this, args)
                }
            } else {
                if (!args.activityId) {
                    throw new Error('activityId must be provided for non-head interaction of an activity')
                }
                await activityCall.checkActivityState(this, args.activityId, interaction.uuid)
                await activityCall.fullGuardWithUserRef(this, interaction, args)
            }
        }

        const wrappedMapEventData = (args: InteractionEventArgs): Record<string, any> => {
            const baseData = interaction.mapEventData
                ? interaction.mapEventData(args)
                : {}
            if (args.activityId) {
                baseData.activity = { id: args.activityId }
            }
            return baseData
        }

        const wrappedAfterDispatch = async function(this: any, args: InteractionEventArgs, result: { data?: any }) {
            const activityId = args.activityId!

            await activityCall.saveUserRefs(this, activityId, interaction, args)
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
            guard: wrappedGuard,
            mapEventData: wrappedMapEventData,
            resolve: interaction.resolve,
            afterDispatch: wrappedAfterDispatch,
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
