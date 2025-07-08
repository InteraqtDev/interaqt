import { ComputationHandle, DataContext, PropertyDataContext } from "./ComputationHandle.js";
import { Count } from "@shared";
import { Controller } from "../Controller.js";
import { CountInstance, EntityInstance, RelationInstance } from "@shared";
import { ComputationResult, DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp } from "@storage";
import { assert } from "../util.js";

export class GlobalCountHandle implements DataBasedComputation {
    callback?: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: (EntityInstance|RelationInstance)

    constructor(public controller: Controller, args: CountInstance, public dataContext: DataContext) {
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
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
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


type StateWithCallback = {[k:string]: RecordBoundState<boolean>}

export class PropertyCountHandle implements DataBasedComputation {
    callback?: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: RelationInstance
    relationAttributeQuery: any

    constructor(public controller: Controller, public args: CountInstance, public dataContext: PropertyDataContext) {
        this.callback = args.callback?.bind(this)
        
        // We assume in PropertyCountHandle, the records array's first element is a Relation
        this.relation = args.record as RelationInstance
        this.isSource = args.direction ? args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'count computation relation direction error')
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        
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

    createState(): {}| StateWithCallback {
        return this.callback ? {
            isItemMatchCount: new RecordBoundState<boolean>(false, this.relation.name!)
        } : {}
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let count: number = 0;
        
        if (this.callback) {
            // 如果有 callback，过滤符合条件的关联记录
            for(let relation of relations) {
                const isItemMatch= this.callback!.call(this.controller, relation['&'], dataDeps)
                if (isItemMatch) {
                    (this.state as StateWithCallback).isItemMatchCount!.set(relation, true)
                    count++
                }
            }
        } else {
            // 如果没有 callback，统计所有关联记录
            count = relations.length;
        }
        
        return count;
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

        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;
        
        let count = lastValue || 0;

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            if (this.callback) {
                const relationRecord = relatedMutationEvent.record!;
                const newRelationWithEntity = await this.controller.system.storage.findOne(
                    this.relation.name!, 
                    MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                    undefined, 
                    this.relationAttributeQuery
                );
                
                const itemMatch = !!this.callback.call(this.controller, newRelationWithEntity, dataDeps);
                if (itemMatch) {
                    (this.state as StateWithCallback).isItemMatchCount!.set(newRelationWithEntity, true)
                    count = count + 1;
                }
            } else {
                count = count + 1;
            }
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除。
            if (this.callback) {
                if((await (this.state as StateWithCallback).isItemMatchCount!.get(relatedMutationEvent.oldRecord))) {
                    count = count - 1
                }
            } else {
                count = count - 1;
            }
        } else if (relatedMutationEvent.type === 'update') {
            // 这里可能是关联关系上的更新，也可能是关联实体的更新。不管哪一种，我们都重新查询一遍。
            if(this.callback) {
                const newRelationWithEntity = await this.controller.system.storage.findOne(
                    this.relation.name!, 
                    MatchExp.atom({key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'), value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                    undefined, 
                    this.relationAttributeQuery
                );
                
                const isNewMatch = !!this.callback.call(this.controller, newRelationWithEntity, dataDeps);
                const isOldMatch = await (this.state as StateWithCallback).isItemMatchCount!.get(newRelationWithEntity)
                if (isNewMatch !== isOldMatch) {
                    count = isNewMatch ? (count + 1) : (count-1);
                }
            }
        } else {
            return ComputationResult.fullRecompute(`unknown related mutation event for ${this.dataContext.host.name}.${this.dataContext.id.name}`)
        }

        return count;
    }
}

ComputationHandle.Handles.set(Count as any, {
    global: GlobalCountHandle,
    property: PropertyCountHandle
});
