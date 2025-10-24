import { describe, test, expect, beforeEach } from "vitest";
import { BoolExp, type AtomData, type BoolExpressionRawData, type ExpressionData, type EvaluateError, BoolAtomData, BoolExpressionData } from "../../src/shared/BoolExp";
import { clearAllInstances } from "../../src/shared/utils";

describe("BoolExp Complete Test Suite", () => {
  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(BoolAtomData, BoolExpressionData);
  });

  describe("BoolAtomData Class", () => {
    test("should create with default type", () => {
      const atom = BoolAtomData.create({ data: { value: 42 } });
      
      expect(atom.type).toBe("atom");
      expect(atom.data.value).toBe(42);
      expect(atom._type).toBe("BoolAtomData");
      expect(atom.uuid).toBeDefined();
    });

    test("should create with custom type", () => {
      const atom = BoolAtomData.create({ 
        type: "custom", 
        data: { content: () => true } 
      });
      
      expect(atom.type).toBe("custom");
    });

    test("should create with custom uuid", () => {
      const customUuid = "test-uuid-123";
      const atom = BoolAtomData.create(
        { data: { value: 1 } }, 
        { uuid: customUuid }
      );
      
      expect(atom.uuid).toBe(customUuid);
    });

    test("should prevent duplicate uuid", () => {
      const uuid = "duplicate-uuid";
      BoolAtomData.create({ data: {} }, { uuid });
      
      expect(() => {
        BoolAtomData.create({ data: {} }, { uuid });
      }).toThrow("duplicate uuid");
    });

    test("should track instances", () => {
      const initialCount = BoolAtomData.instances.length;
      BoolAtomData.create({ data: {} });
      BoolAtomData.create({ data: {} });
      
      expect(BoolAtomData.instances.length).toBe(initialCount + 2);
    });

    test("should clone instance", () => {
      const original = BoolAtomData.create({ 
        type: "test", 
        data: { value: 42 } 
      });
      const cloned = BoolAtomData.clone(original, false);
      
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.type).toBe("test");
      expect(cloned.data).toBe(original.data);
    });

    test("should clone with default type", () => {
      const original = BoolAtomData.create({ data: { value: 42 } });
      const cloned = BoolAtomData.clone(original, false);
      
      expect(cloned.type).toBe("atom");
    });

    test("should check type with is()", () => {
      const atom = BoolAtomData.create({ data: {} });
      
      expect(BoolAtomData.is(atom)).toBe(true);
      expect(BoolAtomData.is({})).toBe(false);
      expect(BoolAtomData.is(null)).toBe(false);
      expect(BoolAtomData.is(undefined)).toBe(false);
    });

    test("should validate with check()", () => {
      const atom = BoolAtomData.create({ data: {} });
      
      expect(BoolAtomData.check(atom)).toBe(true);
      expect(BoolAtomData.check({ uuid: "test" })).toBe(true);
      expect(BoolAtomData.check({})).toBe(false);
      expect(BoolAtomData.check(null)).toBe(false);
    });

    test("should have correct static metadata", () => {
      expect(BoolAtomData.isKlass).toBe(true);
      expect(BoolAtomData.displayName).toBe("BoolAtomData");
      expect(BoolAtomData.public).toBeDefined();
      expect(BoolAtomData.public.type.type).toBe("string");
      expect(BoolAtomData.public.type.defaultValue()).toBe("atom");
    });

    test("should store function in data", () => {
      const fn = (x: number) => x > 10;
      const atom = BoolAtomData.create({ data: { content: fn } });
      
      expect(atom.data.content).toBe(fn);
      expect(atom.data.content(15)).toBe(true);
    });
  });

  describe("BoolExpressionData Class", () => {
    test("should create with default values", () => {
      const left = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ left });
      
      expect(expr.type).toBe("expression");
      expect(expr.operator).toBe("and");
      expect(expr.left).toBe(left);
      expect(expr.right).toBeUndefined();
      expect(expr._type).toBe("BoolExpressionData");
    });

    test("should create OR expression", () => {
      const left = BoolAtomData.create({ data: {} });
      const right = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ 
        operator: "or", 
        left, 
        right 
      });
      
      expect(expr.operator).toBe("or");
      expect(expr.left).toBe(left);
      expect(expr.right).toBe(right);
    });

    test("should create NOT expression", () => {
      const left = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ 
        operator: "not", 
        left 
      });
      
      expect(expr.operator).toBe("not");
      expect(expr.left).toBe(left);
      expect(expr.right).toBeUndefined();
    });

    test("should create nested expressions", () => {
      const atom1 = BoolAtomData.create({ data: { value: 1 } });
      const atom2 = BoolAtomData.create({ data: { value: 2 } });
      const expr1 = BoolExpressionData.create({ 
        operator: "and", 
        left: atom1, 
        right: atom2 
      });
      
      const atom3 = BoolAtomData.create({ data: { value: 3 } });
      const expr2 = BoolExpressionData.create({ 
        operator: "or", 
        left: expr1, 
        right: atom3 
      });
      
      expect(BoolExpressionData.is(expr2.left)).toBe(true);
      expect(BoolAtomData.is(expr2.right)).toBe(true);
    });

    test("should stringify and parse", () => {
      const left = BoolAtomData.create({ data: { value: 1 } });
      const right = BoolAtomData.create({ data: { value: 2 } });
      const expr = BoolExpressionData.create({ operator: "or", left, right });
      
      const originalUuid = expr.uuid;
      const stringified = BoolExpressionData.stringify(expr);
      expect(typeof stringified).toBe("string");
      
      // Parse the JSON
      const jsonData = JSON.parse(stringified);
      expect(jsonData.type).toBe("BoolExpressionData");
      expect(jsonData.public.operator).toBe("or");
      expect(jsonData.uuid).toBe(originalUuid);
      
      // Clear instances to allow re-parsing with same uuid
      clearAllInstances(BoolAtomData, BoolExpressionData);
      
      // Now parse should work
      const parsed = BoolExpressionData.parse(stringified);
      expect(parsed.operator).toBe("or");
      expect(parsed.type).toBe("expression");
      expect(parsed._type).toBe("BoolExpressionData");
    });

    test("should clone expression", () => {
      const left = BoolAtomData.create({ data: {} });
      const right = BoolAtomData.create({ data: {} });
      const original = BoolExpressionData.create({ 
        operator: "or", 
        left, 
        right 
      });
      
      const cloned = BoolExpressionData.clone(original, false);
      
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.operator).toBe("or");
      expect(cloned.left).toBe(original.left);
      expect(cloned.right).toBe(original.right);
    });

    test("should check type with is()", () => {
      const left = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ left });
      
      expect(BoolExpressionData.is(expr)).toBe(true);
      expect(BoolExpressionData.is(left)).toBe(false);
      expect(BoolExpressionData.is({})).toBe(false);
    });

    test("should validate with check()", () => {
      const left = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ left });
      
      expect(BoolExpressionData.check(expr)).toBe(true);
      expect(BoolExpressionData.check({ uuid: "test" })).toBe(true);
      expect(BoolExpressionData.check({})).toBe(false);
    });

    test("should have correct static metadata", () => {
      expect(BoolExpressionData.isKlass).toBe(true);
      expect(BoolExpressionData.displayName).toBe("BoolExpressionData");
      expect(BoolExpressionData.public).toBeDefined();
      expect(BoolExpressionData.public.operator.options).toContain("and");
      expect(BoolExpressionData.public.operator.options).toContain("or");
      expect(BoolExpressionData.public.operator.options).toContain("not");
    });

    test("should prevent duplicate uuid", () => {
      const left = BoolAtomData.create({ data: {} });
      const uuid = "duplicate-expr-uuid";
      BoolExpressionData.create({ left }, { uuid });
      
      expect(() => {
        BoolExpressionData.create({ left }, { uuid });
      }).toThrow("duplicate uuid");
    });
  });

  describe("BoolExp - Constructor and Creation", () => {
    test("should create BoolExp with atom", () => {
      const atom = BoolExp.atom(5);
      
      expect(atom).toBeInstanceOf(BoolExp);
      expect(atom.isAtom()).toBe(true);
      expect(atom.type).toBe("atom");
      expect(atom.data).toBe(5);
    });

    test("should create BoolExp from raw atom data", () => {
      const rawData: AtomData<number> = { type: "atom", data: 10 };
      const exp = new BoolExp(rawData);
      
      expect(exp.isAtom()).toBe(true);
      expect(exp.data).toBe(10);
    });

    test("should create BoolExp from raw expression data", () => {
      const rawData: BoolExpressionRawData<number> = {
        type: "expression",
        operator: "and",
        left: { type: "atom", data: 5 },
        right: { type: "atom", data: 10 }
      };
      const exp = new BoolExp(rawData);
      
      expect(exp.isExpression()).toBe(true);
      expect(exp.isAnd()).toBe(true);
    });

    test("should throw error if raw data is undefined", () => {
      expect(() => new BoolExp(undefined as any)).toThrow("BoolExp raw data cannot be undefined");
    });

    test("should throw error for invalid type", () => {
      expect(() => new BoolExp({ type: "invalid" } as any)).toThrow("invalid bool expression type");
    });
  });

  describe("Static Creation Methods", () => {
    test("BoolExp.atom should create atom", () => {
      const atom = BoolExp.atom("test");
      
      expect(atom.isAtom()).toBe(true);
      expect(atom.data).toBe("test");
    });

    test("BoolExp.and should combine atoms with AND", () => {
      const result = BoolExp.and(
        BoolExp.atom(1),
        BoolExp.atom(2),
        BoolExp.atom(3)
      );
      
      expect(result).toBeDefined();
      expect(result!.isExpression()).toBe(true);
      expect(result!.isAnd()).toBe(true);
    });

    test("BoolExp.and should filter out undefined values", () => {
      const result = BoolExp.and(
        BoolExp.atom(1),
        undefined as any,
        BoolExp.atom(2)
      );
      
      expect(result).toBeDefined();
      expect(result!.isExpression()).toBe(true);
    });

    test("BoolExp.and should return undefined if all values are falsy", () => {
      const result = BoolExp.and(undefined as any, null as any);
      
      expect(result).toBeUndefined();
    });

    test("BoolExp.and should accept non-BoolExp values", () => {
      const result = BoolExp.and(1, 2, 3);
      
      expect(result).toBeDefined();
      expect(result!.isExpression()).toBe(true);
    });

    test("BoolExp.or should combine atoms with OR", () => {
      const result = BoolExp.or(
        BoolExp.atom(1),
        BoolExp.atom(2),
        BoolExp.atom(3)
      );
      
      expect(result).toBeDefined();
      expect(result!.isExpression()).toBe(true);
      expect(result!.isOr()).toBe(true);
    });

    test("BoolExp.or should filter out undefined values", () => {
      const result = BoolExp.or(
        BoolExp.atom(1),
        undefined as any,
        BoolExp.atom(2)
      );
      
      expect(result).toBeDefined();
    });

    test("BoolExp.or should return undefined if all values are falsy", () => {
      const result = BoolExp.or(undefined as any, null as any);
      
      expect(result).toBeUndefined();
    });
  });

  describe("Type Checking Methods", () => {
    test("isAtom should return true for atom", () => {
      const atom = BoolExp.atom(5);
      expect(atom.isAtom()).toBe(true);
      expect(atom.isExpression()).toBe(false);
    });

    test("isExpression should return true for expression", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      expect(expr.isExpression()).toBe(true);
      expect(expr.isAtom()).toBe(false);
    });

    test("isAnd should return true for AND expression", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      expect(expr.isAnd()).toBe(true);
      expect(expr.isOr()).toBe(false);
      expect(expr.isNot()).toBe(false);
    });

    test("isOr should return true for OR expression", () => {
      const expr = BoolExp.atom(1).or(BoolExp.atom(2));
      expect(expr.isOr()).toBe(true);
      expect(expr.isAnd()).toBe(false);
      expect(expr.isNot()).toBe(false);
    });

    test("isNot should return true for NOT expression", () => {
      const expr = BoolExp.atom(1).not();
      expect(expr.isNot()).toBe(true);
      expect(expr.isAnd()).toBe(false);
      expect(expr.isOr()).toBe(false);
    });
  });

  describe("Logical Operations", () => {
    test("and should create AND expression", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      
      expect(expr.isExpression()).toBe(true);
      expect(expr.isAnd()).toBe(true);
      expect(expr.left.data).toBe(1);
      expect(expr.right!.data).toBe(2);
    });

    test("and should accept raw values", () => {
      const expr = BoolExp.atom(1).and(2);
      
      expect(expr.isAnd()).toBe(true);
      expect(expr.left.data).toBe(1);
      expect(expr.right!.data).toBe(2);
    });

    test("or should create OR expression", () => {
      const expr = BoolExp.atom(1).or(BoolExp.atom(2));
      
      expect(expr.isExpression()).toBe(true);
      expect(expr.isOr()).toBe(true);
      expect(expr.left.data).toBe(1);
      expect(expr.right!.data).toBe(2);
    });

    test("or should accept raw values", () => {
      const expr = BoolExp.atom(1).or(2);
      
      expect(expr.isOr()).toBe(true);
      expect(expr.left.data).toBe(1);
      expect(expr.right!.data).toBe(2);
    });

    test("not should create NOT expression", () => {
      const expr = BoolExp.atom(1).not();
      
      expect(expr.isExpression()).toBe(true);
      expect(expr.isNot()).toBe(true);
      expect(expr.left.data).toBe(1);
      expect(expr.right).toBeUndefined();
    });

    test("should chain multiple operations", () => {
      const expr = BoolExp.atom(1).and(2).or(3).not();
      
      expect(expr.isNot()).toBe(true);
      expect(expr.left.isOr()).toBe(true);
      expect(expr.left.left.isAnd()).toBe(true);
    });
  });

  describe("Accessors", () => {
    test("left should return left expression", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      const left = expr.left;
      
      expect(left).toBeInstanceOf(BoolExp);
      expect(left.data).toBe(1);
    });

    test("right should return right expression", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      const right = expr.right;
      
      expect(right).toBeInstanceOf(BoolExp);
      expect(right!.data).toBe(2);
    });

    test("right should be undefined for NOT expression", () => {
      const expr = BoolExp.atom(1).not();
      
      expect(expr.right).toBeUndefined();
    });

    test("data should return atom data", () => {
      const atom = BoolExp.atom({ value: 42 });
      
      expect(atom.data).toEqual({ value: 42 });
    });
  });

  describe("Serialization", () => {
    test("toJSON should return raw data", () => {
      const atom = BoolExp.atom(5);
      const json = atom.toJSON();
      
      expect(json).toEqual({ type: "atom", data: 5 });
    });

    test("fromJSON should create BoolExp from JSON", () => {
      const jsonData: ExpressionData<number> = { type: "atom", data: 10 };
      const exp = BoolExp.fromJSON(jsonData);
      
      expect(exp).toBeInstanceOf(BoolExp);
      expect(exp.data).toBe(10);
    });

    test("toValue and fromValue should work together", () => {
      const original = BoolExp.atom(5);
      const value = original.toValue();
      const restored = BoolExp.fromValue(value);
      
      expect(restored.data).toBe(5);
    });

    test("fromValue should handle BoolExp instance", () => {
      const original = BoolExp.atom(5);
      const result = BoolExp.fromValue(original);
      
      expect(result).toBe(original);
    });
  });

  describe("standardizeData", () => {
    test("should handle BoolExp instance", () => {
      const exp = BoolExp.atom(5);
      const result = BoolExp.standardizeData(exp);
      
      expect(result).toEqual({ type: "atom", data: 5 });
    });

    test("should handle AtomData", () => {
      const atomData: AtomData<number> = { type: "atom", data: 10 };
      const result = BoolExp.standardizeData(atomData);
      
      expect(result).toEqual(atomData);
    });

    test("should handle ExpressionData", () => {
      const exprData: BoolExpressionRawData<number> = {
        type: "expression",
        operator: "and",
        left: { type: "atom", data: 1 },
        right: { type: "atom", data: 2 }
      };
      const result = BoolExp.standardizeData(exprData);
      
      expect(result).toEqual(exprData);
    });

    test("should wrap raw value in atom", () => {
      const result = BoolExp.standardizeData(42);
      
      expect(result).toEqual({ type: "atom", data: 42 });
    });
  });

  describe("map", () => {
    test("should map over atom", () => {
      const atom = BoolExp.atom(5);
      const mapped = atom.map((exp) => exp.data * 2);
      
      expect(mapped.data).toBe(10);
    });

    test("should map over AND expression", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      const mapped = expr.map((exp) => exp.data * 10);
      
      expect(mapped.left.data).toBe(10);
      expect(mapped.right!.data).toBe(20);
      expect(mapped.isAnd()).toBe(true);
    });

    test("should map over OR expression", () => {
      const expr = BoolExp.atom(1).or(BoolExp.atom(2));
      const mapped = expr.map((exp) => exp.data * 10);
      
      expect(mapped.left.data).toBe(10);
      expect(mapped.right!.data).toBe(20);
      expect(mapped.isOr()).toBe(true);
    });

    test("should map over NOT expression", () => {
      const expr = BoolExp.atom(5).not();
      const mapped = expr.map((exp) => exp.data * 2);
      
      expect(mapped.left.data).toBe(10);
      expect(mapped.isNot()).toBe(true);
    });

    test("should allow returning new BoolExp from map", () => {
      const expr = BoolExp.atom(5);
      const mapped = expr.map((exp) => {
        if (exp.data > 3) {
          return BoolExp.atom("big");
        }
        return "small";
      });
      
      expect(mapped.data).toBe("big");
    });

    test("should provide context in map callback", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2));
      const contexts: string[][] = [];
      
      expr.map((exp, context) => {
        contexts.push(context);
        return exp.data;
      });
      
      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toEqual(["left"]);
      expect(contexts[1]).toEqual(["right"]);
    });

    test("should handle nested expressions", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2)).or(BoolExp.atom(3));
      const mapped = expr.map((exp) => exp.data * 100);
      
      expect(mapped.isOr()).toBe(true);
      expect(mapped.left.isAnd()).toBe(true);
      expect(mapped.left.left.data).toBe(100);
      expect(mapped.left.right!.data).toBe(200);
      expect(mapped.right!.data).toBe(300);
    });
  });

  describe("find", () => {
    test("should find atom matching condition", () => {
      const expr = BoolExp.atom(5).and(BoolExp.atom(10)).or(BoolExp.atom(15));
      const found = expr.find((data) => data === 10, []);
      
      expect(found).toBe(10);
    });

    test("should return undefined if not found", () => {
      const expr = BoolExp.atom(5).and(BoolExp.atom(10));
      const found = expr.find((data) => data === 20, []);
      
      expect(found).toBeUndefined();
    });

    test("should find first matching atom", () => {
      const expr = BoolExp.atom(5).and(BoolExp.atom(5));
      const found = expr.find((data) => data === 5, []);
      
      expect(found).toBe(5);
    });

    test("should search in nested expressions", () => {
      const expr = BoolExp.atom(1).and(BoolExp.atom(2).or(BoolExp.atom(3)));
      const found = expr.find((data) => data === 3, []);
      
      expect(found).toBe(3);
    });

    test("should find object atoms", () => {
      const target = { id: 2, name: "target" };
      const expr = BoolExp.atom({ id: 1, name: "a" })
        .and(BoolExp.atom(target))
        .or(BoolExp.atom({ id: 3, name: "c" }));
      
      const found = expr.find((data: any) => data.id === 2, []);
      
      expect(found).toBe(target);
    });
  });

  describe("evaluate", () => {
    test("should evaluate simple atom (true)", () => {
      const atom = BoolExp.atom(10);
      const result = atom.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate simple atom (false)", () => {
      const atom = BoolExp.atom(3);
      const result = atom.evaluate((data) => data > 5);
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).data).toBe(3);
      expect((result as EvaluateError<number>).error).toBe("atom evaluate error");
    });

    test("should handle string error message from atom handler", () => {
      const atom = BoolExp.atom(10);
      const result = atom.evaluate((data) => "custom error message");
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).error).toBe("custom error message");
    });

    test("should evaluate AND expression (both true)", () => {
      const expr = BoolExp.atom(10).and(BoolExp.atom(20));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate AND expression (left false)", () => {
      const expr = BoolExp.atom(3).and(BoolExp.atom(20));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).data).toBe(3);
    });

    test("should evaluate AND expression (right false)", () => {
      const expr = BoolExp.atom(10).and(BoolExp.atom(3));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).data).toBe(3);
    });

    test("should evaluate OR expression (both true)", () => {
      const expr = BoolExp.atom(10).or(BoolExp.atom(20));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate OR expression (left true)", () => {
      const expr = BoolExp.atom(10).or(BoolExp.atom(3));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate OR expression (right true)", () => {
      const expr = BoolExp.atom(3).or(BoolExp.atom(10));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate OR expression (both false)", () => {
      const expr = BoolExp.atom(3).or(BoolExp.atom(4));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).not.toBe(true);
    });

    test("should evaluate NOT expression (true becomes false)", () => {
      const expr = BoolExp.atom(10).not();
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).inverse).toBe(true);
    });

    test("should evaluate NOT expression (false becomes true)", () => {
      const expr = BoolExp.atom(3).not();
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate complex nested expression", () => {
      // (10 > 5 AND 20 > 5) OR (3 > 5) = true OR false = true
      const expr = BoolExp.atom(10).and(BoolExp.atom(20)).or(BoolExp.atom(3));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate complex expression with NOT", () => {
      // NOT(10 > 5 AND 3 > 5)
      // Note: Current implementation doesn't propagate inverse through AND/OR
      // So this will return error because the AND fails (3 > 5 = false)
      const expr = BoolExp.atom(10).and(BoolExp.atom(3)).not();
      const result = expr.evaluate((data) => data > 5);
      
      // The AND expression returns error (because right side fails)
      // NOT doesn't convert error to true in current implementation
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).data).toBe(3);
    });

    test("should track evaluation stack", () => {
      const expr = BoolExp.atom(3).and(BoolExp.atom(10));
      const result = expr.evaluate((data) => data > 5);
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).stack).toBeDefined();
      expect((result as EvaluateError<number>).stack.length).toBeGreaterThan(0);
    });
  });

  describe("evaluateAsync", () => {
    test("should evaluate simple atom async (true)", async () => {
      const atom = BoolExp.atom(10);
      const result = await atom.evaluateAsync(async (data) => data > 5);
      
      expect(result).toBe(true);
    });

    test("should evaluate simple atom async (false)", async () => {
      const atom = BoolExp.atom(3);
      const result = await atom.evaluateAsync(async (data) => data > 5);
      
      expect(result).not.toBe(true);
      expect((result as EvaluateError<number>).data).toBe(3);
    });

    test("should evaluate AND expression async", async () => {
      const expr = BoolExp.atom(10).and(BoolExp.atom(20));
      const result = await expr.evaluateAsync(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return data > 5;
      });
      
      expect(result).toBe(true);
    });

    test("should evaluate OR expression async", async () => {
      const expr = BoolExp.atom(3).or(BoolExp.atom(10));
      const result = await expr.evaluateAsync(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return data > 5;
      });
      
      expect(result).toBe(true);
    });

    test("should evaluate NOT expression async", async () => {
      const expr = BoolExp.atom(3).not();
      const result = await expr.evaluateAsync(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return data > 5;
      });
      
      expect(result).toBe(true);
    });

    test("should handle async rejection", async () => {
      const atom = BoolExp.atom(10);
      const result = await atom.evaluateAsync(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return false;
      });
      
      expect(result).not.toBe(true);
    });

    test("should evaluate complex nested async expression", async () => {
      const expr = BoolExp.atom(10).and(BoolExp.atom(20)).or(BoolExp.atom(3));
      const result = await expr.evaluateAsync(async (data) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return data > 5;
      });
      
      expect(result).toBe(true);
    });
  });

  describe("Complex Scenarios", () => {
    test("should build complex expression with multiple operators", () => {
      const expr = BoolExp.atom(1)
        .and(BoolExp.atom(2))
        .or(BoolExp.atom(3))
        .and(BoolExp.atom(4))
        .not();
      
      expect(expr.isNot()).toBe(true);
      expect(expr.left.isAnd()).toBe(true);
    });

    test("should work with object data", () => {
      const user1 = { id: 1, name: "Alice", age: 25 };
      const user2 = { id: 2, name: "Bob", age: 30 };
      const user3 = { id: 3, name: "Charlie", age: 35 };
      
      const expr = BoolExp.atom(user1).and(BoolExp.atom(user2)).or(BoolExp.atom(user3));
      const result = expr.evaluate((user) => user.age > 28);
      
      expect(result).toBe(true); // Bob (30) or Charlie (35) satisfy the condition
    });

    test("should work with function data", () => {
      const fn1 = () => true;
      const fn2 = () => false;
      
      const expr = BoolExp.atom(fn1).and(BoolExp.atom(fn2));
      const result = expr.evaluate((fn) => fn());
      
      expect(result).not.toBe(true);
    });

    test("should support deep nesting", () => {
      const expr = BoolExp.atom(1)
        .and(BoolExp.atom(2).or(BoolExp.atom(3)))
        .or(BoolExp.atom(4).and(BoolExp.atom(5).not()));
      
      expect(expr.isOr()).toBe(true);
      expect(expr.left.isAnd()).toBe(true);
      expect(expr.left.right!.isOr()).toBe(true);
      expect(expr.right!.isAnd()).toBe(true);
      expect(expr.right!.right!.isNot()).toBe(true);
    });

    test("should evaluate NOT with AND - understanding current behavior", () => {
      const A = BoolExp.atom(10);
      const B = BoolExp.atom(3);
      
      // NOT(A AND B)
      const expr1 = A.and(B).not();
      const result1 = expr1.evaluate((data) => data > 5);
      
      // For the data (10, 3):
      // A = true (10 > 5), B = false (3 > 5)
      // A AND B evaluates left (true), then right (false), returns error
      // NOT receives error and passes it through
      // This is current implementation behavior
      expect(result1).not.toBe(true);
      expect((result1 as EvaluateError<number>).data).toBe(3);
    });

    test("should maintain immutability", () => {
      const original = BoolExp.atom(5);
      const negated = original.not();
      const combined = original.and(BoolExp.atom(10));
      
      expect(original.isAtom()).toBe(true);
      expect(negated.isNot()).toBe(true);
      expect(combined.isAnd()).toBe(true);
      
      // Original should be unchanged
      expect(original.data).toBe(5);
      expect(original.isAtom()).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("should handle null atom data", () => {
      const atom = BoolExp.atom(null);
      expect(atom.data).toBe(null);
    });

    test("should handle undefined atom data", () => {
      const atom = BoolExp.atom(undefined);
      expect(atom.data).toBe(undefined);
    });

    test("should handle empty object atom data", () => {
      const atom = BoolExp.atom({});
      expect(atom.data).toEqual({});
    });

    test("should handle empty array atom data", () => {
      const atom = BoolExp.atom([]);
      expect(atom.data).toEqual([]);
    });

    test("should handle 0 as atom data", () => {
      const atom = BoolExp.atom(0);
      expect(atom.data).toBe(0);
    });

    test("should handle false as atom data", () => {
      const atom = BoolExp.atom(false);
      expect(atom.data).toBe(false);
    });

    test("should handle empty string as atom data", () => {
      const atom = BoolExp.atom("");
      expect(atom.data).toBe("");
    });

    test("should handle very deep nesting", () => {
      let expr = BoolExp.atom(1);
      for (let i = 2; i <= 10; i++) {
        expr = expr.and(BoolExp.atom(i));
      }
      
      expect(expr.isExpression()).toBe(true);
      const result = expr.evaluate((data) => data > 0);
      expect(result).toBe(true);
    });

    test("should handle map that returns BoolExp", () => {
      const expr = BoolExp.atom(5);
      const mapped = expr.map((exp) => {
        return exp.data > 3 ? BoolExp.atom(true) : BoolExp.atom(false);
      });
      
      expect(mapped.data).toBe(true);
    });

    test("should handle find with complex predicate", () => {
      interface User {
        id: number;
        name: string;
        active: boolean;
      }
      
      const users: User[] = [
        { id: 1, name: "Alice", active: true },
        { id: 2, name: "Bob", active: false },
        { id: 3, name: "Charlie", active: true }
      ];
      
      const expr = BoolExp.atom(users[0])
        .and(BoolExp.atom(users[1]))
        .or(BoolExp.atom(users[2]));
      
      const found = expr.find((user) => user.name === "Bob", []);
      expect(found).toBe(users[1]);
    });
  });
});

