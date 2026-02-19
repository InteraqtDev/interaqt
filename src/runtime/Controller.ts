import { BoolExp, EntityInstance, RelationInstance, ActivityInstance, InteractionInstance, DictionaryInstance, Property, EventSourceInstance } from "@core";
import { MatchExp } from "@storage";
import { RecordMutationEvent, System, SystemCallback, SystemLogger } from "./System.js";
import './computations/index.js';
import { InteractionCallResponse } from "../builtins/interaction/activity/InteractionCall.js";
import { InteractionEventArgs } from "@core";
import { Computation, ComputationResult, ComputationResultSkip, ComputationResultPatch, DataContext, EntityDataContext, PropertyDataContext, RelationDataContext } from "./computations/Computation.js";
import { Scheduler } from "./Scheduler.js";
import { ActivityManager } from "../builtins/interaction/activity/ActivityManager.js";
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
import { InteractionExecutionError, SideEffectError } from "./errors/index.js";
import { assert } from "./util.js";
import { asyncEffectsContext } from "./asyncEffectsContext.js";

export const USER_ENTITY = 'User'

export interface IRecordMutationSideEffect<T extends any> {
    name: string;
    record: { name: string };
    content: (this: Controller, event: RecordMutationEvent) => Promise<T>;
}

export class RecordMutationSideEffect<T extends any> implements IRecordMutationSideEffect<T> {
    name: string;
    record: { name: string };
    content: (this: Controller, event: RecordMutationEvent) => Promise<any>;

    constructor(data: IRecordMutationSideEffect<T>) {
        this.name = data.name;
        this.record = data.record;
        this.content = data.content;
    }

    static create<T>(data: IRecordMutationSideEffect<T>): RecordMutationSideEffect<T> {
        return new RecordMutationSideEffect<T>(data);
    }
}

export type InteractionContext = {
    logContext?: any
    [k: string]: any
}

export type ComputationType = 'global' | 'entity' | 'relation' | 'property'

type SideEffectResult = {
    result?: unknown,
    error?: unknown
}

export type DispatchResponse = {
    error?: unknown
    data?: unknown
    effects?: RecordMutationEvent[]
    sideEffects?: { [k: string]: SideEffectResult }
    context?: { [k: string]: unknown }
}

export interface ControllerOptions {
    system: System
    entities?: EntityInstance[]
    relations?: RelationInstance[]
    /** @deprecated Pass Interaction instances via eventSources instead */
    activities?: ActivityInstance[]
    /** @deprecated Pass Interaction instances via eventSources instead */
    interactions?: InteractionInstance[]
    eventSources?: EventSourceInstance<any, any>[]
    dict?: DictionaryInstance[]
    recordMutationSideEffects?: RecordMutationSideEffect<any>[]
    computations?: (new (...args: any[]) => Computation)[]
    /** @deprecated Use ignoreGuard instead */
    ignorePermission?: boolean
    ignoreGuard?: boolean
    /** @deprecated Use forceThrowDispatchError instead */
    forceThrowInteractionError?: boolean
    forceThrowDispatchError?: boolean
}

export const HARD_DELETION_PROPERTY_NAME = '_isDeleted_'

export const HardDeletionProperty = {
    create() {
        return Property.create({
            name: HARD_DELETION_PROPERTY_NAME,
            type: 'boolean',
        })
    }
}

export class Controller {
    public recordNameToSideEffects = new Map<string, Set<RecordMutationSideEffect<any>>>()
    public globals = {
        BoolExp,
        MatchExp
    }
    public scheduler: Scheduler
    public activityManager: ActivityManager
    public system: System
    public entities: EntityInstance[]
    public relations: RelationInstance[]
    public eventSources: EventSourceInstance<any, any>[]
    public dict: DictionaryInstance[] = []
    public recordMutationSideEffects: RecordMutationSideEffect<any>[] = []
    public ignorePermission: boolean
    public ignoreGuard: boolean
    public forceThrowInteractionError: boolean
    public forceThrowDispatchError: boolean

    private eventSourcesByName = new Map<string, EventSourceInstance<any, any>>()
    private eventSourcesByUUID = new Map<string, EventSourceInstance<any, any>>()

