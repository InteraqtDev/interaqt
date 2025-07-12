import { RealTime } from "@shared";
import { Controller } from "../Controller";
import { ComputationResultPatch, ComputationResult, DataBasedComputation, RecordBoundState, GlobalBoundState } from "./Computation";
import { RealTimeInstance, PropertyInstance } from "@shared";
import { DataContext } from "./Computation.js";
import { Equation, Expression, Inequality } from "./MathResolver";

export class GlobalRealTimeComputation implements DataBasedComputation {
    static computationType = RealTime
    static contextType = 'global' as const
    state!: ReturnType<typeof this.createState>
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>;
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>;
    // RealTimeValue 没有 dataDeps
    dataDeps: {[key: string]: any}
    useLastValue = false;
    callback: (now: Expression, dataDeps: {[key: string]: any}) => Promise<Expression|Inequality|Equation>
    nextRecomputeTime?: (now: number, dataDeps: {[key: string]: any}) => number

    constructor(public controller: Controller, public args: RealTimeInstance, public dataContext: DataContext) {
        this.dataDeps = args.dataDeps ?? {};
        this.callback = (now: Expression, dataDeps: {[key: string]: any}) => {
            return (args.callback as any).call(this.controller, now, dataDeps);
        };
        this.nextRecomputeTime = args.nextRecomputeTime ? 
            (now: number, dataDeps: {[key: string]: any}) => {
                return (args.nextRecomputeTime as any).call(this.controller, now, dataDeps);
            } : undefined;
    }
    createState() {
        return {
            lastRecomputeTime: new GlobalBoundState<number>(null),
            nextRecomputeTime: new GlobalBoundState<number>(null)
        }
    }
    
    getDefaultValue() {
        return null; // Default value for global real-time computation
    }
    
    // TODO now 是不是应该用 dataDeps 动态注入？？？这样能手动测试。改成在哪里配置？
    async compute(dataDeps: {[key: string]: any}) : Promise<number|boolean>{
        const result = await this.args.callback(Expression.variable('now'), dataDeps) as Expression|Inequality|Equation
        const now = Date.now()
        let resultValue: number|boolean
        let nextRecomputeTime: number

        if (result instanceof Expression) {
            resultValue = result.evaluate({now});
            nextRecomputeTime = now + this.nextRecomputeTime!(now, dataDeps);
        } else if (result instanceof Inequality || result instanceof Equation) {
            resultValue = result.evaluate({now});
            nextRecomputeTime = result.solve()!;
        } else {
            throw new Error('Invalid result type');
        }

        await this.state.lastRecomputeTime.set(now);
        await this.state.nextRecomputeTime.set(nextRecomputeTime);

        return resultValue;
    }
}

export class PropertyRealTimeComputation implements DataBasedComputation {
    static computationType = RealTime
    static contextType = 'property' as const
    state!: ReturnType<typeof this.createState>
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>;
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>;
    // RealTimeValue 没有 dataDeps
    dataDeps: {[key: string]: any}
    useLastValue = false;
    callback: (now: Expression, dataDeps: {[key: string]: any}) => Promise<Expression|Inequality|Equation>
    nextRecomputeTime?: (now: number, dataDeps: {[key: string]: any}) => number
    isResultNumber: boolean
    constructor(public controller: Controller, public args: RealTimeInstance, public dataContext: DataContext) {
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: this.args.attributeQuery
            },
            ...(args.dataDeps || {})
        }
        this.isResultNumber = (this.dataContext.id as PropertyInstance).type === 'number'
        this.callback = (now: Expression, dataDeps: {[key: string]: any}) => {
            return (args.callback as any).call(this.controller, now, dataDeps);
        };
        this.nextRecomputeTime = args.nextRecomputeTime ? 
            (now: number, dataDeps: {[key: string]: any}) => {
                return (args.nextRecomputeTime as any).call(this.controller, now, dataDeps);
            } : undefined;
    }
    createState() {
        return {
            lastRecomputeTime: new RecordBoundState<number>(null),
            nextRecomputeTime: new RecordBoundState<number>(null)
        }
    }
    
    getDefaultValue() {
        return 0; // Default value for property real-time computation
    }
    
    // TODO now 是不是应该用 dataDeps 动态注入？？？这样能手动测试。改成在哪里配置？
    async compute(dataDeps: {[key: string]: any}, record: any) : Promise<number|boolean>{
        const result = await this.args.callback(Expression.variable('now'), dataDeps) as Expression|Inequality|Equation
        const now = Date.now()
        let resultValue: number|boolean
        let nextRecomputeTime: number

        if (result instanceof Expression) {
            resultValue = result.evaluate({now});
            nextRecomputeTime = now + this.nextRecomputeTime!(now, dataDeps);
        } else if (result instanceof Inequality || result instanceof Equation) {
            resultValue = result.evaluate({now});
            nextRecomputeTime = result.solve()!;
        } else {
            throw new Error('Invalid result type');
        }

        await this.state.lastRecomputeTime.set(record, now);
        await this.state.nextRecomputeTime.set(record, nextRecomputeTime);

        return resultValue;
    }
}

// Export RealTime computation handles
export const RealTimeHandles = [GlobalRealTimeComputation, PropertyRealTimeComputation];  