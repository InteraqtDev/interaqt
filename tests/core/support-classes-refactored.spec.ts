import { describe, test, expect, beforeEach } from "vitest";
import {
  Condition, SideEffect, PayloadItem, Payload, Entity, clearAllInstances
} from "@core";

describe("Support Classes Refactored", () => {
  let userEntity: any;

  beforeEach(() => {
    // 清空实例列表
    clearAllInstances(Condition, SideEffect, PayloadItem, Payload, Entity);
    
    // 创建测试用的实体
    userEntity = Entity.create({ name: "User" });
  });

  describe("Condition", () => {
    test("should create condition instance", () => {
      const condition = Condition.create({
        content: (data: any) => data.age >= 18
      });

      expect(condition.content).toBeDefined();
      expect(condition.uuid).toBeDefined();
      expect(condition._type).toBe("Condition");
    });

    test("should create condition with name", () => {
      const condition = Condition.create({
        content: (data: any) => data.status === "active",
        name: "IsActiveUser"
      });

      expect(condition.name).toBe("IsActiveUser");
      expect(condition.content).toBeDefined();
    });

    test("should stringify and parse condition", () => {
      const original = Condition.create({
        content: () => true,
        name: "AlwaysTrue"
      });
      
      const stringified = Condition.stringify(original);
      const parsed = Condition.parse(stringified);

      expect(parsed.name).toBe("AlwaysTrue");
      expect(parsed.content).toBeDefined();
      expect(typeof parsed.content).toBe("function");
    });

    test("should clone condition", () => {
      const original = Condition.create({
        content: (x: any) => x > 10,
        name: "GreaterThanTen"
      });
      const cloned = Condition.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.content).toBeDefined();
    });
  });

  describe("SideEffect", () => {
    test("should create side effect instance", () => {
      const sideEffect = SideEffect.create({
        name: "SendEmail",
        handle: async (data: any) => {
          console.log("Sending email to", data.email);
        }
      });

      expect(sideEffect.name).toBe("SendEmail");
      expect(sideEffect.handle).toBeDefined();
      expect(sideEffect._type).toBe("SideEffect");
    });

    test("should stringify and parse side effect", () => {
      const original = SideEffect.create({
        name: "LogActivity",
        handle: (data: any) => console.log(data)
      });
      
      const stringified = SideEffect.stringify(original);
      const parsed = SideEffect.parse(stringified);

      expect(parsed.name).toBe("LogActivity");
      expect(parsed.handle).toBeDefined();
      expect(typeof parsed.handle).toBe("function");
    });

    test("should clone side effect", () => {
      const original = SideEffect.create({
        name: "NotifyUser",
        handle: () => {}
      });
      const cloned = SideEffect.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.handle).toBeDefined();
    });
  });

  describe("PayloadItem", () => {
    test("should create payload item instance", () => {
      const item = PayloadItem.create({
        name: "username",
        type: 'string'
      });

      expect(item.name).toBe("username");
      expect(item.uuid).toBeDefined();
      expect(item._type).toBe("PayloadItem");
      expect(item.isRef).toBe(false);
      expect(item.required).toBe(false);
      expect(item.isCollection).toBe(false);
    });

    test("should create payload item with all options", () => {
      const item = PayloadItem.create({
        name: "user",
        type: 'Entity',
        base: userEntity,
        isRef: true,
        required: true,
        isCollection: false
      });

      expect(item.name).toBe("user");
      expect(item.base).toBe(userEntity);
      expect(item.isRef).toBe(true);
      expect(item.required).toBe(true);
      expect(item.isCollection).toBe(false);
    });

    test("should stringify and parse payload item", () => {
      const original = PayloadItem.create({
        name: "email",
        type: 'string',
        required: true
      });
      
      const stringified = PayloadItem.stringify(original);
      const parsed = PayloadItem.parse(stringified);

      expect(parsed.name).toBe("email");
      expect(parsed.required).toBe(true);
      expect(parsed._type).toBe("PayloadItem");
    });

    test("should clone payload item", () => {
      const original = PayloadItem.create({
        name: "tags",
        type: 'Entity',
        isCollection: true,
        base: userEntity
      });
      const cloned = PayloadItem.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.name).toBe(original.name);
      expect(cloned.isCollection).toBe(true);
      expect(cloned.base).toBe(userEntity);
    });
  });

  describe("Payload", () => {
    test("should create payload instance", () => {
      const payload = Payload.create({});

      expect(payload.items).toEqual([]);
      expect(payload.uuid).toBeDefined();
      expect(payload._type).toBe("Payload");
    });

    test("should create payload with items", () => {
      const usernameItem = PayloadItem.create({ name: "username", type: 'string', required: true });
      const emailItem = PayloadItem.create({ name: "email", type: 'string', required: true });
      
      const payload = Payload.create({
        items: [usernameItem, emailItem]
      });

      expect(payload.items).toHaveLength(2);
      expect(payload.items[0]).toBe(usernameItem);
      expect(payload.items[1]).toBe(emailItem);
    });

    test("should stringify and parse payload", () => {
      const item = PayloadItem.create({ name: "testItem", type: 'string' });
      const original = Payload.create({
        items: [item]
      });
      
      const stringified = Payload.stringify(original);
      const parsed = Payload.parse(stringified);

      expect(parsed.items).toHaveLength(1);
      expect(parsed._type).toBe("Payload");
    });

    test("should clone payload", () => {
      const item1 = PayloadItem.create({ name: "item1", type: 'string' });
      const item2 = PayloadItem.create({ name: "item2", type: 'string' });
      const original = Payload.create({
        items: [item1, item2]
      });
      const cloned = Payload.clone(original, false);

      expect(cloned).not.toBe(original);
      expect(cloned.uuid).not.toBe(original.uuid);
      expect(cloned.items).toHaveLength(2);
      expect(cloned.items).toEqual(original.items);
    });
  });

  describe("Common functionality", () => {
    test("should have isKlass marker", () => {
      expect(Condition.isKlass).toBe(true);
      expect(SideEffect.isKlass).toBe(true);
      expect(PayloadItem.isKlass).toBe(true);
      expect(Payload.isKlass).toBe(true);
    });

    test("should have displayName", () => {
      expect(Condition.displayName).toBe("Condition");
      expect(SideEffect.displayName).toBe("SideEffect");
      expect(PayloadItem.displayName).toBe("PayloadItem");
      expect(Payload.displayName).toBe("Payload");
    });

    test("should track instances", () => {
      const c1 = Condition.create({ content: () => true });
      const c2 = Condition.create({ content: () => false });
      const s1 = SideEffect.create({ name: "test", handle: () => {} });
      const pi1 = PayloadItem.create({ name: "item1", type: 'string' });
      const pi2 = PayloadItem.create({ name: "item2", type: 'string' });
      const p1 = Payload.create({ items: [pi1, pi2] });

      expect(Condition.instances).toHaveLength(2);
      expect(SideEffect.instances).toHaveLength(1);
      expect(PayloadItem.instances).toHaveLength(2);
      expect(Payload.instances).toHaveLength(1);
    });

    test("should use is() for type checking", () => {
      const condition = Condition.create({ content: () => true });
      const sideEffect = SideEffect.create({ name: "test", handle: () => {} });
      
      expect(Condition.is(condition)).toBe(true);
      expect(Condition.is(sideEffect)).toBe(false);
      expect(SideEffect.is(sideEffect)).toBe(true);
      expect(SideEffect.is(condition)).toBe(false);
    });

    test("should prevent duplicate UUIDs", () => {
      const uuid = "test-uuid-456";
      const condition1 = Condition.create({ content: () => true }, { uuid });
      
      expect(() => {
        Condition.create({ content: () => false }, { uuid });
      }).toThrow("duplicate uuid");
    });
  });
}); 