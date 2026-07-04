import { DataContext, PropertyDataContext, RecordBoundState, GlobalBoundState } from "./Computation.js";
import { Summation } from "@core";
import { Controller } from "../Controller.js";
import { SummationInstance, EntityInstance, RelationInstance } from "@core";
import { buildRelationSideMatchKey, ComputationResult, DataBasedComputation, DataDep, DataDepEventContext, defaultDataBasedIncrementalPlan, IncrementalPlan, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp, AttributeQueryData, LINK_SYMBOL } from "@storage";
import { assert } from "../util.js";
import { RecordQueryData } from "@storage";

export class GlobalSumHandle implements DataBasedComputation {
    static computationType = Summation
    static contextType = 'global' as const
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['main']
    record: (EntityInstance|RelationInstance)
    sumFieldPath: string[]
    constructor(public controller: Controller, public args: SummationInstance, public dataContext: DataContext) {
        this.record = this.args.record!
        
        // 获取 attributeQuery 的第一个字段作为求和字段
        if (!this.args.attributeQuery || this.args.attributeQuery.length === 0) {
            throw new Error('Sum computation requires attributeQuery with at least one field')
        }

        this.sumFieldPath = []
        let attrPointer:any = this.args.attributeQuery
        while(attrPointer) {
            this.sumFieldPath.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0]: attrPointer[0])
            attrPointer = Array.isArray(attrPointer[0]) ? attrPointer[0][1].attributeQuery : null
        }

        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery:this.args.attributeQuery
            }
        }
    }
    
    createState() {
        return {
            sum: new GlobalBoundState<number>(0),
            itemValue: new RecordBoundState<number>(0, this.record.name!)
        }   
    }
    
    getInitialValue() {
        return 0
    }

    resolveSumField(record:any, sumFieldPath = this.sumFieldPath) {
        let base:any = record
        for(let attr of sumFieldPath) {
            base = base[attr]
            if (base === undefined||base === null) return 0
        }
        return (Number.isNaN(base)||!Number.isFinite(base) ) ? 0: base
    }
    async compute({main: records}: {main: any[]}): Promise<number> {
        let sum = 0;
        
        for (const record of records) {
            const value = this.resolveSumField(record) || 0;
            sum += value;
            await this.state.itemValue.setInternal(record, value);
        }
        
        await this.state.sum.setInternal(sum)
        return sum;
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
            const newRecord = await this.controller.system.storage.findOne(this.record.name!, MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), undefined, this.args.attributeQuery)
            const value = this.resolveSumField(newRecord);
            const { oldValue } = await this.state.itemValue.replace(newRecord, value)
            delta = value - (oldValue ?? 0)
        } else if (mutationEvent.type === 'delete') {
            const oldValue = await this.state.itemValue.get(mutationEvent.record);
            delta = -(oldValue ?? 0)
            // CAUTION delete 事件可能只是 filtered entity 的成员资格退出（行仍存在），必须复位绑定状态，
            //  否则记录再次进入时 replace 读到陈旧值导致增量错误。物理删除场景 setInternal 会安全忽略。
            await this.state.itemValue.setInternal(mutationEvent.record, 0)
        } else if (mutationEvent.type === 'update') {
            const newRecord = await this.controller.system.storage.findOne(this.record.name!, MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), undefined, this.args.attributeQuery)
            const newValue = this.resolveSumField(newRecord);
            const { oldValue } = await this.state.itemValue.replace(newRecord, newValue)
            delta = newValue - (oldValue ?? 0)
        }
        
        return this.state.sum.increment(delta);
    }
}

export class PropertySumHandle implements DataBasedComputation {
    static computationType = Summation
    static contextType = 'property' as const
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
    sumFieldPath: string[]

