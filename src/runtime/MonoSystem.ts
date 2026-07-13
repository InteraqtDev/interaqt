import {
    ComputationState,
    Database,
    DatabaseLogger,
    RecordMutationCallback,
    RecordMutationEvent,
    Storage,
    AtomicStorage,
    AtomicTarget,
    AtomicRecordTarget,
    AtomicGlobalTarget,
    System,
    SYSTEM_RECORD,
    DICTIONARY_RECORD,
    SystemEntity,
    SystemLogger,
    SystemLogType,
    StorageSchemaMetadata,
    DictionaryEntity,
    EntityIdRef,
    AtomicSequenceTarget,
    AtomicSequenceScope,
    AtomicSequenceScopeValue,
    SystemSchemaOptions
} from "./System.js";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { RequireSerializableRetry, runWithTransactionRetry, TransactionCapability, TransactionCapabilityError, TransactionIsolation, TransactionOptions } from "./transaction.js";
import { getCurrentEffects, addToCurrentEffects } from "./asyncEffectsContext.js";
import { Property, EntityInstance, RelationInstance, Entity, Relation, RefContainer, type ConstraintPredicateOperator } from "@core";
import {
    ConstraintSchemaItem,
    DBSetup,
    EntityQueryHandle,
    EntityToTableMap,
    MatchExp,
    MatchExpressionData,
    RawEntityData
} from '@storage';
// SQLiteDB is now imported from @drivers when needed
import { RecordBoundState } from "./computations/Computation.js";
import { ConstraintSetupError, ConstraintViolationError, findConstraintViolationError } from "./errors/ConstraintErrors.js";
import { normalizeDatabaseError } from "./errors/DatabaseErrors.js";
import { canonicalJSONStringify, createUniqueIndexSQL, getSchemaDialect, normalizeTimestampInputToMs, normalizeTimestampReadValue, quoteIdentifier, timestampParamForDialect } from "@storage";
import type { AdditiveDDLOperation, MigrationDDLOperation, MigrationManifest, MigrationPhase, MigrationRunState, MigrationSchemaPlan } from "./migration.js";

function JSONStringify(value: unknown) {
    // CAUTION JSON.stringify(undefined) 返回 undefined（非字符串），encodeURI 会把它 ToString
    //  成字面量 "undefined" 存进数据库——之后 JSONParse 的 JSON.parse("undefined") 必炸，
    //  该 key 永久不可读。与 JSON 语义对齐（数组里的 undefined 也序列化为 null）：归一为 null。
    const serialized = JSON.stringify(value)
    return encodeURI(serialized === undefined ? 'null' : serialized)
}

// Migration bookkeeping statements must be parameterized: values such as the
// serialized manifest or error messages can contain quotes and backslashes,
// and string interpolation corrupts them under MySQL's backslash escaping.
function migrationSQLPlaceholders(dialectName: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) => dialectName === 'postgres' ? `$${index + 1}` : '?')
}

// CAUTION operationKey 绝不能编码列表下标（r26 遗留收口，r25 §三 #2）：resume 前计划重排/插项
//  会让「同 index 不同 SQL」被误标已完成——错误的 DDL 被跳过、已完成的被重跑。
//  键 = 操作内容（phase/kind/table/column/logicalPath/SQL）；列表内完全相同的操作再追加
//  出现序号 `#n`（相对顺序由计划生成器保证稳定）。旧格式（含下标）保留为只读回退：
//  跨版本 resume 的 in-flight 迁移里旧键标记的操作仍被识别为已完成；新标记一律写内容键。
function migrationOperationContentKey(phase: string, operation: MigrationDDLOperation): string {
    const columnName = 'columnName' in operation ? operation.columnName || '' : ''
    const sql = 'sql' in operation ? operation.sql || '' : ''
    return `${phase}:${operation.kind}:${operation.tableName || ''}:${columnName}:${operation.logicalPath || ''}:${sql || operation.description}`
}

function JSONParse(value: string) {
    return value === undefined ? undefined : JSON.parse(decodeURI(value))
}

type StorageTransactionContext = {
    depth: number
    isolation: TransactionIsolation
    /**
     * r23 I-1：事务内 callWithEvents 会把事件 push 进调用方数组（COMMIT 之前）。
     * 外层事务回滚时 DB 撤销，数组不撤销 → 幻影事件。记录每个被写入数组的基线长度，
     * 最外层回滚时截断回基线（与 r22 F-2 的「attempt 隔离」同族，覆盖 in-txn / 非重试路径）。
     */
    eventArrayBaselines?: Map<RecordMutationEvent[], number>
}

class MonoStorage implements Storage{
    public map!: DBSetup["map"]
    public queryHandle?: EntityQueryHandle
    private constraintSchemaItems: ConstraintSchemaItem[] = []
    public schema: StorageSchemaMetadata = {
        dialect: getSchemaDialect(),
        records: [],
        tables: [],
        constraints: []
    }
    public dict: { get: (key: string) => Promise<unknown>, set: (key: string, value: unknown) => Promise<void>, setInternal?: (key: string, value: unknown) => Promise<void>, registerDefaults?: (defaults: Map<string, unknown>) => void }
    public atomic: AtomicStorage
    private transactionContext = new AsyncLocalStorage<StorageTransactionContext>()
    // 声明驱动的 dict 读回退（Scheduler 从 Dictionary 声明求值一次后注册）。
    //  install 时 setupDictDefaultValue 会把默认值持久化；但 setup(false) 路径下新增声明、
    //  或行被手工删除时，get 返回 undefined 会让下游计算静默走偏——按声明回退更符合
    //  「声明了 defaultValue 就应生效」的直觉。只在**无存储行**时回退：已存储的 null
    //  是显式值，不回退。注册的是**已求值**的默认值（非工厂）：每次读 miss 重新求值会让
    //  非幂等工厂（Date.now、对象字面量）在同一事务内产出漂移的"事实"。
    private dictDefaults: Map<string, unknown> = new Map()
    
    constructor(public db: Database) {
        // Initialize dict property with get/set methods
        this.dict = {
            get: async (key: string) => {
                const match = MatchExp.atom({key: 'key', value: ['=', key]})
                const record = await this.queryHandle!.findOne(DICTIONARY_RECORD, match, undefined, ['value'])
                if (!record) {
                    if (!this.dictDefaults.has(key)) return undefined
                    const defaultValue = this.dictDefaults.get(key)
                    // 与存储路径的读语义对齐：存储值每次读都经 JSON codec 产出独立副本，
                    // 回退值同样按 JSON round-trip 复制，避免多个读方共享同一可变对象引用。
                    if (defaultValue === undefined || defaultValue === null || typeof defaultValue !== 'object') return defaultValue
                    return JSON.parse(JSON.stringify(defaultValue))
                }
                return record.value?.raw
            },
            set: async (key: string, value: unknown): Promise<void> => {
                await this.setDictionaryValue(key, value, true)
            },
            setInternal: async (key: string, value: unknown): Promise<void> => {
                await this.setDictionaryValue(key, value, false)
            },
            registerDefaults: (defaults: Map<string, unknown>) => {
                this.dictDefaults = defaults
            }
        }
        this.atomic = this.createAtomicStorage()
    }

