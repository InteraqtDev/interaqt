import { Database } from "@runtime"
import { EntityToTableMap } from "./EntityToTableMap.js"
import { SQLBuilder } from "./SQLBuilder.js"
import { RecordQuery, RecordQueryTree, LINK_SYMBOL } from "./RecordQuery.js"
import { Modifier } from "./Modifier.js"
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

    set(key: string, value: RecordQuery) {
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
     * @param recordName 根记录名（用于解析各级路径上的 JSON 字段）
     * @param fieldAliasMap 字段别名映射
     * @returns 结构化的 Record 数组
     */
    private structureRawReturns(
        rawReturns: { [k: string]: unknown }[],
        recordName: string,
        fieldAliasMap: FieldAliasMap
    ): Record[] {
        // CAUTION 值类型归一化必须按完整路径解析字段类型，不能只看根记录的字段列表。
        //  否则关联记录（x:1 JOIN 查出）上的字段在 SQLite/MySQL 这类 driver 上不会被归一化，
        //  导致同一 API 在不同 driver 下返回类型不一致：
        //  - JSON 字段：SQLite/MySQL 返回字符串，需要 JSON.parse
        //  - boolean 字段：SQLite/MySQL 以 0/1 数字存储，需要转回 boolean（PG/PGLite 是原生 BOOLEAN）
        const valueTypeCache = new Map<string, string | undefined>()
        const resolveValueType = (attributePath: string[]): string | undefined => {
            const cacheKey = attributePath.join('.')
            if (valueTypeCache.has(cacheKey)) return valueTypeCache.get(cacheKey)
            let result: string | undefined
            try {
                const info = this.map.getInfoByPath([recordName, ...attributePath])
                if (info && info.isValue) {
                    const data = info.data as { collection?: boolean, type?: string }
                    result = (!!data.collection || data.type === 'object' || data.type === 'json') ? 'json' : data.type
                }
            } catch (e) {
                // 无法解析的路径（例如别名等特殊字段）保持原样返回
                result = undefined
            }
            valueTypeCache.set(cacheKey, result)
            return result
        }

        // CAUTION JSON 字符串值的归一化取决于驱动是否已解析 JSON 列：
        //  - better-sqlite3 返回原始 JSON 文本，读到的 string 是"未解析的 JSON"，需要 JSON.parse；
        //  - node-postgres/PGlite/mysql2 返回已解析的值，读到的 string 就是 JSON 值本身
        //    （json 值恰好是字符串），再 parse 一次会把 'plain' 变成裸报错、把 '123' 静默变成数字 123。
        const jsonAlreadyParsed = this.database.returnsParsedJSON === true
        return rawReturns.map(rawReturn => {
            const obj = {}
            Object.entries(rawReturn).forEach(([key, value]) => {
                // CAUTION 注意这里去掉了最开始的 entityName
                const attributePath = fieldAliasMap.getPath(key)!.slice(1, Infinity)
                const valueType = resolveValueType(attributePath)
                if (!jsonAlreadyParsed && typeof value === 'string' && valueType === 'json') {
                    try {
                        value = JSON.parse(value)
                    } catch (e) {
                        throw new Error(`Failed to parse JSON field "${recordName}.${attributePath.join('.')}": ${e instanceof Error ? e.message : String(e)}. Raw value: ${(value as string).slice(0, 200)}`)
                    }
                } else if (typeof value === 'number' && valueType === 'boolean') {
                    value = value !== 0
                }
                if (value !== null) {
                    setByPath(obj, attributePath, value)
                }
            })
            return obj as Record
        })
    }

    /**
     * 去除完全相同的原始行（等价于 SQL DISTINCT）
     * 用于消除 match 中出现 x:n 路径时 LEFT JOIN 产生的 fan-out 重复。
     * 因为 SELECT 始终包含各级记录的 id，真正不同的记录必然有列差异，所以完全相同的行一定是重复行。
     */
    private dedupeIdenticalRows(rawReturns: { [k: string]: unknown }[]): { [k: string]: unknown }[] {
        if (rawReturns.length < 2) return rawReturns
        const seen = new Set<string>()
        const result: { [k: string]: unknown }[] = []
        for (const row of rawReturns) {
            // 用稳定的 key 序列化，避免键顺序影响判等
            const key = JSON.stringify(Object.keys(row).sort().map(k => [k, row[k]]))
            if (seen.has(key)) continue
            seen.add(key)
            result.push(row)
        }
        return result
    }

    /**
     * 查找记录（主查询方法）
     * CAUTION findRelatedRecords 中的递归调用会使得 includeRelationData 变为 true
     */
    async findRecords(
        entityQuery: RecordQuery, 
        queryName = '', 
        recordQueryRef?: RecordQueryRef, 
        context: RecursiveContext = new RecursiveContext(ROOT_LABEL),
        forUpdate = false
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
        // CAUTION 环不一定回到起点：A→B→C→B 这样的环里，栈首（A/B）永远不等于栈尾，
        //  只比较 stack[0] 会导致无限递归（栈溢出/挂起）。只要当前记录在本轮递归路径上
        //  出现过（任意位置）就说明进入了环，停止展开。
        if (entityQuery.label && context.label === entityQuery.label && context.stack.length > 1) {
            const lastRecord = context.stack.at(-1) as Record
            if (context.stack.slice(0, -1).some(record => (record as Record).id === lastRecord.id)) {
                return []
            }
        }

        // findRecords 的一个 join 语句里面只能一次性搞定 x:1 的关联实体，以及关系上的 x:1 关联实体。
        // 0. 这里只通过合表或者 join  处理了 x:1 的关联查询，包括了 parentLinkRecordQuery 上字段的查询，以及从 parentLink 发出可以看做是 x:1 的关联字段查询。
        //  这个 x:1 是递归的，把一次性能通过 join 查到的都查了。
        // x:n 的查询是通过二次查询获取的。

        // CAUTION match/orderBy 走 x:n 路径时 LEFT JOIN 会 fan-out：SQL 的 LIMIT/OFFSET 限制的是
        //  原始行数而不是去重后的根记录数，直接下推会导致分页结果错误（返回数量不足 / 跳过记录）。
        //  这里把 LIMIT/OFFSET 从 SQL 中剥离，改在 dedupe 之后按根记录应用。
        //  例外：limit === 1 且无 offset（findOne 热路径）时首条原始行必然对应第一条根记录，可以安全下推。
        const paginationModifier = entityQuery.modifier
        const needsPostPagination = (
            (paginationModifier.limit !== undefined || paginationModifier.offset !== undefined) &&
            !(paginationModifier.limit === 1 && !paginationModifier.offset) &&
            (
                this.queryTreeHasXToManyPath(entityQuery.matchExpression.xToOneQueryTree) ||
                this.queryTreeHasXToManyPath(entityQuery.modifier.xToOneQueryTree)
            )
        )
        const sqlEntityQuery = needsPostPagination
            ? entityQuery.derive({
                modifier: new Modifier(paginationModifier.recordName, this.map, {
                    ...(paginationModifier.data || {}),
                    limit: undefined,
                    offset: undefined,
                })
            })
            : entityQuery

        const [querySQL, params, fieldAliasMap] = this.sqlBuilder.buildXToOneFindQuery(sqlEntityQuery, '')
        // CAUTION 能力判断优先使用 driver 的显式声明，仅在未声明时退回旧的启发式判断（兼容外部 driver）。
        const supportsForUpdate = this.database.supportsSelectForUpdate ?? (this.database.constructor.name !== 'SQLiteDB')
        // CAUTION FOR UPDATE 必须限定主表（FOR UPDATE OF <主表别名>）。
        //  因为 x:1 关联查询使用 LEFT JOIN，PostgreSQL 不允许对 outer join 的可空侧加锁。
        const rawReturns: { [k: string]: unknown }[] = await this.database.query(
            forUpdate && supportsForUpdate ? `${querySQL}\nFOR UPDATE OF "${entityQuery.recordName}"` : querySQL,
            params,
            queryName
        )
        // CAUTION 通过 x:n 路径做 match 时，LEFT JOIN 会让同一条根记录产生多行完全相同的结果（fan-out）。
        //  这里按"整行完全相同"去重（等价于 SQL DISTINCT 的语义）。
        //  不会误伤合法数据：SELECT 永远包含各级记录（含关系记录）的 id 字段，真正不同的行必然有字段差异。
        let dedupedRawReturns = this.dedupeIdenticalRows(rawReturns)
        if (needsPostPagination) {
            const start = paginationModifier.offset || 0
            dedupedRawReturns = dedupedRawReturns.slice(
                start,
                paginationModifier.limit !== undefined ? start + paginationModifier.limit : undefined
            )
        }
        const records = this.structureRawReturns(dedupedRawReturns, entityQuery.recordName, fieldAliasMap)

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
                        // 可空 x:1：关联实体不存在时没有 link 数据，跳过（与 completeXToOneLeftoverRecords 的空守卫一致）。
                        if (!record[subEntityQuery.attributeName!]?.[LINK_SYMBOL]) continue
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
                // CAUTION 优先按父 id 集合批量查询（IN (...) + 按反向属性分组回填），消掉一层 N+1。
                //  无法批量的场景（递归 label/goto、per-parent limit/offset、n:n 等）退回逐条查询。
                if (this.canBatchXToManyQuery(entityQuery, subEntityQuery, records)) {
                    await this.findXToManyRelatedRecordsBatched(
                        entityQuery.recordName,
                        subEntityQuery.attributeName!,
                        records,
                        subEntityQuery,
                        recordQueryRef,
                        nextRecursiveContext
                    )
                } else {
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
        }
        return records
    }

    /**
     * 判断查询树中是否存在 x:n 路径（会导致 LEFT JOIN fan-out）。
     * 用于决定 LIMIT/OFFSET 是否可以安全下推到 SQL。
     * 保守判定：树中只要出现 x:n 关联节点（即使实际生成 EXIST 子查询而没有产生 join fan-out）
     * 都会返回 true，代价只是分页退化为查询后切片，不影响正确性。
     */
    private queryTreeHasXToManyPath(tree: RecordQueryTree): boolean {
        for (const child of Object.values(tree.records)) {
            if (child.info?.isXToMany) return true
            if (this.queryTreeHasXToManyPath(child)) return true
        }
        return false
    }

    /**
     * 判断某个 x:n 关联查询能否按父 id 集合批量执行。
     * 限制条件：
     * - 至少两条父记录（单条时批量没有收益）。
     * - 没有递归语义（父查询 label / 子查询 label/goto 需要 per-record 的递归上下文）。
     * - 子查询没有 limit/offset（它们是 per-parent 语义，合并后无法保证）。
     * - 关系是 1:n 且非对称：反向是 x:1，可以通过一次 JOIN 拿到父 id 做分组；
     *   n:n 的反向仍是 x:n，批量会引入 fan-out 与嵌套 N+1，保持逐条查询。
     */
    private canBatchXToManyQuery(entityQuery: RecordQuery, subEntityQuery: RecordQuery, records: Record[]): boolean {
        if (records.length < 2) return false
        if (entityQuery.label || subEntityQuery.label || subEntityQuery.goto) return false
        const modifierData = subEntityQuery.modifier?.data
        if (modifierData?.limit !== undefined || modifierData?.offset !== undefined) return false
        const info = this.map.getInfo(entityQuery.recordName, subEntityQuery.attributeName!)
        if (!info.isOneToMany) return false
        if (info.isLinkManyToManySymmetric()) return false
        return true
    }

    /**
     * 按父 id 集合批量查询 x:n（1:n）关联记录，并按反向属性分组回填到各父记录上。
     * 与 findXToManyRelatedRecords 的逐条语义保持一致（包括关系数据 & 的处理），
     * 只是把"每个父记录一次查询"合并为"每批父记录一次查询"。
     */
    async findXToManyRelatedRecordsBatched(
        recordName: string,
        attributeName: string,
        parentRecords: Record[],
        relatedRecordQuery: RecordQuery,
        recordQueryRef: RecordQueryRef,
        context: RecursiveContext
    ): Promise<void> {
        const BATCH_SIZE = 500
        const info = this.map.getInfo(recordName, attributeName)
        const reverseAttributeName = info.getReverseInfo()?.attributeName!
        const resultKey = relatedRecordQuery.alias || relatedRecordQuery.attributeName!

        // 保证每个父记录都有数组（没有子记录的父记录也一样）
        const parentById = new Map<string, Record>()
        for (const parent of parentRecords) {
            parent[resultKey] = []
            parentById.set(parent.id, parent)
        }

        // 分组需要每条子记录带上父 id。如果用户没有查询反向属性，这里追加 [reverseAttr, {attributeQuery: ['id']}]
        //（1:n 的反向是 x:1，同一次 JOIN 查询即可拿到，无额外往返），组装结果时再删掉。
        const reverseAttrInUserQuery = relatedRecordQuery.attributeQuery.data.some(
            item => (typeof item === 'string' ? item : item[0]) === reverseAttributeName
        )
        const attributeQueryData: AttributeQueryData = reverseAttrInUserQuery ?
            relatedRecordQuery.attributeQuery.data :
            [...relatedRecordQuery.attributeQuery.data, [reverseAttributeName, { attributeQuery: ['id'] }] as AttributeQueryDataRecordItem]

        const parentLinkRecordQuery = relatedRecordQuery.attributeQuery.parentLinkRecordQuery
        const shouldQueryParentLink = !!parentLinkRecordQuery

        for (let start = 0; start < parentRecords.length; start += BATCH_SIZE) {
            const chunk = parentRecords.slice(start, start + BATCH_SIZE)
            const newMatch = relatedRecordQuery.matchExpression.and({
                key: `${reverseAttributeName}.id`,
                value: ['in', chunk.map(r => r.id)]
            })
            const newAttributeQuery = new AttributeQuery(
                relatedRecordQuery.recordName,
                this.map,
                attributeQueryData,
                relatedRecordQuery.parentRecord,
                relatedRecordQuery.attributeName,
                shouldQueryParentLink
            )
            const newSubQuery = relatedRecordQuery.derive({
                matchExpression: newMatch,
                attributeQuery: newAttributeQuery
            })

            const data = await this.findRecords(
                newSubQuery,
                `finding related records in batch: ${relatedRecordQuery.parentRecord}.${relatedRecordQuery.attributeName}`,
                recordQueryRef,
                context
            )

            for (const item of data) {
                const parentId = item[reverseAttributeName]?.id
                const parent = parentId !== undefined ? parentById.get(parentId) : undefined

                // 和 findXToManyRelatedRecords 一致：把和父亲的关系数据挂到 & 上，并去掉临时的反向属性
                if (shouldQueryParentLink) {
                    item[LINK_SYMBOL] = item[reverseAttributeName]?.[LINK_SYMBOL]
                    delete item[reverseAttributeName]
                } else if (!reverseAttrInUserQuery) {
                    delete item[reverseAttributeName]
                }

                // 和父亲的关联关系上的 x:n 数据
                if (parentLinkRecordQuery) {
                    for (let subEntityQueryOfLink of parentLinkRecordQuery.attributeQuery.xToManyRecords) {
                        const linkId = item[LINK_SYMBOL].id
                        setByPath(
                            item,
                            [LINK_SYMBOL, subEntityQueryOfLink.attributeName!],
                            await this.findXToManyRelatedRecords(
                                subEntityQueryOfLink.parentRecord!,
                                subEntityQueryOfLink.attributeName!,
                                linkId,
                                subEntityQueryOfLink,
                                recordQueryRef,
                                context
                            )
                        )
                    }
                }

                if (parent) {
                    (parent[resultKey] as Record[]).push(item)
                }
            }
        }
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
                        // 可空关系：反向属性或 link 上的 x:1 不存在时跳过（与下方第 2 步的空守卫一致）。
                        if (!record[reverseAttributeName]?.[LINK_SYMBOL]?.[xToOneSubQuery.attributeName!]) continue
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
                    // 可空 x:1：为 null 时 [].concat 会产生 [null] 传入递归导致崩溃，跳过。
                    if (!record[xToOneSubQuery.attributeName!]) continue
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
        endRecordId: string
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

            if ((context.stack.at(-1) as Record | undefined)?.id === endRecordId) {
                foundPath = [...context.stack] as Record[]
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

