import { DataContext, PropertyDataContext } from "./Computation.js";
import { Any } from "@shared";
import { Controller } from "../Controller.js";
import { AnyInstance, RelationInstance } from "@shared";
import { ComputationResult, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../ComputationSourceMap.js";
import { MatchExp, AttributeQueryData, RecordQueryData, LINK_SYMBOL } from "@storage";
import { assert } from "../util.js";


export class GlobalAnyHandle implements DataBasedComputation {
    static computationType = Any
    static contextType = 'global' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    constructor(public controller: Controller,  public args: AnyInstance,  public dataContext: DataContext, ) {
        this.callback = this.args.callback.bind(this.controller)
        this.dataDeps = {
            main: {
                type: 'records',
                source:this.args.record!,
                attributeQuery: this.args.attributeQuery
            },
            ...(this.args.dataDeps || {})
        }
    }

    createState() {
        return {
            matchCount: new GlobalBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.args.record!.name!)
        }
    }
    
    getDefaultValue() {
        return false
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<boolean> {
        let matchCount = 0
        
        for (const item of records) {
            const isMatch = this.callback.call(this.controller, item, dataDeps)
            if (isMatch) {
                matchCount++
            }
            await this.state.isItemMatch.set(item, isMatch)
        }
        
        await this.state.matchCount.set(matchCount)

        return matchCount>0
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<boolean|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }


        let matchCount = await this.state!.matchCount.get()
        if (mutationEvent.type === 'create') {
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
            await this.state!.isItemMatch.set(mutationEvent.record, newItemMatch)
        } else if (mutationEvent.type === 'delete') {
            // Get the old match status from state instead of recalculating
            const oldItemMatch = await this.state!.isItemMatch.get(mutationEvent.record)
            // Convert to boolean because database may store false as 0 or true as 1
            if (!!oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            }
        } else if (mutationEvent.type === 'update') {
            // Get the old match status from state instead of recalculating
            const oldItemMatch = await this.state!.isItemMatch.get(mutationEvent.oldRecord)
            // 拉取全量的 new record 数据，因为可能关联关系有变化。
            const newRecord = await this.controller.system.storage.findOne(mutationEvent.recordName, MatchExp.atom({
                key: 'id',
                value: ['=', mutationEvent.record!.id]
            }), undefined, this.args.attributeQuery)

            const newItemMatch = !!this.callback.call(this.controller, newRecord, dataDeps)
            // Convert to boolean because database may store false as 0
            const oldItemMatchBool = !!oldItemMatch
            if (oldItemMatchBool === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            } else if (oldItemMatchBool === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
            await this.state!.isItemMatch.set(newRecord, newItemMatch)
        }

        return matchCount > 0
    }
}


export class PropertyAnyHandle implements DataBasedComputation {
    static computationType = Any
    static contextType = 'property' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
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
    constructor(public controller: Controller,  public args: AnyInstance,  public dataContext: PropertyDataContext ) {
        this.callback = this.args.callback.bind(this.controller)

        this.relation = this.controller.relations.find(r => (r.source === dataContext.host && r.sourceProperty === this.args.property) || (r.target === dataContext.host && r.targetProperty === this.args.property))!
        assert(this.relation, `cannot find relation for property ${this.args.property} in "Any" computation`)
        this.isSource = this.args.direction ? this.args.direction === 'source' : this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'any computation relation direction error')

        let baseRelation = this.relation.baseRelation || this.relation
        while(baseRelation.baseRelation) {
            baseRelation = baseRelation.baseRelation
        }
        const relType = baseRelation.type.split(':')
        assert(relType[this.isSource?1:0]==='n', `property-level Any computation argument must be an x:n relation. ${this.dataContext.host.name}.${this.args.property}" is a ${this.isSource?relType.join(':'):relType.slice().reverse().join(':')} relation`)
        
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
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.property, {attributeQuery: this.args.attributeQuery}]]
            },
            ...(this.args.dataDeps || {})
        }
    }

    createState() {
        return {
            matchCount: new RecordBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.relation.name!)
        }   
    }
    
    getDefaultValue() {
        return false
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<boolean> {
        let matchCount = 0
        for(const item of _current[this.relationAttr]) {
            const isMatch = this.callback.call(this.controller, item, dataDeps)
            if (isMatch) {
                matchCount++
                await this.state!.isItemMatch.set(item, true)
            } else {
                await this.state!.isItemMatch.set(item, false)
            }
        }
        await this.state.matchCount.set(_current, matchCount)
        return matchCount>0
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<boolean|ComputationResult> {
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

        let matchCount = await this.state!.matchCount.get(mutationEvent.record)
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!

        if (relatedMutationEvent.type === 'create'&&relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!
            const newRelationWithEntity = await this.controller.system.storage.findOne(this.relation.name!, MatchExp.atom({
                key: 'id',
                value: ['=', relationRecord.id]
            }), undefined, this.relationAttributeQuery)

            const relatedRecord = newRelationWithEntity[this.isSource ? 'target' : 'source']
            relatedRecord['&'] = relationRecord

            const newItemMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount + 1)
                await this.state!.isItemMatch.set(relationRecord, true)
            } else {
                await this.state!.isItemMatch.set(relationRecord, false)
            }
        } else if (relatedMutationEvent.type === 'delete'&&relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除
            const relationRecord = relatedMutationEvent.record!
            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount - 1)
            }
        } else if (relatedMutationEvent.type === 'update'&&(relatedMutationEvent.recordName === this.relation.name!||relatedMutationEvent.recordName === this.relatedRecordName)) {
            // 关联实体或者关联关系上的字段的更新
            const currentRecord = mutationEvent.oldRecord!
            // 关联关系或者关联实体的更新
            // relatedAttribute 是从当前 dataContext 出发
            // 现在要把匹配的 key 改成从关联关系出发。
            const relationMatchKey = mutationEvent.relatedAttribute[1] === '&' ? 
                mutationEvent.relatedAttribute.slice(2).concat('id').join('.') : // 从2开始就是关联关系的字段了
                (mutationEvent.relatedAttribute.length === 1 ? 
                    `${this.isSource ? 'target' : 'source'}.id` : // 只有1个字段，就是关联实体的 id
                    `${this.isSource ? 'target' : 'source'}.${mutationEvent.relatedAttribute.slice(1).concat('id').join('.')}` // 有多个字段，就是关联实体再关联上的字段
                )

            const relationMatch = MatchExp.atom({
                key: relationMatchKey,
                value: ['=', relatedMutationEvent!.oldRecord!.id]
            }) 

            const relationRecord = await this.controller.system.storage.findOne(this.relation.name!, relationMatch, undefined, this.relationAttributeQuery)
            const relatedRecord = relationRecord[this.isSource ? 'target' : 'source']
            relatedRecord['&'] = relationRecord

            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            const newItemMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(currentRecord, matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(currentRecord, matchCount + 1)
            }
            await this.state!.isItemMatch.set(relationRecord, newItemMatch)
        } else {
            return ComputationResult.fullRecompute('mutation is not caused by relation.')
        }

        return matchCount>0
    }
}


// Export Any computation handles
export const AnyHandles = [GlobalAnyHandle, PropertyAnyHandle];