    constructor(options: ControllerOptions) {
        const {
            system,
            entities = [],
            relations = [],
            activities = [],
            interactions = [],
            eventSources = [],
            dict = [],
            recordMutationSideEffects = [],
            computations = [],
            ignorePermission = false,
            ignoreGuard,
            forceThrowInteractionError = false,
            forceThrowDispatchError,
        } = options
        
        this.system = system
        this.ignorePermission = ignorePermission
        this.ignoreGuard = ignoreGuard ?? ignorePermission
        this.forceThrowInteractionError = forceThrowInteractionError
        this.forceThrowDispatchError = forceThrowDispatchError ?? forceThrowInteractionError
        this.entities = [...entities]
        this.relations = [...relations]
        this.dict = [...dict]
        this.recordMutationSideEffects = [...recordMutationSideEffects]

        // Initialize ActivityManager (produces activity-wrapped event sources)
        this.activityManager = new ActivityManager(this, activities, interactions)

        // Merge all event sources: explicit eventSources + interactions + activity-wrapped interactions
        this.eventSources = [...eventSources, ...interactions, ...this.activityManager.getActivityEventSources()]

        // Register event sources by name/uuid for dispatch lookup
        for (const es of this.eventSources) {
            if (es.name) {
                this.eventSourcesByName.set(es.name, es)
            }
            this.eventSourcesByUUID.set(es.uuid, es)
        }

        // Register entities from all event sources (deduplicated)
        const registeredRecordNames = new Set(this.entities.map(e => e.name))
        for (const es of this.eventSources) {
            if (es.entity && es.entity.name && !registeredRecordNames.has(es.entity.name)) {
                this.entities.push(es.entity)
                registeredRecordNames.add(es.entity.name)
            }
        }

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
        await this.scheduler.setup(install)
    }
    
