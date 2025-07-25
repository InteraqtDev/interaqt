import { DataContext, PropertyDataContext } from "./Computation.js";
import { Any } from "@shared";
import { Controller } from "../Controller.js";
import { AnyInstance, RelationInstance } from "@shared";
import { ComputationResult, DataDep, GlobalBoundState, RecordBoundState, RecordsDataDep } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../ComputationSourceMap.js";
import { MatchExp, AttributeQueryData } from "@storage";
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
                source:this.args.record,
                attributeQuery: this.args.attributeQuery
            },
            ...(this.args.dataDeps || {})
        }
    }

    createState() {
        return {
            matchCount: new GlobalBoundState<number>(0),
        }
    }
    
    getDefaultValue() {
        return false
    }

    async compute({main: records, ...dataDeps}: {main: any[], [key: string]: any}): Promise<boolean> {
        // TODO deps
        const matchCount = await this.state.matchCount.set(records.filter(item => this.callback.call(this.controller, item, dataDeps)).length)

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
        } else if (mutationEvent.type === 'delete') {
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps) 
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            }
        } else if (mutationEvent.type === 'update') {
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord, dataDeps) 
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record, dataDeps) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
        }

        return matchCount>0
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
    relationAttributeQuery: AttributeQueryData
    constructor(public controller: Controller,  public args: AnyInstance,  public dataContext: PropertyDataContext ) {
        this.callback = this.args.callback.bind(this.controller)

        const relation = this.args.record as RelationInstance
        this.relation = relation
        this.isSource = this.args.direction ? this.args.direction === 'source' :relation.source.name === dataContext.host.name
        assert(this.isSource ? this.relation.source === dataContext.host : this.relation.target === dataContext.host, 'count computation relation direction error')
        this.relationAttr = this.isSource ? relation.sourceProperty : relation.targetProperty
        this.relatedRecordName = this.isSource ? relation.target.name! : relation.source.name!
        this.relationAttributeQuery = this.args.attributeQuery || []
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: [['&', {attributeQuery: this.relationAttributeQuery}]]}]]
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
        const matchCount = await this.state.matchCount.set(_current, _current[this.relationAttr].filter((item: any) => this.callback.call(this.controller, item, dataDeps)).length)
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

            const newItemMatch = !!this.callback.call(this.controller, newRelationWithEntity, dataDeps) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount + 1)
                await this.state!.isItemMatch.set(relationRecord, true)

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
            const relationMatch = MatchExp.atom({
                key: mutationEvent.relatedAttribute.slice(2).concat('id').join('.'),
                value: ['=', relatedMutationEvent!.oldRecord!.id]
            }) 

            const relationRecord = await this.controller.system.storage.findOne(this.relation.name!, relationMatch, undefined, this.relationAttributeQuery)

            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            const newItemMatch = !!this.callback.call(this.controller, relationRecord, dataDeps) 
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