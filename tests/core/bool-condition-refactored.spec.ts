import { describe, test, expect, beforeEach } from "vitest";
import {
  BoolAtomData, BoolExpressionData, clearAllInstances
} from "@core";
import {
  Condition,
  Conditions
} from "interaqt";

describe("Bool and Condition Classes Refactored", () => {
  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(
      BoolAtomData, BoolExpressionData,
      Condition,
      Conditions
    );
  });

  describe("BoolAtomData", () => {
    test("should create bool atom instance", () => {
      const atom = BoolAtomData.create({
        data: { content: (x: any) => x > 10 }
      });

      expect(atom.type).toBe("atom");
      expect(atom.data).toBeDefined();
      expect(atom._type).toBe("BoolAtomData");
    });

    test("should create bool atom with custom type", () => {
      const atom = BoolAtomData.create({
        type: "custom",
        data: { content: () => true }
      });

      expect(atom.type).toBe("custom");
    });

  });

  describe("BoolExpressionData", () => {
    test("should create bool expression instance", () => {
      const atom1 = BoolAtomData.create({ data: { content: () => true } });
      const atom2 = BoolAtomData.create({ data: { content: () => false } });
      
      const expr = BoolExpressionData.create({
        operator: "and",
        left: atom1,
        right: atom2
      });

      expect(expr.type).toBe("expression");
      expect(expr.operator).toBe("and");
      expect(expr.left).toBe(atom1);
      expect(expr.right).toBe(atom2);
      expect(expr._type).toBe("BoolExpressionData");
    });

    test("should create bool expression with NOT operator", () => {
      const atom = BoolAtomData.create({ data: { content: () => true } });
      
      const expr = BoolExpressionData.create({
        operator: "not",
        left: atom
      });

      expect(expr.operator).toBe("not");
      expect(expr.left).toBe(atom);
      expect(expr.right).toBeUndefined();
    });

    test("should create nested bool expressions", () => {
      const atom1 = BoolAtomData.create({ data: { content: () => true } });
      const atom2 = BoolAtomData.create({ data: { content: () => false } });
      const atom3 = BoolAtomData.create({ data: { content: () => true } });
      
      const expr1 = BoolExpressionData.create({
        operator: "and",
        left: atom1,
        right: atom2
      });
      
      const expr2 = BoolExpressionData.create({
        operator: "or",
        left: expr1,
        right: atom3
      });

      expect(expr2.operator).toBe("or");
      expect(BoolExpressionData.is(expr2.left)).toBe(true);
      expect(BoolAtomData.is(expr2.right)).toBe(true);
    });
  });

  describe("Condition", () => {
    test("should create condition instance", () => {
      const cond = Condition.create({
        content: (event: any) => event.payload.isValid
      });

      expect(cond.content).toBeDefined();
      expect(cond._type).toBe("Condition");
    });

    test("should create condition with name", () => {
      const cond = Condition.create({
        content: (event: any) => event.user.isActive,
        name: "IsActiveCheck",
      });

      expect(cond.name).toBe("IsActiveCheck");
    });

    test("should stringify and parse condition", () => {
      const original = Condition.create({
        content: () => true,
        name: "TestCond"
      });
      
      const stringified = Condition.stringify(original);
      // Clear instances before parsing: parse preserves the uuid (identity round-trip)
      Condition.instances.length = 0;
      const parsed = Condition.parse(stringified);

      expect(parsed.name).toBe("TestCond");
      expect(parsed.content).toBeDefined();
      expect(typeof parsed.content).toBe("function");
    });
  });

  describe("Conditions", () => {
    test("should create conditions instance", () => {
      const conditions = Conditions.create({});

      expect(conditions.content).toBeUndefined();
      expect(conditions._type).toBe("Conditions");
    });

    test("should create conditions with content", () => {
      const atom = BoolAtomData.create({ data: { content: () => true } });
      const conditions = Conditions.create({
        content: atom
      });

      expect(conditions.content).toBe(atom);
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(BoolAtomData.isKlass).toBe(true);
      expect(BoolExpressionData.isKlass).toBe(true);
      expect(Condition.isKlass).toBe(true);
      expect(Conditions.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(BoolAtomData.displayName).toBe("BoolAtomData");
      expect(BoolExpressionData.displayName).toBe("BoolExpressionData");
      expect(Condition.displayName).toBe("Condition");
      expect(Conditions.displayName).toBe("Conditions");
    });

    test("should track instances", () => {
      const atom1 = BoolAtomData.create({ data: {} });
      const atom2 = BoolAtomData.create({ data: {} });
      const expr1 = BoolExpressionData.create({ left: atom1 });
      const condAtom = Condition.create({ content: () => true });
      const cond1 = Conditions.create({});

      expect(BoolAtomData.instances).toHaveLength(2);
      expect(BoolExpressionData.instances).toHaveLength(1);
      expect(Condition.instances).toHaveLength(1);
      expect(Conditions.instances).toHaveLength(1);
    });

    test("should use is() for type checking", () => {
      const atom = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ left: atom });
      const cond = Condition.create({ content: () => true });
      
      expect(BoolAtomData.is(atom)).toBe(true);
      expect(BoolAtomData.is(expr)).toBe(false);
      expect(BoolExpressionData.is(expr)).toBe(true);
      expect(BoolExpressionData.is(atom)).toBe(false);
      expect(Condition.is(cond)).toBe(true);
      expect(Condition.is(atom)).toBe(false);
    });

    test("should prevent duplicate UUIDs", () => {
      const uuid = "test-uuid-bool";
      const atom1 = BoolAtomData.create({ data: {} }, { uuid });
      
      expect(() => {
        BoolAtomData.create({ data: {} }, { uuid });
      }).toThrow("duplicate uuid");
    });
  });
}); 