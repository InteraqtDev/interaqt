import {RecordMutationEvent, System, SystemCallback, SystemLogger} from "./System.js";
import {
    Activity,
    BoolExp,
    ComputedData,
    Entity,
    Interaction,
    Klass,
    KlassInstance,
    Property,
    Relation
} from "@interaqt/shared";
import './computedDataHandles/index.js'
import {ActivityCall} from "./ActivityCall.js";
import {InteractionCall, InteractionCallResponse} from "./InteractionCall.js";
import {InteractionEventArgs} from "./types/interaction.js";
import {assert} from "./util.js";
import {ComputedDataHandle, DataContext} from "./computedDataHandles/ComputedDataHandle.js";
import {asyncInteractionContext} from "./asyncInteractionContext.js";

export const USER_ENTITY = 'User'

// Define RecordMutationSideEffect since it's not exported from shared
export interface RecordMutationSideEffect {
    name: string;
    record: { name: string };
    content: (event: RecordMutationEvent) => Promise<any>;
}

// Create a class to use as a type and value
export class RecordMutationSideEffectClass implements RecordMutationSideEffect {
    name: string;
    record: { name: string };
    content: (event: RecordMutationEvent) => Promise<any>;

    constructor(data: RecordMutationSideEffect) {
        this.name = data.name;
        this.record = data.record;
        this.content = data.content;
    }

    static create(data: RecordMutationSideEffect): RecordMutationSideEffectClass {
        return new RecordMutationSideEffectClass(data);
    }
}

export type InteractionContext = {
    logContext?: any
    [k: string]: any
}

