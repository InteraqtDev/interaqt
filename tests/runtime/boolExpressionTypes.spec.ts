import { describe, expect, test } from "vitest";
import { OperatorNames } from '../../src/runtime/types/boolExpression.js';

describe('BoolExpression types', () => {
    test('OperatorNames contains expected operators', () => {
        expect(OperatorNames['||']).toBe('||');
        expect(OperatorNames['&&']).toBe('&&');
        expect(OperatorNames['!']).toBe('!');
        expect(Object.keys(OperatorNames)).toHaveLength(3);
    });
});
