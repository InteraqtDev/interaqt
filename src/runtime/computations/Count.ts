import { DataContext, PropertyDataContext } from "./Computation.js";
import { Count } from "@core";
import { Controller } from "../Controller.js";
import { CountInstance, EntityInstance, RelationInstance } from "@core";
import { buildRelationSideMatchKey, ComputationResult, DataBasedComputation, DataDep, DataDepEventContext, defaultDataBasedIncrementalPlan, GlobalBoundState, IncrementalPlan, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp, AttributeQueryData, RecordQueryData, LINK_SYMBOL } from "@storage";
import { assert } from "../util.js";

type GlobalCountState = {
    count: GlobalBoundState<number>,
    isItemMatch: RecordBoundState<boolean>
}

export class GlobalCountHandle implements DataBasedComputation {
    static computationType = Count
    static contextType = 'global' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: unknown}) => boolean
    state!: GlobalCountState
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['main']
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
            await this.state.isItemMatch.setInternal(item, isMatch)
        }
        
        await this.state.count.setInternal(count)
        return count;
    }
    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }
    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: unknown}): Promise<number|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        let delta = 0
        if (mutationEvent.type === 'create') {
            // 检查新创建的记录是否符合条件
            const itemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
            const { oldValue } = await this.state.isItemMatch.replace(mutationEvent.record, itemMatch)
            delta = Number(itemMatch) - Number(!!oldValue)
        } else if (mutationEvent.type === 'delete') {
            const itemMatch = await this.state.isItemMatch.get(mutationEvent.record)
            delta = itemMatch ? -1 : 0
            // CAUTION delete 事件不一定意味着物理行删除：filtered entity 的成员资格退出事件里，
            //  底层行仍然存在，必须复位绑定状态，否则记录再次进入（create 事件）时 replace 会读到
            //  陈旧的 true 导致增量为 0。物理删除场景下行已不存在，setInternal 会安全地忽略。
            await this.state.isItemMatch.setInternal(mutationEvent.record, false)
        } else if (mutationEvent.type === 'update') {
            // 没有 callback 时所有记录恒匹配，字段更新不会改变计数。
            if (this.args.callback) {
                // CAUTION update 事件的 record 只携带本次变更的字段，callback 可能依赖其他字段，
                //  必须拉取全量的 new record 数据再判断（与 Any/Summation 的 update 路径一致）。
                const newRecord = await this.controller.system.storage.findOne(mutationEvent.recordName, MatchExp.atom({
                    key: 'id',
                    value: ['=', mutationEvent.record!.id]
                }), undefined, this.args.attributeQuery)
                const newItemMatch = !!this.callback.call(this.controller, newRecord, dataDeps)
                const { oldValue } = await this.state.isItemMatch.replace(newRecord, newItemMatch)
                delta = Number(newItemMatch) - Number(!!oldValue)
            }
        }
        
        const count = await this.state.count.increment(delta)
        if (count < 0) throw new Error('GlobalCount became negative')
        return count;
    }
}


type StateWithCallback = {[k:string]: RecordBoundState<boolean>}

export class PropertyCountHandle implements DataBasedComputation {
    static computationType = Count
    static contextType = 'property' as const
    callback?: (this: Controller, item: any, dataDeps?: {[key: string]: unknown}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['_current']
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

    createState(): { count: RecordBoundState<number> } | ({ count: RecordBoundState<number> } & StateWithCallback) {
        return {
            count: new RecordBoundState<number>(0, this.dataContext.host.name),
            ...(this.callback ? {
                isItemMatchCount: new RecordBoundState<boolean>(false, this.relation.name!)
            } : {})
        }
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
                const relationStateRecord = item[LINK_SYMBOL] || item['&'] || item
                const isItemMatch = this.callback!.call(this.controller, item, dataDeps)
                if (isItemMatch) {
                    await (this.state as StateWithCallback).isItemMatchCount!.setInternal(relationStateRecord, true)
                    count++
                } else {
                    await (this.state as StateWithCallback).isItemMatchCount!.setInternal(relationStateRecord, false)
                }
            }
        } else {
            // 如果没有 callback，统计所有关联记录
            count = relations.length;
        }
        
        await this.state.count.setInternal(_current, count)
        return count;
    }
    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: unknown}): Promise<number|ComputationResult> {
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
        
        let delta = 0

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
                // 关系记录在事件与增量计算之间可能已被删除（级联/竞态），退回全量重算而不是裸解引用崩溃。
                if (!newRelationWithEntity) {
                    return ComputationResult.fullRecompute(`relation record ${relationRecord.id} not found for ${this.dataContext.host.name}.${this.dataContext.id.name}`)
                }
                const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source']
                relatedRecord['&'] = relationRecord
                
                const itemMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps);
                const { oldValue } = await (this.state as StateWithCallback).isItemMatchCount!.replace(relationRecord, itemMatch)
                delta = Number(itemMatch) - Number(!!oldValue)
            } else {
                delta = 1
            }
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除。
            // 注意：删除事件中只有 record（被删除的记录），没有 oldRecord
            // 这与 Every 和 Summation 的实现保持一致
            if (this.callback) {
                if((await (this.state as StateWithCallback).isItemMatchCount!.get(relatedMutationEvent.record))) {
                    delta = -1
                }
                // CAUTION delete 事件可能只是 filtered relation 的成员资格退出（行仍存在），必须复位绑定状态，
                //  否则关系再次进入时 replace 读到陈旧值导致增量错误（与 global 路径保持一致）。
                //  物理删除场景 setInternal 会安全忽略。
                await (this.state as StateWithCallback).isItemMatchCount!.setInternal(relatedMutationEvent.record, false)
            } else {
                delta = -1;
            }
        } else if (relatedMutationEvent.type === 'update') {
            // 这里可能是关联关系上的更新，也可能是关联实体的更新。不管哪一种，我们都重新查询一遍。
            if(this.callback) {
                // relatedAttribute 是从当前 dataContext 出发
                // 现在要把匹配的 key 改成从关联关系出发。
                const relationMatchKey = buildRelationSideMatchKey(mutationEvent.relatedAttribute, this.isSource ? 'target' : 'source')
                
                const newRelationWithEntity = await this.controller.system.storage.findOne(
                    this.relation.name!, 
                    MatchExp.atom({key: relationMatchKey, value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                    undefined, 
                    this.relationAttributeQuery
                );
                if (!newRelationWithEntity) {
                    return ComputationResult.fullRecompute(`relation record not found by ${relationMatchKey} for ${this.dataContext.host.name}.${this.dataContext.id.name}`)
                }
                const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source']
                relatedRecord['&'] = newRelationWithEntity
                
                const isNewMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps);
                const { oldValue } = await (this.state as StateWithCallback).isItemMatchCount!.replace(newRelationWithEntity, isNewMatch)
                delta = Number(isNewMatch) - Number(!!oldValue)
            }
        } else {
            return ComputationResult.fullRecompute(`unknown related mutation event for ${this.dataContext.host.name}.${this.dataContext.id.name}`)
        }

        const count = await this.state.count.increment(mutationEvent.record, delta)
        if (count < 0) throw new Error('PropertyCount became negative')
        return count;
    }
}

// Export Count computation handles
export const CountHandles = [GlobalCountHandle, PropertyCountHandle];
