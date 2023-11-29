import {ComputedDataHandle} from "./ComputedDataHandle";
import {KlassInstance, Klass} from "@interaqt/shared";
import {MatchExp} from '@interaqt/storage'
import {Entity, Property, Relation} from "@interaqt/shared";

import {RelationBasedEvery, RelationCount} from "@interaqt/shared";
import {RecordMutationEvent} from "../System";

export class RelationBasedEveryHandle extends ComputedDataHandle {
    matchCountField: string = `${this.propertyName}_match_count`
    totalCountField: string= `${this.propertyName}_total_count`
    notEmpty? :boolean
    setupSchema() {
        const computedData = this.computedData as unknown as KlassInstance<typeof RelationBasedEvery, false>
        const matchCountField = `${this.propertyName}_match_count`
        const totalCountField = `${this.propertyName}_total_count`
        // 新赠两个 count
        const matchCountProperty = Property.create({
            name: matchCountField,
            type: 'number',
            collection: false,
            computedData: RelationCount.create({
                relation: computedData.relation,
                relationDirection: computedData.relationDirection,
                matchExpression: computedData.matchExpression
            })
        })
        this.dataContext.host?.properties!.push(matchCountProperty)
        this.controller.addComputedDataHandle(matchCountProperty.computedData!, this.dataContext.host, matchCountProperty)

        const totalCountProperty = Property.create({
            name: totalCountField,
            type: 'number',
            collection: false,
            computedData: RelationCount.create({
                relation: computedData.relation,
                relationDirection: computedData.relationDirection,
                matchExpression: `()=>true`
            })
        })
        this.dataContext.host?.properties!.push(totalCountProperty)
        this.controller.addComputedDataHandle(totalCountProperty.computedData!, this.dataContext.host, totalCountProperty)
    }
    parseComputedData(){
        // FIXME setupSchema 里面也想用怎么办？setupSchema 是在 super.constructor 里面调用的。在那个里面 注册的话又会被
        //  默认的自己的 constructor 行为覆盖掉
        this.matchCountField = `${this.propertyName}_match_count`
        this.totalCountField = `${this.propertyName}_total_count`
        this.userComputeEffect = this.computeEffect
        this.userFullCompute = this.isMatchCountEqualTotalCount

        const computedData = this.computedData as unknown as KlassInstance<typeof RelationBasedEvery, false>
        this.notEmpty = computedData.notEmpty
    }

    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        // 如果是自己的 record 的上面两个字段更新，那么才要重算
        if (
            mutationEvent.recordName === this.recordName
            && mutationEvent.type === 'update'
            && mutationEvent.record!.hasOwnProperty(this.totalCountField) || mutationEvent.record!.hasOwnProperty(this.matchCountField)
        ) {
            return mutationEvent.oldRecord!.id
        }
    }

    async isMatchCountEqualTotalCount(recordId: string) {
        const match = MatchExp.atom({key: 'id', value: ['=', recordId]})
        const record = await this.controller.system.storage.findOne(this.recordName!, match, undefined, ['*'])!
        const countMatch = record[this.matchCountField] === record[this.totalCountField]
        const result =  this.notEmpty ? (countMatch && record[this.totalCountField] > 0) : countMatch
        return result
    }
}

ComputedDataHandle.Handles.set(RelationBasedEvery, RelationBasedEveryHandle)