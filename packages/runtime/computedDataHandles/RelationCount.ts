import {KlassInstance} from "@interaqt/shared";
import {
    RelationCount, RelationBasedWeightedSummation,
} from '@interaqt/shared'
import {RelationBasedWeightedSummationHandle} from "./RelationBasedWeightedSummation";
import {ComputedDataHandle} from "./ComputedDataHandle";


// 监听某个实体的某个关联实体以及关系上的变化，并自动 count 符合条件的关系
export class RelationCountHandle extends RelationBasedWeightedSummationHandle {
    // 只是用来转换类型
    computedData: KlassInstance<typeof RelationCount, false> = this.computedData as KlassInstance<typeof RelationCount, false>
    parseComputedData(){
        const computedData = this.computedData as  KlassInstance<typeof RelationCount, false>
        this.mapRelationToWeight = this.parseMatchRelationFunction(computedData.matchExpression!).bind(this.controller)
        this.entityName = this.dataContext.host!.name!
        this.relations = [{relation: computedData.relation, relationDirection: computedData.relationDirection}] as KlassInstance<typeof RelationBasedWeightedSummation, false>["relations"]
    }
    parseMatchRelationFunction(stringContent:string) {
        return new Function('record', 'relation',`return (${stringContent})(record, relation) ? 1 : 0`)
    }
}

ComputedDataHandle.Handles.set(RelationCount, RelationCountHandle)
