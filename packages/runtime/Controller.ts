import {System, SystemCallback} from "./System";
import {Entity, Property, Relation} from "@interaqt/shared";
import {Activity, Interaction} from "@interaqt/shared";
import './computedDataHandles/index'
import {ActivityCall} from "./ActivityCall";
import {InteractionCall} from "./InteractionCall";
import {InteractionEventArgs} from "./types/interaction";
import {Klass, KlassInstance} from "@interaqt/shared";
import {assert} from "./util";
import {ComputedDataHandle, DataContext} from "./computedDataHandles/ComputedDataHandle";
import {ComputedData} from "@interaqt/shared";

export class Controller {
    public computedDataHandles = new Set<ComputedDataHandle>()
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    constructor(
        public system: System,
        public entities: KlassInstance<typeof Entity, false>[],
        public relations: KlassInstance<typeof Relation, false>[],
        public activities: KlassInstance<typeof Activity, false>[],
        public interactions: KlassInstance<typeof Interaction, false>[],
        public states: KlassInstance<typeof Property, false>[] = [])
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
        // entity 的
        entities.forEach(entity => {
            if (entity.computedData) {
                this.addComputedDataHandle(entity.computedData as KlassInstance<typeof ComputedData, false>, undefined, entity)
            }

            // property 的
            entity.properties?.forEach(property => {
                if (property.computedData) {
                    this.addComputedDataHandle(property.computedData as KlassInstance<typeof ComputedData, false>, entity, property)
                }
            })
        })

        // relation 的
        relations.forEach(relation => {
            if(relation.computedData) {
                this.addComputedDataHandle(relation.computedData as KlassInstance<typeof ComputedData, false>, undefined, relation)
            }

            relation.properties?.forEach(property => {
                if (property.computedData) {
                    this.addComputedDataHandle(property.computedData as KlassInstance<typeof ComputedData, false>, relation, property)
                }
            })
        })

        // 全局的
        states.forEach(state => {
            if (state.computedData) {
                this.addComputedDataHandle(state.computedData as KlassInstance<typeof ComputedData, false>, undefined, state.name as string)
            }
        })
    }
    addComputedDataHandle(computedData: KlassInstance<any, false>, host:DataContext["host"], id: DataContext["id"]) {
        const dataContext: DataContext = {
            host,
            id
        }
        const Handle = ComputedDataHandle.Handles.get(computedData.constructor as Klass<any>)!
        assert(!!Handle, `cannot find handle for ${computedData.constructor.name}`)

        this.computedDataHandles.add(
            new Handle(this, computedData, dataContext)
        )
    }
    async setup() {
        // 1. setup 数据库
        for(const handle of this.computedDataHandles) {
            handle.parseComputedData()
        }
        // CAUTION 注意这里的 entities/relations 可能被 IncrementalComputationHandle 修改过了
        await this.system.setup(this.entities, this.relations)

        // 2. 增量计算的字段设置初始值
        for(const handle of this.computedDataHandles) {
            await handle.setupInitialValue()
        }

        for(const handle of this.computedDataHandles) {
            await handle.setupStates()
            handle.addEventListener()
        }
        // TODO 如果是恢复模式，还要从 event stack 中开始恢复数据。
    }
    callbacks: Map<any, Set<SystemCallback>> = new Map()
    listen(event:any, callback: SystemCallback) {
        let callbacks = this.callbacks.get(event)!
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
            await this.dispatch(interactionCall.interaction, result.event!.args)
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

