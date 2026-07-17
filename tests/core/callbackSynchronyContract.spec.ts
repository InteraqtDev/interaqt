/**
 * 回调同步性契约的机器化盘点（r35 复盘落地）。
 *
 * 动机（r35-test-blindness-retrospective §二）：`Function` 类型接受 async 函数，而框架的
 * function 声明面一半异步合法（消费点 await）、一半同步契约（返回值直接强转/落库）——
 * 两类在类型与命名上零区分。async 函数传给同步契约面时 Promise 被静默强转成错误值
 * （`!!promise===true` / `Number(promise)=NaN` / JSON 序列化 "{}"），r35 前无任何防线；
 * 手写测试永远不会「故意写错」，生成器产出的回调也天然同步——该错误类只能由
 * **声明空间的机器化枚举**覆盖。
 *
 * 机制：遍历 KlassByName 里全部注册类的 static.public，收集 type:'function' 的字段，
 * 与显式决策清单做集合相等断言：
 *  - SYNC_CONSUMED：消费点不 await（必须带 synchronous: true 元数据，声明期拒绝 async）；
 *  - ASYNC_LEGAL：消费点 await（每项注明消费点，防止误标 synchronous 造成过度收紧）。
 * 新增任何 function 声明字段而未在两个清单之一登记时，本测试失败——强制每个新字段
 * 显式回答「消费方式是什么」（维度登记册「回调契约的同步性 × 声明形态」轴的执行面）。
 */
import { describe, expect, test } from "vitest";
import 'interaqt';
import { KlassByName } from 'interaqt';

// 消费点不 await：返回 Promise 会被静默强转（klassValidation.assertSynchronousFunctionArg 拒绝）
const SYNC_CONSUMED: Record<string, string[]> = {
    Count: ['callback'],
    Every: ['callback'],
    Any: ['callback'],
    WeightedSummation: ['callback'],
    Property: ['defaultValue', 'computed'],
    Dictionary: ['defaultValue'],
    RealTimeValue: ['nextRecomputeTime'],
    Custom: ['createState', 'planIncremental'],
}

// 消费点 await（异步合法）：className.field -> 消费点锚
const ASYNC_LEGAL: Record<string, Record<string, string>> = {
    Transform: { callback: 'Transform handle: await this.transformCallback.call(...)' },
    Custom: {
        compute: 'Custom handle: await this.computeCallback.call(...)',
        incrementalCompute: 'Custom handle: await this.incrementalComputeCallback.call(...)',
        incrementalPatchCompute: 'Custom handle: await this.incrementalPatchComputeCallback.call(...)',
        getInitialValue: 'Scheduler: await computation.getInitialValue?.(...)',
        asyncReturn: 'Custom handle: await this.asyncReturnCallback.call(...)',
    },
    RealTimeValue: { callback: 'RealTime handle: await this.args.callback(...)' },
    StateNode: { computeValue: 'StateMachine: await state.computeValue.call(...)' },
    StateTransfer: { computeTarget: 'StateMachine: await transfer.computeTarget!.call(...)' },
    SideEffect: { handle: 'Controller side-effect runner: awaited post-commit' },
    Condition: { content: 'BoolExp.evaluateAsync: awaited (fail-closed)' },
    DataAttributive: { content: 'evaluateAsync: awaited' },
    Attributive: { content: 'evaluateAsync: awaited' },
    Interaction: {
        // 事件源生命周期钩子全部在 dispatch 管线内 await
        guard: 'Controller.dispatch: await eventSource.guard.call(...)',
        mapEventData: 'Controller.dispatch: await eventSource.mapEventData(...)',
        resolve: 'Controller.dispatch: await eventSource.resolve.call(...)',
        afterDispatch: 'Controller.dispatch: await afterDispatch.call(...)',
        postCommit: 'Controller.runPostCommitHook: awaited',
    },
    EventSource: {
        guard: 'Controller.dispatch: awaited',
        mapEventData: 'Controller.dispatch: awaited',
        resolve: 'Controller.dispatch: awaited',
        afterDispatch: 'Controller.dispatch: awaited',
        postCommit: 'Controller.runPostCommitHook: awaited',
    },
}

