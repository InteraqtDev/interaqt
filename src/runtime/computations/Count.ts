import { Count } from "@core";
import { Controller } from "../Controller.js";
import { CountInstance } from "@core";
import { DataContext, GlobalBoundState, PropertyDataContext, RecordBoundState } from "./Computation.js";
import { assertSyncCallbackResult, GlobalRecordsAggregationHandle, PropertyRelationAggregationHandle } from "./aggregationTemplate.js";

export class GlobalCountHandle extends GlobalRecordsAggregationHandle<boolean, number, CountInstance> {
    static computationType = Count
    static contextType = 'global' as const
    protected readonly itemStateKey = 'isItemMatch'
    protected readonly emptyItemValue = false

    constructor(controller: Controller, args: CountInstance, dataContext: DataContext) {
        super(controller, args, dataContext, { computationName: 'Count' })
    }

    createState() {
        return {
            count: new GlobalBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.record.name!)
        }
    }

    getInitialValue() {
        return 0
    }

    // 无 callback 时贡献恒为 true（计所有记录），无需回查全量记录。
    protected requiresItemFetch(): boolean {
        return !!this.args.callback
    }

    protected computeItemValue(record: Record<string, unknown>, dataDeps: { [key: string]: unknown }): boolean {
        return this.callback ? !!assertSyncCallbackResult(this.callback.call(this.controller, record, dataDeps), 'Count', this.dataContext) : true
    }

    protected async applyDelta(newValue: boolean | null, oldValue: boolean | null): Promise<number> {
        const delta = Number(!!newValue) - Number(!!oldValue)
        const count = await this.state.count.increment(delta)
        this.assertNonNegative('count', count)
        return count
    }

    protected async persistFullResult(values: boolean[]): Promise<number> {
        const count = values.filter(Boolean).length
        await this.state.count.setInternal(count)
        return count
    }
}

export class PropertyCountHandle extends PropertyRelationAggregationHandle<boolean, number, CountInstance> {
    static computationType = Count
    static contextType = 'property' as const
    protected readonly emptyItemValue = false

    constructor(controller: Controller, args: CountInstance, dataContext: PropertyDataContext) {
        super(controller, args, dataContext, { computationName: 'Count', allowRecordFallback: true })
    }

    // 无 callback 时贡献恒为「存在即 1」，无逐项状态。
    protected get itemStateKey(): string | null {
        return this.callback ? 'isItemMatchCount' : null
    }

    protected presenceItemValue(): boolean {
        return true
    }

    createState() {
        return {
            count: new RecordBoundState<number>(0, this.dataContext.host.name),
            ...(this.callback ? {
                isItemMatchCount: new RecordBoundState<boolean>(false, this.relation.name!)
            } : {})
        }
    }

    getInitialValue() {
        return 0
    }

    protected computeItemValue(relatedItem: Record<string, unknown>, dataDeps: { [key: string]: unknown }): boolean {
        return this.callback ? !!assertSyncCallbackResult(this.callback.call(this.controller, relatedItem, dataDeps), 'Count', this.dataContext) : true
    }

    protected async applyDelta(hostRecord: Record<string, unknown>, newValue: boolean | null, oldValue: boolean | null): Promise<number> {
        const delta = Number(!!newValue) - Number(!!oldValue)
        const count = await this.state.count.increment(hostRecord, delta)
        this.assertNonNegative('count', count)
        return count
    }

    protected async persistFullResult(hostRecord: Record<string, unknown>, values: boolean[]): Promise<number> {
        const count = values.filter(Boolean).length
        await this.state.count.setInternal(hostRecord, count)
        return count
    }
}

// Export Count computation handles
export const CountHandles = [GlobalCountHandle, PropertyCountHandle];