    constructor(public controller: Controller, public args: SummationInstance, public dataContext: PropertyDataContext) {
        // Find relation by property name or fall back to record
        this.relation = this.controller.relations.find(r => (r.source === dataContext.host && r.sourceProperty === this.args.property) || (r.target === dataContext.host && r.targetProperty === this.args.property))!
        assert(this.relation, 'summation computation must specify either property or record')
        this.isSource = this.args.direction ? this.args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'summation computation relation direction error')
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        this.property = this.args.property!
        this.reverseProperty = this.isSource ? this.relation.targetProperty : this.relation.sourceProperty
        
        const attributeQuery = this.args.attributeQuery || []
        this.relatedAttributeQuery = this.args.attributeQuery?.filter(item => item[0] !== LINK_SYMBOL) || []
        const relationQuery: AttributeQueryData|undefined = ((attributeQuery.find(item => item[0] === LINK_SYMBOL)||[])[1] as RecordQueryData)?.attributeQuery
        this.relationAttributeQuery = [
            [this.isSource ? 'target' : 'source', {attributeQuery: this.relatedAttributeQuery}],
            ...(relationQuery ? relationQuery : [])
        ]
        
        // 解析 attributeQuery 获取求和字段
        
        this.sumFieldPath = []
        let attrPointer:any = attributeQuery
        while(attrPointer) {
            this.sumFieldPath.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0]: attrPointer[0])
            attrPointer = Array.isArray(attrPointer[0]) ? attrPointer[0][1].attributeQuery : null
        }
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: this.args.attributeQuery}]]
            }
        }
    }

    createState() {
        return {
            sum: new RecordBoundState<number>(0, this.dataContext.host.name),
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }    
    }
    
    getInitialValue() {
        return 0
    }
    resolveSumField(record:any, sumFieldPath = this.sumFieldPath) {
        let base:any = record
        for(let attr of sumFieldPath) {
            base = base[attr]
            if (base === undefined||base === null) return 0
        }
        return (Number.isNaN(base)||!Number.isFinite(base) ) ? 0: base
    }

    async compute({_current}: {_current: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let sum = 0;
        
        for (const relatedItem of relations) {
            const relationStateRecord = relatedItem[LINK_SYMBOL] || relatedItem['&'] || relatedItem
            const value = this.resolveSumField(relatedItem, this.sumFieldPath) || 0;
            sum += value;
            await this.state.itemResult.setInternal(relationStateRecord, value);
        }
        
        await this.state.sum.setInternal(_current, sum)
        return sum;
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

        const relatedMutationEvent = mutationEvent.relatedMutationEvent;
        if (!relatedMutationEvent) {
            return ComputationResult.fullRecompute('No related mutation event')
        }
        
        let delta = 0

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!;
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!,
                MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            
            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source'];
            relatedRecord['&'] = newRelationWithEntity;
            const value = this.resolveSumField(relatedRecord) || 0;
            const { oldValue } = await this.state.itemResult.replace(newRelationWithEntity, value);
            delta = value - (oldValue ?? 0);
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
             // 关联关系的删除
             const oldResult = await this.state!.itemResult.get(relatedMutationEvent.record);
             delta = -(oldResult ?? 0);
        } else if (relatedMutationEvent.type === 'update') {
            // relatedAttribute 是从当前 dataContext 出发
            // 现在要把匹配的 key 改成从关联关系出发。
            const relationMatchKey = buildRelationSideMatchKey(mutationEvent.relatedAttribute, this.isSource ? 'target' : 'source')
            
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!, 
                MatchExp.atom({key: relationMatchKey, value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            
            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source'];
            relatedRecord['&'] = newRelationWithEntity;
            const newValue = this.resolveSumField(relatedRecord) || 0;
            const { oldValue } = await this.state.itemResult.replace(newRelationWithEntity, newValue);
            delta = newValue - (oldValue ?? 0);
        }

        return this.state.sum.increment(mutationEvent.record, delta);
    }
}

// Export Summation computation handles
export const SummationHandles = [GlobalSumHandle, PropertySumHandle];