    private async ensureDbOpenForSchemaRead() {
        if (this.db.openForSchemaRead) {
            await this.db.openForSchemaRead()
        } else {
            if ((this.db as unknown as { db?: unknown }).db) return
            await this.db.open(false)
        }
    }
    public callbacks: Set<RecordMutationCallback> = new Set()
    private getActiveTransactionContext() {
        const context = this.transactionContext.getStore()
        return context && context.depth > 0 ? context : undefined
    }
    getTransactionIsolation() {
        return this.getActiveTransactionContext()?.isolation
    }
    getTransactionCapability(): TransactionCapability {
        return this.db.transactionCapability ?? {
            transactions: true,
            isolationLevels: ['READ COMMITTED'],
            transactionBoundConnection: false,
            concurrentTransactions: 'unsupported',
            nestedStrategy: 'reuse',
            notes: [
                'This driver has no explicit transaction capability declaration; MonoStorage will use fallback BEGIN/COMMIT semantics only.'
            ],
        }
    }
    async runInTransaction<T>(options: TransactionOptions, fn: () => Promise<T>): Promise<T> {
        const isolation = options.isolation ?? 'READ COMMITTED'
        const capability = this.getTransactionCapability()
        if (!capability.transactions) {
            throw new TransactionCapabilityError({
                transactionName: options.name,
                requestedIsolation: isolation,
                capability,
                reason: 'driver does not support transactions',
            })
        }
        if (!capability.isolationLevels.includes(isolation)) {
            throw new TransactionCapabilityError({
                transactionName: options.name,
                requestedIsolation: isolation,
                capability,
                reason: `driver does not support ${isolation} isolation`,
            })
        }
        const existing = this.getActiveTransactionContext()
        if (existing) {
            if (existing.isolation !== 'SERIALIZABLE' && isolation === 'SERIALIZABLE') {
                throw new RequireSerializableRetry(`${options.name || 'nested transaction'} requires SERIALIZABLE isolation`)
            }
            existing.depth++
            try {
                return await fn()
            } finally {
                existing.depth--
            }
        }

        const context: StorageTransactionContext = { depth: 1, isolation, eventArrayBaselines: new Map() }
        const run = async () => this.transactionContext.run(context, fn)
        const rollbackCallerEvents = () => {
            const baselines = context.eventArrayBaselines
            if (!baselines?.size) return
            for (const [events, baseline] of baselines) {
                events.length = baseline
            }
            baselines.clear()
        }
        const startTransaction = async (): Promise<T> => {
            if (this.db.runInTransaction) {
                try {
                    return await this.db.runInTransaction({ name: options.name, isolation }, run)
                } catch (error) {
                    rollbackCallerEvents()
                    throw error
                }
            }

            await this.db.scheme('BEGIN', options.name)
            try {
                const result = await run()
                await this.db.scheme('COMMIT', options.name)
                return result
            } catch (error) {
                await this.db.scheme('ROLLBACK', options.name)
                rollbackCallerEvents()
                throw error
            }
        }

        // CAUTION 单连接驱动（SQLite/PGLite 声明 concurrentTransactions: 'unsupported'）上，
        //  并发的顶层事务会在同一连接上交错 BEGIN/COMMIT，导致提交/回滚彼此的工作。
        //  这里按声明串行化顶层事务；嵌套事务在上面的 existing 分支已经复用，不会进入队列（无死锁）。
        if (capability.concurrentTransactions === 'unsupported') {
            // transactionQueue 永远是已"消化"过错误的 promise，直接串接即可。
            const task = this.transactionQueue.then(() => startTransaction())
            this.transactionQueue = task.then(() => undefined, () => undefined)
            return task
        }
        return startTransaction()
    }
    // 串行化 concurrentTransactions: 'unsupported' 驱动上的顶层事务。
    private transactionQueue: Promise<unknown> = Promise.resolve()
    private isInTransaction() {
        return (this.getActiveTransactionContext()?.depth ?? 0) > 0
    }
    private requireTransaction(operation: string) {
        if (!this.isInTransaction()) {
            throw new Error(`${operation} requires an active transaction`)
        }
    }
    private async withAtomicTransaction<T>(operation: string, fn: () => Promise<T>): Promise<T> {
        if (this.isInTransaction()) {
            return fn()
        }
        return runWithTransactionRetry(operation, (isolation) => this.runInTransaction({ name: operation, isolation }, fn))
    }
    private normalizeSequenceScope(scope: AtomicSequenceScope) {
        return scope.map(item => ({ name: item.name, type: item.type, value: item.value }))
    }
    private validateAtomicSequenceTarget(target: Partial<AtomicSequenceTarget> & { value?: number }) {
        if (!this.db.atomicSequenceCapability || typeof this.db.setupScopedSequenceState !== 'function') {
            throw new TransactionCapabilityError({
                transactionName: `atomic scoped sequence ${target.sequenceName || ''}`,
                requestedIsolation: this.getTransactionIsolation() || 'READ COMMITTED',
                capability: this.getTransactionCapability(),
                reason: 'driver does not support atomic scoped sequences',
            })
        }
        if (typeof target.sequenceName !== 'string' || !/^[a-zA-Z0-9_]+$/.test(target.sequenceName)) {
            throw new Error('Atomic sequence sequenceName must be a non-empty simple identifier')
        }
        if (target.initialValue !== undefined && !Number.isFinite(target.initialValue)) {
            throw new Error('Atomic sequence initialValue must be a finite number')
        }
        if (target.step !== undefined && (!Number.isInteger(target.step) || target.step <= 0)) {
            throw new Error('Atomic sequence step must be a positive integer')
        }
        if (target.value !== undefined && !Number.isFinite(target.value)) {
            throw new Error('Atomic sequence seed value must be a finite number')
        }
        if (!Array.isArray(target.scope)) {
            throw new Error('Atomic sequence scope must be an ordered array')
        }
        for (const { name, type, value } of target.scope) {
            if (!/^[a-zA-Z0-9_]+$/.test(name)) {
                throw new Error(`Atomic sequence scope name "${name}" must be a simple identifier`)
            }
            if (type !== 'string' && type !== 'number' && type !== 'boolean' && type !== 'null' && type !== 'ref') {
                throw new Error(`Atomic sequence scope "${name}" has an invalid type`)
            }
            const validValue = value === null ||
                typeof value === 'string' ||
                typeof value === 'boolean' ||
                (typeof value === 'number' && Number.isFinite(value)) ||
                (typeof value === 'object' && value !== null && (value as { type?: unknown; entity?: unknown; id?: unknown }).type === 'ref' && typeof (value as { entity?: unknown }).entity === 'string' && typeof (value as { id?: unknown }).id === 'string')
            if (!validValue) {
                throw new Error(`Atomic sequence scope "${name}" has an invalid value`)
            }
            const actualType = typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'ref'
                ? 'ref'
                : value === null
                ? 'null'
                : typeof value
            if (type !== actualType) {
                throw new Error(`Atomic sequence scope "${name}" type does not match its value`)
            }
        }
    }
    private sequenceScopeKey(scope: AtomicSequenceScope) {
        return JSON.stringify(this.normalizeSequenceScope(scope))
    }
    private async setDictionaryValue(key: string, value: unknown, emitEvents: boolean): Promise<void> {
        const match = MatchExp.atom({key: 'key', value: ['=', key]})
        const origin = await this.queryHandle!.findOne(DICTIONARY_RECORD, match, undefined, ['value'])
        if (origin) {
            const args: [string, MatchExpressionData, RawEntityData] = [DICTIONARY_RECORD, MatchExp.atom({key: 'id', value: ['=', origin.id]}), {key, value: {raw:value}}]
            if (emitEvents) {
                await this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), args, [])
            } else {
                await this.queryHandle!.update(...args, [])
            }
        } else {
            const args: [string, RawEntityData] = [DICTIONARY_RECORD, { key, value: {raw:value}}]
            if (emitEvents) {
                await this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), args, [])
            } else {
                await this.queryHandle!.create(...args, [])
            }
        }
    }
    // CAUTION kv 结构数据的实现也用 er。这是系统约定，因为也需要  Record 事件！
    async get(concept: string, key: string, initialValue?: unknown) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const value = (await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value']))?.value
        if (value === undefined) return initialValue

        return JSONParse(value)
    }
    async set(concept: string, key: string, value: unknown, events?: RecordMutationEvent[]) {
        const match = MatchExp.atom({key: 'key', value: ['=', key]}).and({  key: 'concept', value: ['=', concept] })
        const origin = await this.queryHandle!.findOne(SYSTEM_RECORD, match, undefined, ['value'])
        if (origin) {
            return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [SYSTEM_RECORD, match, { concept, key: key.toString(), value: JSONStringify(value)}], events)
        } else {
            return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [SYSTEM_RECORD, { concept, key: key.toString(), value: JSONStringify(value)}], events)
        }
    }
    private requiresScopedSequenceState(options?: SystemSchemaOptions) {
        return options?.internalRequirements?.some(requirement => requirement.kind === 'scoped-sequence-table' && requirement.declarations.length > 0) === true
    }
    async setup(entities: EntityInstance[], relations: RelationInstance[], createTables = false, options?: SystemSchemaOptions) {
        await this.db.open(createTables)
        if (createTables && this.db.setupInternalComputationState) {
            await this.db.setupInternalComputationState()
        }
        if (createTables && this.requiresScopedSequenceState(options) && this.db.setupScopedSequenceState) {
            await this.db.setupScopedSequenceState()
        }
        let dbSetup: DBSetup
        try {
            dbSetup = new DBSetup(
                entities, 
                relations, 
                this.db
            )
        } catch (error) {
            throw new ConstraintSetupError(
                error instanceof Error ? error.message : String(error),
                {
                    driver: this.db.constructor?.name,
                    causedBy: error instanceof Error ? error : undefined,
                }
            )
        }
        if (createTables) await dbSetup.createTables()
        await this.createConstraints(dbSetup)
        if (this.db.setupRecordSequences) {
            const tableMap = new EntityToTableMap(dbSetup.map, dbSetup.aliasManager)
            await this.db.setupRecordSequences(Object.keys(dbSetup.map.records).map(recordName => {
                const recordInfo = tableMap.getRecordInfo(recordName)
                const idField = recordInfo.idField
                if (!idField) {
                    throw new Error(`id field not found for ${recordName}`)
                }
                return {
                    recordName,
                    tableName: recordInfo.table,
                    idField,
                }
            }))
        }
        this.queryHandle = new EntityQueryHandle( new EntityToTableMap(dbSetup.map, dbSetup.aliasManager), this.db)

        this.map = dbSetup.map
        this.constraintSchemaItems = dbSetup.constraintSchemaItems
        this.schema = this.createSchemaMetadata(dbSetup)
    }

    async prepareMigrationAdditive(entities: EntityInstance[], relations: RelationInstance[], options?: SystemSchemaOptions): Promise<MigrationSchemaPlan> {
        await this.ensureDbOpenForSchemaRead()
        if (this.db.setupInternalComputationState) {
            // The table creation itself is idempotent, but planning must stay
            // read-only. The actual setup runs in applyMigrationAdditivePlan.
        }
        let dbSetup: DBSetup
        try {
            dbSetup = new DBSetup(
                entities,
                relations,
                this.db
            )
        } catch (error) {
            throw new ConstraintSetupError(
                error instanceof Error ? error.message : String(error),
                {
                    driver: this.db.constructor?.name,
                    causedBy: error instanceof Error ? error : undefined,
                }
            )
        }

        const preRecomputeDDL = await this.createAdditiveSchemaPlan(dbSetup)
        const existingTables = await this.getExistingTables()
        if (this.requiresScopedSequenceState(options) && this.db.setupScopedSequenceState && !existingTables.has('_ScopedSequence_')) {
            const dialect = getSchemaDialect(this.db).name
            preRecomputeDDL.unshift({
                kind: 'create-table',
                tableName: '_ScopedSequence_',
                logicalPath: 'internal:_ScopedSequence_',
                description: 'create scoped sequence state table',
                sql: dialect === 'sqlite'
                    ? `CREATE TABLE IF NOT EXISTS "_ScopedSequence_" ("sequenceName" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "scope" JSON NOT NULL, "lastValue" NUMERIC NOT NULL, PRIMARY KEY ("sequenceName", "scopeKey"))`
                    : `CREATE TABLE IF NOT EXISTS "_ScopedSequence_" ("sequenceName" TEXT NOT NULL, "scopeKey" TEXT NOT NULL, "scope" JSONB NOT NULL, "lastValue" NUMERIC NOT NULL, PRIMARY KEY ("sequenceName", "scopeKey"))`,
            })
        }
        const { verificationDDL, postRecomputeDDL } = this.createPostRecomputeSchemaPlan(dbSetup)
        return {
            schema: this.createSchemaMetadata(dbSetup),
            preRecomputeDDL,
            postRecomputeDDL,
            verificationDDL,
            blockingChanges: [],
            internal: { dbSetup },
        }
    }

    private legacyMigrationOperationKey(phase: string, operation: MigrationDDLOperation, index: number) {
        const columnName = 'columnName' in operation ? operation.columnName || '' : ''
        const sql = 'sql' in operation ? operation.sql || '' : ''
        return `${phase}:${index}:${operation.kind}:${operation.tableName || ''}:${columnName}:${operation.logicalPath || ''}:${sql || operation.description}`
    }

    private async isMigrationOperationCompleteWithLegacy(migrationId: string | undefined, contentKey: string, legacyKey: string) {
        if (await this.isMigrationOperationComplete(migrationId, contentKey)) return true
        return this.isMigrationOperationComplete(migrationId, legacyKey)
    }

    // MySQL 键列是定长 VARCHAR(191)（TEXT 不能做主键）；operationKey 携带完整 DDL 文本可能超长，
    //  且驱动 SET sql_mode='ANSI_QUOTES' 后 STRICT 模式被替换掉——超长值会被**静默截断**，
    //  不同操作截到同一前缀即键碰撞：已完成的操作被误判/未完成的被跳过（DDL 静默缺失）。
    //  在 MySQL 上以 sha256 代理键存储；读写两侧必须经同一归一化（这里是唯一的读写汇合点，
    //  applyMigrationOperations / verifyMigrationPlan / Controller 的 manifest key 全部经过）。
    //  PG/PGLite/SQLite 保持原文键（可读、测试可 LIKE 前缀断言）。
    private migrationOperationKeyForStorage(operationKey: string) {
        if (getSchemaDialect(this.db).name !== 'mysql') return operationKey
        return createHash('sha256').update(operationKey).digest('hex')
    }

    async isMigrationOperationComplete(migrationId: string | undefined, operationKey: string) {
        if (!migrationId) return false
        const dialect = getSchemaDialect(this.db).name
        const [p1, p2] = migrationSQLPlaceholders(dialect, 2)
        const rows = await this.db.query<{ status: string }>(
            `SELECT "status" FROM "__interaqt_migration_operation_log" WHERE "migrationId" = ${p1} AND "operationKey" = ${p2} LIMIT 1`,
            [migrationId, this.migrationOperationKeyForStorage(operationKey)],
            'read migration operation log'
        )
        return rows[0]?.status === 'succeeded'
    }

    async markMigrationOperationComplete(migrationId: string | undefined, operationKey: string) {
        if (!migrationId) return
        const dialect = getSchemaDialect(this.db).name
        const [p1, p2] = migrationSQLPlaceholders(dialect, 2)
        const conflictClause = dialect === 'mysql'
            ? `ON DUPLICATE KEY UPDATE "status" = VALUES("status")`
            : `ON CONFLICT ("migrationId", "operationKey") DO UPDATE SET "status" = EXCLUDED."status"`
        await this.db.update(
            `INSERT INTO "__interaqt_migration_operation_log" ("migrationId", "operationKey", "status") VALUES (${p1}, ${p2}, 'succeeded') ${conflictClause}`,
            [migrationId, this.migrationOperationKeyForStorage(operationKey)],
            undefined,
            'write migration operation log'
        )
    }

    private async applyMigrationOperations(phase: string, operations: MigrationDDLOperation[], migrationId?: string) {
        const occurrenceByContent = new Map<string, number>()
        for (const [index, operation] of operations.entries()) {
            const sql = 'sql' in operation && operation.sql
                ? operation.sql
                : operation.kind === 'drop-empty-fact-table'
                ? `DROP TABLE IF EXISTS ${quoteIdentifier(operation.tableName, getSchemaDialect(this.db))}`
                : undefined
            if (!sql) continue
            const content = migrationOperationContentKey(phase, operation)
            const occurrence = occurrenceByContent.get(content) ?? 0
            occurrenceByContent.set(content, occurrence + 1)
            const operationKey = `${content}#${occurrence}`
            const legacyKey = this.legacyMigrationOperationKey(phase, operation, index)
            if (await this.isMigrationOperationCompleteWithLegacy(migrationId, operationKey, legacyKey)) continue
            await this.db.scheme(sql, operation.description)
            await this.markMigrationOperationComplete(migrationId, operationKey)
        }
    }

    async applyMigrationAdditivePlan(plan: MigrationSchemaPlan, migrationId?: string) {
        const dbSetup = (plan.internal as { dbSetup: DBSetup }).dbSetup
        await this.db.open(false)
        if (this.db.setupInternalComputationState) {
            await this.db.setupInternalComputationState()
        }
        const requiresScopedSequence = (plan.internal as { options?: SystemSchemaOptions }).options?.internalRequirements?.some(requirement => requirement.kind === 'scoped-sequence-table' && requirement.declarations.length > 0) === true
        if (requiresScopedSequence && this.db.setupScopedSequenceState) {
            await this.db.setupScopedSequenceState()
        }
        await this.applyMigrationOperations('schema', plan.preRecomputeDDL, migrationId)
        if (this.db.setupRecordSequences) {
            const tableMap = new EntityToTableMap(dbSetup.map, dbSetup.aliasManager)
            await this.db.setupRecordSequences(Object.keys(dbSetup.map.records).map(recordName => {
                const recordInfo = tableMap.getRecordInfo(recordName)
                const idField = recordInfo.idField
                if (!idField) {
                    throw new Error(`id field not found for ${recordName}`)
                }
                return {
                    recordName,
                    tableName: recordInfo.table,
                    idField,
                }
            }))
        }
        this.queryHandle = new EntityQueryHandle(new EntityToTableMap(dbSetup.map, dbSetup.aliasManager), this.db)
        this.map = dbSetup.map
        this.constraintSchemaItems = dbSetup.constraintSchemaItems
        this.schema = this.createSchemaMetadata(dbSetup)
    }

    async applyPostRecomputeSchemaPlan(plan: MigrationSchemaPlan, migrationId?: string) {
        await this.applyMigrationOperations('constraints', plan.postRecomputeDDL, migrationId)
    }

    async verifyMigrationPlan(plan: MigrationSchemaPlan, migrationId?: string) {
        const occurrenceByContent = new Map<string, number>()
        for (const [index, operation] of plan.verificationDDL.entries()) {
            if (!operation.sql) continue
            const content = migrationOperationContentKey('verification', operation)
            const occurrence = occurrenceByContent.get(content) ?? 0
            occurrenceByContent.set(content, occurrence + 1)
            const operationKey = `${content}#${occurrence}`
            const legacyKey = this.legacyMigrationOperationKey('verification', operation, index)
            if (await this.isMigrationOperationCompleteWithLegacy(migrationId, operationKey, legacyKey)) continue
            const rows = await this.db.query<Record<string, unknown>>(operation.sql, [], operation.description)
            if (rows.length > 0) {
                throw new ConstraintSetupError(`Migration verification failed for ${operation.logicalPath || operation.description}`, {
                    tableName: operation.tableName,
                    constraintName: operation.logicalPath,
                })
            }
            await this.markMigrationOperationComplete(migrationId, operationKey)
        }
    }

    private async createAdditiveSchemaPlan(dbSetup: DBSetup): Promise<AdditiveDDLOperation[]> {
        const operations: AdditiveDDLOperation[] = []
        const existingTables = await this.getExistingTables()
        for (const [tableName, table] of Object.entries(dbSetup.tables)) {
            if (!existingTables.has(tableName)) {
                const createTableSQL = dbSetup.createTableSQL().find(sql => sql.includes(`CREATE TABLE "${tableName}"`))
                if (!createTableSQL) {
                    throw new Error(`Cannot find create table SQL for ${tableName}`)
                }
                operations.push({
                    kind: 'create-table',
                    sql: createTableSQL.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'),
                    tableName,
                    description: `migration create table ${tableName}`,
                })
                continue
            }

            const existingColumns = await this.getExistingColumns(tableName)
            for (const column of Object.values(table.columns)) {
                if (existingColumns.has(column.name) || column.name === '_rowId') continue
                operations.push({
                    kind: 'add-column',
                    sql: `ALTER TABLE "${tableName}" ADD COLUMN "${column.name}" ${column.fieldType}`,
                    tableName,
                    columnName: column.name,
                    description: `migration add column ${tableName}.${column.name}`,
                })
            }
        }
        return operations
    }

    private createPostRecomputeSchemaPlan(dbSetup: DBSetup): { verificationDDL: AdditiveDDLOperation[], postRecomputeDDL: AdditiveDDLOperation[] } {
        const dialect = getSchemaDialect(this.db)
        if (dbSetup.constraintSchemaItems.length && dialect.constraints?.unique !== true) {
            const hasUnique = dbSetup.constraintSchemaItems.some(item => item.kind === 'unique')
            if (hasUnique) throw new ConstraintSetupError(`Migration post-recompute unique constraints are not supported by ${dialect.name}`, {
                driver: this.db.constructor?.name,
            })
        }
        if (dbSetup.constraintSchemaItems.some(item => item.kind === 'non-null') && dialect.constraints?.nonNull !== true) {
            throw new ConstraintSetupError(`Migration post-recompute non-null constraints are not supported by ${dialect.name}`, {
                driver: this.db.constructor?.name,
            })
        }
        const verificationDDL = dbSetup.constraintSchemaItems.map(item => ({
            kind: 'verify' as const,
            sql: item.kind === 'unique' ? this.createUniqueVerificationSQL(item) : this.createNonNullVerificationSQL(item),
            tableName: item.tableName,
            logicalPath: item.kind === 'unique' ? `${item.recordName}.${item.properties.join('.')}` : `${item.recordName}.${item.property}`,
            description: `migration verify constraint ${item.constraintName}`,
        }))
        const postRecomputeDDL = dbSetup.createConstraintSQL().map(statement => ({
            kind: 'create-constraint' as const,
            sql: statement.sql,
            tableName: statement.item.tableName,
            logicalPath: statement.item.kind === 'unique'
                ? `${statement.item.recordName}.${statement.item.properties.join('.')}`
                : `${statement.item.recordName}.${statement.item.property}`,
            description: `migration setup constraint ${statement.item.constraintName}`,
        }))
        return { verificationDDL, postRecomputeDDL }
    }

    private createNonNullVerificationSQL(item: ConstraintSchemaItem) {
        if (item.kind !== 'non-null') {
            throw new Error('expected non-null constraint')
        }
        return `SELECT "${item.field}" FROM "${item.tableName}" WHERE "${item.field}" IS NULL LIMIT 1`
    }

    private createUniqueVerificationSQL(item: Extract<ConstraintSchemaItem, { kind: 'unique' }>) {
        const fields = item.fields.map(field => `"${field}"`)
        const notNull = fields.map(field => `${field} IS NOT NULL`)
        const whereClauses = [...notNull]
        Object.entries(item.where || {}).forEach(([property, operator]) => {
            const field = item.fields[item.properties.indexOf(property)]
            if (field) {
                whereClauses.push(this.constraintPredicateToSQL(`"${field}"`, operator as ConstraintPredicateOperator))
            }
        })
        const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''
        return `SELECT ${fields.join(', ')}, COUNT(*) AS "__count" FROM "${item.tableName}" ${where} GROUP BY ${fields.join(', ')} HAVING COUNT(*) > 1 LIMIT 1`
    }

    private constraintPredicateToSQL(field: string, operator: ConstraintPredicateOperator) {
        const encode = getSchemaDialect(this.db).encodeLiteral || ((value: string | number | boolean | null) => value === null ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`)
        switch (operator.op) {
            case 'isNull':
                return `${field} IS NULL`
            case 'isNotNull':
                return `${field} IS NOT NULL`
            case 'equals':
                return `${field} = ${encode(operator.value)}`
            case 'notEquals':
                return `${field} <> ${encode(operator.value)}`
            case 'in':
                return `${field} IN (${operator.value.map(value => encode(value)).join(', ')})`
            case 'notIn':
                return `${field} NOT IN (${operator.value.map(value => encode(value)).join(', ')})`
        }
    }

    async getExistingTables() {
        await this.ensureDbOpenForSchemaRead()
        const dialect = getSchemaDialect(this.db).name
        if (dialect === 'postgres') {
            const rows = await this.db.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
                [],
                'migration list tables'
            )
            return new Set(rows.map(row => row.table_name))
        }
        if (dialect === 'sqlite') {
            const rows = await this.db.query<{ name: string }>(
                `SELECT name FROM sqlite_master WHERE type = 'table'`,
                [],
                'migration list tables'
            )
            return new Set(rows.map(row => row.name))
        }
        const rows = await this.db.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`,
            [],
            'migration list tables'
        )
        return new Set(rows.map(row => row.table_name))
    }

    private async getExistingColumns(tableName: string) {
        const dialect = getSchemaDialect(this.db).name
        if (dialect === 'postgres') {
            const rows = await this.db.query<{ column_name: string }>(
                `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
                [tableName],
                `migration list columns ${tableName}`
            )
            return new Set(rows.map(row => row.column_name))
        }
        if (dialect === 'sqlite') {
            const escapedTableName = tableName.replace(/"/g, '""')
            const rows = await this.db.query<{ name: string }>(
                `PRAGMA table_info("${escapedTableName}")`,
                [],
                `migration list columns ${tableName}`
            )
            return new Set(rows.map(row => row.name))
        }
        const rows = await this.db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
            [tableName],
            `migration list columns ${tableName}`
        )
        return new Set(rows.map(row => row.column_name))
    }

    private createSchemaMetadata(dbSetup: DBSetup): StorageSchemaMetadata {
        const tableOwners = new Map<string, string[]>()
        Object.entries(dbSetup.map.records).forEach(([recordName, record]) => {
            if (!tableOwners.has(record.table)) tableOwners.set(record.table, [])
            tableOwners.get(record.table)!.push(recordName)
        })
        return {
            dialect: getSchemaDialect(this.db),
            records: Object.entries(dbSetup.map.records).map(([recordName, record]) => ({
                recordName,
                tableName: record.table,
                isRelation: record.isRelation === true,
                isFiltered: record.isFilteredEntity === true || record.isFilteredRelation === true,
                resolvedBaseRecordName: record.resolvedBaseRecordName,
                resolvedMatchExpression: record.resolvedMatchExpression,
                attributes: Object.keys(record.attributes),
                attributeDetails: Object.entries(record.attributes).map(([attributeName, attribute]) => {
                    const valueAttribute = attribute as any
                    const recordAttribute = attribute as any
                    return {
                        name: attributeName,
                        kind: recordAttribute.isRecord ? 'record' as const : 'value' as const,
                        tableName: valueAttribute.table || record.table,
                        fieldName: valueAttribute.field,
                        type: valueAttribute.type,
                        fieldType: valueAttribute.fieldType,
                        collection: valueAttribute.collection,
                        computed: valueAttribute.computed !== undefined,
                        linkName: recordAttribute.linkName,
                        sourceField: dbSetup.map.links[recordAttribute.linkName]?.sourceField,
                        targetField: dbSetup.map.links[recordAttribute.linkName]?.targetField,
                        resolvedBaseRecordName: recordAttribute.resolvedBaseRecordName,
                    }
                }),
            })),
            tables: Object.entries(dbSetup.tables).map(([tableName, table]) => ({
                tableName,
                columns: Object.keys(table.columns),
                columnDetails: Object.values(table.columns).map(column => ({
                    columnName: column.name,
                    fieldType: column.fieldType || '',
                    ownerRecords: tableOwners.get(tableName) || [],
                })),
            })),
            constraints: dbSetup.constraintSchemaItems.map(item => ({ ...item })),
        }
    }

    private async createConstraints(dbSetup: DBSetup) {
        let statements
        try {
            statements = dbSetup.createConstraintSQL()
        } catch (error) {
            throw new ConstraintSetupError(
                error instanceof Error ? error.message : String(error),
                {
                    driver: this.db.constructor?.name,
                    causedBy: error instanceof Error ? error : undefined,
                }
            )
        }

        for (const statement of statements) {
            const item = statement.item
            try {
                await this.db.scheme(statement.sql, `setup constraint ${item.constraintName}`)
            } catch (error) {
                throw new ConstraintSetupError(
                    `Failed to setup constraint "${item.constraintName}" on "${item.recordName}"`,
                    {
                        constraintName: item.constraintName,
                        physicalName: item.physicalName,
                        recordName: item.recordName,
                        tableName: item.tableName,
                        properties: item.kind === 'unique' ? item.properties : [item.property],
                        driver: this.db.constructor?.name,
                        rawCode: normalizeDatabaseError(error, this.db).rawCode,
                        causedBy: error instanceof Error ? error : undefined,
                    }
                )
            }
        }
    }

    private isRecordTarget(target: AtomicTarget): target is AtomicRecordTarget {
        return (target as AtomicRecordTarget).recordName !== undefined
    }

    private resolveRecordTarget(target: AtomicRecordTarget) {
        const map = this.queryHandle!.map
        const inputRecordInfo = map.getRecordInfo(target.recordName)
        const resolvedRecordName = inputRecordInfo.resolvedBaseRecordName || target.recordName
        const recordInfo = map.getRecordInfo(resolvedRecordName)
        const [, fieldName, tableName] = map.getTableAliasAndFieldName([resolvedRecordName], target.field, true)
        // r24：记录 valueType，读路径归一化（boolean 0/1、JSON 文本）与 QueryExecutor.structureRawReturns 对齐。
        const attrData = map.getAttributeData(resolvedRecordName, target.field) as { type?: string, collection?: boolean } | undefined
        const valueType = attrData
            ? ((attrData.collection || attrData.type === 'object' || attrData.type === 'json') ? 'json' : attrData.type)
            : undefined
        return { tableName, idField: recordInfo.idField, fieldName, valueType }
    }

    /**
     * record-target atomic 读值归一化（r24）：与 QueryExecutor.structureRawReturns 同一契约。
     * SQLite/MySQL 的 boolean 列以 0/1 存储、JSON 列返回原始文本；PG/PGLite 原生类型无需处理。
     * 此前 atomic.get/replace 原样返回驱动值——同一字段 find 返回 true、atomic 返回 1 的跨路径类型分裂。
     */
    private parseRecordFieldValue<T>(value: unknown, valueType: string | undefined): T | null {
        if (value === undefined || value === null) return null
        if (valueType === 'boolean' && typeof value === 'number') return (value !== 0) as T
        if (valueType === 'json' && typeof value === 'string' && this.db.returnsParsedJSON !== true) {
            return JSON.parse(value) as T
        }
        // r26：timestamp 与 find 路径同一契约（epoch 毫秒）。
        if (valueType === 'timestamp') return normalizeTimestampReadValue(value) as T
        return value as T
    }

    /**
     * record-target atomic 写参归一化（r25，r24 读路径归一化的对称面）：与 storage 写路径
     * （SQLBuilder.prepareFieldValue）同一契约——json 字段一律写入规范序列化文本。
     * 此前 replace/compareAndSet 把 JS 对象裸传给 db.query：better-sqlite3 无法绑定对象直接
     * 崩溃，且键序不定的存储文本会让规范化比较失效。boolean 由各驱动的 query() 统一转换。
     */
    private normalizeRecordFieldParam(value: unknown, valueType: string | undefined): unknown {
        if (valueType === 'json' && value !== null && value !== undefined && typeof value !== 'string') {
            return canonicalJSONStringify(value)
        }
        // r26：timestamp 写参与 storage 写路径（prepareFieldValue）同一契约。
        if (valueType === 'timestamp' && value !== null && value !== undefined) {
            const ms = normalizeTimestampInputToMs(value, 'atomic write')
            return timestampParamForDialect(ms, getSchemaDialect(this.db).name)
        }
        return value
    }

    private resolveRecordTable(recordName: string) {
        const map = this.queryHandle!.map
        const inputRecordInfo = map.getRecordInfo(recordName)
        const resolvedRecordName = inputRecordInfo.resolvedBaseRecordName || recordName
        const recordInfo = map.getRecordInfo(resolvedRecordName)
        return { tableName: recordInfo.table, idField: recordInfo.idField, resolvedRecordName }
    }

    /**
     * 收集 lockRecord 结果快照里已加载的全部关联行（r24）：递归遍历关联记录（x:1 对象 /
     * x:n 数组），解析各自的物理表与 idField。lockKey = `record\0id` 用于跨轮次去重。
     * 同物理行的合表记录（combined/reliance）重复加锁是无害 no-op（同事务重入）。
     */
    private collectLoadedRelatedRows(recordName: string, record: Record<string, unknown>): Array<{ tableName: string, idField: string, id: unknown, lockKey: string }> {
        const map = this.queryHandle!.map
        const rows: Array<{ tableName: string, idField: string, id: unknown, lockKey: string }> = []
        const seen = new Set<string>()
        const rootLockKey = `${this.resolveRecordTable(recordName).resolvedRecordName}\0${String(record.id)}`
        const walk = (currentRecordName: string, current: Record<string, unknown>) => {
            const resolvedName = map.getRecordInfo(currentRecordName).resolvedBaseRecordName || currentRecordName
            for (const [key, value] of Object.entries(current)) {
                if (value === null || typeof value !== 'object') continue
                const attrData = map.getAttributeData(resolvedName, key) as { isRecord?: boolean, recordName?: string } | undefined
                if (!attrData?.isRecord || !attrData.recordName) continue
                const relatedName = attrData.recordName
                const relatedItems = (Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>
                for (const item of relatedItems) {
                    if (!item || item.id === undefined || item.id === null) continue
                    const { tableName, idField, resolvedRecordName } = this.resolveRecordTable(relatedName)
                    const lockKey = `${resolvedRecordName}\0${String(item.id)}`
                    if (!seen.has(lockKey)) {
                        seen.add(lockKey)
                        // root 行本身已被 FOR UPDATE 锁住，跳过（环回到 root 的情形）。
                        if (lockKey !== rootLockKey && idField) {
                            rows.push({ tableName, idField, id: item.id, lockKey })
                        }
                        walk(relatedName, item)
                    }
                }
            }
        }
        walk(recordName, record)
        return rows
    }

    private resolveGlobalColumn(target: AtomicGlobalTarget, value?: unknown) {
        const valueType = target.valueType || typeof target.defaultValue || typeof value
        if (valueType === 'number') return 'numberValue'
        if (valueType === 'boolean') return 'booleanValue'
        if (valueType === 'string') return 'stringValue'
        return 'jsonValue'
    }

    private normalizeGlobalValue(value: unknown, column: string) {
        if (value === undefined) return null
        if (column === 'numberValue' && value !== null) return Number(value)
        if (column === 'jsonValue' && value !== null && typeof value !== 'string') return JSON.stringify(value)
        return value
    }

    private parseGlobalValue<T>(value: unknown, column: string): T | null {
        if (value === undefined || value === null) return null
        if (column === 'numberValue') return Number(value) as T
        // r24：SQLite/MySQL 的 BOOLEAN 列以 0/1 数字返回，与 find 路径（structureRawReturns）对齐归一化。
        if (column === 'booleanValue' && typeof value === 'number') return (value !== 0) as T
        if (column === 'jsonValue' && typeof value === 'string') return JSON.parse(value) as T
        return value as T
    }

    private supportsForUpdate() {
        return this.db.supportsSelectForUpdate !== false
    }

    private getPlaceholder() {
        return this.db.getPlaceholder?.() || (() => '?')
    }

    private async ensureGlobalStateRow(target: AtomicGlobalTarget, column: string, defaultValue = target.defaultValue) {
        const p = this.getPlaceholder()
        const storedDefault = this.normalizeGlobalValue(defaultValue, column)
        if (storedDefault === null) {
            await this.db.update(
                `INSERT INTO "_ComputationState_" ("key") VALUES (${p()}) ON CONFLICT ("key") DO NOTHING`,
                [target.key],
                undefined,
                `atomic ensure global ${target.key}`
            )
        } else {
            const keyPlaceholder = p()
            const valuePlaceholder = p()
            await this.db.update(
                `INSERT INTO "_ComputationState_" ("key", "${column}") VALUES (${keyPlaceholder}, ${valuePlaceholder}) ON CONFLICT ("key") DO NOTHING`,
                [target.key, storedDefault],
                undefined,
                `atomic ensure global ${target.key}`
            )
        }
    }

    private createAtomicStorage(): AtomicStorage {
        const globalColumns = ['numberValue', 'booleanValue', 'stringValue', 'jsonValue']
        return {
            get: async <T>(target: AtomicTarget): Promise<T | null> => {
                const p = this.getPlaceholder()
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName, valueType } = this.resolveRecordTarget(target)
                    const rows = await this.db.query<Record<string, unknown>>(
                        `SELECT "${fieldName}" AS value FROM "${tableName}" WHERE "${idField}" = ${p()}`,
                        [target.id],
                        `atomic get ${target.recordName}.${target.field}`
                    )
                    return this.parseRecordFieldValue<T>(rows[0]?.value, valueType)
                }

                const column = this.resolveGlobalColumn(target)
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${column}" AS value FROM "_ComputationState_" WHERE "key" = ${p()}`,
                    [target.key],
                    `atomic get ${target.key}`
                )
                return this.parseGlobalValue<T>(rows[0]?.value, column)
            },
            increment: async (target: AtomicTarget, delta: number): Promise<number> => {
                const p = this.getPlaceholder()
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName } = this.resolveRecordTarget(target)
                    const deltaPlaceholder = p()
                    const idPlaceholder = p()
                    const rows = await this.db.query<Record<string, unknown>>(
                        `UPDATE "${tableName}" SET "${fieldName}" = COALESCE("${fieldName}", 0) + ${deltaPlaceholder} WHERE "${idField}" = ${idPlaceholder} RETURNING "${fieldName}" AS value`,
                        [delta, target.id],
                        `atomic increment ${target.recordName}.${target.field}`
                    )
                    if (!rows.length) throw new Error(`Atomic increment target not found: ${target.recordName}.${String(target.id)}.${target.field}`)
                    return Number(rows[0]?.value ?? await this.atomic.get(target) ?? 0)
                }

                const keyPlaceholder = p()
                const deltaPlaceholder = p()
                const updateDeltaPlaceholder = p()
                const rows = await this.db.query<Record<string, unknown>>(
                    `INSERT INTO "_ComputationState_" ("key", "numberValue") VALUES (${keyPlaceholder}, ${deltaPlaceholder})
ON CONFLICT ("key") DO UPDATE SET "numberValue" = COALESCE("_ComputationState_"."numberValue", 0) + ${updateDeltaPlaceholder}
RETURNING "numberValue" AS value`,
                    [target.key, delta, delta],
                    `atomic increment ${target.key}`
                )
                return Number(rows[0]?.value ?? await this.atomic.get(target) ?? 0)
            },
            replace: async <T>(target: AtomicTarget, value: T): Promise<{ oldValue: T | null, newValue: T }> => this.withAtomicTransaction(
                this.isRecordTarget(target) ? `atomic replace ${target.recordName}.${target.field}` : `atomic replace ${target.key}`,
                async () => {
                const p = this.getPlaceholder()
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName, valueType } = this.resolveRecordTarget(target)
                    const lockIdPlaceholder = p()
                    const oldRows = await this.db.query<Record<string, unknown>>(
                        `SELECT "${fieldName}" AS value FROM "${tableName}" WHERE "${idField}" = ${lockIdPlaceholder}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                        [target.id],
                        `atomic replace lock ${target.recordName}.${target.field}`
                    )
                    if (!oldRows.length) throw new Error(`Atomic replace target not found: ${target.recordName}.${String(target.id)}.${target.field}`)
                    const updateP = this.getPlaceholder()
                    const valuePlaceholder = updateP()
                    const idPlaceholder = updateP()
                    const newRows = await this.db.query<Record<string, unknown>>(
                        `UPDATE "${tableName}" SET "${fieldName}" = ${valuePlaceholder} WHERE "${idField}" = ${idPlaceholder} RETURNING "${fieldName}" AS value`,
                        [this.normalizeRecordFieldParam(value, valueType), target.id],
                        `atomic replace ${target.recordName}.${target.field}`
                    )
                    return {
                        oldValue: this.parseRecordFieldValue<T>(oldRows[0].value, valueType),
                        newValue: (this.parseRecordFieldValue<T>(newRows[0]?.value, valueType) ?? value) as T
                    }
                }

                const column = this.resolveGlobalColumn(target, value)
                const storedValue = this.normalizeGlobalValue(value, column)
                await this.ensureGlobalStateRow(target, column)
                const lockKeyPlaceholder = p()
                const oldRows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${column}" AS value FROM "_ComputationState_" WHERE "key" = ${lockKeyPlaceholder}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [target.key],
                    `atomic replace lock ${target.key}`
                )
                const clearColumns = globalColumns.filter(item => item !== column).map(item => `"${item}" = NULL`).join(', ')
                const oldValue = (this.parseGlobalValue<T>(oldRows[0]?.value, column) ?? target.defaultValue ?? null) as T | null
                const updateP = this.getPlaceholder()
                const valuePlaceholder = updateP()
                const keyPlaceholder = updateP()
                const setColumns = [`"${column}" = ${valuePlaceholder}`, clearColumns].filter(Boolean).join(', ')
                const newRows = await this.db.query<Record<string, unknown>>(
                    `UPDATE "_ComputationState_" SET ${setColumns} WHERE "key" = ${keyPlaceholder} RETURNING "${column}" AS value`,
                    [storedValue, target.key],
                    `atomic replace ${target.key}`
                )
                return { oldValue, newValue: (this.parseGlobalValue<T>(newRows[0]?.value, column) ?? value) as T }
            }),
            compareAndSet: async <T>(target: AtomicTarget, expected: T, next: T, options?: { defaultValue?: T }): Promise<boolean> => {
                const p = this.getPlaceholder()
                const defaultValue = options?.defaultValue
                if (this.isRecordTarget(target)) {
                    const { tableName, idField, fieldName, valueType } = this.resolveRecordTarget(target)
                    // CAUTION json 字段不能用单语句 `COALESCE(col, ?) = ?` 做比较（r25，r24 归一化家族）：
                    //  PG 系的 json 类型没有等值操作符（"operator does not exist: json = unknown"），
                    //  文本比较又对键序敏感。改走「锁定读 → 规范形比较 → 条件写」的事务路径
                    //  （与 replace 同一事务原语；FOR UPDATE 不可用的单连接驱动本就串行执行）。
                    if (valueType === 'json') {
                        return this.withAtomicTransaction(`atomic compareAndSet ${target.recordName}.${target.field}`, async () => {
                            const lockP = this.getPlaceholder()
                            const rows = await this.db.query<Record<string, unknown>>(
                                `SELECT "${fieldName}" AS value FROM "${tableName}" WHERE "${idField}" = ${lockP()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                                [target.id],
                                `atomic compareAndSet lock ${target.recordName}.${target.field}`
                            )
                            if (!rows.length) return false
                            const current = this.parseRecordFieldValue<T>(rows[0].value, valueType)
                            const currentForCompare = current === null ? (defaultValue ?? null) : current
                            if (canonicalJSONStringify(currentForCompare) !== canonicalJSONStringify(expected ?? null)) return false
                            const updateP = this.getPlaceholder()
                            const valuePlaceholder = updateP()
                            const idPlaceholder = updateP()
                            await this.db.update(
                                `UPDATE "${tableName}" SET "${fieldName}" = ${valuePlaceholder} WHERE "${idField}" = ${idPlaceholder}`,
                                [this.normalizeRecordFieldParam(next, valueType), target.id],
                                undefined,
                                `atomic compareAndSet ${target.recordName}.${target.field}`
                            )
                            return true
                        })
                    }
                    const nextPlaceholder = p()
                    const idPlaceholder = p()
                    const defaultPlaceholder = p()
                    const expectedPlaceholder = p()
                    const rows = await this.db.query<Record<string, unknown>>(
                        `UPDATE "${tableName}" SET "${fieldName}" = ${nextPlaceholder} WHERE "${idField}" = ${idPlaceholder} AND COALESCE("${fieldName}", ${defaultPlaceholder}) = ${expectedPlaceholder} RETURNING "${fieldName}" AS value`,
                        [next, target.id, defaultValue, expected],
                        `atomic compareAndSet ${target.recordName}.${target.field}`
                    )
                    return rows.length > 0
                }

                const column = this.resolveGlobalColumn(target, next)
                const storedNext = this.normalizeGlobalValue(next, column)
                const storedDefault = this.normalizeGlobalValue(defaultValue, column)
                const storedExpected = this.normalizeGlobalValue(expected, column)
                const nextPlaceholder = p()
                const keyPlaceholder = p()
                const defaultPlaceholder = p()
                const expectedPlaceholder = p()
                const rows = await this.db.query<Record<string, unknown>>(
                    `UPDATE "_ComputationState_" SET "${column}" = ${nextPlaceholder} WHERE "key" = ${keyPlaceholder} AND COALESCE("${column}", ${defaultPlaceholder}) = ${expectedPlaceholder} RETURNING "${column}" AS value`,
                    [storedNext, target.key, storedDefault, storedExpected],
                    `atomic compareAndSet ${target.key}`
                )
                if (rows.length) return true
                if (storedExpected !== storedDefault) return false
                const insertP = this.getPlaceholder()
                const insertKeyPlaceholder = insertP()
                const insertNextPlaceholder = insertP()
                const inserted = await this.db.query<Record<string, unknown>>(
                    `INSERT INTO "_ComputationState_" ("key", "${column}") VALUES (${insertKeyPlaceholder}, ${insertNextPlaceholder}) ON CONFLICT ("key") DO NOTHING RETURNING "${column}" AS value`,
                    [target.key, storedNext],
                    `atomic compareAndSet insert ${target.key}`
                )
                return inserted.length > 0
            },
            lockGlobal: async <T>(target: AtomicGlobalTarget): Promise<T | null> => {
                this.requireTransaction(`atomic lockGlobal ${target.key}`)
                const column = this.resolveGlobalColumn(target)
                await this.ensureGlobalStateRow(target, column)
                const p = this.getPlaceholder()
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${column}" AS value FROM "_ComputationState_" WHERE "key" = ${p()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [target.key],
                    `atomic lockGlobal ${target.key}`
                )
                return (this.parseGlobalValue<T>(rows[0]?.value, column) ?? target.defaultValue ?? null) as T | null
            },
            nextSequenceValue: async (target: AtomicSequenceTarget): Promise<number> => {
                this.validateAtomicSequenceTarget(target)
                this.requireTransaction(`atomic scoped sequence ${target.sequenceName}`)
                const scopeKey = this.sequenceScopeKey(target.scope)
                const scopeJson = JSON.stringify(this.normalizeSequenceScope(target.scope))
                const firstValue = target.initialValue + target.step
                const p = this.getPlaceholder()
                const sequenceNamePlaceholder = p()
                const scopeKeyPlaceholder = p()
                const scopePlaceholder = p()
                const initialValuePlaceholder = p()
                const updateStepPlaceholder = p()
                const rows = await this.db.query<{ value: number | string }>(
                    `INSERT INTO "_ScopedSequence_" ("sequenceName", "scopeKey", "scope", "lastValue") VALUES (${sequenceNamePlaceholder}, ${scopeKeyPlaceholder}, ${scopePlaceholder}, ${initialValuePlaceholder})
ON CONFLICT ("sequenceName", "scopeKey") DO UPDATE SET "lastValue" = "_ScopedSequence_"."lastValue" + ${updateStepPlaceholder}
RETURNING "lastValue" AS value`,
                    [target.sequenceName, scopeKey, scopeJson, firstValue, target.step],
                    `atomic scoped sequence ${target.sequenceName}`
                )
                if (!rows.length) throw new Error(`ScopedSequence allocation failed for ${target.sequenceName}`)
                return Number(rows[0].value)
            },
            seedSequenceValue: async (target: AtomicSequenceTarget & { value: number; mode?: 'max' | 'replace' }): Promise<void> => {
                this.validateAtomicSequenceTarget(target)
                if (target.mode !== undefined && target.mode !== 'max' && target.mode !== 'replace') {
                    throw new Error('Atomic sequence seed mode must be "max" or "replace"')
                }
                this.requireTransaction(`atomic scoped sequence seed ${target.sequenceName}`)
                const scopeKey = this.sequenceScopeKey(target.scope)
                const scopeJson = JSON.stringify(this.normalizeSequenceScope(target.scope))
                const mode = target.mode ?? 'max'
                const p = this.getPlaceholder()
                const sequenceNamePlaceholder = p()
                const scopeKeyPlaceholder = p()
                const scopePlaceholder = p()
                const valuePlaceholder = p()
                const updateValuePlaceholder = p()
                const dialect = getSchemaDialect(this.db).name
                const maxExpression = dialect === 'sqlite'
                    ? `MAX("_ScopedSequence_"."lastValue", ${updateValuePlaceholder})`
                    : `GREATEST("_ScopedSequence_"."lastValue", ${updateValuePlaceholder})`
                const assignment = mode === 'replace'
                    ? `${updateValuePlaceholder}`
                    : maxExpression
                await this.db.query(
                    `INSERT INTO "_ScopedSequence_" ("sequenceName", "scopeKey", "scope", "lastValue") VALUES (${sequenceNamePlaceholder}, ${scopeKeyPlaceholder}, ${scopePlaceholder}, ${valuePlaceholder})
ON CONFLICT ("sequenceName", "scopeKey") DO UPDATE SET "lastValue" = ${assignment}
RETURNING "lastValue" AS value`,
                    [target.sequenceName, scopeKey, scopeJson, target.value, target.value],
                    `atomic scoped sequence seed ${target.sequenceName}`
                )
            },
            readSequenceValue: async (target: Pick<AtomicSequenceTarget, 'sequenceName' | 'scope'>): Promise<number | undefined> => {
                this.validateAtomicSequenceTarget(target)
                const p = this.getPlaceholder()
                const sequenceNamePlaceholder = p()
                const scopeKeyPlaceholder = p()
                const rows = await this.db.query<{ value: number | string }>(
                    `SELECT "lastValue" AS value FROM "_ScopedSequence_" WHERE "sequenceName" = ${sequenceNamePlaceholder} AND "scopeKey" = ${scopeKeyPlaceholder}`,
                    [target.sequenceName, this.sequenceScopeKey(target.scope)],
                    `atomic scoped sequence read ${target.sequenceName}`
                )
                return rows.length ? Number(rows[0].value) : undefined
            },
            updateGlobalFields: async (
                target: AtomicGlobalTarget,
                deltas: Record<string, number>,
                defaults: Record<string, number> = {}
            ): Promise<Record<string, number>> => {
                this.requireTransaction(`atomic updateGlobalFields ${target.key}`)
                const jsonTarget = { ...target, valueType: 'json' as const, defaultValue: defaults }
                await this.ensureGlobalStateRow(jsonTarget, 'jsonValue', defaults)
                const p = this.getPlaceholder()
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "jsonValue" AS value FROM "_ComputationState_" WHERE "key" = ${p()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [target.key],
                    `atomic updateGlobalFields lock ${target.key}`
                )
                const current = (this.parseGlobalValue<Record<string, number>>(rows[0]?.value, 'jsonValue') ?? {}) as Record<string, number>
                const next = { ...defaults, ...current }
                Object.entries(deltas).forEach(([key, delta]) => {
                    next[key] = Number(next[key] ?? defaults[key] ?? 0) + delta
                })
                const updateP = this.getPlaceholder()
                const valuePlaceholder = updateP()
                const keyPlaceholder = updateP()
                await this.db.update(
                    `UPDATE "_ComputationState_" SET "jsonValue" = ${valuePlaceholder} WHERE "key" = ${keyPlaceholder}`,
                    [JSON.stringify(next), target.key],
                    undefined,
                    `atomic updateGlobalFields ${target.key}`
                )
                return next
            },
            lockRecord: async (recordName: string, id: string | number, attributeQuery = ['*']) => {
                this.requireTransaction(`atomic lockRecord ${recordName}`)
                const { tableName, idField } = this.resolveRecordTable(recordName)
                const p = this.getPlaceholder()
                const rows = await this.db.query<Record<string, unknown>>(
                    `SELECT "${idField}" AS id FROM "${tableName}" WHERE "${idField}" = ${p()}${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                    [id],
                    `atomic lockRecord ${recordName}`
                )
                if (!rows.length) return undefined
                const readRecord = () => this.queryHandle!.findOne(recordName, MatchExp.atom({ key: 'id', value: ['=', id] }), undefined, attributeQuery)
                // CAUTION（r24）此前只锁 root 行：attributeQuery 里的关联记录经 LEFT JOIN 读出但
                //  不加锁——并发事务改写关联行不会被阻塞，调用方（Transform update 等）基于快照
                //  的派生写入建立在已漂移的关联数据上（READ COMMITTED 下的 lost-update 形态）。
                //  修复：锁 root 后按返回快照收集全部已加载的关联行，逐表加锁并重读，直到关联行集
                //  稳定（与 lockRows 的有界稳定化同构）。锁序 = root 先、关联按 (table, id) 排序，
                //  跨事务顺序一致以降低死锁概率；真死锁由驱动报 40P01，dispatch 的重试机制接管。
                //  单连接驱动（无 FOR UPDATE 能力）事务本就串行，跳过图锁。
                let record = await readRecord()
                if (!record || !this.supportsForUpdate()) return record ?? undefined
                const MAX_STABILIZE_ROUNDS = 5
                const locked = new Set<string>()
                for (let round = 0; round < MAX_STABILIZE_ROUNDS; round++) {
                    const relatedRows = this.collectLoadedRelatedRows(recordName, record)
                        .filter(row => !locked.has(row.lockKey))
                    if (!relatedRows.length) return record
                    const byTable = new Map<string, { idField: string, ids: unknown[] }>()
                    for (const row of relatedRows.sort((a, b) => a.lockKey < b.lockKey ? -1 : 1)) {
                        let group = byTable.get(row.tableName)
                        if (!group) byTable.set(row.tableName, group = { idField: row.idField, ids: [] })
                        group.ids.push(row.id)
                        locked.add(row.lockKey)
                    }
                    for (const [relatedTable, group] of byTable) {
                        const lockP = this.getPlaceholder()
                        const placeholders = group.ids.map(() => lockP()).join(',')
                        await this.db.query(
                            `SELECT "${group.idField}" AS id FROM "${relatedTable}" WHERE "${group.idField}" IN (${placeholders}) FOR UPDATE`,
                            group.ids,
                            `atomic lockRecord ${recordName} related ${relatedTable} (round ${round + 1})`
                        )
                    }
                    // 加锁与上一次读取之间关联图可能已漂移：重读，直到快照里没有未锁的关联行。
                    record = await readRecord()
                    if (!record) return undefined
                }
                return record
            },
            lockRows: async (recordName: string, match: MatchExpressionData, attributeQuery = ['*']) => {
                this.requireTransaction(`atomic lockRows ${recordName}`)
                const { tableName, idField } = this.resolveRecordTable(recordName)
                // CAUTION find-then-lock 是两步操作，READ COMMITTED 下两步之间行集可以漂移：
                //  并发 insert 的新匹配行不在锁集、并发 update/delete 让已锁 id 不再匹配。
                //  这里锁后**重查 match** 做稳定化：
                //  - 返回集 = match ∧ 已锁 id（已漂出的行自然剔除，不返回陈旧行）；
                //  - 出现锁集之外的新匹配 id 时，扩锁重试（有界），直到行集稳定；
                //  - 无 FOR UPDATE 能力的驱动（SQLite 单进程事务串行）单轮即稳定。
                const MAX_STABILIZE_ROUNDS = 5
                // key 用 String(id) 去重，value 保留原始 id 值（数字 id 不能以字符串形态回填查询参数）。
                const lockedIds = new Map<string, unknown>()
                for (let round = 0; round < MAX_STABILIZE_ROUNDS; round++) {
                    const matchingRows = await this.queryHandle!.find(recordName, match, undefined, ['id'])
                    const newIds = matchingRows.map(row => row.id).filter(id => !lockedIds.has(String(id)))
                    if (!newIds.length) {
                        // 行集稳定：所有当前匹配行都已在锁集内。
                        if (!lockedIds.size) return []
                        const allIds = [...lockedIds.values()]
                        return this.queryHandle!.find(
                            recordName,
                            match.and({ key: 'id', value: ['in', allIds] }),
                            undefined,
                            attributeQuery
                        )
                    }
                    // 按 id 排序保证并发事务以一致顺序取行锁，避免互相持有对方等待的行导致死锁。
                    const sortedNewIds = newIds.sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
                    const p = this.getPlaceholder()
                    const placeholders = sortedNewIds.map(() => p()).join(',')
                    await this.db.query(
                        `SELECT "${idField}" AS id FROM "${tableName}" WHERE "${idField}" IN (${placeholders})${this.supportsForUpdate() ? ' FOR UPDATE' : ''}`,
                        sortedNewIds,
                        `atomic lockRows ${recordName} (round ${round + 1})`
                    )
                    sortedNewIds.forEach(id => lockedIds.set(String(id), id))
                    if (!this.supportsForUpdate()) break
                }
                // 超过稳定化轮次（持续高并发插入）或无锁能力驱动：按当前锁集返回 match 内的行。
                const allIds = [...lockedIds.values()]
                if (!allIds.length) return []
                return this.queryHandle!.find(
                    recordName,
                    match.and({ key: 'id', value: ['in', allIds] }),
                    undefined,
                    attributeQuery
                )
            }
        }
    }
    findOne(...arg:Parameters<EntityQueryHandle["findOne"]>) {
        return this.queryHandle!.findOne(...arg)
    }
    find(...arg:Parameters<EntityQueryHandle["find"]>) {
        return this.queryHandle!.find(...arg)
    }
    create(entityName: string, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.create.bind(this.queryHandle), [entityName, rawData], events) as Promise<EntityIdRef>
    }
    update(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.update.bind(this.queryHandle), [entity, matchExpressionData, rawData], events) as Promise<EntityIdRef>
    }
    // 内部写路径（对应 dict.setInternal）：写入本身不是业务变更（例如属性 computation 的初始值回写），
    // 被更新记录自身的 update 事件不进入 dispatch，也不进入 effects；
    // 但由这次写入派生出来的事件（如 filtered entity 成员资格的 create/delete）仍然正常派发。
    // 所有事件（含被抑制的 update 事件）依旧会推入调用方提供的 events 数组，供调用方读取写入结果。
    updateInternal(entity: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        const recordInfo = this.queryHandle!.map.getRecordInfo(entity)
        const baseRecordName = recordInfo.resolvedBaseRecordName || entity
        return this.callWithEvents(
            this.queryHandle!.update.bind(this.queryHandle),
            [entity, matchExpressionData, rawData],
            events,
            (event) => !(event.type === 'update' && event.recordName === baseRecordName)
        ) as Promise<EntityIdRef>
    }
    delete(entityName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.delete.bind(this.queryHandle), [entityName, matchExpressionData], events) as Promise<EntityIdRef>
    }
    private findConstraintForError(error: unknown) {
        const normalized = normalizeDatabaseError(error, this.db)
        if (normalized.constraintName) {
            const byConstraint = this.constraintSchemaItems.find(item => item.physicalName === normalized.constraintName || item.constraintName === normalized.constraintName)
            if (byConstraint) return byConstraint
        }
        const byName = this.constraintSchemaItems.find(item => normalized.message.includes(item.physicalName) || normalized.message.includes(item.constraintName))
        if (byName) return byName
        return this.constraintSchemaItems.find(item => {
            const normalizedFields = normalized.fields || []
            const itemFields = item.kind === 'unique' ? item.fields : [item.field]
            const exactFieldMatch = normalized.tableName === item.tableName && itemFields.every(field => normalizedFields.includes(field))
            return exactFieldMatch || (normalized.message.includes(item.tableName) && itemFields.every(field => normalized.message.includes(field)))
        })
    }
    private mapConstraintError(error: unknown): unknown {
        const existing = findConstraintViolationError(error)
        if (existing) return existing
        const normalized = normalizeDatabaseError(error, this.db)
        if (!normalized.isUniqueViolation) return error
        const item = this.findConstraintForError(error)
        return new ConstraintViolationError(
            item ? `Unique constraint "${item.constraintName}" was violated` : 'Unique constraint was violated',
            {
                kind: 'unique',
                constraintName: item?.constraintName,
                recordName: item?.recordName,
                properties: item?.kind === 'unique' ? item.properties : item ? [item.property] : undefined,
                violationCode: item?.violationCode,
                driver: normalized.driver,
                rawCode: normalized.rawCode,
                causedBy: error instanceof Error ? error : undefined,
            }
        )
    }
    async callWithEvents<T extends unknown[]>(method: (...arg: [...T, RecordMutationEvent[]]) => unknown, args: T, events: RecordMutationEvent[] = [], shouldDispatch?: (event: RecordMutationEvent) => boolean): Promise<unknown> {
        if (!this.isInTransaction()) {
            // CAUTION 幻影事件隔离（r22 F-2）：withAtomicTransaction 的重试会整体重跑本方法，
            //  而 events.push 发生在事务函数内部（COMMIT 之前）。attempt 成功执行到 push、
            //  却在 COMMIT 时失败（PG SERIALIZABLE 的 first-committer-wins 冲突正是在 COMMIT
            //  时报 40001）并重试时，调用方数组里会残留已回滚 attempt 的事件——事件数与
            //  实际提交行数分裂，消费方（手工派发、测试断言）会看到指向不存在记录的幻影事件。
            //  每次 attempt 用全新数组（ledger / post-write 队列按数组实例区分作用域，跨
            //  attempt 复用同一数组还会串批），提交成功后一次性搬运给调用方。
            let attemptEvents: RecordMutationEvent[] = []
            const result = await this.withAtomicTransaction('storage mutation with events', async () => {
                attemptEvents = []
                return this.callWithEvents(method, args, attemptEvents, shouldDispatch)
            })
            events.push(...attemptEvents)
            return result
        }
        try {
            const methodEvents:RecordMutationEvent[] = []
            const result = await method(...args, methodEvents)
            // FIXME 还没有实现异步机制
            // nextJob(() => {
            //     this.dispatch(events)
            // })
            // 被 shouldDispatch 过滤掉的事件不进入 dispatch，也不进入 effects（内部写路径，见 updateInternal），
            // 但仍然会推入调用方提供的 events 数组。
            const dispatchableEvents = shouldDispatch ? methodEvents.filter(shouldDispatch) : methodEvents
            // CAUTION 特别注意这里会空充 events
            const  newEvents = await this.dispatch(dispatchableEvents)
            // r23 I-1：记录 push 前基线，外层事务回滚时截断（见 runInTransaction）。
            const txn = this.getActiveTransactionContext()
            if (txn?.eventArrayBaselines && !txn.eventArrayBaselines.has(events)) {
                txn.eventArrayBaselines.set(events, events.length)
            }
            events.push(...methodEvents, ...newEvents)
            
            // Also add to async context if available
            const contextEffects = getCurrentEffects()
            if (contextEffects && dispatchableEvents.length > 0) {
                addToCurrentEffects(dispatchableEvents)
            }
            if (contextEffects && newEvents.length > 0) {
                addToCurrentEffects(newEvents)
            }
            
            return result
        } catch (error) {
            throw this.mapConstraintError(error)
        }
    }
    findRelationByName(...arg:Parameters<EntityQueryHandle["findRelationByName"]>) {
        return this.queryHandle!.findRelationByName(...arg)
    }
    findOneRelationByName(...arg: Parameters<EntityQueryHandle["findOneRelationByName"]>) {
        return this.queryHandle!.findOneRelationByName(...arg)
    }
    updateRelationByName(relationName: string, matchExpressionData: MatchExpressionData, rawData: RawEntityData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.updateRelationByName.bind(this.queryHandle), [relationName, matchExpressionData, rawData], events) as Promise<EntityIdRef>
    }
    removeRelationByName(relationName: string, matchExpressionData: MatchExpressionData, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.removeRelationByName.bind(this.queryHandle), [relationName, matchExpressionData], events) as Promise<EntityIdRef>
    }
    addRelationByNameById(relationName: string, sourceEntityId: string, targetEntityId: string, rawData: RawEntityData = {}, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
        return this.callWithEvents(this.queryHandle!.addRelationByNameById.bind(this.queryHandle), [relationName, sourceEntityId, targetEntityId, rawData], events) as Promise<EntityIdRef>
    }
    getRelationName(...arg:Parameters<EntityQueryHandle["getRelationName"]>) {
        return this.queryHandle!.getRelationName(...arg)
    }
    getEntityName(...arg:Parameters<EntityQueryHandle["getEntityName"]>) {
        return this.queryHandle!.getEntityName(...arg)
    }
    listen(callback: RecordMutationCallback) {
        this.callbacks.add(callback)
    }
    unlisten(callback: RecordMutationCallback) {
        this.callbacks.delete(callback)
    }
    async dispatch(events: RecordMutationEvent[]) {
        const newEvents: RecordMutationEvent[] = []
        for(let callback of this.callbacks) {
            const callbackResult = (await callback(events)) as {events?: RecordMutationEvent[]}
            if (callbackResult?.events) {
                newEvents.push(...callbackResult.events)
            }
        }
        return newEvents
    }
    destroy() {
        return this.db.close()
    }
}




// Define log levels for database logger
export enum DBLogLevel {
    ERROR = 0,
    INFO = 1,
}

export class DBConsoleLogger implements DatabaseLogger{
    constructor(private level: DBLogLevel = DBLogLevel.ERROR, private fixed: object = {}) {}
    
    info({type, name, sql, params}: Parameters<DatabaseLogger["info"]>[0]) {
        if (this.level >= DBLogLevel.INFO) {
            console.log({...this.fixed, type, name, sql, params})
        }
    }
    error({type, name, sql, params, error}: Parameters<DatabaseLogger["error"]>[0]) {
        if (this.level >= DBLogLevel.ERROR) {
            console.error({...this.fixed, type, name, sql, params, error})
        }
    }
    child(fixed: object = {}) {
        return new DBConsoleLogger(this.level, {...this.fixed, ...fixed})
    }
}

// Define log levels for system logger
export enum SystemLogLevel {
    MUTE = -1,
    ERROR = 0,
    INFO = 1,
    DEBUG = 2,
}

export class SystemConsoleLogger implements SystemLogger{
    constructor(private level: SystemLogLevel = SystemLogLevel.ERROR, private fixed: object = {}) {}
    
    error({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.ERROR) {
            console.error(`[ERROR] ${label}: ${message}`, {...this.fixed, ...rest})
        }
    }
    info({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.INFO) {
            console.info(`[INFO] ${label}: ${message}`, {...this.fixed, ...rest})
        }
    }
    debug({label, message, ...rest}: SystemLogType) {
        if (this.level >= SystemLogLevel.DEBUG) {
            console.debug(`[DEBUG] ${label}: ${message}`, {...this.fixed, ...rest})
        }
    }
    child(fixed: object) {
        return new SystemConsoleLogger(this.level, {...this.fixed, ...fixed})
    }
}
export const dbConsoleLogger = new DBConsoleLogger()
export const systemConsoleLogger = new SystemConsoleLogger()

export class MonoSystem implements System {
    conceptClass: Map<string, unknown> = new Map()
    storage: Storage
    constructor(db: Database, public logger: SystemLogger = systemConsoleLogger) {
        this.storage = new MonoStorage(db)
    }

    private get db() {
        return (this.storage as MonoStorage).db
    }

    private async ensureMigrationManifestTable() {
        // CAUTION MySQL 不支持 TEXT 主键（"BLOB/TEXT column used in key specification
        //  without a key length"）——键列按方言用定长 VARCHAR（r26 遗留收口时首次在真实
        //  MySQL 上跑 Controller.setup 暴露的沉睡面）。operationKey 可能携带完整 DDL 文本，
        //  超长键在 MySQL 上以 sha256 代理键存储（读写两侧同一归一化，精确唯一）。
        const keyType = getSchemaDialect(this.db).name === 'mysql' ? 'VARCHAR(191)' : 'TEXT'
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_manifest" (
    "key" ${keyType} PRIMARY KEY,
    "value" TEXT NOT NULL
)`, 'setup migration manifest table')
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_log" (
    "id" ${keyType} PRIMARY KEY,
    "modelHash" TEXT NOT NULL,
    "approvedDiffHash" TEXT NULL,
    "approvedDiffSummary" TEXT NULL,
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedAt" TEXT NULL,
    "phase" ${keyType} NOT NULL DEFAULT 'pending',
    "status" TEXT NOT NULL,
    "error" TEXT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
)`, 'setup migration log table')
        try {
            await this.db.scheme(`ALTER TABLE "__interaqt_migration_log" ADD COLUMN IF NOT EXISTS "phase" ${keyType} NOT NULL DEFAULT 'pending'`, 'setup migration log phase column')
        } catch {
            // Some drivers do not support ADD COLUMN IF NOT EXISTS; fresh schemas
            // already have the column and legacy duplicate-column failures are safe.
        }
        for (const columnDDL of [
            `"approvedDiffHash" TEXT NULL`,
            `"approvedDiffSummary" TEXT NULL`,
            `"decisionCount" INTEGER NOT NULL DEFAULT 0`,
            `"reviewedAt" TEXT NULL`,
        ]) {
            try {
                await this.db.scheme(`ALTER TABLE "__interaqt_migration_log" ADD COLUMN IF NOT EXISTS ${columnDDL}`, 'setup migration log review column')
            } catch {
                // Drivers without IF NOT EXISTS either already have the column or
                // are using the fresh schema above.
            }
        }
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_lock" (
    "key" ${keyType} PRIMARY KEY,
    "migrationId" TEXT NOT NULL
)`, 'setup migration lock table')
        await this.db.scheme(`
CREATE TABLE IF NOT EXISTS "__interaqt_migration_operation_log" (
    "migrationId" ${keyType} NOT NULL,
    "operationKey" ${keyType} NOT NULL,
    "status" TEXT NOT NULL,
    PRIMARY KEY ("migrationId", "operationKey")
)`, 'setup migration operation log table')
    }

    async readMigrationManifest(): Promise<MigrationManifest | undefined> {
        const tables = await (this.storage as MonoStorage).getExistingTables()
        if (!tables.has('__interaqt_migration_manifest')) return undefined
        const dialect = getSchemaDialect(this.db).name
        const [p1] = migrationSQLPlaceholders(dialect, 1)
        const rows = await this.db.query<{ value: string }>(
            `SELECT "value" FROM "__interaqt_migration_manifest" WHERE "key" = ${p1} LIMIT 1`,
            ['current'],
            'read migration manifest'
        )
        if (!rows[0]?.value) return undefined
        // 损坏的 manifest（手工改库/半写/截断）此前裸抛 SyntaxError——报错既不指明来源
        //  也不给恢复路径。包一层带指引的受控错误（r26 遗留收口，r25 §三 #4）。
        try {
            return JSON.parse(rows[0].value) as MigrationManifest
        } catch (error) {
            throw new Error(
                `Migration manifest in "__interaqt_migration_manifest" (key='current') is corrupted and cannot be parsed as JSON: ` +
                `${error instanceof Error ? error.message : String(error)}. ` +
                `This usually means the row was manually edited or a write was interrupted. ` +
                `Recovery: verify the current entity/relation definitions match the existing schema, then re-baseline via controller.createMigrationBaseline().`
            )
        }
    }

    async writeMigrationManifest(manifest: MigrationManifest): Promise<void> {
        await this.ensureMigrationManifestTable()
        const value = JSON.stringify(manifest)
        const dialect = getSchemaDialect(this.db).name
        const [p1, p2] = migrationSQLPlaceholders(dialect, 2)
        const conflictClause = dialect === 'mysql'
            ? `ON DUPLICATE KEY UPDATE "value" = VALUES("value")`
            : `ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`
        await this.db.update(
            `INSERT INTO "__interaqt_migration_manifest" ("key", "value") VALUES (${p1}, ${p2}) ${conflictClause}`,
            ['current', value],
            undefined,
            'write migration manifest'
        )
    }

    async hasExistingData(): Promise<boolean> {
        const storage = this.storage as MonoStorage
        const tables = await storage.getExistingTables()
        const ignored = new Set(['_IDS_', '__interaqt_migration_manifest', '__interaqt_migration_log', '__interaqt_migration_lock', '__interaqt_migration_operation_log'])
        for (const tableName of tables) {
            if (ignored.has(tableName)) continue
            const escaped = tableName.replace(/"/g, '""')
            const rows = await this.db.query<{ exists: number }>(
                `SELECT 1 AS "exists" FROM "${escaped}" LIMIT 1`,
                [],
                `migration check data ${tableName}`
            )
            if (rows.length > 0) return true
        }
        return false
    }

    private async acquireMigrationLock(migrationId: string) {
        const dialect = getSchemaDialect(this.db).name
        const [p1] = migrationSQLPlaceholders(dialect, 1)
        try {
            await this.db.update(
                `INSERT INTO "__interaqt_migration_lock" ("key", "migrationId") VALUES ('current', ${p1})`,
                [migrationId],
                undefined,
                'acquire migration lock'
            )
        } catch (error) {
            // CAUTION 锁的取得必须以主键冲突为准（原子），SELECT-then-INSERT 存在并发窗口。
            //  两个进程同时 migrate 时，后到者在这里得到清晰的"已在迁移中"错误，而不是裸的约束冲突。
            if (normalizeDatabaseError(error, this.db).isUniqueViolation) {
                throw new Error(`Migration is already running (lock held by another process). If that process crashed, call controller.forceReleaseMigrationLock() after confirming no migration is actually running, then retry.`)
            }
            throw error
        }
    }

    async beginMigration(modelHash: string, approvedDiffHash?: string, approvedDiffSummary?: unknown, decisionCount = 0): Promise<MigrationRunState> {
        await this.ensureMigrationManifestTable()
        const dialect = getSchemaDialect(this.db).name
        const [lockPlaceholder] = migrationSQLPlaceholders(dialect, 1)
        const existing = await this.db.query<{ migrationId: string }>(
            `SELECT "migrationId" FROM "__interaqt_migration_lock" WHERE "key" = ${lockPlaceholder} LIMIT 1`,
            ['current'],
            'read migration lock'
        )
        if (existing[0]) {
            throw new Error(`Migration is already running: ${existing[0].migrationId}. If that process crashed, call controller.forceReleaseMigrationLock() after confirming no migration is actually running, then retry.`)
        }
        const [resumableP1, resumableP2] = migrationSQLPlaceholders(dialect, 2)
        const resumable = await this.db.query<{ id: string, phase: MigrationPhase, status: string }>(
            `SELECT "id", "phase", "status" FROM "__interaqt_migration_log" WHERE "modelHash" = ${resumableP1} AND COALESCE("approvedDiffHash", '') = ${resumableP2} AND "status" IN ('pending', 'failed') AND "phase" IN ('pending', 'schema-applied', 'computation-applied', 'constraints-applied', 'manifest-written') ORDER BY "updatedAt" DESC LIMIT 1`,
            [modelHash, approvedDiffHash || ''],
            'read resumable migration'
        )
        if (resumable[0]) {
            await this.acquireMigrationLock(resumable[0].id)
            return { id: resumable[0].id, phase: resumable[0].phase }
        }
        const migrationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const now = new Date().toISOString()
        const summary = approvedDiffSummary === undefined ? null : JSON.stringify(approvedDiffSummary)
        await this.acquireMigrationLock(migrationId)
        const logPlaceholders = migrationSQLPlaceholders(dialect, 8)
        await this.db.update(
            `INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "approvedDiffSummary", "decisionCount", "reviewedAt", "phase", "status", "createdAt", "updatedAt") VALUES (${logPlaceholders[0]}, ${logPlaceholders[1]}, ${logPlaceholders[2]}, ${logPlaceholders[3]}, ${logPlaceholders[4]}, ${logPlaceholders[5]}, 'pending', 'pending', ${logPlaceholders[6]}, ${logPlaceholders[7]})`,
            [migrationId, modelHash, approvedDiffHash || '', summary, decisionCount, now, now, now],
            undefined,
            'write migration log pending'
        )
        return { id: migrationId, phase: 'pending' }
    }

    async updateMigrationPhase(migrationId: string, phase: Exclude<MigrationPhase, 'pending' | 'succeeded' | 'failed'>): Promise<void> {
        await this.ensureMigrationManifestTable()
        const now = new Date().toISOString()
        const [p1, p2, p3] = migrationSQLPlaceholders(getSchemaDialect(this.db).name, 3)
        await this.db.update(
            `UPDATE "__interaqt_migration_log" SET "phase" = ${p1}, "status" = 'pending', "updatedAt" = ${p2} WHERE "id" = ${p3}`,
            [phase, now, migrationId],
            undefined,
            `migration log ${phase}`
        )
    }

    async finishMigration(migrationId: string, status: 'succeeded' | 'failed', error?: unknown): Promise<void> {
        await this.ensureMigrationManifestTable()
        const now = new Date().toISOString()
        const errorMessage = error === undefined ? null : String(error instanceof Error ? error.message : error)
        const dialect = getSchemaDialect(this.db).name
        const [p1, p2, p3, p4] = migrationSQLPlaceholders(dialect, 4)
        await this.db.update(
            `UPDATE "__interaqt_migration_log" SET "status" = ${p1}, "error" = ${p2}, "updatedAt" = ${p3} WHERE "id" = ${p4}`,
            [status, errorMessage, now, migrationId],
            undefined,
            'finish migration log'
        )
        const [deleteP1] = migrationSQLPlaceholders(dialect, 1)
        await this.db.update(
            `DELETE FROM "__interaqt_migration_lock" WHERE "key" = 'current' AND "migrationId" = ${deleteP1}`,
            [migrationId],
            undefined,
            'release migration lock'
        )
    }

    async releaseMigrationLock(): Promise<void> {
        await this.ensureMigrationManifestTable()
        await this.db.update(
            `DELETE FROM "__interaqt_migration_lock" WHERE "key" = 'current'`,
            [],
            undefined,
            'force release migration lock'
        )
    }

    async isMigrationOperationComplete(migrationId: string | undefined, operationKey: string): Promise<boolean> {
        await this.ensureMigrationManifestTable()
        return (this.storage as MonoStorage).isMigrationOperationComplete(migrationId, operationKey)
    }

    async markMigrationOperationComplete(migrationId: string | undefined, operationKey: string): Promise<void> {
        await this.ensureMigrationManifestTable()
        await (this.storage as MonoStorage).markMigrationOperationComplete(migrationId, operationKey)
    }
    
    async setup(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[], options: boolean | SystemSchemaOptions = false){
        const install = typeof options === 'boolean' ? options : options.install === true
        const schemaOptions = typeof options === 'boolean' ? { install } : options
        // Use RefContainer to handle cloning and reference updates
        const container = new RefContainer(originalEntities, originalRelations);
        
        // Get cloned entities and relations with all references automatically updated
        const { entities, relations } = container.getAll();
        
        // Process states to inject properties into entities/relations
        states.forEach(({dataContext, state}) => {
            Object.entries(state).forEach(([stateName, stateItem]) => {
                if (stateItem instanceof RecordBoundState) { 
                    if (!stateItem.record) {
                        return;
                    }
                    let rootEntity: EntityInstance|RelationInstance | undefined = container.getEntityByName(stateItem.record);
                    if (!rootEntity) {
                        rootEntity = container.getRelationByName(stateItem.record);
                    }
                    if (!rootEntity) {
                        throw new Error(`Entity or Relation not found: ${stateItem.record}`);
                    }

                    // 考虑 filtered entity 和 filtered relation 的级联问题，这里要找到根
                    while ((rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation) {
                        rootEntity = (rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation!
                    }

                    if (stateItem.defaultValue instanceof Property) {
                        // CAUTION 特别注意这里改了 name
                        stateItem.defaultValue.name = stateItem.key
                        rootEntity.properties.push(stateItem.defaultValue)
                    } else {
                        const defaultValuetype = typeof stateItem.defaultValue
                        rootEntity.properties.push(Property.create({
                            name: stateItem.key,
                            type: defaultValuetype,
                            // 应该系统定义
                            collection: Array.isArray(stateItem.defaultValue),
                            defaultValue: () => stateItem.defaultValue
                        }))
                    }
                }
            })
        })

        
        // Pass the prepared entities to storage.setup
        await this.storage.setup(
            [...entities, DictionaryEntity, SystemEntity], 
            relations,
            install,
            schemaOptions
        )
        await this.setupTransformUniqueIndexes(states)
    }

    private prepareEntitiesForStorage(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[]) {
        // Use RefContainer to handle cloning and reference updates
        const container = new RefContainer(originalEntities, originalRelations);

        // Get cloned entities and relations with all references automatically updated
        const { entities, relations } = container.getAll();

        // Process states to inject properties into entities/relations
        states.forEach(({state}) => {
            Object.entries(state).forEach(([, stateItem]) => {
                if (stateItem instanceof RecordBoundState) {
                    if (!stateItem.record) {
                        return;
                    }
                    let rootEntity: EntityInstance|RelationInstance | undefined = container.getEntityByName(stateItem.record);
                    if (!rootEntity) {
                        rootEntity = container.getRelationByName(stateItem.record);
                    }
                    if (!rootEntity) {
                        throw new Error(`Entity or Relation not found: ${stateItem.record}`);
                    }

                    // 考虑 filtered entity 和 filtered relation 的级联问题，这里要找到根
                    while ((rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation) {
                        rootEntity = (rootEntity as EntityInstance).baseEntity || (rootEntity as RelationInstance).baseRelation!
                    }

                    if (stateItem.defaultValue instanceof Property) {
                        // CAUTION 特别注意这里改了 name
                        stateItem.defaultValue.name = stateItem.key
                        rootEntity.properties.push(stateItem.defaultValue)
                    } else {
                        const defaultValuetype = typeof stateItem.defaultValue
                        rootEntity.properties.push(Property.create({
                            name: stateItem.key,
                            type: defaultValuetype,
                            // 应该系统定义
                            collection: Array.isArray(stateItem.defaultValue),
                            defaultValue: () => stateItem.defaultValue
                        }))
                    }
                }
            })
        })

        return {
            entities: [...entities, DictionaryEntity, SystemEntity],
            relations,
        }
    }

    async prepareMigrationSchema(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[], options: SystemSchemaOptions = {}) {
        const { entities, relations } = this.prepareEntitiesForStorage(originalEntities, originalRelations, states)
        const plan = await (this.storage as MonoStorage).prepareMigrationAdditive(
            entities,
            relations,
            options,
        )
        ;(plan.internal as { states?: ComputationState[] }).states = states
        ;(plan.internal as { options?: SystemSchemaOptions }).options = options
        plan.postRecomputeDDL.push(...this.createTransformUniqueIndexOperations(plan, states))
        return plan
    }

    async applyMigrationSchema(plan: MigrationSchemaPlan, migrationId?: string) {
        await (this.storage as MonoStorage).applyMigrationAdditivePlan(plan, migrationId)
    }

    async applyMigrationPostSchema(plan: MigrationSchemaPlan, migrationId?: string) {
        await (this.storage as MonoStorage).applyPostRecomputeSchemaPlan(plan, migrationId)
    }

    async verifyMigrationSchema(plan: MigrationSchemaPlan, migrationId?: string) {
        await (this.storage as MonoStorage).verifyMigrationPlan(plan, migrationId)
    }

    async migrateSchema(originalEntities: EntityInstance[], originalRelations: RelationInstance[], states: ComputationState[], options: SystemSchemaOptions = {}) {
        const { entities, relations } = this.prepareEntitiesForStorage(originalEntities, originalRelations, states)
        const plan = await (this.storage as MonoStorage).prepareMigrationAdditive(
            entities,
            relations,
            options,
        )
        ;(plan.internal as { states?: ComputationState[] }).states = states
        ;(plan.internal as { options?: SystemSchemaOptions }).options = options
        await (this.storage as MonoStorage).applyMigrationAdditivePlan(plan)
        await this.setupTransformUniqueIndexes(states)
    }

    // CAUTION 索引名哈希必须抗碰撞（r26 遗留收口，r25 §三 #3）：此前的 32-bit 弱哈希在
    //  不同 (table, sourceField, indexField) 组合上可碰撞——两个 Transform 复用同一个
    //  唯一索引名，第二个 CREATE UNIQUE INDEX IF NOT EXISTS 静默 no-op，唯一性约束错位。
    //  sha1 截 20 hex（80-bit）在标识符长度预算内（idx_transform_ 前缀 14 + 20 = 34 < 63）。
    private hashIdentifier(input: string) {
        return createHash('sha1').update(input).digest('hex').slice(0, 20)
    }

    // 旧 32-bit 弱哈希：仅用于计算 legacy 索引名以便清理（存量部署上旧名索引与新名索引
    //  语义相同，重复存在无害但冗余；setup 时尽力 DROP，失败静默——索引清理不是关键路径）。
    private legacyHashIdentifier(input: string) {
        let hash = 0
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
        }
        return Math.abs(hash).toString(36)
    }

    private async setupTransformUniqueIndexes(states: ComputationState[]) {
        for (const { dataContext, state } of states) {
            const sourceRecordId = state.sourceRecordId
            const transformIndex = state.transformIndex
            if (
                !(sourceRecordId instanceof RecordBoundState) ||
                !(transformIndex instanceof RecordBoundState) ||
                (sourceRecordId as any).unique === false ||
                (dataContext.type !== 'entity' && dataContext.type !== 'relation')
            ) {
                continue
            }

            const recordName = dataContext.id.name!
            const storage = this.storage as MonoStorage
            const map = storage.queryHandle!.map
            const recordInfo = map.getRecordInfo(recordName)
            const [, sourceRecordIdField] = map.getTableAliasAndFieldName([recordName], sourceRecordId.key, true)
            const [, transformIndexField] = map.getTableAliasAndFieldName([recordName], transformIndex.key, true)
            const identifierInput = `${recordInfo.table}_${sourceRecordIdField}_${transformIndexField}`
            const indexName = `idx_transform_${this.hashIdentifier(identifierInput)}`
            const dialect = getSchemaDialect(storage.db)
            await storage.db.scheme(
                createUniqueIndexSQL(indexName, recordInfo.table, [sourceRecordIdField, transformIndexField], dialect),
                `setup transform unique index ${recordName}`
            )
            // 尽力清理旧 32-bit 哈希命名的等价索引（存量部署遗留；重复索引无害但冗余）。
            const legacyIndexName = `idx_transform_${this.legacyHashIdentifier(identifierInput)}`
            if (legacyIndexName !== indexName) {
                try {
                    const dropSQL = dialect.name === 'mysql'
                        ? `DROP INDEX ${quoteIdentifier(legacyIndexName, dialect)} ON ${quoteIdentifier(recordInfo.table, dialect)}`
                        : `DROP INDEX IF EXISTS ${quoteIdentifier(legacyIndexName, dialect)}`
                    await storage.db.scheme(dropSQL, `drop legacy transform unique index ${recordName}`)
                } catch {
                    // MySQL 无 IF EXISTS：索引不存在时报错，静默即可。
                }
            }
        }
    }

    private createTransformUniqueIndexOperations(plan: MigrationSchemaPlan, states: ComputationState[]): AdditiveDDLOperation[] {
        const dbSetup = (plan.internal as { dbSetup?: DBSetup }).dbSetup
        if (!dbSetup) return []
        const tableMap = new EntityToTableMap(dbSetup.map, dbSetup.aliasManager)
        const dialect = getSchemaDialect((this.storage as MonoStorage).db)
        return states.flatMap(({ dataContext, state }) => {
            const sourceRecordId = state.sourceRecordId
            const transformIndex = state.transformIndex
            if (
                !(sourceRecordId instanceof RecordBoundState) ||
                !(transformIndex instanceof RecordBoundState) ||
                (sourceRecordId as any).unique === false ||
                (dataContext.type !== 'entity' && dataContext.type !== 'relation')
            ) {
                return []
            }

            const recordName = dataContext.id.name!
            const recordInfo = tableMap.getRecordInfo(recordName)
            const [, sourceRecordIdField] = tableMap.getTableAliasAndFieldName([recordName], sourceRecordId.key, true)
            const [, transformIndexField] = tableMap.getTableAliasAndFieldName([recordName], transformIndex.key, true)
            const indexName = `idx_transform_${this.hashIdentifier(`${recordInfo.table}_${sourceRecordIdField}_${transformIndexField}`)}`
            return [{
                kind: 'create-constraint' as const,
                sql: createUniqueIndexSQL(indexName, recordInfo.table, [sourceRecordIdField, transformIndexField], dialect),
                tableName: recordInfo.table,
                logicalPath: `${recordName}.${sourceRecordId.key}.${transformIndex.key}`,
                description: `migration setup transform unique index ${recordName}`,
            }]
        })
    }
    async destroy() {
        await this.storage.destroy()
    }
}
