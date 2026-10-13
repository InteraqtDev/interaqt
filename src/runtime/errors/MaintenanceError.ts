import { ErrorCategory, ErrorSeverity, FrameworkError } from './FrameworkError.js'

export type MaintenanceOperation = 'maintainEntityRetention' | 'cleanupAsyncTasks'

export type MaintenanceFailure = {
    /** Entity name (`maintainEntityRetention`) or internal task record name (`cleanupAsyncTasks`). */
    target: string
    error: unknown
}

/**
 * A maintenance pass processed every target, and at least one target failed.
 *
 * Each target runs in its own transaction(s), so one failing target does not stop the
 * others. `report` describes what was committed, including rows that a failed target removed
 * in batches committed before it failed; `failures` lists the targets whose pass did not
 * complete, in processing order. The message and `causedBy` carry the first failure.
 *
 * Not thrown for invalid arguments (those fail before any target runs), and not thrown inside
 * a caller-owned storage transaction: there the first failure propagates unchanged so that
 * the owner of that transaction can roll it back.
 */
export class MaintenanceError<TReport = unknown> extends FrameworkError {
    public readonly operation: MaintenanceOperation
    public readonly report: TReport
    public readonly failures: MaintenanceFailure[]

    constructor(options: {
        operation: MaintenanceOperation
        report: TReport
        failures: MaintenanceFailure[]
    }) {
        const targets = options.failures.map(failure => failure.target)
        const first = options.failures[0]?.error
        super(`${options.operation} did not complete for ${targets.length} target(s): ${targets.join(', ')}`, {
            errorType: 'MaintenanceError',
            context: {
                operation: options.operation,
                targets,
                category: ErrorCategory.SYSTEM,
                severity: ErrorSeverity.MEDIUM,
            },
            causedBy: first instanceof Error ? first : first === undefined ? undefined : new Error(String(first)),
        })
        this.operation = options.operation
        this.report = options.report
        this.failures = options.failures
    }
}
