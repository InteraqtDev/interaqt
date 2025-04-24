import { ComputedDataHandle, DataContext, PropertyDataContext } from "./ComputedDataHandle.js";
import { WeightedSummation, KlassInstance, Relation, Entity } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { DataDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp } from "@interaqt/storage";

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

    constructor(public controller: Controller, public args: KlassInstance<typeof WeightedSummation>, public dataContext: PropertyDataContext) {
        this.matchRecordToWeight = args.callback.bind(this)

        // 我们假设在PropertyWeightedSummationHandle中，records数组的第一个元素是一个Relation
        this.relation = args.record as KlassInstance<typeof Relation>
        this.relationAttr = this.relation.source.name === dataContext.host.name ? this.relation.sourceProperty : this.relation.targetProperty
        this.isSource = this.relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource ? this.relation.target.name : this.relation.source.name
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: args.attributeQuery}]]
            }
        }
    }

    createState() {
        return {
            summation: new RecordBoundState<number>(0)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current}: {_current: any}): Promise<number> {
        let summation = 0;
        
        for (const record of _current[this.relationAttr]) {
            const result = this.matchRecordToWeight.call(this.controller, record);
            summation += result.weight * result.value;
        }
        
        await this.state.summation.set(_current, summation);
        return summation;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent): Promise<number> {
        let summation = await this.state!.summation.get(mutationEvent.record);
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;

        if (relatedMutationEvent.type === 'create') {
            // 关联关系的新建
            const newItem = await this.controller.system.storage.findOne(this.relatedRecordName, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record![this.isSource ? 'target' : 'source']!.id]
            }), undefined, ['*']);

            const result = this.matchRecordToWeight.call(this.controller, newItem);
            summation = await this.state!.summation.set(mutationEvent.record, summation + (result.weight * result.value));
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            const oldItem = await this.controller.system.storage.findOne(this.relatedRecordName, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record![this.isSource ? 'target' : 'source']!.id]
            }), undefined, ['*']);

            const result = this.matchRecordToWeight.call(this.controller, oldItem);
            summation = await this.state!.summation.set(mutationEvent.record, summation - (result.weight * result.value));
        } else if (relatedMutationEvent.type === 'update') {
            const oldRecord = relatedMutationEvent.oldRecord
            const newRecord = { ...relatedMutationEvent.oldRecord, ...relatedMutationEvent.record}
            // 关联实体的更新
            const oldResult = this.matchRecordToWeight.call(this.controller, oldRecord);
            const newResult = this.matchRecordToWeight.call(this.controller, newRecord);
            
            const oldValue = oldResult.weight * oldResult.value;
            const newValue = newResult.weight * newResult.value;
            
            summation = await this.state!.summation.set(mutationEvent.record, summation - oldValue + newValue);
        }

        return summation;
    }
}

ComputedDataHandle.Handles.set(WeightedSummation, {
    global: GlobalWeightedSummationHandle,
    property: PropertyWeightedSummationHandle
});