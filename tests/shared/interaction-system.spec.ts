import { describe, test, expect } from "vitest";
import { 
  Action, PayloadItem, Payload, SideEffect,
  Interaction, Gateway, Event, Activity, ActivityGroup, Transfer,
  Condition, Conditions, DataAttributive, DataAttributives,
  DataPolicy, Attributive, Attributives, Dictionary,
  BoolAtomData, BoolExpressionData
} from "@shared";

describe("Interaction System - createClass functionality", () => {
  describe("Action", () => {
    test("should create action instance", () => {
      const action = Action.create({
        name: "createUser"
      });

      expect(action.name).toBe("createUser");
      expect(action.uuid).toBeDefined();
      expect(action._type).toBe("Action");
    });
  });

  describe("Payload", () => {
    test("should create payload item", () => {
      const item = PayloadItem.create({
        name: "username",
        type: 'string',
        required: true
      });

      expect(item.name).toBe("username");
      expect(item.required).toBe(true);
      expect(item._type).toBe("PayloadItem");
    });

    test("should create payload with items", () => {
      const usernameItem = PayloadItem.create({
        name: "username",
        type: 'string',
        required: true
      });

      const emailItem = PayloadItem.create({
        name: "email",
        type: 'string',
        required: true
      });

      const payload = Payload.create({
        items: [usernameItem, emailItem]
      });

      expect(payload.items).toHaveLength(2);
      expect(payload.items[0].name).toBe("username");
      expect(payload.items[1].name).toBe("email");
      expect(payload._type).toBe("Payload");
    });
  });

  describe("SideEffect", () => {
    test("should create side effect", () => {
      const sideEffect = SideEffect.create({
        name: "sendEmail",
        handle: (data: any) => {
          console.log("Sending email to", data.email);
        }
      });

      expect(sideEffect.name).toBe("sendEmail");
      expect(sideEffect.handle).toBeDefined();
      expect(sideEffect._type).toBe("SideEffect");
    });
  });

  describe("Interaction", () => {
    test("should create interaction", () => {
      const action = Action.create({ name: "createPost" });
      const payload = Payload.create({ items: [] });

      const interaction = Interaction.create({
        name: "CreatePost",
        action: action,
        payload: payload
      });

      expect(interaction.name).toBe("CreatePost");
      expect(interaction.action).toBe(action);
      expect(interaction.payload).toBe(payload);
      expect(interaction._type).toBe("Interaction");
    });

    test("should clone interaction", () => {
      const action = Action.create({ name: "updateUser" });
      const original = Interaction.create({
        name: "UpdateUser",
        action: action
      });

      const cloned = Interaction.clone(original, false);
      
      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.action).toBe(original.action); // Shallow clone
    });
  });

  describe("Gateway", () => {
    test("should create gateway", () => {
      const gateway = Gateway.create({
        name: "DecisionPoint"
      });

      expect(gateway.name).toBe("DecisionPoint");
      expect(gateway._type).toBe("Gateway");
    });
  });

  describe("Event", () => {
    test("should create event", () => {
      const event = Event.create({
        name: "UserCreated"
      });

      expect(event.name).toBe("UserCreated");
      expect(event._type).toBe("Event");
    });
  });

  describe("Activity", () => {
    test("should create activity", () => {
      const interaction = Interaction.create({
        name: "ProcessOrder",
        action: Action.create({ name: "process" })
      });

      const activity = Activity.create({
        name: "OrderProcessing",
        interactions: [interaction]
      });

      expect(activity.name).toBe("OrderProcessing");
      expect(activity.interactions).toHaveLength(1);
      expect(activity.interactions[0].name).toBe("ProcessOrder");
      expect(activity._type).toBe("Activity");
    });
  });

  describe("ActivityGroup", () => {
    test("should create activity group", () => {
      const activity = Activity.create({
        name: "SubActivity",
        interactions: []
      });

      const group = ActivityGroup.create({
        type: "sequential",
        activities: [activity]
      });

      expect(group.type).toBe("sequential");
      expect(group.activities).toHaveLength(1);
      expect(group.activities![0].name).toBe("SubActivity");
      expect(group._type).toBe("ActivityGroup");
    });
  });

  describe("Transfer", () => {
    test("should create transfer between interactions", () => {
      const from = Interaction.create({
        name: "Start",
        action: Action.create({ name: "start" })
      });
      
      const to = Interaction.create({
        name: "End",
        action: Action.create({ name: "end" })
      });

      const transfer = Transfer.create({
        name: "StartToEnd",
        source: from,
        target: to
      });

      expect(transfer.name).toBe("StartToEnd");
      expect(transfer.source).toBe(from);
      expect(transfer.target).toBe(to);
      expect(transfer._type).toBe("Transfer");
    });
  });

  describe("Condition", () => {
    test("should create condition", () => {
      const condition = Condition.create({
        name: "isAdmin",
        content: (user: any) => user.role === "admin"
      });

      expect(condition.name).toBe("isAdmin");
      expect(condition.content).toBeDefined();
      expect(condition._type).toBe("Condition");
    });

    test("should create conditions collection", () => {
      const cond1 = Condition.create({
        name: "cond1",
        content: () => true
      });

      const atom1 = BoolAtomData.create({
        type: "atom",
        data: cond1 as any
      });

      const atom2 = BoolAtomData.create({
        type: "atom",
        data: cond1 as any
      });

      const conditions = Conditions.create({
        content: BoolExpressionData.create({
          operator: "and",
          left: atom1,
          right: atom2
        })
      });

      expect(conditions.content).toBeDefined();
      expect(conditions._type).toBe("Conditions");
    });
  });

  describe("DataAttributive", () => {
    test("should create data attributive", () => {
      const attr = DataAttributive.create({
        name: "userId",
        content: (ctx: any) => ctx.user.id
      });

      expect(attr.name).toBe("userId");
      expect(attr.content).toBeDefined();
      expect(attr._type).toBe("DataAttributive");
    });

    test("should create data attributives collection", () => {
      const attr1 = DataAttributive.create({
        name: "attr1",
        content: () => "value1"
      });

      const atom = BoolAtomData.create({
        type: "atom",
        data: attr1 as any
      });

      const attrs = DataAttributives.create({
        content: atom
      });

      expect(attrs.content).toBeDefined();
      expect(attrs._type).toBe("DataAttributives");
    });
  });

  describe("DataPolicy", () => {
    test("should create data policy with match", () => {
      const policy = DataPolicy.create({
        match: { key: "status", value: ["=", "active"] }
      });

      expect(policy.match).toEqual({ key: "status", value: ["=", "active"] });
      expect(policy._type).toBe("DataPolicy");
    });

    test("should create data policy with all properties", () => {
      const policy = DataPolicy.create({
        match: { key: "status", value: ["=", "published"] },
        modifier: { limit: 10, orderBy: { createdAt: "desc" } },
        attributeQuery: ["id", "title", "content"]
      });

      expect(policy.match).toBeDefined();
      expect(policy.modifier).toEqual({ limit: 10, orderBy: { createdAt: "desc" } });
      expect(policy.attributeQuery).toEqual(["id", "title", "content"]);
      expect(policy._type).toBe("DataPolicy");
    });
  });

  describe("Attributive", () => {
    test("should create attributive", () => {
      const attr = Attributive.create({
        name: "permission",
        content: () => "read"
      });

      expect(attr.name).toBe("permission");
      expect(attr.content).toBeDefined();
      expect(attr._type).toBe("Attributive");
    });

    test("should create attributives collection", () => {
      const attr1 = Attributive.create({
        name: "role",
        content: () => "admin"
      });

      const atom = BoolAtomData.create({
        type: "atom",
        data: attr1 as any
      });

      const attrs = Attributives.create({
        content: atom
      });

      expect(attrs.content).toBeDefined();
      expect(attrs._type).toBe("Attributives");
    });
  });

  describe("Dictionary", () => {
    test("should create dictionary", () => {
      const dict = Dictionary.create({
        name: "AppConfig",
        type: "object"
      });

      expect(dict.name).toBe("AppConfig");
      expect(dict.type).toBe("object");
      expect(dict._type).toBe("Dictionary");
    });
  });

  describe("BoolExpression", () => {
    test("should create bool atom", () => {
      const cond = Condition.create({
        name: "statusCheck",
        content: () => true
      });
      
      const atom = BoolAtomData.create({
        type: "atom",
        data: cond as any
      });

      expect(atom.data).toBe(cond);
      expect(atom._type).toBe("BoolAtomData");
    });

    test("should create bool expression", () => {
      const cond1 = Condition.create({
        name: "statusCheck",
        content: () => true
      });
      
      const left = BoolAtomData.create({
        type: "atom",
        data: cond1 as any
      });

      const cond2 = Condition.create({
        name: "roleCheck",
        content: () => true
      });
      
      const right = BoolAtomData.create({
        type: "atom",
        data: cond2 as any
      });

      const expr = BoolExpressionData.create({
        operator: "and",
        left: left,
        right: right
      });

      expect(expr.left).toBe(left);
      expect(expr.right).toBe(right);
      expect(expr.operator).toBe("and");
      expect(expr._type).toBe("BoolExpressionData");
    });
  });

  describe("Complex scenarios", () => {
    test("should create full interaction flow", () => {
      // Create a complete interaction with all components
      const action = Action.create({ name: "submitOrder" });
      
      const payloadItems = [
        PayloadItem.create({ name: "orderId", type: 'string', required: true }),
        PayloadItem.create({ name: "items", type: 'string', required: true })
      ];
      
      const payload = Payload.create({ items: payloadItems });
      
      const interaction = Interaction.create({
        name: "SubmitOrder",
        action: action,
        payload: payload,
      });

      expect(interaction.name).toBe("SubmitOrder");
      expect(interaction.action.name).toBe("submitOrder");
      expect(interaction.payload?.items).toHaveLength(2);
    });

    test("should stringify and parse complex structures", () => {
      const interaction = Interaction.create({
        name: "TestInteraction",
        action: Action.create({ name: "test" })
      });

      const stringified = Interaction.stringify(interaction);
      expect(stringified).toContain('"name":"TestInteraction"');
      expect(stringified).toContain('"type":"Interaction"'); // type not _type in stringified form
    });
  });
}); 