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
            // 这里只展示了两层。下面 getFormattedError 展示所有层。
            causedBy: this.causedBy ? {
                name: this.causedBy.name,
                message: this.causedBy.message,
                stack: this.causedBy.stack
            } : undefined,
            stack: this.stackTrace,
            formattedError: this.getFormattedError()
        }
    }

    /**
     * Get formatted error for console output (concise version)
     */
    private getFormattedError(): string {
        const chain = this.getErrorChain();
        let output = `[${this.errorType}] ${this.message}`;
        
        // Add important context
        const importantContext = ['entityName', 'propertyName', 'interactionName', 'computationName', 'handleName', 'depName']
            .filter(key => this.context[key])
            .map(key => `${key}: ${this.context[key]}`)
            .join(', ');
        
        if (importantContext) {
            output += ` (${importantContext})`;
        }
        
        // Add error chain
        if (chain.length > 1) {
            output += '\n\nCaused by:';
            for (let i = 1; i < chain.length; i++) {
                const err = chain[i];
                output += `\n  ${'  '.repeat(i-1)}→ ${err.constructor.name}: ${err.message}`;
            }
        }
        
        // Add root cause stack (first 5 lines)
        const rootCause = chain[chain.length - 1];
        if (rootCause.stack) {
            output += '\n\nStack trace:';
            const stackLines = rootCause.stack.split('\n').slice(0, 6);
            stackLines.forEach(line => {
                output += '\n  ' + line;
            });
            if (rootCause.stack.split('\n').length > 6) {
                output += '\n  ... (truncated)';
            }
        }
        
        return output;
    }

    /**
     * Convert to string with detailed information
     */
    public toString(): string {
        // Use the formatted error for consistency across all output methods
        return this.getFormattedError();
    }

    /**
     * Custom JSON.stringify behavior
     */
    public [Symbol.toStringTag](): string {
        return JSON.stringify(this.toJSON(), null, 2)
    }

    /**
     * Custom inspect method for Node.js console.log/error
     * This method is automatically called when the error is logged
     */
    public [Symbol.for('nodejs.util.inspect.custom')](): string {
        return this.getFormattedError();
    }

    /**
     * For browser compatibility - valueOf is called when converting to primitive
     */
    public valueOf(): string {
        return this.getFormattedError();
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
