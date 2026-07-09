import { Average, AverageInstance } from "@core";
import { Controller } from "../Controller.js";
import { DataContext, GlobalBoundState, PropertyDataContext, RecordBoundState } from "./Computation.js";
import { GlobalRecordsAggregationHandle, parseAggregationFieldPath, PropertyRelationAggregationHandle } from "./aggregationTemplate.js";

/**
 * CAUTION 既定语义（average.spec.ts 固化）：null/undefined/NaN/Infinity 按 0 计且计入分母。
 * 与 SQL AVG（忽略 NULL）不同；全量与增量口径一致。
 */
function resolveAvgField(record: Record<string, unknown>, avgFieldPath: string[]): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = record
    for (const attr of avgFieldPath) {
        base = base[attr]
        if (base === undefined || base === null) return 0
    }
    return (Number.isNaN(base) || !Number.isFinite(base)) ? 0 : base
}

export class GlobalAverageHandle extends GlobalRecordsAggregationHandle<number, number, AverageInstance> {
    static computationType = Average
    static contextType = 'global' as const
    protected readonly itemStateKey = 'itemValue'
    protected readonly emptyItemValue = 0
    avgFieldPath: string[]

    constructor(controller: Controller, args: AverageInstance, dataContext: DataContext) {
        super(controller, args, dataContext, { computationName: 'Average', requireAttributeQueryField: true })
        this.avgFieldPath = parseAggregationFieldPath(this.args.attributeQuery!)
    }

    createState() {
        return {
            aggregate: new GlobalBoundState<Record<string, number>>({ sum: 0, count: 0 }),
            itemValue: new RecordBoundState<number>(0, this.record.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(record: Record<string, unknown>): number {
        return resolveAvgField(record, this.avgFieldPath)
    }

    protected async applyDelta(newValue: number | null, oldValue: number | null, presenceDelta: 1 | 0 | -1): Promise<number> {
        const aggregate = await this.controller.system.storage.atomic.updateGlobalFields(
            {
                key: this.state.aggregate.key,
                valueType: 'json',
                defaultValue: { sum: 0, count: 0 }
            },
            { sum: (newValue ?? 0) - (oldValue ?? 0), count: presenceDelta },
            { sum: 0, count: 0 }
        )
        this.assertNonNegative('count', aggregate.count)
        return aggregate.count > 0 ? aggregate.sum / aggregate.count : 0
    }

    protected async persistFullResult(values: number[]): Promise<number> {
        const sum = values.reduce((acc, value) => acc + value, 0)
        const count = values.length
        await this.state.aggregate.setInternal({ sum, count })
        return count > 0 ? sum / count : 0
    }
}

export class PropertyAverageHandle extends PropertyRelationAggregationHandle<number, number, AverageInstance> {
    static computationType = Average
    static contextType = 'property' as const
    protected readonly itemStateKey = 'itemResult'
    protected readonly emptyItemValue = 0
    avgFieldPath: string[]

    constructor(controller: Controller, args: AverageInstance, dataContext: PropertyDataContext) {
        super(controller, args, dataContext, { computationName: 'Average', requireAttributeQueryField: true })
        this.avgFieldPath = parseAggregationFieldPath(this.args.attributeQuery!)
    }

    createState() {
        return {
            sum: new RecordBoundState<number>(0, this.dataContext.host.name),
            count: new RecordBoundState<number>(0, this.dataContext.host.name),
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(relatedItem: Record<string, unknown>): number {
        return resolveAvgField(relatedItem, this.avgFieldPath)
    }

    protected async applyDelta(hostRecord: Record<string, unknown>, newValue: number | null, oldValue: number | null, presenceDelta: 1 | 0 | -1): Promise<number> {
        const sum = await this.state.sum.increment(hostRecord, (newValue ?? 0) - (oldValue ?? 0))
        const count = await this.state.count.increment(hostRecord, presenceDelta)
        this.assertNonNegative('count', count)
        return count > 0 ? sum / count : 0
    }

    protected async persistFullResult(hostRecord: Record<string, unknown>, values: number[]): Promise<number> {
        const sum = values.reduce((acc, value) => acc + value, 0)
        const count = values.length
        await this.state.sum.setInternal(hostRecord, sum)
        await this.state.count.setInternal(hostRecord, count)
        return count > 0 ? sum / count : 0
    }
}

// Export Average computation handles
export const AverageHandles = [GlobalAverageHandle, PropertyAverageHandle];
