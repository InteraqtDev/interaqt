import { describe, it, expect } from 'vitest';
import { Expression } from 'interaqt';

describe('MathResolver edge cases', () => {
    describe('Expression.extractLinearForm edge cases', () => {
        it('should throw on variable multiplication (both sides have coefficient)', () => {
            const expr = Expression.variable('x').multiply(Expression.variable('x'));
            expect(() => expr.getLinearForm('x')).toThrow('Cannot solve equations with variable multiplication');
        });

        it('should throw on variable division (divisor has variable)', () => {
            const expr = Expression.number(10).divide(Expression.variable('x'));
            expect(() => expr.getLinearForm('x')).toThrow('Cannot solve equations with variable division');
        });

        it('should throw on variable in exponent', () => {
            const expr = Expression.number(2).power(Expression.variable('x'));
            expect(() => expr.getLinearForm('x')).toThrow('Cannot solve equations with variable in exponent');
        });

        it('should throw on sqrt of non-quadratic variable', () => {
            const expr = Expression.variable('x').sqrt();
            expect(() => expr.getLinearForm('x')).toThrow('Cannot solve square root of non-quadratic variable');
        });

        it('should handle sqrt of constant (no variable)', () => {
            const expr = Expression.number(16).sqrt();
            const form = expr.getLinearForm('x');
            expect(form.coefficient).toBe(0);
            expect(form.constant).toBe(4);
        });

        it('should handle sqrt of quadratic variable', () => {
            const expr = Expression.variable('x').power(2).sqrt();
            const form = expr.getLinearForm('x');
            expect(form.power).toBe(1);
        });

        it('should handle multiplication where left has no coefficient', () => {
            const expr = Expression.number(3).multiply(Expression.variable('x'));
            const form = expr.getLinearForm('x');
            expect(form.coefficient).toBe(3);
            expect(form.power).toBe(1);
            expect(form.constant).toBe(0);
        });

        it('should handle multiplication where right has no coefficient', () => {
            const expr = Expression.variable('x').multiply(Expression.number(3));
            const form = expr.getLinearForm('x');
            expect(form.coefficient).toBe(3);
            expect(form.power).toBe(1);
            expect(form.constant).toBe(0);
        });

        it('should handle division by constant', () => {
            const expr = Expression.variable('x').divide(2);
            const form = expr.getLinearForm('x');
            expect(form.coefficient).toBe(0.5);
            expect(form.power).toBe(1);
        });

        it('should throw on non-positive-integer power', () => {
            const expr = Expression.variable('x').power(-1);
            expect(() => expr.getLinearForm('x')).toThrow('Only positive integer powers are supported');
        });

        it('should throw on fractional power', () => {
            const expr = Expression.variable('x').power(0.5);
            expect(() => expr.getLinearForm('x')).toThrow('Only positive integer powers are supported');
        });

        it('should handle power with coefficient > 1', () => {
            const expr = Expression.variable('x').multiply(2).power(3);
            const form = expr.getLinearForm('x');
            expect(form.coefficient).toBe(8);
            expect(form.power).toBe(3);
        });
    });

    describe('Inequality.solve edge cases', () => {
        it('should solve quadratic inequalities', () => {
            const expr = Expression.variable('x').power(2);
            const inequality = expr.gt(9);
            const solution = inequality.solve();
            expect(solution).toBeCloseTo(3, 5);
        });

        it('should return null for quadratic inequality with negative discriminant', () => {
            const expr = Expression.variable('x').power(2).add(4);
            const inequality = expr.gt(0);
            const solution = inequality.solve();
            expect(solution).toBeNull();
        });

        it('should solve higher power inequalities (cubic)', () => {
            const expr = Expression.variable('x').power(3);
            const inequality = expr.gt(27);
            const solution = inequality.solve();
            expect(solution).toBeCloseTo(3, 5);
        });

        it('should solve even power inequality with positive base', () => {
            const expr = Expression.variable('x').power(4);
            const inequality = expr.gt(16);
            const solution = inequality.solve();
            expect(solution).toBeCloseTo(2, 5);
        });

        it('should return null for even power with negative base', () => {
            const expr = Expression.variable('x').power(4).add(16);
            const inequality = expr.gt(0);
            const solution = inequality.solve();
            expect(solution).toBeNull();
        });

        it('should solve odd power inequality with negative base', () => {
            const expr = Expression.variable('x').power(3);
            const inequality = expr.gt(-8);
            const solution = inequality.solve();
            expect(solution).toBeCloseTo(-2, 5);
        });

        it('should handle inequality solve that catches error and returns null', () => {
            const left = Expression.variable('x').multiply(Expression.variable('x'));
            const inequality = left.gt(5);
            const solution = inequality.solve();
            expect(solution).toBeNull();
        });

        it('should return null on unsolvable inequality', () => {
            const left = Expression.variable('x').multiply(Expression.variable('x'));
            const inequality = left.gt(5);
            const solution = inequality.solve();
            expect(solution).toBeNull();
        });
    });

    describe('Equation.solve edge cases', () => {
        it('should return null when coefficient is 0 and constant is non-zero', () => {
            const left = Expression.variable('x').add(1);
            const right = Expression.variable('x').add(5);
            const equation = left.eq(right);
            const solution = equation.solve();
            expect(solution).toBeNull();
        });

        it('should return 0 for identity equation (coefficient=0, constant=0)', () => {
            const left = Expression.variable('x').add(3);
            const right = Expression.variable('x').add(3);
            const equation = left.eq(right);
            const solution = equation.solve();
            expect(solution).toBe(0);
        });

        it('should solve higher power equations (power >= 3)', () => {
            const expr = Expression.variable('x').power(4);
            const equation = expr.eq(16);
            const solution = equation.solve();
            expect(solution).toBeCloseTo(2, 5);
        });

        it('should return null for even power with negative base', () => {
            const expr = Expression.variable('x').power(4);
            const equation = expr.eq(-16);
            const solution = equation.solve();
            expect(solution).toBeNull();
        });

        it('should solve odd higher power with negative base', () => {
            const expr = Expression.variable('x').power(3);
            const equation = expr.eq(-8);
            const solution = equation.solve();
            expect(solution).toBeCloseTo(-2, 5);
        });

        it('should return null on unsolvable equation (catch branch)', () => {
            const left = Expression.variable('x').multiply(Expression.variable('x'));
            const equation = left.eq(5);
            const solution = equation.solve();
            expect(solution).toBeNull();
        });
    });

    describe('Expression.clone', () => {
        it('should deep clone expressions with variables', () => {
            const expr = Expression.variable('x').add(5).multiply(2);
            const cloned = expr.clone();
            expect(cloned.evaluate({ x: 3 })).toBe(expr.evaluate({ x: 3 }));
        });

        it('should deep clone complex expressions', () => {
            const expr = Expression.variable('x').power(2).add(Expression.number(1));
            const cloned = expr.clone();
            expect(cloned.evaluate({ x: 4 })).toBe(17);
        });
    });

    describe('Expression.evaluate edge cases', () => {
        it('should handle operation with missing left node', () => {
            const expr = Expression.number(5).add(3);
            expect(expr.evaluate()).toBe(8);
        });

        it('should work with expression operands in subtract', () => {
            const a = Expression.variable('x');
            const b = Expression.variable('y');
            const result = a.subtract(b);
            expect(result.evaluate({ x: 10, y: 3 })).toBe(7);
        });

        it('should work with expression operands in multiply', () => {
            const a = Expression.variable('x');
            const b = Expression.variable('y');
            const result = a.multiply(b);
            expect(result.evaluate({ x: 4, y: 5 })).toBe(20);
        });

        it('should work with expression operands in divide', () => {
            const a = Expression.variable('x');
            const b = Expression.variable('y');
            const result = a.divide(b);
            expect(result.evaluate({ x: 10, y: 2 })).toBe(5);
        });

        it('should work with expression operands in power', () => {
            const a = Expression.variable('x');
            const b = Expression.variable('y');
            const result = a.power(b);
            expect(result.evaluate({ x: 2, y: 3 })).toBe(8);
        });
    });

    describe('Inequality.evaluate edge cases', () => {
        it('should evaluate with expression on right side (lt)', () => {
            const left = Expression.variable('x');
            const right = Expression.variable('y').add(2);
            const ineq = left.lt(right);
            expect(ineq.evaluate({ x: 2, y: 3 })).toBe(true);
            expect(ineq.evaluate({ x: 10, y: 3 })).toBe(false);
        });

        it('should solve inequality with number on right side', () => {
            const expr = Expression.variable('x').multiply(3);
            const ineq = expr.gt(9);
            const solution = ineq.solve();
            expect(solution).toBeCloseTo(3, 5);
        });
    });

    describe('Equation.evaluate edge cases', () => {
        it('should evaluate with expression on right side', () => {
            const left = Expression.variable('x').multiply(2);
            const right = Expression.variable('y');
            const eq = left.eq(right);
            expect(eq.evaluate({ x: 5, y: 10 })).toBe(true);
            expect(eq.evaluate({ x: 5, y: 11 })).toBe(false);
        });

        it('should solve equation with number on right side', () => {
            const expr = Expression.variable('x').add(5);
            const equation = expr.eq(8);
            const solution = equation.solve();
            expect(solution).toBe(3);
        });
    });
});
