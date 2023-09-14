import {System, SystemCallback} from "./System";
import {Entity, Relation} from "../shared/entity/Entity";
import {Activity, Interaction} from "../shared/activity/Activity";
import {IncrementalComputationHandle} from "./IncrementalComputationHandle";
import {ActivityCall} from "./AcitivityCall";
import {InteractionCall} from "./InteractionCall";
import {InteractionEventArgs} from "../types/interaction";

export class Controller {
    public incrementalComputationHandles = new Set<IncrementalComputationHandle>()
    public activityCalls = new Map<string, ActivityCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    constructor(public system: System, public entities: (typeof Entity)[], public relations: (typeof Relation)[], public activities: (typeof Activity)[], public interactions: (typeof Interaction)[]) {
        // 初始化 各种 computed。
        system.storage.setup(entities, relations)

        entities.forEach(entity => {
            // TODO IncrementalComputed Handle 如何和他的数据定义关联起来
        })

        relations.forEach(entity => {
            // TODO IncrementalComputed Handle 如何和他的数据定义关联起来
            // this.incrementalComputationHandles.add(new IncrementalComputationHandle(this, entity))
        })

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
    dispatch(event: any, ...args: any[]) {
        const callbacks = this.callbacks.get(event)
        if (callbacks) {
            callbacks.forEach(callback => callback(...args))
        }
    }
    callInteraction(interactionId:string, interactionEventArgs: InteractionEventArgs) {
        const interactionCall = this.interactionCalls.get(interactionId)!
        const result = interactionCall.call(interactionEventArgs)
        if (!result.error) {
            this.dispatch(interactionCall.interaction, interactionEventArgs)
        }

        return result
    }
    callActivityInteraction(activityCallId:string, interactionCallId:string, activityId: string, interactionEventArgs: InteractionEventArgs) {
        const activityCall = this.activityCalls.get(activityCallId)!
        const result = activityCall.callInteraction(activityId, interactionCallId, interactionEventArgs)

        if (!result.error) {
            this.dispatch(activityCall.uuidToInteractionCall.get(interactionCallId)!.interaction, interactionEventArgs)
        }

        return result
    }
}

