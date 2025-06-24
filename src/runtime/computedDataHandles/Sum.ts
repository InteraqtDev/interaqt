import { ComputedDataHandle, DataContext, PropertyDataContext } from "./ComputedDataHandle.js";
import { Sum, KlassInstance, Relation, Entity } from "@shared";
import { Controller } from "../Controller.js";
import { ComputationResult, DataBasedComputation, DataDep, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp } from "@storage";

export class GlobalSumHandle implements DataBasedComputation {
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => number
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: KlassInstance<typeof Entity|typeof Relation>

    constructor(public controller: Controller, args: KlassInstance<typeof Sum>, public dataContext: DataContext) {
        this.record = args.record
        this.callback = args.callback?.bind(this)
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: args.attributeQuery
            },
            ...(args.dataDeps || {})
        }
    }
    
    createState() {
        return {
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<number> {
        let sum = 0;
        
        for (const record of records) {
            const value = this.callback.call(this.controller, record, dataDeps);
            if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                sum += value;
            }
        }
        
        return sum;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        let sum = lastValue || 0;
        
        if (mutationEvent.type === 'create') {
            if (!mutationEvent.record) {
                return ComputationResult.fullRecompute('No record in create event');
            }
            const value = this.callback.call(this.controller, mutationEvent.record, dataDeps);
            if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                sum += value;
            }
        } else if (mutationEvent.type === 'delete') {
            if (!mutationEvent.oldRecord) {
                return ComputationResult.fullRecompute('No oldRecord in delete event');
            }
            // For delete events, use oldRecord which contains the full record before deletion
            const value = this.callback.call(this.controller, mutationEvent.oldRecord, dataDeps);
            if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                sum -= value;
            }
        } else if (mutationEvent.type === 'update') {
            // If attributeQuery is specified, we might not have all required fields
            // in the mutation event, so trigger a full recompute to be safe
            const hasAttributeQuery = (this.dataDeps.main as RecordsDataDep).attributeQuery && 
                                      (this.dataDeps.main as RecordsDataDep).attributeQuery!.length > 0;
            
            if (hasAttributeQuery) {
                return ComputationResult.fullRecompute('Update with attributeQuery requires full recompute');
            }
            
            const oldValue = this.callback.call(this.controller, mutationEvent.oldRecord, dataDeps);
            // For update events, merge oldRecord with the updated fields to get the complete new record
            const newRecord = { ...mutationEvent.oldRecord, ...mutationEvent.record };
            const newValue = this.callback.call(this.controller, newRecord, dataDeps);
            
            if (typeof oldValue === 'number' && !isNaN(oldValue) && isFinite(oldValue)) {
                sum -= oldValue;
            }
            if (typeof newValue === 'number' && !isNaN(newValue) && isFinite(newValue)) {
                sum += newValue;
            }
        }
        
        return sum;
    }
}

export class PropertySumHandle implements DataBasedComputation {
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => number
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: KlassInstance<typeof Relation>
    relationAttributeQuery: any

    constructor(public controller: Controller, public args: KlassInstance<typeof Sum>, public dataContext: PropertyDataContext) {
        this.callback = args.callback?.bind(this)
        
        // We assume in PropertySumHandle, the records array's first element is a Relation
        this.relation = args.record as KlassInstance<typeof Relation>
        this.isSource = args.direction ? args.direction === 'source' : this.relation.source.name === dataContext.host.name
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name : this.relation.source.name
        
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
            sum: new RecordBoundState<number>(0)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let sum = 0;
        
        for (const relationItem of relations) {
            const value = this.callback.call(this.controller, relationItem['&'], dataDeps);
            if (typeof value === 'number' && !isNaN(value)) {
                sum += value;
            }
        }
        
        await this.state.sum.set(_current, sum);
        return sum;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
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

        const relatedMutationEvent = mutationEvent.relatedMutationEvent;
        if (!relatedMutationEvent) {
            return ComputationResult.fullRecompute('No related mutation event')
        }
        
        let sum = await this.state.sum.get(mutationEvent.record) || lastValue || 0;

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name) {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!;
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name, 
                MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            
            const value = this.callback.call(this.controller, newRelationWithEntity, dataDeps);
            if (typeof value === 'number' && !isNaN(value)) {
                sum += value;
            }
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name) {
            // 关联关系的删除 - 需要触发全量重计算，因为我们无法获取被删除关系的详细信息
            return ComputationResult.fullRecompute('Cannot determine sum value for deleted relation')
        } else if (relatedMutationEvent.type === 'update') {
            // 关联实体或关系的更新 - 触发全量重计算以确保正确性
            return ComputationResult.fullRecompute('Complex update requires full recompute for sum calculation')
        }

        await this.state.sum.set(mutationEvent.record, sum);
        return sum;
    }
}

ComputedDataHandle.Handles.set(Sum, {
    global: GlobalSumHandle,
    property: PropertySumHandle
});