import { describe, test, expect } from 'vitest';
import {
    FrameworkError,
    ErrorSeverity,
    ErrorCategory,
    ComputationError,
    ComputationStateError,
    ComputationDataDepError,
    ConditionError,
} from '@runtime';
import { SchedulerError } from '../../src/runtime/errors/SystemErrors.js';
import { SideEffectError } from '../../src/runtime/errors/SideEffectError.js';
import { ErrorUtils } from '../../src/runtime/errors/index.js';

describe('FrameworkError', () => {
    class ConcreteError extends FrameworkError {
        public readonly severity = ErrorSeverity.MEDIUM;
    }

    test('constructor sets all fields', () => {
        const cause = new Error('root cause');
        const err = new ConcreteError('something broke', {
            errorType: 'TestError',
            context: { foo: 'bar' },
            causedBy: cause,
        });

        expect(err.message).toContain('something broke');
        expect(err.errorType).toBe('TestError');
        expect(err.context).toEqual({ foo: 'bar' });
        expect(err.causedBy).toBe(cause);
        expect(err.errorId).toBeTruthy();
        expect(err.timestamp).toBeInstanceOf(Date);
        expect(err.name).toBe('ConcreteError');
    });

    test('getErrorChain returns full chain', () => {
        const root = new Error('root');
        const middle = new ConcreteError('middle', { causedBy: root });
        const top = new ConcreteError('top', { causedBy: middle });

        const chain = top.getErrorChain();
        expect(chain).toHaveLength(3);
        expect(chain[0]).toBe(top);
        expect(chain[1]).toBe(middle);
        expect(chain[2]).toBe(root);
    });

    test('getErrorChain with single error', () => {
        const err = new ConcreteError('solo');
        const chain = err.getErrorChain();
        expect(chain).toHaveLength(1);
        expect(chain[0]).toBe(err);
    });

    test('getDetailedMessage includes context and cause', () => {
        const cause = new Error('db timeout');
        const err = new ConcreteError('query failed', {
            errorType: 'QueryError',
            context: { table: 'users' },
            causedBy: cause,
        });

        const msg = err.getDetailedMessage();
        expect(msg).toContain('[QueryError]');
        expect(msg).toContain('query failed');
        expect(msg).toContain('"table": "users"');
        expect(msg).toContain('db timeout');
    });

    test('getDetailedMessage without cause omits Caused by context section', () => {
        const err = new ConcreteError('simple error');
        const msg = err.getDetailedMessage();
        expect(msg).toContain('simple error');
        expect(msg).not.toContain('Context:');
        // FrameworkError constructor embeds "Caused by: undefined" in the message,
        // so getDetailedMessage will include it via this.message. But the explicit
        // "Caused by:" section from getDetailedMessage should not appear since causedBy is undefined.
        const parts = msg.split('\n');
        const hasCausedBySection = parts.some(p => p.startsWith('Caused by:'));
        expect(hasCausedBySection).toBe(false);
    });

    test('toJSON serializes error correctly', () => {
        const err = new ConcreteError('test', { errorType: 'Test' });
        const json = err.toJSON();

        expect(json.name).toBe('ConcreteError');
        expect(json.errorType).toBe('Test');
        expect(json.errorId).toBeTruthy();
        expect(json.timestamp).toBeTruthy();
        expect(json.context).toEqual({});
        expect(json.formattedError).toBeTruthy();
    });

    test('toJSON with causedBy includes cause info', () => {
        const cause = new Error('inner');
        const err = new ConcreteError('outer', { causedBy: cause });
        const json = err.toJSON();

        expect((json.causedBy as any).name).toBe('Error');
        expect((json.causedBy as any).message).toBe('inner');
    });

    test('toString returns formatted error', () => {
        const err = new ConcreteError('test error', {
            errorType: 'TestType',
            context: { computationName: 'Stats' },
        });
        const str = err.toString();
        expect(str).toContain('[TestType]');
        expect(str).toContain('test error');
        expect(str).toContain('computationName: Stats');
    });

    test('toString with error chain shows caused-by tree', () => {
        const root = new Error('disk full');
        const top = new ConcreteError('write failed', { causedBy: root });
        const str = top.toString();
        expect(str).toContain('Caused by:');
        expect(str).toContain('Error: disk full');
    });

    test('findInChain locates matching error type', () => {
        const cause = new ComputationError('inner', { handleName: 'h1' });
        const err = new ConcreteError('outer', { causedBy: cause });

        const found = err.findInChain(ComputationError);
        expect(found).toBe(cause);
        expect(found?.handleName).toBe('h1');
    });

    test('findInChain returns null when not found', () => {
        const err = new ConcreteError('solo');
        const found = err.findInChain(ComputationError);
        expect(found).toBeNull();
    });

    test('static isType checks instanceof', () => {
        const err = new ConcreteError('test');
        expect(FrameworkError.isType(err, ConcreteError)).toBe(true);
        expect(FrameworkError.isType(err, ComputationError)).toBe(false);
        expect(FrameworkError.isType('not an error', ConcreteError)).toBe(false);
    });
});

