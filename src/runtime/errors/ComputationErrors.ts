import { FrameworkError, ErrorSeverity, ErrorCategory } from './FrameworkError.js'

/**
 * Base class for all computation-related errors
 */
export class ComputationError extends FrameworkError {
    public readonly handleName?: string
    public readonly computationName?: string
    public readonly dataContext?: any
    public readonly computationPhase?: string
    public readonly severity: ErrorSeverity

    constructor(
        message: string,
        options: {
            handleName?: string
            computationName?: string
            dataContext?: any
            computationPhase?: string
            severity?: ErrorSeverity
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            errorType: options.context?.errorType || 'ComputationError',
            context: {
                category: ErrorCategory.COMPUTATION,
                handleName: options.handleName,
                computationName: options.computationName,
                dataContext: options.dataContext,
                computationPhase: options.computationPhase,
                ...options.context
            },
            causedBy: options.causedBy
        })

        this.handleName = options.handleName
        this.computationName = options.computationName
        this.dataContext = options.dataContext
        this.computationPhase = options.computationPhase
        this.severity = options.severity || ErrorSeverity.MEDIUM
    }
}

/**
 * Computation state management errors
 */
export class ComputationStateError extends ComputationError {
    public readonly stateKey?: string
    public readonly stateValue?: any
    public readonly expectedStateType?: string
    public readonly actualStateType?: string

    constructor(
        message: string,
        options: {
            stateKey?: string
            stateValue?: any
            expectedStateType?: string
            actualStateType?: string
            handleName?: string
            computationName?: string
            dataContext?: any
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            ...options,
            severity: ErrorSeverity.HIGH,
            context: {
                errorType: 'ComputationStateError',
                stateKey: options.stateKey,
                stateValue: options.stateValue,
                expectedStateType: options.expectedStateType,
                actualStateType: options.actualStateType
            }
        })

        this.stateKey = options.stateKey
        this.stateValue = options.stateValue
        this.expectedStateType = options.expectedStateType
        this.actualStateType = options.actualStateType
    }
}

/**
 * Computation data dependency errors
 */
export class ComputationDataDepError extends ComputationError {
    public readonly depName?: string
    public readonly depType?: string
    public readonly missingData?: boolean
    public readonly invalidData?: boolean

    constructor(
        message: string,
        options: {
            depName?: string
            depType?: string
            missingData?: boolean
            invalidData?: boolean
            handleName?: string
            computationName?: string
            dataContext?: any
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message, {
            ...options,
            severity: ErrorSeverity.MEDIUM,
            context: {
                errorType: 'ComputationDataDepError',
                depName: options.depName,
                depType: options.depType,
                missingData: options.missingData,
                invalidData: options.invalidData
            }
        })

        this.depName = options.depName
        this.depType = options.depType
        this.missingData = options.missingData
        this.invalidData = options.invalidData
    }
}