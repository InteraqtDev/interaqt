import { ComputationResultFullRecompute } from 'interaqt';
import type { Controller, DataContext, PropertyDataContext } from 'interaqt';

type InstrumentableHandle = {
    dataContext: DataContext
    compute?: (...args: unknown[]) => Promise<unknown>
    incrementalCompute?: (...args: unknown[]) => Promise<unknown>
    incrementalPatchCompute?: (...args: unknown[]) => Promise<unknown>
}

/**
 * 执行路径探针（performance-debt-plan Phase 0.1）。
 *
 * 性能债的主判据是**确定性执行计数**而非 wall-clock（仓库红-绿纪律）：
 *  - full：computation.compute() 被调用的次数 = 全量重算执行次数（含 planned full 与
 *    incremental 返回 fullRecompute 信封后的回退执行）；
 *  - incremental / incrementalPatch：增量路径执行次数；
 *  - fullRecomputeReasons：增量路径返回 ComputationResultFullRecompute 信封携带的 reason
 *    （定位是哪个分支退化）；
 *  - transactions：storage.runInTransaction 每个 attempt 的 (name, isolation)——
 *    SERIALIZABLE attempt 数量暴露 RequireSerializableRetry 隔离级升级重启。
 *
 * 纯测试级 instrumentation：包装 computation handle 实例方法与 storage.runInTransaction
 * 实例方法，零框架代码入侵（先例：deepAnalysisSection3Fixes 的 recordQueries）。
 */

export type ComputationPathCounts = {
    full: number
    incremental: number
    incrementalPatch: number
    fullRecomputeReasons: string[]
}

export type TransactionAttempt = { name: string, isolation: string }

export type PerfProbe = {
    /** key 见 describeComputationKey（property → "Host.prop"，global → "global:name"…） */
    counts: Map<string, ComputationPathCounts>
    transactions: TransactionAttempt[]
    reset(): void
    get(key: string): ComputationPathCounts
    /** 全部计算的全量重算执行次数之和 */
    totalFull(): number
    /** 隔离级升级（SERIALIZABLE attempt）次数 */
    serializableAttempts(): number
    /** 便于失败信息里排查：非零路径的摘要 */
    summary(): string
}

export function describeComputationKey(dataContext: DataContext): string {
    if (dataContext.type === 'property') {
        const propertyContext = dataContext as PropertyDataContext
        return `${propertyContext.host.name}.${propertyContext.id.name}`
    }
    const id = dataContext.id as { name?: string } | string
    const name = typeof id === 'object' ? id.name : String(id)
    return `${dataContext.type}:${name}`
}

const EMPTY = (): ComputationPathCounts => ({ full: 0, incremental: 0, incrementalPatch: 0, fullRecomputeReasons: [] })

/**
 * 必须在 controller.setup() **之后**调用（computationsHandles 在构造期填充，但包装
 * 实例方法在 setup 后依然生效——Scheduler 每次执行都从 handle 实例上取方法）。
 * setup 期间的初始计算不计入（探针从 attach 时刻开始观察）。
 */
