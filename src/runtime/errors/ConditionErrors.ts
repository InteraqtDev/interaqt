import { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'
import { EvaluateError, ConditionInstance } from '@shared'

/**
 * Base class for all condition and permission related errors
 */
export class ConditionError extends FrameworkError {
    public readonly type: string  // For backward compatibility with existing tests
    public readonly error?: EvaluateError<ConditionInstance> | any  // For backward compatibility
    public readonly checkType: 'user' | 'payload' | 'condition' | 'attributive' | 'concept'
    public readonly fieldName?: string
    public readonly payload?: any
    public readonly evaluationError?: EvaluateError<ConditionInstance> | any
    public readonly severity: ErrorSeverity

    constructor(
        message: string,
        options: {
            checkType: 'user' | 'payload' | 'condition' | 'attributive' | 'concept'
            fieldName?: string
            payload?: any
            evaluationError?: EvaluateError<ConditionInstance> | any
            severity?: ErrorSeverity
            context?: Record<string, any>
            causedBy?: Error
            type?: string  // For backward compatibility
        }
    ) {
        super(message, {
            errorType: options.context?.errorType || 'ConditionError',
            context: {
                category: ErrorCategory.PERMISSION,
                checkType: options.checkType,
                fieldName: options.fieldName,
                payload: options.payload,
                evaluationError: options.evaluationError,
                ...options.context
            },
            causedBy: options.causedBy
        })

        this.checkType = options.checkType
        this.fieldName = options.fieldName
        this.payload = options.payload
        this.evaluationError = options.evaluationError
        this.error = options.evaluationError  // For backward compatibility
        this.type = options.type || message  // For backward compatibility
        this.severity = options.severity || ErrorSeverity.HIGH
    }

    /**
     * Helper factory methods for common condition error scenarios
     */
    static userCheckFailed(error: any, context?: Record<string, any>): ConditionError {
        return new ConditionError('User check failed', {
            checkType: 'user',
            evaluationError: error,
            severity: ErrorSeverity.HIGH,
            context,
            type: 'check user failed'  // For backward compatibility
        })
    }

    static payloadValidationFailed(fieldName: string, message: string, payload?: any, error?: any): ConditionError {
        const fullMessage = `${fieldName} ${message}`
        return new ConditionError(`Payload validation failed for field '${fieldName}': ${message}`, {
            checkType: 'payload',
            fieldName,
            payload,
            evaluationError: error,
            severity: ErrorSeverity.MEDIUM,
            type: fullMessage  // For backward compatibility
        })
    }

    static conditionCheckFailed(error: EvaluateError<ConditionInstance>, context?: Record<string, any>): ConditionError {
        return new ConditionError(`Condition check failed: ${error.data.name}`, {
            checkType: 'condition',
            evaluationError: error,
            severity: ErrorSeverity.HIGH,
            context,
            type: 'condition check failed'  // For backward compatibility
        })
    }

    static attributiveCheckFailed(fieldName: string, message: string, payload?: any, error?: any): ConditionError {
        const fullMessage = `${fieldName} ${message}`
        return new ConditionError(`Attributive check failed for field '${fieldName}': ${message}`, {
            checkType: 'attributive',
            fieldName,
            payload,
            evaluationError: error,
            severity: ErrorSeverity.MEDIUM,
            type: fullMessage  // For backward compatibility
        })
    }

    static conceptCheckFailed(fieldName: string, error: any): ConditionError {
        return new ConditionError(`Concept check failed for field '${fieldName}'`, {
            checkType: 'concept',
            fieldName,
            evaluationError: error,
            severity: ErrorSeverity.MEDIUM,
            type: `${fieldName} check concept failed`  // For backward compatibility
        })
    }
}
