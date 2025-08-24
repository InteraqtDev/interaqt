import { EntityIdRef, Database, RecordMutationEvent } from "@runtime";
import { BoolExp } from "@shared";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { assert, setByPath } from "../utils.js";
import { FieldMatchAtom, MatchAtom, MatchExp, MatchExpressionData } from "./MatchExp.js";
import { AttributeQuery, AttributeQueryData, AttributeQueryDataRecordItem } from "./AttributeQuery.js";
import { LINK_SYMBOL, RecordQuery, RecordQueryTree } from "./RecordQuery.js";
import { NewRecordData, RawEntityData } from "./NewRecordData.js";
import { Modifier } from "./Modifier.js";

import { FilteredEntityManager } from "./FilteredEntityManager.js";


export type JoinTables = {
    for: any
    joinSource: [string, string]
    joinIdField: [string, string]
    joinTarget: [string, string]
}[]




class FieldAliasMap {
    aliasToPath: Map<string, string[]> = new Map()
    pathStrToAlias: Map<string, string> = new Map()
    aliasPlaceholder: number=0
    getAlias(path:string[], forceCreate = false) {
        const pathStr = path.join('.')
        const alias = this.pathStrToAlias.get(pathStr)
        if(alias||!forceCreate) return alias

        const newAlias = `FIELD_${this.aliasPlaceholder++}`
        this.pathStrToAlias.set(pathStr, newAlias)
        this.aliasToPath.set(newAlias, path)
        return newAlias
    }
    getPath(alias: string) {
        return this.aliasToPath.get(alias)
    }
}

export type Record = EntityIdRef & {
    [k: string]: any
}

export const ROOT_LABEL = ':root'

export class RecursiveContext {
    constructor(public label: string, public parent?: RecursiveContext, public stack: any[] = []) {

    }
    concat(value: any) {
        return new RecursiveContext(this.label, this.parent, [...this.stack, value])
    }

    getStack(key: string) {
        return [...this.stack]
    }

    spawn(label: string) {
        return new RecursiveContext(label, this)
    }
}

class RecordQueryRef {
    public recordQueryByName = new Map<string, RecordQuery>()

    constructor(public recordQuery: RecordQuery) {
        this.set(ROOT_LABEL, recordQuery)
        this.recursiveSaveLabelledRecordQuery(recordQuery)
    }

    recursiveSaveLabelledRecordQuery(recordQuery: RecordQuery) {
        recordQuery.attributeQuery?.relatedRecords.forEach((relatedRecordQuery) => {
            if (relatedRecordQuery.label) {
                this.set(relatedRecordQuery.label, relatedRecordQuery)
                this.recursiveSaveLabelledRecordQuery(relatedRecordQuery)
            }
        })
    }

    set(key: string, value: any) {
        this.recordQueryByName.set(key, value)
    }

    get(key: string) {
        return this.recordQueryByName.get(key)
    }

}

export type PlaceholderGen = (name?: string) => string

export class RecordQueryAgent {
    getPlaceholder: () => PlaceholderGen
    private filteredEntityManager: FilteredEntityManager
    
    constructor(public map: EntityToTableMap, public database: Database) {
        this.getPlaceholder = database.getPlaceholder || (() => (name?:string) => `?`)
        this.filteredEntityManager = new FilteredEntityManager(map, this)
        this.initializeFilteredEntityDependencies()
    }
    
    /**
     * 初始化所有 filtered entity 的依赖关系
     */
    private initializeFilteredEntityDependencies() {
        const records = this.map.data.records
        
        for (const [recordName, recordData] of Object.entries(records)) {
            if (recordData.baseRecordName && recordData.matchExpression) {
                // 使用预计算的值
                const rootEntityName = recordData.resolvedBaseRecordName || recordData.baseRecordName;
                const combinedExpression = recordData.resolvedMatchExpression || recordData.matchExpression;
                
                this.filteredEntityManager.analyzeDependencies(
                    recordName,
                    rootEntityName,
                    combinedExpression
                )
            }
        }
    }

    // 有 prefix 说明是比人的子查询
    buildXToOneFindQuery(recordQuery: RecordQuery, prefix = '', parentP?:PlaceholderGen): [string, any[], FieldAliasMap] {
        // 从所有条件里面构建出 join clause
        const fieldQueryTree = recordQuery.attributeQuery!.xToOneQueryTree

        const matchQueryTree = recordQuery.matchExpression.xToOneQueryTree
        const finalQueryTree = fieldQueryTree.merge(matchQueryTree)
        const joinTables = this.getJoinTables(finalQueryTree, [recordQuery.recordName])

        const p = parentP||this.getPlaceholder()

        const fieldMatchExp = recordQuery.matchExpression.buildFieldMatchExpression(p, this.database)

        const [whereClause, params] = this.buildWhereClause(this.parseMatchExpressionValue(recordQuery.recordName, fieldMatchExp, recordQuery.contextRootEntity, p), prefix, p)

        const [selectClause, fieldAliasMap] = this.buildSelectClause(recordQuery.attributeQuery.getValueAndXToOneRecordFields(), prefix)
        const fromClause = this.buildFromClause(recordQuery.recordName, prefix)
        const joinClause = this.buildJoinClause(joinTables, prefix)
        const modifierClause = this.buildModifierClause(recordQuery.modifier, prefix, fieldAliasMap)

        return [`
SELECT
${selectClause}
FROM
${fromClause}
${joinClause}
WHERE
${whereClause}

${modifierClause}
`,
            params,
            fieldAliasMap
        ]


    }

    buildModifierClause(modifier: Modifier, prefix: string = '', fieldAliasMap: FieldAliasMap) {
        const {limit, offset, orderBy} = modifier
        const clauses = []
        if (orderBy.length) {
            
            clauses.push(`ORDER BY ${orderBy.map(({attribute, recordName, order}) => {
                const fieldPath = [
                    `${this.withPrefix(prefix)}${recordName}`,
                    attribute
                ]
                const field = fieldAliasMap.getAlias(fieldPath) || fieldPath.join('.')
                return `"${field}" ${order}`
            }).join(',')}`)
        }

        if (limit) {
            clauses.push(`LIMIT ${limit}`)
        }
        if (offset) {
            clauses.push(`OFFSET ${offset}`)
        }



        return clauses.join('\n')
    }


    structureRawReturns(rawReturns: { [k: string]: any }[], JSONFields: string[], fieldAliasMap: FieldAliasMap) {
        return rawReturns.map(rawReturn => {
            const obj = {}
            Object.entries(rawReturn).forEach(([key, value]) => {
                // CAUTION 注意这里去掉了最开始的 entityName
                const attributePath = fieldAliasMap.getPath(key)!.slice(1, Infinity)
                if (attributePath.length === 1 && JSONFields.includes(attributePath[0]) && typeof value === 'string') {
                    value = JSON.parse(value)
                }
                if (value !== null) {
                    setByPath(obj, attributePath, value)
                }
            })
            return obj
        })
    }

    // 查 entity 和 查 relation 都是一样的。具体在 entityQuery 里面区别。
    // TODO 为了性能，也可以把信息丢到客户端，然客户端去结构化？？？

