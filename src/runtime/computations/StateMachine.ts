import { BoolExp, StateMachine, StateMachineInstance, StateNode, StateNodeInstance } from "@core";
import { Controller } from "../Controller.js";
import { EntityIdRef, RecordMutationEvent } from '../System.js';
import { DataContext, PropertyDataContext } from "./Computation.js";
import { ComputationResult, EventBasedComputation, EventDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { TransitionFinder } from "./TransitionFinder.js";
import { assert } from "../util.js";
import { ComputationProtocolError } from "../errors/index.js";

/**
 * setup 期校验 trigger.keys：
 * - keys 只对"宿主记录自身的值属性（含 computed）更新"有效。纯关系变更（如 update({profile: {id}})）
 *   不产生宿主 update 事件，只有关系记录的 create/delete 事件——指向关系属性的 keys 是永不命中的死声明。
 * - 未声明的属性名同理永不命中（typo 会静默失效）。
 * - 空数组是 vacuous 匹配（[].every() 恒真），等价于不带 keys 却更容易误读，一律拒绝。
 * 无法解析的 recordName（系统记录等）跳过校验，交给运行期语义。
 */
function validateTriggerKeys(controller: Controller, args: StateMachineInstance, contextName: string) {
    for (const transfer of args.transfers) {
        const trigger = transfer.trigger as { recordName?: string, type?: string, keys?: unknown }
        if (!trigger || trigger.keys === undefined || !trigger.recordName) continue
        const throwProtocolError = (message: string) => {
            throw new ComputationProtocolError(
                `StateMachine ${contextName}: transfer "${transfer.current.name}" -> "${transfer.next.name}" (trigger: ${trigger.recordName} ${trigger.type}): ${message}`,
                { handleName: 'StateMachine', computationPhase: 'trigger-keys-validation' }
            )
        }
        if (!Array.isArray(trigger.keys) || trigger.keys.length === 0) {
            throwProtocolError(`trigger.keys must be a non-empty array of property names. An empty array matches every update vacuously — omit keys entirely to match any update.`)
        }
        const keys = trigger.keys as string[]

        // 收集记录的有效属性：沿 filtered 链（baseEntity/baseRelation）向下，
        // 并展开 merged entity（inputEntities）——merged entity 自身没有 properties，
        // 其有效属性是全部输入实体属性的并集。
        const recordChainNames = new Set<string>()
        const propertyNames = new Set<string>(['id'])
        const start = controller.entities.find(e => e.name === trigger.recordName)
            ?? controller.relations.find(r => r.name === trigger.recordName) as (typeof controller.entities[number] | typeof controller.relations[number] | undefined)
        if (!start) continue
        const pending: unknown[] = [start]
        const visited = new Set<unknown>()
        while (pending.length) {
            const current = pending.pop() as { name?: string, properties?: { name: string }[], baseEntity?: unknown, baseRelation?: unknown, inputEntities?: unknown[] }
            if (!current || visited.has(current)) continue
            visited.add(current)
            if (current.name) recordChainNames.add(current.name)
            for (const property of (current.properties ?? [])) propertyNames.add(property.name)
            if (current.baseEntity) pending.push(current.baseEntity)
            if (current.baseRelation) pending.push(current.baseRelation)
            for (const input of (current.inputEntities ?? [])) pending.push(input)
        }
        // 本记录（含 base 链）上的关系属性
        const relationAttributes = new Set<string>()
        for (const relation of controller.relations) {
            const sourceName = (relation.source as { name?: string } | undefined)?.name
            const targetName = (relation.target as { name?: string } | undefined)?.name
            if (sourceName && recordChainNames.has(sourceName) && relation.sourceProperty) relationAttributes.add(relation.sourceProperty)
            if (targetName && recordChainNames.has(targetName) && relation.targetProperty) relationAttributes.add(relation.targetProperty)
        }

        for (const key of keys) {
            if (propertyNames.has(key)) continue
            if (relationAttributes.has(key)) {
                throwProtocolError(`trigger.keys ["${key}"] refers to a relation attribute. Relation replacement does not emit a host update event carrying this key, so the transfer would never fire. Declare the trigger on the relation record's create/delete events instead (e.g. { recordName: '<relationName>', type: 'create' }).`)
            }
            throwProtocolError(`trigger.keys ["${key}"] does not match any declared property of "${trigger.recordName}", so the transfer would never fire. Declare the property or fix the key name.`)
        }
    }
}

type SourceTargetPair = [EntityIdRef, EntityIdRef][]
type ComputeRelationTargetResult = SourceTargetPair | {source: EntityIdRef[] | EntityIdRef, target: EntityIdRef[]|EntityIdRef} | undefined
type EntityTargetResult = EntityIdRef|EntityIdRef[]|undefined
type ComputeSourceResult = ComputeRelationTargetResult| EntityTargetResult

/**
 * 执行 StateNode.computeValue 并校验返回值。
 * CAUTION 必须拒绝 undefined：调用方（incrementalCompute）在调用本函数**之前**已通过
 *  setInternal 推进了 bound currentState，而 applyResult 对 undefined 统一 skip（r13 F-2）。
 *  若放行 undefined，本次转移就变成「内部状态已推进、可见属性没写」——状态机后续按新状态
 *  取转移，读方却仍看到旧值，两者静默脱钩且无任何告警。抛错会让整个 dispatch 事务回滚
 *  （bound state 的推进一并回滚），保持一致。保留上一个值请显式 `return lastValue`；
 *  清空请 `return null`。
 */
async function resolveComputeValue(
    controller: Controller,
    state: StateNodeInstance,
    previousValue: unknown,
    event: unknown,
    describeContext: () => string
): Promise<unknown> {
    if (!state.computeValue) return state.name
    const value = await state.computeValue.call(controller, previousValue, event)
    if (value === undefined) {
        throw new ComputationProtocolError(
            `StateMachine ${describeContext()}: computeValue of state "${state.name}" returned undefined (did you forget a return statement?). ` +
            `Return the value to persist, "return lastValue" to keep the previous value, or "return null" to clear it.`,
            { handleName: 'StateMachine', computationPhase: 'compute-value' }
        )
    }
    return value
}

/**
 * 归一化 computeTarget 的返回值为 `{id}[]`。
 * 支持的形态：`{id}`、`{id}[]`、`undefined/null`（skip）；
 * 宿主为 relation 时额外支持按端点定位：`{source, target}`（source/target 为 `{id}` 或 `{id}[]`，取笛卡尔积）
 * 与 `[[source, target], ...]` 数组对形式——这两种形态会查询 relation 记录并解析为 `{id}[]`。
 * 其他无法识别的形态一律 fail-fast：静默 skip 会让转移无声失效，极难排查。
 */
async function normalizeComputeTargetResult(
    controller: Controller,
    result: ComputeSourceResult,
    dataContext: PropertyDataContext,
    describeTransfer: () => string
): Promise<EntityIdRef[]> {
    if (result === undefined || result === null) return []
    const items = Array.isArray(result) ? result : [result]
    const hostIsRelation = controller.relations.some(r => r.name === dataContext.host.name)
    const normalized: EntityIdRef[] = []
    for (const item of items) {
        if (item === undefined || item === null) continue
        if (Array.isArray(item) || (typeof item === 'object' && 'source' in item && 'target' in item && !('id' in item))) {
            // 端点形态：[source, target] 数组对，或 {source, target} 对象
            if (!hostIsRelation) {
                throw new ComputationProtocolError(
                    `StateMachine computation of property "${dataContext.host.name}.${dataContext.id.name}" ${describeTransfer()}: computeTarget returned a {source, target} endpoint form, but the host is not a relation. Return {id} (or an array of {id}) identifying the ${dataContext.host.name} record(s) to transition.`,
                    { handleName: 'StateMachine', computationPhase: 'compute-dirty-records' }
                )
            }
            const sources = Array.isArray(item) ? [item[0]].flat() : [item.source].flat()
            const targets = Array.isArray(item) ? [item[1]].flat() : [item.target].flat()
            for (const source of sources) {
                for (const target of targets) {
                    // fail-fast：端点形态已被显式声明（{source, target}），其中缺 id 只能是
                    //  computeTarget 的实现错误。静默 continue 会让转移无声失效（与「整体返回
                    //  undefined 表示 skip」不同，那是显式的跳过契约）。
                    if (!source?.id || !target?.id) {
                        throw new ComputationProtocolError(
                            `StateMachine computation of property "${dataContext.host.name}.${dataContext.id.name}" ${describeTransfer()}: computeTarget returned an endpoint form whose ${!source?.id ? 'source' : 'target'} has no id (got ${JSON.stringify({ source, target })}). Every endpoint must be {id} (or an array of {id}); return undefined to skip the transfer explicitly.`,
                            { handleName: 'StateMachine', computationPhase: 'compute-dirty-records' }
                        )
                    }
                    const match = BoolExp.atom({ key: 'source.id', value: ['=', source.id] })
                        .and({ key: 'target.id', value: ['=', target.id] })
                    const relationRecords = await controller.system.storage.find(dataContext.host.name!, match, undefined, ['id'])
                    normalized.push(...relationRecords)
                }
            }
        } else if (typeof item === 'object' && (item as EntityIdRef).id !== undefined) {
            normalized.push(item as EntityIdRef)
        } else {
            throw new ComputationProtocolError(
                `StateMachine computation of property "${dataContext.host.name}.${dataContext.id.name}" ${describeTransfer()}: computeTarget returned an unrecognized value ${JSON.stringify(item)}. Supported forms: {id}, {id}[], undefined${hostIsRelation ? ', {source, target}, [[source, target], ...]' : ''}.`,
                { handleName: 'StateMachine', computationPhase: 'compute-dirty-records' }
            )
        }
    }
    return normalized
}

export class GlobalStateMachineHandle implements EventBasedComputation {
    static computationType = StateMachine
    static contextType = 'global' as const
    transitionFinder: TransitionFinder
    state!: {[key: string]: GlobalBoundState<any>}
    useLastValue: boolean = false
    eventDeps: {[key: string]: EventDep} = {}
    useMutationEvent: boolean = true
    initialState: StateNodeInstance
    constructor(public controller: Controller, public args: StateMachineInstance, public dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.initialState = this.args.initialState
        validateTriggerKeys(controller, args, `of global dictionary "${(dataContext.id as {name?: string})?.name ?? String(dataContext.id)}"`)
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
        return resolveComputeValue(this.controller, this.initialState, undefined, event, () => this.describeContext())
    }
    private describeContext() {
        return `of global dictionary "${(this.dataContext.id as {name?: string})?.name ?? String(this.dataContext.id)}"`
    }
    async incrementalCompute(lastValue: string, mutationEvent: EtityMutationEvent, dirtyRecord: any) {
        // Now we can handle any mutationEvent, not just interaction events
        const currentStateName = (await this.state.currentState.lock()) ?? this.initialState.name
        const nextState = this.transitionFinder?.findNextState(currentStateName, mutationEvent)
        if (!nextState) return ComputationResult.skip()

        await this.state.currentState.setInternal(nextState.name)

        const previousValue = await this.controller.retrieveLastValue(this.dataContext)
        return resolveComputeValue(this.controller, nextState, previousValue, mutationEvent, () => this.describeContext())
    }
}


export class PropertyStateMachineHandle implements EventBasedComputation {
    static computationType = StateMachine
    static contextType = 'property' as const
    transitionFinder: TransitionFinder
    state!: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    useLastValue: boolean = false
    eventDeps: {[key: string]: EventDep} = {}
    initialState: StateNodeInstance
    dataContext: PropertyDataContext
    useMutationEvent: boolean = true
    constructor(public controller: Controller, public args: StateMachineInstance, dataContext: DataContext) {
        this.transitionFinder = new TransitionFinder(this.args)
        this.initialState = this.args.initialState
        this.dataContext = dataContext as PropertyDataContext
        validateTriggerKeys(controller, args, `of property "${this.dataContext.host.name}.${this.dataContext.id.name}"`)
        // 从所有 transfer 中构建 eventDeps
        // 特别注意，这里不能用系统默认的 eventDeps 深度匹配机制。
        // 因为可能有多个 transfer 都是同样的 trigger。
        // 使用的系统的 eventDeps 会执行完一个再执行另一个，这时有可能刚好记录转换成下一个状态，结果又被匹配中了。进行下一次转换。
        for(const transfer of this.args.transfers) {
            // fail fast：属性 StateMachine 靠 computeTarget 定位要转移的宿主记录，
            // 缺失时如果等到运行期第一次触发才报 undefined.call 会非常难排查。
            assert(
                typeof transfer.computeTarget === 'function',
                `StateMachine computation of property "${this.dataContext.host.name}.${this.dataContext.id.name}": transfer "${transfer.current.name}" -> "${transfer.next.name}" (trigger: ${transfer.trigger.recordName} ${transfer.trigger.type}) must define computeTarget. computeTarget maps a matched mutation event to the record(s) whose "${this.dataContext.id.name}" should transition, e.g. computeTarget: (event) => ({ id: event.record.id })`
            )
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
        return resolveComputeValue(this.controller, this.initialState, lastValue, undefined, () => this.describeContext())
    }
    private describeContext() {
        return `of property "${this.dataContext.host.name}.${this.dataContext.id.name}"`
    }
    async computeDirtyRecords(mutationEvent: RecordMutationEvent) {
        // Now directly use mutationEvent for matching
        const transfers = this.transitionFinder.findTransfers(mutationEvent)
        // CAUTION computeTarget 的返回形态必须归一化为 {id}[]：
        //  {source, target} / [[source, target]] 端点形态（relation 宿主）需要解析成 relation 记录，
        //  直接 .flat() 会把整个对象保留下来（record.id === undefined），lock 失败后静默 skip——转移无声失效。
        const allRecords = (await Promise.all(transfers.map(async transfer => {
            const raw = await transfer.computeTarget!.call(this.controller, mutationEvent) as ComputeSourceResult
            return normalizeComputeTargetResult(
                this.controller, raw, this.dataContext,
                () => `(transfer "${transfer.current.name}" -> "${transfer.next.name}", trigger: ${transfer.trigger.recordName} ${transfer.trigger.type})`
            )
        }))).flat()
        
        // 按 id 去重，确保每个 record 在同一个事件周期内只被处理一次。
        // 这是为了防止当多个 transfers 有相同的 trigger 但不同的 current state 时，
        // 同一个 record 被多次返回导致 incrementalCompute 被多次调用的问题。
        // incrementalCompute 会根据 record 的当前状态来判断是否需要处理，
        // 如果当前状态不匹配则会 skip，所以去重后的行为是正确的。
        // CAUTION id 一律 String 归一后判等：不同 transfer 的 computeTarget 可能分别返回
        //  用户载荷形态（字符串 id）与存储查询形态（驱动原生 id），裸值 Set 判不等时
        //  同一记录被处理两次——一次事件连走两个状态（与写路径 sameRecordId 同族的身份判定）。
        const seen = new Set<string>()
        return allRecords.filter((record: any) => {
            const idKey = String(record.id)
            if (seen.has(idKey)) return false
            seen.add(idKey)
            return true
        })
    }
    
    async incrementalCompute(lastValue: string, mutationEvent: RecordMutationEvent, dirtyRecord: any) {
        // Now we can handle any mutationEvent, not just interaction events
        const lockedRecord = await this.state.currentState.lock(dirtyRecord, ['*'])
        if (!lockedRecord) return ComputationResult.skip()
        const currentStateName = (lockedRecord[this.state.currentState.key] ?? this.initialState.name) as string
        const nextState = this.transitionFinder?.findNextState(currentStateName, mutationEvent)
        if (!nextState) return ComputationResult.skip()

        await this.state.currentState.setInternal(lockedRecord, nextState.name)
        const previousValue = lockedRecord[this.dataContext.id.name]
        return resolveComputeValue(this.controller, nextState, previousValue, mutationEvent, () => this.describeContext())
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
