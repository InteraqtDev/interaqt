import { Every, EveryInstance } from "@core";
import { Controller } from "../Controller.js";
import { DataContext, GlobalBoundState, PropertyDataContext, RecordBoundState } from "./Computation.js";
import { GlobalRecordsAggregationHandle, PropertyRelationAggregationHandle } from "./aggregationTemplate.js";

export class GlobalEveryHandle extends GlobalRecordsAggregationHandle<boolean, boolean, EveryInstance> {
    static computationType = Every
    static contextType = 'global' as const
    protected readonly itemStateKey = 'isItemMatch'
    protected readonly emptyItemValue = false
    defaultValue: boolean

    constructor(controller: Controller, args: EveryInstance, dataContext: DataContext) {
        super(controller, args, dataContext, { computationName: 'Every', requireCallback: true })
        this.defaultValue = !this.args.notEmpty
    }

    createState() {
        return {
            aggregate: new GlobalBoundState<Record<string, number>>({ matchCount: 0, totalCount: 0 }),
            isItemMatch: new RecordBoundState<boolean>(false, this.record.name!)
        }
    }

    getInitialValue() {
        return this.defaultValue
    }

    protected computeItemValue(record: Record<string, unknown>, dataDeps: { [key: string]: unknown }): boolean {
        return !!this.callback!.call(this.controller, record, dataDeps)
    }

    protected async applyDelta(newValue: boolean | null, oldValue: boolean | null, presenceDelta: 1 | 0 | -1): Promise<boolean> {
        const aggregate = await this.controller.system.storage.atomic.updateGlobalFields(
            {
                key: this.state.aggregate.key,
                valueType: 'json',
                defaultValue: { matchCount: 0, totalCount: 0 }
            },
            { matchCount: Number(!!newValue) - Number(!!oldValue), totalCount: presenceDelta },
            { matchCount: 0, totalCount: 0 }
        )
        this.assertNonNegative('matchCount', aggregate.matchCount)
        this.assertNonNegative('totalCount', aggregate.totalCount)
        // CAUTION 空集合不能返回 0 === 0 的空真（vacuous truth），必须与 getInitialValue/全量路径
        //  保持一致地返回 defaultValue，否则 notEmpty: true 的语义会被反转。
        if (aggregate.totalCount === 0) return this.defaultValue
        return aggregate.matchCount === aggregate.totalCount
    }

    protected async persistFullResult(values: boolean[]): Promise<boolean> {
        const matchCount = values.filter(Boolean).length
        const totalCount = values.length
        await this.state.aggregate.setInternal({ matchCount, totalCount })
        if (totalCount === 0) return this.defaultValue
        return matchCount === totalCount
    }
}

export class PropertyEveryHandle extends PropertyRelationAggregationHandle<boolean, boolean, EveryInstance> {
    static computationType = Every
    static contextType = 'property' as const
    protected readonly itemStateKey = 'isItemMatch'
    protected readonly emptyItemValue = false
    defaultValue: boolean

    constructor(controller: Controller, args: EveryInstance, dataContext: PropertyDataContext) {
        super(controller, args, dataContext, { computationName: 'Every', requireCallback: true, requireXToMany: true })
        this.defaultValue = !this.args.notEmpty
    }

    createState() {
        return {
            matchCount: new RecordBoundState<number>(0),
            totalCount: new RecordBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.relation.name!)
        }
    }

    getInitialValue() {
        return this.defaultValue
    }

    protected computeItemValue(relatedItem: Record<string, unknown>, dataDeps: { [key: string]: unknown }): boolean {
        return !!this.callback!.call(this.controller, relatedItem, dataDeps)
    }

    protected async applyDelta(hostRecord: Record<string, unknown>, newValue: boolean | null, oldValue: boolean | null, presenceDelta: 1 | 0 | -1): Promise<boolean> {
        const matchCount = await this.state.matchCount.increment(hostRecord, Number(!!newValue) - Number(!!oldValue))
        const totalCount = await this.state.totalCount.increment(hostRecord, presenceDelta)
        this.assertNonNegative('matchCount', matchCount)
        this.assertNonNegative('totalCount', totalCount)
        if (totalCount === 0) return this.defaultValue
        return matchCount === totalCount
    }

    protected async persistFullResult(hostRecord: Record<string, unknown>, values: boolean[]): Promise<boolean> {
        const matchCount = values.filter(Boolean).length
        const totalCount = values.length
        await this.state.matchCount.setInternal(hostRecord, matchCount)
        await this.state.totalCount.setInternal(hostRecord, totalCount)
        if (totalCount === 0) return this.defaultValue
        return matchCount === totalCount
    }
}

// Export Every computation handles
export const EveryHandles = [GlobalEveryHandle, PropertyEveryHandle];
