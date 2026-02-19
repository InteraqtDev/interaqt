import { ActivityInstance, AttributeQueryData, DictionaryInstance, EntityInstance, InteractionInstance, RelationInstance } from "./types"


export type RecordsDataDep = {
    type: 'records',
    source: EntityInstance|RelationInstance|ActivityInstance|InteractionInstance,
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


// 现在没用
export type DictionaryDataDep = {
    type: 'dict',
    source: DictionaryInstance
    keys: string[]
}

export type DataDep = RecordsDataDep|PropertyDataDep|GlobalDataDep|DictionaryDataDep

