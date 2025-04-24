import { Interaction, KlassInstance, StateMachine, StateNode } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { InteractionEventArgs } from "../types/interaction.js";
import { EntityIdRef, EVENT_RECORD, RecordMutationEvent } from '../System.js';
import { ComputedDataHandle, DataContext } from "./ComputedDataHandle.js";
import { DataEventDep, EventBasedComputation, EventDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { EtityMutationEvent, SKIP_RESULT } from "../Scheduler.js";
import { TransitionFinder } from "./TransitionFinder.js";

type SourceTargetPair = [EntityIdRef, EntityIdRef][]
type ComputeRelationTargetResult = SourceTargetPair | {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef} | undefined
type EntityTargetResult = EntityIdRef|EntityIdRef[]|undefined
type ComputeSourceResult = ComputeRelationTargetResult| EntityTargetResult
type TransferHandleFn = (this: Controller,interactionEventArgs: InteractionEventArgs, activityId?:string ) =>  Promise<ComputeSourceResult>

export class GlobalStateMachineHandle implements EventBasedComputation {
    transitionFinder: TransitionFinder
    state!: {[key: string]: GlobalBoundState<any>}
    useLastValue: boolean = true
    eventDeps: {[key: string]: EventDep} = {}
    defaultState: KlassInstance<typeof StateNode>
    constructor(public controller: Controller, public args: KlassInstance<typeof StateMachine>, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(args)
        this.defaultState = args.defaultState
    }
    createState() {
        return {
            currentState: new GlobalBoundState<string>(this.defaultState.name),
        }
    }
    // 这里的 defaultValue 不能是 async 的模式。因为是直接创建时填入的。
    getDefaultValue() {
        return this.defaultState.computeValue ? this.defaultState.computeValue.call(this) : this.defaultState.name
    }
    mutationEventToTrigger(mutationEvent: RecordMutationEvent) {
        if (mutationEvent.recordName === EVENT_RECORD) {
            const interactionName = mutationEvent.record!.interactionName!
            const interaction = this.controller.interactions.find(i => i.name === interactionName)
            return interaction
        } else {
            return {
                type: 'data',
                eventType: mutationEvent.type,
            }
        }
    }
    async incrementalCompute(lastValue: string, mutationEvent: EtityMutationEvent, dirtyRecord: any) {
        const currentStateName = await this.state.currentState.get()
        const trigger = this.mutationEventToTrigger(mutationEvent)
        const nextState = this.transitionFinder?.findNextState(currentStateName, trigger)
        if (!nextState) return SKIP_RESULT

        await this.state.currentState.set(nextState.name)

        return nextState.computeValue? (await nextState.computeValue.call(this, lastValue)) : nextState.name
    }
}




export class PropertyStateMachineHandle implements EventBasedComputation {
    transitionFinder: TransitionFinder
    state!: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    useLastValue: boolean = true
    eventDeps: {[key: string]: EventDep} = {}
    defaultState: KlassInstance<typeof StateNode>
    constructor(public controller: Controller, args: KlassInstance<typeof StateMachine>, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(args)
        this.defaultState = args.defaultState

        // 订阅所有事件
        args.transfers.forEach(transfer => {
            this.eventDeps[transfer.trigger.name] = transfer.trigger instanceof Interaction ? 
                {
                    type: 'interaction',
                    interaction: transfer.trigger
                } : 
                transfer.trigger as DataEventDep
        })
    }
    createState() {
        return {
            currentState: new RecordBoundState<string>(this.defaultState.name),
        }
    }
    // 这里的 defaultValue 不能是 async 的模式。因为是直接创建时填入的。
    getDefaultValue() {
        return this.defaultState.computeValue ? this.defaultState.computeValue.call(this) : this.defaultState.name
    }
    mutationEventToTrigger(mutationEvent: RecordMutationEvent) {
        // FIXME 支持 data mutation
        if (mutationEvent.recordName === EVENT_RECORD) {
            const interactionName = mutationEvent.record!.interactionName!
            const interaction = this.controller.interactions.find(i => i.name === interactionName)
            return interaction
        }
    }
    computeDirtyRecords(mutationEvent: RecordMutationEvent) {
        // 这里 trigger 要么是 DataEventDep，要么是 Interaqtion。
        // TODO 未来还会有 Action 之类的？？？
        const trigger = this.mutationEventToTrigger(mutationEvent)
        if (trigger) {
            const transfer = this.transitionFinder.findTransfer(trigger)
            if (transfer?.computeTarget) {
                const event = mutationEvent.recordName === EVENT_RECORD ? mutationEvent.record : mutationEvent
                return transfer.computeTarget(event)
            }
        }
    }
    
    async incrementalCompute(lastValue: string, mutationEvent: RecordMutationEvent, dirtyRecord: any) {
        const currentStateName = await this.state.currentState.get(dirtyRecord)
        const trigger = this.mutationEventToTrigger(mutationEvent)
        const nextState = this.transitionFinder?.findNextState(currentStateName, trigger)
        if (!nextState) return SKIP_RESULT

        await this.state.currentState.set(dirtyRecord, nextState.name)

        return nextState.computeValue? (await nextState.computeValue.call(this, lastValue)) : nextState.name
    }

    
}

    
ComputedDataHandle.Handles.set(StateMachine, {
    global: GlobalStateMachineHandle,
    property: PropertyStateMachineHandle
})
