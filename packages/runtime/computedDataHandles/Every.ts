import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {Count, Every, KlassInstance, State} from "@interaqt/shared";
import {RecordMutationEvent, SYSTEM_RECORD} from "../System.js";

export class EveryHandle extends ComputedDataHandle {
    matchCountField: string = `${this.propertyName}_match_count`
    totalCountField: string= `${this.propertyName}_total_count`
    setupSchema() {
        const computedData = this.computedData as KlassInstance<typeof Every>
        const matchCountField = `${this.stateName}_match_count`
        const totalCountField = `${this.stateName}_total_count`
        // 新赠两个 count
        const matchCountState = State.create({
            name: matchCountField,
            type: 'number',
            computedData: Count.create({
                record: computedData.record,
                match: computedData.match
            })
        } as any)
        
        // Use type assertion for controller.states
        const controller = this.controller as any;
        if (controller.states) {
            controller.states.push(matchCountState);
        }
        
        this.controller.addComputedDataHandle('global', matchCountState.computedData as KlassInstance<any>, undefined, matchCountField)

        const totalCountState = State.create({
            name: totalCountField,
            type: 'number',
            computedData: Count.create({
                record: computedData.record,
                match: ()=>true
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
    global: EveryHandle,
    entity: EveryHandle,
    relation: EveryHandle,
    property: EveryHandle
})