describe('ComputationError', () => {
    test('constructor sets computation-specific fields', () => {
        const err = new ComputationError('compute failed', {
            handleName: 'CountHandle',
            computationName: 'userCount',
            computationPhase: 'execution',
            severity: ErrorSeverity.HIGH,
        });

        expect(err.handleName).toBe('CountHandle');
        expect(err.computationName).toBe('userCount');
        expect(err.computationPhase).toBe('execution');
        expect(err.severity).toBe(ErrorSeverity.HIGH);
        expect(err instanceof FrameworkError).toBe(true);
    });

    test('defaults severity to MEDIUM', () => {
        const err = new ComputationError('test');
        expect(err.severity).toBe(ErrorSeverity.MEDIUM);
    });

    test('preserves causedBy chain', () => {
        const cause = new Error('raw');
        const err = new ComputationError('wrapped', { causedBy: cause });
        expect(err.causedBy).toBe(cause);
        expect(err.getErrorChain()).toHaveLength(2);
    });
});

describe('ComputationStateError', () => {
    test('constructor sets state-specific fields', () => {
        const err = new ComputationStateError('state mismatch', {
            stateKey: 'status',
            stateValue: 'invalid',
            expectedStateType: 'string',
            actualStateType: 'number',
            handleName: 'StatusHandle',
        });

        expect(err.stateKey).toBe('status');
        expect(err.stateValue).toBe('invalid');
        expect(err.expectedStateType).toBe('string');
        expect(err.actualStateType).toBe('number');
        expect(err.handleName).toBe('StatusHandle');
        expect(err.severity).toBe(ErrorSeverity.HIGH);
        expect(err instanceof ComputationError).toBe(true);
    });
});

describe('ComputationDataDepError', () => {
    test('constructor sets dependency-specific fields', () => {
        const err = new ComputationDataDepError('missing data', {
            depName: 'userRecords',
            depType: 'records',
            missingData: true,
            invalidData: false,
        });

        expect(err.depName).toBe('userRecords');
        expect(err.depType).toBe('records');
        expect(err.missingData).toBe(true);
        expect(err.invalidData).toBe(false);
        expect(err.severity).toBe(ErrorSeverity.MEDIUM);
        expect(err instanceof ComputationError).toBe(true);
    });
});

describe('SchedulerError', () => {
    test('constructor sets scheduler-specific fields', () => {
        const err = new SchedulerError('scheduling failed', {
            schedulingPhase: 'setup',
            failedComputations: ['CountHandle', 'SumHandle'],
        });

        expect(err.schedulingPhase).toBe('setup');
        expect(err.failedComputations).toEqual(['CountHandle', 'SumHandle']);
        expect(err.severity).toBe(ErrorSeverity.HIGH);
        expect(err instanceof FrameworkError).toBe(true);
    });

    test('preserves causedBy', () => {
        const cause = new Error('inner');
        const err = new SchedulerError('fail', { causedBy: cause });
        expect(err.causedBy).toBe(cause);
    });
});

describe('SideEffectError', () => {
    test('constructor sets side-effect-specific fields', () => {
        const err = new SideEffectError('side effect failed', {
            sideEffectName: 'sendEmail',
            recordName: 'User',
            mutationType: 'create',
        });

        expect(err.sideEffectName).toBe('sendEmail');
        expect(err.recordName).toBe('User');
        expect(err.mutationType).toBe('create');
        expect(err.severity).toBe(ErrorSeverity.MEDIUM);
    });
});

