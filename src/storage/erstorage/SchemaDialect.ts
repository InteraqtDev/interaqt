import { createHash } from "node:crypto";
import type { Database } from "@runtime";
import type { ConstraintPredicate, ConstraintPredicateOperator, ConstraintPredicateValue } from "@core";
import type { ConstraintSchemaItem, NonNullConstraintSchemaItem, UniqueConstraintSchemaItem } from "./Setup.js";
import type { MapData } from "./EntityToTableMap.js";

export type SchemaDialectName = 'postgres' | 'sqlite' | 'mysql';

export type ConstraintCapabilities = {
    unique: boolean,
    filteredUnique: boolean,
    nonNull?: boolean,
}

export type SchemaDialect = {
    name: SchemaDialectName,
    maxIdentifierLength: number,
    supportsCreateIndexIfNotExists: boolean,
    // 数据库是否真的强制 maxIdentifierLength（PG 静默截断、MySQL 报错 → true；
    //  SQLite 实际无标识符长度限制，声明的 63 只用于约束名缩短的治理 → false）。
    //  Setup 只对强制方言做表名长度 fail-fast。
    enforceMaxIdentifierLength?: boolean,
    encodeLiteral: (value: ConstraintPredicateValue) => string,
    constraints: ConstraintCapabilities,
}

export type ConstraintSchemaStatement = {
    item: ConstraintSchemaItem,
    sql: string,
}

/**
 * 框架内部 kv 实体（_System_ / _Dictionary_，声明于 @runtime System.ts）的唯一约束是
 * find-then-create 守恒律的数据库面（r31/r32）。unique 能力缺失的方言（MySQL：TEXT 列
 * 不可整列索引，dialect.constraints.unique=false）上必须**跳过建索引**而不是让整个
 * setup 失败——否则框架在该方言上完全不可用（r31 引入 _Dictionary_ 约束后 MySQL setup
 * 全量崩溃，env-gated 套件静默跳过未暴露）。跳过意味着该方言回到约束前的乐观并发
 * （并发 find-then-create 竞态窗口存在），写路径的 RetryableWriteConflict 转换保持惰性。
 * 用户自己声明的约束不在此列：能力缺失时依旧 fail-fast（explicit control）。
 * 判定按「内部记录名 + interaqt_ 约束名前缀」双条件，用户声明不可能意外命中
 * （内部实体名与用户实体重名会在 setup 早期以 duplicate name 拒绝）。
 */
export function isBestEffortInternalConstraint(item: ConstraintSchemaItem): boolean {
    return (item.recordName === '_System_' || item.recordName === '_Dictionary_')
        && item.constraintName.startsWith('interaqt_')
}

/** 内部 best-effort 约束在能力缺失方言上跳过（不建索引、不验证、不阻塞 setup/迁移）。 */
export function shouldSkipConstraintForDialect(item: ConstraintSchemaItem, dialect: SchemaDialect): boolean {
    if (!isBestEffortInternalConstraint(item)) return false
    if (item.kind === 'unique') {
        return !dialect.constraints.unique || (!!item.where && !dialect.constraints.filteredUnique)
    }
    return dialect.constraints.nonNull !== true
}

export const DEFAULT_SCHEMA_DIALECT: SchemaDialect = {
    name: 'postgres',
    maxIdentifierLength: 63,
    supportsCreateIndexIfNotExists: true,
    enforceMaxIdentifierLength: true,
    encodeLiteral: defaultEncodeLiteral,
    constraints: {
        unique: true,
        filteredUnique: true,
        nonNull: true,
    },
}

export function defaultEncodeLiteral(value: ConstraintPredicateValue) {
    if (value === null) return 'NULL'
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`Invalid numeric constraint literal: ${value}`)
        return String(value)
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
    return `'${value.replace(/'/g, "''")}'`
}

export function sqliteEncodeLiteral(value: ConstraintPredicateValue) {
    if (typeof value === 'boolean') return value ? '1' : '0'
    return defaultEncodeLiteral(value)
}

export function getSchemaDialect(database?: Database): SchemaDialect {
    return {
        ...DEFAULT_SCHEMA_DIALECT,
        ...database?.schemaDialect,
        constraints: {
            ...DEFAULT_SCHEMA_DIALECT.constraints,
            ...database?.schemaDialect?.constraints,
        },
    }
}

