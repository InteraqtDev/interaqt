import { FrameworkError, ErrorSeverity, ErrorCategory } from '@runtime'

/**
 * Interaction execution errors
 */
export class InteractionExecutionError extends FrameworkError {
    public readonly interactionName?: string
    public readonly userId?: string
    public readonly payload?: any
    public readonly executionPhase?: string
    public readonly severity: ErrorSeverity

    constructor(
        message: string,
        options: {
            interactionName?: string
            userId?: string
            payload?: any
            executionPhase?: string
            severity?: ErrorSeverity
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            errorType: options.context?.errorType || 'InteractionExecutionError',
            context: {
                category: ErrorCategory.INTERACTION,
                interactionName: options.interactionName,
                userId: options.userId,
                payload: options.payload,
                executionPhase: options.executionPhase,
                ...options.context
            },
            causedBy: options.causedBy
        })

        this.interactionName = options.interactionName
        this.userId = options.userId
        this.payload = options.payload
        this.executionPhase = options.executionPhase
        this.severity = options.severity || ErrorSeverity.HIGH
    }
}