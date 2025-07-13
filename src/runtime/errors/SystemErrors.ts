import { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'

/**
 * Scheduler errors
 */
export class SchedulerError extends FrameworkError {
    public readonly schedulingPhase?: string
    public readonly failedComputations?: string[]
    public readonly severity: ErrorSeverity

    constructor(
        message: string,
        options: {
            schedulingPhase?: string
            failedComputations?: string[]
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            errorType: options.context?.errorType || 'SchedulerError',
            context: {
                category: ErrorCategory.SYSTEM,
                schedulingPhase: options.schedulingPhase,
                failedComputations: options.failedComputations,
                ...options.context
            },
            causedBy: options.causedBy
        })

        this.schedulingPhase = options.schedulingPhase
        this.failedComputations = options.failedComputations
        this.severity = ErrorSeverity.HIGH
    }
}