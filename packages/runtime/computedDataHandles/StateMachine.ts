import {ComputedData, KlassInstance, Relation, StateMachine, StateTransfer} from "@interaqt/shared";
import {Controller} from "../Controller.js";
import {InteractionEventArgs} from "../types/interaction.js";
import {assert} from "../util.js";
import {EntityIdRef, EVENT_RECORD, InteractionEventRecord, RecordMutationEvent} from '../System.js'
import {MatchAtom, MatchExp} from '@interaqt/storage'
import {ComputedDataHandle, DataContext} from "./ComputedDataHandle.js";
import {InteractionCallResponse} from "../InteractionCall.js";

// Extend InteractionEventArgs to include interaction property
interface ExtendedInteractionEventArgs extends InteractionEventArgs {
    interaction: {
        uuid: string;
    };
}

type SourceTargetPair = [EntityIdRef, EntityIdRef][]
type ComputeRelationTargetResult = SourceTargetPair | {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef} | undefined
type EntityTargetResult = EntityIdRef|EntityIdRef[]|undefined
type ComputeSourceResult = ComputeRelationTargetResult| EntityTargetResult
type TransferHandleFn = (this: Controller,interactionEventArgs: InteractionEventArgs, activityId?:string ) =>  Promise<ComputeSourceResult>

export class StateMachineHandle extends ComputedDataHandle {
    defaultState: any
    transfers!: KlassInstance<typeof StateTransfer>[]
    transferHandleFn?: Map<KlassInstance<typeof StateTransfer>, TransferHandleFn>
    data?: KlassInstance<typeof Relation>
    triggerInteractionToTransferMap: Map<string, Set<KlassInstance<typeof StateTransfer>>> = new Map()
    constructor(controller: Controller , computedData: KlassInstance<typeof ComputedData> , dataContext:  DataContext) {
        super(controller, computedData, dataContext)
        this.data = this.dataContext.id as KlassInstance<typeof Relation>
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
        const computedData = this.computedData as unknown as KlassInstance<typeof StateMachine>
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
        this.controller.addEventListener('callInteraction', async (interactionEventArgs: ExtendedInteractionEventArgs, activityId?: string) => {
            const transfers = this.triggerInteractionToTransferMap.get(interactionEventArgs.interaction.uuid)
            if (!transfers) return

            for (const transfer of transfers) {
                await this.onCallInteraction(transfer, interactionEventArgs, activityId)
            }
        })
    }

    getRelationSourceTargetPairs(handleFnResult: ComputeSourceResult): SourceTargetPair {
        if (!handleFnResult) return []
        if (Array.isArray(handleFnResult) && handleFnResult.length > 0 && Array.isArray(handleFnResult[0])) {
            return handleFnResult as SourceTargetPair
        }

        if (Array.isArray(handleFnResult)) {
            // Convert simple array to pairs
            return handleFnResult.map(item => [item, item] as [EntityIdRef, EntityIdRef])
        }

        if (typeof handleFnResult === 'object') {
            const { source, target } = handleFnResult as {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef}
            if (Array.isArray(source) && Array.isArray(target)) {
                assert(source.length === target.length, 'source and target should have the same length')
                return source.map((s, i) => [s, target[i]] as [EntityIdRef, EntityIdRef])
            }

            if (Array.isArray(source) && !Array.isArray(target)) {
                return source.map(s => [s, target] as [EntityIdRef, EntityIdRef])
            }

            if (!Array.isArray(source) && Array.isArray(target)) {
                return target.map(t => [source, t] as [EntityIdRef, EntityIdRef])
            }

            return [[source, target] as [EntityIdRef, EntityIdRef]]
        }

        return [[handleFnResult, handleFnResult] as [EntityIdRef, EntityIdRef]]
    }

