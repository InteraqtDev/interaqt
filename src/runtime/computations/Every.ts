import { PropertyDataContext } from "./Computation.js";
import { Every } from "@shared";
import { ComputationResult, DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EveryInstance, RelationInstance } from "@shared";
import { Controller } from "../Controller.js";
import { DataContext } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, AttributeQueryDataItem, AttributeQueryDataRecordItem, LINK_SYMBOL, MatchExp, RecordQueryData } from "@storage";
import { assert } from "../util.js";


export class GlobalEveryHandle implements DataBasedComputation {
    static computationType = Every
    static contextType = 'global' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    defaultValue: boolean
    constructor(public controller: Controller,  public args: EveryInstance,  public dataContext: DataContext, ) {
        this.callback = this.args.callback.bind(this.controller)
        this.dataDeps = {
            main: {
                type: 'records',
                source: this.args.record!,
                attributeQuery: this.args.attributeQuery
            },
            ...(this.args.dataDeps || {})
        }
        this.defaultValue = !this.args.notEmpty
    }

    createState() {
        return {
            matchCount: new GlobalBoundState<number>(0),
            totalCount: new GlobalBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.args.record!.name!)
        }
    }
    
    getInitialValue() {
        return this.defaultValue
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<boolean> {
        const totalCount = await this.state.totalCount.set(records.length)
        let matchCount = 0
        
        for (const item of records) {
            const isMatch = this.callback.call(this.controller, item, dataDeps)
            if (isMatch) {
                matchCount++
            }
            await this.state.isItemMatch.set(item, isMatch)
        }
        
        await this.state.matchCount.set(matchCount)

        return matchCount === totalCount
    }
    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: any}): Promise<boolean|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        let totalCount = await this.state!.totalCount.get()
        let matchCount = await this.state!.matchCount.get()
        if (mutationEvent.type === 'create') {
            totalCount = await this.state!.totalCount.set(totalCount + 1)
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
            await this.state!.isItemMatch.set(mutationEvent.record, newItemMatch)
        } else if (mutationEvent.type === 'delete') {
            totalCount = await this.state!.totalCount.set(totalCount - 1)
            // Get the old match status from state instead of recalculating
            const oldItemMatch = await this.state!.isItemMatch.get(mutationEvent.record)
            // Convert to boolean because database may store false as 0 or true as 1
            if (!!oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            }
        } else if (mutationEvent.type === 'update') {
            // Get the old match status from state instead of recalculating
            const oldItemMatch = await this.state!.isItemMatch.get(mutationEvent.oldRecord)
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
            // Convert to boolean because database may store false as 0 or true as 1
            const oldItemMatchBool = !!oldItemMatch
            if (oldItemMatchBool === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            } else if (oldItemMatchBool === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
            await this.state!.isItemMatch.set(mutationEvent.record, newItemMatch)
        }

        return matchCount === totalCount
    }
}




export class PropertyEveryHandle implements DataBasedComputation {
    static computationType = Every
    static contextType = 'property' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: any}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relation: RelationInstance
    relatedRecordName: string
    property: string
    reverseProperty: string
    isSource: boolean   
    relationAttributeQuery: AttributeQueryData
    relatedAttributeQuery: AttributeQueryData
    constructor(public controller: Controller,  public args: EveryInstance,  public dataContext: PropertyDataContext ) {
        this.callback = this.args.callback.bind(this.controller)

        this.relation = this.controller.relations.find(r => (r.source === dataContext.host && r.sourceProperty === this.args.property) || (r.target === dataContext.host && r.targetProperty === this.args.property))!
        this.isSource = this.args.direction ? this.args.direction === 'source' :this.relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'every computation relation direction error')
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
                // CAUTION 这里注册的依赖是从当前的 record 出发的。
                attributeQuery: [[this.property, {attributeQuery: this.args.attributeQuery}]]
            },
            ...(this.args.dataDeps || {})
        }
    }

    createState() {
        return {
            matchCount: new RecordBoundState<number>(0),
            totalCount: new RecordBoundState<number>(0),
            isItemMatch: new RecordBoundState<boolean>(false, this.relation.name!)
        }
    }
    
    getInitialValue() {
        return !this.args.notEmpty
    }

    async compute({_current, ...dataDeps}: {_current: any, [key: string]: any}): Promise<boolean> {
        const totalCount = await this.state.totalCount.set(_current,_current[this.relationAttr].length)
        let matchCount = 0
        for(const item of _current[this.relationAttr]) {
            if (this.callback.call(this.controller, item, dataDeps)) {
                matchCount++
                await this.state!.isItemMatch.set(item, true)
            }
        }

        return matchCount === totalCount
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

        const relatedMutationEvent = mutationEvent.relatedMutationEvent!

        // TODO 如果未来支持用户可以自定义 dataDeps，那么这里也要支持如果发现是其他 dataDeps 变化，这里要直接返回重算的信号。
        let matchCount = await this.state!.matchCount.get(mutationEvent.record)
        let totalCount = await this.state!.totalCount.get(mutationEvent.record)

        // 关联实体只有更新才会触发到这里来，这是监听时就决定了的。
        // 关联关系的增删改都会到这里来。
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
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount + 1)
        } else if (relatedMutationEvent.type === 'delete'&&relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除
            const relationRecord = relatedMutationEvent.record!
            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount - 1)
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount - 1)
        } else if (relatedMutationEvent.type === 'update'&&(relatedMutationEvent.recordName === this.relation.name!||relatedMutationEvent.recordName === this.relatedRecordName)) {
            // 关联实体或者关联关系上的字段的更新
            const currentRecord = mutationEvent.oldRecord!

            // 关联关系或者关联实体的更新
            // relatedAttribute 是从当前 dataContext 出发
            // 现在要把匹配的 key 改成从关联关系出发。
        
            const relationMatchKey = mutationEvent.relatedAttribute[1] === LINK_SYMBOL ? 
                mutationEvent.relatedAttribute.slice(2).concat('id').join('.') : // 从2开始就是关联关系的字段了
                (mutationEvent.relatedAttribute.length ===1 ? 
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
        
            totalCount = await this.state!.totalCount.set(currentRecord, totalCount)
        } else {
            return ComputationResult.fullRecompute('mutation is not caused by relation.')
        }
        return matchCount === totalCount
    }
}






// Export Every computation handles
export const EveryHandles = [GlobalEveryHandle, PropertyEveryHandle];