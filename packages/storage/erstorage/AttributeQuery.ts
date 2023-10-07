import {EntityToTableMap} from "./EntityToTableMap";

import {RecordQueryData, RecordQueryTree, RecordQuery} from "./RecordQuery.ts";

export type AttributeQueryDataItem = string | [string, RecordQueryData]
export type AttributeQueryData = AttributeQueryDataItem[]

export class AttributeQuery {
    public relatedRecords: { name: string, entityQuery: RecordQuery }[] = []
    public xToManyRecords: { name: string, entityQuery: RecordQuery }[] = []
    public xToOneRecords: { name: string, entityQuery: RecordQuery }[] = []
    public valueAttributes: string[] = []
    public xToOneQueryTree: RecordQueryTree = {}
    public fullQueryTree: RecordQueryTree = {}

    constructor(public recordName: string, public map: EntityToTableMap, public data: AttributeQueryData = []) {
        data.forEach((item: AttributeQueryDataItem) => {
            const attributeName: string = typeof item === 'string' ? item : item[0]

            const attributeInfo = this.map.getInfo(this.recordName, attributeName)
            if (attributeInfo.isRecord) {
                const relatedEntity = {
                    name: attributeName,
                    entityQuery: RecordQuery.create(attributeInfo.recordName, this.map, item[1] as RecordQueryData)
                }

                this.relatedRecords.push(relatedEntity)

                if (attributeInfo.isXToMany) {
                    this.xToManyRecords.push(relatedEntity)
                } else if (attributeInfo.isXToOne) {
                    this.xToOneRecords.push(relatedEntity)
                }


            } else {
                this.valueAttributes.push(attributeName)
            }
        })


        this.xToOneQueryTree = this.buildXToOneQueryTree()
        this.fullQueryTree = this.buildFullQueryTree()
    }

    getQueryFields(nameContext = [this.recordName]): { tableAliasAndField: [string, string], nameContext: string[], attribute: string }[] {
        const queryAttributes = this.valueAttributes.includes('id') ? this.valueAttributes : ['id'].concat(this.valueAttributes)
        const queryFields = queryAttributes.map(attributeName => {

            return {
                tableAliasAndField: this.map.getTableAliasAndFieldName(nameContext, attributeName).slice(0, 2) as [string, string],
                nameContext,
                attribute: attributeName
            }
        })

        this.xToOneRecords.forEach(({name: entityAttributeName, entityQuery}) => {
            queryFields.push(...entityQuery.attributeQuery!.getQueryFields(nameContext.concat(entityAttributeName)))
        })

        return queryFields
    }

    buildXToOneQueryTree() {
        const result: RecordQueryTree = {}
        // CAUTION 我们这里只管 xToOne 的情况，因为 xToMany 都是外部用 id 去做二次查询得到的。不是用 join 语句一次性得到的。
        this.xToOneRecords.forEach(({name, entityQuery}) => {

            result[name] = entityQuery.attributeQuery!.xToOneQueryTree
        })
        return result
    }

    buildFullQueryTree() {
        const result: RecordQueryTree = {}
        this.relatedRecords.forEach(({name, entityQuery}) => {
            result[name] = entityQuery.attributeQuery!.xToOneQueryTree
        })
        return result
    }

}