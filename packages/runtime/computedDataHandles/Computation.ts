import { Controller } from "../Controller"
import { DataContext } from "./ComputedDataHandle"

export type ComputeResult = any

export type ComputeResultPatch = {
    type: 'insert' | 'update' | 'delete'
    data: any
}

export class RecordBoundState {
    constructor() {

    }
    set(record:any, value: any) {
    }
    get(record:any):any {
    }
}

export class GlobalBoundState {
    globalKey!:string
    controller!: Controller
    constructor(public defaultValue?: any) {

    }
    async set(value: any):Promise<any> {
        await this.controller.system.storage.set('state', this.globalKey, value)
        return value
    }
    async get():Promise<any> {
        return await this.controller.system.storage.get('state', this.globalKey)
    }
}


export type DateDep = RecordDataDep|PropertyDataDep|GlobalDataDep

export type RecordDataDep = {
    type: 'record',
    name: string,
    attributes?: string[]
}

export type PropertyDataDep = {
    type: 'property',
    name: string
}

export type GlobalDataDep = {
    type: 'global',
    name: string
}

export type DataDep = RecordDataDep|PropertyDataDep|GlobalDataDep

export interface DataBasedComputation {
    dataContext: DataContext
    state: {[key: string]: RecordBoundState|GlobalBoundState}
    // 全量计算
    compute: (...args: any[]) => ComputeResult
    // 增量计算
    incrementalCompute?: (...args: any[]) => ComputeResult
    // 增量计算，返回的是基于上一次结果的寄过增量
    incrementalPatchCompute?: (...args: any[]) => ComputeResultPatch|ComputeResultPatch[]|undefined
    createState?: (...args: any[]) => {[key: string]: RecordBoundState|GlobalBoundState}
    dataDeps?: {[key: string]: any}
    getDefaultValue?: (...args: any[]) => any
    useLastValue?: boolean
}


export interface EventBasedComputation {
    dataContext: DataContext
    state: {[key: string]: RecordBoundState|GlobalBoundState}
    incrementalCompute?: (...args: any[]) => ComputeResult
    incrementalPatchCompute?: (...args: any[]) => ComputeResultPatch|ComputeResultPatch[]|undefined
    createState?: (...args: any[]) => {[key: string]: any}
    eventDeps?: {[key: string]: any}
    useLastValue?: boolean
    getDefaultValue?: (...args: any[]) => any
}

export type Computation = DataBasedComputation|EventBasedComputation