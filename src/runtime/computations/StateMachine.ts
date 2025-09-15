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
    useMutationEvent: boolean = true
    defaultState: StateNodeInstance
    constructor(public controller: Controller, public args: StateMachineInstance, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.defaultState = this.args.defaultState
        // 从所有 transfer 中构建 eventDeps
        for(const transfer of this.args.transfers) {
            const eventDepName = `${transfer.trigger.recordName}_${transfer.trigger.type}`
            this.eventDeps[eventDepName] = {
                recordName: transfer.trigger.recordName,
                type: transfer.trigger.type
            }
            // this.eventDeps[eventDepName] = transfer.trigger
        }
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
    async incrementalCompute(lastValue: string, mutationEvent: EtityMutationEvent, dirtyRecord: any) {
        // Now we can handle any mutationEvent, not just interaction events
        const currentStateName = await this.state.currentState.get()
        const nextState = this.transitionFinder?.findNextState(currentStateName, mutationEvent)
        if (!nextState) return ComputationResult.skip()

        await this.state.currentState.set(nextState.name)

        return nextState.computeValue? (await nextState.computeValue.call(this.controller, lastValue, mutationEvent)) : nextState.name
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
    useMutationEvent: boolean = true
    constructor(public controller: Controller, public args: StateMachineInstance, dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.defaultState = this.args.defaultState
        this.dataContext = dataContext as PropertyDataContext
        // 从所有 transfer 中构建 eventDeps
        for(const transfer of this.args.transfers) {
            const eventDepName = `${transfer.trigger.recordName}_${transfer.trigger.type}`
            this.eventDeps[eventDepName] = {
                recordName: transfer.trigger.recordName,
                type: transfer.trigger.type
            }
        }
        return
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
    async computeDirtyRecords(mutationEvent: RecordMutationEvent) {
        // Now directly use mutationEvent for matching
        const transfers = this.transitionFinder.findTransfers(mutationEvent)
        // CAUTION 不能返回有 null 的节点，所以加上 filter。
        return (await Promise.all(transfers.map(transfer => {
            return transfer.computeTarget!.call(this.controller, mutationEvent)
        }))).flat().filter(Boolean)
    }
    
    async incrementalCompute(lastValue: string, mutationEvent: RecordMutationEvent, dirtyRecord: any) {
        // Now we can handle any mutationEvent, not just interaction events
        const currentStateName = await this.state.currentState.get(dirtyRecord)
        const nextState = this.transitionFinder?.findNextState(currentStateName, mutationEvent)
        if (!nextState) return ComputationResult.skip()

        await this.state.currentState.set(dirtyRecord, nextState.name)
        return nextState.computeValue? (await nextState.computeValue.call(this.controller, lastValue, mutationEvent)) : nextState.name
    }
    // 给外部用的，因为可能在 Transform 里面设置初始值。
    async createStateData(state: StateNodeInstance) {
        return {
            [this.state.currentState.key]: state.name
        }
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
