import {EntityToTableMap} from "./EntityToTableMap";
import {assert} from "../util.ts";

import {RecordQueryData, RecordQueryTree, RecordQuery, LINK_SYMBOL} from "./RecordQuery.ts";
import {MatchExp} from "./MatchExp.ts";

export type AttributeQueryDataRecordItem = [string, RecordQueryData, boolean?]
export type AttributeQueryDataItem = string | AttributeQueryDataRecordItem
export type AttributeQueryData = AttributeQueryDataItem[]

export class AttributeQuery {
    public relatedRecords: RecordQuery[] = []
    public xToManyRecords: RecordQuery[] = []
    public xToOneRecords: RecordQuery[] = []
    public valueAttributes: string[] = []

    public fullQueryTree: RecordQueryTree
    public parentLinkRecordQuery?: RecordQuery
    public id = Math.random()
    public static getAttributeQueryDataForRecord(recordName:string, map: EntityToTableMap, includeSameTableReliance = false, includeMergedRecordAttribute = false): AttributeQueryData{
        const result: AttributeQueryData = map.getRecordInfo(recordName).valueAttributes.map(info => info.attributeName)
        const recordInfo = map.getRecordInfo(recordName)

        if(includeSameTableReliance) {
            recordInfo.sameTableReliance.forEach(info =>{
                const relianceAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.recordName, map, true, includeMergedRecordAttribute)
                const relianceRelationAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.linkName, map, true, includeMergedRecordAttribute)
                result.push(
                    [
                        info.attributeName,
                        {
                            attributeQuery: [...relianceAttributeQueryData, [LINK_SYMBOL, { attributeQuery: relianceRelationAttributeQueryData }]]
                        }
                    ]
                )
            })
        }

        if(includeMergedRecordAttribute) {
            recordInfo.mergedRecordAttributes.forEach(info =>{
                const relianceRelationAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.linkName, map, includeSameTableReliance, true)
                result.push(
                    [
                        info.attributeName,
                        {
                            attributeQuery: ['id', [LINK_SYMBOL, { attributeQuery: relianceRelationAttributeQueryData }]]
                        }
                    ]
                )
            })
        }


        return result
    }
    constructor(public recordName: string, public map: EntityToTableMap, public data: AttributeQueryData = [], public parentRecord?: string, public attributeName?: string, public shouldQueryParentLinkData?: boolean) {
        data.forEach((rawItem: AttributeQueryDataItem) => {
            const item = (typeof rawItem === 'string' ? [rawItem, {}, false] : rawItem)  as AttributeQueryDataRecordItem
            const [attributeName, subQueryData, onlyRelationData] = item

            if (attributeName === LINK_SYMBOL) {
                assert(!!(this.parentRecord && this.attributeName), `${this.parentRecord} ${this.attributeName} cannot be empty when query link data`)
                const info = this.map.getInfo(this.parentRecord!, this.attributeName!)
                this.parentLinkRecordQuery = RecordQuery.create(info.linkName, this.map, subQueryData as RecordQueryData, undefined)
                return
            }

            const attributeInfo = this.map.getInfo(this.recordName, attributeName)
            if (attributeInfo.isRecord) {

                const relatedEntity = RecordQuery.create(attributeInfo.recordName, this.map, subQueryData as RecordQueryData, undefined, this.recordName, attributeName, onlyRelationData)

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

        // this.xToOneQueryTree = this.buildXToOneQueryTree()
        this.fullQueryTree = this.buildFullQueryTree()

    }

    getValueAndXToOneRecordFields(nameContext = [this.recordName]): { tableAliasAndField: [string, string], nameContext: string[], attribute: string }[] {
        const queryAttributes = this.valueAttributes.includes('id') ? this.valueAttributes : ['id'].concat(this.valueAttributes)
        const queryFields = queryAttributes.map(attributeName => {
            return {
                tableAliasAndField: this.map.getTableAliasAndFieldName(nameContext, attributeName).slice(0, 2) as [string, string],
                nameContext,
                attribute: attributeName
            }
        })

        this.xToOneRecords.forEach((recordQuery) => {
            const namePath = nameContext.concat(recordQuery.attributeName!)
            queryFields.push(
                ...recordQuery.attributeQuery!.getValueAndXToOneRecordFields(namePath)
            )

            if (recordQuery.attributeQuery.parentLinkRecordQuery!) {
                queryFields.push(
                    ...recordQuery.attributeQuery.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(namePath.concat(LINK_SYMBOL))
                )
            }
        })

        if (this.shouldQueryParentLinkData && this.parentLinkRecordQuery) {
            const reverseAttribute = this.map.getInfo(this.parentRecord!, this.attributeName!).getReverseInfo()?.attributeName!
            const namePath = nameContext.concat(reverseAttribute!, LINK_SYMBOL)
            const symmetricLinkPaths = this.map.spawnManyToManySymmetricPath(namePath)
            if (!symmetricLinkPaths) {
                queryFields.push(
                    ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(namePath)
                )
            } else {
                queryFields.push(
                    ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(symmetricLinkPaths[0]),
                    ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(symmetricLinkPaths[1])
                )
            }

        }
        // xToMany 的 onlyRelationData 一起查，这是父亲在处理 findRelatedRecords 的时候传过来的。
        return queryFields
    }
    public get xToOneQueryTree(): RecordQueryTree {
        return this.buildXToOneQueryTree()
    }
    buildXToOneQueryTree() {
        const result = new RecordQueryTree(this.recordName, this.map, this.parentRecord, this.attributeName)
        this.data.forEach(i => {
            if (!Array.isArray(i)) {
                result.addField([i])
            }
        })
        // CAUTION 我们这里只管 xToOne 的情况，因为 xToMany 都是外部用 id 去做二次查询得到的。不是用 join 语句一次性得到的。
        this.xToOneRecords.forEach((recordQuery) => {
            result.addRecord([recordQuery.attributeName!], recordQuery.attributeQuery!.xToOneQueryTree)
        })

        if (this.shouldQueryParentLinkData && this.parentLinkRecordQuery) {
            const reverseInfo = this.map.getInfo(this.parentRecord!, this.attributeName!).getReverseInfo()
            result.addRecord([reverseInfo?.attributeName!, LINK_SYMBOL], this.parentLinkRecordQuery.attributeQuery!.xToOneQueryTree)
        }

        return result
    }

    buildFullQueryTree() {
        const result = new RecordQueryTree(this.recordName, this.map, this.parentRecord, this.attributeName)
        this.relatedRecords.forEach((entityQuery) => {
            result.addRecord([entityQuery.attributeName!], entityQuery.attributeQuery!.fullQueryTree)
        })
        return result
    }

    withParentLinkData() {
        if (!this.parentLinkRecordQuery) return this
        return new AttributeQuery(this.recordName, this.map, this.data, this.parentRecord, this.attributeName, true)
    }

}