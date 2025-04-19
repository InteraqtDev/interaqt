import {Count, Entity, KlassInstance, Relation, WeightedSummation} from "@interaqt/shared";
import {ComputedDataHandle} from "./ComputedDataHandle.js";
import {WeightedSummationHandle} from "./WeightedSummation.js";
import {EntityIdRef} from "../System.js";


// 监听某个实体的某个关联实体以及关系上的变化，并自动 count 符合条件的关系
export class RecordCountHandle extends WeightedSummationHandle {
    // 只是用来转换类型
    matchExpression!: (record: EntityIdRef, info: KlassInstance<any>) => boolean
    parseComputedData(){
        const computedData = this.computedData as KlassInstance<typeof Count>
        this.matchExpression = (computedData.callback!).bind(this.controller)
        this.mapRecordToWeight = (record: EntityIdRef, info: KlassInstance<any>): number=>{
            return this.matchExpression(record, info) ? 1 : 0
        }
        this.records = [computedData.record!] as KlassInstance<typeof WeightedSummation>["records"]
    }
}

ComputedDataHandle.Handles.set(Count, {
    global: RecordCountHandle,
    entity: RecordCountHandle,
    relation: RecordCountHandle,
    property: RecordCountHandle
})
