/**
 * Base class for all framework errors
 * Provides comprehensive error context, serialization capabilities, and chain of errors support
 */
export abstract class FrameworkError extends Error {
    public readonly timestamp: Date
    public readonly errorId: string
    public readonly errorType: string
    public readonly context: Record<string, any>
    public readonly causedBy?: Error
    public readonly stackTrace?: string

    constructor(
        message: string,
        options: {
            errorType?: string
            context?: Record<string, any>
            causedBy?: Error
        } = {}
    ) {
        super(message)
        
        this.name = this.constructor.name
        this.timestamp = new Date()
        this.errorId = this.generateErrorId()
        this.errorType = options.errorType || this.constructor.name
        this.context = options.context || {}
        this.causedBy = options.causedBy
        this.stackTrace = this.stack

        // Maintain proper error prototype chain
        Object.setPrototypeOf(this, new.target.prototype)
    }

    private generateErrorId(): string {
        return `${this.constructor.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * Get the full error chain
     */
    public getErrorChain(): Error[] {
        const chain: Error[] = [this]
        let current = this.causedBy
        while (current) {
            chain.push(current)
            if (current instanceof FrameworkError) {
                current = current.causedBy
            } else {
                break
            }
        }
        return chain
    }

    /**
     * Get formatted error message with context
     */
    public getDetailedMessage(): string {
        let message = `[${this.errorType}] ${this.message}`
        
        if (Object.keys(this.context).length > 0) {
            message += `\nContext: ${JSON.stringify(this.context, null, 2)}`
        }

        if (this.causedBy) {
            message += `\nCaused by: ${this.causedBy.message}`
        }

        return message
    }

    /**
     * Serialize error for JSON transmission
     */
    public toJSON(): Record<string, any> {
        return {
            name: this.name,
            message: this.message,
            errorType: this.errorType,
            errorId: this.errorId,
            timestamp: this.timestamp.toISOString(),
            context: this.context,
            causedBy: this.causedBy ? {
                name: this.causedBy.name,
                message: this.causedBy.message,
                stack: this.causedBy.stack
            } : undefined,
            stack: this.stackTrace
        }
    }

    /**
     * Convert to string with detailed information
     */
    public toString(): string {
        return this.getDetailedMessage()
    }

    /**
     * Custom JSON.stringify behavior
     */
    public [Symbol.toStringTag](): string {
        return JSON.stringify(this.toJSON(), null, 2)
    }

    /**
     * Check if error is of specific type
     */
    public static isType<T extends FrameworkError>(error: any, ErrorClass: new (...args: any[]) => T): error is T {
        return error instanceof ErrorClass
    }

    /**
     * Find error of specific type in error chain
     */
    public findInChain<T extends FrameworkError>(ErrorClass: new (...args: any[]) => T): T | null {
        const chain = this.getErrorChain()
        for (const error of chain) {
            if (error instanceof ErrorClass) {
                return error as T
            }
        }
        return null
    }
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
    VALIDATION = 'validation',
    PERMISSION = 'permission',
    COMPUTATION = 'computation',
    STORAGE = 'storage',
    INTERACTION = 'interaction',
    ACTIVITY = 'activity',
    SYSTEM = 'system',
    CONFIGURATION = 'configuration'
}