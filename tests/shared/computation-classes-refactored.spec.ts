import { describe, test, expect, beforeEach } from "vitest";
import { Count } from "../../src/shared/refactored/Count";
import { Summation } from "../../src/shared/refactored/Summation";
import { Average } from "../../src/shared/refactored/Average";
import { WeightedSummation } from "../../src/shared/refactored/WeightedSummation";
import { Transform } from "../../src/shared/refactored/Transform";
import { Any } from "../../src/shared/refactored/Any";
import { Every } from "../../src/shared/refactored/Every";
import { RealTime } from "../../src/shared/refactored/RealTime";
import { Entity } from "../../src/shared/refactored/Entity";
import { Relation } from "../../src/shared/refactored/Relation";
import { clearAllInstances } from "../../src/shared/refactored/utils";

describe("Computation Classes Refactored", () => {
  let userEntity: any;
  let postEntity: any;
  let userPostRelation: any;

  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(
      Count, Summation, Average, WeightedSummation, Transform, Any, Every, RealTime,
      Entity, Relation
    );
    
    // 创建测试用的实体和关系
    userEntity = Entity.create({ name: "User" });
    postEntity = Entity.create({ name: "Post" });
    userPostRelation = Relation.create({
      source: userEntity,
      sourceProperty: "posts",
      target: postEntity,
      targetProperty: "author",
      type: "1:n"
    });
  });

  describe("Count", () => {
    test("should create count instance", () => {
      const count = Count.create({
        record: postEntity
      });

      expect(count.record).toBe(postEntity);
      expect(count.uuid).toBeDefined();
      expect(count._type).toBe("Count");
    });

    test("should create count with all options", () => {
      const count = Count.create({
        record: userPostRelation,
        direction: "target",
        callback: (item: any) => item.active,
        attributeQuery: { attribute: "status", value: "published" },
        dataDeps: { minCount: 5 }
      });

      expect(count.record).toBe(userPostRelation);
      expect(count.direction).toBe("target");
      expect(count.callback).toBeDefined();
      expect(count.attributeQuery).toEqual({ attribute: "status", value: "published" });
      expect(count.dataDeps).toEqual({ minCount: 5 });
    });

    test("should stringify and parse count", () => {
      const original = Count.create({
        record: postEntity,
        direction: "source",
        callback: () => true
      });
      
      const stringified = Count.stringify(original);
      const parsed = Count.parse(stringified);

      expect(parsed.direction).toBe("source");
      expect(parsed.callback).toBeDefined();
      expect(parsed._type).toBe("Count");
    });

    test("should clone count", () => {
      const original = Count.create({
        record: userEntity,
        attributeQuery: { attribute: "active" }
      });
      const cloned = Count.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.record).toBe(original.record);
      expect(cloned.attributeQuery).toEqual(original.attributeQuery);
    });
  });

  describe("Summation", () => {
    test("should create summation instance", () => {
      const summation = Summation.create({
        record: postEntity,
        attributeQuery: { attribute: "views" }
      });

      expect(summation.record).toBe(postEntity);
      expect(summation.attributeQuery).toEqual({ attribute: "views" });
      expect(summation.uuid).toBeDefined();
      expect(summation._type).toBe("Summation");
    });

    test("should create summation with direction", () => {
      const summation = Summation.create({
        record: userPostRelation,
        direction: "target",
        attributeQuery: { attribute: "likes" }
      });

      expect(summation.direction).toBe("target");
    });

    test("should stringify and parse summation", () => {
      const original = Summation.create({
        record: postEntity,
        attributeQuery: { attribute: "score" }
      });
      
      const stringified = Summation.stringify(original);
      const parsed = Summation.parse(stringified);

      expect(parsed.attributeQuery).toEqual({ attribute: "score" });
      expect(parsed._type).toBe("Summation");
    });
  });

  describe("Average", () => {
    test("should create average instance", () => {
      const average = Average.create({
        record: postEntity,
        attributeQuery: { attribute: "rating" }
      });

      expect(average.record).toBe(postEntity);
      expect(average.attributeQuery).toEqual({ attribute: "rating" });
      expect(average.uuid).toBeDefined();
      expect(average._type).toBe("Average");
    });

    test("should create average with direction", () => {
      const average = Average.create({
        record: userPostRelation,
        direction: "source",
        attributeQuery: { attribute: "score" }
      });

      expect(average.direction).toBe("source");
    });

    test("should stringify and parse average", () => {
      const original = Average.create({
        record: userEntity,
        attributeQuery: { attribute: "age" }
      });
      
      const stringified = Average.stringify(original);
      const parsed = Average.parse(stringified);

      expect(parsed.attributeQuery).toEqual({ attribute: "age" });
      expect(parsed._type).toBe("Average");
    });

    test("should clone average", () => {
      const original = Average.create({
        record: postEntity,
        direction: "both",
        attributeQuery: { attribute: "price" }
      });
      const cloned = Average.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.record).toBe(original.record);
      expect(cloned.direction).toBe(original.direction);
      expect(cloned.attributeQuery).toEqual(original.attributeQuery);
    });
  });

  describe("WeightedSummation", () => {
    test("should create weighted summation instance", () => {
      const ws = WeightedSummation.create({
        record: postEntity,
        callback: (item: any) => item.score * item.weight
      });

      expect(ws.record).toBe(postEntity);
      expect(ws.callback).toBeDefined();
      expect(ws._type).toBe("WeightedSummation");
    });

    test("should create weighted summation with all options", () => {
      const ws = WeightedSummation.create({
        record: userPostRelation,
        direction: "target",
        callback: (item: any) => item.value,
        attributeQuery: { attribute: "weighted" },
        dataDeps: { factor: 2 }
      });

      expect(ws.direction).toBe("target");
      expect(ws.attributeQuery).toEqual({ attribute: "weighted" });
      expect(ws.dataDeps).toEqual({ factor: 2 });
    });
  });

  describe("Transform", () => {
    test("should create transform instance", () => {
      const transform = Transform.create({
        record: postEntity,
        callback: (item: any) => ({ transformed: true, ...item })
      });

      expect(transform.record).toBe(postEntity);
      expect(transform.callback).toBeDefined();
      expect(transform._type).toBe("Transform");
    });

    test("should create transform with attributeQuery", () => {
      const transform = Transform.create({
        record: userEntity,
        attributeQuery: { filter: "active" },
        callback: (item: any) => item
      });

      expect(transform.attributeQuery).toEqual({ filter: "active" });
    });
  });

  describe("Any", () => {
    test("should create any instance", () => {
      const any = Any.create({
        record: postEntity,
        callback: (item: any) => item.published
      });

      expect(any.record).toBe(postEntity);
      expect(any.callback).toBeDefined();
      expect(any._type).toBe("Any");
    });

    test("should create any with all options", () => {
      const any = Any.create({
        record: userPostRelation,
        direction: "source",
        callback: (item: any) => item.active,
        attributeQuery: { status: "enabled" },
        dataDeps: { threshold: 1 }
      });

      expect(any.direction).toBe("source");
      expect(any.attributeQuery).toEqual({ status: "enabled" });
      expect(any.dataDeps).toEqual({ threshold: 1 });
    });
  });

  describe("Every", () => {
    test("should create every instance", () => {
      const every = Every.create({
        record: postEntity,
        callback: (item: any) => item.approved
      });

      expect(every.record).toBe(postEntity);
      expect(every.callback).toBeDefined();
      expect(every._type).toBe("Every");
    });

    test("should create every with notEmpty option", () => {
      const every = Every.create({
        record: userEntity,
        callback: (item: any) => item.verified,
        notEmpty: true
      });

      expect(every.notEmpty).toBe(true);
    });
  });

  describe("RealTime", () => {
    test("should create realtime instance", () => {
      const realtime = RealTime.create({
        callback: () => new Date()
      });

      expect(realtime.callback).toBeDefined();
      expect(realtime._type).toBe("RealTimeValue");
    });

    test("should create realtime with all options", () => {
      const realtime = RealTime.create({
        callback: () => Date.now(),
        nextRecomputeTime: () => Date.now() + 1000,
        attributeQuery: { type: "timestamp" },
        dataDeps: { interval: 1000 }
      });

      expect(realtime.nextRecomputeTime).toBeDefined();
      expect(realtime.attributeQuery).toEqual({ type: "timestamp" });
      expect(realtime.dataDeps).toEqual({ interval: 1000 });
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(Count.isKlass).toBe(true);
      expect(Summation.isKlass).toBe(true);
      expect(Average.isKlass).toBe(true);
      expect(WeightedSummation.isKlass).toBe(true);
      expect(Transform.isKlass).toBe(true);
      expect(Any.isKlass).toBe(true);
      expect(Every.isKlass).toBe(true);
      expect(RealTime.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(Count.displayName).toBe("Count");
      expect(Summation.displayName).toBe("Summation");
      expect(Average.displayName).toBe("Average");
      expect(WeightedSummation.displayName).toBe("WeightedSummation");
      expect(Transform.displayName).toBe("Transform");
      expect(Any.displayName).toBe("Any");
      expect(Every.displayName).toBe("Every");
      expect(RealTime.displayName).toBe("RealTimeValue");
    });

    test("should track instances", () => {
      const c1 = Count.create({ record: userEntity });
      const c2 = Count.create({ record: postEntity });
      const s1 = Summation.create({ record: userEntity, attributeQuery: {} });
      const a1 = Average.create({ record: postEntity, attributeQuery: {} });
      const ws1 = WeightedSummation.create({ record: userEntity, callback: () => 1 });
      const t1 = Transform.create({ record: postEntity, callback: (x: any) => x });
      const any1 = Any.create({ record: userEntity, callback: () => true });
      const ev1 = Every.create({ record: postEntity, callback: () => true });
      const rt1 = RealTime.create({ callback: () => Date.now() });

      expect(Count.instances).toHaveLength(2);
      expect(Summation.instances).toHaveLength(1);
      expect(Average.instances).toHaveLength(1);
      expect(WeightedSummation.instances).toHaveLength(1);
      expect(Transform.instances).toHaveLength(1);
      expect(Any.instances).toHaveLength(1);
      expect(Every.instances).toHaveLength(1);
      expect(RealTime.instances).toHaveLength(1);
    });

    test("should use is() for type checking", () => {
      const count = Count.create({ record: userEntity });
      const sum = Summation.create({ record: userEntity, attributeQuery: {} });
      
      expect(Count.is(count)).toBe(true);
      expect(Count.is(sum)).toBe(false);
      expect(Summation.is(sum)).toBe(true);
      expect(Summation.is(count)).toBe(false);
    });
  });
}); 