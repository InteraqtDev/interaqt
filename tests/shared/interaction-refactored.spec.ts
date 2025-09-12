import { describe, test, expect, beforeEach } from "vitest";
import {
  Action, Interaction, Activity, ActivityGroup, Transfer,
  Condition, PayloadItem, Payload, SideEffect, Query, QueryItem,
  Gateway, Event, Property, Entity,
  forEachInteraction, getInteractions,
  clearAllInstances
} from "../../src/shared";

describe("Interaction System Refactored - compatibility test", () => {
  beforeEach(() => {
    // Clear all instances
    clearAllInstances(
      Action, Interaction, Activity, ActivityGroup, Transfer,
      Condition, PayloadItem, Payload, SideEffect, Query, QueryItem,
      Gateway, Event, Property, Entity
    );
  });

  describe("Action", () => {
    test("should create action instance", () => {
      const action = Action.create({ name: "create" });
      
      expect(action.name).toBe("create");
      expect(action.uuid).toBeDefined();
      expect(action._type).toBe("Action");
    });
  });

  describe("PayloadItem", () => {
    test("should create payload item", () => {
      const entity = Entity.create({ name: "User" });
      const item = PayloadItem.create({
        name: "user",
        type: 'Entity',
        base: entity,
        isRef: true,
        required: true
      });
      
      expect(item.name).toBe("user");
      expect(item.base).toBe(entity);
      expect(item.isRef).toBe(true);
      expect(item.required).toBe(true);
      expect(item.isCollection).toBe(false);
    });
  });

  describe("Payload", () => {
    test("should create payload with items", () => {
      const item1 = PayloadItem.create({ name: "title", type: 'string' });
      const item2 = PayloadItem.create({ name: "content", type: 'string' });
      
      const payload = Payload.create({
        items: [item1, item2]
      });
      
      expect(payload.items).toHaveLength(2);
      expect(payload.items[0].name).toBe("title");
      expect(payload.items[1].name).toBe("content");
    });
  });

  describe("SideEffect", () => {
    test("should create side effect", () => {
      const effect = SideEffect.create({
        name: "sendEmail",
        handle: () => console.log("Email sent")
      });
      
      expect(effect.name).toBe("sendEmail");
      expect(effect.handle).toBeDefined();
      expect(typeof effect.handle).toBe("function");
    });
  });

  describe("Query", () => {
    test("should create query with items", () => {
      const item1 = QueryItem.create({ name: "status", value: "active" });
      const item2 = QueryItem.create({ name: "type", value: "admin" });
      
      const query = Query.create({
        items: [item1, item2]
      });
      
      expect(query.items).toHaveLength(2);
      expect(query.items[0].name).toBe("status");
      expect(query.items[0].value).toBe("active");
    });
  });

  describe("Interaction", () => {
    test("should create basic interaction", () => {
      const action = Action.create({ name: "create" });
      
      const interaction = Interaction.create({
        name: "CreatePost",
        action: action
      });
      
      expect(interaction.name).toBe("CreatePost");
      expect(interaction.action).toBe(action);
      expect(interaction.sideEffects).toEqual([]);
      expect(interaction._type).toBe("Interaction");
    });

    test("should create complex interaction", () => {
      const action = Action.create({ name: "update" });
      const condition = Condition.create({
        name: "isOwner",
        content: () => true
      });
      const payload = Payload.create({
        items: [PayloadItem.create({ name: "data", type: 'string' })]
      });
      const sideEffect = SideEffect.create({
        name: "log",
        handle: () => {}
      });
      
      const interaction = Interaction.create({
        name: "UpdatePost",
        action: action,
        conditions: condition,
        payload: payload,
        sideEffects: [sideEffect]
      });
      
      expect(interaction.name).toBe("UpdatePost");
      expect(interaction.conditions).toBe(condition);
      expect(interaction.payload).toBe(payload);
      expect(interaction.sideEffects).toHaveLength(1);
    });
  });

  describe("Transfer", () => {
    test("should create transfer between interactions", () => {
      const action1 = Action.create({ name: "start" });
      const action2 = Action.create({ name: "end" });
      const interaction1 = Interaction.create({ name: "Start", action: action1 });
      const interaction2 = Interaction.create({ name: "End", action: action2 });
      
      const transfer = Transfer.create({
        name: "StartToEnd",
        source: interaction1,
        target: interaction2
      });
      
      expect(transfer.name).toBe("StartToEnd");
      expect(transfer.source).toBe(interaction1);
      expect(transfer.target).toBe(interaction2);
    });

    test("should create transfer with gateway", () => {
      const gateway = Gateway.create({ name: "Decision" });
      const interaction = Interaction.create({ 
        name: "Process", 
        action: Action.create({ name: "process" })
      });
      
      const transfer = Transfer.create({
        name: "GatewayToProcess",
        source: gateway,
        target: interaction
      });
      
      expect(transfer.source).toBe(gateway);
      expect(transfer.target).toBe(interaction);
    });
  });

  describe("ActivityGroup", () => {
    test("should create activity group", () => {
      const activity1 = Activity.create({ name: "SubFlow1" });
      const activity2 = Activity.create({ name: "SubFlow2" });
      
      const group = ActivityGroup.create({
        type: "parallel",
        activities: [activity1, activity2]
      });
      
      expect(group.type).toBe("parallel");
      expect(group.activities).toHaveLength(2);
    });
  });

  describe("Activity", () => {
    test("should create basic activity", () => {
      const activity = Activity.create({
        name: "UserRegistration"
      });
      
      expect(activity.name).toBe("UserRegistration");
      expect(activity.interactions).toEqual([]);
      expect(activity.transfers).toEqual([]);
      expect(activity.groups).toEqual([]);
      expect(activity.gateways).toEqual([]);
      expect(activity.events).toEqual([]);
    });

    test("should create complex activity", () => {
      const interaction1 = Interaction.create({
        name: "Submit",
        action: Action.create({ name: "submit" })
      });
      const interaction2 = Interaction.create({
        name: "Approve",
        action: Action.create({ name: "approve" })
      });
      const gateway = Gateway.create({ name: "Check" });
      const transfer = Transfer.create({
        name: "SubmitToCheck",
        source: interaction1,
        target: gateway
      });
      const event = Event.create({ name: "Completed" });
      
      const activity = Activity.create({
        name: "ApprovalFlow",
        interactions: [interaction1, interaction2],
        gateways: [gateway],
        transfers: [transfer],
        events: [event]
      });
      
      expect(activity.interactions).toHaveLength(2);
      expect(activity.gateways).toHaveLength(1);
      expect(activity.transfers).toHaveLength(1);
      expect(activity.events).toHaveLength(1);
    });
  });

  describe("Helper functions", () => {
    test("should iterate through all interactions", () => {
      const interaction1 = Interaction.create({
        name: "I1",
        action: Action.create({ name: "a1" })
      });
      const interaction2 = Interaction.create({
        name: "I2",
        action: Action.create({ name: "a2" })
      });
      const subActivity = Activity.create({
        name: "SubActivity",
        interactions: [interaction2]
      });
      const group = ActivityGroup.create({
        type: "sequence",
        activities: [subActivity]
      });
      const activity = Activity.create({
        name: "MainActivity",
        interactions: [interaction1],
        groups: [group]
      });
      
      const collectedInteractions: string[] = [];
      forEachInteraction(activity, (i) => {
        collectedInteractions.push(i.name);
      });
      
      expect(collectedInteractions).toEqual(["I1", "I2"]);
    });

    test("should get all interactions", () => {
      const interaction1 = Interaction.create({
        name: "First",
        action: Action.create({ name: "first" })
      });
      const interaction2 = Interaction.create({
        name: "Second",
        action: Action.create({ name: "second" })
      });
      const activity = Activity.create({
        name: "TestActivity",
        interactions: [interaction1, interaction2]
      });
      
      const interactions = getInteractions(activity);
      
      expect(interactions).toHaveLength(2);
      expect(interactions[0].name).toBe("First");
      expect(interactions[1].name).toBe("Second");
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(Action.isKlass).toBe(true);
      expect(Interaction.isKlass).toBe(true);
      expect(Activity.isKlass).toBe(true);
      expect(ActivityGroup.isKlass).toBe(true);
      expect(Transfer.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(Action.displayName).toBe("Action");
      expect(Interaction.displayName).toBe("Interaction");
      expect(Activity.displayName).toBe("Activity");
      expect(ActivityGroup.displayName).toBe("ActivityGroup");
      expect(Transfer.displayName).toBe("Transfer");
    });
  });
}); 