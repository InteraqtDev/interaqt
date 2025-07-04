import { ComputationHandle, DataContext, PropertyDataContext } from "./ComputationHandle.js";
import { Summation } from "@shared";
import { Controller } from "../Controller.js";
import { SummationInstance, EntityInstance, RelationInstance } from "@shared";
import { ComputationResult, DataBasedComputation, DataDep, RecordsDataDep } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp, AttributeQueryData } from "@storage";
import { assert } from "../util.js";

export class GlobalSumHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    record: (EntityInstance|RelationInstance)
    sumFieldPath: string[]
    constructor(public controller: Controller, public args: SummationInstance, public dataContext: DataContext) {
        this.record = args.record
        
        // 获取 attributeQuery 的第一个字段作为求和字段
        if (!args.attributeQuery || args.attributeQuery.length === 0) {
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
                attributeQuery:args.attributeQuery
            }
        }
    }
    
    createState() {
        return {
        }   
    }
    
    getDefaultValue() {
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
            const newRecord = await this.controller.system.storage.findOne(this.record.name!, MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), undefined, this.args.attributeQuery)
            const value = this.resolveSumField(newRecord);
            sum += value;
        } else if (mutationEvent.type === 'delete') {
            // FIXME 必须同时知道删掉的关联关系，才能支持 attributeQuery 跨关系的 oldValue
            return ComputationResult.fullRecompute('No oldRecord in delete event');
        } else if (mutationEvent.type === 'update') {
            const newRecord = await this.controller.system.storage.findOne(this.record.name!, MatchExp.atom({key:'id', value:['=', mutationEvent.record!.id]}), undefined, this.args.attributeQuery)
            const newValue = this.resolveSumField(newRecord);
            
            assert(!mutationEvent.relatedAttribute || mutationEvent.relatedAttribute.every((r: any, index: number) => r===this.sumFieldPath[index]), 'related update event should not trigger this sum.')
            const oldRecord = mutationEvent.relatedAttribute ? mutationEvent.relatedMutationEvent!.oldRecord : mutationEvent.oldRecord!
            const oldValue = this.resolveSumField(oldRecord, this.sumFieldPath.slice(mutationEvent.relatedAttribute?.length||0, Infinity));
            sum += newValue-oldValue 
        }
        
        return sum;
    }
}

export class PropertySumHandle implements DataBasedComputation {
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: RelationInstance
    relationAttributeQuery: AttributeQueryData
    sumFieldPath: string[]

    constructor(public controller: Controller, public args: SummationInstance, public dataContext: PropertyDataContext) {
        // We assume in PropertySumHandle, the records array's first element is a Relation
        this.relation = args.record as RelationInstance
        this.isSource = args.direction ? args.direction === 'source' : this.relation.source.name === dataContext.host.name
        this.relationAttr = this.isSource ? this.relation.sourceProperty : this.relation.targetProperty
        this.relatedRecordName = this.isSource ? this.relation.target.name! : this.relation.source.name!
        
        this.relationAttributeQuery = args.attributeQuery || []
        
        // 解析 attributeQuery 获取求和字段
        if (!args.attributeQuery || args.attributeQuery.length === 0) {
            throw new Error('Sum computation requires attributeQuery with at least one field')
        }
        
        this.sumFieldPath = []
        let attrPointer:any = this.args.attributeQuery
        while(attrPointer) {
            this.sumFieldPath.push(Array.isArray(attrPointer[0]) ? attrPointer[0][0]: attrPointer[0])
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
        }   
    }
    
    getDefaultValue() {
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
        
        for (const relationItem of relations) {
            // 根据 attributeQuery 的结构获取值
            let value = this.resolveSumField(relationItem, this.sumFieldPath)
            sum += value;
        }
        
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
        
        let sum = lastValue || 0;

        if (relatedMutationEvent.type === 'create' && relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!;
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!,
                MatchExp.atom({key: 'id', value: ['=', relationRecord.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            
            // 获取字段值
            const value = this.resolveSumField(newRelationWithEntity, this.sumFieldPath)
            sum += value;
        } else if (relatedMutationEvent.type === 'delete' && relatedMutationEvent.recordName === this.relation.name!) {
            // FIXME 关联关系的删除 - 无法知道原本的字段值
            return ComputationResult.fullRecompute('Cannot determine sum value for deleted relation')
        } else if (relatedMutationEvent.type === 'update') {
            // 可能是关系更新也可能是关联实体更新
            const newRelationWithEntity = await this.controller.system.storage.findOne(
                this.relation.name!,
                MatchExp.atom({key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'), value: ['=', relatedMutationEvent.oldRecord!.id]}), 
                undefined, 
                this.relationAttributeQuery
            );
            const newValue = this.resolveSumField(newRelationWithEntity)

            // 跳过 relatedAttribute 中的前缀部分（如 ['purchases', '&', 'target']），只比较实际的字段路径
            const relatedAttrLength = mutationEvent.relatedAttribute?.length || 0
            const fieldPathStart = this.sumFieldPath.findIndex(p => p !== 'target' && p !== 'source')
            const actualFieldPath = fieldPathStart >= 0 ? this.sumFieldPath.slice(fieldPathStart) : []
            
            const oldRecord = mutationEvent.relatedMutationEvent!.oldRecord 
            const oldValue = this.resolveSumField(oldRecord, actualFieldPath);
            sum += newValue-oldValue 
        }

        return sum;
    }
}

ComputationHandle.Handles.set(Summation as any, {
    global: GlobalSumHandle,
    property: PropertySumHandle
});