import { FrameworkError, ErrorSeverity, ErrorCategory } from '../../../runtime/errors/FrameworkError.js'

/**
 * Base class for all activity-related errors
 */
export class ActivityError extends FrameworkError {
    public readonly activityName?: string
    public readonly activityId?: string
    public readonly activityInstanceId?: string
    public readonly currentState?: any
    public readonly severity: ErrorSeverity

    constructor(
        message: string,
        options: {
            activityName?: string
            activityId?: string
            activityInstanceId?: string
            currentState?: any
            severity?: ErrorSeverity
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            errorType: options.context?.errorType || 'ActivityError',
            context: {
                category: ErrorCategory.ACTIVITY,
                activityName: options.activityName,
                activityId: options.activityId,
                activityInstanceId: options.activityInstanceId,
                currentState: options.currentState,
                ...options.context
            },
            causedBy: options.causedBy
        })

        this.activityName = options.activityName
        this.activityId = options.activityId
        this.activityInstanceId = options.activityInstanceId
        this.currentState = options.currentState
        this.severity = options.severity || ErrorSeverity.MEDIUM
    }
}

/**
 * Activity state management errors
 */
export class ActivityStateError extends ActivityError {
    public readonly expectedState?: string
    public readonly actualState?: string
    public readonly stateTransition?: string

    constructor(
        message: string,
        options: {
            expectedState?: string
            actualState?: string
            stateTransition?: string
            activityName?: string
            activityId?: string
            activityInstanceId?: string
            currentState?: any
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            ...options,
            severity: ErrorSeverity.HIGH,
            context: {
                errorType: 'ActivityStateError',
                expectedState: options.expectedState,
                actualState: options.actualState,
                stateTransition: options.stateTransition
            }
        })

        this.expectedState = options.expectedState
        this.actualState = options.actualState
        this.stateTransition = options.stateTransition
    }
}