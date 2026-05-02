import type { Database } from '../System.js';

export type NormalizedDatabaseError = {
    driver?: string,
    message: string,
    rawCode?: string | number,
    constraintName?: string,
    tableName?: string,
    fields?: string[],
    isUniqueViolation: boolean,
    raw: unknown,
}

function readRawString(error: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = error[key]
        if (typeof value === 'string' && value.length > 0) return value
    }
}

function parseSQLiteUniqueFields(message: string) {
    const prefix = 'UNIQUE constraint failed: '
    const index = message.indexOf(prefix)
    if (index < 0) return undefined
    const fields = message.slice(index + prefix.length).split(',').map(item => item.trim())
    const first = fields[0]?.split('.')
    return {
        tableName: first?.[0]?.replace(/^"|"$/g, ''),
        fields: fields.map(item => item.split('.').at(-1)!.replace(/^"|"$/g, '')),
    }
}

export function normalizeDatabaseError(error: unknown, database?: Database): NormalizedDatabaseError {
    const raw = (error && typeof error === 'object') ? error as Record<string, unknown> : {}
    const message = error instanceof Error ? error.message : String(error)
    const rawCode = raw.code as string | number | undefined ?? raw.errno as string | number | undefined
    const constraintName = readRawString(raw, ['constraint', 'constraintName', 'index', 'sqlMessage'])
    const sqliteFields = parseSQLiteUniqueFields(message)
    const isUniqueViolation = rawCode === '23505'
        || rawCode === 'SQLITE_CONSTRAINT_UNIQUE'
        || rawCode === 'SQLITE_CONSTRAINT'
        || rawCode === 1062
        || message.includes('UNIQUE constraint failed')
        || message.includes('duplicate key value violates unique constraint')
        || message.includes('Duplicate entry')

    return {
        driver: database?.constructor?.name,
        message,
        rawCode,
        constraintName,
        tableName: sqliteFields?.tableName,
        fields: sqliteFields?.fields,
        isUniqueViolation,
        raw: error,
    }
}
