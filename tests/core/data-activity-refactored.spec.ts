import { describe, test, expect, beforeEach } from "vitest";
import { DataAttributive, DataPolicy } from "../../src/builtins/interaction/Data";
import { Activity, ActivityGroup, Transfer } from "../../src/builtins/interaction/Activity";
import { Interaction } from "../../src/builtins/interaction/Interaction";
import { Gateway } from "../../src/builtins/interaction/Gateway";
import { Event } from "../../src/builtins/interaction/Event";
import { Action } from "../../src/builtins/interaction/Action";
import { clearAllInstances } from "../../src/core/utils";

describe("Data and Activity Classes Refactored", () => {
  let testInteraction: any;
  let testGateway: any;
  let testEvent: any;

  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(
      DataAttributive, DataPolicy,
      Activity, ActivityGroup, Transfer,
      Interaction, Gateway, Event, Action
    );
    
    // 创建测试用的实例
    const testAction = Action.create({ name: "TestAction" });
    testInteraction = Interaction.create({ name: "TestInteraction", action: testAction });
    testGateway = Gateway.create({ name: "TestGateway" });
    testEvent = Event.create({ name: "TestEvent" });
  });

  describe("Data Classes", () => {
    describe("DataAttributive", () => {
      test("should create data attributive instance", () => {
        const dataAttr = DataAttributive.create({
          content: (data: any) => data.timestamp
        });

        expect(dataAttr.content).toBeDefined();
        expect(dataAttr.uuid).toBeDefined();
        expect(dataAttr._type).toBe("DataAttributive");
      });

      test("should create data attributive with name", () => {
        const dataAttr = DataAttributive.create({
          content: (data: any) => new Date(data.timestamp),
          name: "timestamp"
        });

        expect(dataAttr.name).toBe("timestamp");
      });

      test("should stringify and parse data attributive", () => {
        const original = DataAttributive.create({
          content: () => Date.now(),
          name: "currentTime"
        });
        
        const stringified = DataAttributive.stringify(original);
        const parsed = DataAttributive.parse(stringified);

        expect(parsed.name).toBe("currentTime");
        expect(parsed.content).toBeDefined();
        expect(typeof parsed.content).toBe("function");
      });
    });

    describe("DataPolicy", () => {
      test("should create data policy instance with match", () => {
        const policy = DataPolicy.create({
          match: { key: "status", value: ["=", "active"] }
        });

        expect(policy.match).toBeDefined();
        expect(policy._type).toBe("DataPolicy");
      });

      test("should create data policy with all fields", () => {
        const policy = DataPolicy.create({
          match: { key: "status", value: ["=", "published"] },
          modifier: { limit: 10, offset: 0 },
          attributeQuery: ["id", "name", "email"]
        });

        expect(policy.match).toBeDefined();
        expect(policy.modifier).toEqual({ limit: 10, offset: 0 });
        expect(policy.attributeQuery).toEqual(["id", "name", "email"]);
      });

      test("should stringify and parse data policy", () => {
        const original = DataPolicy.create({
          match: { key: "type", value: ["=", "user"] },
          modifier: { limit: 5 },
          attributeQuery: ["id", "name"]
        });
        
        const stringified = DataPolicy.stringify(original);
        const parsed = DataPolicy.parse(stringified);

        expect(parsed.match).toEqual(original.match);
        expect(parsed.modifier).toEqual(original.modifier);
        expect(parsed.attributeQuery).toEqual(original.attributeQuery);
      });

      test("should clone data policy", () => {
        const original = DataPolicy.create({
          match: { key: "status", value: ["=", "active"] },
          modifier: { limit: 10 }
        });
        const cloned = DataPolicy.clone(original, false);

        expect(cloned).not.toBe(original);
        expect(cloned.uuid).not.toBe(original.uuid);
        expect(cloned.match).toEqual(original.match);
        expect(cloned.modifier).toEqual(original.modifier);
      });

      test("should create data policy with only attributeQuery", () => {
        const policy = DataPolicy.create({
          attributeQuery: ["id", "title", "content"]
        });

        expect(policy.match).toBeUndefined();
        expect(policy.modifier).toBeUndefined();
        expect(policy.attributeQuery).toEqual(["id", "title", "content"]);
      });
    });
  });

  describe("Activity Classes", () => {
    describe("Activity", () => {
      test("should create activity instance", () => {
        const activity = Activity.create({
          name: "OrderProcessing"
        });

        expect(activity.name).toBe("OrderProcessing");
        expect(activity.interactions).toEqual([]);
        expect(activity.gateways).toEqual([]);
        expect(activity.transfers).toEqual([]);
        expect(activity.groups).toEqual([]);
        expect(activity.events).toEqual([]);
        expect(activity._type).toBe("Activity");
      });

      test("should create activity with all components", () => {
        const transfer = Transfer.create({
          name: "toGateway",
          source: testInteraction,
          target: testGateway
        });
        
        const group = ActivityGroup.create({
          type: "parallel"
        });
        
        const activity = Activity.create({
          name: "ComplexFlow",
          interactions: [testInteraction],
          gateways: [testGateway],
          transfers: [transfer],
          groups: [group],
          events: [testEvent]
        });

        expect(activity.interactions).toHaveLength(1);
        expect(activity.gateways).toHaveLength(1);
        expect(activity.transfers).toHaveLength(1);
        expect(activity.groups).toHaveLength(1);
        expect(activity.events).toHaveLength(1);
      });

      test("should clone activity", () => {
        const original = Activity.create({
          name: "TestActivity",
          interactions: [testInteraction]
        });
        const cloned = Activity.clone(original, false);

        expect(cloned).not.toBe(original);
        expect(cloned.uuid).not.toBe(original.uuid);
        expect(cloned.name).toBe(original.name);
        expect(cloned.interactions).toEqual(original.interactions);
      });
    });

    describe("ActivityGroup", () => {
      test("should create activity group instance", () => {
        const group = ActivityGroup.create({
          type: "sequential"
        });

        expect(group.type).toBe("sequential");
        expect(group.activities).toEqual([]);
        expect(group._type).toBe("ActivityGroup");
      });

      test("should create activity group with activities", () => {
        const activity1 = Activity.create({ name: "Activity1" });
        const activity2 = Activity.create({ name: "Activity2" });
        
        const group = ActivityGroup.create({
          type: "parallel",
          activities: [activity1, activity2]
        });

        expect(group.activities).toHaveLength(2);
        expect(group.activities![0]).toBe(activity1);
        expect(group.activities![1]).toBe(activity2);
      });
    });

    describe("Transfer", () => {
      test("should create transfer instance", () => {
        const transfer = Transfer.create({
          name: "flow1",
          source: testInteraction,
          target: testGateway
        });

        expect(transfer.name).toBe("flow1");
        expect(transfer.source).toBe(testInteraction);
        expect(transfer.target).toBe(testGateway);
        expect(transfer._type).toBe("Transfer");
      });

      test("should create transfer between activity groups", () => {
        const group1 = ActivityGroup.create({ type: "sequential" });
        const group2 = ActivityGroup.create({ type: "parallel" });
        
        const transfer = Transfer.create({
          name: "groupFlow",
          source: group1,
          target: group2
        });

        expect(transfer.source).toBe(group1);
        expect(transfer.target).toBe(group2);
      });

      test("should stringify and parse transfer", () => {
        const original = Transfer.create({
          name: "testFlow",
          source: testInteraction,
          target: testGateway
        });
        
        const stringified = Transfer.stringify(original);
        const parsed = Transfer.parse(stringified);

        expect(parsed.name).toBe("testFlow");
      });
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(DataAttributive.isKlass).toBe(true);
      expect(DataPolicy.isKlass).toBe(true);
      expect(Activity.isKlass).toBe(true);
      expect(ActivityGroup.isKlass).toBe(true);
      expect(Transfer.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(DataAttributive.displayName).toBe("DataAttributive");
      expect(DataPolicy.displayName).toBe("DataPolicy");
      expect(Activity.displayName).toBe("Activity");
      expect(ActivityGroup.displayName).toBe("ActivityGroup");
      expect(Transfer.displayName).toBe("Transfer");
    });

    test("should track instances", () => {
      const da1 = DataAttributive.create({ content: () => 1 });
      const dp1 = DataPolicy.create({ match: { key: "status", value: ["=", "active"] } });
      const a1 = Activity.create({ name: "A1" });
      const ag1 = ActivityGroup.create({ type: "seq" });
      const t1 = Transfer.create({ name: "t1", source: testInteraction, target: testGateway });

      expect(DataAttributive.instances).toHaveLength(1);
      expect(DataPolicy.instances).toHaveLength(1);
      expect(Activity.instances).toHaveLength(1);
      expect(ActivityGroup.instances).toHaveLength(1);
      expect(Transfer.instances).toHaveLength(1);
    });

    test("should use is() for type checking", () => {
      const dataAttr = DataAttributive.create({ content: () => 1 });
      const dataPolicy = DataPolicy.create({ match: { key: "status", value: ["=", "active"] } });
      const activity = Activity.create({ name: "A" });
      
      expect(DataAttributive.is(dataAttr)).toBe(true);
      expect(DataAttributive.is(dataPolicy)).toBe(false);
      expect(DataPolicy.is(dataPolicy)).toBe(true);
      expect(DataPolicy.is(activity)).toBe(false);
      expect(Activity.is(activity)).toBe(true);
      expect(Activity.is(dataAttr)).toBe(false);
    });

    test("should prevent duplicate UUIDs", () => {
      const uuid = "test-uuid-data-activity";
      const activity1 = Activity.create({ name: "A1" }, { uuid });
      
      expect(() => {
        Activity.create({ name: "A2" }, { uuid });
      }).toThrow("duplicate uuid");
    });
  });
}); 