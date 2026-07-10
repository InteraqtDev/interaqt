import { Summation } from "@core";
import { Controller } from "../Controller.js";
import { SummationInstance } from "@core";
import { DataContext, describeDataContext, GlobalBoundState, PropertyDataContext, RecordBoundState } from "./Computation.js";
import { GlobalRecordsAggregationHandle, parseAggregationFieldPath, PropertyRelationAggregationHandle } from "./aggregationTemplate.js";

/** null/undefined/NaN/Infinity 一律按 0 计，避免一条脏记录通过 increment 永久污染总和。 */
function resolveSumField(record: Record<string, unknown>, sumFieldPath: string[]): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = record
    for (const attr of sumFieldPath) {
        base = base[attr]
        if (base === undefined || base === null) return 0
    }
    return (Number.isNaN(base) || !Number.isFinite(base)) ? 0 : base
}

export class GlobalSumHandle extends GlobalRecordsAggregationHandle<number, number, SummationInstance> {
    static computationType = Summation
    static contextType = 'global' as const
    protected readonly itemStateKey = 'itemValue'
    protected readonly emptyItemValue = 0
    sumFieldPath: string[]

    constructor(controller: Controller, args: SummationInstance, dataContext: DataContext) {
        super(controller, args, dataContext, { computationName: 'Summation', requireAttributeQueryField: true })
        this.sumFieldPath = parseAggregationFieldPath(this.args.attributeQuery!, () => `Summation computation of ${describeDataContext(dataContext)}`)
    }

    createState() {
        return {
            sum: new GlobalBoundState<number>(0),
            itemValue: new RecordBoundState<number>(0, this.record.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(record: Record<string, unknown>): number {
        return resolveSumField(record, this.sumFieldPath)
    }

    protected async applyDelta(newValue: number | null, oldValue: number | null): Promise<number> {
        return this.state.sum.increment((newValue ?? 0) - (oldValue ?? 0))
    }

    protected async persistFullResult(values: number[]): Promise<number> {
        const sum = values.reduce((acc, value) => acc + value, 0)
        await this.state.sum.setInternal(sum)
        return sum
    }
}

export class PropertySumHandle extends PropertyRelationAggregationHandle<number, number, SummationInstance> {
    static computationType = Summation
    static contextType = 'property' as const
    protected readonly itemStateKey = 'itemResult'
    protected readonly emptyItemValue = 0
    sumFieldPath: string[]

    constructor(controller: Controller, args: SummationInstance, dataContext: PropertyDataContext) {
        super(controller, args, dataContext, { computationName: 'Summation', requireAttributeQueryField: true })
        this.sumFieldPath = parseAggregationFieldPath(this.args.attributeQuery!, () => `Summation computation of ${describeDataContext(dataContext)}`)
    }

    createState() {
        return {
            sum: new RecordBoundState<number>(0, this.dataContext.host.name),
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(relatedItem: Record<string, unknown>): number {
        return resolveSumField(relatedItem, this.sumFieldPath)
    }

    protected async applyDelta(hostRecord: Record<string, unknown>, newValue: number | null, oldValue: number | null): Promise<number> {
        return this.state.sum.increment(hostRecord, (newValue ?? 0) - (oldValue ?? 0))
    }

    protected async persistFullResult(hostRecord: Record<string, unknown>, values: number[]): Promise<number> {
        const sum = values.reduce((acc, value) => acc + value, 0)
        await this.state.sum.setInternal(hostRecord, sum)
        return sum
    }
}

// Export Summation computation handles
export const SummationHandles = [GlobalSumHandle, PropertySumHandle];
