import { Activity, Interaction, Relation } from "@shared"
import { KlassInstance } from "@shared"
import { Entity } from "@shared"
import { BoolExp } from "@shared"
import { Controller } from "../Controller"
import { DataContext } from "./ComputedDataHandle"
import { AttributeQueryData, MatchExpressionData, ModifierData } from "@storage"
import { Dictionary } from "@shared"
import { SKIP_RESULT } from "../Scheduler"

export type ComputeResult = any

export type ComputeResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data?: any
    affectedId?: any
}

export class RecordBoundState<T> {
    record!: string
    key!: string
    controller!: Controller
    constructor(public defaultValue:any) { 

    }
    async set(record:any, value: any): Promise<T> {
        await this.controller.system.storage.update(this.record, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[this.key]: value})
        return value
    }
    async get(record:any):Promise<T> {
        // TODO 如果 record 上不存在就重新查询
        if (record[this.key] === undefined) {
            const fullRecord = await this.controller.system.storage.findOne(this.record, BoolExp.atom({key: 'id', value: ['=', record.id]}), undefined, [this.key])
            return fullRecord[this.key] as T
        }
        return record[this.key] as T
    }
}

export class RelationBoundState<T> {
    key!: string
    controller!: Controller
    constructor(public defaultValue:any, public record:string) { 

    }
    async set(record:any, value: any): Promise<T> {
        await this.controller.system.storage.update(this.record, BoolExp.atom({key: 'id', value: ['=', record.id]}), {[this.key]: value})
        return value
    }
    async get(record:any):Promise<T> {
        // TODO 如果 record 上不存在就重新查询
        if (record[this.key] === undefined) {
            const fullRecord = await this.controller.system.storage.findOne(this.record, BoolExp.atom({key: 'id', value: ['=', record.id]}), undefined, [this.key])
            return fullRecord[this.key] as T
        }
        return record[this.key] as T
    }
}

export class GlobalBoundState<T> {
    key!:string
    controller!: Controller
    constructor(public defaultValue?: any) {

    }
    async set(value: any):Promise<T> {
        await this.controller.system.storage.set('state', this.key, value)
        return value
    }
    async get():Promise<T> {
        return await this.controller.system.storage.get('state', this.key)
    }
}



export type RecordsDataDep = {
    type: 'records',
    source: KlassInstance<typeof Entity>|KlassInstance<typeof Relation>|KlassInstance<typeof Activity>|KlassInstance<typeof Interaction>,
    match?: MatchExpressionData,
    modifier?: ModifierData,
    attributeQuery?: AttributeQueryData
}

export type GlobalDataDep = {
    type: 'global',
    source: KlassInstance<typeof Dictionary>
}

// 同一 record 的 property 依赖
export type PropertyDataDep = {
    type: 'property',
    attributeQuery?: AttributeQueryData
}


// 现在没用
export type DictionaryDataDep = {
    type: 'dict',
    source: KlassInstance<typeof Dictionary>
    keys: string[]
}

export type DataDep = RecordsDataDep|PropertyDataDep|GlobalDataDep|DictionaryDataDep



export interface DataBasedComputation {
    dataContext: DataContext
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}
    // 全量计算
    compute: (...args: any[]) => ComputeResult
    // 增量计算
    incrementalCompute?: (...args: any[]) => Promise<ComputeResult|typeof SKIP_RESULT>
    // 增量计算，返回的是基于上一次结果的寄过增量
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputeResultPatch|ComputeResultPatch[]|undefined|typeof SKIP_RESULT>
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    dataDeps?: {[key: string]: any}
    getDefaultValue?: (...args: any[]) => any
    useLastValue?: boolean
}


export type InteractionEventDep = {
    type: 'interaction',
    interaction: KlassInstance<typeof Interaction>
}

export type DataEventDep = {
    type: 'data',
    eventType?: 'create'|'delete'|'update',
    dataDep: DataDep
}

export type EventDep = InteractionEventDep|DataEventDep

export interface EventBasedComputation {
    dataContext: DataContext
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}
    incrementalCompute?: (...args: any[]) => Promise<ComputeResult|typeof SKIP_RESULT>
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputeResultPatch|ComputeResultPatch[]|undefined|typeof SKIP_RESULT>
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    eventDeps?: {[key: string]: EventDep}
    useLastValue?: boolean
    getDefaultValue?: (...args: any[]) => any
    computeDirtyRecords?: (...args: any[]) => Promise<any[]|undefined>
}

export type Computation = DataBasedComputation|EventBasedComputation|AsyncDataBasedComputation

export type ComputationClass = new(...args: any[]) => Computation


export interface AsyncDataBasedComputation {
    dataContext: DataContext
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>|RelationBoundState<any>}
    getDefaultValue?: (...args: any[]) => any
    useLastValue?: boolean
    compute: (...args: any[]) => Promise<ComputeResult>
    incrementalCompute?: (...args: any[]) => Promise<any>
    incrementalPatchCompute?: (...args: any[]) => Promise<any>

    asyncReturnResult?: (...args: any[]) => Promise<ComputeResult|typeof SKIP_RESULT>
    asyncReturnResultPatch?: (...args: any[]) => Promise<ComputeResultPatch|ComputeResultPatch[]|undefined|typeof SKIP_RESULT>
}