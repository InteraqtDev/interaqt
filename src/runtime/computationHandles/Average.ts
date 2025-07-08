import { ComputationHandle, DataContext, PropertyDataContext } from "./ComputationHandle.js";
import { Average, AverageInstance, RelationInstance, EntityInstance } from "@shared";
import { Controller } from "../Controller.js";
import { ComputationResult, DataBasedComputation, DataDep, RecordBoundState, GlobalBoundState, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp, AttributeQueryData } from "@storage";
import { assert } from "../util.js";

export class GlobalAverageHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: (EntityInstance|RelationInstance)
    avgFieldPath: string[]
    
    constructor(public controller: Controller, public args: AverageInstance, public dataContext: DataContext) {
        this.record = args.record
        
        // 获取 attributeQuery 的第一个字段作为平均值计算字段
        if (!args.attributeQuery || args.attributeQuery.length === 0) {
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
                attributeQuery: args.attributeQuery
            }
        }
    }
    
    createState() {
        return {
            sum: new GlobalBoundState<number>(0),
            count: new GlobalBoundState<number>(0)
        }   
    }
    
    getDefaultValue() {
        return 0
    }

    resolveAvgField(record:any, avgFieldPath = this.avgFieldPath) {
        let base:any = record
        for(let attr of avgFieldPath) {
            base = base[attr]
            if (base === undefined || base === null) return 0
        }
        return (Number.isNaN(base)||!Number.isFinite(base) ) ? 0: base
    }
    
    async compute({main: records}: {main: any[]}): Promise<number> {
        let sum = 0;
        let count = 0;
        
        for (const record of records) {
            const value = this.resolveAvgField(record);
            if (value !== null) {
                sum += value;
                count++;
            }
        }
        
        await this.state.count.set(count);
        
        return count > 0 ? sum / count : 0;
    }

    async incrementalCompute(lastValue: number, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<number|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        
        let count = await this.state.count.get() || 0;
        let sum = (lastValue || 0) * count

        if (mutationEvent.type === 'create') {
            const newRecord = await this.controller.system.storage.findOne(
                this.record.name!, 
                MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), 
                undefined, 
                this.args.attributeQuery
            )
            const value = this.resolveAvgField(newRecord);
            if (value !== null) {
                sum += value;
                count++;
            }
        } else if (mutationEvent.type === 'delete') {
            // FIXME 必须同时知道删掉的关联关系，才能支持 attributeQuery 跨关系的 oldValue
            return ComputationResult.fullRecompute('No oldRecord in delete event');
        } else if (mutationEvent.type === 'update') {
            const newRecord = await this.controller.system.storage.findOne(
                this.record.name!, 
                MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), 
                undefined, 
                this.args.attributeQuery
            )
            const newValue = this.resolveAvgField(newRecord);
            
            assert(!mutationEvent.relatedAttribute || mutationEvent.relatedAttribute.every((r: any, index: number) => r===this.avgFieldPath[index]), 'related update event should not trigger this average.')
            const oldRecord = mutationEvent.relatedAttribute ? mutationEvent.relatedMutationEvent!.oldRecord : mutationEvent.oldRecord!
            const oldValue = this.resolveAvgField(oldRecord, this.avgFieldPath.slice(mutationEvent.relatedAttribute?.length||0, Infinity));
            
            // 更新 sum 和 count
            if (oldValue !== null && newValue !== null) {
                // 两个值都有效，只更新 sum
                sum += newValue - oldValue;
            } else if (oldValue === null && newValue !== null) {
                // 旧值无效，新值有效，增加计数
                sum += newValue;
                count++;
            } else if (oldValue !== null && newValue === null) {
                // 旧值有效，新值无效，减少计数
                sum -= oldValue;
                count--;
            }
            // 如果两个值都无效，不做任何操作
        }
        
        await this.state.count.set(count);
        
        return count > 0 ? sum / count : 0;
    }
}

export class PropertyAverageHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: RelationInstance
    relationAttributeQuery: AttributeQueryData
    avgFieldPath: string[]

    constructor(public controller: Controller, public args: AverageInstance, public dataContext: PropertyDataContext) {
        // We assume in PropertyAverageHandle, the records array's first element is a Relation
        this.relation = args.record as RelationInstance
        this.isSource = args.direction ? args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'average computation relation direction error')
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        
        this.relationAttributeQuery = args.attributeQuery || []
        
        // 解析 attributeQuery 获取平均值计算字段
        if (!args.attributeQuery || args.attributeQuery.length === 0) {
            throw new Error('Average computation requires attributeQuery with at least one field')
        }
        
        this.avgFieldPath = []
        let attrPointer:any = this.args.attributeQuery
        while(attrPointer) {
            this.avgFieldPath.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0]: attrPointer[0])
            attrPointer = Array.isArray(attrPointer[0]) ? attrPointer[0][1].attributeQuery : null
        }
        
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: [['&', {attributeQuery: this.relationAttributeQuery}]]}]]
            }
        }
    }

    createState() {
        return {
            count: new RecordBoundState<number>(0, this.dataContext.host.name)
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
        
        for (const relationItem of relations) {
            // relationItem 包含 '&' 属性，它指向关联的实体
            const relatedEntity = relationItem['&'];
            const value = this.resolveAvgField(relatedEntity, this.avgFieldPath)
            if (value !== null) {
                sum += value;
                count++;
            }
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


        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!;
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!, 
                MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            
            const value = this.resolveAvgField(newRelationWithEntity)
            if (value !== null) {
                sum += value;
                count++;
            }
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // FIXME 关联关系的删除 - 无法知道原本的字段值
            return ComputationResult.fullRecompute('Cannot determine average value for deleted relation')
        } else if (relatedMutationEvent.type === 'update') {
            // 可能是关系更新也可能是关联实体更新
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!, 
                MatchExp.atom({key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'), value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            const newValue = this.resolveAvgField(newRelationWithEntity)

            assert(!mutationEvent.relatedAttribute || mutationEvent.relatedAttribute.every((r: any, index: number) => r===this.avgFieldPath[index]), 'related update event should not trigger this average.')
            const oldRecord = mutationEvent.relatedMutationEvent!.oldRecord 
            const oldValue = this.resolveAvgField(oldRecord, this.avgFieldPath.slice(mutationEvent.relatedAttribute!.length, Infinity));
            
            // 更新 sum 和 count
            if (oldValue !== null && newValue !== null) {
                // 两个值都有效，只更新 sum
                sum += newValue - oldValue;
            } else if (oldValue === null && newValue !== null) {
                // 旧值无效，新值有效，增加计数
                sum += newValue;
                count++;
            } else if (oldValue !== null && newValue === null) {
                // 旧值有效，新值无效，减少计数
                sum -= oldValue;
                count--;
            }
        }

        await this.state.count.set(mutationEvent.record, count);
        
        return count > 0 ? sum / count : 0;
    }
}

ComputationHandle.Handles.set(Average as any, {
    global: GlobalAverageHandle,
    property: PropertyAverageHandle
}); 