type PublicFieldDef = { type?: unknown, synchronous?: boolean }

function collectFunctionFields(): Map<string, { fields: Map<string, PublicFieldDef> }> {
    const result = new Map<string, { fields: Map<string, PublicFieldDef> }>()
    for (const [name, klass] of KlassByName.entries()) {
        const publicDef = (klass as { public?: Record<string, PublicFieldDef> }).public
        if (!publicDef) continue
        const fields = new Map<string, PublicFieldDef>()
        for (const [field, def] of Object.entries(publicDef)) {
            const typeValue = def?.type
            const isFunctionField = typeValue === 'function'
                || (Array.isArray(typeValue) && (typeValue as unknown[]).includes('function'))
            if (isFunctionField) fields.set(field, def)
        }
        if (fields.size) result.set(name, { fields })
    }
    return result
}

describe('callback synchrony contract (every function-typed declaration field must carry an explicit consumption decision)', () => {
    test('function fields are partitioned into SYNC_CONSUMED and ASYNC_LEGAL with no leftovers', () => {
        const actual = collectFunctionFields()
        expect(actual.size, 'KlassByName must be populated (import side effects)').toBeGreaterThan(0)

        const undecided: string[] = []
        const doubleDecided: string[] = []
        for (const [className, { fields }] of actual.entries()) {
            for (const field of fields.keys()) {
                const inSync = SYNC_CONSUMED[className]?.includes(field) ?? false
                const inAsync = ASYNC_LEGAL[className]?.[field] !== undefined
                if (inSync && inAsync) doubleDecided.push(`${className}.${field}`)
                if (!inSync && !inAsync) undecided.push(`${className}.${field}`)
            }
        }
        expect(doubleDecided, 'a field cannot be both sync-consumed and async-legal').toEqual([])
        expect(undecided,
            'new function-typed declaration fields must be added to SYNC_CONSUMED (consumption does not await; ' +
            'mark synchronous: true in static.public) or ASYNC_LEGAL (consumption awaits; cite the await site) — ' +
            'an undecided field is exactly how the r35 async-coercion family survived 34 review rounds'
        ).toEqual([])

        // 清单反向有效性：登记的类/字段必须真实存在（防清单腐化成僵尸豁免）
        for (const [className, fields] of Object.entries(SYNC_CONSUMED)) {
            const klass = actual.get(className)
            expect(klass, `SYNC_CONSUMED lists unknown class ${className}`).toBeTruthy()
            for (const field of fields) {
                expect(klass!.fields.has(field), `SYNC_CONSUMED lists unknown field ${className}.${field}`).toBe(true)
            }
        }
        for (const [className, fields] of Object.entries(ASYNC_LEGAL)) {
            const klass = actual.get(className)
            if (!klass) continue // 允许为未注册进 KlassByName 的类预留登记
            for (const field of Object.keys(fields)) {
                expect(klass.fields.has(field), `ASYNC_LEGAL lists unknown field ${className}.${field}`).toBe(true)
            }
        }
    })

    test('every SYNC_CONSUMED field carries synchronous: true metadata (declaration-time guard wired)', () => {
        const actual = collectFunctionFields()
        const unguarded: string[] = []
        for (const [className, fields] of Object.entries(SYNC_CONSUMED)) {
            for (const field of fields) {
                const def = actual.get(className)?.fields.get(field)
                if (!def?.synchronous) unguarded.push(`${className}.${field}`)
            }
        }
        expect(unguarded,
            'sync-consumed fields must declare synchronous: true so validateCreateArgs / ' +
            'assertSynchronousFunctionArg rejects async functions at declaration time'
        ).toEqual([])
    })
})
