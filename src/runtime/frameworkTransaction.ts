import { runWithTransactionRetry, type TransactionOptions } from "./transaction.js";

type RetryableTransactionHost = {
    isInTransaction(): boolean
    runInTransaction<T>(options: TransactionOptions, fn: () => Promise<T>): Promise<T>
}

/**
 * Single entry for the framework-owned storage transactions whose writes run computations:
 * storage writes outside a transaction, async task returns, entity retention and async-task
 * cleanup. `dispatch` and `runInBusinessTransaction` keep their own attempt loops, and
 * migration fixes SERIALIZABLE; `tests/runtime/frameworkTransactionEntrySites.spec.ts`
 * fails on any other direct `runInTransaction` call site in `src/`.
 *
 * Outside a transaction, `fn` runs through `runWithTransactionRetry` with the default upgrade
 * behaviour: a computation that throws `RequireSerializableRetry` under READ COMMITTED reruns
 * the whole attempt at SERIALIZABLE, and retryable transaction errors (serialization failures,
 * deadlocks, dropped connections) are retried. `fn` must therefore be safe to rerun from the
 * start.
 *
 * Inside an active transaction, `fn` runs in that transaction without retry. A nested attempt
 * cannot change the isolation level of the outer transaction, and rerunning it would repeat
 * writes that the outer transaction has not rolled back, so `RequireSerializableRetry` and
 * retryable errors propagate to the owner of the outer transaction.
 */
export function runInRetryableTransaction<T>(host: RetryableTransactionHost, name: string, fn: () => Promise<T>): Promise<T> {
    if (host.isInTransaction()) {
        return fn()
    }
    return runWithTransactionRetry(name, (isolation) => host.runInTransaction({ name, isolation }, fn))
}
