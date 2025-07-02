import { describe, it, expect } from 'vitest';
import { Expression, Equation, Inequality } from '../../src/runtime/computationHandles/MathResolver';

describe('MathResolver', () => {
  describe('Expression', () => {
    describe('Basic Operations', () => {
      it('should create and evaluate number expressions', () => {
        const expr = Expression.number(5);
        expect(expr.evaluate()).toBe(5);
      });

      it('should create and evaluate variable expressions', () => {
        const expr = Expression.variable('x');
        expect(expr.evaluate({ x: 10 })).toBe(10);
      });

      it('should throw error for undefined variables', () => {
        const expr = Expression.variable('x');
        expect(() => expr.evaluate()).toThrow('Variable x not found');
      });

      it('should perform addition', () => {
        const expr = Expression.number(5).add(3);
        expect(expr.evaluate()).toBe(8);
      });

      it('should perform subtraction', () => {
        const expr = Expression.number(10).subtract(3);
        expect(expr.evaluate()).toBe(7);
      });

      it('should perform multiplication', () => {
        const expr = Expression.number(4).multiply(3);
        expect(expr.evaluate()).toBe(12);
      });

      it('should perform division', () => {
        const expr = Expression.number(15).divide(3);
        expect(expr.evaluate()).toBe(5);
      });

      it('should throw error for division by zero', () => {
        const expr = Expression.number(5).divide(0);
        expect(() => expr.evaluate()).toThrow('Division by zero');
      });

      it('should perform power operations', () => {
        const expr = Expression.number(2).power(3);
        expect(expr.evaluate()).toBe(8);
      });

      it('should perform square root', () => {
        const expr = Expression.number(16).sqrt();
        expect(expr.evaluate()).toBe(4);
      });
    });

    describe('Chain Operations', () => {
      it('should chain multiple operations', () => {
        const expr = Expression.number(2).add(3).multiply(4);
        expect(expr.evaluate()).toBe(20);
      });

      it('should work with variables in chains', () => {
        const expr = Expression.variable('x').add(5).multiply(2);
        expect(expr.evaluate({ x: 3 })).toBe(16);
      });

      it('should handle complex expressions', () => {
        const expr = Expression.variable('x').power(2).add(Expression.variable('x').multiply(3)).add(2);
        expect(expr.evaluate({ x: 2 })).toBe(12); // 2^2 + 2*3 + 2 = 4 + 6 + 2 = 12
      });
    });

    describe('Expression with Expression Operations', () => {
      it('should add two expressions', () => {
        const expr1 = Expression.variable('x').multiply(2);
        const expr2 = Expression.variable('y').add(3);
        const combined = expr1.add(expr2);
        expect(combined.evaluate({ x: 2, y: 4 })).toBe(11); // 2*2 + (4+3) = 4 + 7 = 11
      });

      it('should subtract expressions', () => {
        const expr1 = Expression.variable('x').multiply(3);
        const expr2 = Expression.variable('y');
        const combined = expr1.subtract(expr2);
        expect(combined.evaluate({ x: 5, y: 2 })).toBe(13); // 5*3 - 2 = 15 - 2 = 13
      });
    });

    describe('Variable Collection', () => {
      it('should collect variables from simple expression', () => {
        const expr = Expression.variable('x');
        expect(expr.getVariables()).toEqual(['x']);
      });

      it('should collect variables from complex expression', () => {
        const expr = Expression.variable('x').add(Expression.variable('y')).multiply(Expression.variable('z'));
        const vars = expr.getVariables().sort();
        expect(vars).toEqual(['x', 'y', 'z']);
      });

      it('should not duplicate variables', () => {
        const expr = Expression.variable('x').add(Expression.variable('x'));
        expect(expr.getVariables()).toEqual(['x']);
      });
    });
  });

  describe('Inequality', () => {
    it('should create and evaluate greater than inequality', () => {
      const expr = Expression.variable('x');
      const inequality = expr.gt(5);
      expect(inequality.evaluate({ x: 10 })).toBe(true);
      expect(inequality.evaluate({ x: 3 })).toBe(false);
    });

    it('should create and evaluate less than inequality', () => {
      const expr = Expression.variable('x');
      const inequality = expr.lt(5);
      expect(inequality.evaluate({ x: 3 })).toBe(true);
      expect(inequality.evaluate({ x: 10 })).toBe(false);
    });

    it('should work with expression on right side', () => {
      const left = Expression.variable('x');
      const right = Expression.variable('y').add(2);
      const inequality = left.gt(right);
      expect(inequality.evaluate({ x: 8, y: 3 })).toBe(true); // 8 > (3+2) = 8 > 5
      expect(inequality.evaluate({ x: 3, y: 3 })).toBe(false); // 3 > (3+2) = 3 > 5
    });

    it('should solve simple linear inequalities', () => {
      const expr = Expression.variable('x').multiply(2).add(1);
      const inequality = expr.gt(7); // 2x + 1 > 7, so x > 3
      const solution = inequality.solve();
      expect(solution).toBeCloseTo(3, 5);
    });
  });

  describe('Equation', () => {
    it('should create and evaluate equations', () => {
      const expr = Expression.variable('x').multiply(2);
      const equation = expr.eq(10);
      expect(equation.evaluate({ x: 5 })).toBe(true);
      expect(equation.evaluate({ x: 3 })).toBe(false);
    });

    it('should work with expression on right side', () => {
      const left = Expression.variable('x').multiply(2);
      const right = Expression.variable('y').add(4);
      const equation = left.eq(right);
      expect(equation.evaluate({ x: 4, y: 4 })).toBe(true); // 2*4 = 4+4 = 8
      expect(equation.evaluate({ x: 3, y: 4 })).toBe(false); // 2*3 ≠ 4+4 = 6 ≠ 8
    });

    it('should solve simple linear equations', () => {
      const expr = Expression.variable('x').multiply(3).add(2);
      const equation = expr.eq(11); // 3x + 2 = 11, so x = 3
      const solution = equation.solve();
      expect(solution).toBeCloseTo(3, 5);
    });

    it('should solve equations with variables on both sides', () => {
      const left = Expression.variable('x').multiply(2).add(1);
      const right = Expression.variable('x').add(4);
      const equation = left.eq(right); // 2x + 1 = x + 4, so x = 3
      const solution = equation.solve();
      expect(solution).toBeCloseTo(3, 5);
    });

    it('should handle quadratic-like equations', () => {
      const expr = Expression.variable('x').power(2);
      const equation = expr.eq(16); // x^2 = 16, so x = ±4
      const solution = equation.solve();
      expect(solution).not.toBeNull();
      expect(Math.abs(solution!)).toBeCloseTo(4, 1);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for equations with multiple variables', () => {
      const left = Expression.variable('x').add(Expression.variable('y'));
      const equation = left.eq(10);
      expect(() => equation.solve()).toThrow('Can only solve equations with exactly one variable');
    });

    it('should throw error for inequalities with multiple variables', () => {
      const left = Expression.variable('x').add(Expression.variable('y'));
      const inequality = left.gt(10);
      expect(() => inequality.solve()).toThrow('Can only solve inequalities with exactly one variable');
    });

    it('should handle unsolvable equations gracefully', () => {
      // This test case needs a valid equation with variables but no solution
      // For example: x + 1 = x + 2 (no solution)
      const left = Expression.variable('x').add(1);
      const right = Expression.variable('x').add(2);
      const equation = left.eq(right);
      const solution = equation.solve();
      expect(solution).toBeNull();
    });
  });

  describe('Algebraic Solving', () => {
    it('should solve linear equations using algebraic method', () => {
      // 2x + 3 = 11 => x = 4
      const expr = Expression.variable('x').multiply(2).add(3);
      const equation = expr.eq(11);
      const solution = equation.solve();
      expect(solution).toBe(4);
    });

    it('should solve quadratic equations using algebraic method', () => {
      // x^2 = 9 => x = 3 (positive solution)
      const expr = Expression.variable('x').power(2);
      const equation = expr.eq(9);
      const solution = equation.solve();
      expect(solution).toBe(3);
    });

    it('should solve equations with variables on both sides', () => {
      // 3x + 5 = x + 11 => 2x = 6 => x = 3
      const left = Expression.variable('x').multiply(3).add(5);
      const right = Expression.variable('x').add(11);
      const equation = left.eq(right);
      const solution = equation.solve();
      expect(solution).toBe(3);
    });

    it('should solve division equations', () => {
      // (2x + 4) / 2 = 5 => 2x + 4 = 10 => x = 3
      const expr = Expression.variable('x').multiply(2).add(4).divide(2);
      const equation = expr.eq(5);
      const solution = equation.solve();
      expect(solution).toBe(3);
    });

    it('should solve cubic equations', () => {
      // x^3 = 8 => x = 2
      const expr = Expression.variable('x').power(3);
      const equation = expr.eq(8);
      const solution = equation.solve();
      expect(solution).toBe(2);
    });

    it('should return null for equations with no real solutions', () => {
      // x^2 = -4 (no real solution)
      const expr = Expression.variable('x').power(2);
      const equation = expr.eq(-4);
      const solution = equation.solve();
      expect(solution).toBeNull();
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle nested operations', () => {
      const expr = Expression.variable('x').add(1).multiply(Expression.variable('x').subtract(1));
      // (x + 1) * (x - 1) = x^2 - 1
      expect(expr.evaluate({ x: 3 })).toBe(8); // (3+1)*(3-1) = 4*2 = 8
      expect(expr.evaluate({ x: 5 })).toBe(24); // (5+1)*(5-1) = 6*4 = 24
    });

    it('should work with mixed number and expression operations', () => {
      const expr = Expression.number(10).divide(Expression.variable('x').add(2));
      expect(expr.evaluate({ x: 3 })).toBe(2); // 10 / (3+2) = 10/5 = 2
    });

    it('should handle zero in various contexts', () => {
      const expr = Expression.variable('x').multiply(0).add(5);
      expect(expr.evaluate({ x: 100 })).toBe(5); // 100*0 + 5 = 5
    });
  });
});