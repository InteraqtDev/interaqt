import { DataContext, PropertyDataContext } from "./Computation.js";
import { WeightedSummation } from "@core";
import { Controller } from "../Controller.js";
import { WeightedSummationInstance, EntityInstance, RelationInstance } from "@core";
import { buildRelationSideMatchKey, ComputationResult, DataDep, DataDepEventContext, defaultDataBasedIncrementalPlan, IncrementalPlan, RecordsDataDep, RecordBoundState, GlobalBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, MatchExp, LINK_SYMBOL, RecordQueryData } from "@storage";
import { assert } from "../util.js";

export class GlobalWeightedSummationHandle implements DataBasedComputation {
    static computationType = WeightedSummation
    static contextType = 'global' as const
    matchRecordToWeight: (this: Controller, item: any, dataDeps?: {[key: string]: unknown}) => { weight: number; value: number }
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['main']
    record: (EntityInstance|RelationInstance)

    constructor(public controller: Controller, public args: WeightedSummationInstance, public dataContext: DataContext) {
        this.matchRecordToWeight = this.args.callback.bind(this.controller)
        this.record = this.args.record!
        
        
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: this.args.attributeQuery
            },
            ...(this.args.dataDeps || {})
        }
    }

    
    getInitialValue() {
        return 0
    }
    createState() {
        return {
            total: new GlobalBoundState<number>(0),
            itemResult: new RecordBoundState<number>(0, this.record.name!)
        }
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<number> {
        let summation = 0;
        
        for (const record of records) {
            const weightAndValue = this.matchRecordToWeight.call(this.controller, record, dataDeps);
            summation += await this.state.itemResult.setInternal(record, weightAndValue.weight * weightAndValue.value);
        }
        await this.state.total.setInternal(summation)
        return summation;
    }

    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, _record: any, dataDeps: {[key: string]: unknown}): Promise<number|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }
        let delta = 0
        if (mutationEvent.type === 'create') {
            const newItem = mutationEvent.record;
            const weightAndValue = this.matchRecordToWeight.call(this.controller, newItem, dataDeps);
            const newResult = weightAndValue.weight * weightAndValue.value;
            const { oldValue } = await this.state.itemResult.replace(newItem, newResult);
            delta = newResult - (oldValue ?? 0);
        } else if (mutationEvent.type === 'delete') {
            const oldResult = await this.state.itemResult.get(mutationEvent.record);
            delta = -(oldResult ?? 0);
            // CAUTION delete 事件可能只是 filtered entity 的成员资格退出（行仍存在），必须复位绑定状态，
            //  否则记录再次进入时 replace 读到陈旧值导致增量错误。物理删除场景 setInternal 会安全忽略。
            await this.state.itemResult.setInternal(mutationEvent.record, 0)
        } else if (mutationEvent.type === 'update') {
            const newRecord = await this.controller.system.storage.findOne(this.record.name!, MatchExp.atom({
                key: 'id',
                value: ['=', mutationEvent.record!.id]
            }), undefined, (this.dataDeps.main as RecordsDataDep).attributeQuery);
            const newWeightAndValue = this.matchRecordToWeight.call(this.controller, newRecord, dataDeps);
            const newResult = newWeightAndValue.weight * newWeightAndValue.value;
            const { oldValue } = await this.state.itemResult.replace(newRecord, newResult);
            delta = newResult - (oldValue ?? 0);
        }

        return this.state.total.increment(delta);
    }
}

export class PropertyWeightedSummationHandle implements DataBasedComputation {
    static computationType = WeightedSummation
    static contextType = 'property' as const
    matchRecordToWeight: (this: Controller, item: any, dataDeps: {[key: string]: unknown}) => { weight: number; value: number }
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

    constructor(public controller: Controller, public args: WeightedSummationInstance, public dataContext: PropertyDataContext) {
        this.matchRecordToWeight = this.args.callback.bind(this.controller)

        // Find relation by property name
        this.relation = this.controller.relations.find(r => (r.source === dataContext.host && r.sourceProperty === this.args.property) || (r.target === dataContext.host && r.targetProperty === this.args.property))!
        assert(this.relation, 'weighted summation computation must specify property')
        this.isSource = this.args.direction ? this.args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'weighted summation computation relation direction error')
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        this.property = this.args.property || this.relationAttr
        this.reverseProperty = this.isSource ? this.relation.targetProperty : this.relation.sourceProperty
        
        const attributeQuery = this.args.attributeQuery || []
        this.relatedAttributeQuery = this.args.attributeQuery?.filter(item => item[0] !== LINK_SYMBOL) || []
        const relationQuery: AttributeQueryData|undefined = ((attributeQuery.find(item => item[0] === LINK_SYMBOL)||[])[1] as RecordQueryData)?.attributeQuery
        this.relationAttributeQuery = [
            [this.isSource ? 'target' : 'source', {attributeQuery: this.relatedAttributeQuery}],
            ...(relationQuery ? relationQuery : [])
        ]
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: this.args.attributeQuery}]]
            },
            ...(this.args.dataDeps || {})
        }
    }

    createState() {
        return {
            total: new RecordBoundState<number>(0, this.dataContext.host.name),
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }   
    }
    
    getInitialValue() {
        return 0
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let summation = 0;
        
        for (const relatedItem of relations) {
            const relationStateRecord = relatedItem[LINK_SYMBOL] || relatedItem['&'] || relatedItem
            const valueAndWeight = this.matchRecordToWeight.call(this.controller, relatedItem, dataDeps);
            const result = valueAndWeight.weight * valueAndWeight.value;
            await this.state.itemResult.setInternal(relationStateRecord, result);
            summation += result;
        }
        
        await this.state.total.setInternal(_current, summation);
        return summation;
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


        let delta = 0;
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!;

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            const newRelationWithEntity = await this.controller.system.storage.findOne(this.relation.name!, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record!.id]
            }), undefined, this.relationAttributeQuery);

            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source'];
            relatedRecord['&'] = newRelationWithEntity;
            const valueAndWeight = this.matchRecordToWeight.call(this.controller, relatedRecord, dataDeps);
            const result = valueAndWeight.weight * valueAndWeight.value;
            const { oldValue } = await this.state!.itemResult.replace(newRelationWithEntity, result);
            delta = result - (oldValue ?? 0);
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
            const newValueAndWeight = this.matchRecordToWeight.call(this.controller, relatedRecord, dataDeps);
            const newResult = newValueAndWeight.weight * newValueAndWeight.value;
            const { oldValue } = await this.state!.itemResult.replace(newRelationWithEntity, newResult);
            delta = newResult - (oldValue ?? 0);
        }

        return this.state.total.increment(mutationEvent.record, delta);
    }
}

// Export WeightedSummation computation handles
export const WeightedSummationHandles = [GlobalWeightedSummationHandle, PropertyWeightedSummationHandle];
