import { RealTime } from "@core";
import { Controller } from "../Controller";
import { ComputationResultPatch, ComputationResult, DataBasedComputation, DataDep, RecordBoundState, GlobalBoundState } from "./Computation";
import { RealTimeInstance, PropertyInstance } from "@core";
import { DataContext } from "./Computation.js";
import { Equation, Expression, Inequality } from "./MathResolver";
import { ComputationError } from "../errors/ComputationErrors.js";

// core 层的 nextRecomputeTime 是可选参数，但 callback 返回 Expression 时运行期必需
// （Inequality/Equation 可以用 solve() 推出下次重算时间，Expression 推不出来）。
// 这里统一做显式校验，避免运行到 `this.nextRecomputeTime!(...)` 时抛出难以定位的 TypeError。
// Inequality/Equation 不可解（solve() 返回 null/NaN）是合法状态：优先回退到用户声明的
// nextRecomputeTime，两者都没有时存 null（表示不再按时间重新调度）。
function resolveNextRecomputeTime(
    result: Expression | Inequality | Equation,
    now: number,
    dataDeps: Record<string, unknown>,
    nextRecomputeTime: ((now: number, dataDeps: Record<string, unknown>) => number) | undefined,
    contextName: string,
): number | null {
    if (result instanceof Expression) {
        if (!nextRecomputeTime) {
            throw new ComputationError(
                `RealTime computation "${contextName}" returned an Expression but has no nextRecomputeTime. Declare nextRecomputeTime when the callback returns an Expression.`,
                { computationName: 'RealTime' }
            )
        }
        return now + nextRecomputeTime(now, dataDeps)
    }
    // solve() 对多变量/不支持的表达式形态会直接 throw（而不是返回 null）；
    //  与"无解"同样处理：回退到用户声明的 nextRecomputeTime，两者都没有时给出明确错误。
    let solved: number | null | undefined
    try {
        solved = result.solve()
    } catch (error) {
        if (!nextRecomputeTime) {
            throw new ComputationError(
                `RealTime computation "${contextName}" returned an expression whose next boundary cannot be solved automatically (${error instanceof Error ? error.message : String(error)}). Declare nextRecomputeTime to schedule recomputation explicitly.`,
                { computationName: 'RealTime', causedBy: error instanceof Error ? error : undefined }
            )
        }
        return now + nextRecomputeTime(now, dataDeps)
    }
    if (solved === undefined || solved === null || Number.isNaN(solved)) {
        return nextRecomputeTime ? now + nextRecomputeTime(now, dataDeps) : null
    }
    return solved
}

export class GlobalRealTimeComputation implements DataBasedComputation {
    static computationType = RealTime
    static contextType = 'global' as const
    state!: ReturnType<typeof this.createState>
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>;
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>;
    dataDeps: {[key: string]: DataDep}
    useLastValue = false;
    callback: (now: Expression, dataDeps: Record<string, unknown>) => Promise<Expression|Inequality|Equation>
    nextRecomputeTime?: (now: number, dataDeps: Record<string, unknown>) => number

    constructor(public controller: Controller, public args: RealTimeInstance, public dataContext: DataContext) {
        this.dataDeps = (this.args.dataDeps ?? {}) as {[key: string]: DataDep};
        this.callback = (now: Expression, dataDeps: Record<string, unknown>) => {
            return this.args.callback.call(this.controller, now, dataDeps);
        };
        this.nextRecomputeTime = this.args.nextRecomputeTime ? 
            (now: number, dataDeps: Record<string, unknown>) => {
                return this.args.nextRecomputeTime!.call(this.controller, now, dataDeps);
            } : undefined;
    }
    createState() {
        return {
            lastRecomputeTime: new GlobalBoundState<number | null>(null),
            nextRecomputeTime: new GlobalBoundState<number | null>(null)
        }
    }
    
    getInitialValue() {
        return null; // Default value for global real-time computation
    }
    