export function quoteIdentifier(identifier: string, dialect: SchemaDialect) {
    if (dialect.name === 'mysql') {
        return `\`${identifier.replace(/`/g, '``')}\``
    }
    return `"${identifier.replace(/"/g, '""')}"`
}

export function quoteLiteral(value: ConstraintPredicateValue, dialect: SchemaDialect) {
    // Partial index predicates cannot be parameterized portably across the
    // supported drivers, so literal encoding is owned by the schema dialect.
    return dialect.encodeLiteral(value)
}

export function predicateSQLForOperator(field: string, operator: ConstraintPredicateOperator, dialect: SchemaDialect) {
    const quotedField = quoteIdentifier(field, dialect)
    switch (operator.op) {
        case 'isNull':
            return `${quotedField} IS NULL`
        case 'isNotNull':
            return `${quotedField} IS NOT NULL`
        case 'equals':
            return operator.value === null
                ? `${quotedField} IS NULL`
                : `${quotedField} = ${quoteLiteral(operator.value, dialect)}`
        case 'notEquals':
            return operator.value === null
                ? `${quotedField} IS NOT NULL`
                : `${quotedField} != ${quoteLiteral(operator.value, dialect)}`
        case 'in': {
            const nonNullValues = operator.value.filter(value => value !== null)
            const parts = []
            if (operator.value.some(value => value === null)) parts.push(`${quotedField} IS NULL`)
            if (nonNullValues.length) {
                parts.push(`${quotedField} IN (${nonNullValues.map(value => quoteLiteral(value, dialect)).join(', ')})`)
            }
            return `(${parts.join(' OR ')})`
        }
        case 'notIn': {
            const nonNullValues = operator.value.filter(value => value !== null)
            const parts = []
            if (operator.value.some(value => value === null)) parts.push(`${quotedField} IS NOT NULL`)
            if (nonNullValues.length) {
                parts.push(`${quotedField} NOT IN (${nonNullValues.map(value => quoteLiteral(value, dialect)).join(', ')})`)
            }
            return `(${parts.join(' AND ')})`
        }
    }
}

export function createUniqueIndexSQL(
    physicalName: string,
    tableName: string,
    fields: string[],
    dialect: SchemaDialect,
    where?: ConstraintPredicate,
    resolveWhereField?: (property: string) => string,
) {
    const ifNotExists = dialect.supportsCreateIndexIfNotExists ? ' IF NOT EXISTS' : ''
    const columns = fields.map(field => quoteIdentifier(field, dialect)).join(', ')
    const predicate = where
        ? `\nWHERE ${Object.entries(where).map(([property, operator]) => {
            const field = resolveWhereField?.(property) ?? property
            return predicateSQLForOperator(field, operator, dialect)
        }).join(' AND ')}`
        : ''

    return `CREATE UNIQUE INDEX${ifNotExists} ${quoteIdentifier(physicalName, dialect)} ON ${quoteIdentifier(tableName, dialect)} (${columns})${predicate}`
}

/**
 * Framework logical-id UNIQUE INDEX (entity-identity contract).
 *
 * Logical `id` is not the table PK (`_rowId`); its physical column is `attributes.id.field`
 * (hashed short name via generateShortFieldName), never assumed to be the literal `"id"`.
 * Emitted outside the user UniqueConstraint → createUniqueConstraintStatement pipeline so
 * MySQL (constraints.unique === false) still gets fail-loud identity uniqueness on INT id.
 *
 * Reference function: one index per non-filtered entity/relation that has idField;
 * combined tables yield one index per participating base record (distinct idFields).
 */
export type FrameworkLogicalIdUniqueIndex = {
    recordName: string
    table: string
    idField: string
    indexName: string
}

export function frameworkLogicalIdUniqueIndexName(recordName: string, idField: string): string {
    // Same hash budget as Transform unique indexes: prefix + 20 hex < PG 63-char limit.
    const hash = createHash('sha1').update(`${recordName}\0${idField}`).digest('hex').slice(0, 20)
    return `interaqt_id_${hash}`
}

/**
 * Framework application-identity UNIQUE INDEX (Entity.identity).
 *
 * Emitted outside the user UniqueConstraint → createUniqueConstraintStatement pipeline.
 * Index name hashes recordName + identity property names (not the local identity.name),
 * so two entities may both use identity.name "byKey" without colliding.
 */
