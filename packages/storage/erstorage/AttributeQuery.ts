import {EntityToTableMap} from "./EntityToTableMap";

import {EntityQueryData, EntityQueryTree, RecordQuery} from "./RecordQuery.ts";

export type AttributeQueryDataItem = string | [string, EntityQueryData]
export type AttributeQueryData = AttributeQueryDataItem[]

export class AttributeQuery {
    public relatedEntities: { name: string, entityQuery: RecordQuery }[] = []
    public xToManyEntities: { name: string, entityQuery: RecordQuery }[] = []
    public xToOneEntities: { name: string, entityQuery: RecordQuery }[] = []
    public valueAttributes: string[] = []
    public entityQueryTree: EntityQueryTree = {}
    public fullEntityQueryTree: EntityQueryTree = {}

    constructor(public entityName: string, public map: EntityToTableMap, public data: AttributeQueryData = []) {
        data.forEach((item: AttributeQueryDataItem) => {
            const attributeName: string = typeof item === 'string' ? item : item[0]

            const attributeInfo = this.map.getInfo(this.entityName, attributeName)
            if (attributeInfo.isRecord) {
                const relatedEntity = {
                    name: attributeName,
                    entityQuery: RecordQuery.create(attributeInfo.entityName, this.map, item[1] as EntityQueryData)
                }

                this.relatedEntities.push(relatedEntity)

                if (attributeInfo.isXToMany) {
                    this.xToManyEntities.push(relatedEntity)
                } else if (attributeInfo.isXToOne) {
                    this.xToOneEntities.push(relatedEntity)
                }


            } else {
                this.valueAttributes.push(attributeName)
            }
        })


        this.entityQueryTree = this.buildEntityQueryTree()
        this.fullEntityQueryTree = this.buildFullEntityQueryTree()
    }

    getQueryFields(nameContext = [this.entityName]): { tableAliasAndField: [string, string], nameContext: string[], attribute: string }[] {
        const queryAttributes = this.valueAttributes.includes('id') ? this.valueAttributes : ['id'].concat(this.valueAttributes)
        const queryFields = queryAttributes.map(attributeName => {

            return {
                tableAliasAndField: this.map.getTableAliasAndFieldName(nameContext, attributeName).slice(0, 2) as [string, string],
                nameContext,
                attribute: attributeName
            }
        })


        this.xToOneEntities.forEach(({name: entityAttributeName, entityQuery}) => {

            queryFields.push(...entityQuery.attributeQuery!.getQueryFields(nameContext.concat(entityAttributeName)))
        })

        return queryFields
    }

    buildEntityQueryTree() {
        const result: EntityQueryTree = {}
        // CAUTION 我们这里只管 xToOne 的情况，因为其他情况是用 id 去做二次查询得到的。
        this.xToOneEntities.forEach(({name, entityQuery}) => {
            result[name] = entityQuery.attributeQuery!.entityQueryTree
        })
        return result
    }

    buildFullEntityQueryTree() {
        const result: EntityQueryTree = {}
        // CAUTION 我们这里只管 xToOne 的情况，因为其他情况是用 id 去做二次查询得到的。
        this.relatedEntities.forEach(({name, entityQuery}) => {
            result[name] = entityQuery.attributeQuery!.entityQueryTree
        })
        return result
    }

}