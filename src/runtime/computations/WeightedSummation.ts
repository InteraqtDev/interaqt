import { DataContext, PropertyDataContext } from "./Computation.js";
import { WeightedSummation } from "@shared";
import { Controller } from "../Controller.js";
import { WeightedSummationInstance, EntityInstance, RelationInstance } from "@shared";
import { ComputationResult, DataDep, RecordsDataDep, RecordBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, MatchExp, LINK_SYMBOL, RecordQueryData } from "@storage";
import { assert } from "../util.js";

export class GlobalWeightedSummationHandle implements DataBasedComputation {
    static computationType = WeightedSummation
    static contextType = 'global' as const
    matchRecordToWeight: (this: Controller, item: any) => { weight: number; value: number }
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
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
    static computationType = WeightedSummation
    static contextType = 'property' as const
    matchRecordToWeight: (this: Controller, item: any, dataDeps: {[key: string]: any}) => { weight: number; value: number }
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
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let summation = 0;
        
        for (const relatedItem of relations) {
            const valueAndWeight = this.matchRecordToWeight.call(this.controller, relatedItem, dataDeps);
            const result = valueAndWeight.weight * valueAndWeight.value;
            await this.state.itemResult.set(relatedItem, result);
            summation += result;
        }
        
        return summation;
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


        let summation = lastValue;
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
            await this.state!.itemResult.set(newRelationWithEntity, result);
            summation = summation + result;
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除
            const oldResult = await this.state!.itemResult.get(relatedMutationEvent.record);
            summation = summation - oldResult;

        } else if (relatedMutationEvent.type === 'update') {
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

            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source'];
            relatedRecord['&'] = newRelationWithEntity;
            const oldResult = await this.state!.itemResult.get(newRelationWithEntity);
            const newValueAndWeight = this.matchRecordToWeight.call(this.controller, relatedRecord, dataDeps);
            const newResult = newValueAndWeight.weight * newValueAndWeight.value;
            await this.state!.itemResult.set(newRelationWithEntity, newResult);
            summation = summation - oldResult + newResult;
        }

        return summation;
    }
}

// Export WeightedSummation computation handles
export const WeightedSummationHandles = [GlobalWeightedSummationHandle, PropertyWeightedSummationHandle];