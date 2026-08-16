import { ErrorCategory, ErrorSeverity, FrameworkError } from './FrameworkError.js'

export type PostCommitRerunErrorCode =
    | 'INVALID_INPUT'
    | 'UNKNOWN_RECORD_NAME'
    | 'RECORD_NOT_FOUND'
    | 'UNSUPPORTED_MUTATION_TYPE'
    | 'IN_BUSINESS_TRANSACTION'

const DEFAULT_MESSAGES: Record<PostCommitRerunErrorCode, string> = {
    INVALID_INPUT:
        'rerunCreateMutationSideEffects requires a non-empty recordName and id',
    UNKNOWN_RECORD_NAME:
        'recordName is not in the compiled storage schema',
    RECORD_NOT_FOUND:
        'no record exists for the given recordName and id',
    UNSUPPORTED_MUTATION_TYPE:
        'only create mutation events can be reconstructed for rerun; update and delete are unsupported without stored history',
    IN_BUSINESS_TRANSACTION:
        'rerun APIs cannot run inside an active business transaction; wait until the owner COMMIT has flushed stage P',
}

/**
 * Caller errors for post-commit obligation rerun primitives.
 * These fail fast; they are not stage P side-effect failures and must not be
 * written into `postCommitPhase.failures`.
 */
export class PostCommitRerunError extends FrameworkError {
    public readonly code: PostCommitRerunErrorCode

    constructor(options: {
        code: PostCommitRerunErrorCode
        message?: string
        recordName?: string
        id?: unknown
        businessTransactionName?: string
        mutationType?: string
        causedBy?: Error
    }) {
        super(options.message || DEFAULT_MESSAGES[options.code], {
            errorType: 'PostCommitRerunError',
            context: {
                code: options.code,
                category: ErrorCategory.VALIDATION,
                severity: ErrorSeverity.MEDIUM,
                recordName: options.recordName,
                id: options.id,
                businessTransactionName: options.businessTransactionName,
                mutationType: options.mutationType,
            },
            causedBy: options.causedBy,
        })

        this.code = options.code
    }
}