    async retrieveLastValue(dataContext: DataContext, record?: any) {
        if (dataContext.type === 'global') {
            return this.system.storage.dict.get(dataContext.id.name)
        } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
            return this.system.storage.find(dataContext.id.name!, undefined, undefined, ['*'])
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (record[propertyDataContext.id.name]) return record[propertyDataContext.id.name]

            const item = await this.system.storage.findOne(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record!.id]}), undefined, ['*'])
            return item[propertyDataContext.id.name]
        }
    }
    async applyResult(dataContext: DataContext, result: any, record?: any) {
        if (result instanceof ComputationResultSkip) return

        if (dataContext.type === 'global') {
            return this.system.storage.dict.set(dataContext.id.name, result)
        } else if (dataContext.type === 'entity') {
            if (result === undefined || result === null) return
            const entityContext = dataContext as EntityDataContext
            await this.system.storage.delete(entityContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}))
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(entityContext.id.name!, item)
            }
        } else if (dataContext.type === 'relation') {
            if (result === undefined || result === null) return
            const relationContext = dataContext as RelationDataContext
            await this.system.storage.delete(relationContext.id.name!, BoolExp.atom({key: 'id', value: ['not', null]}))
            const items = Array.isArray(result) ? result : [result]
            for (const item of items) {
                await this.system.storage.create(relationContext.id.name!, item)
            }
        } else {
            const propertyDataContext = dataContext as PropertyDataContext
            if (propertyDataContext.id.name === HARD_DELETION_PROPERTY_NAME && result) {
                await this.system.storage.delete(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}))
            } else {
                await this.system.storage.update(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[propertyDataContext.id.name]: result})
            }
        }   
    }
    async applyResultPatch(dataContext: DataContext, patch: ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined, record?: any) {
        if (patch instanceof ComputationResultSkip||patch === undefined) return

        const patches = Array.isArray(patch) ? patch : [patch]
        for(const patch of patches) {
                if (dataContext.type === 'global') {
                    return this.system.storage.dict.set(dataContext.id.name, patch)
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

                if (propertyDataContext.id.name === HARD_DELETION_PROPERTY_NAME && patch.data) {
                    assert(patch.type !== 'delete', 'Hard deletion property cannot be deleted')
                    await this.system.storage.delete(propertyDataContext.host.name!, BoolExp.atom({key: 'id', value: ['=', record.id]}))
                } else {
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
    }
    callbacks: Map<any, Set<SystemCallback>> = new Map()

    /**
     * Unified dispatch API for all event source types.
     * First parameter is an object reference to the event source, second is the event args.
     */
    async dispatch<TArgs = any, TResult = any>(
        eventSource: EventSourceInstance<TArgs, TResult>,
        args: TArgs
    ): Promise<DispatchResponse> {
        const effectsContext = { effects: [] as RecordMutationEvent[] }
        
        return asyncEffectsContext.run(effectsContext, async () => {
            await this.system.storage.beginTransaction(eventSource.name)
            
            let result: DispatchResponse
            try {
                if (!(this.ignoreGuard || this.ignorePermission) && eventSource.guard) {
                    await eventSource.guard.call(this, args)
                }
                
                const eventData = eventSource.mapEventData
                    ? eventSource.mapEventData(args)
                    : {}
                    
                await this.system.storage.create(eventSource.entity.name!, eventData)
                
                let data: unknown = undefined
                if (eventSource.resolve) {
                    data = await eventSource.resolve.call(this, args)
                }
                
                let context: Record<string, unknown> | undefined = undefined
                if (eventSource.afterDispatch) {
                    const afterResult = await (eventSource.afterDispatch as Function).call(this, args, { data })
                    if (afterResult) {
                        context = afterResult
                    }
                }
                
                result = { data, effects: effectsContext.effects, sideEffects: {}, context }
                
                await this.system.storage.commitTransaction(eventSource.name)
            } catch (e) {
                await this.system.storage.rollbackTransaction(eventSource.name)
                
                if (this.forceThrowDispatchError || this.forceThrowInteractionError) throw e
                result = {
                    error: e,
                    effects: [],
                    sideEffects: {}
                }
            }
            
            result.effects = effectsContext.effects
            
            if (!result.error) {
                await this.runRecordChangeSideEffects(result as InteractionCallResponse, this.system.logger)
            }
            
            return result
        })
    }

    /** @deprecated Use dispatch() instead */
    async callInteraction(interactionName:string, interactionEventArgs: InteractionEventArgs, activityName?: string, activityId?: string) {
        if (activityName) {
            return this.activityManager.callActivityInteraction(activityName, interactionName, activityId, interactionEventArgs)
        }

        const eventSource = this.findEventSourceByName(interactionName)
        if (!eventSource) {
            throw new InteractionExecutionError(`Cannot find interaction for ${interactionName}`, {
                interactionName,
                userId: interactionEventArgs.user?.id,
                payload: interactionEventArgs.payload,
                executionPhase: 'interaction-lookup',
            })
        }

        return this.dispatch(eventSource, interactionEventArgs)
    }
    async runRecordChangeSideEffects(result: InteractionCallResponse, logger: SystemLogger) {
        const mutationEvents = result.effects as RecordMutationEvent[]
        for(let event of mutationEvents || []) {
            const sideEffects = this.recordNameToSideEffects.get(event.recordName)
            if (sideEffects) {
                for(let sideEffect of sideEffects) {
                    try {
                        result.sideEffects![sideEffect.name] = {
                            result: await sideEffect.content.call(this, event),
                        }
                      
                    } catch (e){
                        
                        const sideEffectError = new SideEffectError(
                            `Side effect '${sideEffect.name}' failed for ${event.type} on ${event.recordName}`,
                            {
                                sideEffectName: sideEffect.name,
                                recordName: event.recordName,
                                mutationType: event.type,
                                recordId: event.record?.id,
                                context: {
                                    record: event.record,
                                    oldRecord: event.oldRecord,
                                    keys: event.keys
                                },
                                causedBy: e instanceof Error ? e : new Error(String(e))
                            }
                        )
                        
                        logger.error({label: "recordMutationSideEffect", message: sideEffect.name, error: sideEffectError})
                        result.sideEffects![sideEffect.name] = {
                            error: sideEffectError
                        }
                    }
                }
            }
        }
    }
    addEventListener(eventName: string, callback: (...args: any[]) => any) {
        if (!this.callbacks.has(eventName)) {
            this.callbacks.set(eventName, new Set());
        }
        this.callbacks.get(eventName)!.add(callback);
    }

    findEventSourceByName(name: string): EventSourceInstance<any, any> | undefined {
        return this.eventSourcesByName.get(name)
    }
}
