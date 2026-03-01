import { AttributeQueryData, DictionaryInstance } from "./types"
import type { ComputationRecord } from "./types"


export type RecordsDataDep = {
    type: 'records',
    source: ComputationRecord,
    match?: any,
    modifier?: any,
    attributeQuery?: AttributeQueryData
}

export type GlobalDataDep = {
    type: 'global',
    source: DictionaryInstance
}

// 同一 record 的 property 依赖
export type PropertyDataDep = {
    type: 'property',
    attributeQuery?: AttributeQueryData
}


export type DataDep = RecordsDataDep|PropertyDataDep|GlobalDataDep

