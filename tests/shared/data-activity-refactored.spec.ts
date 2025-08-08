import { describe, test, expect, beforeEach } from "vitest";
import { DataAttributive, QueryItem, Query } from "../../src/shared/Data";
import { Activity, ActivityGroup, Transfer } from "../../src/shared/Activity";
import { Interaction } from "../../src/shared/Interaction";
import { Gateway } from "../../src/shared/Gateway";
import { Event } from "../../src/shared/Event";
import { Action } from "../../src/shared/Action";
import { clearAllInstances } from "../../src/shared/utils";

describe("Data and Activity Classes Refactored", () => {
  let testInteraction: any;
  let testGateway: any;
  let testEvent: any;

  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(
      DataAttributive, QueryItem, Query,
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

    describe("QueryItem", () => {
      test("should create query item instance", () => {
        const item = QueryItem.create({
          name: "status",
          value: "active"
        });

        expect(item.name).toBe("status");
        expect(item.value).toBe("active");
        expect(item._type).toBe("QueryItem");
      });

      test("should stringify and parse query item", () => {
        const original = QueryItem.create({
          name: "filter",
          value: "type:user"
        });
        
        const stringified = QueryItem.stringify(original);
        const parsed = QueryItem.parse(stringified);

        expect(parsed.name).toBe("filter");
        expect(parsed.value).toBe("type:user");
      });

      test("should clone query item", () => {
        const original = QueryItem.create({
          name: "sort",
          value: "createdAt:desc"
        });
        const cloned = QueryItem.clone(original, false);

        expect(cloned).not.toBe(original);
        expect(cloned.uuid).not.toBe(original.uuid);
        expect(cloned.name).toBe(original.name);
        expect(cloned.value).toBe(original.value);
      });
    });

    describe("Query", () => {
      test("should create query instance", () => {
        const item1 = QueryItem.create({ name: "key1", value: "value1" });
        const item2 = QueryItem.create({ name: "key2", value: "value2" });
        
        const query = Query.create({
          items: [item1, item2]
        });

        expect(query.items).toHaveLength(2);
        expect(query.items[0]).toBe(item1);
        expect(query.items[1]).toBe(item2);
        expect(query._type).toBe("Query");
      });

      test("should stringify and parse query", () => {
        const item = QueryItem.create({ name: "test", value: "value" });
        const original = Query.create({
          items: [item]
        });
        
        const stringified = Query.stringify(original);
        const parsed = Query.parse(stringified);

        expect(parsed.items).toHaveLength(1);
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
      expect(QueryItem.isKlass).toBe(true);
      expect(Query.isKlass).toBe(true);
      expect(Activity.isKlass).toBe(true);
      expect(ActivityGroup.isKlass).toBe(true);
      expect(Transfer.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(DataAttributive.displayName).toBe("DataAttributive");
      expect(QueryItem.displayName).toBe("QueryItem");
      expect(Query.displayName).toBe("Query");
      expect(Activity.displayName).toBe("Activity");
      expect(ActivityGroup.displayName).toBe("ActivityGroup");
      expect(Transfer.displayName).toBe("Transfer");
    });

    test("should track instances", () => {
      const da1 = DataAttributive.create({ content: () => 1 });
      const qi1 = QueryItem.create({ name: "a", value: "b" });
      const q1 = Query.create({ items: [qi1] });
      const a1 = Activity.create({ name: "A1" });
      const ag1 = ActivityGroup.create({ type: "seq" });
      const t1 = Transfer.create({ name: "t1", source: testInteraction, target: testGateway });

      expect(DataAttributive.instances).toHaveLength(1);
      expect(QueryItem.instances).toHaveLength(1);
      expect(Query.instances).toHaveLength(1);
      expect(Activity.instances).toHaveLength(1);
      expect(ActivityGroup.instances).toHaveLength(1);
      expect(Transfer.instances).toHaveLength(1);
    });

    test("should use is() for type checking", () => {
      const dataAttr = DataAttributive.create({ content: () => 1 });
      const queryItem = QueryItem.create({ name: "a", value: "b" });
      const activity = Activity.create({ name: "A" });
      
      expect(DataAttributive.is(dataAttr)).toBe(true);
      expect(DataAttributive.is(queryItem)).toBe(false);
      expect(QueryItem.is(queryItem)).toBe(true);
      expect(QueryItem.is(activity)).toBe(false);
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