import { StateMachine, StateMachineInstance, StateNode, StateNodeInstance } from "@shared";
import { Controller } from "../Controller.js";
import { EntityIdRef, RecordMutationEvent } from '../System.js';
import { INTERACTION_RECORD } from "../activity/ActivityManager.js";
import { DataContext, PropertyDataContext } from "./Computation.js";
import { ComputationResult, EventBasedComputation, EventDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { TransitionFinder } from "./TransitionFinder.js";
import { assert } from "../util.js";

type SourceTargetPair = [EntityIdRef, EntityIdRef][]
type ComputeRelationTargetResult = SourceTargetPair | {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef} | undefined
type EntityTargetResult = EntityIdRef|EntityIdRef[]|undefined
type ComputeSourceResult = ComputeRelationTargetResult| EntityTargetResult

export class GlobalStateMachineHandle implements EventBasedComputation {
    static computationType = StateMachine
    static contextType = 'global' as const
    transitionFinder: TransitionFinder
    state!: {[key: string]: GlobalBoundState<any>}
    useLastValue: boolean = true
    eventDeps: {[key: string]: EventDep} = {}
    defaultState: StateNodeInstance
    constructor(public controller: Controller, public args: StateMachineInstance, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.defaultState = this.args.defaultState
    }
    createState() {
        return {
            currentState: new GlobalBoundState<string>(this.defaultState.name),
        }
    }
    // 这里的 defaultValue 不能是 async 的模式。因为是直接创建时填入的。
    getDefaultValue(event:any) {
        return this.defaultState.computeValue ? this.defaultState.computeValue.call(this.controller, undefined, event) : this.defaultState.name
    }
    mutationEventToTrigger(mutationEvent: RecordMutationEvent) {
        if (mutationEvent.recordName === INTERACTION_RECORD) {
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
        assert(mutationEvent.recordName === INTERACTION_RECORD, 'Record StateMachine only supports interaction record')

        const currentStateName = await this.state.currentState.get()
        const trigger = this.mutationEventToTrigger(mutationEvent)
        const nextState = this.transitionFinder?.findNextState(currentStateName, trigger)
        if (!nextState) return ComputationResult.skip()

        await this.state.currentState.set(nextState.name)

        const interactionEvent = mutationEvent.record!
        return nextState.computeValue? (await nextState.computeValue.call(this.controller, lastValue, interactionEvent)) : nextState.name
    }
}


export class PropertyStateMachineHandle implements EventBasedComputation {
    static computationType = StateMachine
    static contextType = 'property' as const
    transitionFinder: TransitionFinder
    state!: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    useLastValue: boolean = true
    eventDeps: {[key: string]: EventDep} = {}
    defaultState: StateNodeInstance
    dataContext: PropertyDataContext
    constructor(public controller: Controller, public args: StateMachineInstance, dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.defaultState = this.args.defaultState
        this.dataContext = dataContext as PropertyDataContext
    }
    createState() {
        return {
            currentState: new RecordBoundState<string>(this.defaultState.name),
        }
    }
    // 这里的 defaultValue 不能是 async 的模式。因为是直接创建时填入的。
    getDefaultValue(initialRecord:any) {
        const lastValue = initialRecord[this.dataContext.id.name]
        assert(
            !(lastValue !== undefined && !this.defaultState.computeValue), 
            `${this.dataContext.host.name}.${this.dataContext.id.name} have been set when ${this.dataContext.host.name} created, 
if you want to save the use the initial value, you need to define computeValue in defaultState to save it.
Or if you want to use state name as value, you should not set ${this.dataContext.host.name}.${this.dataContext.id.name} when ${this.dataContext.host.name} created.
`
        )
        if (lastValue !== undefined || this.defaultState.computeValue) {
            return this.defaultState.computeValue!.call(this.controller, lastValue, undefined)
        } else {
            return this.defaultState.name
        }
    }
    mutationEventToTrigger(mutationEvent: RecordMutationEvent) {
        // FIXME 支持 data mutation
        if (mutationEvent.recordName === INTERACTION_RECORD) {
            const interactionName = mutationEvent.record!.interactionName!
            const interaction = this.controller.interactions.find(i => i.name === interactionName)
            return interaction
        }
    }
    async computeDirtyRecords(mutationEvent: RecordMutationEvent) {
        // 这里 trigger 要么是 DataEventDep，要么是 Interaqtion。
        // TODO 未来还会有 Action 之类的？？？
        const trigger = this.mutationEventToTrigger(mutationEvent)
        if (trigger) {
            const transfers = this.transitionFinder.findTransfers(trigger)
            // CAUTION 不能返回有 null 的节点，所以加上 filter。
            return (await Promise.all(transfers.map(transfer => {
                const event = mutationEvent.recordName === INTERACTION_RECORD ? mutationEvent.record : mutationEvent
                return transfer.computeTarget!.call(this.controller, event)
            }))).flat().filter(Boolean)
        }
    }
    
    async incrementalCompute(lastValue: string, mutationEvent: RecordMutationEvent, dirtyRecord: any) {
        assert(mutationEvent.recordName === INTERACTION_RECORD, 'Record StateMachine only supports interaction record')

        const currentStateName = await this.state.currentState.get(dirtyRecord)
        const trigger = this.mutationEventToTrigger(mutationEvent)
        const nextState = this.transitionFinder?.findNextState(currentStateName, trigger)
        if (!nextState) return ComputationResult.skip()

        await this.state.currentState.set(dirtyRecord, nextState.name)

        const interactionEvent = mutationEvent.record!
        return nextState.computeValue? (await nextState.computeValue.call(this.controller, lastValue, interactionEvent)) : nextState.name
    }
}

export const NON_EXIST_STATE = StateNode.create({
    name: 'nonExistent',
    computeValue: () => null
})

export const NON_DELETED_STATE = StateNode.create({
    name: 'nonDeleted',
    computeValue: () => false
})

export const DELETED_STATE = StateNode.create({
    name: 'deleted',
    computeValue: () => true
})
    
// Export StateMachine computation handles
export const StateMachineHandles = [GlobalStateMachineHandle, PropertyStateMachineHandle];
