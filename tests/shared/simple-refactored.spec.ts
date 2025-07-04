import { describe, test, expect, beforeEach } from "vitest";
import { Gateway } from "../../src/shared/refactored/Gateway";
import { Event } from "../../src/shared/refactored/Event";
import { Dictionary } from "../../src/shared/refactored/RealDictionary";
import { StateNode } from "../../src/shared/refactored/StateNode";
import { StateTransfer } from "../../src/shared/refactored/StateTransfer";
import { StateMachine } from "../../src/shared/refactored/StateMachine";
import { clearAllInstances } from "../../src/shared/refactored/utils";

describe("Simple Objects Refactored - compatibility test", () => {
  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(Gateway, Event, Dictionary, StateNode, StateTransfer, StateMachine);
  });

  describe("Gateway", () => {
    test("should create gateway instance", () => {
      const gateway = Gateway.create({ name: "DecisionPoint" });

      expect(gateway.name).toBe("DecisionPoint");
      expect(gateway.uuid).toBeDefined();
      expect(gateway._type).toBe("Gateway");
    });

    test("should stringify and parse gateway", () => {
      const original = Gateway.create({ name: "TestGateway" });
      const stringified = Gateway.stringify(original);
      const parsed = Gateway.parse(stringified);

      expect(parsed.name).toBe("TestGateway");
      expect(parsed._type).toBe("Gateway");
    });

    test("should clone gateway", () => {
      const original = Gateway.create({ name: "CloneGateway" });
      const cloned = Gateway.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
    });
  });

  describe("Event", () => {
    test("should create event instance", () => {
      const event = Event.create({ name: "UserCreated" });

      expect(event.name).toBe("UserCreated");
      expect(event.uuid).toBeDefined();
      expect(event._type).toBe("Event");
    });

    test("should stringify and parse event", () => {
      const original = Event.create({ name: "TestEvent" });
      const stringified = Event.stringify(original);
      const parsed = Event.parse(stringified);

      expect(parsed.name).toBe("TestEvent");
      expect(parsed._type).toBe("Event");
    });

    test("should clone event", () => {
      const original = Event.create({ name: "CloneEvent" });
      const cloned = Event.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
    });
  });

  describe("Dictionary", () => {
    test("should create dictionary instance", () => {
      const dict = Dictionary.create({
        name: "AppConfig",
        type: "string"
      });

      expect(dict.name).toBe("AppConfig");
      expect(dict.type).toBe("string");
      expect(dict.uuid).toBeDefined();
      expect(dict._type).toBe("Dictionary");
      expect(dict.collection).toBe(false); // default value
    });

    test("should create dictionary with all properties", () => {
      const dict = Dictionary.create({
        name: "UserSettings",
        type: "string",
        collection: true,
        args: { maxItems: 10 },
        defaultValue: () => "default"
      });

      expect(dict.name).toBe("UserSettings");
      expect(dict.type).toBe("string");
      expect(dict.collection).toBe(true);
      expect(dict.args).toEqual({ maxItems: 10 });
      expect(dict.defaultValue).toBeDefined();
    });

    test("should stringify and parse dictionary", () => {
      const original = Dictionary.create({
        name: "TestDict",
        type: "string",
        collection: false
      });
      const stringified = Dictionary.stringify(original);
      const parsed = Dictionary.parse(stringified);

      expect(parsed.name).toBe("TestDict");
      expect(parsed.type).toBe("string");
      expect(parsed.collection).toBe(false);
      expect(parsed._type).toBe("Dictionary");
    });

    test("should clone dictionary", () => {
      const original = Dictionary.create({
        name: "CloneDict",
        type: "number",
        defaultValue: () => 42
      });
      const cloned = Dictionary.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.type).toBe(original.type);
      expect(cloned.defaultValue).toBeDefined();
    });
  });

  describe("StateNode", () => {
    test("should create StateNode instance", () => {
      const node = StateNode.create({ name: "idle" });
      
      expect(node.name).toBe("idle");
      expect(node.uuid).toBeDefined();
      expect(node._type).toBe("StateNode");
    });

    test("should create StateNode with computeValue", () => {
      const node = StateNode.create({ 
        name: "processing",
        computeValue: () => Date.now()
      });
      
      expect(node.name).toBe("processing");
      expect(node.computeValue).toBeDefined();
      expect(typeof node.computeValue!()).toBe("number");
    });
  });

  describe("StateTransfer", () => {
    test("should create StateTransfer instance", () => {
      const idle = StateNode.create({ name: "idle" });
      const active = StateNode.create({ name: "active" });
      
      const transfer = StateTransfer.create({
        trigger: { event: "start" },
        current: idle,
        next: active
      });
      
      expect(transfer.trigger).toEqual({ event: "start" });
      expect(transfer.current).toBe(idle);
      expect(transfer.next).toBe(active);
      expect(transfer._type).toBe("StateTransfer");
    });

    test("should create StateTransfer with computeTarget", () => {
      const idle = StateNode.create({ name: "idle" });
      const active = StateNode.create({ name: "active" });
      
      const transfer = StateTransfer.create({
        trigger: { event: "start" },
        current: idle,
        next: active,
        computeTarget: () => "computed"
      });
      
      expect(transfer.computeTarget).toBeDefined();
      expect(transfer.computeTarget!()).toBe("computed");
    });
  });

  describe("StateMachine", () => {
    test("should create StateMachine instance", () => {
      const idle = StateNode.create({ name: "idle" });
      const active = StateNode.create({ name: "active" });
      const transfer = StateTransfer.create({
        trigger: { event: "start" },
        current: idle,
        next: active
      });
      
      const machine = StateMachine.create({
        states: [idle, active],
        transfers: [transfer],
        defaultState: idle
      });
      
      expect(machine.states).toHaveLength(2);
      expect(machine.transfers).toHaveLength(1);
      expect(machine.defaultState).toBe(idle);
      expect(machine._type).toBe("StateMachine");
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(Gateway.isKlass).toBe(true);
      expect(Event.isKlass).toBe(true);
      expect(Dictionary.isKlass).toBe(true);
      expect(StateNode.isKlass).toBe(true);
      expect(StateTransfer.isKlass).toBe(true);
      expect(StateMachine.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(Gateway.displayName).toBe("Gateway");
      expect(Event.displayName).toBe("Event");
      expect(Dictionary.displayName).toBe("Dictionary");
      expect(StateNode.displayName).toBe("StateNode");
      expect(StateTransfer.displayName).toBe("StateTransfer");
      expect(StateMachine.displayName).toBe("StateMachine");
    });

    test("should track instances", () => {
      const g1 = Gateway.create({ name: "g1" });
      const g2 = Gateway.create({ name: "g2" });
      const e1 = Event.create({ name: "e1" });
      const d1 = Dictionary.create({ name: "d1", type: "string" });
      const n1 = StateNode.create({ name: "n1" });
      const n2 = StateNode.create({ name: "n2" });
      const t1 = StateTransfer.create({ 
        trigger: { event: "test" }, 
        current: n1, 
        next: n2 
      });
      const m1 = StateMachine.create({ 
        states: [n1, n2], 
        transfers: [t1], 
        defaultState: n1 
      });

      expect(Gateway.instances).toHaveLength(2);
      expect(Event.instances).toHaveLength(1);
      expect(Dictionary.instances).toHaveLength(1);
      expect(StateNode.instances).toHaveLength(2);
      expect(StateTransfer.instances).toHaveLength(1);
      expect(StateMachine.instances).toHaveLength(1);
    });
  });
}); 