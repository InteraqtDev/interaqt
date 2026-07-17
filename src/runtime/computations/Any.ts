import { Any, AnyInstance } from "@core";
import { Controller } from "../Controller.js";
import { DataContext, GlobalBoundState, PropertyDataContext, RecordBoundState } from "./Computation.js";
import { assertSyncCallbackResult, GlobalRecordsAggregationHandle, PropertyRelationAggregationHandle } from "./aggregationTemplate.js";

export class GlobalAnyHandle extends GlobalRecordsAggregationHandle<boolean, boolean, AnyInstance> {
    static computationType = Any
    static contextType = 'global' as const
    protected readonly itemStateKey = 'isItemMatch'
    protected readonly emptyItemValue = false

    constructor(controller: Controller, args: AnyInstance, dataContext: DataContext) {
        super(controller, args, dataContext, { computationName: 'Any', requireCallback: true })
    }

    createState() {
        return {
            matchCount: new GlobalBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.record.name!)
        }
    }

    getInitialValue() {
        return false
    }

    protected computeItemValue(record: Record<string, unknown>, dataDeps: { [key: string]: unknown }): boolean {
        return !!assertSyncCallbackResult(this.callback!.call(this.controller, record, dataDeps), 'Any', this.dataContext)
    }

    protected async applyDelta(newValue: boolean | null, oldValue: boolean | null): Promise<boolean> {
        const matchCount = await this.state.matchCount.increment(Number(!!newValue) - Number(!!oldValue))
        this.assertNonNegative('matchCount', matchCount)
        return matchCount > 0
    }

    protected async persistFullResult(values: boolean[]): Promise<boolean> {
        const matchCount = values.filter(Boolean).length
        await this.state.matchCount.setInternal(matchCount)
        return matchCount > 0
    }
}

export class PropertyAnyHandle extends PropertyRelationAggregationHandle<boolean, boolean, AnyInstance> {
    static computationType = Any
    static contextType = 'property' as const
    protected readonly itemStateKey = 'isItemMatch'
    protected readonly emptyItemValue = false

    constructor(controller: Controller, args: AnyInstance, dataContext: PropertyDataContext) {
        super(controller, args, dataContext, { computationName: 'Any', requireCallback: true, requireXToMany: true })
    }

    createState() {
        return {
            matchCount: new RecordBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.relation.name!)
        }
    }

    getInitialValue() {
        return false
    }

    protected computeItemValue(relatedItem: Record<string, unknown>, dataDeps: { [key: string]: unknown }): boolean {
        return !!assertSyncCallbackResult(this.callback!.call(this.controller, relatedItem, dataDeps), 'Any', this.dataContext)
    }

    protected async applyDelta(hostRecord: Record<string, unknown>, newValue: boolean | null, oldValue: boolean | null): Promise<boolean> {
        const matchCount = await this.state.matchCount.increment(hostRecord, Number(!!newValue) - Number(!!oldValue))
        this.assertNonNegative('matchCount', matchCount)
        return matchCount > 0
    }

    protected async persistFullResult(hostRecord: Record<string, unknown>, values: boolean[]): Promise<boolean> {
        const matchCount = values.filter(Boolean).length
        await this.state.matchCount.setInternal(hostRecord, matchCount)
        return matchCount > 0
    }
}

// Export Any computation handles
export const AnyHandles = [GlobalAnyHandle, PropertyAnyHandle];
