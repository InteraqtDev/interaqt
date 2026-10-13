import { ErrorCategory, ErrorSeverity, FrameworkError } from './FrameworkError.js';

export type ConstraintViolationKind = 'unique' | 'non-null';

export type ConstraintViolationErrorOptions = {
    kind: ConstraintViolationKind,
    constraintName?: string,
    recordName?: string,
    properties?: string[],
    violationCode?: string,
    driver?: string,
    rawCode?: string | number,
    causedBy?: Error,
}

export class ConstraintViolationError extends FrameworkError {
    public readonly constraintName?: string;
    public readonly recordName?: string;
    public readonly properties?: string[];

    constructor(message: string, options: ConstraintViolationErrorOptions) {
        super(message, {
            errorType: 'ConstraintViolationError',
            context: {
                code: options.violationCode || (options.kind === 'non-null' ? 'NON_NULL_CONSTRAINT_VIOLATION' : 'UNIQUE_CONSTRAINT_VIOLATION'),
                kind: options.kind,
                constraintName: options.constraintName,
                recordName: options.recordName,
                properties: options.properties,
                retryable: false,
                driver: options.driver,
                rawCode: options.rawCode,
                severity: ErrorSeverity.MEDIUM,
                category: ErrorCategory.STORAGE,
            },
            causedBy: options.causedBy,
        });
        this.constraintName = options.constraintName;
        this.recordName = options.recordName;
        this.properties = options.properties;
    }
}

export type ConstraintSetupErrorOptions = {
    constraintName?: string,
    physicalName?: string,
    recordName?: string,
    tableName?: string,
    properties?: string[],
    driver?: string,
    rawCode?: string | number,
    causedBy?: Error,
    /** Each installed constraint object that does not match the declared model (catalog check). */
    mismatches?: ConstraintObjectMismatch[],
}

export type ConstraintObjectMismatch = {
    status: 'missing' | 'extra' | 'different' | 'undecidable',
    kind: string,
    physicalName: string,
    tableName: string,
    constraintName?: string,
    recordName?: string,
    reason: string,
}

export class ConstraintSetupError extends FrameworkError {
    public readonly constraintName?: string;
    public readonly recordName?: string;
    public readonly properties?: string[];
    public readonly mismatches?: ConstraintObjectMismatch[];

    constructor(message: string, options: ConstraintSetupErrorOptions = {}) {
        super(message, {
            errorType: 'ConstraintSetupError',
            context: {
                code: 'CONSTRAINT_SETUP_FAILED',
                constraintName: options.constraintName,
                physicalName: options.physicalName,
                recordName: options.recordName,
                tableName: options.tableName,
                properties: options.properties,
                retryable: false,
                driver: options.driver,
                rawCode: options.rawCode,
                severity: ErrorSeverity.HIGH,
                category: ErrorCategory.STORAGE,
            },
            causedBy: options.causedBy,
        });
        this.constraintName = options.constraintName;
        this.recordName = options.recordName;
        this.properties = options.properties;
        this.mismatches = options.mismatches;
    }
}

export function findConstraintViolationError(error: unknown): ConstraintViolationError | undefined {
    let current = error;
    const visited = new Set<unknown>();
    while (current && !visited.has(current)) {
        visited.add(current);
        if (current instanceof ConstraintViolationError) return current;
        if (current instanceof Error) {
            const frameworkCause = current instanceof FrameworkError ? current.causedBy : undefined;
            current = frameworkCause || (current as Error & { cause?: unknown }).cause;
        } else {
            current = undefined;
        }
    }
    return undefined;
}
