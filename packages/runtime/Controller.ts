import {System, SystemCallback} from "./System";
import {Entity, Relation, Property} from "../shared/entity/Entity";
import {Activity, Interaction} from "../shared/activity/Activity";
import './computedDataHandles/index'
import {ActivityCall} from "./AcitivityCall";
import {InteractionCall} from "./InteractionCall";
import {InteractionEventArgs} from "../types/interaction";
import {KlassInstanceOf, KlassType} from "../shared/createClass";
import {assert} from "./util";
import {ComputedDataHandle, DataContext} from "./computedDataHandles/ComputedDataHandle";

export class Controller {
    public computedDataHandles = new Set<ComputedDataHandle>()
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    constructor(
        public system: System,
        public entities: KlassInstanceOf<typeof Entity, false>[],
        public relations: KlassInstanceOf<typeof Relation, false>[],
        public activities: KlassInstanceOf<typeof Activity, false>[],
        public interactions: KlassInstanceOf<typeof Interaction, false>[],
        public states: KlassInstanceOf<typeof Property, false>[] = [])
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
                const dataContext: DataContext = {
                    id: entity
                }
                const Handle = ComputedDataHandle.Handles.get(entity.computedData.constructor as KlassType<any>)!
                this.computedDataHandles.add(
                    new Handle(this, entity.computedData, dataContext)
                )
            }

            // property 的
            entity.properties?.forEach(property => {
                if (property.computedData) {
                    const dataContext: DataContext = {
                        host: entity,
                        id: property
                    }
                    const Handle = ComputedDataHandle.Handles.get(property.computedData.constructor as KlassType<any>)!
                    this.computedDataHandles.add(
                        new Handle(this, property.computedData, dataContext)
                    )

                }
            })
        })

        // relation 的
        relations.forEach(relation => {
            if(relation.computedData) {
                const dataContext: DataContext = {
                    id: relation
                }
                const Handle = ComputedDataHandle.Handles.get(relation.computedData.constructor as KlassType<any>)!
                assert(!!Handle, `cannot find handle for ${relation.computedData.constructor.name}`)

                this.computedDataHandles.add(new Handle(this, relation.computedData, dataContext))
            }

            relation.properties?.forEach(property => {
                if (property.computedData) {
                    const dataContext: DataContext = {
                        host: relation,
                        id: property
                    }
                    const Handle = ComputedDataHandle.Handles.get(property.computedData.constructor as KlassType<any>)!
                    assert(!!Handle, `cannot find handle for ${property.computedData.constructor.name}`)

                    this.computedDataHandles.add(
                        new Handle(this, property.computedData, dataContext)
                    )
                }
            })
        })

        // 全局的
        states.forEach(state => {
            if (state.computedData) {
                const dataContext: DataContext = {
                    id: state.name!
                }
                const Handle = ComputedDataHandle.Handles.get(state.computedData.constructor as KlassType<any>)!
                assert(!!Handle, `cannot find handle for ${state.computedData.constructor.name}`)
                this.computedDataHandles.add(
                    new Handle(this, state.computedData, dataContext)
                )
            }
        })
    }
    async setup() {
        // 1. setup 数据库
        for(const handle of this.computedDataHandles) {
            handle.setupSchema()
        }
        // CAUTION 注意这里的 entities/relations 可能被 IncrementalComputationHandle 修改过了
        await this.system.storage.setup(this.entities, this.relations)

        // 2. 增量计算的字段设置初始值
        for(const handle of this.computedDataHandles) {
            handle.parseComputedData()
            handle.addEventListener()
            await handle.setupInitialValue()
        }

        for(const handle of this.computedDataHandles) {
            await handle.setupStates()
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