describe('ConditionError', () => {
    test('constructor sets condition-specific fields', () => {
        const err = new ConditionError('check failed', {
            checkType: 'user',
            fieldName: 'role',
            payload: { role: 'admin' },
        });

        expect(err.checkType).toBe('user');
        expect(err.fieldName).toBe('role');
        expect(err.payload).toEqual({ role: 'admin' });
        expect(err.severity).toBe(ErrorSeverity.HIGH);
    });

    test('static factory: userCheckFailed', () => {
        const err = ConditionError.userCheckFailed(new Error('no perms'));
        expect(err.checkType).toBe('user');
        expect(err.type).toBe('check user failed');
    });

    test('static factory: payloadValidationFailed', () => {
        const err = ConditionError.payloadValidationFailed('email', 'is required');
        expect(err.checkType).toBe('payload');
        expect(err.fieldName).toBe('email');
        expect(err.type).toBe('email is required');
    });

    test('static factory: conditionCheckFailed', () => {
        const evaluateError = { data: { name: 'ageCheck' } } as any;
        const err = ConditionError.conditionCheckFailed(evaluateError);
        expect(err.checkType).toBe('condition');
        expect(err.type).toBe('condition check failed');
    });

    test('static factory: attributiveCheckFailed', () => {
        const err = ConditionError.attributiveCheckFailed('role', 'not allowed');
        expect(err.checkType).toBe('attributive');
        expect(err.type).toBe('role not allowed');
    });

    test('static factory: conceptCheckFailed', () => {
        const err = ConditionError.conceptCheckFailed('entity', new Error('not found'));
        expect(err.checkType).toBe('concept');
        expect(err.type).toBe('entity check concept failed');
    });
});

describe('ErrorUtils', () => {
    test('wrapError wraps native Error with FrameworkError', () => {
        const native = new Error('native problem');
        const wrapped = ErrorUtils.wrapError(native, ComputationError, { extra: 'data' });

        expect(wrapped instanceof ComputationError).toBe(true);
        expect(wrapped.causedBy).toBe(native);
    });

    test('wrapError returns FrameworkError as-is', () => {
        const existing = new ComputationError('already wrapped');
        const result = ErrorUtils.wrapError(existing, SchedulerError);
        expect(result).toBe(existing);
    });

    test('isErrorType checks errorType field', () => {
        const err = new ComputationError('test', { context: { errorType: 'CustomType' } });
        expect(ErrorUtils.isErrorType(err, 'CustomType')).toBe(true);
        expect(ErrorUtils.isErrorType(err, 'Other')).toBe(false);
        expect(ErrorUtils.isErrorType('not an error', 'CustomType')).toBe(false);
    });

    test('isErrorCategory checks category in context', () => {
        const err = new ComputationError('test');
        expect(ErrorUtils.isErrorCategory(err, ErrorCategory.COMPUTATION)).toBe(true);
        expect(ErrorUtils.isErrorCategory(err, ErrorCategory.STORAGE)).toBe(false);
        expect(ErrorUtils.isErrorCategory('not an error', ErrorCategory.COMPUTATION)).toBe(false);
    });

    test('getRootCause traverses to deepest error', () => {
        const root = new Error('root');
        const middle = new ComputationError('mid', { causedBy: root });
        const top = new SchedulerError('top', { causedBy: middle });

        expect(ErrorUtils.getRootCause(top)).toBe(root);
    });

    test('getRootCause returns self for standalone error', () => {
        const err = new Error('solo');
        expect(ErrorUtils.getRootCause(err)).toBe(err);
    });

    test('formatForLogging returns structured data for FrameworkError', () => {
        const err = new ComputationError('test', { handleName: 'h1' });
        const logged = ErrorUtils.formatForLogging(err);
        expect(logged.errorType).toBeTruthy();
        expect(logged.rootCause).toBe(err.message);
    });

    test('formatForLogging returns basic info for plain Error', () => {
        const err = new Error('plain');
        const logged = ErrorUtils.formatForLogging(err);
        expect(logged.name).toBe('Error');
        expect(logged.message).toBe('plain');
    });

    test('createErrorSummary for FrameworkError', () => {
        const err = new ComputationError('test');
        const summary = ErrorUtils.createErrorSummary(err);
        expect(summary.errorId).toBeTruthy();
        expect(summary.errorType).toBeTruthy();
        expect(summary.message).toContain('test');
        expect(summary.timestamp).toBeTruthy();
        expect(summary.category).toBe(ErrorCategory.COMPUTATION);
    });

    test('createErrorSummary for plain Error', () => {
        const err = new Error('unknown');
        const summary = ErrorUtils.createErrorSummary(err);
        expect(summary.errorType).toBe('UnknownError');
        expect(summary.message).toBe('unknown');
        expect(summary.severity).toBe(ErrorSeverity.HIGH);
    });
});
