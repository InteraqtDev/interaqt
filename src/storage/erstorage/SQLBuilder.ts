import { Database } from "@runtime";
import { BoolExp } from "@shared";
import { EntityToTableMap } from "./EntityToTableMap.js";
import { FieldMatchAtom, MatchExp } from "./MatchExp.js";
import { AttributeQuery } from "./AttributeQuery.js";
import { RecordQuery, RecordQueryTree, LINK_SYMBOL } from "./RecordQuery.js";
import { Modifier } from "./Modifier.js";
import { FieldAliasMap } from "./util/FieldAliasMap.js";

/**
 * JOIN 表信息
 */
export type JoinTables = {
    for: any
    joinSource: [string, string]
    joinIdField: [string, string]
    joinTarget: [string, string]
}[]

/**
 * 占位符生成器
 */
export type PlaceholderGen = (name?: string) => string

/**
 * SQLBuilder - 负责生成所有 SQL 语句
 * 
 * 职责：
 * 1. 构建 SELECT 查询（包括 JOIN、WHERE、MODIFIER 等）
 * 2. 构建 INSERT 语句
 * 3. 构建 UPDATE 语句
 * 4. 构建 DELETE 语句
 * 5. 处理字段别名和表别名
 * 
 * 不负责：
 * 1. 执行 SQL
 * 2. 处理查询结果
 * 3. 管理事务
 */
export class SQLBuilder {
    private getPlaceholder: () => PlaceholderGen
    
    constructor(
        public map: EntityToTableMap,
        public database: Database
    ) {
        this.getPlaceholder = database.getPlaceholder || (() => (name?: string) => `?`)
    }
    
    // ============ SELECT 查询构建 ============
    