    // CAUTION findRelatedRecords 中的递归调用会使得 includeRelationData 变为 true
    async findRecords(entityQuery: RecordQuery, queryName = '', recordQueryRef?: RecordQueryRef, context: RecursiveContext = new RecursiveContext(ROOT_LABEL)): Promise<Record[]> {
        // 一定在一开始的时候就创建 findContext ，并且是通过直接遍历 entityQuery 拿到原始的 label 的 recordQuery，因为后面
        //  拿不到原始的了，都会带上 parent 的 id，会产生叠加 parent id match 的问题
        if (!recordQueryRef) {
            recordQueryRef = new RecordQueryRef(entityQuery)
        }

        if (entityQuery.goto) {
            // 执行用户的手动退出判断。
            if (entityQuery.exit && await entityQuery.exit(context)) {
                return []
            }


            const gotoQuery = recordQueryRef.get(entityQuery.goto)!
            assert(gotoQuery, `goto ${entityQuery.goto} not found`)
            // 需要把 gotoQuery 和当前 query 中的 matchExpression 合并，因为当前 query 的 matchExpression 有递归的条件，例如 parent.id === xxx。
            const matchExpWithParent = entityQuery.matchExpression.and(gotoQuery.matchExpression!)
            //   统一在这里面处理 gotoQuery 和当前的合并，这样其他的抵用就只需要管好递归中和 parent 的 id 的关系就行了。
            const newQuery = gotoQuery.derive({
                matchExpression: matchExpWithParent
            })
            return this.findRecords(newQuery!, queryName, recordQueryRef, context)
        }

        // 检查一下是否已经产生了循环。因为所有的子查询都会以这个函数为入口，所以可以再这里判断。
        if (entityQuery.label && context.label === entityQuery.label && context.stack.length > 1) {
            if (context.stack[0].id === context.stack.at(-1).id) {
                return []
            }
        }

        // findRecords 的一个 join 语句里面只能一次性搞定 x:1 的关联实体，以及关系上的 x:1 关联实体。
        // 0. 这里只通过合表或者 join  处理了 x:1 的关联查询，包括了 parentLinkRecordQuery 上字段的查询，以及从 parentLink 发出可以看做是 x:1 的关联字段查询。
        //  这个 x:1 是递归的，把一次性能通过 join 查到的都查了。
        // x:n 的查询是通过二次查询获取的。
        const [querySQL, params, fieldAliasMap] = this.buildXToOneFindQuery(entityQuery, '')
        const records = this.structureRawReturns(await this.database.query(querySQL, params, queryName), this.map.getRecordInfo(entityQuery.recordName).JSONFields, fieldAliasMap) as any[]

        // 如果当前的 query 有 label，那么下面任何遍历 record 的地方都要 Push stack。
        const nextRecursiveContext = (entityQuery.label && entityQuery.label !== context.label) ? context.spawn(entityQuery.label) : context

        // 第一步的 x:1 的递归形式的查询，相当与一个递归的减掉了所有 x:n 枝干的查询，我们也得递归的把所有 x:n 枝干补出来才行，不只是 parentLink 上的。
        // 1. 补全所有 x:1 查询主干上的 x:n 关联实体及关系查询
        this.completeXToOneLeftoverRecords(entityQuery, records, recordQueryRef, nextRecursiveContext)

        

        // x:1 关系上的递归 字段查询。因为是递归所以可能不会 join，不会在 buildXToOneFindQuery 里。所以单独查询。
        for (let subEntityQuery of entityQuery.attributeQuery.xToOneRecords) {
            // FIXME 这里的判断逻辑和 goto 耦合太重了？其他地方都是用 关系的类型 去判断的。
            if (subEntityQuery.goto) {
                const info = this.map.getInfo(subEntityQuery.parentRecord!, subEntityQuery.attributeName!)
                const reverseAttributeName = info.getReverseInfo()?.attributeName
                for (let record of records) {
                    const matchWithParentId = subEntityQuery.matchExpression.and({
                        key: `${reverseAttributeName}.id`,
                        value: ['=', record.id]
                    })
                    const subGotoQueryWithParentMatch = subEntityQuery.derive({
                        matchExpression: matchWithParentId
                    })

                    const nextContext = entityQuery.label ? nextRecursiveContext.concat(record) : nextRecursiveContext
                    record[subEntityQuery.alias || subEntityQuery.attributeName!] = await this.findRecords(subGotoQueryWithParentMatch, queryName, recordQueryRef, nextContext)
                }
            }
        }


        // 2. x:1 上的 关系的 x:many关联实体 查询
        for (let subEntityQuery of entityQuery.attributeQuery.xToOneRecords) {
            // x:1 上的关系
            const subLinkRecordQuery = subEntityQuery.attributeQuery.parentLinkRecordQuery
            if (subLinkRecordQuery) {
                // 关系上的 xToMany 查询
                for (let subEntityQueryOfSubLink of subLinkRecordQuery.attributeQuery.xToManyRecords) {

                    const linkRecordAttributeInfo = this.map.getInfo(subEntityQueryOfSubLink.parentRecord!, subEntityQueryOfSubLink.attributeName!)
                    const linkRecordReverseAttributeName = linkRecordAttributeInfo.getReverseInfo()?.attributeName

                    for (let record of records) {
                        // 限制 link.id
                        const linkRecordId = record[subEntityQuery.attributeName!][LINK_SYMBOL].id
                        const queryOfThisRecord = subEntityQueryOfSubLink.derive({
                            matchExpression: subEntityQueryOfSubLink.matchExpression!.and({
                                key: `${linkRecordReverseAttributeName}.id`,
                                value: ['=', linkRecordId]
                            })
                        })

                        const nextContext = entityQuery.label ? nextRecursiveContext.concat(record) : nextRecursiveContext

                        setByPath(
                            record,
                            [subEntityQuery.alias || subEntityQuery.attributeName!, LINK_SYMBOL, subEntityQueryOfSubLink.attributeName!],
                            await this.findRecords(
                                queryOfThisRecord,
                                `finding relation data: ${entityQuery.recordName}.${subEntityQuery.attributeName}.&.${subEntityQueryOfSubLink.attributeName}`,
                                recordQueryRef,
                                nextContext
                            )
                        )
                    }
                }
            }
        }

        // 3. x:n 关联实体的查询
        for (let subEntityQuery of entityQuery.attributeQuery.xToManyRecords) {
            // XToMany 的 relationData 是在上面 buildFindQuery 一起查完了的
            if (!subEntityQuery.onlyRelationData) {
                for (let record of records) {
                    const nextContext = entityQuery.label ? nextRecursiveContext.concat(record) : nextRecursiveContext
                    record[subEntityQuery.alias || subEntityQuery.attributeName!] = await this.findXToManyRelatedRecords(
                        entityQuery.recordName,
                        subEntityQuery.attributeName!,
                        record.id,
                        subEntityQuery,
                        recordQueryRef,
                        nextContext
                    )
                }
            }
        }
        return records
    }
    async completeXToOneLeftoverRecords(entityQuery: RecordQuery, records: Record[], recordQueryRef: RecordQueryRef, context: RecursiveContext) {
        // 1. 补全 parentLinkRecordQuery 上的 x:1 关联实体上剩下的 x:n 关联实体的查询
        if (entityQuery.attributeQuery.parentLinkRecordQuery) {
            const info = this.map.getInfo(entityQuery.parentRecord!, entityQuery.attributeName!)
            const reverseAttributeName = info.getReverseInfo()?.attributeName!

            for(let xToOneSubQuery of entityQuery.attributeQuery.parentLinkRecordQuery.attributeQuery.xToOneRecords) {
                for(let xToManySubSubQuery of xToOneSubQuery.attributeQuery.xToManyRecords) {
                    for(let record of records) {
                        const nextContext = entityQuery.label ? context.concat(record) : context
                        record[reverseAttributeName][LINK_SYMBOL][xToOneSubQuery.attributeName!][xToManySubSubQuery.attributeName!] = await this.findXToManyRelatedRecords(
                            xToManySubSubQuery.parentRecord!,
                            xToManySubSubQuery.attributeName!,
                            record[reverseAttributeName][LINK_SYMBOL][xToOneSubQuery.attributeName!].id,
                            xToManySubSubQuery,
                            recordQueryRef,
                            nextContext
                        )
                    }
                }
            }
        }

        // 2. 补全 x:1 的关联实体上的 x:n 关联查询
        for(let xToOneSubQuery of entityQuery.attributeQuery.xToOneRecords) {
            for (let xToManySubSubQuery of xToOneSubQuery.attributeQuery.xToManyRecords) {
                for(let record of records) {
                    const nextContext = entityQuery.label ? context.concat(record) : context
                    record[xToOneSubQuery.attributeName!][xToManySubSubQuery.attributeName!] = await this.findXToManyRelatedRecords(
                        xToManySubSubQuery.parentRecord!,
                        xToManySubSubQuery.attributeName!,
                        record[xToOneSubQuery.attributeName!].id,
                        xToManySubSubQuery,
                        recordQueryRef,
                        nextContext
                    )
                }
            }

            // 3. 继续递归 complete x:1 关联实体上的 x:1 关联查询
            for(let xToOneSubSubQuery of xToOneSubQuery.attributeQuery.xToOneRecords) {
                for(let record of records) {
                    const nextContext = entityQuery.label ? context.concat(record) : context
                    await this.completeXToOneLeftoverRecords(xToOneSubSubQuery, [].concat(record[xToOneSubQuery.attributeName!]), recordQueryRef, nextContext)
                }
            }
        }
    }

    // CAUTION 任何两个具体的实体之间只能有一条关系，但是可以在关系上有多条数据。1:n 的数据

