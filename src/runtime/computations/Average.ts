import { DataContext, PropertyDataContext } from "./Computation.js";
import { Average, AverageInstance, RelationInstance, EntityInstance } from "@shared";
import { Controller } from "../Controller.js";
import { ComputationResult, DataBasedComputation, DataDep, RecordBoundState, GlobalBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp, AttributeQueryData, RecordQueryData, LINK_SYMBOL } from "@storage";
import { assert } from "../util.js";

export class GlobalAverageHandle implements DataBasedComputation {
    static computationType = Average
    static contextType = 'global' as const
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: (EntityInstance|RelationInstance)
    avgFieldPath: string[]
    
    constructor(public controller: Controller, public args: AverageInstance, public dataContext: DataContext) {
        this.record = this.args.record!
        
        // 获取 attributeQuery 的第一个字段作为平均值计算字段
        if (!this.args.attributeQuery || this.args.attributeQuery.length === 0) {
            throw new Error('Average computation requires attributeQuery with at least one field')
        }

        this.avgFieldPath = []
        let attrPointer:any = this.args.attributeQuery
        while(attrPointer) {
            this.avgFieldPath.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0]: attrPointer[0])
            attrPointer = Array.isArray(attrPointer[0]) ? attrPointer[0][1].attributeQuery : null
        }

        this.dataDeps = {
            main: {
                type: 'records',
                source: this.record,
                attributeQuery: this.args.attributeQuery
            }
        }
    }
    
    createState() {
        return {
            sum: new GlobalBoundState<number>(0),
            count: new GlobalBoundState<number>(0),
            itemValue: new RecordBoundState<number>(0, this.record.name!)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    resolveAvgField(record:any, avgFieldPath = this.avgFieldPath) {
        let base:any = record
        for(let attr of avgFieldPath) {
            base = base[attr]
            if (base === undefined || base === null) return null
        }
        return (Number.isNaN(base)||!Number.isFinite(base) ) ? null: base
    }
    
    async compute({main: records}: {main: any[]}): Promise<number> {
        let sum = 0;
        let count = 0;
        
        for (const record of records) {
            const value = this.resolveAvgField(record) || 0;
            sum += value;
            count++;
            await this.state.itemValue.set(record, value);
        }
        
        await this.state.sum.set(sum);
        await this.state.count.set(count);
        
        return count > 0 ? sum / count : 0;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        
        let count = await this.state.count.get() || 0;
        let sum = await this.state.sum.get() || 0;

        if (mutationEvent.type === 'create') {
            const newRecord = await this.controller.system.storage.findOne(
                this.record.name!, 
                MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), 
                undefined, 
                this.args.attributeQuery
            )
            const value = this.resolveAvgField(newRecord) || 0;
            sum += value;
            count++;
            await this.state.itemValue.set(newRecord, value);
        } else if (mutationEvent.type === 'delete') {
            // Get the old value from state instead of returning fullRecompute
            const oldValue = (await this.state.itemValue.get(mutationEvent.record)) || 0;
            sum -= oldValue;
            count--;
        } else if (mutationEvent.type === 'update') {
            const newRecord = await this.controller.system.storage.findOne(
                this.record.name!, 
                MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), 
                undefined, 
                this.args.attributeQuery
            )
            const newValue = this.resolveAvgField(newRecord) || 0;
            
            // Get the old value from state
            const oldValue = (await this.state.itemValue.get(mutationEvent.oldRecord)) || 0;
            
            // 更新 sum 和 count
            sum += newValue - oldValue;
            await this.state.itemValue.set(newRecord, newValue);
        }
        
        await this.state.sum.set(sum);
        await this.state.count.set(count);
        
        return count > 0 ? sum / count : 0;
    }
}


function setByPath(record: any, path: string[], value: any) {
    let base:any = record
    for(let attr of path.slice(0, -1)) {
        base = base[attr]
    }
    base[path.at(-1)!] = value
}


export class PropertyAverageHandle implements DataBasedComputation {
    static computationType = Average
    static contextType = 'property' as const
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
    avgFieldPath: string[]

    constructor(public controller: Controller, public args: AverageInstance, public dataContext: PropertyDataContext) {
        // Find relation by property name or fall back to record
        this.relation = this.controller.relations.find(r => (r.source === dataContext.host && r.sourceProperty === this.args.property) || (r.target === dataContext.host && r.targetProperty === this.args.property))!
        this.isSource = this.args.direction ? this.args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'average computation relation direction error')
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
        
        
        this.avgFieldPath = []
        let attrPointer:any = attributeQuery
        while(attrPointer) {
            this.avgFieldPath.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0]: attrPointer[0])
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
            count: new RecordBoundState<number>(0, this.dataContext.host.name),
            itemResult: new RecordBoundState<number>(0, this.relation.name!)
        }   
    }
    
    getDefaultValue() {
        return 0
    }
    
    resolveAvgField(record:any, avgFieldPath = this.avgFieldPath) {
        let base:any = record
        for(let attr of avgFieldPath) {
            base = base[attr]
            if (base === undefined || base === null) return null
        }
        return base
    }

    async compute({_current}: {_current: any}): Promise<number> {
        const relations = _current[this.relationAttr] || [];
        let sum = 0;
        let count = 0;
        
        for (const relatedItem of relations) {
            const value = this.resolveAvgField(relatedItem, this.avgFieldPath) || 0;
            sum += value;
            count++;
            await this.state.itemResult.set(relatedItem, value);
        }
        
        await this.state.count.set(_current, count);
        
        return count > 0 ? sum / count : 0;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
        // 只能支持通过 args.record 指定的关联关系或者关联实体的增量更新
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
        
        let count = await this.state.count.get(mutationEvent.record) || 0;
        let sum = (lastValue || 0) * count

        // 关联关系的新建
        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            
            const relationRecord = relatedMutationEvent.record!;
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!, 
                MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                undefined, 
                this.relationAttributeQuery
            );

            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source'];
            relatedRecord['&'] = newRelationWithEntity;
            const value = this.resolveAvgField(relatedRecord) || 0;
            sum += value;
            count++;
            await this.state.itemResult.set(newRelationWithEntity, value);
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            const oldResult = await this.state!.itemResult.get(relatedMutationEvent.record);
            sum = sum - oldResult;  
            count--;
        } else if (relatedMutationEvent.type === 'update') {
            // 可能是关系更新也可能是关联实体更新
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!, 
                MatchExp.atom({key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'), value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                undefined, 
                this.relationAttributeQuery
            );

            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source'];
            relatedRecord['&'] = newRelationWithEntity;
            const newValue = this.resolveAvgField(relatedRecord) || 0;

            const oldValue = (await this.state.itemResult.get(newRelationWithEntity)) || 0;
            await this.state.itemResult.set(newRelationWithEntity, newValue);
            
            // 更新 sum 和 count
            sum += newValue - oldValue;
        }

        await this.state.count.set(mutationEvent.record, count);
        
        return count > 0 ? sum / count : 0;
    }
}

// Export Average computation handles
export const AverageHandles = [GlobalAverageHandle, PropertyAverageHandle]; 