    /**
     * 构建完整的 xToOne 查询 SQL
     * 
     * @param recordQuery 查询对象
     * @param prefix 前缀（用于子查询）
     * @param parentP 父查询的占位符生成器
     * @returns [SQL字符串, 参数数组, 字段别名映射]
     */
    buildXToOneFindQuery(
        recordQuery: RecordQuery,
        prefix = '',
        parentP?: PlaceholderGen
    ): [string, any[], FieldAliasMap] {
        // 从所有条件里面构建出 join clause
        const fieldQueryTree = recordQuery.attributeQuery!.xToOneQueryTree
        const matchQueryTree = recordQuery.matchExpression.xToOneQueryTree
        const finalQueryTree = fieldQueryTree.merge(matchQueryTree)
        const joinTables = this.getJoinTables(finalQueryTree, [recordQuery.recordName])

        const p = parentP || this.getPlaceholder()
        const fieldMatchExp = recordQuery.matchExpression.buildFieldMatchExpression(p, this.database)

        const [whereClause, params] = this.buildWhereClause(
            this.parseMatchExpressionValue(recordQuery.recordName, fieldMatchExp, recordQuery.contextRootEntity, p),
            prefix,
            p
        )

        const [selectClause, fieldAliasMap] = this.buildSelectClause(
            recordQuery.attributeQuery.getValueAndXToOneRecordFields(),
            prefix
        )
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
    
    /**
     * 构建 SELECT 子句
     */
    buildSelectClause(
        queryFields: ReturnType<AttributeQuery["getValueAndXToOneRecordFields"]>,
        prefix = ''
    ): [string, FieldAliasMap] {
        const fieldAliasMap = new FieldAliasMap()

        if (!queryFields.length) return ['1', fieldAliasMap]

        // CAUTION 这里创建 fieldAliasMap 是因为有的数据库里标识符有长度限制，例如 PGLite限制为63
        const aliasClauses = queryFields.map(({ tableAliasAndField, attribute, nameContext }) => {
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
    
    /**
     * 构建 FROM 子句
     */
    buildFromClause(entityName: string, prefix = ''): string {
        const recordInfo = this.map.getRecordInfo(entityName)
        return `"${recordInfo.table}" AS "${this.withPrefix(prefix)}${entityName}"`
    }
    
    /**
     * 构建 JOIN 子句
     */
    buildJoinClause(joinTables: JoinTables, prefix = ''): string {
        return joinTables.map(({ joinSource, joinIdField, joinTarget }) => {
            return `LEFT JOIN "${joinTarget[0]}" AS 
"${this.withPrefix(prefix)}${joinTarget[1]}" ON 
"${this.withPrefix(prefix)}${joinSource[1]}"."${joinIdField[0]}" = "${this.withPrefix(prefix)}${joinTarget[1]}"."${joinIdField[1]}"
`
        }).join('\n')
    }
    
    /**
     * 构建 WHERE 子句
     */
    buildWhereClause(
        fieldMatchExp: BoolExp<FieldMatchAtom> | null,
        prefix = '',
        p: PlaceholderGen
    ): [string, any[]] {
        let sql = ``
        const values: any[] = []
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
    
    /**
     * 构建 MODIFIER 子句（ORDER BY, LIMIT, OFFSET）
     */
    buildModifierClause(
        modifier: Modifier,
        prefix: string = '',
        fieldAliasMap: FieldAliasMap
    ): string {
        const { limit, offset, orderBy } = modifier
        const clauses: string[] = []
        
        if (orderBy.length) {
            clauses.push(`ORDER BY ${orderBy.map(({ attribute, recordName, order }) => {
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
    
    /**
     * 获取需要 JOIN 的表信息
     * 
     * 根据查询树递归计算所有需要 JOIN 的表
     */
    getJoinTables(
        queryTree: RecordQueryTree,
        context: string[] = [],
        parentInfos?: [string, string, string]
    ): JoinTables {
        // 应该是深度遍历
        const result: JoinTables = []
        if (!parentInfos) {
            // context 里面至少会有 entityName 这一个值
            const parentNamePath = [context[0]]
            const [parentAlias, parentIdField, parentTable] = this.map.getTableAliasAndFieldName(parentNamePath, 'id')
            parentInfos = [parentIdField, parentTable, parentAlias]
        }

        const [parentIdField, ...parentTableAndAlias] = parentInfos

        queryTree.forEachRecords((subQueryTree) => {
            const entityAttributeName = subQueryTree.attributeName!
            const attributeInfo = subQueryTree.info!
            
            if (!attributeInfo.isRecord) {
                throw new Error(`${context.concat(entityAttributeName).join('.')} is not a record`)
            }

            const currentNamePath = context.concat(entityAttributeName)
            const {
                table: currentTable,
                alias: currentTableAlias,
                linkTable: relationTable,
                linkAlias: relationTableAlias
            } = this.map.getTableAndAliasStack(currentNamePath).at(-1)!
            
            // CAUTION 特别注意最后一个参数，这是真的要连接实体表的时候就能用 shrink 的 id 了
            const [, idField] = this.map.getTableAliasAndFieldName(currentNamePath, 'id', true)
            
            // 这里的目的是把 attribute 对应的 record table 找到，并且正确 join 进来
            // join 本质上是把当前的路径和上一级路径连起来
            // 这里只处理没有和上一个节点三表合一的情况。三表合一的情况不需要 join
            if (!attributeInfo.isMergedWithParent()) {
                if (attributeInfo.isLinkMergedWithParent()) {
                    // CAUTION 如果只要获取 id, 不需要 join, map.getTableAliasAndFieldName 会自动解析到合并后的 field 上
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
                    if (!reverseAttributeInfo.linkField) {
                        throw new Error(`${reverseAttributeInfo.parentEntityName}.${reverseAttributeInfo.attributeName} has no field`)
                    }
                    result.push({
                        for: currentNamePath,
                        joinSource: parentTableAndAlias!,
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
                        joinIdField: [parentIdField, isCurrentRelationSource ? linkInfo.record.attributes.source.field! : linkInfo.record.attributes.target.field!],
                        joinTarget: [relationTable!, relationTableAlias!]
                    })

                    // CAUTION 只有当还要继续获取除 id 的部分时，才要 join 实体表
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

            // 处理 link 上的 query。如果只要 id, 那么在上面实体链接的时候就已经有了
            if (subQueryTree.parentLinkQueryTree && !subQueryTree.parentLinkQueryTree.onlyIdField()) {
                // 连接 link 和它的子节点
                const linkNamePath = currentNamePath.concat(LINK_SYMBOL)
                const [, linkIdField] = this.map.getTableAliasAndFieldName(linkNamePath, 'id', true)
                const linkParentInfo: [string, string, string] = [
                    linkIdField!, // link 的 idField
                    relationTable!, // link 的 tableName
                    relationTableAlias!, // link 的 tableAlias
                ]

                result.push(...this.getJoinTables(subQueryTree.parentLinkQueryTree, linkNamePath, linkParentInfo))
            }
        })

        return result
    }
    
    /**
     * 解析匹配表达式中的 EXIST 子查询
     */
    parseMatchExpressionValue(
        entityName: string,
        fieldMatchExp: BoolExp<FieldMatchAtom> | null,
        contextRootEntity: string | undefined,
        p: PlaceholderGen
    ): BoolExp<FieldMatchAtom> | null {
        if (!fieldMatchExp) return null

        return fieldMatchExp.map((exp: BoolExp<FieldMatchAtom>, context: string[]) => {
            if (!Array.isArray(exp.data.value)) {
                throw new Error(`match value is not a array ${context.join('.')}`)
            }

            if (!exp.data.isFunctionMatch) return { ...exp.data }

            if (exp.data.value[0].toLowerCase() !== 'exist') {
                throw new Error(`we only support Exist function match on entity for now. yours: ${exp.data.key} ${exp.data.value[0]} ${exp.data.value[1]}`)
            }

            const info = this.map.getInfoByPath(exp.data.namePath!)!
            const { alias: currentAlias } = this.map.getTableAndAliasStack(exp.data.namePath!).at(-1)!
            const reverseAttributeName = this.map.getReverseAttribute(info.parentEntityName, info.attributeName)

            // 注意这里去掉了 namePath 里面根部的 entityName，因为后面计算 referenceValue 的时候会加上
            const parentAttributeNamePath = exp.data.namePath!.slice(1, -1)

            const existEntityQuery = RecordQuery.create(
                info.recordName,
                this.map,
                {
                    matchExpression: MatchExp.atom({
                        key: `${reverseAttributeName}.id`,
                        value: ['=', parentAttributeNamePath.concat('id').join('.')],
                        isReferenceValue: true
                    }).and(exp.data.value[1])
                },
                // 如果上层还有，就继承上层的，如果没有， context 就只这一层
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
    
    // ============ DML 操作构建 ============
    
    /**
     * 构建 INSERT 语句
     */
    buildInsertSQL(
        recordName: string,
        fieldAndValues: Array<{ field: string, value: any, fieldType?: string }>
    ): [string, any[]] {
        const p = this.getPlaceholder()
        const recordInfo = this.map.getRecordInfo(recordName)
        
        const sql = `
INSERT INTO "${recordInfo.table}"
(${fieldAndValues.map(f => `"${f.field}"`).join(',')})
VALUES
(${fieldAndValues.map(() => p()).join(',')}) 
`
        const params = fieldAndValues.map(f => this.prepareFieldValue(f.value, f.fieldType!))
        
        return [sql, params]
    }
    
    /**
     * 构建 UPDATE 语句
     */
    buildUpdateSQL(
        entityName: string,
        idRef: { id: string | number },
        columnAndValue: Array<{ field: string, value: any }>
    ): [string, any[]] {
        if (!columnAndValue.length) {
            return ['', []]
        }
        
        const p = this.getPlaceholder()
        const entityInfo = this.map.getRecordInfo(entityName)
        
        const sql = `
UPDATE "${entityInfo.table}"
SET ${columnAndValue.map(({ field }) => `"${field}" = ${p()}`).join(',')}
WHERE "${entityInfo.idField}" = (${p()})
`
        const params = [...columnAndValue.map(({ value }) => value), idRef.id]
        
        return [sql, params]
    }
    
    /**
     * 构建 DELETE 语句
     */
    buildDeleteSQL(
        recordName: string,
        idField: string,
        id: string | number
    ): [string, any[]] {
        const p = this.getPlaceholder()
        const recordInfo = this.map.getRecordInfo(recordName)
        
        const sql = `
DELETE FROM "${recordInfo.table}"
WHERE "${idField}" = ${p()}
`
        return [sql, [id]]
    }
    
    /**
     * 构建批量字段置 NULL 的 UPDATE 语句
     * 用于删除合表记录时的部分删除场景（当同一行还有其他记录的数据时）
     */
    buildUpdateFieldsToNullSQL(
        recordName: string,
        fields: string[],
        idRef: { id: string | number }
    ): [string, any[]] {
        const p = this.getPlaceholder()
        const recordInfo = this.map.getRecordInfo(recordName)
        
        const sql = `
UPDATE "${recordInfo.table}"
SET ${fields.map(field => `"${field}" = ${p()}`).join(',')}
WHERE "${recordInfo.idField}" = ${p()}
`
        const params = [...fields.map(() => null), idRef.id]
        
        return [sql, params]
    }
    
    /**
     * 构建批量 DELETE 语句（通过 WHERE 条件）
     */
    buildDeleteByWhereSQL(
        recordName: string,
        matchExp: BoolExp<FieldMatchAtom>
    ): [string, any[]] {
        const p = this.getPlaceholder()
        const recordInfo = this.map.getRecordInfo(recordName)
        const [whereClause, params] = this.buildWhereClause(matchExp, '', p)
        
        const sql = `
DELETE FROM "${recordInfo.table}"
WHERE ${whereClause}
`
        return [sql, params]
    }
    
    // ============ 辅助方法 ============
    
    /**
     * 添加前缀
     */
    withPrefix(prefix = ''): string {
        return prefix ? `${prefix}___` : ''
    }
    
    /**
     * 准备字段值（处理 JSON 等特殊类型）
     */
    prepareFieldValue(value: any, fieldType?: string): any {
        if (fieldType?.toLowerCase() === 'json') {
            return JSON.stringify(value)
        }
        return value
    }
}