export class Controller {
    public computedDataHandles = new Set<ComputedDataHandle>()
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    // 因为很多 function 都会bind controller 作为 this，所以我们也把 controller 的 globals 作为注入全局工具的入口。
    public recordNameToSideEffects = new Map<string, Set<KlassInstance<any> | RecordMutationSideEffectClass>>()
    public globals = {
        BoolExp
    }
    constructor(
        public system: System,
        public entities: KlassInstance<typeof Entity>[],
        public relations: KlassInstance<typeof Relation>[],
        public activities: KlassInstance<typeof Activity>[],
        public interactions: KlassInstance<typeof Interaction>[],
        public states: KlassInstance<typeof Property>[] = [],
        public recordMutationSideEffects: RecordMutationSideEffectClass[] = []
    ) {
        // CAUTION 因为 public 里面的会在 constructor 后面才初始化，所以ActivityCall 里面读不到 this.system
        this.system = system
        activities.forEach(activity => {
            const activityCall = new ActivityCall(activity, this)
            this.activityCalls.set(activity.uuid, activityCall)
            if (activity.name) {
                assert(!this.activityCallsByName.has(activity.name), `activity name ${activity.name} is duplicated`)
                this.activityCallsByName.set(activity.name, activityCall)
            }
        })

        interactions.forEach(interaction => {
            const interactionCall = new InteractionCall(interaction, this)
            this.interactionCalls.set(interaction.uuid, interactionCall)
            if (interaction.name) {
                assert(!this.interactionCallsByName.has(interaction.name), `interaction name ${interaction.name} is duplicated`)
                this.interactionCallsByName.set(interaction.name, interactionCall)
            }
        })

        // 初始化 各种 computed。
        // entity 的
        entities.forEach(entity => {
            if (entity.computedData) {
                this.addComputedDataHandle(entity.computedData as KlassInstance<typeof ComputedData>, undefined, entity)
            }

            // property 的
            entity.properties?.forEach(property => {
                if (property.computedData) {
                    this.addComputedDataHandle(property.computedData as KlassInstance<typeof ComputedData>, entity, property)
                }
            })
        })

        // relation 的
        relations.forEach(relation => {
            const relationAny = relation as any;
            if(relationAny.computedData) {
                this.addComputedDataHandle(relationAny.computedData as KlassInstance<typeof ComputedData>, undefined, relation)
            }

            if (relationAny.properties) {
                relationAny.properties.forEach((property: any) => {
                    if (property.computedData) {
                        this.addComputedDataHandle(property.computedData as KlassInstance<typeof ComputedData>, relation, property)
                    }
                })
            }
        })

        states.forEach(state => {
            if (state.computedData) {
                this.addComputedDataHandle(state.computedData as KlassInstance<typeof ComputedData>, undefined, state.name as string)
            }
        })

        recordMutationSideEffects.forEach(sideEffect => {
          let sideEffects = this.recordNameToSideEffects.get(sideEffect.record.name)
          if (!sideEffects) {
              this.recordNameToSideEffects.set(sideEffect.record.name, sideEffects = new Set())
          }
          sideEffects.add(sideEffect)
        })

    }
    addComputedDataHandle(computedData: KlassInstance<any>, host:DataContext["host"], id: DataContext["id"]) {
        const dataContext: DataContext = {
            host,
            id
        }
        const handles = ComputedDataHandle.Handles
        const Handle = handles.get(computedData.constructor as Klass<any>)!
        assert(!!Handle, `cannot find handle for ${computedData.constructor.name}`)

        this.computedDataHandles.add(
            new Handle(this, computedData, dataContext)
        )
    }
    async setup(install?: boolean) {
        // 1. setup 数据库
        for(const handle of this.computedDataHandles) {
            handle.parseComputedData()
        }
        // CAUTION 注意这里的 entities/relations 可能被 IncrementalComputationHandle 修改过了
        await this.system.setup(this.entities, this.relations, install)

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

    async callInteraction(interactionId:string, interactionEventArgs: InteractionEventArgs) {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.system.logger.child(context?.logContext || {})

        const interactionCall = this.interactionCalls.get(interactionId)!
        assert(!!interactionCall,`cannot find interaction for ${interactionId}`)


        logger.info({label: "interaction", message:interactionCall.interaction.name})
        await this.system.storage.beginTransaction(interactionCall.interaction.name)
        // CAUTION 虽然这这里就有开始有 _EVENT_ 的change event，但是我们现在并不允许在 computedData 里面监听这个。所以这个不算。
        //  未来是否需要统一，还要再看。目前迁好像极少情况下会有这种需求，但现在还是能通过 MapInteraction 来模拟。
        const result = await interactionCall.call(interactionEventArgs)
        if (result.error) {
            logger.error({label: "interaction", message:interactionCall.interaction.name})
            await this.system.storage.rollbackTransaction(interactionCall.interaction.name)
        } else {
            await this.system.storage.commitTransaction(interactionCall.interaction.name)
            await this.runRecordChangeSideEffects(result, logger)
        }

        return result
    }
    async runRecordChangeSideEffects(result: InteractionCallResponse, logger: SystemLogger) {
        const mutationEvents = result.effects as RecordMutationEvent[]
        for(let event of mutationEvents || []) {
            const sideEffects = this.recordNameToSideEffects.get(event.recordName)
            if (sideEffects) {
                for(let sideEffect of sideEffects) {
                    try {
                        if (sideEffect instanceof RecordMutationSideEffectClass) {
                            result.sideEffects![sideEffect.name] = {
                                result: await sideEffect.content(event),
                            }
                        } else {
                            // Handle KlassInstance case if needed
                            const sideEffectAny = sideEffect as any;
                            result.sideEffects![sideEffectAny.name] = {
                                result: await sideEffectAny.content(event),
                            }
                        }
                    } catch (e){
                        const effectName = sideEffect instanceof RecordMutationSideEffectClass ? 
                            sideEffect.name : (sideEffect as any).name;
                        logger.error({label: "recordMutationSideEffect", message: effectName})
                        result.sideEffects![effectName] = {
                            error: e
                        }
                    }
                }
            }
        }
    }
    async callActivityInteraction(activityCallId:string, interactionCallId:string, activityId: string|undefined, interactionEventArgs: InteractionEventArgs) {
        const context= asyncInteractionContext.getStore() as InteractionContext
        const logger = this.system.logger.child(context?.logContext || {})

        const activityCall = this.activityCalls.get(activityCallId)!
        assert(!!activityCall,`cannot find interaction for ${activityCallId}`)
        const interactionCall = activityCall.uuidToInteractionCall.get(interactionCallId)
        assert(!!interactionCall,`cannot find interaction for ${interactionCallId}`)

        const interactionNameWithActivityName = `${activityCall.activity.name}:${interactionCall!.interaction.name}`
        logger.info({label: "activity", message:`${activityCall.activity.name}:${interactionCall!.interaction.name}`})

        await this.system.storage.beginTransaction(interactionNameWithActivityName)

        const result = await activityCall.callInteraction(activityId, interactionCallId, interactionEventArgs)
        if (result.error) {
            logger.error({label: "activity", message:interactionNameWithActivityName})
            await this.system.storage.rollbackTransaction(interactionNameWithActivityName)

        } else {
            await this.system.storage.commitTransaction(interactionNameWithActivityName)
            await this.runRecordChangeSideEffects(result, logger)
        }

        return result
    }

    // Add addEventListener method to Controller class
    addEventListener(eventName: string, callback: (...args: any[]) => any) {
        // Implementation of addEventListener
        if (!this.callbacks.has(eventName)) {
            this.callbacks.set(eventName, new Set());
        }
        this.callbacks.get(eventName)!.add(callback);
    }
}

