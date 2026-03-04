import { describe, test, expect } from 'vitest';
import { FrameworkError, ErrorSeverity, ErrorCategory } from '@runtime';

import { ActivityError, ActivityStateError } from '../../src/builtins/interaction/errors/ActivityErrors.js';
import { InteractionExecutionError } from '../../src/builtins/interaction/errors/InteractionErrors.js';

describe('ActivityError', () => {
    test('constructor sets activity-specific fields', () => {
        const err = new ActivityError('activity failed', {
            activityName: 'ReviewProcess',
            activityId: 'act-1',
            activityInstanceId: 'inst-1',
            currentState: { phase: 'review' },
        });

        expect(err.activityName).toBe('ReviewProcess');
        expect(err.activityId).toBe('act-1');
        expect(err.activityInstanceId).toBe('inst-1');
        expect(err.currentState).toEqual({ phase: 'review' });
        expect(err.severity).toBe(ErrorSeverity.MEDIUM);
        expect(err instanceof FrameworkError).toBe(true);
    });

    test('defaults severity when not provided', () => {
        const err = new ActivityError('test');
        expect(err.severity).toBe(ErrorSeverity.MEDIUM);
    });

    test('accepts custom severity', () => {
        const err = new ActivityError('critical', {
            severity: ErrorSeverity.CRITICAL,
        });
        expect(err.severity).toBe(ErrorSeverity.CRITICAL);
    });

    test('preserves causedBy chain', () => {
        const cause = new Error('inner');
        const err = new ActivityError('wrapped', { causedBy: cause });
        expect(err.causedBy).toBe(cause);
        expect(err.getErrorChain()).toHaveLength(2);
    });
});

describe('ActivityStateError', () => {
    test('constructor sets state transition fields', () => {
        const err = new ActivityStateError('invalid transition', {
            expectedState: 'approved',
            actualState: 'pending',
            stateTransition: 'approve',
            activityName: 'ReviewProcess',
        });

        expect(err.expectedState).toBe('approved');
        expect(err.actualState).toBe('pending');
        expect(err.stateTransition).toBe('approve');
        expect(err.activityName).toBe('ReviewProcess');
        expect(err.severity).toBe(ErrorSeverity.HIGH);
        expect(err instanceof ActivityError).toBe(true);
        expect(err instanceof FrameworkError).toBe(true);
    });

    test('inherits activity fields', () => {
        const err = new ActivityStateError('state mismatch', {
            activityId: 'a-1',
            activityInstanceId: 'ai-1',
        });
        expect(err.activityId).toBe('a-1');
        expect(err.activityInstanceId).toBe('ai-1');
    });
});

describe('InteractionExecutionError', () => {
    test('constructor sets execution-specific fields', () => {
        const err = new InteractionExecutionError('execution failed', {
            interactionName: 'createUser',
            userId: 'user-123',
            payload: { name: 'John' },
            executionPhase: 'validation',
        });

        expect(err.interactionName).toBe('createUser');
        expect(err.userId).toBe('user-123');
        expect(err.payload).toEqual({ name: 'John' });
        expect(err.executionPhase).toBe('validation');
        expect(err.severity).toBe(ErrorSeverity.HIGH);
        expect(err instanceof FrameworkError).toBe(true);
    });

    test('defaults severity to HIGH', () => {
        const err = new InteractionExecutionError('test');
        expect(err.severity).toBe(ErrorSeverity.HIGH);
    });

    test('accepts custom severity', () => {
        const err = new InteractionExecutionError('low priority', {
            severity: ErrorSeverity.LOW,
        });
        expect(err.severity).toBe(ErrorSeverity.LOW);
    });

    test('preserves causedBy', () => {
        const cause = new Error('db error');
        const err = new InteractionExecutionError('dispatch failed', {
            interactionName: 'update',
            causedBy: cause,
        });
        expect(err.causedBy).toBe(cause);
        expect(err.getErrorChain()).toHaveLength(2);
    });
});
