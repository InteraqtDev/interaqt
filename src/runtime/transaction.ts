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

export function isRetryableTransactionError(error: unknown): boolean {
    return collectErrorChain(error).some(item => {
        if (!item || typeof item !== "object") return false;
        const code = (item as ErrorLike).code;
        return code === "40001" || code === "40P01";
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

