import { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'
import { EvaluateError } from '@core'

/**
 * Historical condition/permission error factory and shape.
 *
 * @deprecated Prefer {@link InteractionGuardError} for runtime guard failures.
 * Branch on stable `code` / `conditionName` / `details`. This symbol remains
 * exported for compatibility; duck-typed `type: 'condition check failed'` is
 * not the official business discriminant.
 */
export class ConditionError extends FrameworkError {
    public readonly type: string  // For backward compatibility with existing tests
    public readonly error?: EvaluateError<any> | any  // For backward compatibility
    public readonly checkType: 'payload' | 'condition'
    public readonly fieldName?: string
    public readonly payload?: any
    public readonly evaluationError?: EvaluateError<any> | any
    public readonly severity: ErrorSeverity
    /** Stable business/framework code (FR-02(b)); aligned with InteractionGuardError.code */
    public readonly code?: string
    public readonly details?: unknown
    public readonly conditionName?: string

    constructor(
        message: string,
        options: {
            checkType: 'payload' | 'condition'
            fieldName?: string
            payload?: any
            evaluationError?: EvaluateError<any> | any
            severity?: ErrorSeverity
            context?: Record<string, unknown>
            causedBy?: Error
            type?: string  // For backward compatibility
            code?: string
            details?: unknown
            conditionName?: string
        }
    ) {
        super(message, {
            errorType: (options.context?.errorType as string) || 'ConditionError',
            context: {
                category: ErrorCategory.PERMISSION,
                checkType: options.checkType,
                fieldName: options.fieldName,
                payload: options.payload,
                evaluationError: options.evaluationError,
                code: options.code,
                details: options.details,
                conditionName: options.conditionName,
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
        this.code = options.code
        this.details = options.details
        this.conditionName = options.conditionName
    }

    /**
     * Helper factory methods for common condition error scenarios
     */
    static payloadValidationFailed(fieldName: string, message: string, payload?: any, error?: unknown): ConditionError {
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

    static conditionCheckFailed(
        error: EvaluateError<any>,
        context?: Record<string, unknown> & {
            code?: string
            details?: unknown
            conditionName?: string
        }
    ): ConditionError {
        return new ConditionError(`Condition check failed: ${error.data.name}`, {
            checkType: 'condition',
            evaluationError: error,
            severity: ErrorSeverity.HIGH,
            context,
            type: 'condition check failed',  // For backward compatibility
            code: context?.code,
            details: context?.details,
            conditionName: context?.conditionName ?? error?.data?.name,
        })
    }
}