    async findXToManyRelatedRecords(recordName: string, attributeName: string, recordId: string, relatedRecordQuery: RecordQuery, recordQueryRef: RecordQueryRef, context: RecursiveContext) {
        const info = this.map.getInfo(recordName, attributeName)
        const reverseAttributeName = info.getReverseInfo()?.attributeName!

        // FIXME 对 n:N 关联实体的查询中，也可能会引用主实体的值，例如：age < '$host.age'。这个时候值已经是确定的了，应该作为 context 传进来，替换掉原本的 matchExpression
        const newMatch = relatedRecordQuery.matchExpression.and({
            key: `${reverseAttributeName}.id`,
            // 这里不能用 EXIST，因为 EXIST 会把 join 变成子查询，而我们还需要关系上的数据，不能用子查询
            value: ['=', recordId]
        })


        const newAttributeQuery = relatedRecordQuery.attributeQuery.parentLinkRecordQuery ?
            relatedRecordQuery.attributeQuery.withParentLinkData() :
            relatedRecordQuery.attributeQuery
        const newSubQuery = relatedRecordQuery.derive({
            matchExpression: newMatch,
            attributeQuery: newAttributeQuery,
        })


        // CAUTION 注意这里的第二个参数。因为任何两个具体的实体之间只能有一条关系。所以即使是 n:n 和关系表关联上时，也只有一条关系数据，所以这里可以带上 relation data。
        // 1. 查询 x:n 的实体，以及和父亲的关联关系上的 x:1 的数据
        const data = (await this.findRecords(newSubQuery, `finding related record: ${relatedRecordQuery.parentRecord}.${relatedRecordQuery.attributeName}`, recordQueryRef, context))
        // 1.1 这里再反向处理一下关系数据。因为在上一步 withParentLinkData 查出来的时候是用的是反向的关系名字
        const records = relatedRecordQuery.attributeQuery.parentLinkRecordQuery ? data.map(item => {
            let itemWithParentLinkData: Record
            if (!info.isLinkManyToManySymmetric()) {
                itemWithParentLinkData = {
                    ...item,
                    [LINK_SYMBOL]: item[reverseAttributeName][LINK_SYMBOL]
                }
                delete itemWithParentLinkData[reverseAttributeName]
            } else {
                // TODO 是不是有更优雅的判断？？？
                // CAUTION 对称 n:n 关系，和父亲也只有一个方向是有的。
                itemWithParentLinkData = {
                    ...item,
                    [LINK_SYMBOL]: item[`${reverseAttributeName}:source`]?.[LINK_SYMBOL]?.id ?
                        item[`${reverseAttributeName}:source`]?.[LINK_SYMBOL] :
                        item[`${reverseAttributeName}:target`]?.[LINK_SYMBOL]
                }
                delete itemWithParentLinkData[`${reverseAttributeName}:source`]
                delete itemWithParentLinkData[`${reverseAttributeName}:target`]
            }

            return itemWithParentLinkData
        }) : data

        const nextRecursiveContext = (newSubQuery.label && newSubQuery.label !== context.label) ? context.spawn(newSubQuery.label) : context

        // 1.2 和父亲的关联关系上的 x:n 的数据
        const parentLinkRecordQuery = relatedRecordQuery.attributeQuery.parentLinkRecordQuery
        if (parentLinkRecordQuery) {
            // 关系上的 xToMany 查询
            for (let subEntityQueryOfLink of parentLinkRecordQuery.attributeQuery.xToManyRecords) {
                for (let record of records) {
                    // 应该已经有了和父亲 link 的 id。
                    // CAUTION 注意这里用了上面处理过路径
                    const linkId = record[LINK_SYMBOL].id

                    const nextContext = newSubQuery.label ? nextRecursiveContext.concat(record) : nextRecursiveContext

                    // 查找这个 link 的 x:n 关联实体
                    setByPath(
                        record,
                        [LINK_SYMBOL, subEntityQueryOfLink.attributeName!],
                        await this.findXToManyRelatedRecords(
                            subEntityQueryOfLink.parentRecord!,
                            subEntityQueryOfLink.attributeName!,
                            linkId,
                            subEntityQueryOfLink,
                            recordQueryRef,
                            nextContext
                        )
                    )
                }
            }
        }

        return records
    }

    // 根据 queryTree 来获得 join table 的信息。因为 queryTree 是树形，所以这里也是个递归结构。
    getJoinTables(queryTree: RecordQueryTree, context: string[] = [], parentInfos?: [string, string, string]): JoinTables {
        // 应该是深度 遍历？
        const result: JoinTables = []
        if (!parentInfos) {
            //  context 里面至少会有 entityName 这一个值。
            const parentNamePath = [context[0]]
            const [parentAlias, parentIdField, parentTable] = this.map.getTableAliasAndFieldName(parentNamePath, 'id')
            parentInfos = [parentIdField, parentTable, parentAlias]
        }

        const [parentIdField, ...parentTableAndAlias] = parentInfos


        queryTree.forEachRecords((subQueryTree) => {

            const entityAttributeName = subQueryTree.attributeName!

            const attributeInfo = subQueryTree.info!
            assert(attributeInfo.isRecord, `${context.concat(entityAttributeName).join('.')} is not a record`)

            const currentNamePath = context.concat(entityAttributeName)
            const {
                table: currentTable,
                alias: currentTableAlias,
                linkTable: relationTable,
                linkAlias: relationTableAlias
            } = this.map.getTableAndAliasStack(currentNamePath).at(-1)!
            // CAUTION 特别注意最后一个参数，这是真的要连接实体表的时候就能拿用 shrink 的 id 了。
            const [, idField] = this.map.getTableAliasAndFieldName(currentNamePath, 'id', true)
            // 这里的目的是把 attribute 对应的 record table 找到，并且正确 join 进来。
            // join 本质上是把当前的路径和上一级路径连起来。
            // 这里只处理没有和上一个节点 三表合一 的情况。三表合一的情况不需要 join。复用 alias 就行
            if (!attributeInfo.isMergedWithParent()) {
                if (attributeInfo.isLinkMergedWithParent()) {
                    // CAUTION 如果只要获取 id, 不需要 join, map.getTableAliasAndFieldName 会自动解析到合并后的 field 上。
                    if (subQueryTree.onlyIdField()) return

                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
                        joinIdField: [attributeInfo.linkField!, idField],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else if (attributeInfo.isLinkMergedWithAttribute()) {
                    const reverseAttributeInfo = attributeInfo.getReverseInfo()!
                    // 说明记录在对方的 field 里面
                    assert(!!reverseAttributeInfo.linkField!, `${reverseAttributeInfo.parentEntityName}.${reverseAttributeInfo.attributeName} has no field`)
                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
                        // 这里要找当前实体中用什么 attributeName 指向上一个实体
                        joinIdField: [parentIdField, reverseAttributeInfo.linkField!],
                        joinTarget: [currentTable, currentTableAlias]
                    })
                } else {
                    // 说明记录在了 relation record 的 source/target 中
                    const linkInfo = attributeInfo.getLinkInfo()
                    const isCurrentRelationSource =
                        attributeInfo.isLinkManyToManySymmetric() ?
                            (attributeInfo.symmetricDirection === 'source') :
                            linkInfo.isRelationSource(attributeInfo.parentEntityName, attributeInfo.attributeName)
                    // 关系表独立
                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
                        // CAUTION sourceField 是用在合并了情况里面的，指的是 target 在 source 里面的名字！所以这里不能用
                        joinIdField: [parentIdField, isCurrentRelationSource ? linkInfo.record.attributes.source.field! : linkInfo.record.attributes.target.field!],
                        joinTarget: [relationTable!, relationTableAlias!]
                    })

                    // CAUTION 只有当还要继续获取除 id 的部分时，才要 join 实体表。
                    if (!subQueryTree.onlyIdField()) {
                        result.push({
                            for: currentNamePath,
                            joinSource: [relationTable!, relationTableAlias!],
                            joinIdField: [isCurrentRelationSource ? linkInfo.record.attributes.target.field! : linkInfo.record.attributes.source.field!, idField],
                            joinTarget: [currentTable, currentTableAlias]
                        })
                    }
                }
            }


            result.push(...this.getJoinTables(subQueryTree, currentNamePath, [idField!, currentTable!, currentTableAlias!]))

            if (subQueryTree.parentLinkQueryTree) {

            }

