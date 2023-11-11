import {KlassInstanceOf} from "../../shared/createClass";
import {
    Count,
} from '../../shared/IncrementalComputation'
import {ComputedDataHandle} from "./ComputedDataHandle";
import {WeightedSummationHandle} from "./WeightedSummation";


// 监听某个实体的某个关联实体以及关系上的变化，并自动 count 符合条件的关系
export class RecordCountHandle extends WeightedSummationHandle {
    // 只是用来转换类型
    parseComputedData(){
        const computedData = this.computedData as  KlassInstanceOf<typeof Count, false>
        this.mapRelationToWeight = this.parseMatchRelationFunction(computedData.matchExpression!).bind(this.controller)
        this.records = [computedData.record!]
    }
    parseMatchRelationFunction(stringContent:string) {
        return new Function('record', `return (${stringContent})(record) ? 1 : 0`)
    }
}

ComputedDataHandle.Handles.set(Count, RecordCountHandle)
