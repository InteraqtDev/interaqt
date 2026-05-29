import { PropertyDataContext } from "./Computation.js";
import { Every } from "@core";
import { ComputationResult, DataBasedComputation, DataDep, DataDepEventContext, defaultDataBasedIncrementalPlan, GlobalBoundState, IncrementalPlan, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { EveryInstance, RelationInstance } from "@core";
import { Controller } from "../Controller.js";
import { DataContext } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, AttributeQueryDataItem, AttributeQueryDataRecordItem, LINK_SYMBOL, MatchExp, RecordQueryData } from "@storage";
import { assert } from "../util.js";


export class GlobalEveryHandle implements DataBasedComputation {
    static computationType = Every
    static contextType = 'global' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: unknown}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['main']
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
            aggregate: new GlobalBoundState<Record<string, number>>({ matchCount: 0, totalCount: 0 }),
            isItemMatch: new RecordBoundState<boolean>(false, this.args.record!.name!)
        }
    }
    
    getInitialValue() {
        return this.defaultValue
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<boolean> {
        const totalCount = records.length
        let matchCount = 0
        
        for (const item of records) {
            const isMatch = this.callback.call(this.controller, item, dataDeps)
            if (isMatch) {
                matchCount++
            }
            await this.state.isItemMatch.setInternal(item, isMatch)
        }
        
        await this.state.aggregate.setInternal({ matchCount, totalCount })

        return matchCount === totalCount
    }
    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }
    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: unknown}): Promise<boolean|ComputationResult> {
        // 注意要同时检测名字和 relatedAttribute 才能确定是不是自己的更新，因为可能有自己和自己的关联关系的 dataDep。
        if (mutationEvent.recordName !== (this.dataDeps.main as RecordsDataDep).source!.name || mutationEvent.relatedAttribute?.length) {
            return ComputationResult.fullRecompute('mutationEvent.recordName not match')
        }

        let totalDelta = 0
        let matchDelta = 0
        if (mutationEvent.type === 'create') {
            totalDelta = 1
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps) 
            const { oldValue } = await this.state!.isItemMatch.replace(mutationEvent.record, newItemMatch)
            matchDelta = Number(newItemMatch) - Number(!!oldValue)
        } else if (mutationEvent.type === 'delete') {
            totalDelta = -1
            const oldItemMatch = await this.state!.isItemMatch.get(mutationEvent.record)
            matchDelta = oldItemMatch ? -1 : 0
        } else if (mutationEvent.type === 'update') {
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps)
            const { oldValue } = await this.state!.isItemMatch.replace(mutationEvent.record, newItemMatch)
            matchDelta = Number(newItemMatch) - Number(!!oldValue)
        }

        const aggregate = await this.controller.system.storage.atomic.updateGlobalFields(
            {
                key: this.state.aggregate.key,
                valueType: 'json',
                defaultValue: { matchCount: 0, totalCount: 0 }
            },
            { matchCount: matchDelta, totalCount: totalDelta },
            { matchCount: 0, totalCount: 0 }
        )
        const matchCount = aggregate.matchCount
        const totalCount = aggregate.totalCount
        if (totalCount === 0) return this.defaultValue
        return matchCount === totalCount
    }
}




export class PropertyEveryHandle implements DataBasedComputation {
    static computationType = Every
    static contextType = 'property' as const
    callback: (this: Controller, item: any, dataDeps?: {[key: string]: unknown}) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = false
    dataDeps: {[key: string]: DataDep} = {}
    primaryDataDepKeys = ['_current']
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
        const totalCount = await this.state.totalCount.setInternal(_current,_current[this.relationAttr].length)
        let matchCount = 0
        for(const item of _current[this.relationAttr]) {
            const relationStateRecord = item[LINK_SYMBOL] || item['&'] || item
            const isMatch = this.callback.call(this.controller, item, dataDeps)
            if (isMatch) {
                matchCount++
            }
            await this.state!.isItemMatch.setInternal(relationStateRecord, isMatch)
        }
        await this.state.matchCount.setInternal(_current, matchCount)

        return matchCount === totalCount
    }
    planIncremental(_event: EtityMutationEvent, _record: unknown, context: DataDepEventContext): IncrementalPlan {
        return defaultDataBasedIncrementalPlan(this.dataDeps, this.primaryDataDepKeys, context)
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent, record: any, dataDeps: {[key: string]: unknown}): Promise<boolean|ComputationResult> {
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
        let matchDelta = 0
        let totalDelta = 0

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
            let oldValue: boolean | null
            try {
                ;({ oldValue } = await this.state!.isItemMatch.replace(relationRecord, newItemMatch))
            } catch (error) {
                if (error instanceof Error && error.message.includes('Atomic replace target not found')) {
                    return ComputationResult.fullRecompute('relation contribution state target not found')
                }
                throw error
            }
            matchDelta = Number(newItemMatch) - Number(!!oldValue)
            totalDelta = 1
        } else if (relatedMutationEvent.type === 'delete'&&relatedMutationEvent.recordName === this.relation.name!) {
            // 关联关系的删除
            const relationRecord = relatedMutationEvent.record!
            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            matchDelta = oldItemMatch ? -1 : 0
            totalDelta = -1
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

            const newItemMatch = !!this.callback.call(this.controller, relatedRecord, dataDeps)
            let oldValue: boolean | null
            try {
                ;({ oldValue } = await this.state!.isItemMatch.replace(relationRecord, newItemMatch))
            } catch (error) {
                if (error instanceof Error && error.message.includes('Atomic replace target not found')) {
                    return ComputationResult.fullRecompute('relation contribution state target not found')
                }
                throw error
            }
            matchDelta = Number(newItemMatch) - Number(!!oldValue)
        } else {
            return ComputationResult.fullRecompute('mutation is not caused by relation.')
        }
        const matchCount = await this.state!.matchCount.increment(mutationEvent.record, matchDelta)
        const totalCount = await this.state!.totalCount.increment(mutationEvent.record, totalDelta)
        if (totalCount === 0) return !this.args.notEmpty
        return matchCount === totalCount
    }
}






// Export Every computation handles
export const EveryHandles = [GlobalEveryHandle, PropertyEveryHandle];
