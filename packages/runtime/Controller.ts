import {System, SystemCallback} from "./System";
import {Entity, Relation} from "../shared/entity/Entity";
import {Activity, Interaction} from "../shared/activity/Activity";
import {
    EntityIncrementalComputationHandle,
    IncrementalComputationHandle,
    RelationIncrementalComputationHandle
} from "./incrementalComputationHandles/IncrementalComputationHandle";
import {ActivityCall} from "./AcitivityCall";
import {InteractionCall} from "./InteractionCall";
import {InteractionEventArgs} from "../types/interaction";
import {KlassInstanceOf, KlassType} from "../shared/createClass";
import {assert} from "./util";

export class Controller {
    public incrementalComputationHandles = new Set<IncrementalComputationHandle>()
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    constructor(
        public system: System,
        public entities: KlassInstanceOf<typeof Entity, false>[],
        public relations: KlassInstanceOf<typeof Relation, false>[],
        public activities: KlassInstanceOf<typeof Activity, false>[],
        public interactions: KlassInstanceOf<typeof Interaction, false>[])
    {
        activities.forEach(activity => {
            const activityCall = new ActivityCall(activity, system)
            this.activityCalls.set(activity.uuid, activityCall)
            if (activity.name) {
                this.activityCallsByName.set(activity.name, activityCall)
            }
        })

        interactions.forEach(interaction => {
            const interactionCall = new InteractionCall(interaction, system)
            this.interactionCalls.set(interaction.uuid, interactionCall)
            if (interaction.name) {
                this.interactionCallsByName.set(interaction.name, interactionCall)
            }
        })


        // 初始化 各种 computed。
        entities.forEach(entity => {
            if (entity.computedData) {
                const Handle = EntityIncrementalComputationHandle.Handles.get(entity.computedData.constructor as KlassType<any>)
                this.incrementalComputationHandles.add(
                    new Handle(this, entity)
                )
            }
        })


        relations.forEach(relation => {
            if(relation.computedData) {
                const Handle = RelationIncrementalComputationHandle.Handles.get(relation.computedData.constructor as KlassType<any>)
                this.incrementalComputationHandles.add(new Handle(this, relation))
            }
        })

    }
    async setup() {
        // CAUTION 注意这里的 entities/relations 可能被 IncrementalComputationHandle 修改过了
        await this.system.storage.setup(this.entities, this.relations)
        // TODO 如果是恢复模式，应该从 event stack 中开始恢复数据。
    }
    callbacks: Map<any, Set<SystemCallback>> = new Map()
    listen(event:any, callback: SystemCallback) {
        let callbacks = this.callbacks.get(event)
        if (!callbacks) {
            this.callbacks.set(event, (callbacks = new Set()))
        }

        callbacks.add(callback)
        return () => {
            callbacks.delete(callback)
        }
    }

    async dispatch(event: any, ...args: any[]) {
        const callbacks = this.callbacks.get(event)

        if (callbacks) {
            for(const callback of callbacks) {
                await callback(...args, event)
            }
        }
    }
    async callInteraction(interactionId:string, interactionEventArgs: InteractionEventArgs) {
        const interactionCall = this.interactionCalls.get(interactionId)!
        assert(!!interactionCall,`cannot find interaction for ${interactionId}`)
        const result = await interactionCall.call(interactionEventArgs)
        if (!result.error) {
            await this.dispatch(interactionCall.interaction, interactionEventArgs)
        } else {
            console.error(result.error)
        }

        return result
    }
    async callActivityInteraction(activityCallId:string, interactionCallId:string, activityId: string, interactionEventArgs: InteractionEventArgs) {
        const activityCall = this.activityCalls.get(activityCallId)!
        const result = await activityCall.callInteraction(activityId, interactionCallId, interactionEventArgs)

        if (!result.error) {
            await this.dispatch(activityCall.uuidToInteractionCall.get(interactionCallId)!.interaction, interactionEventArgs, activityId)
        } else {
            console.error(result.error)
        }

        return result
    }
    createActivity(activityCallId:string) {
        const activityCall = this.activityCalls.get(activityCallId)!
        return activityCall.create()
    }
}

