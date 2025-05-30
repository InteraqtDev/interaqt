import { ComputedDataHandle, PropertyDataContext } from "./ComputedDataHandle.js";
import { Every, KlassInstance, Relation } from "@shared";
import { DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState, RelationBoundState } from "./Computation.js";
import { Controller } from "../Controller.js";
import { DataContext } from "./ComputedDataHandle.js";
import { EtityMutationEvent } from "../Scheduler.js";
import { AttributeQueryData, MatchExp } from "@storage";
import { assert } from "../util.js";
export class GlobalEveryHandle implements DataBasedComputation {
    callback: (this: Controller, item: any) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    defaultValue: boolean
    constructor(public controller: Controller,  args: KlassInstance<typeof Every>,  public dataContext: DataContext, ) {
        this.callback = args.callback.bind(this)
        this.dataDeps = {
            main: {
                type: 'records',
                source: args.record,
                attributeQuery: args.attributeQuery
            }
        }
        this.defaultValue = !args.notEmpty
    }

    createState() {
        return {
            matchCount: new GlobalBoundState<number>(0),
            totalCount: new GlobalBoundState<number>(0),
        }
    }
    
    getDefaultValue() {
        return this.defaultValue
    }

    async compute({main: records}: {main: any[]}): Promise<boolean> {
        // TODO deps

        const totalCount = await this.state.totalCount.set(records.length)
        const matchCount = await this.state.matchCount.set(records.filter(this.callback).length)

        return matchCount === totalCount
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent): Promise<boolean> {
        let totalCount = await this.state!.totalCount.get()
        let matchCount = await this.state!.matchCount.get()
        if (mutationEvent.type === 'create') {
            totalCount = await this.state!.totalCount.set(totalCount + 1)
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
        } else if (mutationEvent.type === 'delete') {
            totalCount = await this.state!.totalCount.set(totalCount - 1)
            const oldItemMatch = !!this.callback.call(this.controller, mutationEvent.oldRecord) 
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

        return matchCount === totalCount
    }
}




export class PropertyEveryHandle implements DataBasedComputation {
    callback: (this: Controller, item: any) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relation: KlassInstance<typeof Relation>
    relatedRecordName: string
    isSource: boolean   
    relationAttributeQuery: AttributeQueryData
    constructor(public controller: Controller,  public args: KlassInstance<typeof Every>,  public dataContext: PropertyDataContext ) {
        this.callback = args.callback.bind(this)

        const relation = args.record as KlassInstance<typeof Relation>
        assert(relation.source.name === dataContext.host.name || relation.target.name === dataContext.host.name, 'relation source or target must be the same as the host')
        this.relation = relation
        this.isSource = args.direction ? args.direction === 'source' :relation.source.name === dataContext.host.name
        this.relationAttr = this.isSource ? relation.sourceProperty : relation.targetProperty
        this.relatedRecordName = this.isSource ? relation.target.name : relation.source.name

        this.relationAttributeQuery = args.attributeQuery || []

        this.dataDeps = {
            _current: {
                type: 'property',
                // CAUTION 这里注册的依赖是从当前的 record 出发的。
                attributeQuery: [[this.relationAttr, {attributeQuery: [['&', {attributeQuery: this.relationAttributeQuery}]]}]]
            }
        }
    }

    createState() {
        return {
            matchCount: new RecordBoundState<number>(0),
            totalCount: new RecordBoundState<number>(0),
            isItemMatch: new RelationBoundState<boolean>(false, this.relation.name)
        }
    }
    
    getDefaultValue() {
        return !this.args.notEmpty
    }

    async compute({_current}: {_current: any}): Promise<boolean> {
        // FIXME 这里的代码是未经过验证的，目前都是走的增量
        const totalCount = await this.state.totalCount.set(_current,_current[this.relationAttr].length)
        let matchCount = 0
        for(const item of _current[this.relationAttr]) {
            if (this.callback.call(this.controller, item)) {
                matchCount++
                // CAUTION 这里是记录在关系上，而不是在关联实体上
                // FIXME 这里能获取到关系记录吗？
                await this.state!.isItemMatch.set(item['&'], true)
            }
        }

        return matchCount === totalCount
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: EtityMutationEvent): Promise<boolean> {
        // TODO 如果未来支持用户可以自定义 dataDeps，那么这里也要支持如果发现是其他 dataDeps 变化，这里要直接返回重算的信号。
        let matchCount = await this.state!.matchCount.get(mutationEvent.record)
        let totalCount = await this.state!.totalCount.get(mutationEvent.record)
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!

        // property 类型收到的事件都是 update，需要通过 relatedMutationEvent 来判断到底是关系的新增和删除还是关联实体的更新 。

        if (relatedMutationEvent.type === 'create') {
            // 关联关系的新建
            const relationRecord = relatedMutationEvent.record!
            const newRelationWithEntity = await this.controller.system.storage.findOne(this.relation.name, MatchExp.atom({
                key: 'id',
                value: ['=', relationRecord.id]
            }), undefined, this.relationAttributeQuery)

            const newItemMatch = !!this.callback.call(this.controller, newRelationWithEntity) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount + 1)
                await this.state!.isItemMatch.set(newRelationWithEntity, true)
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount + 1)
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            const relationRecord = relatedMutationEvent.record!
            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount - 1)
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount - 1)
        } else if (relatedMutationEvent.type === 'update') {
            // 关联实体或者关联关系上的字段的更新
            const currentRecord = mutationEvent.oldRecord!
            const isRelationUpdate = mutationEvent.relatedMutationEvent?.recordName === this.relation.name

            const relationMatch = isRelationUpdate ? 
                MatchExp.atom({
                    key: 'id',
                    value: ['=', mutationEvent.relatedMutationEvent!.oldRecord!.id]
                }) : 
                MatchExp.atom({
                    key: 'source.id',
                    value: ['=', this.isSource ?  currentRecord.id: mutationEvent.relatedMutationEvent!.oldRecord!.id]
                }).and({
                    key: 'target.id',
                    value: ['=', this.isSource ? mutationEvent.relatedMutationEvent!.oldRecord!.id : currentRecord.id]
                })


            const relationRecord = await this.controller.system.storage.findOne(this.relation.name, relationMatch, undefined, this.relationAttributeQuery)

            const oldItemMatch = !!await this.state!.isItemMatch.get(relationRecord)
            const newItemMatch = !!this.callback.call(this.controller, relationRecord) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(currentRecord, matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(currentRecord, matchCount + 1)
            }
            await this.state!.isItemMatch.set(relationRecord, newItemMatch)
          
            totalCount = await this.state!.totalCount.set(currentRecord, totalCount)
        }

        return matchCount === totalCount
    }
}






ComputedDataHandle.Handles.set(Every, {
    global: GlobalEveryHandle,
    property: PropertyEveryHandle
})