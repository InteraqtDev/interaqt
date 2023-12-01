import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {KlassInstance, Klass} from "@interaqt/shared";
import {MatchExp} from '@interaqt/storage'
import {Entity, Property, Relation} from "@interaqt/shared";

import {RelationBasedAny, RelationCount} from "@interaqt/shared";
import {RecordMutationEvent} from "../System.js";

export class RelationBasedAnyHandle extends ComputedDataHandle {
    matchCountField: string = `${this.propertyName}_match_count`
    setupSchema() {
        const computedData = this.computedData as KlassInstance<typeof RelationBasedAny, false>
        const matchCountField = `${this.propertyName}_match_count`
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

    }
    parseComputedData(){
        // FIXME setupSchema 里面也想用怎么办？setupSchema 是在 super.constructor 里面调用的。在那个里面 注册的话又会被
        //  默认的自己的 constructor 行为覆盖掉
        this.matchCountField = `${this.propertyName}_match_count`
        this.userComputeEffect = this.computeEffect
        this.userFullCompute = this.isMatchCountMoreThan1
    }

    getDefaultValue() {
        return false
    }

    computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
        // 如果是自己的 record 的上面两个字段更新，那么才要重算
        if (
            mutationEvent.recordName === this.recordName
            && mutationEvent.type === 'update'
            && mutationEvent.record!.hasOwnProperty(this.matchCountField)
        ) {
            return mutationEvent.oldRecord!.id
        }
    }

    async isMatchCountMoreThan1(recordId: string) {
        const match = MatchExp.atom({key: 'id', value: ['=', recordId]})
        const record = await this.controller.system.storage.findOne(this.recordName!, match, undefined, ['*'])!
        return record[this.matchCountField] > 0
    }
}

ComputedDataHandle.Handles.set(RelationBasedAny, RelationBasedAnyHandle)