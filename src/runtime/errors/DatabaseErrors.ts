import type { Database } from '../System.js';

export type NormalizedDatabaseError = {
    driver?: string,
    message: string,
    rawCode?: string | number,
    constraintName?: string,
    tableName?: string,
    fields?: string[],
    isUniqueViolation: boolean,
    isCheckViolation: boolean,
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
    // CAUTION 通用 SQLITE_CONSTRAINT 不能算 unique violation：NOT NULL / CHECK / FK 失败也可能
    //  携带该通用码，误判会让调用方按"重复键"处理（upsert 重试等）。真正的 unique 失败由
    //  扩展码 SQLITE_CONSTRAINT_UNIQUE 或消息文本（'UNIQUE constraint failed'）识别。
    const isUniqueViolation = rawCode === '23505'
        || rawCode === 'SQLITE_CONSTRAINT_UNIQUE'
        || rawCode === 1062
        || message.includes('UNIQUE constraint failed')
        || message.includes('duplicate key value violates unique constraint')
        || message.includes('Duplicate entry')

    // CHECK 违规（NonNullConstraint 的物理形态是 CHECK (field IS NOT NULL)，PG 系专有能力）。
    //  与 unique 同一识别纪律：PG 标准码 23514 或明确的消息文本；SQLite/MySQL 形态一并识别
    //  （用户经原生 SQL 建的 CHECK 也能得到结构化归一）。通用 SQLITE_CONSTRAINT 不判入。
    const isCheckViolation = rawCode === '23514'
        || rawCode === 'SQLITE_CONSTRAINT_CHECK'
        || rawCode === 3819
        || message.includes('violates check constraint')
        || message.includes('CHECK constraint failed')
        || message.includes('Check constraint')

    return {
        driver: database?.constructor?.name,
        message,
        rawCode,
        constraintName,
        tableName: sqliteFields?.tableName,
        fields: sqliteFields?.fields,
        isUniqueViolation,
        isCheckViolation,
        raw: error,
    }
}
