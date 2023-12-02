import {Entity, KlassInstance, Relation} from "@interaqt/shared";
import {
    RelationCount, RelationBasedWeightedSummation,
} from '@interaqt/shared'
import {RelationBasedWeightedSummationHandle} from "./RelationBasedWeightedSummation.js";
import {ComputedDataHandle} from "./ComputedDataHandle.js";


// 监听某个实体的某个关联实体以及关系上的变化，并自动 count 符合条件的关系
export class RelationCountHandle extends RelationBasedWeightedSummationHandle {
    // 只是用来转换类型
    computedData: KlassInstance<typeof RelationCount, false> = this.computedData as KlassInstance<typeof RelationCount, false>
    matchExpression!: (record: KlassInstance<typeof Entity, false>, relation: KlassInstance<typeof Relation, false>) => boolean
    parseComputedData(){
        const computedData = this.computedData as  KlassInstance<typeof RelationCount, false>
        this.matchExpression = computedData.matchExpression!.bind(this.controller)
        this.mapRelationToWeight = (record: KlassInstance<typeof Entity, false>, relation: KlassInstance<typeof Relation, false>): number=>{
            return this.matchExpression(record, relation) ? 1 : 0
        }
        this.entityName = this.dataContext.host!.name!
        this.relations = [{relation: computedData.relation, relationDirection: computedData.relationDirection}] as KlassInstance<typeof RelationBasedWeightedSummation, false>["relations"]
    }
}

ComputedDataHandle.Handles.set(RelationCount, RelationCountHandle)
