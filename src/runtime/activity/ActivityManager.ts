import { ActivityInstance, InteractionInstance, IInstance } from "@shared";
import { RecordMutationEvent, SystemLogger } from "../System.js";
import {
    Entity, Property,
    Relation
} from "@shared";
import { ActivityCall } from "./ActivityCall.js";
import { InteractionCall, InteractionCallResponse, InteractionEvent } from "./InteractionCall.js";
import { InteractionEventArgs } from "./InteractionCall.js";
import { assert } from "../util.js";
import { asyncInteractionContext } from "../asyncInteractionContext.js";
import { Controller, InteractionContext, RecordMutationSideEffect } from "../Controller.js";
import { MatchExpressionData } from "../../storage/index.js";
import {
    ActivityError,
    ActivityStateError,
    InteractionExecutionError,
    ErrorUtils
} from "../errors/index.js";


export const INTERACTION_RECORD = '_Interaction_'
export const ACTIVITY_RECORD = '_Activity_'

// event 的实体化
export const InteractionEventEntity = Entity.create({
    name: INTERACTION_RECORD,
    properties: [
        Property.create({
            name: 'interactionId',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'interactionName',
            type: 'string',
            collection: false,
        }),
        Property.create({
            name: 'payload',
            type: 'object',
            collection: false,
        }),
        Property.create({
            name: 'user',
            type: 'object',
            collection: false,
        }),
        Property.create({
            name: 'query',
            type: 'object',
            collection: false,
        }),
    ]
})


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

    constructor(
        private controller: Controller,
        activities: ActivityInstance[],
        interactions: InteractionInstance[]
    ) {

        this.controller.entities.push(ActivityStateEntity, InteractionEventEntity)
        this.controller.relations.push(ActivityInteractionRelation)

        // Initialize activity calls
        activities.forEach(activity => {
            const activityCall = new ActivityCall(activity, controller)
            this.activityCalls.set(activity.uuid, activityCall)
            if (activity.name) {
                assert(!this.activityCallsByName.has(activity.name), `activity name ${activity.name} is duplicated`)
                this.activityCallsByName.set(activity.name, activityCall)
            }
        })

        // Initialize interaction calls
        interactions.forEach(interaction => {
            const interactionCall = new InteractionCall(interaction, controller)
            this.interactionCalls.set(interaction.uuid, interactionCall)
            if (interaction.name) {
                assert(!this.interactionCallsByName.has(interaction.name), `interaction name ${interaction.name} is duplicated`)
                this.interactionCallsByName.set(interaction.name, interactionCall)
            }
        })
    }

    async callInteraction(interactionName: string, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse> {
        const context = asyncInteractionContext.getStore() as InteractionContext
        const logger = this.controller.system.logger.child(context?.logContext || {})

        try {
            const interactionCall = this.interactionCallsByName.get(interactionName)
            if (!interactionCall) {
                const error = new InteractionExecutionError(`Cannot find interaction for ${interactionName}`, {
                    interactionName,
                    userId: interactionEventArgs.user?.id,
                    payload: interactionEventArgs.payload,
                    executionPhase: 'interaction-lookup'
                })
                throw error
            }

            logger.info({label: "interaction", message: interactionCall.interaction.name})
            await this.controller.system.storage.beginTransaction(interactionCall.interaction.name)
            let unknownError: any
            let result: InteractionCallResponse
            try {
                result = await interactionCall.call(interactionEventArgs)
            } catch(e) {
                unknownError = e
                // Create structured error with context
                const contextualError = new InteractionExecutionError('Interaction execution failed', {
                    interactionName,
                    userId: interactionEventArgs.user?.id,
                    payload: interactionEventArgs.payload,
                    executionPhase: 'interaction-execution',
                    causedBy: e instanceof Error ? e : new Error(String(e))
                })
                
                result = {
                    error: contextualError,
                    effects: [],
                    sideEffects: {},
                    data: undefined,
                    event: undefined,
                }
            } finally {
                if (unknownError||result!.error) {
                    if (unknownError) {
                        console.error(unknownError)
                        logger.error({label: "systemError", message: 'unknownError', error: unknownError})
                    }
                    logger.error({label: "interaction", message: interactionCall.interaction.name, error: result!.error})
                    await this.controller.system.storage.rollbackTransaction(interactionCall.interaction.name)
                } else {
                    await this.controller.system.storage.commitTransaction(interactionCall.interaction.name)
                }
            }

            return result
        } catch (e) {
            // Top-level error handling for unexpected errors
            const error = new InteractionExecutionError('Unexpected error during interaction call', {
                interactionName,
                userId: interactionEventArgs.user?.id,
                payload: interactionEventArgs.payload,
                executionPhase: 'top-level',
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
    }

    async callActivityInteraction(activityName: string, interactionName: string, activityId: string | undefined, interactionEventArgs: InteractionEventArgs): Promise<InteractionCallResponse> {
        const context = asyncInteractionContext.getStore() as InteractionContext
        const logger = this.controller.system.logger.child(context?.logContext || {})

        try {
            const activityCall = this.activityCallsByName.get(activityName)
            if (!activityCall) {
                const error = new ActivityError(`Cannot find activity for ${activityName}`, {
                    activityName,
                    context: {
                        interactionName,
                        activityId,
                        userId: interactionEventArgs.user?.id
                    }
                })
                throw error
            }

            logger.info({label: "activity", message: activityCall.activity.name})
            await this.controller.system.storage.beginTransaction(activityCall.activity.name)
            
            // 获取 interaction UUID 通过名称
            const interactionCall = activityCall.interactionCallByName.get(interactionName)
            if (!interactionCall) {
                const error = new InteractionExecutionError(`Cannot find interaction ${interactionName} in activity ${activityName}`, {
                    interactionName,
                    userId: interactionEventArgs.user?.id,
                    payload: interactionEventArgs.payload,
                    executionPhase: 'activity-interaction-lookup',
                    context: { activityName, activityId }
                })
                await this.controller.system.storage.rollbackTransaction(activityCall.activity.name)
                throw error
            }
            
            const result = await activityCall.callInteraction(activityId, interactionCall.interaction.uuid, interactionEventArgs)
            if (result.error) {
                logger.error({label: "activity", message: activityCall.activity.name})
                await this.controller.system.storage.rollbackTransaction(activityCall.activity.name)
            } else {
                await this.controller.system.storage.commitTransaction(activityCall.activity.name)
            }

            return result
        } catch (e) {
            const error = new ActivityError('Unexpected error during activity interaction call', {
                activityName,
                context: {
                    interactionName,
                    activityId,
                    userId: interactionEventArgs.user?.id
                },
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
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
        return (await this.controller.system.storage.find(ACTIVITY_RECORD, query, undefined, ['*'])).map(activity => ({
            ...activity,
            state: activity.state,
            refs: activity.refs,
        }))
    }
    async saveEvent(event: InteractionEvent): Promise<unknown> {
        return this.controller.system.storage.create(INTERACTION_RECORD, event)
    }
    async getEvent(query?: MatchExpressionData ) {
        return (await this.controller.system.storage.find(INTERACTION_RECORD, query, undefined, ['*'])).map(event => ({
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