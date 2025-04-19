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
import { Computation, DataBasedComputation, DateDep, GlobalBoundState, RecordBoundState } from "./computedDataHandles/Computation.js";

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
    public computedDataHandles = new Set<ComputedDataHandle|Computation>()
    public activityCalls = new Map<string, ActivityCall>()
    public activityCallsByName = new Map<string, ActivityCall>()
    public interactionCallsByName = new Map<string, InteractionCall>()
    public interactionCalls = new Map<string, InteractionCall>()
    // 因为很多 function 都会bind controller 作为 this，所以我们也把 controller 的 globals 作为注入全局工具的入口。
    public recordNameToSideEffects = new Map<string, Set<KlassInstance<any> | RecordMutationSideEffect>>()
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

        // 初始化 各种 computed。
        // entity 的
        entities.forEach(entity => {
            if (entity.computedData) {
                this.addComputedDataHandle('entity', entity.computedData as KlassInstance<typeof ComputedData>, undefined, entity)
            }

            // property 的
            entity.properties?.forEach(property => {
                if (property.computedData) {
                    this.addComputedDataHandle('property', property.computedData as KlassInstance<typeof ComputedData>, entity, property)
                }
            })
        })

        // relation 的
        relations.forEach(relation => {
            const relationAny = relation as any;
            if(relationAny.computedData) {
                this.addComputedDataHandle('relation', relationAny.computedData as KlassInstance<typeof ComputedData>, undefined, relation)
            }

            if (relationAny.properties) {
                relationAny.properties.forEach((property: any) => {
                    if (property.computedData) {
                        this.addComputedDataHandle('property', property.computedData as KlassInstance<typeof ComputedData>, relation, property)
                    }
                })
            }
        })

        states.forEach(state => {
            if (state.computedData) {
                this.addComputedDataHandle('global', state.computedData as KlassInstance<typeof ComputedData>, undefined, state.name as string)
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
    addComputedDataHandle(computedDataType: ComputedDataType,computedData: KlassInstance<any>, host:DataContext["host"], id: DataContext["id"]) {
        const dataContext: DataContext = {
            type: (!host && typeof id === 'string' )?
                'global' :
                id instanceof Entity ?
                    'entity' :
                    id instanceof Relation ?
                        'relation' :
                        'property',
            host,
            id
        }
        const handles = ComputedDataHandle.Handles
        const Handle = handles.get(computedData.constructor as Klass<any>)![computedDataType]!
        assert(!!Handle, `cannot find handle for ${computedData.constructor.name}`)

        this.computedDataHandles.add(
            new Handle(this, computedData, dataContext)
        )
    }
    async setup(install?: boolean) {

        // 1. setup 数据库
        for(const handle of this.computedDataHandles) {
            if (handle instanceof ComputedDataHandle) {
                handle.parseComputedData()
            }
        }
        // CAUTION 注意这里的 entities/relations 可能被 IncrementalComputationHandle 修改过了
        await this.system.setup(this.entities, this.relations, install)

        // 2. 增量计算的字段设置初始值
        for(const handle of this.computedDataHandles) {
            if (handle instanceof ComputedDataHandle) {
                await handle.setupInitialValue()
            }
        }

        for(const handle of this.computedDataHandles) {
            if (handle instanceof ComputedDataHandle) {
                await handle.setupStates()
                handle.addEventListener()
            }
        }
       


        for(const handle of this.computedDataHandles) {
            if (!(handle instanceof ComputedDataHandle)) {
                const computationHandle = handle as Computation
                // 0. 创建 defaultValue
                if (computationHandle.getDefaultValue) {
                    const defaultValue = computationHandle.getDefaultValue()
                    if (computationHandle.dataContext.type === 'global') {
                        await this.applyResult(computationHandle.dataContext, defaultValue)
                    } else {
                        // TODO ER property 等 defalutValue 的设置
                    }
                }

                // 1. 创建计算所需要的 state
                if (computationHandle.createState) {
                    computationHandle.state = await computationHandle.createState()

                    for(const [key, state] of Object.entries(computationHandle.state)) {
                        if (state instanceof GlobalBoundState) {
                            state.controller = this

                            const globalKey = `${computationHandle.dataContext!.id!}_${key}`
                            state.globalKey = globalKey

                            if (typeof state.defaultValue !== undefined) {
                                await this.system.storage.set('state',globalKey, state.defaultValue)
                            }
                        } else if (state instanceof RecordBoundState) {
                            // TODO 需要附加到 ER 上面去。
                        }
                    }

                }

                // 2. 根据 data deps 计算出 mutation events
                if( (computationHandle as DataBasedComputation).compute) {
                    const dataBasedComputation = computationHandle as DataBasedComputation
                    Object.entries(dataBasedComputation.dataDeps||{} as {[key: string]: DateDep}).forEach(([key, dep]: [string, DateDep]) => {
                        if (dep.type === 'record') {
                            this.system.storage.listen(async (mutationEvents) => {
                                for(let mutationEvent of mutationEvents){
                                    if (mutationEvent.recordName === dep.name) {
                                        if (dataBasedComputation.incrementalCompute) {
                                            let lastValue = undefined
                                            if (dataBasedComputation.useLastValue) {
                                                lastValue = await this.retrieveLastValue(dataBasedComputation.dataContext)
                                            }
                                            const result = await dataBasedComputation.incrementalCompute(lastValue, mutationEvent)
                                            // TODO 应用 result
                                            await this.applyResult(dataBasedComputation.dataContext, result)


                                        } else if(dataBasedComputation.incrementalPatchCompute){
                                            const patch = await dataBasedComputation.incrementalPatchCompute(mutationEvent)
                                            // TODO 应用 patch
                                            await this.applyResultPatch(dataBasedComputation.dataContext, patch)


                                        } else {
                                            // TODO 需要注入 dataDeps
                                            const result = await dataBasedComputation.compute()
                                            // TODO 应用 result
                                            await this.applyResult(dataBasedComputation.dataContext, result)
                                        }
                                    }
                                }
                            })
                        } else {
                            // TODO 别的依赖
                        }
                    })

                    
                    
                }
                
            }
        }

        // TODO 如果是恢复模式，还要从 event stack 中开始恢复数据。
    }
    async applyResult(dataContext: DataContext, result: any) {
        if (dataContext.type === 'global') {
            // TODO 
            return this.system.storage.set('state', dataContext.id! as string, result)
        } else if (dataContext.type === 'entity') {
            // TODO
        } else if (dataContext.type === 'relation') {
            // TODO
        }
    }
    async retrieveLastValue(dataContext: DataContext) {
        if (dataContext.type === 'global') {
            return this.system.storage.get('state', dataContext.id! as string)
        } else if (dataContext.type === 'entity') {
            // TODO
        } else if (dataContext.type === 'relation') {
            // TODO
        }
    }
    async applyResultPatch(dataContext: DataContext, patch: any) {
        if (dataContext.type === 'global') {
            // TODO
        } else if (dataContext.type === 'entity') {
            // TODO
        } else if (dataContext.type === 'relation') {
            // TODO
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

