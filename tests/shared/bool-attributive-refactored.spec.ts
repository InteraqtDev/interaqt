import { describe, test, expect, beforeEach } from "vitest";
import { BoolAtomData, BoolExpressionData } from "../../src/shared/BoolExp";
import { Attributive, Attributives } from "../../src/shared/Attributive";
import { Conditions } from "../../src/shared/Conditions";
import { DataAttributives } from "../../src/shared/DataAttributives";
import { clearAllInstances } from "../../src/shared/utils";

describe("Bool and Attributive Classes Refactored", () => {
  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(
      BoolAtomData, BoolExpressionData,
      Attributive, Attributives,
      Conditions, DataAttributives
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

    test("should stringify and parse bool atom", () => {
      const original = BoolAtomData.create({
        data: { value: 42 }
      });
      
      const stringified = BoolAtomData.stringify(original);
      const parsed = BoolAtomData.parse(stringified);

      expect(parsed.type).toBe("atom");
      expect(parsed.data).toEqual({ value: 42 });
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

  describe("Attributive", () => {
    test("should create attributive instance", () => {
      const attr = Attributive.create({
        content: (data: any) => data.isValid
      });

      expect(attr.content).toBeDefined();
      expect(attr._type).toBe("Attributive");
    });

    test("should create attributive with all options", () => {
      const attr = Attributive.create({
        stringContent: "user.isActive",
        content: (user: any) => user.isActive,
        name: "IsActiveCheck",
        isRef: true
      });

      expect(attr.stringContent).toBe("user.isActive");
      expect(attr.name).toBe("IsActiveCheck");
      expect(attr.isRef).toBe(true);
    });

    test("should stringify and parse attributive", () => {
      const original = Attributive.create({
        content: () => true,
        name: "TestAttr"
      });
      
      const stringified = Attributive.stringify(original);
      const parsed = Attributive.parse(stringified);

      expect(parsed.name).toBe("TestAttr");
      expect(parsed.content).toBeDefined();
      expect(typeof parsed.content).toBe("function");
    });
  });

  describe("Attributives", () => {
    test("should create attributives instance with no content", () => {
      const attrs = Attributives.create({});

      expect(attrs.content).toBeUndefined();
      expect(attrs._type).toBe("Attributives");
    });

    test("should create attributives with bool atom content", () => {
      const atom = BoolAtomData.create({ data: { content: () => true } });
      const attrs = Attributives.create({
        content: atom
      });

      expect(attrs.content).toBe(atom);
    });

    test("should create attributives with bool expression content", () => {
      const atom1 = BoolAtomData.create({ data: { content: () => true } });
      const atom2 = BoolAtomData.create({ data: { content: () => false } });
      const expr = BoolExpressionData.create({
        operator: "and",
        left: atom1,
        right: atom2
      });
      
      const attrs = Attributives.create({
        content: expr
      });

      expect(attrs.content).toBe(expr);
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

  describe("DataAttributives", () => {
    test("should create data attributives instance", () => {
      const dataAttrs = DataAttributives.create({});

      expect(dataAttrs.content).toBeUndefined();
      expect(dataAttrs._type).toBe("DataAttributives");
    });

    test("should create data attributives with content", () => {
      const atom = BoolAtomData.create({ data: { content: () => true } });
      const dataAttrs = DataAttributives.create({
        content: atom
      });

      expect(dataAttrs.content).toBe(atom);
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(BoolAtomData.isKlass).toBe(true);
      expect(BoolExpressionData.isKlass).toBe(true);
      expect(Attributive.isKlass).toBe(true);
      expect(Attributives.isKlass).toBe(true);
      expect(Conditions.isKlass).toBe(true);
      expect(DataAttributives.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(BoolAtomData.displayName).toBe("BoolAtomData");
      expect(BoolExpressionData.displayName).toBe("BoolExpressionData");
      expect(Attributive.displayName).toBe("Attributive");
      expect(Attributives.displayName).toBe("Attributives");
      expect(Conditions.displayName).toBe("Conditions");
      expect(DataAttributives.displayName).toBe("DataAttributives");
    });

    test("should track instances", () => {
      const atom1 = BoolAtomData.create({ data: {} });
      const atom2 = BoolAtomData.create({ data: {} });
      const expr1 = BoolExpressionData.create({ left: atom1 });
      const attr1 = Attributive.create({ content: () => true });
      const attrs1 = Attributives.create({});
      const cond1 = Conditions.create({});
      const dataAttrs1 = DataAttributives.create({});

      expect(BoolAtomData.instances).toHaveLength(2);
      expect(BoolExpressionData.instances).toHaveLength(1);
      expect(Attributive.instances).toHaveLength(1);
      expect(Attributives.instances).toHaveLength(1);
      expect(Conditions.instances).toHaveLength(1);
      expect(DataAttributives.instances).toHaveLength(1);
    });

    test("should use is() for type checking", () => {
      const atom = BoolAtomData.create({ data: {} });
      const expr = BoolExpressionData.create({ left: atom });
      const attr = Attributive.create({ content: () => true });
      
      expect(BoolAtomData.is(atom)).toBe(true);
      expect(BoolAtomData.is(expr)).toBe(false);
      expect(BoolExpressionData.is(expr)).toBe(true);
      expect(BoolExpressionData.is(atom)).toBe(false);
      expect(Attributive.is(attr)).toBe(true);
      expect(Attributive.is(atom)).toBe(false);
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