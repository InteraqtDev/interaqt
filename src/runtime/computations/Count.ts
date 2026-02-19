import { DataContext, PropertyDataContext } from "./Computation.js";
import { Count } from "@core";
import { Controller } from "../Controller.js";
import { CountInstance, EntityInstance, RelationInstance } from "@core";
import { ComputationResult, DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp, AttributeQueryData, RecordQueryData, LINK_SYMBOL } from "@storage";
import { assert } from "../util.js";

export class GlobalCountHandle implements DataBasedComputation {
    static computationType = Count
    static contextType = 'global' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: (EntityInstance|RelationInstance)

    constructor(public controller: Controller, public args: CountInstance, public dataContext: DataContext) {
        this.record = this.args.record!
        this.callback = this.args.callback?.bind(this) || (() => true)
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: this.args.attributeQuery
            },
            ...(this.args.dataDeps || {})
        }
    }
    
    createState() {
        return {
            count: new GlobalBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.record.name!)
        }
    }
    
    getInitialValue() {
        return 0
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<number> {
        let count: number = 0
        
        for (const item of records) {
            const isMatch = this.callback!.call(this.controller, item, dataDeps)
            if (isMatch) {
                count++
            }
            await (this.state as any).isItemMatch.set(item, isMatch)
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
            // 检查新创建的记录是否符合条件
            const itemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
            if (itemMatch) {
                count = count + 1;
            }
            await (this.state as any).isItemMatch.set(mutationEvent.record, itemMatch)
        } else if (mutationEvent.type === 'delete') {
            // Get the old match status from state instead of recalculating
            const itemMatch = await (this.state as any).isItemMatch.get(mutationEvent.record)
            // Convert to boolean because database may store false as 0 or true as 1
            if (!!itemMatch) {
                count = count - 1;
            }
        } else if (mutationEvent.type === 'update') {
            // Get the old match status from state instead of recalculating
            const oldItemMatch = await (this.state as any).isItemMatch.get(mutationEvent.oldRecord)
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
            // Convert to boolean because database may store false as 0 or true as 1
            const oldItemMatchBool = !!oldItemMatch
            
            if (oldItemMatchBool && !newItemMatch) {
                count = count - 1;
            } else if (!oldItemMatchBool && newItemMatch) {
                count = count + 1;
            }
            await (this.state as any).isItemMatch.set(mutationEvent.record, newItemMatch)
        }
        
        // 防止计数为负数
        count = Math.max(0, count);
        await this.state.count.set(count);
        return count;
    }
}


type StateWithCallback = {[k:string]: RecordBoundState<boolean>}

export class PropertyCountHandle implements DataBasedComputation {
    static computationType = Count
    static contextType = 'property' as const
    callback?: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: RelationInstance
    property: string
    reverseProperty: string
    relationAttributeQuery: AttributeQueryData
    relatedAttributeQuery: AttributeQueryData

    constructor(public controller: Controller, public args: CountInstance, public dataContext: PropertyDataContext) {
        this.callback = this.args.callback?.bind(this.controller)
        
        // Find relation by property name or fall back to record
        if (this.args.property) {
            this.relation = this.controller.relations.find(r => (r.source === dataContext.host && r.sourceProperty === this.args.property) || (r.target === dataContext.host && r.targetProperty === this.args.property))!
        } else {
            this.relation = this.args.record as RelationInstance
        }
        this.isSource = this.args.direction ? this.args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'count computation relation direction error')
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        this.property = this.args.property || this.relationAttr
        this.reverseProperty = this.isSource ? this.relation.targetProperty : this.relation.sourceProperty
        
