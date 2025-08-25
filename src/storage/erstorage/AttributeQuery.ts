import {EntityToTableMap} from "./EntityToTableMap.js";
import {assert} from "../utils.js";

import {ALL_ATTR_SYMBOL, LINK_SYMBOL, RecordQuery, RecordQueryData, RecordQueryTree} from "./RecordQuery.js";
import { MatchExp, MatchExpressionData } from "./MatchExp.js";

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
    public static mergeAttributeQueryData(attributeQueryData: AttributeQueryData, otherAttributeQueryData: AttributeQueryData): AttributeQueryData {

        const allAttributeQueryData = [...attributeQueryData, ...otherAttributeQueryData]

        // 如果是普通字段有相同的就忽略。没有相同的就push。
        // 如果是对象，就要深度合并。
        const propertyAttributes = new Set<string>(allAttributeQueryData.filter(item => typeof item === 'string'))

        const recordAttributes: AttributeQueryDataRecordItem[] = allAttributeQueryData.filter(item => typeof item !== 'string')

        const recordAttributesByName = recordAttributes.reduce((acc, item) => {
            const [attributeName, subQueryData] = item
            if(acc[attributeName]) {
                acc[attributeName] = { attributeQuery: AttributeQuery.mergeAttributeQueryData(acc[attributeName].attributeQuery!, subQueryData.attributeQuery!) }
            } else {
                acc[attributeName] = subQueryData
            }
            return acc
        }, {} as Record<string, RecordQueryData>)

        return [
            ...propertyAttributes, 
            ...Object.entries(recordAttributesByName)
        ]


    }
    public static getAttributeQueryDataForRecord(
        recordName:string, 
        map: EntityToTableMap,
        includeSameTableReliance?: boolean,
        includeMergedRecordAttribute?: boolean,
        includeManagedRecordAttributes?: boolean, // link record 的 source/target 字段
        includeNotRelianceCombined?: boolean
    ): AttributeQueryData{
        const inputRecordInfo = map.getRecordInfo(recordName)
        const recordInfo = inputRecordInfo.resolvedBaseRecordName ? map.getRecordInfo(inputRecordInfo.resolvedBaseRecordName) : inputRecordInfo
        let result: AttributeQueryData = recordInfo.valueAttributes.map(info => info.attributeName)

        // FIXME 再想想以下几个参数的递归查询，特别是关系上的数据。
        if(includeSameTableReliance) {
            recordInfo.sameTableReliance.forEach(info =>{
                const relianceAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.recordName, map, true, includeMergedRecordAttribute)
                const attributeQueryItem:AttributeQueryDataItem  = [
                    info.attributeName,
                    {
                        attributeQuery: [...relianceAttributeQueryData]
                    }
                ]

                if (!recordInfo.isRelation) {
                    const relianceRelationAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.linkName, map, true, includeMergedRecordAttribute)
                    attributeQueryItem[1].attributeQuery!.push([LINK_SYMBOL, { attributeQuery: relianceRelationAttributeQueryData }])
                }

                result = AttributeQuery.mergeAttributeQueryData(result, [attributeQueryItem])
            })
        }

        if (includeNotRelianceCombined){
            recordInfo.notRelianceCombined.forEach(info =>{
                // const relianceAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.recordName, map, true, includeMergedRecordAttribute, true)
                // const relianceRelationAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.linkName, map, true, includeMergedRecordAttribute, true)
                // result.push(
                //     [
                //         info.attributeName,
                //         {
                //             attributeQuery: [...relianceAttributeQueryData, [LINK_SYMBOL, { attributeQuery: relianceRelationAttributeQueryData }]]
                //         }
                //     ]
                // )

                const relianceAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.recordName, map, true, includeMergedRecordAttribute)
                const attributeQueryItem:AttributeQueryDataItem  = [
                    info.attributeName,
                    {
                        attributeQuery: [...relianceAttributeQueryData]
                    }
                ]

                if (!recordInfo.isRelation) {
                    const relianceRelationAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.linkName, map, true, includeMergedRecordAttribute)
                    attributeQueryItem[1].attributeQuery!.push([LINK_SYMBOL, { attributeQuery: relianceRelationAttributeQueryData }])
                }

                result = AttributeQuery.mergeAttributeQueryData(result, [attributeQueryItem])
            })
        }

        if(includeMergedRecordAttribute) {
            recordInfo.mergedRecordAttributes.forEach(info =>{
                const relianceRelationAttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(info.linkName, map, includeSameTableReliance, true)
                result = AttributeQuery.mergeAttributeQueryData(result, [
                    [
                        info.attributeName,
                        {
                            attributeQuery: ['id', [LINK_SYMBOL, { attributeQuery: relianceRelationAttributeQueryData }]]
                        }
                    ]
                ])
            })
        }
        // link record 的 source/target 字段
        if (includeManagedRecordAttributes) {
            recordInfo.managedRecordAttributes.forEach(info => {
                result = AttributeQuery.mergeAttributeQueryData(result, [
                    [
                        info.attributeName,
                        {
                            attributeQuery: ['id']
                        }
                    ]
                ])
            })
        }


        return result
    }
    constructor(public recordName: string, public map: EntityToTableMap, public data: AttributeQueryData = [], public parentRecord?: string, public attributeName?: string, public shouldQueryParentLinkData?: boolean) {
        let valueAttributesSet = new Set<string>()

        data.forEach((rawItem: AttributeQueryDataItem) => {
            const item = (typeof rawItem === 'string' ? [rawItem, {}, false] : rawItem)  as AttributeQueryDataRecordItem
            const [attributeName, subQueryData, onlyRelationData] = item

            if (attributeName === LINK_SYMBOL) {
                assert(!!(this.parentRecord && this.attributeName), `parent record and attribute name cannot be empty when query link data, you passed ${this.parentRecord} ${this.attributeName}`)
                const info = this.map.getInfo(this.parentRecord!, this.attributeName!)
                this.parentLinkRecordQuery = RecordQuery.create(info.linkName, this.map, subQueryData as RecordQueryData, undefined)
                return
            }

            if (attributeName === ALL_ATTR_SYMBOL) {
                valueAttributesSet = new Set(this.map.getRecordInfo(this.recordName).valueAttributes.map(info => info.attributeName))
                return
            }

            const attributeInfo = this.map.getInfo(this.recordName, attributeName)
            if (attributeInfo.isRecord) {

                let relatedAttributeName = attributeName
                let relatedSubQueryData = subQueryData as RecordQueryData


                // 在这里判断 filtered relation
                if(attributeInfo.isLinkFiltered()) {
                    // filtered relation 的 attribute。这里需要重新构建 subQueryData，要加上基于关系的 MatchExp。
                    relatedAttributeName = attributeInfo.getBaseAttributeInfo().attributeName
                    const subMatchExp = (subQueryData as RecordQueryData).matchExpression
                    const linkInfo = attributeInfo.getLinkInfo().getBaseLinkInfo()
                    const filteredRelationMatchExp = new MatchExp(linkInfo.name, this.map, attributeInfo.getMatchExpression())
                    const rebasedMatchExp = filteredRelationMatchExp.rebase(attributeInfo.isRecordSource() ? 'target' : 'source')!
                    const mergedMatchExp = subMatchExp ? rebasedMatchExp.and(subMatchExp.data) : rebasedMatchExp
                    relatedSubQueryData = {
                        ...subQueryData,
                        matchExpression: mergedMatchExp.data
                    }
                }

                const relatedEntity = RecordQuery.create(attributeInfo.recordName, this.map, relatedSubQueryData, undefined, this.recordName, relatedAttributeName, onlyRelationData, false, attributeName)

                this.relatedRecords.push(relatedEntity)
                if (attributeInfo.isXToMany) {
                    this.xToManyRecords.push(relatedEntity)
                } else if (attributeInfo.isXToOne) {
                    this.xToOneRecords.push(relatedEntity)
                }

            } else {
                valueAttributesSet.add(attributeName)
            }
        })

        this.valueAttributes = Array.from(valueAttributesSet)
        this.fullQueryTree = this.buildFullQueryTree()

    }

    getValueAndXToOneRecordFields(fieldPath = [this.recordName], nameContext = [this.recordName]): { tableAliasAndField: [string, string], nameContext: string[], attribute: string }[] {
        const queryAttributes = this.valueAttributes.includes('id') ? this.valueAttributes : ['id'].concat(this.valueAttributes)
        const queryFields = queryAttributes.map(attributeName => {
            return {
                tableAliasAndField: this.map.getTableAliasAndFieldName(fieldPath, attributeName).slice(0, 2) as [string, string],
                nameContext,
                attribute: attributeName
            }
        })

        this.xToOneRecords.forEach((recordQuery) => {
            const nextFieldPath = fieldPath.concat(recordQuery.attributeName!)
            const nextNameContext = nameContext.concat(recordQuery.alias || recordQuery.attributeName!)
            queryFields.push(
                ...recordQuery.attributeQuery!.getValueAndXToOneRecordFields(nextFieldPath, nextNameContext)
            )

            const nextLinkFieldPath = nextFieldPath.concat(LINK_SYMBOL)
            const nextLinkNameContext = nextNameContext.concat(LINK_SYMBOL)
            if (recordQuery.attributeQuery.parentLinkRecordQuery!) {
                queryFields.push(
                    ...recordQuery.attributeQuery.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(nextLinkFieldPath, nextLinkNameContext)
                )
            }
        })

        if (this.shouldQueryParentLinkData && this.parentLinkRecordQuery) {
            const reverseAttribute = this.map.getInfo(this.parentRecord!, this.attributeName!).getReverseInfo()?.attributeName!
            const nextFieldPath = fieldPath.concat(reverseAttribute!, LINK_SYMBOL)
            const nextNameContext = nameContext.concat(reverseAttribute!, LINK_SYMBOL)
            const symmetricLinkPaths = this.map.spawnManyToManySymmetricPath(nextFieldPath)
            const nextSymmetricLinkNameContext = this.map.spawnManyToManySymmetricPath(nextNameContext)

            if (!symmetricLinkPaths) {
                queryFields.push(
                    ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(nextFieldPath, nextNameContext)
                )
            } else {
                queryFields.push(
                    ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(symmetricLinkPaths[0], nextSymmetricLinkNameContext![0]),
                    ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(symmetricLinkPaths[1], nextSymmetricLinkNameContext![1])
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
        // FIXME 过滤掉 x:1 中递归地情况。
        const result = new RecordQueryTree(this.recordName, this.map, this.parentRecord, this.attributeName)
        this.data.forEach(i => {
            if (!Array.isArray(i)) {
                result.addField([i])
            }
        })
        // CAUTION 我们这里只管 xToOne 的情况，因为 xToMany 都是外部用 id 去做二次查询得到的。不是用 join 语句一次性得到的。
        this.xToOneRecords.forEach((recordQuery) => {
            // CAUTION 注意要排除掉 goto 递归的情况。递归肯定无法一次  join 查出，不管是什么关系。
            if(!recordQuery.goto) {
                result.addRecord([recordQuery.attributeName!], recordQuery.attributeQuery!.xToOneQueryTree)
            }
        })

        if (this.shouldQueryParentLinkData && this.parentLinkRecordQuery) {
            // link 也可能使用递归，所以也要排除掉。
            if(!this.parentLinkRecordQuery.goto) {
                const reverseInfo = this.map.getInfo(this.parentRecord!, this.attributeName!).getReverseInfo()
                result.addRecord([reverseInfo?.attributeName!, LINK_SYMBOL], this.parentLinkRecordQuery.attributeQuery!.xToOneQueryTree)
            }
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