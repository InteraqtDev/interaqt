import { Database } from "@runtime"
import { EntityToTableMap } from "./EntityToTableMap.js"
import { SQLBuilder } from "./SQLBuilder.js"
import { RecordQuery, LINK_SYMBOL } from "./RecordQuery.js"
import { FieldAliasMap } from "./util/FieldAliasMap.js"
import { RecursiveContext, ROOT_LABEL } from "./util/RecursiveContext.js"
import { setByPath, assert } from "../utils.js"
import { AttributeQuery, AttributeQueryData, AttributeQueryDataRecordItem } from "./AttributeQuery.js"
import { MatchExp } from "./MatchExp.js"

// 使用 RecordQueryAgent 中的 Record 类型定义
import type { Record } from "./RecordQueryAgent.js"

/**
 * RecordQueryRef - 用于管理带标签的 RecordQuery 引用
 * 
 * 在递归查询中，某些 RecordQuery 可能有 label 标记，
 * 这个类负责收集所有带标签的查询，方便后续通过标签访问
 */
export class RecordQueryRef {
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

/**
 * QueryExecutor - 查询执行器
 * 
 * 职责：
 * 1. 执行所有查询操作
 * 2. 处理查询结果的结构化
 * 3. 处理关联查询（x:1, x:n）
 * 4. 处理递归查询
 * 
 * 不负责：
 * 1. SQL 构建（由 SQLBuilder 负责）
 * 2. 数据变更操作（create/update/delete）
 * 3. 事件处理
 */
export class QueryExecutor {
    constructor(
        private map: EntityToTableMap,
        private database: Database,
        private sqlBuilder: SQLBuilder
    ) {}
    
    /**
     * 结构化原始返回结果
     * @param rawReturns 数据库返回的原始结果
     * @param JSONFields JSON 字段列表
     * @param fieldAliasMap 字段别名映射
     * @returns 结构化的 Record 数组
     */
    private structureRawReturns(
        rawReturns: { [k: string]: any }[],
        JSONFields: string[],
        fieldAliasMap: FieldAliasMap
    ): Record[] {
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
            return obj as Record
        })
    }

    /**
     * 查找记录（主查询方法）
     * CAUTION findRelatedRecords 中的递归调用会使得 includeRelationData 变为 true
     */
    async findRecords(
        entityQuery: RecordQuery, 
        queryName = '', 
        recordQueryRef?: RecordQueryRef, 
        context: RecursiveContext = new RecursiveContext(ROOT_LABEL)
    ): Promise<Record[]> {
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
        const [querySQL, params, fieldAliasMap] = this.sqlBuilder.buildXToOneFindQuery(entityQuery, '')
        const rawReturns: { [k: string]: any }[] = await this.database.query(querySQL, params, queryName)
        const records = this.structureRawReturns(rawReturns, this.map.getRecordInfo(entityQuery.recordName).JSONFields, fieldAliasMap) as any[]

        // 如果当前的 query 有 label，那么下面任何遍历 record 的地方都要 Push stack。
        const nextRecursiveContext = (entityQuery.label && entityQuery.label !== context.label) ? context.spawn(entityQuery.label) : context

        // 第一步的 x:1 的递归形式的查询，相当与一个递归的减掉了所有 x:n 枝干的查询，我们也得递归的把所有 x:n 枝干补出来才行，不只是 parentLink 上的。
        // 1. 补全所有 x:1 查询主干上的 x:n 关联实体及关系查询
        await this.completeXToOneLeftoverRecords(entityQuery, records, recordQueryRef, nextRecursiveContext)

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

    /**
     * 补全 x:1 遗留记录（x:1 主干上的 x:n 枝干）
     */
    async completeXToOneLeftoverRecords(
        entityQuery: RecordQuery, 
        records: Record[], 
        recordQueryRef: RecordQueryRef, 
        context: RecursiveContext
    ) {
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
                    if (!record[xToOneSubQuery.attributeName!]) {
                        // Skip this record if the x:1 relation is null
                        continue;
                    }
                    
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

    /**
     * 查找 x:many 关联记录
     * CAUTION 任何两个具体的实体之间只能有一条关系，但是可以在关系上有多条数据。1:n 的数据
     */
    async findXToManyRelatedRecords(
        recordName: string, 
        attributeName: string, 
        recordId: string, 
        relatedRecordQuery: RecordQuery, 
        recordQueryRef: RecordQueryRef, 
        context: RecursiveContext
    ) {
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

    /**
     * 查找树形结构的两个数据间的 path
     */
    async findPath(
        recordName: string, 
        attributePathStr: string, 
        startRecordId: string, 
        endRecordId: string, 
        limitLength?: number
    ): Promise<Record[] | undefined> {
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

