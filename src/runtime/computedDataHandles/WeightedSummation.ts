import { ComputedDataHandle, DataContext, PropertyDataContext } from "./ComputedDataHandle.js";
import { WeightedSummation, KlassInstance, Relation, Entity } from "@shared";
import { Controller } from "../Controller.js";
import { DataDep, RecordBoundState, RelationBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, MatchExp } from "@storage";

export class GlobalWeightedSummationHandle implements DataBasedComputation {
    matchRecordToWeight: (this: Controller, item: any) => { weight: number; value: number }
    state: ReturnType<any>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: KlassInstance<typeof Entity|typeof Relation>

    constructor(public controller: Controller, args: KlassInstance<typeof WeightedSummation>, public dataContext: DataContext) {
        this.matchRecordToWeight = args.callback.bind(this)
        this.record = args.record
        
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: args.attributeQuery
            }
        }
    }

    
    getDefaultValue() {
        return 0
    }

    async compute({main: records}: {main: any[]}): Promise<number> {
        let summation = 0;
        
        for (const record of records) {
            const result = this.matchRecordToWeight.call(this.controller, record);
            summation += result.weight * result.value;
        }

        await this.state.summation.set(summation);
        return summation;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent): Promise<number> {
        let summation = lastValue
        if (mutationEvent.type === 'create') {
            const newItem = mutationEvent.record;
            const result = this.matchRecordToWeight.call(this.controller, newItem);
            summation = lastValue + (result.weight * result.value);
        } else if (mutationEvent.type === 'delete') {
            const oldItem = mutationEvent.record;
            const result = this.matchRecordToWeight.call(this.controller, oldItem);
            summation = lastValue - (result.weight * result.value);
        } else if (mutationEvent.type === 'update') {
            const oldItem = mutationEvent.oldRecord;
            const newItem = { ...mutationEvent.oldRecord, ...mutationEvent.record};
            
            const oldResult = this.matchRecordToWeight.call(this.controller, oldItem);
            const newResult = this.matchRecordToWeight.call(this.controller, newItem);
            
            const oldValue = oldResult.weight * oldResult.value;
            const newValue = newResult.weight * newResult.value;
            
            summation = lastValue - oldValue + newValue;
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
    relation: KlassInstance<typeof Relation>
    relationAttributeQuery: AttributeQueryData

    constructor(public controller: Controller, public args: KlassInstance<typeof WeightedSummation>, public dataContext: PropertyDataContext) {
        this.matchRecordToWeight = args.callback.bind(this)

        // 我们假设在PropertyWeightedSummationHandle中，records数组的第一个元素是一个Relation
        this.relation = args.record as KlassInstance<typeof Relation>
        this.relationAttr = this.relation.source.name === dataContext.host.name ? this.relation.sourceProperty : this.relation.targetProperty
        this.isSource = this.relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource ? this.relation.target.name : this.relation.source.name
        this.relationAttributeQuery = args.attributeQuery || []
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: [['&', {attributeQuery: this.relationAttributeQuery}]]}]]
            }
        }
    }

    createState() {
        return {
            summation: new RecordBoundState<number>(0),
            itemResult: new RelationBoundState<number>(0, this.relation.name)
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
        
        await this.state.summation.set(_current, summation);
        return summation;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent): Promise<number> {
        // FIXME 应该用 RelationBoundState 记录
        let summation = await this.state!.summation.get(mutationEvent.record);
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;

        if (relatedMutationEvent.type === 'create') {
            // 关联关系的新建
            const newRelationRecord = await this.controller.system.storage.findOne(this.relation.name, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record!.id]
            }), undefined, this.relationAttributeQuery);

            const valueAndWeight = this.matchRecordToWeight.call(this.controller, newRelationRecord);
            const result = valueAndWeight.weight * valueAndWeight.value;
            await this.state!.itemResult.set(newRelationRecord, result);
            summation = await this.state!.summation.set(mutationEvent.record, summation + result);
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            const oldResult = await this.state!.itemResult.get(relatedMutationEvent.record);
            summation = await this.state!.summation.set(mutationEvent.record, summation - oldResult);

        } else if (relatedMutationEvent.type === 'update') {

            const relationMatch = relatedMutationEvent?.recordName === this.relation.name ? 
                MatchExp.atom({
                    key: 'id',
                    value: ['=', relatedMutationEvent!.oldRecord!.id]
                }) : 
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', this.isSource ? mutationEvent.oldRecord!.id : relatedMutationEvent.oldRecord!.id]
                }).and({
                    key: 'target.id',
                    value: ['=', this.isSource ? relatedMutationEvent.oldRecord!.id : mutationEvent.oldRecord!.id]
                })  


            const newRelationRecord = await this.controller.system.storage.findOne(this.relation.name, relationMatch, undefined, this.relationAttributeQuery);

            const oldResult = await this.state!.itemResult.get(relatedMutationEvent.oldRecord);
            const newValueAndWeight = this.matchRecordToWeight.call(this.controller, newRelationRecord);
            const newResult = newValueAndWeight.weight * newValueAndWeight.value;
                
            summation = await this.state!.summation.set(mutationEvent.record, summation - oldResult + newResult);
        }

        return summation;
    }
}

ComputedDataHandle.Handles.set(WeightedSummation, {
    global: GlobalWeightedSummationHandle,
    property: PropertyWeightedSummationHandle
});