        const attributeQuery = this.args.attributeQuery || []
        this.relatedAttributeQuery = attributeQuery.filter(item => item && item[0] !== LINK_SYMBOL) || []
        const relationQuery: AttributeQueryData|undefined = ((attributeQuery.find(item => item && item[0] === LINK_SYMBOL)||[])[1] as RecordQueryData)?.attributeQuery
        this.relationAttributeQuery = [
            [this.isSource ? 'target' : 'source', {attributeQuery: this.relatedAttributeQuery}],
            ...(relationQuery ? relationQuery : [])
        ]
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: this.callback ? 
                    [[this.relationAttr, {attributeQuery: attributeQuery.length > 0 ? attributeQuery : ['id']}]] : 
                    [[this.relationAttr, {attributeQuery: ['id']}]]
            },
            ...(this.args.dataDeps || {})
        }
    }

    createState(): {}| StateWithCallback {
        return this.callback ? {
            isItemMatchCount: new RecordBoundState<boolean>(false, this.relation.name!)
        } : {}
    }
    
    getInitialValue() {
        return 0
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let count: number = 0;
        
        if (this.callback) {
            // 如果有 callback，过滤符合条件的关联记录
            for(let item of relations) {
                const isItemMatch = this.callback!.call(this.controller, item, dataDeps)
                if (isItemMatch) {
                    await (this.state as StateWithCallback).isItemMatchCount!.set(item, true)
                    count++
                } else {
                    await (this.state as StateWithCallback).isItemMatchCount!.set(item, false)
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
                
                const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source']
                relatedRecord['&'] = relationRecord
                
                const itemMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps);
                const previousMatch = await (this.state as StateWithCallback).isItemMatchCount!.get(relationRecord)
                if (itemMatch && !previousMatch) {
                    count = count + 1;
                }
                await (this.state as StateWithCallback).isItemMatchCount!.set(relationRecord, itemMatch)
            } else {
                count = count + 1;
            }
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除。
            // 注意：删除事件中只有 record（被删除的记录），没有 oldRecord
            // 这与 Every 和 Summation 的实现保持一致
            if (this.callback) {
                if((await (this.state as StateWithCallback).isItemMatchCount!.get(relatedMutationEvent.record))) {
                    count = count - 1
                }
            } else {
                count = count - 1;
            }
        } else if (relatedMutationEvent.type === 'update') {
            // 这里可能是关联关系上的更新，也可能是关联实体的更新。不管哪一种，我们都重新查询一遍。
            if(this.callback) {
                // relatedAttribute 是从当前 dataContext 出发
                // 现在要把匹配的 key 改成从关联关系出发。
                const relationMatchKey = mutationEvent.relatedAttribute[1] === LINK_SYMBOL ? 
                    mutationEvent.relatedAttribute.slice(2).concat('id').join('.') : // 从2开始就是关联关系的字段了
                    (mutationEvent.relatedAttribute.length === 1 ? 
                        `${this.isSource ? 'target' : 'source'}.id` : // 只有1个字段，就是关联实体的 id
                        `${this.isSource ? 'target' : 'source'}.${mutationEvent.relatedAttribute.slice(1).concat('id').join('.')}` // 有多个字段，就是关联实体再关联上的字段
                    )
                
                const newRelationWithEntity = await this.controller.system.storage.findOne(
                    this.relation.name!, 
                    MatchExp.atom({key: relationMatchKey, value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                    undefined, 
                    this.relationAttributeQuery
                );
                
                const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source']
                relatedRecord['&'] = newRelationWithEntity
                
                const isNewMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps);
                const isOldMatch = await (this.state as StateWithCallback).isItemMatchCount!.get(newRelationWithEntity)
                if (isNewMatch !== isOldMatch) {
                    count = isNewMatch ? (count + 1) : (count-1);
                    await (this.state as StateWithCallback).isItemMatchCount!.set(newRelationWithEntity, isNewMatch)
                }
            }
        } else {
            return ComputationResult.fullRecompute(`unknown related mutation event for ${this.dataContext.host.name}.${this.dataContext.id.name}`)
        }

        return count;
    }
}

// Export Count computation handles
export const CountHandles = [GlobalCountHandle, PropertyCountHandle];
