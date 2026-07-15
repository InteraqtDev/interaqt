import { FrameworkError } from "./errors/FrameworkError.js";

export type TransactionIsolation = "READ COMMITTED" | "SERIALIZABLE";

export type TransactionOptions = {
    name?: string;
    isolation?: TransactionIsolation;
};

export type TransactionCapability = {
    transactions: boolean;
    isolationLevels: readonly TransactionIsolation[];
    transactionBoundConnection: boolean;
    concurrentTransactions: "database" | "single-process-serialized" | "unsupported";
    nestedStrategy: "reuse" | "savepoint" | "unsupported";
    notes?: readonly string[];
};

export class RequireSerializableRetry extends Error {
    constructor(public reason: string) {
        super(`Retry transaction with SERIALIZABLE isolation: ${reason}`);
        this.name = "RequireSerializableRetry";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * 「重跑同一事务即可收敛」的写冲突（与 RETRYABLE_ERROR_CODES 同一契约，但由框架
 * 写路径显式抛出）：典型形态是 find-then-create 的并发竞态撞唯一索引——重试后
 * find 命中已提交行、走 update 轨。抛出方必须保证重试路径确实收敛（幂等或改道）。
 */
export class RetryableWriteConflict extends Error {
    constructor(public reason: string, options?: { cause?: unknown }) {
        super(`Retryable write conflict: ${reason}`, options);
        this.name = "RetryableWriteConflict";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class NestedDispatchError extends FrameworkError {
    constructor(options: {
        outerEventSourceName?: string;
        nestedEventSourceName?: string;
    } = {}) {
        super(
            "Nested dispatch is not supported inside a dispatch transaction. Model the work as one EventSource, or dispatch again after the outer dispatch commits",
            {
                errorType: "NestedDispatchError",
                context: {
                    outerEventSourceName: options.outerEventSourceName,
                    nestedEventSourceName: options.nestedEventSourceName,
                },
            }
        );
    }
}

export class TransactionCapabilityError extends FrameworkError {
    constructor(options: {
        transactionName?: string;
        requestedIsolation?: TransactionIsolation;
        capability: TransactionCapability;
        reason: string;
    }) {
        super(
            `Transaction capability requirement is not satisfied: ${options.reason}`,
            {
                errorType: "TransactionCapabilityError",
                context: {
                    transactionName: options.transactionName,
                    requestedIsolation: options.requestedIsolation,
                    capability: options.capability,
                },
            }
        );
    }
}

type ErrorLike = {
    cause?: any;
    causedBy?: any;
    error?: any;
    code?: unknown;
};

export function collectErrorChain(error: unknown, seen: Set<any> = new Set<any>()): unknown[] {
    if (error === null || error === undefined || seen.has(error)) return [];
    seen.add(error);

    const chain: unknown[] = [error];
    if (typeof error !== "object") return chain;

    const errorLike = error as ErrorLike;
    if (errorLike.causedBy) chain.push(...collectErrorChain(errorLike.causedBy, seen));
    if (errorLike.cause) chain.push(...collectErrorChain(errorLike.cause, seen));
    if (errorLike.error) chain.push(...collectErrorChain(errorLike.error, seen));

    if (error instanceof FrameworkError && error.causedBy) {
        chain.push(...collectErrorChain(error.causedBy, seen));
    }

    return chain;
}

export function isRequireSerializableRetry(error: unknown): boolean {
    return collectErrorChain(error).some(item => item instanceof RequireSerializableRetry);
}

// CAUTION 可重试判定只收录「重跑同一事务即可自愈」的错误形态：
//  - PG 40001（serialization_failure）/ 40P01（deadlock_detected）：事务级冲突，标准重试对象；
//  - PG 57P01（admin_shutdown，连接池空闲连接被服务端回收）与 Node 网络层
//    ECONNRESET/EPIPE：连接级瞬断——重试会从池里取新连接，事务从头执行；
//  - SQLite SQLITE_BUSY：另一连接持有写锁，短退避后重试。
//  不收录 ECONNREFUSED/认证失败等基础设施持续性错误：重试只会拖延失败暴露。
const RETRYABLE_ERROR_CODES = new Set(["40001", "40P01", "57P01", "ECONNRESET", "EPIPE", "SQLITE_BUSY"]);

export function isRetryableTransactionError(error: unknown): boolean {
    return collectErrorChain(error).some(item => {
        if (!item || typeof item !== "object") return false;
        if (item instanceof RetryableWriteConflict) return true;
        const code = (item as ErrorLike).code;
        return typeof code === "string" && RETRYABLE_ERROR_CODES.has(code);
    });
}

export function findErrorByCode(error: unknown, code: string | number): unknown | undefined {
    return collectErrorChain(error).find(item => {
        if (!item || typeof item !== "object") return false;
        return (item as ErrorLike).code === code;
    });
}

export function hasErrorCode(error: unknown, code: string | number): boolean {
    return findErrorByCode(error, code) !== undefined;
}

const RETRY_DELAYS = [10, 25, 60, 150, 350];

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function withRetryMetadata(error: unknown, attempts: number, isolation: TransactionIsolation, name?: string) {
    if (error && typeof error === "object") {
        Object.assign(error, {
            transactionAttempts: attempts,
            transactionIsolation: isolation,
            transactionName: name,
        });
    }
    return error;
}

export class TransactionRetryExhaustedError extends Error {
    public readonly transactionAttempts: number;
    public readonly transactionIsolation: TransactionIsolation;
    public readonly transactionName: string;

    constructor(name: string, attempts: number, isolation: TransactionIsolation, cause: unknown) {
        super(`Transaction retry exhausted for ${name} after ${attempts} attempts`, { cause });
        this.name = "TransactionRetryExhaustedError";
        this.transactionAttempts = attempts;
        this.transactionIsolation = isolation;
        this.transactionName = name;
        Object.assign(this, {
            transactionAttempts: attempts,
            transactionIsolation: isolation,
            transactionName: name,
        });
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export function isTransactionRetryExhaustedError(error: unknown): error is TransactionRetryExhaustedError {
    return collectErrorChain(error).some(item => item instanceof TransactionRetryExhaustedError);
}

export function isTransactionCapabilityError(error: unknown): error is TransactionCapabilityError {
    return collectErrorChain(error).some(item => item instanceof TransactionCapabilityError);
}

export async function runWithTransactionRetry<T>(
    name: string,
    runAttempt: (isolation: TransactionIsolation, attempt: number) => Promise<T>,
    options: { maxAttempts?: number } = {}
): Promise<T> {
    const maxAttempts = options.maxAttempts ?? 5;
    let isolation: TransactionIsolation = "READ COMMITTED";
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
        attempt++;
        try {
            return await runAttempt(isolation, attempt);
        } catch (error) {
            lastError = error;
            if (isRequireSerializableRetry(error)) {
                isolation = "SERIALIZABLE";
                if (attempt < maxAttempts) continue;
                throw new TransactionRetryExhaustedError(
                    name,
                    attempt,
                    isolation,
                    withRetryMetadata(error, attempt, isolation, name)
                );
            }

            if (isRetryableTransactionError(error)) {
                if (attempt < maxAttempts) {
                    const baseDelay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
                    const jitter = Math.floor(Math.random() * baseDelay);
                    await wait(baseDelay + jitter);
                    continue;
                }
                throw new TransactionRetryExhaustedError(
                    name,
                    attempt,
                    isolation,
                    withRetryMetadata(error, attempt, isolation, name)
                );
            }

            throw withRetryMetadata(error, attempt, isolation, name);
        }
    }

    throw new TransactionRetryExhaustedError(name, attempt, isolation, withRetryMetadata(lastError, attempt, isolation, name));
}

