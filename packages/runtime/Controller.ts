import { RecordMutationEvent, System, SystemCallback, SystemLogger } from "./System.js";
import {
    Activity,
    BoolExp, Entity,
    Interaction, KlassInstance,
    Property,
    Relation
} from "@interaqt/shared";
import './computedDataHandles/index.js';
import { ActivityCall } from "./ActivityCall.js";
import { InteractionCall, InteractionCallResponse } from "./InteractionCall.js";
import { InteractionEventArgs } from "./types/interaction.js";
import { assert } from "./util.js";
import { DataContext, EntityDataContext, PropertyDataContext, RelationDataContext } from "./computedDataHandles/ComputedDataHandle.js";
import { asyncInteractionContext } from "./asyncInteractionContext.js";
import { ComputeResultPatch } from "./computedDataHandles/Computation.js";
import { Scheduler, SKIP_RESULT } from "./Scheduler.js";
import { MatchExp } from "@interaqt/storage";

export const USER_ENTITY = 'User'

// Define RecordMutationSideEffect since it's not exported from shared
export interface IRecordMutationSideEffect {
    name: string;
    record: { name: string };
    content: (event: RecordMutationEvent) => Promise<any>;
}

// Create a class to use as a type and value
export class RecordMutationSideEffect implements IRecordMutationSideEffect {
    name: string;
    record: { name: string };
    content: (event: RecordMutationEvent) => Promise<any>;

    constructor(data: IRecordMutationSideEffect) {
        this.name = data.name;
        this.record = data.record;
        this.content = data.content;
    }

    static create(data: IRecordMutationSideEffect): RecordMutationSideEffect {
        return new RecordMutationSideEffect(data);
    }
}

export type InteractionContext = {
    logContext?: any
    [k: string]: any
}

export type ComputedDataType = 'global' | 'entity' | 'relation' | 'property'

export class Controller {
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    // 因为很多 function 都会bind controller 作为 this，所以我们也把 controller 的 globals 作为注入全局工具的入口。
    public recordNameToSideEffects = new Map<string, Set<KlassInstance<any> | RecordMutationSideEffect>>()
    public globals = {
        BoolExp
    }
    public scheduler: Scheduler
    constructor(
        public system: System,
        public entities: KlassInstance<typeof Entity>[],
        public relations: KlassInstance<typeof Relation>[],
        public activities: KlassInstance<typeof Activity>[],
        public interactions: KlassInstance<typeof Interaction>[],
        public dict: KlassInstance<typeof Property>[] = [],
        public recordMutationSideEffects: RecordMutationSideEffect[] = []
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

        this.scheduler = new Scheduler(this, this.entities, this.relations, this.dict)

        recordMutationSideEffects.forEach(sideEffect => {
          let sideEffects = this.recordNameToSideEffects.get(sideEffect.record.name)
          if (!sideEffects) {
              this.recordNameToSideEffects.set(sideEffect.record.name, sideEffects = new Set())
          }
          sideEffects.add(sideEffect)
        })

    }
    
    async setup(install?: boolean) {
        const states = this.scheduler.createStates()
        await this.system.setup(this.entities, this.relations, states, install)
        await this.scheduler.setup()

        // TODO 如果是恢复模式，还要从 event stack 中开始恢复数据。
    }
    async applyResult(dataContext: DataContext, result: any, record?: any) {
        if (result ===SKIP_RESULT) return

        if (dataContext.type === 'global') {
            // TODO 
            return this.system.storage.set('state', dataContext.id! as string, result)
        } else if (dataContext.type === 'entity') {
            // TODO
        } else if (dataContext.type === 'relation') {
            // TODO
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            await this.system.storage.update(propertyDataContext.host.name, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id]: result})
        }   
    }
    async retrieveLastValue(dataContext: DataContext, record?: any) {
        if (dataContext.type === 'global') {
            return this.system.storage.get('state', dataContext.id! as string)
        } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
            
            return this.system.storage.find(dataContext.id.name, undefined, undefined, ['*'])
      
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (record[propertyDataContext.id]) return record[propertyDataContext.id]

            const item = await this.system.storage.findOne(propertyDataContext.host.name, BoolExp.atom({key: 'id', value: ['=', record!.id]}), undefined, ['*'])
            return item[propertyDataContext.id]
        }
    }
    async applyResultPatch(dataContext: DataContext, patch: typeof SKIP_RESULT|ComputeResultPatch|ComputeResultPatch[], record?: any) {
        if (patch === SKIP_RESULT) return

        const patches = Array.isArray(patch) ? patch : [patch]
        for(const patch of patches) {
                if (dataContext.type === 'global') {
                    // TODO
                    return this.system.storage.set('state', dataContext.id! as string, patch)
            } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
                const erDataContext = dataContext as EntityDataContext|RelationDataContext
                if (patch.type === 'insert') {  
                    await this.system.storage.create(erDataContext.id.name, patch.data)
                } else if (patch.type === 'update') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.update(erDataContext.id.name, match, patch.data)
                } else if (patch.type === 'delete') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.delete(erDataContext.id.name, match)
                }
            } else {
                const propertyDataContext = dataContext as PropertyDataContext
                if (patch.type === 'insert') {
                    await this.system.storage.update(propertyDataContext.host.name, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id]: patch.data})
                } else if (patch.type === 'update') {
                    await this.system.storage.update(propertyDataContext.host.name, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id]: patch.data})
                } else if (patch.type === 'delete') {
                    await this.system.storage.update(propertyDataContext.host.name, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id]: null})
                }
            }
        }
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
                        if (sideEffect instanceof RecordMutationSideEffect) {
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
                        const effectName = sideEffect instanceof RecordMutationSideEffect ?
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

