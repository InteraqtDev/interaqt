import { ErrorCategory, ErrorSeverity, FrameworkError } from './FrameworkError.js'

export type IdempotencyErrorCode = 'IDEMPOTENCY_IN_FLIGHT' | 'IDEMPOTENCY_CONFLICT'

/**
 * First-class errors for the dispatch idempotency ledger.
 * Concurrent holders of the same key see `IDEMPOTENCY_IN_FLIGHT` — never a raw unique
 * constraint failure, and never a silent `outcome: 'replayed'`.
 */
export class IdempotencyError extends FrameworkError {
    public readonly code: IdempotencyErrorCode

    constructor(options: {
        code: IdempotencyErrorCode
        message?: string
        namespace?: string
        idempotencyKey?: string
        eventSourceName?: string
        causedBy?: Error
    }) {
        const defaultMessage = options.code === 'IDEMPOTENCY_IN_FLIGHT'
            ? 'An attempt with the same idempotency key is already in flight'
            : 'Idempotency key conflict'

        super(options.message || defaultMessage, {
            errorType: 'IdempotencyError',
            context: {
                code: options.code,
                category: ErrorCategory.INTERACTION,
                severity: ErrorSeverity.MEDIUM,
                namespace: options.namespace,
                idempotencyKey: options.idempotencyKey,
                eventSourceName: options.eventSourceName,
                retryable: options.code === 'IDEMPOTENCY_IN_FLIGHT',
            },
            causedBy: options.causedBy,
        })

        this.code = options.code
    }
}
