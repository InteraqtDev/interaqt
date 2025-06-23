import { ComputedDataHandle, DataContext, PropertyDataContext } from "./ComputedDataHandle.js";
import { Count, KlassInstance, Relation, Entity } from "@shared";
import { Controller } from "../Controller.js";
import { ComputationResult, DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, MatchExp } from "@storage";
import { assert } from "../util.js";

export class GlobalCountHandle implements DataBasedComputation {
    callback?: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: KlassInstance<typeof Entity|typeof Relation>

    constructor(public controller: Controller, args: KlassInstance<typeof Count>, public dataContext: DataContext) {
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
            count: new GlobalBoundState<number>(0)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<number> {
        let count: number
        
        if (this.callback) {
            // 如果有 callback，过滤符合条件的记录
            count = records.filter(item => this.callback!.call(this.controller, item, dataDeps)).length
        } else {
            // 如果没有 callback，统计所有记录
            count = records.length
        }
        
        await this.state.count.set(count)
        return count;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        let count = await this.state.count.get() || lastValue || 0;
        
        if (mutationEvent.type === 'create') {
            if (this.callback) {
                // 检查新创建的记录是否符合条件
                const itemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
                if (itemMatch) {
                    count = count + 1;
                }
            } else {
                count = count + 1;
            }
        } else if (mutationEvent.type === 'delete') {
            if (this.callback) {
                // 检查被删除的记录是否符合条件
                const itemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord, dataDeps)
                if (itemMatch) {
                    count = count - 1;
                }
            } else {
                count = count - 1;
            }
        } else if (mutationEvent.type === 'update') {
            if (this.callback) {
                // 更新时需要检查前后状态的变化
                const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord, dataDeps)
                const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
                
                if (oldItemMatch && !newItemMatch) {
                    count = count - 1;
                } else if (!oldItemMatch && newItemMatch) {
                    count = count + 1;
                }
            }
            // 如果没有 callback，update 操作不影响计数
        }
        
        // 防止计数为负数
        count = Math.max(0, count);
        await this.state.count.set(count);
        return count;
    }
}

export class PropertyCountHandle implements DataBasedComputation {
    callback?: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: KlassInstance<typeof Relation>
    relationAttributeQuery: any

    constructor(public controller: Controller, public args: KlassInstance<typeof Count>, public dataContext: PropertyDataContext) {
        this.callback = args.callback?.bind(this)
        
        // We assume in PropertyCountHandle, the records array's first element is a Relation
        this.relation = args.record as KlassInstance<typeof Relation>
        this.isSource = args.direction ? args.direction === 'source' : this.relation.source.name === dataContext.host.name
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name : this.relation.source.name
        
        this.relationAttributeQuery = args.attributeQuery || []
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: this.callback ? 
                    [[this.relationAttr, {attributeQuery: [['&', {attributeQuery: this.relationAttributeQuery}]]}]] : 
                    [[this.relationAttr, {attributeQuery: ['id']}]]
            },
            ...(args.dataDeps || {})
        }
    }

    createState() {
        return {
            count: new RecordBoundState<number>(0)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let count: number;
        
        if (this.callback) {
            // 如果有 callback，过滤符合条件的关联记录
            count = relations.filter((item: any) => 
                this.callback!.call(this.controller, item['&'], dataDeps)
            ).length;
        } else {
            // 如果没有 callback，统计所有关联记录
            count = relations.length;
        }
        
        await this.state.count.set(_current, count);
        return count;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
        if (mutationEvent.recordName !== this.dataContext.host.name) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        const relatedMutationEvent = mutationEvent.relatedMutationEvent;
        if (!relatedMutationEvent) {
            return ComputationResult.fullRecompute('No related mutation event')
        }
        let count = await this.state.count.get(mutationEvent.record) || lastValue || 0;

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name) {
            // 关联关系的新建
            if (this.callback) {
                const relationRecord = relatedMutationEvent.record!;
                const newRelationWithEntity = await this.controller.system.storage.findOne(
                    this.relation.name, 
                    MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                    undefined, 
                    this.relationAttributeQuery
                );
                
                const itemMatch = !!this.callback.call(this.controller, newRelationWithEntity, dataDeps);
                if (itemMatch) {
                    count = count + 1;
                }
            } else {
                count = count + 1;
            }
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name) {
            // 关联关系的删除
            if (this.callback) {
                // 对于删除操作，我们无法重新查询，需要依赖之前的状态或者触发全量重计算
                return ComputationResult.fullRecompute('Cannot determine callback result for deleted relation')
            } else {
                count = count - 1;
            }
        } else if (relatedMutationEvent.type === 'update' && this.callback) {
            // 关联实体或关系的更新
            return ComputationResult.fullRecompute('Complex update with callback requires full recompute')
        }

        // 防止计数为负数
        count = Math.max(0, count);
        await this.state.count.set(mutationEvent.record, count);
        return count;
    }
}

ComputedDataHandle.Handles.set(Count, {
    global: GlobalCountHandle,
    property: PropertyCountHandle
});
