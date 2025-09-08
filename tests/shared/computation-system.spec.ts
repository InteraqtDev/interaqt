import { describe, test, expect } from "vitest";
import { 
  StateNode, StateTransfer, StateMachine,
  Count, Summation, Average, Every, Any,
  WeightedSummation, Transform, RealTime,
  Entity, Relation, Interaction, Action 
} from "@shared";

describe("Computation System - createClass functionality", () => {
  describe("StateMachine", () => {
    test("should create state node", () => {
      const node = StateNode.create({
        name: "pending"
      });

      expect(node.name).toBe("pending");
      expect(node.uuid).toBeDefined();
      expect(node._type).toBe("StateNode");
    });

    test("should create state node with computeValue", () => {
      const node = StateNode.create({
        name: "dynamic",
        computeValue: () => new Date().toISOString()
      });

      expect(node.name).toBe("dynamic");
      expect(node.computeValue).toBeDefined();
    });

    test("should create state transfer", () => {
      const fromNode = StateNode.create({ name: "start" });
      const toNode = StateNode.create({ name: "end" });
      
      // Create a proper Interaction instance for trigger
      const completeInteraction = Interaction.create({
        name: "complete",
        action: Action.create({ name: "complete" })
      });

      const transfer = StateTransfer.create({
        trigger: {
          recordName: completeInteraction.name,
          type: 'create',
          record: {
            interactionName: completeInteraction.name
          }
        },
        current: fromNode,
        next: toNode
      });

      expect(transfer.trigger).toMatchObject({
        recordName: completeInteraction.name,
        type: 'create',
        record: {
          interactionName: completeInteraction.name
        }
      });
      expect(transfer.current).toBe(fromNode);
      expect(transfer.next).toBe(toNode);
      expect(transfer._type).toBe("StateTransfer");
    });

    test("should create state machine", () => {
      const pendingNode = StateNode.create({ name: "pending" });
      const activeNode = StateNode.create({ name: "active" });
      const doneNode = StateNode.create({ name: "done" });

      // Create proper Interaction instances
      const startInteraction = Interaction.create({
        name: "start",
        action: Action.create({ name: "start" })
      });

      const completeInteraction = Interaction.create({
        name: "complete",
        action: Action.create({ name: "complete" })
      });

      const startTransfer = StateTransfer.create({
        trigger: {
          recordName: startInteraction.name,
          type: 'create',
          record: {
            interactionName: startInteraction.name
          }
        },
        current: pendingNode,
        next: activeNode
      });

      const completeTransfer = StateTransfer.create({
        trigger: {
          recordName: completeInteraction.name,
          type: 'create',
          record: {
            interactionName: completeInteraction.name
          }
        },
        current: activeNode,
        next: doneNode
      });

      const machine = StateMachine.create({
        states: [pendingNode, activeNode, doneNode],
        transfers: [startTransfer, completeTransfer],
        defaultState: pendingNode
      });

      expect(machine.states).toHaveLength(3);
      expect(machine.transfers).toHaveLength(2);
      expect(machine.defaultState).toBe(pendingNode);
      expect(machine._type).toBe("StateMachine");
    });

    test("should stringify and parse state machine", () => {
      const node = StateNode.create({ name: "state1" });
      const stringified = StateNode.stringify(node);
      
      expect(stringified).toContain('"name":"state1"');
    });
  });

  describe("Count", () => {
    test("should create count computation", () => {
      const entity = Entity.create({ name: "Item", properties: [] });
      
      const count = Count.create({
        record: entity,
        callback: () => true
      });

      expect(count.record).toBe(entity);
      expect(count.callback).toBeDefined();
      expect(count._type).toBe("Count");
    });

    test("should clone count", () => {
      const entity = Entity.create({ name: "Product", properties: [] });
      const original = Count.create({
        record: entity,
        callback: (item: any) => item.status === "active"
      });

      const cloned = Count.clone(original, false);
      
      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.record).toBe(original.record); // Shallow clone
      expect(cloned.callback).toBeDefined();
    });
  });

  describe("Summation", () => {
    test("should create summation computation", () => {
      const entity = Entity.create({ name: "Order", properties: [] });
      
      const sum = Summation.create({
        record: entity,
        attributeQuery: [] // AttributeQueryData is an array
      });

      expect(sum.record).toBe(entity);
      expect(sum.attributeQuery).toBeDefined();
      expect(sum._type).toBe("Summation");
    });
  });

  describe("Average", () => {
    test("should create average computation", () => {
      const entity = Entity.create({ name: "Score", properties: [] });
      
      const avg = Average.create({
        record: entity,
        attributeQuery: [] // AttributeQueryData is an array
      });

      expect(avg.record).toBe(entity);
      expect(avg.attributeQuery).toBeDefined();
      expect(avg._type).toBe("Average");
    });
  });

  describe("Every", () => {
    test("should create every computation", () => {
      const entity = Entity.create({ name: "Task", properties: [] });
      
      const every = Every.create({
        record: entity,
        callback: (task: any) => task.completed === true
      });

      expect(every.record).toBe(entity);
      expect(every.callback).toBeDefined();
      expect(every._type).toBe("Every");
    });
  });

  describe("Any", () => {
    test("should create any computation", () => {
      const entity = Entity.create({ name: "Alert", properties: [] });
      
      const any = Any.create({
        record: entity,
        callback: (alert: any) => alert.active === true
      });

      expect(any.record).toBe(entity);
      expect(any.callback).toBeDefined();
      expect(any._type).toBe("Any");
    });
  });

  describe("WeightedSummation", () => {
    test("should create weighted summation with entities", () => {
      const entity = Entity.create({ name: "Product", properties: [] });
      
      const weighted = WeightedSummation.create({
        record: entity,
        callback: (item: any) => item.score * item.weight
      });

      expect(weighted.record).toBe(entity);
      expect(weighted.callback).toBeDefined();
      expect(weighted._type).toBe("WeightedSummation");
    });
  });

  describe("Transform", () => {
    test("should create transform computation", () => {
      const entity = Entity.create({ name: "Source", properties: [] });
      
      const transform = Transform.create({
        record: entity,
        callback: () => ({ transformed: true })
      });

      expect(transform.record).toBe(entity);
      expect(transform.callback).toBeDefined();
      expect(transform._type).toBe("Transform");
    });

    test("should stringify transform with function", () => {
      const entity = Entity.create({ name: "Data", properties: [] });
      const transform = Transform.create({
        record: entity,
        callback: (data: any) => data.value * 2
      });

      const stringified = Transform.stringify(transform);
      expect(stringified).toContain('"callback":"func::');
      expect(stringified).toContain('(data)');
    });
  });

  describe("RealTime", () => {
    test("should create realtime computation", () => {
      const realtime = RealTime.create({
        callback: () => ({ type: "sensor" })
      });

      expect(realtime.callback).toBeDefined();
      expect(realtime._type).toBe("RealTimeValue");
    });

    test("should handle with nextRecomputeTime", () => {
      const realtime = RealTime.create({
        callback: () => new Date().getTime(),
        nextRecomputeTime: () => Date.now() + 1000
      });

      expect(realtime.callback).toBeDefined();
      expect(realtime.nextRecomputeTime).toBeDefined();
    });
  });

  describe("Complex scenarios", () => {
    test("should handle computation with callback", () => {
      const userEntity = Entity.create({ name: "User", properties: [] });
      
      const count = Count.create({
        record: userEntity,
        callback: (user: any) => user.active === true
      });

      expect(count.record?.name).toBe("User");
      expect(count.callback).toBeDefined();
    });

    test("should deep clone computation with entities", () => {
      const entity = Entity.create({ name: "Item", properties: [] });
      const original = Count.create({
        record: entity,
        callback: () => true
      });

      const cloned = Count.clone(original, true);
      
      expect(cloned).not.toBe(original);
      expect(cloned.record).not.toBe(original.record); // Deep clone
      expect(cloned.record?.name).toBe(original.record?.name);
    });
  });
}); 