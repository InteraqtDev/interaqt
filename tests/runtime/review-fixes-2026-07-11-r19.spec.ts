import { describe, expect, test } from "vitest";
import {
  Entity,
  Property,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Controller,
  MonoSystem,
  KlassByName,
  Condition,
  Conditions,
  BoolExp,
} from "interaqt";
import { PGLiteDB } from "@drivers";

/**
 * r19 deep-review fatal-fix regressions.
 *
 * F-1 BoolExp.evaluate/evaluateAsync dropped `inverse` when descending into AND/OR
 * subtrees, so a guard written as NOT(A OR B) degraded to (A OR B) — a silent
 * permission fail-open. The guard chain (Conditions + BoolExp) is the real consumer,
 * so this asserts the fix end-to-end through Controller.dispatch, not only at the
 * BoolExp unit level (core truth-table regression lives in tests/core/boolexp.spec.ts).
 */
describe("r19 F-1 — guard NOT(compound) is fail-closed", () => {
  async function makeGuardController(conditionsContent: any) {
    const User = Entity.create({
      name: "User",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Guarded = Interaction.create({
      name: "Guarded",
      action: Action.create({ name: "doGuard" }),
      conditions: Conditions.create({ content: conditionsContent }),
    });
    const db = new PGLiteDB();
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [User],
      relations: [],
      eventSources: [Guarded],
    });
    await controller.setup(true);
    return { controller, Guarded, db };
  }

  const truthy = (name: string) =>
    Condition.create({ name, content: async function () { return true; } });
  const falsy = (name: string) =>
    Condition.create({ name, content: async function () { return false; } });

  test("NOT(A OR B): passes only when both A and B are false", async () => {
    // A=true, B=false → OR=true → NOT=false → MUST be rejected (the old fail-open bug).
    const c1 = await makeGuardController(
      BoolExp.atom(truthy("a1")).or(BoolExp.atom(falsy("b1"))).not()
    );
    const rejected = await c1.controller.dispatch(c1.Guarded, {
      user: { id: "u1" } as any,
      payload: {},
    } as any);
    expect(rejected.error).toBeDefined();
    await c1.db.close();

    // A=false, B=false → OR=false → NOT=true → MUST pass.
    const c2 = await makeGuardController(
      BoolExp.atom(falsy("a2")).or(BoolExp.atom(falsy("b2"))).not()
    );
    const allowed = await c2.controller.dispatch(c2.Guarded, {
      user: { id: "u1" } as any,
      payload: {},
    } as any);
    expect(allowed.error).toBeUndefined();
    await c2.db.close();
  });

  test("NOT(A AND B): De Morgan — passes unless both hold", async () => {
    // A=true, B=false → AND=false → NOT=true → MUST pass.
    const c1 = await makeGuardController(
      BoolExp.atom(truthy("a3")).and(BoolExp.atom(falsy("b3"))).not()
    );
    const allowed = await c1.controller.dispatch(c1.Guarded, {
      user: { id: "u1" } as any,
      payload: {},
    } as any);
    expect(allowed.error).toBeUndefined();
    await c1.db.close();

    // A=true, B=true → AND=true → NOT=false → MUST be rejected.
    const c2 = await makeGuardController(
      BoolExp.atom(truthy("a4")).and(BoolExp.atom(truthy("b4"))).not()
    );
    const rejected = await c2.controller.dispatch(c2.Guarded, {
      user: { id: "u1" } as any,
      payload: {},
    } as any);
    expect(rejected.error).toBeDefined();
    await c2.db.close();
  });
});

/**
 * I-1 payload declared as `type: 'Entity'` / `type: 'Relation'` (via `base`) with
 * isCollection:false accepted an array (typeof [] === 'object'); with isCollection:true
 * it accepted nested arrays as elements. Downstream consumers treat the value as a single
 * entity object → silent semantic drift. Fixed by rejecting arrays at the entity/relation
 * structural check (mirrors r17's `type: 'object'` array rejection).
 */
describe("r19 I-1 — entity/relation payload rejects arrays", () => {
  async function dispatchWith(itemArgs: any, payloadValue: any) {
    const Doc = Entity.create({
      name: "Doc",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const CreateThing = Interaction.create({
      name: "CreateThing",
      action: Action.create({ name: "createThing" }),
      payload: Payload.create({ items: [PayloadItem.create({ name: "doc", base: Doc, ...itemArgs })] }),
    });
    const db = new PGLiteDB();
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Doc],
      relations: [],
      eventSources: [CreateThing],
    });
    await controller.setup(true);
    const res = await controller.dispatch(CreateThing, {
      user: { id: "u1" } as any,
      payload: { doc: payloadValue },
    } as any);
    await db.close();
    return res;
  }

  test("isCollection:false rejects an array masquerading as a single entity", async () => {
    const res = await dispatchWith({ isRef: false }, [{ title: "x" }, { title: "y" }]);
    expect(res.error).toBeDefined();
  });

  test("isCollection:false still accepts a plain entity object", async () => {
    const res = await dispatchWith({ isRef: false }, { title: "x" });
    expect(res.error).toBeUndefined();
  });

  test("isCollection:true rejects nested-array elements", async () => {
    const res = await dispatchWith({ isRef: false, isCollection: true }, [[{ title: "x" }]]);
    expect(res.error).toBeDefined();
  });

  test("isCollection:true still accepts an array of entity objects", async () => {
    const res = await dispatchWith({ isRef: false, isCollection: true }, [{ title: "x" }, { title: "y" }]);
    expect(res.error).toBeUndefined();
  });
});
