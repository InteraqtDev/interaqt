import { ComputedDataHandle, PropertyDataContext } from "./ComputedDataHandle.js";
import { Every, KlassInstance, Property, Relation } from "@interaqt/shared";
import { DataBasedComputation, DataDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { Controller } from "../Controller.js";
import { DataContext } from "./ComputedDataHandle.js";
import { ERRecordMutationEvent } from "../Scheduler.js";
import { MatchExp } from "@interaqt/storage";
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

    async incrementalCompute(lastValue: boolean, mutationEvent: ERRecordMutationEvent): Promise<boolean> {
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
    relatedRecordName: string
    isSource: boolean
    constructor(public controller: Controller,  public args: KlassInstance<typeof Every>,  public dataContext: PropertyDataContext ) {
        this.callback = args.callback.bind(this)

        const relation = args.record as KlassInstance<typeof Relation>
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
            totalCount: new RecordBoundState<number>(0),
        }
    }
    
    getDefaultValue() {
        return !this.args.notEmpty
    }

    async compute({_current}: {_current: any}): Promise<boolean> {
        const totalCount = await this.state.totalCount.set(_current,_current[this.relationAttr].length)
        const matchCount = await this.state.matchCount.set(_current, _current[this.relationAttr].filter(this.callback).length)
        return matchCount === totalCount
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: ERRecordMutationEvent): Promise<boolean> {
        // TODO 如果未来支持用户可以自定义 dataDeps，那么这里也要支持如果发现是其他 dataDeps 变化，这里要直接返回重算的信号。
        let matchCount = await this.state!.matchCount.get(mutationEvent.record)
        let totalCount = await this.state!.totalCount.get(mutationEvent.record)
        const relatedMutationEvent = mutationEvent.relatedMutationEvent!

        if (relatedMutationEvent.type === 'create') {
            // 关联关系的新建
            // TODO 有没有可能关联实体也被删除了！！！！，所以查不到了！！！！是有可能的，所以只能软删除？
            const newItem = await this.controller.system.storage.findOne(this.relatedRecordName, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.record![this.isSource ? 'target' : 'source']!.id]
            }), undefined, ['*'])

            const newItemMatch = !!this.callback.call(this.controller, newItem) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount + 1)
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount + 1)
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            // TODO 有没有可能关联实体也被删除了！！！！，所以查不到了！！！！是有可能的，所以只能软删除？
            const oldItem = await this.controller.system.storage.findOne(this.relatedRecordName, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.oldRecord![this.isSource ? 'target' : 'source']!.id]
            }), undefined, ['*'])

            const oldItemMatch = !!this.callback.call(this.controller, oldItem) 
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount - 1)
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount - 1)
        } else if (relatedMutationEvent.type === 'update') {
            // 关联实体的更新
            const oldItemMatch = !!this.callback.call(this.controller, relatedMutationEvent.oldRecord) 
            const newItemMatch = !!this.callback.call(this.controller, relatedMutationEvent.record) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(mutationEvent.record, matchCount + 1)
            }

            totalCount = await this.state!.totalCount.set(mutationEvent.record, totalCount)
        }

        return matchCount === totalCount
    }
}






ComputedDataHandle.Handles.set(Every, {
    global: GlobalEveryHandle,
    property: PropertyEveryHandle
})