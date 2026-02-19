import { StateMachine, StateMachineInstance, StateNode, StateNodeInstance } from "@core";
import { Controller } from "../Controller.js";
import { EntityIdRef, RecordMutationEvent } from '../System.js';
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
    initialState: StateNodeInstance
    constructor(public controller: Controller, public args: StateMachineInstance, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.initialState = this.args.initialState
        // 从所有 transfer 中构建 eventDeps
        // 特别注意，这里不能用系统默认的 eventDeps 深度匹配机制。
        // 因为可能有多个 transfer 都是同样的 trigger。
        // 使用的系统的 eventDeps 会执行完一个再执行另一个，这时有可能刚好记录转换成下一个状态，结果又被匹配中了。进行下一次转换。
        for(const transfer of this.args.transfers) {
            const eventDepName = `${transfer.trigger.recordName}_${transfer.trigger.type}`
            this.eventDeps[eventDepName] = {
                recordName: transfer.trigger.recordName,
                type: transfer.trigger.type
            }
        }
    }
    createState() {
        return {
            currentState: new GlobalBoundState<string>(this.initialState.name),
        }
    }
    async getInitialValue(event:any) {
        return this.initialState.computeValue ? await this.initialState.computeValue.call(this.controller, undefined, event) : this.initialState.name
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
    initialState: StateNodeInstance
    dataContext: PropertyDataContext
    useMutationEvent: boolean = true
    constructor(public controller: Controller, public args: StateMachineInstance, dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.initialState = this.args.initialState
        this.dataContext = dataContext as PropertyDataContext
        // 从所有 transfer 中构建 eventDeps
        // 特别注意，这里不能用系统默认的 eventDeps 深度匹配机制。
        // 因为可能有多个 transfer 都是同样的 trigger。
        // 使用的系统的 eventDeps 会执行完一个再执行另一个，这时有可能刚好记录转换成下一个状态，结果又被匹配中了。进行下一次转换。
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
            currentState: new RecordBoundState<string>(this.initialState.name),
        }
    }
    async getInitialValue(initialRecord:any) {
        const lastValue = initialRecord[this.dataContext.id.name]
        assert(
            !(lastValue !== undefined && !this.initialState.computeValue), 
            `${this.dataContext.host.name}.${this.dataContext.id.name} have been set when ${this.dataContext.host.name} created, 
if you want to save the use the initial value, you need to define computeValue in initialState to save it.
Or if you want to use state name as value, you should not set ${this.dataContext.host.name}.${this.dataContext.id.name} when ${this.dataContext.host.name} created.
`
        )
        if (lastValue !== undefined || this.initialState.computeValue) {
            return await this.initialState.computeValue!.call(this.controller, lastValue, undefined)
        } else {
            return this.initialState.name
        }
    }
    async computeDirtyRecords(mutationEvent: RecordMutationEvent) {
        // Now directly use mutationEvent for matching
        const transfers = this.transitionFinder.findTransfers(mutationEvent)
        // CAUTION 不能返回有 null 的节点，所以加上 filter。
        const allRecords = (await Promise.all(transfers.map(transfer => {
            return transfer.computeTarget!.call(this.controller, mutationEvent)
        }))).flat().filter(Boolean)
        
        // 按 id 去重，确保每个 record 在同一个事件周期内只被处理一次。
        // 这是为了防止当多个 transfers 有相同的 trigger 但不同的 current state 时，
        // 同一个 record 被多次返回导致 incrementalCompute 被多次调用的问题。
        // incrementalCompute 会根据 record 的当前状态来判断是否需要处理，
        // 如果当前状态不匹配则会 skip，所以去重后的行为是正确的。
        const seen = new Set<string>()
        return allRecords.filter((record: any) => {
            if (seen.has(record.id)) return false
            seen.add(record.id)
            return true
        })
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
