// Base error class and utilities
export { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'
import { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'

// Interaction errors
export {
    InteractionExecutionError
} from './InteractionErrors.js'

// Activity errors
export {
    ActivityError,
    ActivityStateError
} from './ActivityErrors.js'

// Computation errors
export {
    ComputationError,
    ComputationStateError,
    ComputationDataDepError
} from './ComputationErrors.js'

// System errors
export {
    SchedulerError
} from './SystemErrors.js'

// Condition errors
export {
    ConditionError
} from './ConditionErrors.js'

/**
 * Error utility functions
 */
export class ErrorUtils {
    /**
     * Wrap a native error with a FrameworkError
     */
    static wrapError(error: Error, ErrorClass: new (...args: any[]) => FrameworkError, context?: Record<string, any>): FrameworkError {
        if (error instanceof FrameworkError) {
            return error
        }
        
        return new ErrorClass(error.message, {
            causedBy: error,
            context
        })
    }

    /**
     * Check if error is of specific type or category
     */
    static isErrorType(error: any, errorType: string): boolean {
        return error instanceof FrameworkError && error.errorType === errorType
    }

    /**
     * Check if error is of specific category
     */
    static isErrorCategory(error: any, category: ErrorCategory): boolean {
        return error instanceof FrameworkError && error.context?.category === category
    }

    /**
     * Extract root cause from error chain
     */
    static getRootCause(error: Error): Error {
        if (error instanceof FrameworkError && error.causedBy) {
            return ErrorUtils.getRootCause(error.causedBy)
        }
        return error
    }

    /**
     * Format error for logging
     */
    static formatForLogging(error: Error): Record<string, any> {
        if (error instanceof FrameworkError) {
            return {
                ...error.toJSON(),
                rootCause: ErrorUtils.getRootCause(error).message
            }
        }
        
        return {
            name: error.name,
            message: error.message,
            stack: error.stack
        }
    }

    /**
     * Create error summary for client response
     */
    static createErrorSummary(error: Error): Record<string, any> {
        if (error instanceof FrameworkError) {
            return {
                errorId: error.errorId,
                errorType: error.errorType,
                message: error.message,
                timestamp: error.timestamp.toISOString(),
                severity: (error as any).severity || 'UNKNOWN',
                category: error.context?.category
            }
        }
        
        return {
            errorType: 'UnknownError',
            message: error.message,
            timestamp: new Date().toISOString(),
            severity: ErrorSeverity.HIGH
        }
    }
}