import { RecordMutationEvent, System, SystemCallback, SystemLogger } from "./System.js";
import {
    Activity,
    BoolExp, Entity,
    Interaction, KlassInstance,
    Property,
    Relation
} from "@shared";
import './computedDataHandles/index.js';
import { InteractionCallResponse } from "./InteractionCall.js";
import { InteractionEventArgs } from "./InteractionCall.js";
import { DataContext, EntityDataContext, PropertyDataContext, RelationDataContext } from "./computedDataHandles/ComputedDataHandle.js";
import { ComputationResult, ComputationResultSkip, ComputationResultPatch } from "./computedDataHandles/Computation.js";
import { Scheduler } from "./Scheduler.js";
import { MatchExp } from "@storage";
import { ActivityManager } from "./ActivityManager.js";

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
    // 因为很多 function 都会bind controller 作为 this，所以我们也把 controller 的 globals 作为注入全局工具的入口。
    public recordNameToSideEffects = new Map<string, Set<KlassInstance<any> | RecordMutationSideEffect>>()
    public globals = {
        BoolExp
    }
    public scheduler: Scheduler
    public activityManager: ActivityManager
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

        // Initialize ActivityManager
        this.activityManager = new ActivityManager(this, activities, interactions)

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
        if (result instanceof ComputationResultSkip) return

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
            if (!record) debugger
            if (record[propertyDataContext.id]) return record[propertyDataContext.id]

            const item = await this.system.storage.findOne(propertyDataContext.host.name, BoolExp.atom({key: 'id', value: ['=', record!.id]}), undefined, ['*'])
            return item[propertyDataContext.id]
        }
    }
    async applyResultPatch(dataContext: DataContext, patch: ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined, record?: any) {
        if (patch instanceof ComputationResultSkip||patch === undefined) return

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
        return this.activityManager.callInteraction(interactionId, interactionEventArgs)
    }
    async callActivityInteraction(activityCallId:string, interactionCallId:string, activityId: string|undefined, interactionEventArgs: InteractionEventArgs) {
        return this.activityManager.callActivityInteraction(activityCallId, interactionCallId, activityId, interactionEventArgs)
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
    

    // Add addEventListener method to Controller class
    addEventListener(eventName: string, callback: (...args: any[]) => any) {
        // Implementation of addEventListener
        if (!this.callbacks.has(eventName)) {
            this.callbacks.set(eventName, new Set());
        }
        this.callbacks.get(eventName)!.add(callback);
    }
}

