import { StateMachineInstance, StateNodeInstance } from "@core";
import { ComputationError } from "../errors/ComputationErrors.js";

/**
 * update 事件的 `record` 只携带本次实际写入的字段（changed keys + id），完整的当前状态
 * 是 `{...oldRecord, ...record}`。record 模式匹配的语义是「合并后的当前状态满足该形态」——
 * 这是 eventDep 匹配器（ComputationSourceMap.shouldTriggerEventBasedComputation）已明确
 * 实现的框架语义。StateMachine trigger 是同一声明面（RecordMutationEventPattern）的另一个
 * 读者，此前直接拿部分 record 匹配：`record: {status: 'published'}` 的 trigger 在一次只
 * 更新 title 的事件上静默不触发（status 不在 partial record 里），与 eventDep 轨道行为分裂。
 * 这里统一为合并视图。「本次更新触及了字段 X」请用 keys: ['X'] 表达。
 */
export function mergedMutationEventView(event: unknown): unknown {
    const eventObj = event as { type?: string, record?: Record<string, unknown>, oldRecord?: Record<string, unknown> } | null
    if (!eventObj || eventObj.type !== 'update' || !eventObj.oldRecord || !eventObj.record) return event
    return { ...eventObj, record: { ...eventObj.oldRecord, ...eventObj.record } }
}

/**
 * trigger 与 mutation event 的匹配入口。
 * `keys` 使用子集语义（trigger 声明的每个 key 都出现在 event.keys 中即命中），
 * 而不是 deepPartialMatch 的按下标数组匹配——trigger.keys 表达的是"本次更新触及了这些字段"。
 * update 事件的 record 按合并后的当前状态匹配（见 mergedMutationEventView）。
 */
function matchMutationEvent(event: unknown, pattern: unknown): boolean {
    const eventView = mergedMutationEventView(event)
    if (typeof pattern === 'object' && pattern !== null && 'keys' in (pattern as Record<string, unknown>)) {
        const { keys: patternKeys, ...restPattern } = pattern as Record<string, unknown>
        if (patternKeys !== undefined && patternKeys !== null) {
            const eventKeys = (event as { keys?: unknown } | null)?.keys
            if (!Array.isArray(patternKeys) || !Array.isArray(eventKeys)) return false
            if (!patternKeys.every(key => eventKeys.includes(key))) return false
        }
        return deepPartialMatch(eventView, restPattern)
    }
    return deepPartialMatch(eventView, pattern)
}

function deepPartialMatch(event: unknown, pattern: unknown): boolean {
    // CAUTION undefined pattern = "不关心该字段"（声明了键但值为 undefined 时跳过匹配）；
    //  null pattern 是精确匹配（trigger 里写 {clearedAt: null} 的意图是"该字段必须为 null"）。
    //  此前 null 也被当成"匹配任何值"，与 ComputationSourceMap.deepMatch 的精确语义相悖，
    //  声明了 null 约束的 transfer 会被任何值静默触发。
    if (pattern === undefined) return true;
    if (event === pattern) return true;
    
    // If pattern is not an object, do simple equality check
    if (typeof pattern !== 'object' || pattern === null) {
        return event === pattern;
    }
    
    // If event is not an object, it doesn't match the pattern
    if (typeof event !== 'object' || event === null) {
        return false;
    }
    
    const eventObj = event as Record<string, unknown>;
    const patternObj = pattern as Record<string, unknown>;
    for (const key in patternObj) {
        if (!(key in eventObj)) {
            return false;
        }
        if (!deepPartialMatch(eventObj[key], patternObj[key])) {
            return false;
        }
    }
    
    return true;
}


type TransitionEntry = { trigger: unknown; next: StateNodeInstance };

export class TransitionFinder {
    map: {[stateName: string]: TransitionEntry[]} = {}
    constructor(public data: StateMachineInstance) {
        for(const transfer of data.transfers) {
            if(!this.map[transfer.current.name]) {
                this.map[transfer.current.name] = []
            }
            this.map[transfer.current.name].push({
                trigger: transfer.trigger,
                next: transfer.next
            })
        }
    }

    findNextState(currentState: string, event: unknown) {
        const transitions = this.map[currentState]
        if (!transitions) return null
        const matched = transitions.filter(transition => matchMutationEvent(event, transition.trigger))
        if (matched.length === 0) return null
        // CAUTION fail fast：同一 current 状态上多条 transfer 命中同一事件是声明歧义。
        //  静默取第一条会让运行时行为与 transfers 数组顺序耦合（重构调序即改变语义），必须报错让声明者消除歧义。
        if (matched.length > 1 && matched.some(transition => transition.next !== matched[0].next)) {
            throw new ComputationError(
                `StateMachine transition is ambiguous: ${matched.length} transfers from state "${currentState}" match the same mutation event and lead to different states (${matched.map(t => `"${t.next.name}"`).join(', ')}). Make the triggers mutually exclusive (e.g. via record/keys patterns).`,
                {
                    computationName: 'StateMachine',
                    context: { currentState, matchedNextStates: matched.map(t => t.next.name) }
                }
            )
        }
        return matched[0].next
    }

    findTransfers(event: unknown) {
        return this.data.transfers.filter(transfer => matchMutationEvent(event, transfer.trigger))
    }
}