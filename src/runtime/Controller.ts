import { DICTIONARY_RECORD, RecordMutationEvent, System, SystemCallback, SystemLogger } from "./System.js";
import {
    BoolExp, IInstance, EntityInstance, RelationInstance, ActivityInstance, InteractionInstance, DictionaryInstance
} from "@shared";
import './computations/index.js';
import { InteractionCallResponse, InteractionEventArgs } from "./activity/InteractionCall.js";
import { DataContext, EntityDataContext, PropertyDataContext, RelationDataContext } from "./computations/Computation.js";
import { Computation } from "./computations/Computation.js";
import { ComputationResult, ComputationResultSkip, ComputationResultPatch } from "./computations/Computation.js";
import { Scheduler } from "./Scheduler.js";
import { MatchExp } from "@storage";
import { ActivityManager } from "./activity/ActivityManager.js";
import { CountHandles } from "./computations/Count.js";
import { TransformHandles } from "./computations/Transform.js";
import { AnyHandles } from "./computations/Any.js";
import { EveryHandles } from "./computations/Every.js";
import { WeightedSummationHandles } from "./computations/WeightedSummation.js";
import { SummationHandles } from "./computations/Summation.js";
import { AverageHandles } from "./computations/Average.js";
import { RealTimeHandles } from "./computations/RealTime.js";
import { StateMachineHandles } from "./computations/StateMachine.js";
import { CustomHandles } from "./computations/Custom.js";
import {
    InteractionExecutionError
} from "./errors/index.js";

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

export interface ControllerOptions {
    system: System
    entities?: EntityInstance[]
    relations?: RelationInstance[]
    activities?: ActivityInstance[]
    interactions?: InteractionInstance[]
    dict?: DictionaryInstance[]
    recordMutationSideEffects?: RecordMutationSideEffect[]
    computations?: (new (...args: any[]) => Computation)[]
    ignorePermission?: boolean
    forceThtrowInteractionError?: boolean
}

export class Controller {
    // 因为很多 function 都会bind controller 作为 this，所以我们也把 controller 的 globals 作为注入全局工具的入口。
    public recordNameToSideEffects = new Map<string, Set<IInstance | RecordMutationSideEffect>>()
    public globals = {
        BoolExp,
        MatchExp
    }
    public scheduler: Scheduler
    public activityManager: ActivityManager
    public system: System
    public entities: EntityInstance[]
    public relations: RelationInstance[]
    public activities: ActivityInstance[]
    public interactions: InteractionInstance[]
    public dict: DictionaryInstance[] = []
    public recordMutationSideEffects: RecordMutationSideEffect[] = []
    public ignorePermission: boolean
    public forceThtrowInteractionError: boolean
    constructor(options: ControllerOptions) {
        const {
            system,
            entities = [],
            relations = [],
            activities = [],
            interactions = [],
            dict = [],
            recordMutationSideEffects = [],
            computations = [],
            ignorePermission = false,
            forceThtrowInteractionError = false // 会 catch 住 error，并在 result 中返回。
        } = options
        
        // 首先初始化 system
        this.system = system
        this.ignorePermission = ignorePermission
        this.forceThtrowInteractionError = forceThtrowInteractionError
        // 因为我们会对 entities 数组进行补充。如果外部复用了传入的数组对象，就会发生混乱，例如在测试用例中复用。
        this.entities = [...entities]
        this.relations = [...relations]
        this.activities = [...activities]
        this.interactions = [...interactions]
        this.dict = [...dict]
        this.recordMutationSideEffects = [...recordMutationSideEffects]

        // Initialize ActivityManager
        this.activityManager = new ActivityManager(this, activities, interactions)

        // Import default computation handles
        const allComputationHandles = [
            ...CountHandles,
            ...TransformHandles,
            ...AnyHandles,
            ...EveryHandles,
            ...WeightedSummationHandles,
            ...SummationHandles,
            ...AverageHandles,
            ...RealTimeHandles,
            ...StateMachineHandles,
            ...CustomHandles,
            ...computations
        ]
        
        this.scheduler = new Scheduler(this, this.entities, this.relations, this.dict, allComputationHandles)

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
        try {
            // 内部 error 已经 catch 住了，如果 option 中没有声明 returnInteractionError，则直接 throw 出去。
            const result = await this.activityManager.callInteraction(interactionName, interactionEventArgs)
            if (result.error && this.forceThtrowInteractionError) {
                throw result.error
            } else {
                return result
            }
        } catch (e) {
            const error = new InteractionExecutionError('Failed to call interaction', {
                interactionName,
                userId: interactionEventArgs.user?.id,
                payload: interactionEventArgs.payload,
                executionPhase: 'callInteraction',
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
    }
    async callActivityInteraction(activityName:string, interactionName:string, activityId: string|undefined, interactionEventArgs: InteractionEventArgs) {
        try {
            const result = await this.activityManager.callActivityInteraction(activityName, interactionName, activityId, interactionEventArgs)
            if (result.error && this.forceThtrowInteractionError) {
                throw result.error
            } else {
                return result
            }
        } catch (e) {
            const error = new InteractionExecutionError('Failed to call activity interaction', {
                interactionName,
                userId: interactionEventArgs.user?.id,
                payload: interactionEventArgs.payload,
                executionPhase: 'callActivityInteraction',
                context: { activityName, activityId },
                causedBy: e instanceof Error ? e : new Error(String(e))
            })
            throw error
        }
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
                            // Handle IInstance case - check if it has the required properties
                            const instanceSideEffect = sideEffect as IInstance & { name?: string; content?: (event: RecordMutationEvent) => Promise<unknown> };
                            if (instanceSideEffect.name && typeof instanceSideEffect.content === 'function') {
                                result.sideEffects![instanceSideEffect.name] = {
                                    result: await instanceSideEffect.content(event),
                                }
                            }
                        }
                    } catch (e){
                        let effectName = 'unknown';
                        if (sideEffect instanceof RecordMutationSideEffect) {
                            effectName = sideEffect.name;
                        } else {
                            const instanceSideEffect = sideEffect as IInstance & { name?: string };
                            effectName = instanceSideEffect.name || 'unknown';
                        }
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