export function attachPerfProbe(controller: Controller): PerfProbe {
    const counts = new Map<string, ComputationPathCounts>()
    const transactions: TransactionAttempt[] = []

    const get = (key: string): ComputationPathCounts => {
        let entry = counts.get(key)
        if (!entry) {
            entry = EMPTY()
            counts.set(key, entry)
        }
        return entry
    }

    for (const handle of (controller.scheduler.computationsHandles as Map<unknown, InstrumentableHandle>).values()) {
        const key = describeComputationKey(handle.dataContext)
        const entry = get(key)

        const originalCompute = handle.compute?.bind(handle)
        if (originalCompute) {
            handle.compute = async (...args: unknown[]) => {
                entry.full++
                return originalCompute(...args)
            }
        }
        const originalIncremental = handle.incrementalCompute?.bind(handle)
        if (originalIncremental) {
            handle.incrementalCompute = async (...args: unknown[]) => {
                const result = await originalIncremental(...args)
                if (result instanceof ComputationResultFullRecompute) {
                    entry.fullRecomputeReasons.push(String(result.reason ?? 'unknown'))
                } else {
                    entry.incremental++
                }
                return result
            }
        }
        const originalIncrementalPatch = handle.incrementalPatchCompute?.bind(handle)
        if (originalIncrementalPatch) {
            handle.incrementalPatchCompute = async (...args: unknown[]) => {
                const result = await originalIncrementalPatch(...args)
                if (result instanceof ComputationResultFullRecompute) {
                    entry.fullRecomputeReasons.push(String(result.reason ?? 'unknown'))
                } else {
                    entry.incrementalPatch++
                }
                return result
            }
        }
    }

    const storage = controller.system.storage as unknown as {
        runInTransaction: (options: { name?: string, isolation?: string }, fn: () => Promise<unknown>) => Promise<unknown>
    }
    const originalRunInTransaction = storage.runInTransaction.bind(storage)
    storage.runInTransaction = async (options, fn) => {
        transactions.push({ name: options?.name ?? 'unknown', isolation: options?.isolation ?? 'default' })
        return originalRunInTransaction(options, fn)
    }

    return {
        counts,
        transactions,
        get,
        reset() {
            for (const entry of counts.values()) {
                entry.full = 0
                entry.incremental = 0
                entry.incrementalPatch = 0
                entry.fullRecomputeReasons.length = 0
            }
            transactions.length = 0
        },
        totalFull() {
            let total = 0
            for (const entry of counts.values()) total += entry.full
            return total
        },
        serializableAttempts() {
            return transactions.filter(t => t.isolation === 'SERIALIZABLE').length
        },
        summary() {
            const parts: string[] = []
            for (const [key, entry] of counts.entries()) {
                if (entry.full || entry.fullRecomputeReasons.length) {
                    parts.push(`${key}: full=${entry.full} incremental=${entry.incremental} reasons=${JSON.stringify(entry.fullRecomputeReasons)}`)
                }
            }
            const serializable = transactions.filter(t => t.isolation === 'SERIALIZABLE')
            if (serializable.length) parts.push(`SERIALIZABLE attempts: ${JSON.stringify(serializable)}`)
            return parts.length ? parts.join('\n') : '(all incremental, no isolation upgrade)'
        },
    }
}

/**
 * SQL 语句记录（B 家族判据用）：包装 Database 实例的 query/insert/update/delete。
 * 必须在 new MonoSystem(db) 之前调用。
 */
export type RecordedStatement = { sql: string, name: string }

type InstrumentableDatabase = {
    query: (sql: string, values: unknown[], name?: string) => Promise<unknown[]>
    delete: (sql: string, where: unknown[], name?: string) => Promise<unknown[]>
    insert: (sql: string, values: unknown[], name?: string) => Promise<unknown>
    update: (sql: string, values: unknown[], idField?: string, name?: string) => Promise<unknown>
}

export function recordDatabaseStatements(database: unknown): RecordedStatement[] {
    const db = database as InstrumentableDatabase
    const recorded: RecordedStatement[] = []
    const originalQuery = db.query.bind(db)
    db.query = async (sql, values, name = '') => {
        recorded.push({ sql, name })
        return originalQuery(sql, values, name)
    }
    const originalInsert = db.insert.bind(db)
    db.insert = async (sql, values, name = '') => {
        recorded.push({ sql, name })
        return originalInsert(sql, values, name)
    }
    const originalUpdate = db.update.bind(db)
    db.update = async (sql, values, idField, name = '') => {
        recorded.push({ sql, name })
        return originalUpdate(sql, values, idField, name)
    }
    const originalDelete = db.delete.bind(db)
    db.delete = async (sql, where, name = '') => {
        recorded.push({ sql, name })
        return originalDelete(sql, where, name)
    }
    return recorded
}
