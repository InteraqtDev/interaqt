import { describe, test, expect, beforeEach } from "vitest";
import { Action, GetAction } from "@core";

describe("Action Refactored - compatibility test", () => {
  beforeEach(() => {
    // 清空实例列表，避免测试间的干扰
    Action.instances.length = 0;
  });

  test("should create action instance", () => {
    const action = Action.create({ name: "createUser" });

    expect(action.name).toBe("createUser");
    expect(action.uuid).toBeDefined();
    expect(action._type).toBe("Action");
  });

  test("should track instances", () => {
    const action1 = Action.create({ name: "action1" });
    const action2 = Action.create({ name: "action2" });

    expect(Action.instances).toHaveLength(2);
    expect(Action.instances).toContain(action1);
    expect(Action.instances).toContain(action2);
  });

  test("should stringify action", () => {
    const action = Action.create({ name: "testAction" });
    const stringified = Action.stringify(action);

    expect(stringified).toContain('"type":"Action"');
    expect(stringified).toContain('"name":"testAction"');
    expect(stringified).toContain(`"uuid":"${action.uuid}"`);
  });

  test("should parse stringified action", () => {
    const original = Action.create({ name: "parseTest" });
    const stringified = Action.stringify(original);
    const parsed = Action.parse(stringified);

    expect(parsed.name).toBe("parseTest");
    expect(parsed._type).toBe("Action");
    expect(parsed.uuid).toBeDefined();
  });

  test("should clone action", () => {
    const original = Action.create({ name: "cloneTest" });
    const cloned = Action.clone(original, false);

    expect(cloned).not.toBe(original);
    expect(cloned.uuid).not.toBe(original.uuid);
    expect(cloned.name).toBe(original.name);
  });

  test("should check if object is action instance", () => {
    const action = Action.create({ name: "test" });
    const notAction = { name: "test", uuid: "123" };

    expect(Action.is(action)).toBe(true);
    expect(Action.is(notAction)).toBe(false);
  });

  test("should prevent duplicate UUIDs", () => {
    const uuid = "test-uuid-123";
    Action.create({ name: "first" }, { uuid });

    expect(() => {
      Action.create({ name: "second" }, { uuid });
    }).toThrow("duplicate uuid");
  });

  test("should have GetAction predefined", () => {
    expect(GetAction.name).toBe("get");
    expect(GetAction._type).toBe("Action");
  });

  test("should have isKlass marker", () => {
    expect(Action.isKlass).toBe(true);
  });

  test("should have displayName", () => {
    expect(Action.displayName).toBe("Action");
  });

  test("should have public property definition", () => {
    expect(Action.public.name.type).toBe("string");
    expect(Action.public.name.required).toBe(true);
  });
}); 