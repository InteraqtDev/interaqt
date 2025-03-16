import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {KlassInstance, Property, RelationBasedAny, RelationCount} from "@interaqt/shared";
import {MatchExp} from '@interaqt/storage'
import {RecordMutationEvent} from "../System.js";

export class RelationBasedAnyHandle extends ComputedDataHandle {
    matchCountField!: string
    setupSchema() {
        const computedData = this.computedData as KlassInstance<typeof RelationBasedAny>
        const matchCountField = `${this.propertyName}_match_count`
        // 新赠两个 count
        const matchCountProperty = Property.create({
            name: matchCountField,
            type: 'number',
            // Use type assertion to avoid the collection property error
            computedData: RelationCount.create({
                relation: computedData.relation,
                relationDirection: computedData.relationDirection,
                match: computedData.match
            })
        } as any)
        
        // Use type assertion to access properties
        const hostAny = this.dataContext.host as any;
        if (hostAny && hostAny.properties) {
            hostAny.properties.push(matchCountProperty);
        }
        
        this.controller.addComputedDataHandle(matchCountProperty.computedData as KlassInstance<any>, this.dataContext.host, matchCountProperty)
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
        const record = await this.controller.system.storage.findOne(this.recordName!, match, undefined, ['*'])
        return record[this.matchCountField] > 0
    }
}

ComputedDataHandle.Handles.set(RelationBasedAny, RelationBasedAnyHandle)