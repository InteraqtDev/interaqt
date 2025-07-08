import { ComputationHandle, DataContext, PropertyDataContext } from "./ComputationHandle.js";
import { WeightedSummation } from "@shared";
import { Controller } from "../Controller.js";
import { WeightedSummationInstance, EntityInstance, RelationInstance } from "@shared";
import { ComputationResult, DataDep, RecordsDataDep, RecordBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, MatchExp } from "@storage";
import { assert } from "../util.js";

export class GlobalWeightedSummationHandle implements DataBasedComputation {
    matchRecordToWeight: (this: Controller, item: any) => { weight: number; value: number }
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: (EntityInstance|RelationInstance)

    constructor(public controller: Controller, args: WeightedSummationInstance, public dataContext: DataContext) {
        this.matchRecordToWeight = args.callback.bind(this)
        this.record = args.record
        
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: args.attributeQuery
            },
            ...(args.dataDeps || {})
        }
    }

    
    getDefaultValue() {
        return 0
    }
    createState() {
        return {
            itemResult: new RecordBoundState<number>(0, this.record.name!)
        }
    }

    async compute({main: records}: {main: any[]}): Promise<number> {
        let summation = 0;
        
        for (const record of records) {
            const weightAndValue = this.matchRecordToWeight.call(this.controller, record);
            summation += await this.state.itemResult.set(record, weightAndValue.weight * weightAndValue.value);
        }

        return summation;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent): Promise<number|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }
        let summation = lastValue
        if (mutationEvent.type === 'create') {
            const newItem = mutationEvent.record;
            const weightAndValue = this.matchRecordToWeight.call(this.controller, newItem);
            summation = lastValue + await this.state.itemResult.set(newItem, weightAndValue.weight * weightAndValue.value);
        } else if (mutationEvent.type === 'delete') {
            const oldResult = await this.state.itemResult.get(mutationEvent.record);
            summation = lastValue - oldResult;
        } else if (mutationEvent.type === 'update') {
            const oldResult = await this.state.itemResult.get(mutationEvent.oldRecord);

            const newRecord = await this.controller.system.storage.findOne(this.record.name!, MatchExp.atom({
                key: 'id',
                value: ['=', mutationEvent.record!.id]
            }), undefined, (this.dataDeps.main as RecordsDataDep).attributeQuery);
            const newWeightAndValue = this.matchRecordToWeight.call(this.controller, newRecord);
            const newResult = newWeightAndValue.weight * newWeightAndValue.value;
            
            summation = lastValue - oldResult + (await this.state.itemResult.set(newRecord, newResult));
        }

        return summation;
    }
}

export class PropertyWeightedSummationHandle implements DataBasedComputation {
    matchRecordToWeight: (this: Controller, item: any) => { weight: number; value: number }
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: RelationInstance
    relationAttributeQuery: AttributeQueryData

    constructor(public controller: Controller, public args: WeightedSummationInstance, public dataContext: PropertyDataContext) {
        this.matchRecordToWeight = args.callback.bind(this)

        // 我们假设在PropertyWeightedSummationHandle中，records数组的第一个元素是一个Relation
        this.relation = args.record as RelationInstance
        this.relationAttr = this.relation.source.name === dataContext.host.name ? this.relation.sourceProperty : this.relation.targetProperty
        this.isSource = this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'weighted summation computation relation direction error')
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        this.relationAttributeQuery = args.attributeQuery || []
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: [['&', {attributeQuery: this.relationAttributeQuery}]]}]]
            },
            ...(args.dataDeps || {})
        }
    }

    createState() {
        return {
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current}: {_current: any}): Promise<number> {
        // FIXME 没有验证过
        let summation = 0;
        
        for (const record of _current[this.relationAttr]) {
            const relationRecord = record['&']
            const valueAndWeight = this.matchRecordToWeight.call(this.controller, relationRecord);
            const result = valueAndWeight.weight * valueAndWeight.value;
            await this.state.itemResult.set(relationRecord, result);
            summation += result;
        }
        
        return summation;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent): Promise<number|ComputationResult> {
        // 只能支持通过 args.record 指定的关联关系或者关联实体的增量更新。
        if (
            mutationEvent.recordName !== this.dataContext.host.name ||
            !mutationEvent.relatedAttribute ||
            mutationEvent.relatedAttribute.length === 0 || 
            mutationEvent.relatedAttribute.length > 3 ||
            mutationEvent.relatedAttribute[0] !== this.relationAttr ||
            (mutationEvent.relatedAttribute[1] && mutationEvent.relatedAttribute[1] !== '&') ||
            (mutationEvent.relatedAttribute[2] && mutationEvent.relatedAttribute[2] !== (this.isSource ? 'target' : 'source'))
        ) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }


        let summation = lastValue;
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;

        if (relatedMutationEvent.type === 'create') {
            // 关联关系的新建
            const newRelationRecord = await this.controller.system.storage.findOne(this.relation.name!, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record!.id]
            }), undefined, this.relationAttributeQuery);

            const valueAndWeight = this.matchRecordToWeight.call(this.controller, newRelationRecord);
            const result = valueAndWeight.weight * valueAndWeight.value;
            await this.state!.itemResult.set(newRelationRecord, result);
            summation = summation + result;
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            const oldResult = await this.state!.itemResult.get(relatedMutationEvent.record);
            summation = summation - oldResult;

        } else if (relatedMutationEvent.type === 'update') {
            // 关联关系或者关联实体的更新
            const relationMatch = MatchExp.atom({
                key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'),
                value: ['=', relatedMutationEvent!.oldRecord!.id]
            }) 

            const newRelationRecord = await this.controller.system.storage.findOne(this.relation.name!, relationMatch, undefined, this.relationAttributeQuery);

            const oldResult = await this.state!.itemResult.get(relatedMutationEvent.oldRecord);
            const newValueAndWeight = this.matchRecordToWeight.call(this.controller, newRelationRecord);
            const newResult = newValueAndWeight.weight * newValueAndWeight.value;
                
            summation = summation - oldResult + newResult;
        }

        return summation;
    }
}

ComputationHandle.Handles.set(WeightedSummation as any, {
    global: GlobalWeightedSummationHandle,
    property: PropertyWeightedSummationHandle
});