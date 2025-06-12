import { Activity, Interaction, Relation } from "@shared"
import { KlassInstance } from "@shared"
import { Entity } from "@shared"
import { BoolExp } from "@shared"
import { Controller } from "../Controller"
import { DataContext } from "./ComputedDataHandle"
import { AttributeQueryData, MatchExpressionData, ModifierData } from "@storage"
import { Dictionary } from "@shared"


export type ComputationResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data?: any
    affectedId?: any
}



export class ComputationResult{
    static skip = () => new ComputationResultSkip()
    static resolved = (result: any, args?:any) => new ComputationResultResolved(result, args)
    static async = (args?:any) => new ComputationResultAsync(args)
}

export class ComputationResultSkip extends ComputationResult{

}

export class ComputationResultAsync extends ComputationResult{
    constructor(public args?:any) {
        super()
    }
}

export class ComputationResultResolved extends ComputationResult{
    constructor(public result: any, public args?:any) {
        super()
    }
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
    compute: (...args: any[]) => Promise<ComputationResult|any>
    // 增量计算
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>
    // 增量计算，返回的是基于上一次结果的寄过增量
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    dataDeps?: {[key: string]: any}
    getDefaultValue?: (...args: any[]) => any
    useLastValue?: boolean
    // 异步计算，就会声明这个函数
    asyncReturn?: (...args: any[]) => Promise<ComputationResultSkip|any>
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
    incrementalCompute?: (...args: any[]) => Promise<ComputationResult|any>
    incrementalPatchCompute?: (...args: any[]) => Promise<ComputationResult|ComputationResultPatch|ComputationResultPatch[]|undefined>
    createState?: (...args: any[]) => {[key: string]: RecordBoundState<any>|GlobalBoundState<any>}
    eventDeps?: {[key: string]: EventDep}
    useLastValue?: boolean
    getDefaultValue?: (...args: any[]) => any
    computeDirtyRecords?: (...args: any[]) => Promise<any[]|undefined>
    asyncReturn?: (...args: any[]) => Promise<ComputationResultSkip|any>
}

export type Computation = DataBasedComputation|EventBasedComputation

export type ComputationClass = new(...args: any[]) => Computation
