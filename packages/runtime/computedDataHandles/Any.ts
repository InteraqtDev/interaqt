import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {Any, Count, KlassInstance, State} from "@interaqt/shared";
import {RecordMutationEvent, SYSTEM_RECORD} from "../System.js";

export class RelationBasedAnyHandle extends ComputedDataHandle {
    matchCountField: string = `${this.stateName}_match_count`
    setupSchema() {
        const computedData = this.computedData as KlassInstance<typeof Any, false>
        const matchCountField = `${this.stateName}_match_count`
        const matchCountState = State.create({
            name: matchCountField,
            type: 'number',
            collection: false,
            computedData: Count.create({
                record: computedData.record,
                match: computedData.match
            })
        })
        this.controller.states.push(matchCountState)
        this.controller.addComputedDataHandle(matchCountState.computedData!, undefined, matchCountField)
    }
    parseComputedData(){
        // FIXME setupSchema 里面也想用怎么办？setupSchema 是在 super.constructor 里面调用的。在那个里面 注册的话又会被
        //  默认的自己的 constructor 行为覆盖掉
        this.matchCountField = `${this.stateName}_match_count`
        this.userComputeEffect = this.computeEffect
        this.userFullCompute = this.isMatchCountMoreThan1
    }

    getDefaultValue() {
        return false
    }

    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        // 如果是自己的 record 的上面两个字段更新，那么才要重算
        if (
            mutationEvent.recordName === SYSTEM_RECORD
            && mutationEvent.type === 'update'
            && mutationEvent.record!.concept === 'state'
            && mutationEvent.record!.key === this.matchCountField
        ) {
            return mutationEvent.oldRecord!.id
        }
    }

    async isMatchCountMoreThan1(recordId: string) {
        const matchCountFieldCount = await this.controller.system.storage.get('state',this.matchCountField)
        return matchCountFieldCount > 0
    }
}

ComputedDataHandle.Handles.set(Any, RelationBasedAnyHandle)