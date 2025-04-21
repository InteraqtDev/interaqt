import { Relation } from "@interaqt/shared"
import { KlassInstance } from "@interaqt/shared"
import { Entity } from "@interaqt/shared"
import { BoolExp } from "@interaqt/shared"
import { Controller } from "../Controller"
import { DataContext } from "./ComputedDataHandle"
import { AttributeQueryData, MatchExpressionData, ModifierData } from "@interaqt/storage"
import { Dictionary } from "@interaqt/shared"

export type ComputeResult = any

export type ComputeResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data: any
}

export class RecordBoundState<T> {
    record!: string
    key!: string
    controller!: Controller
    constructor(public defaultValue:T) { 

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
    constructor(public defaultValue?: T) {

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
    source: KlassInstance<typeof Entity>|KlassInstance<typeof Relation>,
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
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    // 全量计算
    compute: (...args: any[]) => ComputeResult
    // 增量计算
    incrementalCompute?: (...args: any[]) => ComputeResult
    // 增量计算，返回的是基于上一次结果的寄过增量
    incrementalPatchCompute?: (...args: any[]) => ComputeResultPatch|ComputeResultPatch[]|undefined
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    dataDeps?: {[key: string]: any}
    getDefaultValue?: (...args: any[]) => any
    useLastValue?: boolean
}


export interface EventBasedComputation {
    dataContext: DataContext
    state: {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    incrementalCompute?: (...args: any[]) => ComputeResult
    incrementalPatchCompute?: (...args: any[]) => ComputeResultPatch|ComputeResultPatch[]|undefined
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    eventDeps?: {[key: string]: any}
    useLastValue?: boolean
    getDefaultValue?: (...args: any[]) => any
}

export type Computation = DataBasedComputation|EventBasedComputation

export type ComputationClass = new(...args: any[]) => Computation