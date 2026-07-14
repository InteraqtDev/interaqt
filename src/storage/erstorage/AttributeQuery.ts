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
    public static mergeAttributeQueryData(attributeQueryData: AttributeQueryData, otherAttributeQueryData: AttributeQueryData): AttributeQueryData {

        const allAttributeQueryData = [...attributeQueryData, ...otherAttributeQueryData]

        // 如果是普通字段有相同的就忽略。没有相同的就push。
        // 如果是对象，就要深度合并。
        const propertyAttributes = new Set<string>(allAttributeQueryData.filter(item => typeof item === 'string'))

        const recordAttributes: AttributeQueryDataRecordItem[] = allAttributeQueryData.filter(item => typeof item !== 'string')

        // CAUTION 重复关系键的合并只对 attributeQuery 有并集语义。matchExpression/modifier/label 等
        //  子查询语义字段没有安全的自动合并规则——此前它们在合并时被**静默丢弃**（过滤条件消失
        //  返回未过滤的关联记录，比少字段更隐蔽，r17 R-1）。规则：仅一方声明则保留；双方声明且
        //  序列化不相等则 fail-fast（AND 还是 OR 由调用方显式决定，explicit control）。
        const mergeSemanticFields = (attributeName: string, left: RecordQueryData, right: RecordQueryData): Omit<RecordQueryData, 'attributeQuery'> => {
            const result: Record<string, unknown> = {}
            const semanticKeys = ['matchExpression', 'modifier', 'label', 'goto', 'exit'] as const
            for (const key of semanticKeys) {
                const leftValue = (left as Record<string, unknown>)[key]
                const rightValue = (right as Record<string, unknown>)[key]
                if (leftValue === undefined && rightValue === undefined) continue
                if (leftValue !== undefined && rightValue !== undefined
                    && JSON.stringify(leftValue) !== JSON.stringify(rightValue)) {
                    throw new Error(
                        `cannot merge duplicate attributeQuery entries for "${attributeName}": both declare a different "${key}". ` +
                        `Merging would have to silently pick one (dropping the other's ${key}), which returns wrong data with no warning. ` +
                        `Combine them into a single entry explicitly.`
                    )
                }
                result[key] = leftValue !== undefined ? leftValue : rightValue
            }
            return result as Omit<RecordQueryData, 'attributeQuery'>
        }

        const recordAttributesByName = recordAttributes.reduce((acc, item) => {
            const [attributeName, subQueryData, onlyRelationData] = item
            const existing = acc[attributeName]
            if (existing) {
                acc[attributeName] = {
                    subQueryData: {
                        ...mergeSemanticFields(attributeName, existing.subQueryData, subQueryData),
                        attributeQuery: AttributeQuery.mergeAttributeQueryData(existing.subQueryData.attributeQuery || [], subQueryData.attributeQuery || [])
                    },
                    // onlyRelationData 表示"只取关系数据不取实体数据"：任一方需要实体数据则取全量（false 更宽）。
                    onlyRelationData: existing.onlyRelationData && !!onlyRelationData
                }
            } else {
                acc[attributeName] = { subQueryData, onlyRelationData: !!onlyRelationData }
            }
            return acc
        }, {} as Record<string, { subQueryData: RecordQueryData, onlyRelationData: boolean }>)

        return [
            ...propertyAttributes,
            ...Object.entries(recordAttributesByName).map(([attributeName, { subQueryData, onlyRelationData }]): AttributeQueryDataRecordItem =>
                onlyRelationData ? [attributeName, subQueryData, true] : [attributeName, subQueryData]
            )
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
        // 统一使用 resolvedBaseRecordName 获取实际的 recordInfo
        // 普通 entity 的 resolvedBaseRecordName 指向自己，所以这里始终获取正确的 recordInfo
        const recordInfo = map.getRecordInfo(inputRecordInfo.resolvedBaseRecordName!)
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
    // r28：combined x:1 读取为判定配对真实性而自动附带的 `&`（link id）标记。
    //  用户未请求 `&` 时结果结构化后剥除（见 QueryExecutor.pruneUnpairedCombinedReads）。
    public syntheticParentLink = false

    constructor(public recordName: string, public map: EntityToTableMap, public data: AttributeQueryData = [], public parentRecord?: string, public attributeName?: string, public shouldQueryParentLinkData?: boolean) {
        let valueAttributesSet = new Set<string>()

        data.forEach((rawItem: AttributeQueryDataItem) => {
            const item = (typeof rawItem === 'string' ? [rawItem, {}, false] : rawItem)  as AttributeQueryDataRecordItem
            const [attributeName, subQueryData, onlyRelationData] = item

            // CAUTION 第三元组位（历史遗留的 onlyRelationData 标志）没有任何可工作的实现：
            //  它让 x:n 关联的二阶段查询被跳过，而主查询从不 SELECT x:n 的任何数据——
            //  结果里该属性**静默整体缺失**（既没有实体数据也没有 `&` 关系数据，零告警）。
            //  该标志也没有内部生产点。误传 true（例如把它当成 "is collection" 标记）
            //  必须 fail-fast，而不是静默丢数据。集合形状由关系类型决定，无需任何标记。
            if (onlyRelationData) {
                throw new Error(
                    `attributeQuery for "${this.recordName}.${attributeName}" passes a third tuple element (true). ` +
                    `This legacy "onlyRelationData" flag has no working implementation — it silently drops the whole ` +
                    `attribute from the result. Remove the third element; x:n collections need no marker ` +
                    `(the relation type determines the result shape), and relation data is selected via the '&' key.`
                )
            }

            if (attributeName === LINK_SYMBOL) {
                assert(!!(this.parentRecord && this.attributeName), `parent record and attribute name cannot be empty when query link data, you passed ${this.parentRecord} ${this.attributeName}`)
                const info = this.map.getInfo(this.parentRecord!, this.attributeName!)
                let linkSubQueryData = subQueryData as RecordQueryData
                // CAUTION 对称 n:n 关系的 link 数据会按 :source/:target 两个方向变体查出（fan-out），
                //  反向挂载时必须知道每条 link 的端点才能判定「哪条才是连接到当前父记录的边」——
                //  否则对端的其他边会被错挂（r17 对称查询修复，见 QueryExecutor.findXToManyRelatedRecords）。
                //  这里强制带上端点 id，挂载后再剥除（不属于用户声明的 `&` 数据形状）。
                if (info.isLinkManyToManySymmetric()) {
                    linkSubQueryData = {
                        ...linkSubQueryData,
                        attributeQuery: AttributeQuery.mergeAttributeQueryData(
                            linkSubQueryData.attributeQuery || [],
                            [['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
                        )
                    }
                }
                this.parentLinkRecordQuery = RecordQuery.create(info.linkName, this.map, linkSubQueryData, undefined)
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

                // CAUTION combined（三表合一）x:1 的嵌套读取按「同物理行」编译，本身无法区分
                //  「真实配对」与「偶然同住」（orphan co-tenant / 多 combined 关系装配出的同住，
                //  r28 幻影配对家族）——配对真实性的唯一真相源是 link id 列。这里为 combined x:1
                //  读取自动附带 `&` 的 id（同行列，零 JOIN 开销），结果结构化后由
                //  QueryExecutor.pruneUnpairedCombinedReads 以它为准剪除幻影；用户未请求 `&` 时
                //  该标记随后剥除（syntheticParentLink）。
                // 虚拟 link（link record 自身的 source/target 端点）除外：端点的配对真实性
                // 就是 link 行自身的存在，无需（也无法——虚拟 link 不是 record）以 `&` 判定。
                let syntheticParentLink = false
                if (attributeInfo.isXToOne && attributeInfo.isMergedWithParent() && !attributeInfo.isLinkSourceRelation()) {
                    const hasLinkEntry = (relatedSubQueryData.attributeQuery || []).some(entry => Array.isArray(entry) && entry[0] === LINK_SYMBOL)
                    if (!hasLinkEntry) {
                        relatedSubQueryData = {
                            ...relatedSubQueryData,
                            attributeQuery: [...(relatedSubQueryData.attributeQuery || []), [LINK_SYMBOL, { attributeQuery: ['id'] }]]
                        }
                        syntheticParentLink = true
                    }
                }

                // 在这里判断 filtered relation
                if(attributeInfo.isLinkFiltered()) {
                    // filtered relation 的 attribute。这里需要重新构建 subQueryData，要加上基于关系的 MatchExp。
                    relatedAttributeName = attributeInfo.getBaseAttributeInfo().attributeName
                    const subMatchExp = (subQueryData as RecordQueryData).matchExpression
                    const linkInfo = attributeInfo.getLinkInfo().getBaseLinkInfo()
                    const filteredRelationMatchExp = new MatchExp(linkInfo.name, this.map, attributeInfo.getMatchExpression())
                    const rebasedMatchExp = filteredRelationMatchExp.rebase(attributeInfo.isRecordSource() ? 'target' : 'source')!
                    // CAUTION 用户的 matchExpression 可能是复合 BoolExp（and/or 过的），必须整棵传入。
                    //  取 .data 只对 atom 有意义，复合表达式会得到 undefined 并在 MatchExp.and 中崩溃。
                    const mergedMatchExp = subMatchExp ? rebasedMatchExp.and(subMatchExp) : rebasedMatchExp
                    relatedSubQueryData = {
                        ...subQueryData,
                        matchExpression: mergedMatchExp.data
                    }
                }

                const relatedEntity = RecordQuery.create(attributeInfo.recordName, this.map, relatedSubQueryData, undefined, this.recordName, relatedAttributeName, onlyRelationData, false, attributeName)
                if (syntheticParentLink) {
                    relatedEntity.attributeQuery.syntheticParentLink = true
                }

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
                // parentLink 上只有紧邻的一段对称关系，恒展开为 source/target 两个变体。
                symmetricLinkPaths.forEach((variantPath, i) => {
                    queryFields.push(
                        ...this.parentLinkRecordQuery!.attributeQuery!.getValueAndXToOneRecordFields(variantPath, nextSymmetricLinkNameContext![i])
                    )
                })
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
                const info = this.map.getInfo(this.parentRecord!, this.attributeName!)
                const reverseInfo = info.getReverseInfo()
                // CAUTION 对称 n:n 的 link 数据按 :source/:target 两个方向变体 SELECT
                //  （getValueAndXToOneRecordFields 的 spawn 分支）。查询树负责 JOIN 的构建，
                //  必须与 SELECT 同步展开变体——否则 link 上的嵌套 x:1 实体（如 `&` 内的
                //  source/target 端点）SELECT 引用了带后缀的表别名而 JOIN 没建，
                //  SQL 直接报 "no such column: REL_..._SOURCE_source.*"（r17 假设审计）。
                if (info.isLinkManyToManySymmetric()) {
                    result.addRecord([`${reverseInfo?.attributeName!}:source`, LINK_SYMBOL], this.parentLinkRecordQuery.attributeQuery!.xToOneQueryTree)
                    result.addRecord([`${reverseInfo?.attributeName!}:target`, LINK_SYMBOL], this.parentLinkRecordQuery.attributeQuery!.xToOneQueryTree)
                } else {
                    result.addRecord([reverseInfo?.attributeName!, LINK_SYMBOL], this.parentLinkRecordQuery.attributeQuery!.xToOneQueryTree)
                }
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