    // TODO now 是不是应该用 dataDeps 动态注入？？？这样能手动测试。改成在哪里配置？
    async compute(dataDeps: {[key: string]: unknown}) : Promise<number|boolean>{
        const result = await this.args.callback(Expression.variable('now'), dataDeps) as Expression|Inequality|Equation
        const now = Date.now()

        if (!(result instanceof Expression) && !(result instanceof Inequality) && !(result instanceof Equation)) {
            throw new Error('Invalid result type');
        }
        const resultValue = result.evaluate({now});
        const nextRecomputeTime = resolveNextRecomputeTime(result, now, dataDeps, this.nextRecomputeTime, `global:${(this.dataContext.id as {name?:string})?.name ?? String(this.dataContext.id)}`)

        await this.state.lastRecomputeTime.setInternal(now);
        await this.state.nextRecomputeTime.setInternal(nextRecomputeTime);

        return resultValue;
    }
}

export class PropertyRealTimeComputation implements DataBasedComputation {
    static computationType = RealTime
    static contextType = 'property' as const
    state!: ReturnType<typeof this.createState>
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>;
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>;
    dataDeps: {[key: string]: DataDep}
    useLastValue = false;
    callback: (now: Expression, dataDeps: Record<string, unknown>) => Promise<Expression|Inequality|Equation>
    nextRecomputeTime?: (now: number, dataDeps: Record<string, unknown>) => number
    isResultNumber: boolean
    constructor(public controller: Controller, public args: RealTimeInstance, public dataContext: DataContext) {
        // _current 只有在用户声明了 attributeQuery 时才有意义：没有它无法注册任何监听
        //  （纯时间驱动的 RealTime property 计算靠 create + nextRecomputeTime 调度触发）。
        this.dataDeps = {
            ...(this.args.attributeQuery && this.args.attributeQuery.length > 0 ? {
                _current: {
                    type: 'property' as const,
                    attributeQuery: this.args.attributeQuery
                }
            } : {}),
            ...(this.args.dataDeps || {})
        }
        this.isResultNumber = (this.dataContext.id as PropertyInstance).type === 'number'
        this.callback = (now: Expression, dataDeps: Record<string, unknown>) => {
            return this.args.callback.call(this.controller, now, dataDeps);
        };
        this.nextRecomputeTime = this.args.nextRecomputeTime ? 
            (now: number, dataDeps: Record<string, unknown>) => {
                return this.args.nextRecomputeTime!.call(this.controller, now, dataDeps);
            } : undefined;
    }
    createState() {
        return {
            lastRecomputeTime: new RecordBoundState<number | null>(null),
            nextRecomputeTime: new RecordBoundState<number | null>(null)
        }
    }
    
    getInitialValue() {
        return 0; // Default value for property real-time computation
    }
    
    // TODO now 是不是应该用 dataDeps 动态注入？？？这样能手动测试。改成在哪里配置？
    async compute(dataDeps: {[key: string]: unknown}, record: any) : Promise<number|boolean>{
        const result = await this.args.callback(Expression.variable('now'), dataDeps) as Expression|Inequality|Equation
        const now = Date.now()

        if (!(result instanceof Expression) && !(result instanceof Inequality) && !(result instanceof Equation)) {
            throw new Error('Invalid result type');
        }
        const resultValue = result.evaluate({now});
        const nextRecomputeTime = resolveNextRecomputeTime(result, now, dataDeps, this.nextRecomputeTime, `property:${(this.dataContext as {host?:{name?:string}}).host?.name ?? ''}.${(this.dataContext.id as {name?:string})?.name ?? String(this.dataContext.id)}`)

        await this.state.lastRecomputeTime.setInternal(record, now);
        await this.state.nextRecomputeTime.setInternal(record, nextRecomputeTime);

        return resultValue;
    }
}

// Export RealTime computation handles
export const RealTimeHandles = [GlobalRealTimeComputation, PropertyRealTimeComputation];  