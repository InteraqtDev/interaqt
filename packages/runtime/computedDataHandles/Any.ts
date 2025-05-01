import { ComputedDataHandle, DataContext, PropertyDataContext } from "./ComputedDataHandle.js";
import { Any, KlassInstance, Relation } from "@interaqt/shared";
import { Controller } from "../Controller.js";
import { DataDep, GlobalBoundState, RecordBoundState, RelationBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { MatchExp } from "@interaqt/storage";


export class GlobalAnyHandle implements DataBasedComputation {
    callback: (this: Controller, item: any) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    constructor(public controller: Controller,  args: KlassInstance<typeof Any>,  public dataContext: DataContext, ) {
        this.callback = args.callback.bind(this)
        this.dataDeps = {
            main: {
                type: 'records',
                source:args.record,
                attributeQuery: args.attributeQuery
            }
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

    async compute({main: records}: {main: any[]}): Promise<boolean> {
        // TODO deps
        const matchCount = await this.state.matchCount.set(records.filter(this.callback).length)

        return matchCount>0
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent): Promise<boolean> {
        let matchCount = await this.state!.matchCount.get()
        if (mutationEvent.type === 'create') {
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
        } else if (mutationEvent.type === 'delete') {
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount - 1)
            }
        } else if (mutationEvent.type === 'update') {
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord) 
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
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
    callback: (this: Controller, item: any) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    relation: KlassInstance<typeof Relation>
    constructor(public controller: Controller,  args: KlassInstance<typeof Any>,  public dataContext: PropertyDataContext ) {
        this.callback = args.callback.bind(this)

        const relation = args.record as KlassInstance<typeof Relation>
        this.relation = relation
        this.relationAttr = relation.source.name === dataContext.host.name ? relation.sourceProperty : relation.targetProperty
        this.isSource = relation.source.name === dataContext.host.name
        this.relatedRecordName = this.isSource ? relation.target.name : relation.source.name
        // TODO 用户会不会还有其他依赖？理论上我们应该给所有的计算都提供 dataDeps 定义，最后一起 Merge。
        this.dataDeps = {
            _current: {
                type: 'property',
                attributeQuery: [[this.relationAttr, {attributeQuery: args.attributeQuery||[]}]]
            }
        }
    }

    createState() {
        return {
            matchCount: new RecordBoundState<number>(0),
            isItemMatch: new RelationBoundState<boolean>(false, this.relation.name)

        }   
    }
    
    getDefaultValue() {
        return false
    }

    async compute({_current}: {_current: any}): Promise<boolean> {
        const matchCount = await this.state.matchCount.set(_current, _current[this.relationAttr].filter(this.callback).length)
        return matchCount>0
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent): Promise<boolean> {
        // TODO 如果未来支持用户可以自定义 dataDeps，那么这里也要支持如果发现是其他 dataDeps 变化，这里要直接返回重算的信号。
        let matchCount = await this.state!.matchCount.get(mutationEvent.record)
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!

        if (relatedMutationEvent.type === 'create') {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!
            const newItem = await this.controller.system.storage.findOne(this.relatedRecordName, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record![this.isSource ? 'target' : 'source']!.id]
            }), undefined, ['*'])

            const newItemMatch = !!this.callback.call(this.controller, newItem) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount + 1)
                await this.state!.isItemMatch.set(relationRecord, true)

            }
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            const relationRecord = relatedMutationEvent.record!
            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount - 1)
            }
        } else if (relatedMutationEvent.type === 'update') {
            // 关联实体的更新
            const currentRecord = mutationEvent.oldRecord!
            const relatedEntityRecord = relatedMutationEvent.oldRecord!

            const relationRecord = await this.controller.system.storage.findOne(this.relation.name, MatchExp.atom({
                key: 'source.id',
                value: ['=', this.isSource ?  currentRecord.id: relatedEntityRecord.id]
            }).and({
                key: 'target.id',
                value: ['=', this.isSource ? relatedEntityRecord.id : currentRecord.id]
            }), undefined, ['*', [this.isSource ? 'target' : 'source', {attributeQuery: ['*']}]])

            const newRelatedEntityRecord = relationRecord[this.isSource ? 'target' : 'source']

            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            const newItemMatch = !!this.callback.call(this.controller, newRelatedEntityRecord) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(currentRecord, matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(currentRecord, matchCount + 1)
            }
            await this.state!.isItemMatch.set(relationRecord, newItemMatch)
        }

        return matchCount>0
    }
}


ComputedDataHandle.Handles.set(Any, {
    global: GlobalAnyHandle,
    property: PropertyAnyHandle
})