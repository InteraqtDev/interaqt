import { DICTIONARY_RECORD, RecordMutationEvent, System, SystemCallback, SystemLogger } from "./System.js";
import {
    Activity,
    BoolExp, Dictionary, Entity,
    Interaction, KlassInstance, Relation
} from "@shared";
import './computationHandles/index.js';
import { InteractionCallResponse } from "./InteractionCall.js";
import { InteractionEventArgs } from "./InteractionCall.js";
import { DataContext, EntityDataContext, PropertyDataContext, RelationDataContext } from "./computationHandles/ComputationHandle.js";
import { ComputationResult, ComputationResultSkip, ComputationResultPatch } from "./computationHandles/Computation.js";
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

export type ComputationType = 'global' | 'entity' | 'relation' | 'property'

export class Controller {
    // 因为很多 function 都会bind controller 作为 this，所以我们也把 controller 的 globals 作为注入全局工具的入口。
    public recordNameToSideEffects = new Map<string, Set<KlassInstance<any> | RecordMutationSideEffect>>()
    public globals = {
        BoolExp,
        MatchExp
    }
    public scheduler: Scheduler
    public activityManager: ActivityManager
    public entities: KlassInstance<typeof Entity>[]
    public relations: KlassInstance<typeof Relation>[]
    public activities: KlassInstance<typeof Activity>[]
    public interactions: KlassInstance<typeof Interaction>[]
    public dict: KlassInstance<typeof Dictionary>[] = []
    public recordMutationSideEffects: RecordMutationSideEffect[] = []
    constructor(
        public system: System,
        entities: KlassInstance<typeof Entity>[],
        relations: KlassInstance<typeof Relation>[],
        activities: KlassInstance<typeof Activity>[],
        interactions: KlassInstance<typeof Interaction>[],
        dict: KlassInstance<typeof Dictionary>[] = [],
        recordMutationSideEffects: RecordMutationSideEffect[] = []
    ) {
        // 因为我们会对 entities 数组进行补充。如果外部复用了传入的数组对象，就会发生混乱，例如在测试用例中复用。
        this.entities = [...entities]
        this.relations = [...relations]
        this.activities = [...activities]
        this.interactions = [...interactions]
        this.dict = [...dict]
        this.recordMutationSideEffects = [...recordMutationSideEffects]
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
            return this.system.storage.set(DICTIONARY_RECORD, dataContext.id! as string, result)
        } else if (dataContext.type === 'entity') {
            if (result === undefined || result === null) return
            // Entity 级别的计算结果完全替换实体表中的所有记录
            const entityContext = dataContext as EntityDataContext
            // 先删除所有记录
            await this.system.storage.delete(entityContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}))
            // 然后插入新记录，result 必须是数组
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(entityContext.id.name!, item)
            }
        } else if (dataContext.type === 'relation') {
            if (result === undefined || result === null) return
            // Relation 级别的计算结果完全替换关系表中的所有记录
            const relationContext = dataContext as RelationDataContext
            // 先删除所有记录
            await this.system.storage.delete(relationContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}))
            // 然后插入新记录，result 必须是数组
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(relationContext.id.name!, item)
            }
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id.name]: result})
        }   
    }
    async retrieveLastValue(dataContext: DataContext, record?: any) {
        if (dataContext.type === 'global') {
            return this.system.storage.get(DICTIONARY_RECORD, dataContext.id! as string)
        } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
            return this.system.storage.find(dataContext.id.name!, undefined, undefined, ['*'])
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (record[propertyDataContext.id.name]) return record[propertyDataContext.id.name]

            const item = await this.system.storage.findOne(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), undefined, ['*'])
            return item[propertyDataContext.id.name]
        }
    }
    async applyResultPatch(dataContext: DataContext, patch: ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined, record?: any) {
        if (patch instanceof ComputationResultSkip||patch === undefined) return

        const patches = Array.isArray(patch) ? patch : [patch]
        for(const patch of patches) {
                if (dataContext.type === 'global') {
                    return this.system.storage.set(DICTIONARY_RECORD, dataContext.id! as string, patch)
            } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
                const erDataContext = dataContext as EntityDataContext|RelationDataContext
                if (patch.type === 'insert') {  
                    await this.system.storage.create(erDataContext.id.name!, patch.data)
                } else if (patch.type === 'update') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.update(erDataContext.id.name!, match, patch.data)
                } else if (patch.type === 'delete') {
                    const match = MatchExp.atom({key: 'id', value: ['=', patch.affectedId]})
                    await this.system.storage.delete(erDataContext.id.name!, match)
                }
            } else {
                const propertyDataContext = dataContext as PropertyDataContext
                if (patch.type === 'insert') {
                    await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id.name]: patch.data})
                } else if (patch.type === 'update') {
                    await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id.name]: patch.data})
                } else if (patch.type === 'delete') {
                    await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id.name]: null})
                }
            }
        }
    }
    callbacks: Map<any, Set<SystemCallback>> = new Map()

    async callInteraction(interactionName:string, interactionEventArgs: InteractionEventArgs) {
        return this.activityManager.callInteraction(interactionName, interactionEventArgs)
    }
    async callActivityInteraction(activityName:string, interactionName:string, activityId: string|undefined, interactionEventArgs: InteractionEventArgs) {
        return this.activityManager.callActivityInteraction(activityName, interactionName, activityId, interactionEventArgs)
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