            // 处理 link 上的 query。如果只要 id, 那么在上面实体链接的时候就已经有了
            if (subQueryTree.parentLinkQueryTree && !subQueryTree.parentLinkQueryTree.onlyIdField()) {
                // 连接 link 和它的子节点
                const linkNamePath = currentNamePath.concat(LINK_SYMBOL)
                const [, linkIdField] = this.map.getTableAliasAndFieldName(linkNamePath, 'id', true)
                const linkParentInfo: [string, string, string] = [
                    linkIdField!,// link 的 idField
                    relationTable!, // link 的 tableName
                    relationTableAlias!, // link 的 tableAlias
                ]

                result.push(...this.getJoinTables(subQueryTree.parentLinkQueryTree, linkNamePath, linkParentInfo))

            }
        })


        return result
    }

    withPrefix(prefix = '') {
        return prefix ? `${prefix}___` : ''
    }

    buildSelectClause(queryFields: ReturnType<AttributeQuery["getValueAndXToOneRecordFields"]>, prefix = ''): [string, FieldAliasMap] {

        const fieldAliasMap= new FieldAliasMap()

        if (!queryFields.length) return ['1', fieldAliasMap]

        // CUATION 这里创建 fieldAliasMap 是因为有的数据库里标识符有长度限制，例如 PGLite限制为63，由于alias 是拼出来的路径，很可能会过长。
        let aliasPlaceholder = 0
        // CAUTION 所有 entity 都要 select id
        const aliasClauses= queryFields.map(({tableAliasAndField, attribute, nameContext}) => {
            const path = [
                `${this.withPrefix(prefix)}${nameContext[0]}`,
                ...nameContext.slice(1, Infinity),
                attribute
            ]
            const aliasName = fieldAliasMap.getAlias(path, true)
            return (
                `"${this.withPrefix(prefix)}${tableAliasAndField[0]}"."${tableAliasAndField[1]}" AS "${aliasName}"`
            ) 
        })
        
        return [aliasClauses.join(',\n'), fieldAliasMap]
    }

    buildFromClause(entityName: string, prefix = '') {
        const recordInfo = this.map.getRecordInfo(entityName)
        return `"${recordInfo.table}" AS "${this.withPrefix(prefix)}${entityName}"`
    }

    buildJoinClause(joinTables: JoinTables, prefix = '') {
        return joinTables.map(({joinSource, joinIdField, joinTarget}) => {
            return `LEFT JOIN "${joinTarget[0]}" AS 
"${this.withPrefix(prefix)}${joinTarget[1]}" ON 
"${this.withPrefix(prefix)}${joinSource[1]}"."${joinIdField[0]}" = "${this.withPrefix(prefix)}${joinTarget[1]}"."${joinIdField[1]}"
`
        }).join('\n')
    }

    buildWhereClause(fieldMatchExp: BoolExp<FieldMatchAtom> | null, prefix = '', p: PlaceholderGen): [string, any[]] {
        let sql = ``
        const values = []
        if (!fieldMatchExp) return [`1=${p()}`, [1]]

        if (fieldMatchExp.isAtom()) {
            if (fieldMatchExp.data.isInnerQuery) {
                sql = fieldMatchExp.data.fieldValue!
                values.push(...fieldMatchExp.data.fieldParams!)
            } else {
                sql = `"${this.withPrefix(prefix)}${fieldMatchExp.data.fieldName![0]}"."${fieldMatchExp.data.fieldName![1]}" ${fieldMatchExp.data.fieldValue}`
                values.push(...fieldMatchExp.data.fieldParams!)
            }
        } else {
            if (fieldMatchExp.isAnd()) {
                const [leftSql, leftValues] = this.buildWhereClause(fieldMatchExp.left, prefix, p)
                const [rightSql, rightValues] = this.buildWhereClause(fieldMatchExp.right!, prefix, p)
                sql = `(${leftSql} AND ${rightSql})`
                values.push(...leftValues, ...rightValues)
            } else if (fieldMatchExp.isOr()) {
                const [leftSql, leftValues] = this.buildWhereClause(fieldMatchExp.left, prefix, p)
                const [rightSql, rightValues] = this.buildWhereClause(fieldMatchExp.right!, prefix, p)
                sql = `(${leftSql} OR ${rightSql})`
                values.push(...leftValues, ...rightValues)
            } else {
                const [leftSql, leftValues] = this.buildWhereClause(fieldMatchExp.left, prefix, p)
                sql = `NOT (${leftSql})`
                values.push(...leftValues)
            }
        }
        return [sql, values]
    }

    // 把 match 中的 exist 创建成子 sql
    parseMatchExpressionValue(entityName: string, fieldMatchExp: BoolExp<FieldMatchAtom> | null, contextRootEntity: string|undefined, p: PlaceholderGen): BoolExp<FieldMatchAtom> | null {
        if (!fieldMatchExp) return null

        return fieldMatchExp.map((exp: BoolExp<FieldMatchAtom>, context: string[]) => {
            assert(Array.isArray(exp.data.value), `match value is not a array ${context.join('.')}`)

            if (!exp.data.isFunctionMatch) return {...exp.data}

            assert(exp.data.value[0].toLowerCase() === 'exist', `we only support Exist function match on entity for now. yours: ${exp.data.key} ${exp.data.value[0]} ${exp.data.value[1]}`)

            const info = this.map.getInfoByPath(exp.data.namePath!)!
            const {alias: currentAlias} = this.map.getTableAndAliasStack(exp.data.namePath!).at(-1)!
            const reverseAttributeName = this.map.getReverseAttribute(info.parentEntityName, info.attributeName)

            // 注意这里去掉了 namePath 里面根部的 entityName，因为后面计算 referenceValue 的时候会加上。
            const parentAttributeNamePath = exp.data.namePath!.slice(1, -1)

            const existEntityQuery = RecordQuery.create(info.recordName, this.map, {
                    matchExpression: MatchExp.atom({
                        key: `${reverseAttributeName}.id`,
                        value: ['=', parentAttributeNamePath.concat('id').join('.')],
                        isReferenceValue: true
                    }).and(exp.data.value[1])
                },
                // 如果上层还有，就继承上层的，如果没有， context 就只这一层。这个变量是用来给 matchExpression 里面的 value 来引用上层的值的。
                //  例如查询用户，要求他存在一个朋友的父母的年龄是小于这个用户。对朋友的父母的年龄匹配中，就需要引用最上层的 alias。
                contextRootEntity || entityName
            )

            const [innerQuerySQL, innerParams] = this.buildXToOneFindQuery(existEntityQuery, currentAlias, p)

            return {
                ...exp.data,
                isInnerQuery: true,
                fieldValue: `
EXISTS (
${innerQuerySQL}
)
`,
                fieldParams: innerParams,
            }
        })
    }


    async createRecordDependency(newRecordData: NewRecordData, events?: RecordMutationEvent[]): Promise<NewRecordData> {
        const newRecordDataWithDeps: { [k: string]: EntityIdRef } = {}
        // 处理往自身合并的需要新建的关系和 record
        for (let mergedLinkTargetRecord of newRecordData.mergedLinkTargetNewRecords.concat(newRecordData.mergedLinkTargetRecordIdRefs)) {
            let newDepIdRef
            if (!mergedLinkTargetRecord.isRef()) {
                newDepIdRef = await this.createRecord(mergedLinkTargetRecord, `create merged link dep record ${newRecordData.recordName}.${mergedLinkTargetRecord.info?.attributeName}`, events)
            } else {
                newDepIdRef = mergedLinkTargetRecord.getRef()
            }
            newRecordDataWithDeps[mergedLinkTargetRecord.info!.attributeName] = newDepIdRef

            if (mergedLinkTargetRecord.linkRecordData) {
                // 为 link 也要把 dependency 准备好。
                const newLinkRecordData = mergedLinkTargetRecord.linkRecordData.merge({
                    [mergedLinkTargetRecord.info!.isRecordSource() ? 'target' : 'source']: newDepIdRef
                })
                // 所有 Link dep 也准备好了
                const newLinkRecordDataWithDep = await this.createRecordDependency(newLinkRecordData)

                newRecordDataWithDeps[mergedLinkTargetRecord.info!.attributeName][LINK_SYMBOL] = newLinkRecordDataWithDep.getData()
            }
        }

        // 处理和我三表合一的 link record 的 dependency
        for (let combinedRecord of newRecordData.combinedNewRecords.concat(newRecordData.combinedRecordIdRefs)) {
            if (combinedRecord.linkRecordData) {
                const newLinkRecordDataWithDep = await this.createRecordDependency(combinedRecord.linkRecordData, events)
                newRecordDataWithDeps[combinedRecord.info!.attributeName!] = {
                    // 注意这里原本的数据不能丢，因为下面的 merge 不是深度 merge。
                    ...combinedRecord.getData() as EntityIdRef,
                    [LINK_SYMBOL]: newLinkRecordDataWithDep.getData()
                }
            }
        }

        // 返回追备好 link 数据和准备好 record 数据的新 newRecordData
        return newRecordData.merge(newRecordDataWithDeps)
    }

    async createRecord(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)
        const newRecordIdRef = await this.insertSameRowData(newEntityDataWithDep, queryName, events)

        const relianceResult = await this.handleCreationReliance(newEntityDataWithDep.merge(newRecordIdRef), events)

        // 合并所有数据以获得完整的记录
        const fullRecord = Object.assign({}, newEntityData.getData(), newRecordIdRef, relianceResult);

        // 处理 filtered entity - 检查新创建的记录是否属于任何 filtered entity
        // 传递 isCreation = true 表示这是创建操作，只生成事件但不持久化 __filtered_entities
        await this.filteredEntityManager.updateFilteredEntityFlags(newEntityData.recordName, newRecordIdRef.id, events, fullRecord, true)

        // 更新 relianceResult 的信息到
        return Object.assign(newRecordIdRef, relianceResult)
    }

    // CAUTION 因为这里分配了 id，并且所有的判断逻辑都在，所以事件也放在这里处理，而不是真实插入或者更新数据的时候。
    async preprocessSameRowData(newEntityData: NewRecordData, isUpdate = false, events?: RecordMutationEvent[], oldRecord?: Record): Promise<NewRecordData> {
        const newRawDataWithNewIds = newEntityData.getData()
        // CAUTION 特别注意，我们是支持数据使用 外部  id，例如使用外部用户系统的时候，它的  id 就是外部分配的。
        //  还有一种情况是 relocate record 的时候也用了这个函数，这个时候也是不要重新分配 id 的！
        //  也正是因为如此，所以我们通过一个参数 isUpdate 显式声明到底是不是 update，不能用有没有 id 来判断！
        if (!isUpdate && !newRawDataWithNewIds.id) {
            // 为自己分配 id，一定要在最前面，因为后面记录link 事件的地方一定要有 target/source 的 id
            newRawDataWithNewIds.id = await this.database.getAutoId(newEntityData.recordName)
        } else if(isUpdate && !newRawDataWithNewIds.id) {
            // 因为用户传进来的 update 字段里面可能没有 id 字段，所以这里要加上。
            // newRawDataWithNewIds 用在了后面的 event 里面，保证有 id 才正确。外部可能会从 event 里面读。
            newRawDataWithNewIds.id = oldRecord!.id
        }

        if (!isUpdate) {
            events?.push({
                type: 'create',
                recordName: newEntityData.recordName,
                record: {
                    ...newEntityData.defaultValues,
                    ...newRawDataWithNewIds
                }
            })
        } else {
            // 可能只是更新关系，所以这里一定要有自身的 value 才算是 update 自己
            if (newEntityData.valueAttributes.length) {
                events?.push({
                    type: 'update',
                    recordName: newEntityData.recordName,
                    record: {...newEntityData.getData()!, id: oldRecord!.id},
                    oldRecord: oldRecord
                })
            }
        }

        // 1. 先为三表合一的新数据分配 id
        for (let record of newEntityData.combinedNewRecords) {
            newRawDataWithNewIds[record.info!.attributeName] = {
                ...newRawDataWithNewIds[record.info!.attributeName],
                id: await this.database.getAutoId(record.info!.recordName!),
            }
            events?.push({
                type: 'create',
                recordName: record.recordName,
                record: newRawDataWithNewIds[record.info!.attributeName]
            })
        }

        // 2. 为我要新建 三表合一、或者我 mergedLink 的 的 关系 record 分配 id.
        for (let record of newEntityData.mergedLinkTargetNewRecords.concat(newEntityData.mergedLinkTargetRecordIdRefs, newEntityData.combinedNewRecords)) {
            if (newRawDataWithNewIds[record.info!.attributeName].id !== oldRecord?.[record.info!.attributeName]?.id) {
                newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL] = {
                    ...(newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL] || {}),
                    id: await this.database.getAutoId(record.info!.linkName!),
                }

                const linkRecord = {...newRawDataWithNewIds[record.info!.attributeName][LINK_SYMBOL]}
                linkRecord[record.info!.isRecordSource() ? 'target' : 'source'] = record.getData()
                linkRecord[record.info!.isRecordSource() ? 'source' : 'target'] = {...newRawDataWithNewIds}
                delete linkRecord.target[LINK_SYMBOL]
                delete linkRecord.source[LINK_SYMBOL]


                events?.push({
                    type: 'create',
                    recordName: record.info!.linkName,
                    record: linkRecord
                })
            }
        }

        // FIXME 如果不同，才需要 merge。现在不知道为什么 relation 和 source 记录上出现了个 & 关系数据。
        const newEntityDataWithIds = newEntityData.merge(newRawDataWithNewIds)

        // 2. 处理需要 flashOut 的数据
        // TODO create 的情况下，有没可能不需要 flashout 已有的数据，直接更新到已有的 combined record 的行就行了。
        const flashOutRecordRasData: { [k: string]: RawEntityData } = await this.flashOutCombinedRecordsAndMergedLinks(
            newEntityData,
            events,
            `finding combined records for ${newEntityData.recordName} to flash out, for ${isUpdate ? 'updating' : 'creation'} with data ${JSON.stringify(newEntityDataWithIds.getData())}`
        )

        return newEntityDataWithIds.merge(flashOutRecordRasData)
    }

    async flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason = ''): Promise<{ [k: string]: RawEntityData }> {
        const result: { [k: string]: RawEntityData } = {}
        // CAUTION 这里是从 newEntityData 里读，不是从 newEntityDataWithIds，那里面是刚分配id 的，还没数据。
        let match: MatchExpressionData | undefined
        // 这里的目的是抢夺 combined record 上的所有数据，那么一定穷尽 combined record 的同表数据才行。
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(newEntityData.recordName, this.map, true, true, false, true)
        for (let combinedRecordIdRef of newEntityData.combinedRecordIdRefs) {
            const attributeIdMatchAtom: MatchAtom = {
                key: `${combinedRecordIdRef.info!.attributeName!}.id`,
                value: ['=', combinedRecordIdRef.getRef().id]
            }
            if (!match) {
                match = MatchExp.atom(attributeIdMatchAtom)
            } else {
                match = match.or(attributeIdMatchAtom)
            }
        }

        const recordQuery = RecordQuery.create(newEntityData.recordName, this.map, {
            matchExpression: match,
            attributeQuery: attributeQuery,
        }, undefined, undefined, undefined, false, true)

        const recordsWithCombined = await this.findRecords(recordQuery, reason, undefined)


        // const hasNoConflict = recordsWithCombined.length === 1 && !recordsWithCombined[0].id
        // 开始 merge 数据，并记录 unLink 事件
        for (let recordWithCombined of recordsWithCombined) {
            for (let combinedRecordIdRef of newEntityData.combinedRecordIdRefs) {
                if (recordWithCombined[combinedRecordIdRef.info?.attributeName!]) {

                    // TODO 如果没有冲突的话，可以不用删除原来的数据。外面直接更新这一行就行了
                    //1. 删掉 combined 原来的所有同行数据
                    await this.deleteRecordSameRowData(combinedRecordIdRef.recordName, [{id: recordWithCombined[combinedRecordIdRef.info?.attributeName!].id}])

                    //2. 如果是抢夺，要记录一下事件。
                    if (recordWithCombined.id) {
                        events?.push({
                            type: 'delete',
                            recordName: combinedRecordIdRef.info!.linkName!,
                            record: recordWithCombined[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL],
                        })
                    }

                    //3. merge 数据并建立定的关系。
                    assert(!result[combinedRecordIdRef.info?.attributeName!], `should not have same combined record, conflict attribute: ${combinedRecordIdRef.info?.attributeName!}`)
                    result[combinedRecordIdRef.info?.attributeName!] = {
                        ...recordWithCombined[combinedRecordIdRef.info?.attributeName!]
                    }
                    // 相当于新建了关系。如果不是虚拟link 就要记录。
                    // TODO 要给出一个明确的 虚拟 link  record 的差异
                    if (!combinedRecordIdRef.info!.isLinkSourceRelation()) {
                        result[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL] = {
                            id: await this.database.getAutoId(combinedRecordIdRef.info!.linkName!),
                        }
                        events?.push({
                            type: 'create',
                            recordName: combinedRecordIdRef.info!.linkName,
                            record: result[combinedRecordIdRef.info?.attributeName!][LINK_SYMBOL]
                        })
                    }
                }
            }
        }

        return result
    }

    async relocateCombinedRecordDataForLink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, events?: RecordMutationEvent[]) {
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(linkName, this.map, true, true, true, true)
        const moveAttribute = moveSource ? 'source' : 'target'

        const records = await this.findRecords(RecordQuery.create(linkName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: attributeQuery
        }), `finding combined records for relocate ${linkName}.${moveAttribute}`, undefined)

        const toMoveRecordInfo = this.map.getLinkInfoByName(linkName)[moveSource ? 'sourceRecordInfo' : 'targetRecordInfo']

        // 1. 把这些数据删除，在下面重新插入到新行
        await this.deleteRecordSameRowData(toMoveRecordInfo.name, records.map(r => r[moveAttribute]))

        // 2. 重新插入到新行
        for (let record of records) {
            const toMoveRecordData = new NewRecordData(this.map, toMoveRecordInfo.name, record[moveAttribute])
            await this.insertSameRowData(toMoveRecordData, undefined)

            // 3. 增加 delete 关系的事件
            events?.push({
                type: 'delete',
                recordName: linkName,
                record: record
            })
        }


    }

    async insertSameRowData(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        // 由于我们可以抢夺别人的关联实体，所以会产生一个 unlink 事件，所以 events 要传进去。
        const newEntityDataWithIdsWithFlashOutRecords = await this.preprocessSameRowData(newEntityData, false, events)
        // 3. 插入新行。
        const sameRowNewFieldAndValue = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue()
        const p = this.getPlaceholder()
        const recordInfo = this.map.getRecordInfo(newEntityData.recordName)
        const result = await this.database.insert(`
INSERT INTO "${recordInfo.table}"
(${sameRowNewFieldAndValue.map(f => `"${f.field}"`).join(',')})
VALUES
(${sameRowNewFieldAndValue.map(f => p()).join(',')}) 
`, sameRowNewFieldAndValue.map(f => this.prepareFieldValue(f.value, f.fieldType!)), queryName) as EntityIdRef

        return Object.assign(result, newEntityDataWithIdsWithFlashOutRecords.getData())
    }

    prepareFieldValue(value: any, fieldType?: string) {
        if (fieldType?.toLowerCase() === 'json') {
            return JSON.stringify(value)
        }
        return value
    }


    async handleCreationReliance(newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<object> {
        const currentIdRef = newEntityData.getRef()
        const newIdRefs: { [k: string]: EntityIdRef | EntityIdRef[] } = {}
        // 1. 处理关系往 attribute 方向合并的新数据
        for (let record of newEntityData.differentTableMergedLinkNewRecords) {
            const reverseAttribute = record.info?.getReverseInfo()?.attributeName!
            const newRecordDataWithMyId = record.merge({
                [reverseAttribute]: currentIdRef
            })
            const newRecordIdRef = await this.createRecord(newRecordDataWithMyId, `create record ${newEntityData.recordName}.${record.info?.attributeName}`, events)
            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newRecordIdRef[reverseAttribute][LINK_SYMBOL]
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newRecordIdRef[reverseAttribute][LINK_SYMBOL]
                }
            }
        }

        // 2. 处理关系往 attribute 方向合并的老数据
        for (let record of newEntityData.differentTableMergedLinkRecordIdRefs) {
            const reverseInfo = record.info!.getReverseInfo()!
            const idMatch = MatchExp.atom({
                key: 'id',
                value: ['=', record.getRef().id]
            })
            const newData = {
                [reverseInfo!.attributeName]: currentIdRef,
                [LINK_SYMBOL]: record.getData()[LINK_SYMBOL]
            }
            const [updatedRecord] = await this.updateRecord(reverseInfo.parentEntityName, idMatch, new NewRecordData(this.map, reverseInfo.parentEntityName, newData), events)
            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...updatedRecord,
                    [LINK_SYMBOL]: updatedRecord[reverseInfo!.attributeName][LINK_SYMBOL]
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...updatedRecord,
                    [LINK_SYMBOL]: updatedRecord[reverseInfo!.attributeName][LINK_SYMBOL]
                }
            }
        }

        // 3. 处理完全独立的新数据和关系
        for (let record of newEntityData.isolatedNewRecords) {
            const newRecordIdRef = await this.createRecord(record, `create isolated related record ${newEntityData.recordName}.${record.info?.attributeName}`, events)


            const linkRawData: RawEntityData = record.linkRecordData?.getData() || {}
            Object.assign(linkRawData, {
                source: record.info!.isRecordSource() ? currentIdRef : newRecordIdRef,
                target: record.info!.isRecordSource() ? newRecordIdRef : currentIdRef
            })
            const newLinkData = new NewRecordData(this.map, record.info!.linkName, linkRawData)
            const newLinkRecord = await this.createRecord(newLinkData, `create isolated related link record ${newEntityData.recordName}.${record.info?.attributeName}`, events)

            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                newIdRefs[record.info!.attributeName].push({
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newLinkRecord
                })
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...newRecordIdRef,
                    [LINK_SYMBOL]: newLinkRecord
                }
            }
        }

        // 4. 处理完全独立的老数据和的关系。
        for (let key in newEntityData.isolatedRecordIdRefs) {
            const record = newEntityData.isolatedRecordIdRefs[key]
            // 针对 x:1 关系要先删除原来的关系
            if (record.info!.isXToOne) {
                const match = MatchExp.atom({
                    key: record.info?.isRecordSource() ? 'target.id' : 'source.id',
                    value: ['=', record.getRef().id]
                })
                await this.unlink(record.info!.linkName, match, false, 'unlink xToOne old link', events)
            }
            const linkRawData: RawEntityData = record.linkRecordData?.getData() || {}
            Object.assign(linkRawData, {
                source: record.info!.isRecordSource() ? currentIdRef : record.getRef(),
                target: record.info!.isRecordSource() ? record.getRef() : currentIdRef
            })
            const newLinkData = new NewRecordData(this.map, record.info!.linkName, linkRawData)
            const newLinkRecord = await this.createRecord(newLinkData, `create isolated related link record of old related ${newEntityData.recordName}.${record.info?.attributeName}`, events)

            if (record.info!.isXToMany) {
                if (!newIdRefs[record.info!.attributeName]) {
                    newIdRefs[record.info!.attributeName!] = []
                }
                (newIdRefs[record.info!.attributeName] as Record[])![key] = {
                    ...record.getData(),
                    [LINK_SYMBOL]: newLinkRecord
                }
            } else {
                newIdRefs[record.info!.attributeName] = {
                    ...record.getData(),
                    [LINK_SYMBOL]: newLinkRecord
                }
            }
        }

        return newIdRefs
    }


    // CAUTION 除了 1:1 并且合表的关系，不能递归更新 relatedEntity，如果是传入了，说明是建立新的关系。
    async updateRecordDataById(entityName: string, idRef: EntityIdRef, columnAndValue: {
        field: string,
        value: string
    }[]): Promise<EntityIdRef> {
        if (!columnAndValue.length) {
            return idRef
        }
        const p = this.getPlaceholder()
        const entityInfo = this.map.getRecordInfo(entityName);
        await this.database.update(`
UPDATE "${entityInfo.table}"
SET ${columnAndValue.map(({field}) => `"${field}" = ${p()}`).join(',')}
WHERE "${entityInfo.idField}" = (${p()})
        `, [...columnAndValue.map(({field, value}) => value), idRef.id], entityInfo.idField, `update record ${entityName} by id`)
        // 注意这里，使用要返回匹配的类，虽然可能没有更新数据。这样才能保证外部的逻辑比较一致。
        return idRef
    }

    async updateSameRowData(entityName: string, matchedEntity: Record, newEntityDataWithDep: NewRecordData, events?: RecordMutationEvent[]) {
        

        // 跟自己合表实体的必须先断开关联，也就是移走。不然下面 updateRecordData 的时候就会把数据删除。
        const sameRowEntityNullOrRefOrNewData = newEntityDataWithDep.combinedRecordIdRefs.concat(
            newEntityDataWithDep.combinedNewRecords, 
            newEntityDataWithDep.combinedNullRecords, 
            newEntityDataWithDep.mergedLinkTargetNullRecords,
            newEntityDataWithDep.mergedLinkTargetRecordIdRefs,
        )
        // 1. 删除旧的关系。出现null 或者新的管理数据，说明是建立新的关系，也要先删除关系。
        for (let newRelatedEntityData of sameRowEntityNullOrRefOrNewData) {
            const linkInfo = newRelatedEntityData.info!.getLinkInfo()
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, newRelatedEntityData.info!.attributeName) ? 'source' : 'target'
            if ((newRelatedEntityData.isRef() && matchedEntity[newRelatedEntityData.info?.attributeName!]?.id === newRelatedEntityData.getData().id)) {
                // 放过原来就是同样 related entity 的场景。可能是编程中为了方便没做检查，把原本的写了进来。
                continue
            }

            await this.unlink(
                linkInfo.name,
                MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                }),
                !linkInfo.isRelationSource(entityName, newRelatedEntityData.info!.attributeName),
                `unlink ${newRelatedEntityData.info?.parentEntityName} ${newRelatedEntityData.info?.attributeName} for update ${entityName}`,
                events
            )
        }

        // 2. 分配 id,处理需要 flash out 的数据等，事件也是这里面记录的。这里面会有抢夺关系，所以也可能会有删除事件。
        const newEntityDataWithIdsWithFlashOutRecords = await this.preprocessSameRowData(newEntityDataWithDep, true, events, matchedEntity)
        const allSameRowData = newEntityDataWithIdsWithFlashOutRecords.getSameRowFieldAndValue(matchedEntity)
        const columnAndValue = allSameRowData.map(({field, value}: { field: string, value: string }) => (
            {
                field,
                /// TODO value 要考虑引用自身或者 related entity 其他 field 的情况？例如 age+5
                // value: JSON.stringify(value)
                value: value
            }
        ))

        // 3. 真实处理数据，这里面没有记录事件，事件是上面处理的。、
        await this.updateRecordDataById(entityName, matchedEntity, columnAndValue)
        return newEntityDataWithIdsWithFlashOutRecords
    }

    async handleUpdateReliance(entityName: string, matchedEntity: EntityIdRef, newEntityData: NewRecordData, events?: RecordMutationEvent[]) {


        // CAUTION update 里面的表达关联实体的语义统统认为是 replace。如果用户想要表达 xToMany 的情况下新增关系，应该自己拆成两步进行。既先更新数据，再用 addLink 去增加关系。
        // 1. 断开自己和原来关联实体的关系。这里只要处理依赖我的，或者关系独立的，因为我依赖的在应该在 updateSameRowData 里面处理了。
        const otherTableEntitiesData = newEntityData.differentTableMergedLinkRecordIdRefs.concat(
            newEntityData.differentTableMergedLinkNewRecords,
            newEntityData.differentTableMergedLinkNullRecords,
            newEntityData.isolatedRecordIdRefs,
            newEntityData.isolatedNewRecords,
            newEntityData.isolatedNullRecords
        )


        // CAUTION 由于 xToMany 的数组情况会平铺处理，所以这里可能出现两次，所以这里记录一下排重
        const removedLinkName = new Set()
        for (let relatedEntityData of otherTableEntitiesData) {
            const linkInfo = relatedEntityData.info!.getLinkInfo()
            if (removedLinkName.has(linkInfo.name)) {
                continue
            }

            removedLinkName.add(linkInfo.name)
            const updatedEntityLinkAttr = linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName) ? 'source' : 'target'
            await this.unlink(
                linkInfo.name,
                MatchExp.atom({
                    key: `${updatedEntityLinkAttr}.id`,
                    value: ['=', matchedEntity.id],
                }),
                !linkInfo.isRelationSource(entityName, relatedEntityData.info!.attributeName),
                'unlink old reliance for update',
                events,
            )
        }

        const result: Record = {id: matchedEntity.id}
        // 2. 建立新关系
        // 处理和其他实体更新关系的情况。
        for (let newRelatedEntityData of otherTableEntitiesData) {
            // 跳过已显式设置为 null 的关系属性
            if (newEntityData.rawData[newRelatedEntityData.info?.attributeName!] === null) {
                continue;
            }
            
            // 这里只处理没有三表合并的场景。因为三表合并的数据在 sameTableFieldAndValues 已经有了
            // 这里只需要处理 1）关系表独立 或者 2）关系表往另一个方向合了的情况。因为往本方向和的情况已经在前面 updateEntityData 里面处理了
            let finalRelatedEntityRef: Record

            if (newRelatedEntityData.isRef()) {
                finalRelatedEntityRef = newRelatedEntityData.getRef()
            } else {
                finalRelatedEntityRef = await this.createRecord(newRelatedEntityData, `create new related record for update ${newEntityData.recordName}.${newRelatedEntityData.info?.attributeName}`, events)
            }

            // FIXME 这里没有在更新的时候一次性写入，而是又通过 addLinkFromRecord 建立的关系。需要优化
            const linkRecord = await this.addLinkFromRecord(entityName, newRelatedEntityData.info?.attributeName!, matchedEntity.id, finalRelatedEntityRef.id, undefined, events)

            if (newRelatedEntityData.info!.isXToMany) {
                if (!result[newRelatedEntityData.info!.attributeName!]) {
                    result[newRelatedEntityData.info!.attributeName!] = []
                }
                result[newRelatedEntityData.info!.attributeName!].push({
                    ...finalRelatedEntityRef,
                    [LINK_SYMBOL]: linkRecord,
                })
            } else {
                result[newRelatedEntityData.info!.attributeName!] = {
                    ...finalRelatedEntityRef,
                    [LINK_SYMBOL]: linkRecord,
                }
            }

        }

        return result
    }

    // 修改TODO注释以反映已实现的功能
    async updateRecord(entityName: string, matchExpressionData: MatchExpressionData, newEntityData: NewRecordData, events?: RecordMutationEvent[]) {
        // 现在支持在 update 字段的同时，使用 null 来删除关系
        // FIXME update 的 attributeQuery 应该按需查询，现在查询的记录太多

        const updateRecordQuery = RecordQuery.create(entityName, this.map, {
            matchExpression: matchExpressionData,
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(entityName, this.map, true, true, true, true)
        })
        
        const matchedEntities = await this.findRecords(updateRecordQuery, `find record for updating ${entityName}`, undefined)
        // 注意下面使用的都是 updateRecordQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        const result: Record[] = []
        for (let matchedEntity of matchedEntities) {
            // 1. 创建我依赖的
            const newEntityDataWithDep = await this.createRecordDependency(newEntityData, events)
            // 2. 把同表的实体移出去，为新同表 Record 建立 id；可能有要删除的 reliance
            const newEntityDataWithIdsWithFlashOutRecords = await this.updateSameRowData(updateRecordQuery.recordName, matchedEntity, newEntityDataWithDep, events)
            // 3. 更新依赖我的和关系表独立的
            const relianceUpdatedResult = await this.handleUpdateReliance(updateRecordQuery.recordName, matchedEntity, newEntityData, events)

            // 处理 filtered entity - 检查更新后的记录是否属于任何 filtered entity
            // 传递原始的 matchedEntity，它包含更新前的 __filtered_entities 状态
            // 以及实际更改的字段
            const changedFields = Object.keys(newEntityData.getData())
            await this.filteredEntityManager.updateFilteredEntityFlags(updateRecordQuery.recordName, matchedEntity.id, events, matchedEntity, false, changedFields)

            result.push({...newEntityData.getData(), ...newEntityDataWithIdsWithFlashOutRecords.getData(), ...relianceUpdatedResult})
        }

        return result
    }

    async deleteRecord(recordName: string, matchExp: MatchExpressionData, events?: RecordMutationEvent[], inSameRowDataOp = false) {
        const deleteQuery = RecordQuery.create(recordName, this.map, {
            matchExpression: matchExp,
            attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(
                recordName,
                this.map,
                true,
                true,
                true,
                true
            )
        })
        const records = await this.findRecords(deleteQuery, `find record for deleting ${recordName}`, undefined)

        // 注意下面使用的都是 deleteQuery 的 recordName，而不是 entityName，因为 RecordQuery 会根据 recordName 来判断是否是 filtered entity。
        // CAUTION 我们应该先删除关系，再删除关联实体。按照下面的顺序就能保证事件顺序的正确。
        if (records.length) {
            // 删除关系数据（独立表或者关系在另一边的关系数据）
            await this.deleteNotReliantSeparateLinkRecords(deleteQuery.recordName, records, events)
            // 删除依赖我的实体（其他表中的）。注意, reliance 只可能是 1:x，不可能多个 n 个 record 被1个 reliace 依赖。
            //  为什么这里要单独计算 events, 是因为 1:1 并且刚好关系数据分配到了当前 record 上 时，关系事件顺序会不正确了。
            const relianceEvents: RecordMutationEvent[] = []
            await this.deleteDifferentTableReliance(deleteQuery.recordName, records, relianceEvents)
            // 删除自身、有生命周期依赖的合表 record、合表到当前 record 的关系数据。
            const sameRowRecordEvents: RecordMutationEvent[] = []
            await this.deleteRecordSameRowData(deleteQuery.recordName, records, sameRowRecordEvents, inSameRowDataOp)

            // 1. recordEvents 除了最后一个外全都是关系删除事件。
            // 2. relianceEvents 中都是 reliance 删除事件，可能包含关系删除事件。
            // 3. 最后 recordEvents 是 record 删除事件。
            const relationEvents = sameRowRecordEvents.slice(0, sameRowRecordEvents.length - records.length)
            const recordEvents = sameRowRecordEvents.slice(sameRowRecordEvents.length - records.length)
            events?.push(...relationEvents, ...relianceEvents, ...recordEvents)
        }

        return records
    }

    // 这里会把通表的 reliance，以及 reliance 的 reliance 都删除掉。
    // this method will delete all the reliance of the record, and the reliance of the reliance.
    async deleteRecordSameRowData(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[], inSameRowDataOp = false) {
        const recordInfo = this.map.getRecordInfo(recordName)

        for (let record of records) {
            if (!inSameRowDataOp) {
                const recordWithSameRowDataQuery = RecordQuery.create(
                    recordName,
                    this.map,
                    {
                        matchExpression: MatchExp.atom({
                            key: `id`,
                            value: ['=', record.id]
                        }),
                        attributeQuery: AttributeQuery.getAttributeQueryDataForRecord(recordName, this.map, true, true, true, true),
                        modifier: {limit: 1}
                    }
                )
                const recordWithSameRowData = await this.findRecords(recordWithSameRowDataQuery, `find record with same row data for delete ${recordName}`, undefined)
                const hasSameRowData = recordInfo.notRelianceCombined.some(info => {
                    return !!recordWithSameRowData[0]?.[info.attributeName]?.id
                })
                // 存在合表的1:1关系，且不是 reliance。当前 record 删了，其他数据仍然要留下。
                if (hasSameRowData) {
                    // 存在同行 record，只能用 update
                    const p = this.getPlaceholder()
                    const fields = recordInfo.sameRowFields
                    await this.database.update(`
UPDATE "${recordInfo.table}"
SET ${fields.map(field => `"${field}" = ${p()}`).join(',')}
WHERE "${recordInfo.idField}" = ${p()}
`, [...fields.map(field => null), record.id], recordInfo.idField, `use update to delete ${recordName} because of sameRowData`)

                } else {
                    // 不存在同行数据 record ，可以 delete row
                    const p = this.getPlaceholder()
                    await this.database.delete(`
DELETE FROM "${recordInfo.table}"
WHERE "${recordInfo.idField}" = ${p()}
`, [record.id], `delete record ${recordInfo.name} as row`)
                }
            }
            
            // 1. 一定先删除递归处理同表的 reliance tree
            for (let relianceInfo of recordInfo.sameTableReliance) {
                // 只要真正存在这个数据才要删除
                if (record[relianceInfo.attributeName]?.id) {
                    // 和 reliance 的 link record 的事件
                    events?.push({
                        type: 'delete',
                        recordName: relianceInfo.linkName,
                        record: {
                            ...record[relianceInfo.attributeName][LINK_SYMBOL],
                            [relianceInfo.isRecordSource() ? 'source' : 'target']: {
                                id: record.id
                            },
                            [relianceInfo.isRecordSource() ? 'target' : 'source']: {
                                id: record[relianceInfo.attributeName].id
                            }
                        },
                    })

                    await this.handleDeletedRecordReliance(relianceInfo.recordName, record[relianceInfo.attributeName]!, events)
                }
            }

            // 2. 接着先记录关系删除事件，再记录 record 删除事件。
            recordInfo.mergedRecordAttributes.forEach(attributeInfo => {
                if (record[attributeInfo.attributeName]?.id) {
                    // 记录和自己合并的 link 事件
                    events?.push({
                        type: 'delete',
                        recordName: attributeInfo.linkName,
                        // CAUTION 注意这里一定要增加 link 上对于原始 record 的引用。外部计算的时候可能需要，那时可能 record 也删了查询不到了。
                        record: {
                            ...record[attributeInfo.attributeName][LINK_SYMBOL],
                            [attributeInfo.isRecordSource() ? 'source' : 'target']: {
                                id: record.id
                            },
                            [attributeInfo.isRecordSource() ? 'target' : 'source']: {
                                id: record[attributeInfo.attributeName].id
                            }
                        },
                    })
                }
            })

            recordInfo.notRelianceCombined.forEach(attributeInfo => {
                if (recordInfo.isRelation && (attributeInfo.attributeName === 'target' || attributeInfo.attributeName === 'source')) return
                if (record[attributeInfo.attributeName]?.id === undefined) return
                // 记录和自己合并的 link 事件
                events?.push({
                    type: 'delete',
                    recordName: attributeInfo.linkName,
                    // CAUTION 注意这里一定要增加 link 上对于原始 record 的引用。外部计算的时候可能需要，那时可能 record 也删了查询不到了。
                    record: {
                        ...record[attributeInfo.attributeName][LINK_SYMBOL],
                        [attributeInfo.isRecordSource() ? 'source' : 'target']: {
                            id: record.id
                        },
                        [attributeInfo.isRecordSource() ? 'target' : 'source']: {
                            id: record[attributeInfo.attributeName].id
                        }
                    },
                })
            })
        }
        
        // 处理 filtered entity 的删除事件
        for (let record of records) {
            const filteredEntities = this.filteredEntityManager.getFilteredEntitiesForBase(recordName);
            if (filteredEntities.length > 0 && record.__filtered_entities) {
                // __filtered_entities 可能已经被解析为对象
                const currentFlags = typeof record.__filtered_entities === 'string' 
                    ? JSON.parse(record.__filtered_entities) 
                    : record.__filtered_entities;
                for (const filteredEntity of filteredEntities) {
                    if (currentFlags[filteredEntity.name] === true) {
                        // 记录属于这个 filtered entity，生成删除事件
                        events?.push({
                            type: 'delete',
                            recordName: filteredEntity.name,
                            record: { ...record }
                        });
                    }
                }
            }
        }
        
        events?.push(...records.map(record => ({
            type: 'delete',
            recordName: recordName,
            record,
        }) as RecordMutationEvent))
    }

    async handleDeletedRecordReliance(recordName: string, record: EntityIdRef, events?: RecordMutationEvent[]) {

        // 删除独立表或者关系在另一边的关系数据
        await this.deleteNotReliantSeparateLinkRecords(recordName, [record], events)
        // 删除依赖我的实体
        await this.deleteDifferentTableReliance(recordName, [record], events)
        // 删除自身以及有生命周期依赖的合表 record
        await this.deleteRecordSameRowData(recordName, [record], events, true)
        return record
    }

    async deleteNotReliantSeparateLinkRecords(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        for (let info of recordInfo.differentTableRecordAttributes) {
            if (!info.isReliance) {
                const key = info.isRecordSource() ? 'source.id' : 'target.id'
                const newMatch = MatchExp.atom({
                    key,
                    value: ['in', records.map(r => r.id)]
                })
                // 关系事件上全部都要增加原始 record 的引用。注意不能给所有 events 都去加，因为删除 link 时也可能有关联实体被删除事件。
                //  只有最后哪些 events 是删除 link 的事件。
                await this.deleteRecord(info.linkName, newMatch, events)
            }
        }
    }

    async deleteDifferentTableReliance(recordName: string, records: EntityIdRef[], events?: RecordMutationEvent[]) {
        const recordInfo = this.map.getRecordInfo(recordName)
        const recordsById = events ? new Map(records.map(r => [r.id, r])) : undefined

        for (let info of recordInfo.differentTableReliance) {
            const matchInIds = MatchExp.atom({
                key: `${info.getReverseInfo()?.attributeName!}.id`,
                value: ['in', records.map(r => r.id)]
            })
            await this.deleteRecord(info.recordName, matchInIds, events)
            if (events) {
                // 删除关系时，要增加上当前 record 的引用。
                // TODO 这里需要更加高效的方法
                events.forEach(event => {
                    if (event.recordName === info.linkName) {
                        const record = recordsById!.get(event.record![info.isRecordSource() ? 'source' : 'target'].id)
                        if (record) {
                            event.record![info.isRecordSource() ? 'source' : 'target'] = record
                        }
                    }
                })
            }
        }
    }


    addLinkFromRecord(entity: string, attribute: string, entityId: string, relatedEntityId: string, attributes: RawEntityData = {}, events?: RecordMutationEvent[]) {
        const linkInfo = this.map.getLinkInfo(entity, attribute)
        const isEntitySource = linkInfo.isRelationSource(entity, attribute)

        const sourceId = isEntitySource ? entityId : relatedEntityId
        const targetId = isEntitySource ? relatedEntityId : entityId

        return this.addLink(linkInfo.name, sourceId, targetId, attributes, !linkInfo.isRelationSource(entity, attribute), events)
    }

    async addLink(linkName: string, sourceId: string, targetId: string, attributes: RawEntityData = {}, moveSource = false, events?: RecordMutationEvent[]) {
        const existRecord = (await this.findRecords(RecordQuery.create(linkName, this.map, {
            matchExpression: MatchExp.atom({key: 'source.id', value: ['=', sourceId]}).and({
                key: 'target.id',
                value: ['=', targetId]
            }),
            modifier: {
                limit: 1
            }
        }), `check if link exist for add link ${linkName}`, undefined))[0]

        assert(!existRecord, `cannot create ${linkName} for ${sourceId} ${targetId}, link already exist`)

        const linkInfo = this.map.getLinkInfoByName(linkName)
        if (!linkInfo.isCombined() && !linkInfo.isMerged() && (linkInfo.isManyToOne || linkInfo.isOneToMany)) {
            // n 方向要 unlink ?
            const unlinkAttr = linkInfo.isManyToOne ? 'source.id' : 'target.id'
            const unlinkId = linkInfo.isManyToOne ? sourceId : targetId
            const match = MatchExp.atom({
                key: unlinkAttr,
                value: ['=', unlinkId]
            })
            await this.unlink(linkName, match, false, 'unlink combined record for add new link', events)
        }

        const newLinkData = new NewRecordData(this.map, linkInfo.name, {
            source: {id: sourceId},
            target: {id: targetId},
            ...attributes
        })

        return this.createRecord(newLinkData, `create link record ${linkInfo.name}`, events)
    }


    async unlink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, reason = '', events?: RecordMutationEvent[]) {
        const linkInfo = this.map.getLinkInfoByName(linkName)
        assert(!linkInfo.isTargetReliance, `cannot unlink reliance data, you can only delete record, ${linkName}`)

        if (linkInfo.isCombined()) {
            return this.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
        }

        return this.deleteRecord(linkName, matchExpressionData, events)

    }

    // 查找树形结构的两个数据间的 path
    async findPath(recordName: string, attributePathStr: string, startRecordId: string, endRecordId: string, limitLength?: number): Promise<Record[] | undefined> {
        const attributePathAndLast = attributePathStr.split('.')
        const endAttribute = attributePathAndLast.at(-1)!
        const attributePath = attributePathAndLast.slice(0, -1)
        const match = MatchExp.atom({
            key: 'id',
            value: ['=', startRecordId]
        })
        const attributeQuery: AttributeQueryData = AttributeQuery.getAttributeQueryDataForRecord(recordName, this.map, true, true, false, true)
        const recursiveLabel = attributePathStr
        // 第一次使用路径先产生 label
        let base = attributeQuery
        for (let attr of attributePath) {
            base.push([attr, {attributeQuery: ['*']}])
            base = (base.at(-1)! as AttributeQueryDataRecordItem)[1].attributeQuery!
        }
        base.push([endAttribute, {label: recursiveLabel, attributeQuery: ['*']}])
        base = (base.at(-1)! as AttributeQueryDataRecordItem)[1].attributeQuery!
        // 第二次使用路径产生 goto
        for (let attr of attributePath) {
            base.push([attr, {attributeQuery: ['*']}])
            base = (base.at(-1)! as AttributeQueryDataRecordItem)[1].attributeQuery!
        }
        let foundPath: Record[] | undefined
        const exit = async (context: RecursiveContext) => {
            if (foundPath) return true

            if (context.stack.at(-1)?.id === endRecordId) {
                foundPath = [...context.stack]
                return true
            }
        }
        base.push([endAttribute, {goto: recursiveLabel, exit}])


        const record = (await this.findRecords(RecordQuery.create(recordName, this.map, {
            matchExpression: match,
            attributeQuery
        }), `find records for path ${recordName}.${attributePathStr}`))[0]

        // 如果找到了，把头也放进去。让数据格式整齐。
        return foundPath ? [record, ...foundPath] : undefined
    }

}



