import { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'

/**
 * Error thrown when a side effect execution fails
 */
export class SideEffectError extends FrameworkError {
    public readonly sideEffectName: string
    public readonly recordName: string
    public readonly mutationType?: 'create' | 'update' | 'delete'
    public readonly severity: ErrorSeverity

    constructor(
        message: string,
        options: {
            sideEffectName: string
            recordName: string
            mutationType?: 'create' | 'update' | 'delete'
            recordId?: string
            context?: Record<string, any>
            causedBy?: Error
        }
    ) {
        super(message, {
            errorType: 'SideEffectError',
            context: {
                category: ErrorCategory.SYSTEM,
                sideEffectName: options.sideEffectName,
                recordName: options.recordName,
                mutationType: options.mutationType,
                recordId: options.recordId,
                ...options.context
            },
            causedBy: options.causedBy
        })

        this.sideEffectName = options.sideEffectName
        this.recordName = options.recordName
        this.mutationType = options.mutationType
        this.severity = ErrorSeverity.MEDIUM
    }
}
