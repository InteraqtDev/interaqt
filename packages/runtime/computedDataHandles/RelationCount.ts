import {Entity, KlassInstance, Relation, RelationBasedWeightedSummation, RelationCount} from "@interaqt/shared";
import {RelationBasedWeightedSummationHandle} from "./RelationBasedWeightedSummation.js";
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {EntityIdRef} from '../System.js'


// 监听某个实体的某个关联实体以及关系上的变化，并自动 count 符合条件的关系
export class RelationCountHandle extends RelationBasedWeightedSummationHandle {
    // 只是用来转换类型
    computedData: KlassInstance<typeof RelationCount, false> = this.computedData as KlassInstance<typeof RelationCount, false>
    matchExpression!: (record: EntityIdRef, relation: EntityIdRef) => boolean
    parseComputedData(){
        const computedData = this.computedData as  KlassInstance<typeof RelationCount, false>
        this.matchExpression = computedData.match!.bind(this.controller)
        this.mapRelationToWeight = (record: EntityIdRef, relation: EntityIdRef): number=>{
            return this.matchExpression(record, relation) ? 1 : 0
        }
        this.entityName = this.dataContext.host!.name!
        this.relations = [{relation: computedData.relation, relationDirection: computedData.relationDirection}] as KlassInstance<typeof RelationBasedWeightedSummation, false>["relations"]
    }
}

ComputedDataHandle.Handles.set(RelationCount, RelationCountHandle)
