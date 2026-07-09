import { WeightedSummation, WeightedSummationInstance } from "@core";
import { Controller } from "../Controller.js";
import { DataContext, GlobalBoundState, PropertyDataContext, RecordBoundState } from "./Computation.js";
import { GlobalRecordsAggregationHandle, PropertyRelationAggregationHandle } from "./aggregationTemplate.js";

// CAUTION 与 Summation.resolveSumField 的语义对齐：null/undefined/NaN/Infinity 一律按 0 计。
//  否则一条脏记录产生的 NaN 会通过 increment 永久污染总和，且无法通过后续增量恢复。
function resolveWeightedResult(weightAndValue: { weight: number; value: number } | null | undefined): number {
    if (!weightAndValue) return 0
    const result = Number(weightAndValue.weight) * Number(weightAndValue.value)
    return Number.isFinite(result) ? result : 0
}

export class GlobalWeightedSummationHandle extends GlobalRecordsAggregationHandle<number, number, WeightedSummationInstance> {
    static computationType = WeightedSummation
    static contextType = 'global' as const
    protected readonly itemStateKey = 'itemResult'
    protected readonly emptyItemValue = 0

    constructor(controller: Controller, args: WeightedSummationInstance, dataContext: DataContext) {
        super(controller, args, dataContext, { computationName: 'WeightedSummation', requireCallback: true })
    }

    createState() {
        return {
            total: new GlobalBoundState<number>(0),
            itemResult: new RecordBoundState<number>(0, this.record.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(record: Record<string, unknown>, dataDeps: { [key: string]: unknown }): number {
        return resolveWeightedResult(this.callback!.call(this.controller, record, dataDeps))
    }

    protected async applyDelta(newValue: number | null, oldValue: number | null): Promise<number> {
        return this.state.total.increment((newValue ?? 0) - (oldValue ?? 0))
    }

    protected async persistFullResult(values: number[]): Promise<number> {
        const total = values.reduce((acc, value) => acc + value, 0)
        await this.state.total.setInternal(total)
        return total
    }
}

export class PropertyWeightedSummationHandle extends PropertyRelationAggregationHandle<number, number, WeightedSummationInstance> {
    static computationType = WeightedSummation
    static contextType = 'property' as const
    protected readonly itemStateKey = 'itemResult'
    protected readonly emptyItemValue = 0

    constructor(controller: Controller, args: WeightedSummationInstance, dataContext: PropertyDataContext) {
        super(controller, args, dataContext, { computationName: 'WeightedSummation', requireCallback: true })
    }

    createState() {
        return {
            total: new RecordBoundState<number>(0, this.dataContext.host.name),
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(relatedItem: Record<string, unknown>, dataDeps: { [key: string]: unknown }): number {
        return resolveWeightedResult(this.callback!.call(this.controller, relatedItem, dataDeps))
    }

    protected async applyDelta(hostRecord: Record<string, unknown>, newValue: number | null, oldValue: number | null): Promise<number> {
        return this.state.total.increment(hostRecord, (newValue ?? 0) - (oldValue ?? 0))
    }

    protected async persistFullResult(hostRecord: Record<string, unknown>, values: number[]): Promise<number> {
        const total = values.reduce((acc, value) => acc + value, 0)
        await this.state.total.setInternal(hostRecord, total)
        return total
    }
}

// Export WeightedSummation computation handles
export const WeightedSummationHandles = [GlobalWeightedSummationHandle, PropertyWeightedSummationHandle];
