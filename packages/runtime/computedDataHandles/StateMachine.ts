import { KlassInstance, StateMachine } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { InteractionEventArgs } from "../types/interaction.js";
import { EntityIdRef } from '../System.js';
import { ComputedDataHandle, DataContext } from "./ComputedDataHandle.js";
import { ComputeResult, EventBasedComputation, EventDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { ERRecordMutationEvent, SKIP_RESULT } from "../Scheduler.js";
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
    constructor(public controller: Controller, args: KlassInstance<typeof StateMachine>, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(args)
    }
    createState() {
        return {
            currentState: new GlobalBoundState<string>(''),
        }
    }
    
    async incrementalCompute(lastValue: string, mutationEvent: ERRecordMutationEvent, dirtyRecord: any) {
        const currentStateName = await this.state.currentState.get()
        const nextState = this.transitionFinder?.findNextState(currentStateName, mutationEvent)
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
    constructor(public controller: Controller, args: KlassInstance<typeof StateMachine>, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(args)
    }
    createState() {
        return {
            currentState: new RecordBoundState<string>(''),
        }
    }
    computeDirtyRecords(mutationEvent: ERRecordMutationEvent) {
        const transfer = this.transitionFinder.findTransfer(mutationEvent)
        if (transfer?.computeTarget) {
            return transfer.computeTarget(mutationEvent)
        }
    }
    
    async incrementalCompute(lastValue: string, mutationEvent: ERRecordMutationEvent, dirtyRecord: any) {
        const currentStateName = await this.state.currentState.get(dirtyRecord)
        const nextState = this.transitionFinder?.findNextState(currentStateName, mutationEvent)
        if (!nextState) return SKIP_RESULT

        await this.state.currentState.set(dirtyRecord, nextState.name)

        return nextState.computeValue? (await nextState.computeValue.call(this, lastValue)) : nextState.name
    }

    
}

    
ComputedDataHandle.Handles.set(StateMachine, {
    global: GlobalStateMachineHandle,
    property: PropertyStateMachineHandle
})
