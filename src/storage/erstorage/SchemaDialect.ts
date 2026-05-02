import type { Database } from "@runtime";
import type { ConstraintPredicate, ConstraintPredicateOperator, ConstraintPredicateValue } from "@core";
import type { ConstraintSchemaItem } from "./Setup.js";

export type SchemaDialectName = 'postgres' | 'sqlite' | 'mysql';

export type ConstraintCapabilities = {
    unique: boolean,
    filteredUnique: boolean,
}

export type SchemaDialect = {
    name: SchemaDialectName,
    maxIdentifierLength: number,
    supportsCreateIndexIfNotExists: boolean,
    encodeLiteral: (value: ConstraintPredicateValue) => string,
    constraints: ConstraintCapabilities,
}

export type ConstraintSchemaStatement = {
    item: ConstraintSchemaItem,
    sql: string,
}

export const DEFAULT_SCHEMA_DIALECT: SchemaDialect = {
    name: 'postgres',
    maxIdentifierLength: 63,
    supportsCreateIndexIfNotExists: true,
    encodeLiteral: defaultEncodeLiteral,
    constraints: {
        unique: true,
        filteredUnique: true,
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

export function createUniqueConstraintStatement(
    item: ConstraintSchemaItem,
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