export type FrameworkApplicationIdentityIndex = {
    recordName: string
    table: string
    properties: string[]
    fields: string[]
    indexName: string
}

export function frameworkApplicationIdentityIndexName(recordName: string, propertyNames: string[]): string {
    const hash = createHash('sha1').update(`${recordName}\0${propertyNames.join('\0')}`).digest('hex').slice(0, 20)
    return `interaqt_ident_${hash}`
}

export function frameworkApplicationIdentityIndexes(map: Pick<MapData, 'records'>): FrameworkApplicationIdentityIndex[] {
    const result: FrameworkApplicationIdentityIndex[] = []
    for (const [recordName, record] of Object.entries(map.records)) {
        if (record.isFilteredEntity || record.isFilteredRelation || record.isRelation) continue
        const identity = record.identity
        if (!identity?.fields?.length || !record.table) continue
        result.push({
            recordName,
            table: record.table,
            properties: [...identity.properties],
            fields: [...identity.fields],
            indexName: identity.indexName || frameworkApplicationIdentityIndexName(recordName, identity.properties),
        })
    }
    return result
}

export function createFrameworkApplicationIdentityIndexSQL(
    map: Pick<MapData, 'records'>,
    dialect: SchemaDialect,
): Array<FrameworkApplicationIdentityIndex & { sql: string }> {
    return frameworkApplicationIdentityIndexes(map).map(item => ({
        ...item,
        sql: createUniqueIndexSQL(item.indexName, item.table, item.fields, dialect),
    }))
}

export function frameworkLogicalIdUniqueIndexes(map: Pick<MapData, 'records'>): FrameworkLogicalIdUniqueIndex[] {
    const result: FrameworkLogicalIdUniqueIndex[] = []
    for (const [recordName, record] of Object.entries(map.records)) {
        if (record.isFilteredEntity || record.isFilteredRelation) continue
        const idField = record.attributes?.id && 'field' in record.attributes.id
            ? (record.attributes.id as { field?: string }).field
            : undefined
        if (!idField || !record.table) continue
        result.push({
            recordName,
            table: record.table,
            idField,
            indexName: frameworkLogicalIdUniqueIndexName(recordName, idField),
        })
    }
    return result
}

export function createFrameworkLogicalIdUniqueIndexSQL(
    map: Pick<MapData, 'records'>,
    dialect: SchemaDialect,
): Array<FrameworkLogicalIdUniqueIndex & { sql: string }> {
    return frameworkLogicalIdUniqueIndexes(map).map(item => ({
        ...item,
        sql: createUniqueIndexSQL(item.indexName, item.table, [item.idField], dialect),
    }))
}

export function createUniqueConstraintStatement(
    item: UniqueConstraintSchemaItem,
    dialect: SchemaDialect,
    resolveWhereField: (property: string) => string,
): ConstraintSchemaStatement {
    if (!dialect.constraints.unique) {
        throw new Error(`unique constraints are not supported by ${dialect.name} schema dialect`)
    }
    if (item.where && !dialect.constraints.filteredUnique) {
        throw new Error(`filtered unique constraints are not supported by ${dialect.name} schema dialect`)
    }
    return {
        item,
        sql: createUniqueIndexSQL(
            item.physicalName,
            item.tableName,
            item.fields,
            dialect,
            item.where,
            resolveWhereField,
        ),
    }
}

export function createNonNullConstraintStatement(
    item: NonNullConstraintSchemaItem,
    dialect: SchemaDialect,
): ConstraintSchemaStatement {
    if (item.kind !== 'non-null') {
        throw new Error(`expected non-null constraint item`)
    }
    if (!dialect.constraints.nonNull) {
        throw new Error(`non-null constraints are not supported by ${dialect.name} schema dialect`)
    }
    const tableName = quoteIdentifier(item.tableName, dialect)
    const physicalName = quoteIdentifier(item.physicalName, dialect)
    const fieldName = quoteIdentifier(item.field, dialect)
    if (dialect.name === 'sqlite') {
        throw new Error(`post-recompute non-null constraints are not supported by sqlite schema dialect`)
    }
    return {
        item,
        sql: `ALTER TABLE ${tableName} ADD CONSTRAINT ${physicalName} CHECK (${fieldName} IS NOT NULL)`,
    }
}