    onCallInteraction = async (transfer: KlassInstance<typeof StateTransfer>, interactionEventArgs: ExtendedInteractionEventArgs, activityId? :string) => {
        const handleFn = this.transferHandleFn!.get(transfer)
        if (!handleFn) return

        const handleFnResult = await handleFn.call(this.controller, interactionEventArgs, activityId)

        if (!handleFnResult) return

        if (this.dataContext.host) {
            // Use _type instead of type and add type assertion
            const hostType = (this.dataContext.host as any)._type;
            
            if (hostType === 'Property') {
                // For property state transfers, we need to ensure we're passing EntityTargetResult
                let entityTargetResult: EntityTargetResult;
                
                if (this.isEntityTargetResult(handleFnResult)) {
                    entityTargetResult = handleFnResult;
                } else if (Array.isArray(handleFnResult) && handleFnResult.length > 0 && Array.isArray(handleFnResult[0])) {
                    // It's a SourceTargetPair, extract just the sources as EntityIdRef[]
                    entityTargetResult = (handleFnResult as [EntityIdRef, EntityIdRef][]).map(pair => pair[0]);
                } else if (typeof handleFnResult === 'object' && 'source' in handleFnResult && 'target' in handleFnResult) {
                    // It's a {source, target} object
                    entityTargetResult = Array.isArray(handleFnResult.source) ? 
                        handleFnResult.source : 
                        handleFnResult.source as EntityIdRef;
                } else {
                    entityTargetResult = undefined;
                }
                
                await this.transferPropertyState(entityTargetResult, transfer)
            } else if (hostType === 'Entity') {
                // For entity state transfers, we need to ensure we're passing EntityTargetResult
                let entityTargetResult: EntityTargetResult;
                
                if (this.isEntityTargetResult(handleFnResult)) {
                    entityTargetResult = handleFnResult;
                } else if (Array.isArray(handleFnResult) && handleFnResult.length > 0 && Array.isArray(handleFnResult[0])) {
                    // It's a SourceTargetPair, extract just the sources as EntityIdRef[]
                    entityTargetResult = (handleFnResult as [EntityIdRef, EntityIdRef][]).map(pair => pair[0]);
                } else if (typeof handleFnResult === 'object' && 'source' in handleFnResult && 'target' in handleFnResult) {
                    // It's a {source, target} object
                    entityTargetResult = Array.isArray(handleFnResult.source) ? 
                        handleFnResult.source : 
                        handleFnResult.source as EntityIdRef;
                } else {
                    entityTargetResult = undefined;
                }
                
                await this.transferEntityState(entityTargetResult, transfer)
            }
        } else if (this.dataContext.id && typeof this.dataContext.id !== 'string') {
            // Use _type instead of type and add type assertion
            const idType = (this.dataContext.id as any)._type;
            
            if (idType === 'Relation') {
                // For relation state transfers, ensure we're passing ComputeRelationTargetResult
                let relationTargetResult: ComputeRelationTargetResult;
                
                if (Array.isArray(handleFnResult) && handleFnResult.length > 0 && Array.isArray(handleFnResult[0])) {
                    // It's already a SourceTargetPair
                    relationTargetResult = handleFnResult as SourceTargetPair;
                } else if (typeof handleFnResult === 'object' && 'source' in handleFnResult && 'target' in handleFnResult) {
                    // It's a {source, target} object
                    relationTargetResult = handleFnResult as {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef};
                } else if (Array.isArray(handleFnResult)) {
                    // It's an array of EntityIdRef, convert to SourceTargetPair
                    relationTargetResult = (handleFnResult as EntityIdRef[]).map(item => [item, item] as [EntityIdRef, EntityIdRef]);
                } else if (handleFnResult && typeof handleFnResult === 'object') {
                    // It's a single EntityIdRef, convert to SourceTargetPair with identical source and target
                    relationTargetResult = [[handleFnResult as EntityIdRef, handleFnResult as EntityIdRef]];
                } else {
                    relationTargetResult = undefined;
                }
                
                await this.transferRelationState(relationTargetResult, transfer)
            } else {
                await this.transferGlobalState(transfer)
            }
        } else {
            await this.transferGlobalState(transfer)
        }
    }

    // Helper method to check if a value is an EntityTargetResult
    isEntityTargetResult(value: any): value is EntityTargetResult {
        if (value === undefined) return true
        if (Array.isArray(value)) {
            // If it's an array but the first item is also an array, it's not an EntityTargetResult
            if (value.length > 0 && Array.isArray(value[0])) return false
            // Otherwise it's an array of EntityIdRef
            return true
        }
        // If it's an object with an id property, it's an EntityIdRef
        if (typeof value === 'object' && value !== null && 'id' in value) return true
        // If it has source and target properties, it's not an EntityTargetResult
        if (typeof value === 'object' && value !== null && ('source' in value || 'target' in value)) return false
        
        return false
    }

    async transferPropertyState(inputTargets: EntityTargetResult, transfer: KlassInstance<typeof StateTransfer>, ) {
        // Use type assertions to fix property access issues
        const host = this.dataContext.host as any;
        const hostEntity = (host.host as any);
        const targets = Array.isArray(inputTargets) ? inputTargets : (inputTargets ? [inputTargets] : [])

        for (const target of targets) {
            if ((hostEntity._type as string) === 'Entity') {
                await this.controller.system.updateEntityPropertyState(
                    hostEntity.id,
                    target,
                    host.id,
                    transfer.fromState.value,
                    transfer.toState.value
                )
            }
        }
    }

    async transferGlobalState( transfer: KlassInstance<typeof StateTransfer>) {
        await this.controller.system.updateGlobalState(
            this.dataContext.id,
            transfer.fromState.value,
            transfer.toState.value
        )
    }

    async transferEntityState(inputTargets: EntityTargetResult, transfer: KlassInstance<typeof StateTransfer>) {
        const targets = Array.isArray(inputTargets) ? inputTargets : (inputTargets ? [inputTargets] : [])
        for (const target of targets) {
            await this.controller.system.updateEntityState(
                this.dataContext.id,
                target,
                transfer.fromState.value,
                transfer.toState.value
            )
        }
    }

    async transferRelationState(targets: ComputeRelationTargetResult, transfer: KlassInstance<typeof StateTransfer>) {
        const pairs = this.getRelationSourceTargetPairs(targets)
        for (const [source, target] of pairs) {
            await this.controller.system.updateRelationState(
                this.dataContext.id,
                source,
                target,
                transfer.fromState.value,
                transfer.toState.value
            )
        }
    }
}
ComputedDataHandle.Handles.set(StateMachine, StateMachineHandle)