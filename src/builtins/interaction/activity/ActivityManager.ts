import { ActivityInstance } from '../Activity.js';
import { InteractionEventEntity, InteractionInstance, INTERACTION_RECORD } from '../Interaction.js';
import { EventSourceInstance } from '../../../core/EventSource.js';
import { Entity, Property, Relation } from '@core';
import { RecordMutationEvent } from '../../../runtime/System.js';
import { Controller } from '../../../runtime/Controller.js';
import { ActivityCall } from './ActivityCall.js';
import { InteractionCall, InteractionCallResponse, InteractionEvent, InteractionEventArgs } from './InteractionCall.js';
import { assert } from '../../../runtime/util.js';
import { asyncInteractionContext } from '../../../runtime/asyncInteractionContext.js';
import { MatchExpressionData } from '@storage';
import {
    ActivityError,
    ActivityStateError
} from '../errors/ActivityErrors.js';
import {
    InteractionExecutionError
} from '../errors/InteractionErrors.js';

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


export class ActivityManager {
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()

    private activityEventSources: EventSourceInstance<any, any>[] = []

    constructor(
        private controller: Controller,
        activities: ActivityInstance[],
        interactions: InteractionInstance[]
    ) {
        if (activities.length > 0 || interactions.length > 0) {
            this.controller.entities.push(ActivityStateEntity, InteractionEventEntity)
            this.controller.relations.push(ActivityInteractionRelation)
        }

        activities.forEach(activity => {
            const activityCall = new ActivityCall(activity, controller)
            this.activityCalls.set(activity.uuid, activityCall)
            if (activity.name) {
                assert(!this.activityCallsByName.has(activity.name), `activity name ${activity.name} is duplicated`)
                this.activityCallsByName.set(activity.name, activityCall)
            }
        })

        interactions.forEach(interaction => {
            const interactionCall = new InteractionCall(interaction, controller)
            this.interactionCalls.set(interaction.uuid, interactionCall)
            if (interaction.name) {
                assert(!this.interactionCallsByName.has(interaction.name), `interaction name ${interaction.name} is duplicated`)
                this.interactionCallsByName.set(interaction.name, interactionCall)
            }
        })

        for (const activity of activities) {
            for (const interaction of activity.interactions) {
                const scopedName = this.getActivityInteractionEventSourceName(activity.name, interaction.name)

                const wrappedEventSource: EventSourceInstance<InteractionEventArgs> = {
                    uuid: `${activity.uuid}_${interaction.uuid}`,
                    _type: 'EventSource',
                    name: scopedName,
                    entity: interaction.entity,
                    guard: interaction.guard,
                    mapEventData: interaction.mapEventData,
                    resolve: interaction.resolve,
                    afterDispatch: interaction.afterDispatch,
                }
                this.activityEventSources.push(wrappedEventSource)
            }
        }
    }

    getActivityEventSources(): EventSourceInstance<any, any>[] {
        return this.activityEventSources
    }

    getActivityInteractionEventSourceName(activityName: string, interactionName: string): string {
        return `${activityName}:${interactionName}`
    }

    async callInteraction(interactionName: string, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse> {
        const interactionCall = this.interactionCallsByName.get(interactionName)
        if (!interactionCall) {
            throw new InteractionExecutionError(`Cannot find interaction for ${interactionName}`, {
                interactionName,
                userId: interactionEventArgs.user?.id,
                payload: interactionEventArgs.payload,
                executionPhase: 'interaction-lookup'
            })
        }

        await this.controller.system.storage.beginTransaction(interactionCall.interaction.name)
        let unknownError: any
        let result: InteractionCallResponse
        try {
            result = await interactionCall.call(interactionEventArgs)
        } catch(e) {
            unknownError = e
            result = {
                error: e,
                effects: [],
                sideEffects: {},
                data: undefined,
                event: undefined,
            }
        } finally {
            if (unknownError||result!.error) {
                await this.controller.system.storage.rollbackTransaction(interactionCall.interaction.name)
            } else {
                await this.controller.system.storage.commitTransaction(interactionCall.interaction.name)
            }
        }

        return result
    }

    async callActivityInteraction(activityName: string, interactionName: string, activityId: string | undefined, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse> {
        const activityCall = this.activityCallsByName.get(activityName)
        if (!activityCall) {
            throw new ActivityError(`Cannot find activity for ${activityName}`, {
                activityName,
                context: {
                    interactionName,
                    activityId,
                    userId: interactionEventArgs.user?.id
                }
            })
        }

        await this.controller.system.storage.beginTransaction(activityCall.activity.name)

        const interactionCall = activityCall.interactionCallByName.get(interactionName)
        if (!interactionCall) {
            await this.controller.system.storage.rollbackTransaction(activityCall.activity.name)
            throw new InteractionExecutionError(`Cannot find interaction ${interactionName} in activity ${activityName}`, {
                interactionName,
                userId: interactionEventArgs.user?.id,
                payload: interactionEventArgs.payload,
                executionPhase: 'activity-interaction-lookup',
                context: { activityName, activityId }
            })
        }

        const result = await activityCall.callInteraction(activityId, interactionCall.interaction.uuid, interactionEventArgs)
        if (result.error) {
            await this.controller.system.storage.rollbackTransaction(activityCall.activity.name)
        } else {
            await this.controller.system.storage.commitTransaction(activityCall.activity.name)
        }

        return result
    }

    async createActivity(activity: {
        name: string;
        uuid: string;
        state: unknown;
        refs: unknown;
        [key: string]: unknown;
    }) {
        return this.controller.system.storage.create(ACTIVITY_RECORD, {
            ...activity,
            state: activity.state,
            refs: activity.refs,
        })
    }
    async updateActivity(match: MatchExpressionData, activity: {
        name?: string;
        uuid?: string;
        state?: unknown;
        refs?: unknown;
        [key: string]: unknown;
    }) {
        const data = {
            ...activity
        }
        delete data.state
        delete data.refs
        if (activity.state) {
            data.state = activity.state
        }
        if (activity.refs) {
            data.refs = activity.refs
        }
        return this.controller.system.storage.update(ACTIVITY_RECORD, match, data)
    }
    async getActivity(query?: MatchExpressionData) {
        return (await this.controller.system.storage.find(ACTIVITY_RECORD, query, undefined, ['*'])).map((activity: any) => ({
            ...activity,
            state: activity.state,
            refs: activity.refs,
        }))
    }
    async saveEvent(event: InteractionEvent): Promise<unknown> {
        return this.controller.system.storage.create(INTERACTION_RECORD, event)
    }
    async getEvent(query?: MatchExpressionData ) {
        return (await this.controller.system.storage.find(INTERACTION_RECORD, query, undefined, ['*'])).map((event: any) => ({
            ...event,
        })) as unknown as InteractionEvent[]
    }
    getActivityCall(activityId: string): ActivityCall | undefined {
        return this.activityCalls.get(activityId)
    }

    getActivityCallByName(activityName: string): ActivityCall | undefined {
        return this.activityCallsByName.get(activityName)
    }

    getInteractionCall(interactionId: string): InteractionCall | undefined {
        return this.interactionCalls.get(interactionId)
    }

    getInteractionCallByName(interactionName: string): InteractionCall | undefined {
        return this.interactionCallsByName.get(interactionName)
    }
}
