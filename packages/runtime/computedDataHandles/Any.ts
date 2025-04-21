import {ComputedDataHandle, DataContext, PropertyDataContext} from "./ComputedDataHandle.js";
import {Any, Count, Dictionary, KlassInstance, Relation} from "@interaqt/shared";
import {RecordMutationEvent, SYSTEM_RECORD} from "../System.js";
import { Controller } from "../Controller.js";
import { DataDep, GlobalBoundState, RecordBoundState } from "./Computation.js";
import { DataBasedComputation } from "./Computation.js";
import { data } from "../tests/data/leaveRequest.js";
import { ERRecordMutationEvent } from "../Scheduler.js";
import { assert } from "console";
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
            matchCount: new GlobalBoundState(0),
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

    async incrementalCompute(lastValue: boolean, mutationEvent: ERRecordMutationEvent): Promise<boolean> {
        let matchCount = await this.state!.matchCount.get()
        if (mutationEvent.type === 'create') {
            const newItemMatch = !!this.callback.call(this.controller, mutationEvent.record) 
            if (newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(matchCount + 1)
            }
        } else if (mutationEvent.type === 'delete') {
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

        return matchCount>0
    }
}


export class RelationBasedPropertyAnyHandle implements DataBasedComputation {
    callback: (this: Controller, item: any) => boolean
    state!: ReturnType<typeof this.createState>
    useLastValue: boolean = true
    dataDeps: {[key: string]: DataDep} = {}
    relationAttr: string
    relatedRecordName: string
    isSource: boolean
    constructor(public controller: Controller,  args: KlassInstance<typeof Any>,  public dataContext: PropertyDataContext ) {
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
            matchCount: new RecordBoundState(0),
        }
    }
    
    getDefaultValue() {
        return false
    }

    async compute({_current}: {_current: any}): Promise<boolean> {
        const matchCount = await this.state.matchCount.set(_current, _current[this.relationAttr].filter(this.callback).length)
        return matchCount>0
    }

    async incrementalCompute(lastValue: boolean, mutationEvent: ERRecordMutationEvent): Promise<boolean> {
        // TODO 如果未来支持用户可以自定义 dataDeps，那么这里也要支持如果发现是其他 dataDeps 变化，这里要直接返回重算的信号。
        let matchCount = await this.state!.matchCount.get(mutationEvent.record)
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
                matchCount = await this.state!.matchCount.set(relatedMutationEvent.record, matchCount + 1)
            }
        } else if (relatedMutationEvent.type === 'delete') {
            // 关联关系的删除
            // TODO 有没有可能关联实体也被删除了！！！！，所以查不到了！！！！是有可能的，所以只能软删除？
            const oldItem = await this.controller.system.storage.findOne(this.relatedRecordName, MatchExp.atom({
                key: 'id',
                value: ['=', relatedMutationEvent.oldRecord![this.isSource ? 'target' : 'source']!.id]
            }), undefined, ['*'])

            const oldItemMatch = !!this.callback.call(this.controller, oldItem) 
            if (oldItemMatch === true) {
                matchCount = await this.state!.matchCount.set(relatedMutationEvent.record, matchCount - 1)
            }
        } else if (relatedMutationEvent.type === 'update') {
            // 关联实体的更新
            const oldItemMatch = !!this.callback.call(this.controller, relatedMutationEvent.oldRecord) 
            const newItemMatch = !!this.callback.call(this.controller, relatedMutationEvent.record) 
            if (oldItemMatch === true && newItemMatch === false) {
                matchCount = await this.state!.matchCount.set(relatedMutationEvent.record, matchCount - 1)
            } else if (oldItemMatch === false && newItemMatch === true) {
                matchCount = await this.state!.matchCount.set(relatedMutationEvent.record, matchCount + 1)
            }
        }

        return matchCount>0
    }
}


// export class RelationBasedAnyHandle extends ComputedDataHandle {
//     matchCountField: string = `${this.stateName}_match_count`
//     setupSchema() {
//         const computedData = this.computedData as KlassInstance<typeof Any>
//         const matchCountField = `${this.stateName}_match_count`
//         const matchCountState = Dictionary.create({
//             name: matchCountField,
//             type: 'number',
//             computedData: Count.create({
//                 record: computedData.record,
//                 callback: computedData.callback
//             })
//         } as any)
        
//         // Use type assertion for controller.states
//         const controller = this.controller as any;
//         if (controller.states) {
//             controller.states.push(matchCountState);
//         }
        
//         this.controller.addComputedDataHandle('global', matchCountState.computedData as KlassInstance<any>, undefined, matchCountField)
//     }
//     parseComputedData(){
//         // FIXME setupSchema 里面也想用怎么办？setupSchema 是在 super.constructor 里面调用的。在那个里面 注册的话又会被
//         //  默认的自己的 constructor 行为覆盖掉
//         this.matchCountField = `${this.stateName}_match_count`
//         this.userComputeEffect = this.computeEffect
//         this.userFullCompute = this.isMatchCountMoreThan1
//     }

//     getDefaultValue() {
//         return false
//     }

//     computeEffect(mutationEvent: RecordMutationEvent, mutationEvents: RecordMutationEvent[]): any {
//         // 如果是自己的 record 的上面两个字段更新，那么才要重算
//         if (
//             mutationEvent.recordName === SYSTEM_RECORD
//             && mutationEvent.type === 'update'
//             && mutationEvent.record!.concept === 'state'
//             && mutationEvent.record!.key === this.matchCountField
//         ) {
//             return mutationEvent.oldRecord!.id
//         }
//     }

//     async isMatchCountMoreThan1(recordId: string) {
//         const matchCountFieldCount = await this.controller.system.storage.get('state',this.matchCountField)
//         return matchCountFieldCount > 0
//     }
// }

ComputedDataHandle.Handles.set(Any, {
    global: GlobalAnyHandle,
    property: RelationBasedPropertyAnyHandle
})