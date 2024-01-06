import {ComputedData, KlassInstance, Relation, StateMachine, StateTransfer} from "@interaqt/shared";
import {Controller} from "../Controller.js";
import {InteractionEventArgs} from "../types/interaction.js";
import {assert} from "../util.js";
import {EntityIdRef, EVENT_RECORD, InteractionEventRecord, RecordMutationEvent} from '../System.js'
import {MatchAtom, MatchExp} from '@interaqt/storage'
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle.js";
import {InteractionCallResponse} from "../InteractionCall.js";


type SourceTargetPair = [EntityIdRef, EntityIdRef][]
type ComputeRelationTargetResult = SourceTargetPair | {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef} | undefined
type EntityTargetResult = EntityIdRef|EntityIdRef[]|undefined
type ComputeSourceResult = ComputeRelationTargetResult| EntityTargetResult
type TransferHandleFn = (this: Controller,interactionEventArgs: InteractionEventArgs, activityId?:string ) =>  Promise<ComputeSourceResult>

export class StateMachineHandle extends ComputedDataHandle {
    defaultState: any
    transfers!: KlassInstance<typeof StateTransfer, false>[]
    transferHandleFn?: Map<KlassInstance<typeof StateTransfer, false>, TransferHandleFn>
    data?: KlassInstance<typeof Relation, false>
    triggerInteractionToTransferMap: Map<string, Set<KlassInstance<typeof StateTransfer, false>>> = new Map()
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData, false> , dataContext:  DataContext) {
        super(controller, computedData, dataContext)
        this.data = this.dataContext.id as KlassInstance<typeof Relation, false>
        this.transferHandleFn = new Map()
        this.validateState()
    }

    validateState() {
        // FIXME 理论上在一个状态机中，任何状态都应该是能用属性完全独立区别开的。最好在这里验证一下。
    }
    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        return undefined
    }
    parseComputedData() {
        const computedData = this.computedData as unknown as KlassInstance<typeof StateMachine, false>
        this.transfers = computedData.transfers
        this.defaultState = computedData.defaultState.value
        computedData.transfers!.forEach(transfer => {
            this.transferHandleFn!.set(transfer, transfer.handle)
        })
        this.userFullCompute = () => {
            return this.defaultState
        }

        this.transfers.forEach(transfer => {
            let transfers = this.triggerInteractionToTransferMap!.get(transfer.triggerInteraction.uuid)
            if (!transfers) {
                this.triggerInteractionToTransferMap!.set(transfer.triggerInteraction.uuid, (transfers = new Set()))
            }
            transfers.add(transfer)
        })
    }

    addEventListener() {
        super.addEventListener();

        this.controller.system.storage.listen(async (mutationEvents) => {
            const events: RecordMutationEvent[] = []
            for(let mutationEvent of mutationEvents){
                if (mutationEvent.type==='create'&& mutationEvent.recordName === EVENT_RECORD) {
                    // 是不是监听的 interaction 的变化
                    const transfers = this.triggerInteractionToTransferMap.get(mutationEvent.record!.interactionId)
                    if (transfers) {
                        const eventRecord = mutationEvent.record! as InteractionEventRecord

                        for(let transfer of transfers) {
                            const newEvents = await this.onCallInteraction(transfer, eventRecord, mutationEvent.record!.activityId)
                            events.push(...(newEvents||[]))
                        }
                    }
                }

            }

            return { events }
        })
    }


    getRelationSourceTargetPairs(handleFnResult: ComputeSourceResult): SourceTargetPair {
        if (!handleFnResult) return []

        if (Array.isArray(handleFnResult)) {
            return handleFnResult as SourceTargetPair
        }

        assert(!!handleFnResult.source && !!handleFnResult.target, `source and target must not be undefined ${handleFnResult.source}, ${handleFnResult.target}`)

        if (!Array.isArray(handleFnResult.source) && !Array.isArray(handleFnResult.target)) {
            return [[handleFnResult.source, handleFnResult.target]]
        }

        if (Array.isArray(handleFnResult.source)) {
            return handleFnResult.source.map(oneSource => ([oneSource, handleFnResult.target])) as SourceTargetPair
        }

        if (Array.isArray(handleFnResult.target)) {
            return handleFnResult.target.map(oneTarget => ([handleFnResult.source, oneTarget ])) as SourceTargetPair
        }

        return []
    }
    onCallInteraction = async (transfer: KlassInstance<typeof StateTransfer, false>, interactionEventArgs: InteractionEventArgs,  activityId? :string) =>{
        // CAUTION 不能房子啊 constructor 里面因为它实在 controller 里面调用的，controller 还没准备好。
        const handleFn = this.transferHandleFn!.get(transfer)!
        if (transfer.handleType === 'computeTarget') {
            // 1. 执行 handle 来计算  source 和 target
            const targets = await handleFn.call(this.controller, interactionEventArgs, activityId)

            let events!: RecordMutationEvent[]

            if (this.computedDataType=== 'relation') {
                events = await this.transferRelationState(targets as ComputeRelationTargetResult, transfer)
            } else  if (this.computedDataType === 'entity') {
                events = await this.transferEntityState(targets as EntityTargetResult, transfer)
            } else if(this.computedDataType === 'global'){
                events = await this.transferGlobalState(transfer)
            } else if(this.computedDataType === 'property'){
                events = await this.transferPropertyState(targets as EntityTargetResult, transfer)
            }

            return events
        } else {
            assert(false, 'not implemented yet')
        }
    }
    async transferPropertyState(inputTargets: EntityTargetResult, transfer: KlassInstance<typeof StateTransfer, false>, ) {
        const targets = inputTargets ? (Array.isArray(inputTargets) ? inputTargets : [inputTargets]) : []
        const events: RecordMutationEvent[] = []
        for(let target of targets) {
            const currentState = transfer.fromState!
            const nextState = transfer.toState!

            const match = MatchExp.atom({
                key: 'id',
                value: ['=', target.id]
            })

            const matchedEntity = (await this.controller.system.storage.findOne(this.recordName!, match, undefined, ['*']))!

            if (matchedEntity[this.propertyName!] === currentState.value) {
                const innerMutationEvents: RecordMutationEvent[] =[]

                await this.controller.system.storage.update(this.recordName!, match, {[this.propertyName!]: nextState.value}, innerMutationEvents)
                events.push(...innerMutationEvents)
            }
        }
        return events
    }
    async transferGlobalState( transfer: KlassInstance<typeof StateTransfer, false>) {
        const currentState = await this.controller.system.storage.get('state', this.dataContext.id as string)
        const events: RecordMutationEvent[] = []

        if (currentState === transfer.fromState!.value) {
            await this.controller.system.storage.set('state', this.dataContext.id as string, transfer.toState.value, events)
        }
        return events
    }
    async transferEntityState(inputTargets: EntityTargetResult, transfer: KlassInstance<typeof StateTransfer, false>) {
        const targets = inputTargets ? (Array.isArray(inputTargets) ? inputTargets : [inputTargets]) : []
        const events: RecordMutationEvent[] = []

        for(let target of targets) {
            const currentState = transfer.fromState!
            const nextState = transfer.toState!

            const baseMatch = MatchExp.atom({
                key: 'id',
                value: ['=', target.id]
            })

            // 如果当前状态是有的情况，那么要准确的判断是不是和 currentState 完全 match，这里要用 fixedProperties 来 match.
            const innerMutationEvents: RecordMutationEvent[] =[]
            if (currentState.value) {
                let match = baseMatch

                Object.entries(currentState.value||{}).forEach(([key, value]) => {
                    match = match.and({
                        key,
                        value: ['=', value]
                    })
                })

                const matchedEntity = await this.controller.system.storage.findOne(this.recordName!, match)
                if (matchedEntity) {
                    const matchExp = {
                        key: 'id',
                        value: ['=', matchedEntity.id]
                    } as MatchAtom

                    if(!nextState.value) {
                        // 转移成删除

                        await this.controller.system.storage.delete(this.recordName!, MatchExp.atom(matchExp), innerMutationEvents)

                    } else {
                        // TODO 除了 fixedProperties 还有 propertyHandle 来计算 动态的 property
                        await this.controller.system.storage.update(this.recordName!, MatchExp.atom(matchExp), nextState.value, innerMutationEvents)

                    }
                }

            } else {
                // 这是 currentState 是没有的状态。应该没有关系才算匹配
                const matchedEntity = await this.controller.system.storage.findOne(this.recordName!, baseMatch)
                if (!matchedEntity) {
                    // 没有数据才说明匹配
                    // 转移 变成有
                    const result = await this.controller.system.storage.create(this.recordName!, nextState.value, innerMutationEvents)

                }
            }
            events.push(...innerMutationEvents)

        }

        return events
    }
    async transferRelationState(targets: ComputeRelationTargetResult, transfer: KlassInstance<typeof StateTransfer, false>) {
        const sourceAndTargetPairs = this.getRelationSourceTargetPairs(targets)
        const relationName = this.recordName!
        const events: RecordMutationEvent[] = []

        for(let sourceAndTargetPair of sourceAndTargetPairs) {
            const [sourceRef, targetRef] = sourceAndTargetPair
            const currentState = transfer.fromState!
            const nextState = transfer.toState!
            const innerMutationEvents: RecordMutationEvent[] =[]

            const baseRelationMatch =  MatchExp.atom({
                key: 'source.id',
                value: ['=', sourceRef.id]
            }).and({
                key: 'target.id',
                value: ['=', targetRef.id]
            })

            // 如果当前状态是有的情况，那么要准确的判断是不是和 currentState 完全 match，这里要用 fixedProperties 来 match.
            if (currentState.value) {
                let relationMatch = baseRelationMatch

                Object.entries(currentState.value).forEach(([key, value]) => {
                    relationMatch = relationMatch.and({
                        key,
                        value: ['=', value]
                    })
                })


                const matchedRelation = await this.controller.system.storage.findOneRelationByName(relationName, relationMatch)
                if (matchedRelation) {
                    const matchExp = {
                        key: 'id',
                        value: ['=', matchedRelation.id]
                    } as MatchAtom

                    if(!nextState.value) {
                        // 转移成删除
                        const result = await this.controller.system.storage.removeRelationByName(relationName, MatchExp.atom(matchExp), innerMutationEvents)

                    } else {
                        // TODO 除了 fixedProperties 还有 propertyHandle 来计算 动态的 property
                        const result = await this.controller.system.storage.updateRelationByName(relationName, MatchExp.atom(matchExp), nextState.value, innerMutationEvents)

                    }
                }

            } else {
                // 这是 currentState 是没有的状态。应该没有关系才算匹配
                const matchedRelation = await this.controller.system.storage.findOneRelationByName(relationName, baseRelationMatch)
                if (!matchedRelation) {
                    // 没有数据才说明匹配
                    // 转移 变成有
                    const result = await this.controller.system.storage.addRelationByNameById(relationName, sourceRef.id, targetRef.id, nextState.value, innerMutationEvents)

                }
            }

            events.push(...innerMutationEvents)
        }

        return events
    }
}
ComputedDataHandle.Handles.set(StateMachine, StateMachineHandle)