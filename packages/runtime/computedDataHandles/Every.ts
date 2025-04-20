import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {Count, Every, KlassInstance, Dictionary} from "@interaqt/shared";
import {RecordMutationEvent, SYSTEM_RECORD} from "../System.js";
import { DataBasedComputation, DateDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { Controller } from "../Controller.js";
import { DataContext } from "./ComputedDataHandle.js";
import { ERRecordMutationEvent } from "../Scheduler.js";
export class GlobalEveryHandle implements DataBasedComputation {
    callback: (this: Controller, item: any) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DateDep} = {}
    defaultValue: boolean
    constructor(public controller: Controller,  args: KlassInstance<typeof Every>,  public dataContext: DataContext, ) {
        this.callback = args.callback.bind(this)
        this.dataDeps = {
            main: {
                type: 'records',
                name:args.record.name,
                attributes: args.attributes
            }
        }
        this.defaultValue = !args.notEmpty
    }

    createState() {
        return {
            matchCount: new GlobalBoundState(0),
            totalCount: new GlobalBoundState(0),
        }
    }
    
    getDefaultValue() {
        return this.defaultValue
    }

    async compute({main: records}: {main: any[]}): Promise<boolean> {
        // TODO deps

        const totalCount = await this.state.totalCount.set(records.length)
        const matchCount = await this.state.matchCount.set(records.filter(this.callback).length)

        return matchCount === totalCount
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: ERRecordMutationEvent): Promise<boolean> {
        let totalCount = await this.state!.totalCount.get()
        let matchCount = await this.state!.matchCount.get()
        if (mutationEvent.type === 'create') {
            totalCount = await this.state!.totalCount.set(totalCount + 1)
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
        } else if (mutationEvent.type === 'delete') {
            totalCount = await this.state!.totalCount.set(totalCount - 1)
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord) 
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            }
        } else if (mutationEvent.type === 'update') {
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord) 
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
        }

        return matchCount === totalCount
    }
}

export class PropertyEveryHandle extends ComputedDataHandle {
    matchCountField: string = `${this.propertyName}_match_count`
    totalCountField: string= `${this.propertyName}_total_count`
    setupSchema() {
        const computedData = this.computedData as KlassInstance<typeof Every>
        const matchCountField = `${this.stateName}_match_count`
        const totalCountField = `${this.stateName}_total_count`
        // 新赠两个 count
        const matchCountState = Dictionary.create({
            name: matchCountField,
            type: 'number',
            computedData: Count.create({
                record: computedData.record,
                callback: computedData.callback
            })
        } as any)
        
        // Use type assertion for controller.states
        const controller = this.controller as any;
        if (controller.states) {
            controller.states.push(matchCountState);
        }
        
        this.controller.addComputedDataHandle('global', matchCountState.computedData as KlassInstance<any>, undefined, matchCountField)

        const totalCountState = Dictionary.create({
            name: totalCountField,
            type: 'number',
            computedData: Count.create({
                record: computedData.record,
                callback: ()=>true
            })
        } as any)
        
        if (controller.states) {
            controller.states.push(totalCountState);
        }
        
        this.controller.addComputedDataHandle('global', totalCountState.computedData as KlassInstance<any>, undefined, totalCountField)
    }
    parseComputedData(){
        // FIXME setupSchema 里面也想用怎么办？setupSchema 是在 super.constructor 里面调用的。在那个里面 注册的话又会被
        //  默认的自己的 constructor 行为覆盖掉
        this.matchCountField = `${this.stateName}_match_count`
        this.totalCountField = `${this.stateName}_total_count`
        this.userComputeEffect = this.computeEffect
        this.userFullCompute = this.isMatchCountEqualTotalCount
    }

    getDefaultValue() {
        return true
    }

    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        // 如果是自己的 record 的上面两个字段更新，那么才要重算
        if (
            mutationEvent.recordName === SYSTEM_RECORD
            && mutationEvent.type === 'update'
            && mutationEvent.record!.concept === 'state'
            && (mutationEvent.record!.key === this.totalCountField || mutationEvent.record!.key === this.matchCountField)
        ) {
            return true
        }
    }

    async isMatchCountEqualTotalCount(effect: string) {
        const matchCountFieldCount = await this.controller.system.storage.get('state',this.matchCountField)
        const totalCountFieldCount = await this.controller.system.storage.get('state',this.totalCountField)
        return matchCountFieldCount === totalCountFieldCount
    }
}






ComputedDataHandle.Handles.set(Every, {
    global: GlobalEveryHandle,
    property: PropertyEveryHandle
})