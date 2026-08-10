/**
 * M-02 / FR-02(a) — controller.runInBusinessTransaction
 *
 * Covers design §3.3.5 cases A–O and K′:
 * BT-owned outer transaction, per-dispatch SAVEPOINT, abort=throw, deferred SE,
 * retry family split (W vs S vs C), nesting ownership, non-BT reuse regression.
 */
import { describe, expect, test } from "vitest";
import {
  Action,
  BusinessTransactionBoundaryError,
  Condition,
  Controller,
  Custom,
  Dictionary,
  Entity,
  EventSource,
  Interaction,
  InteractionEventEntity,
  InteractionGuardError,
  KlassByName,
  MatchExp,
  MonoSystem,
  NestedDispatchError,
  Payload,
  PayloadItem,
  Property,
  RecordMutationSideEffect,
  RequireSerializableRetry,
  RetryableWriteConflict,
  isBusinessTransactionBoundaryError,
  isRequireSerializableRetry,
} from "interaqt";
import { PGLiteDB } from "@drivers";

const user = { id: "bt-user", name: "bt" };

function softError(result: { error?: unknown }) {
  return result.error;
}

describe("runInBusinessTransaction (FR-02(a) / M-02)", () => {
  test("A: create then dispatch — Condition sees uncommitted row; facts commit together", async () => {
    const Draft = Entity.create({
      name: "BtDraftA",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const Activate = Interaction.create({
      name: "BtActivateA",
      action: Action.create({ name: "btActivateA" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "draftId", type: "string", required: true })],
      }),
      conditions: Condition.create({
        name: "draftExistsA",
        content: async function (this: Controller, event: any) {
          const row = await this.system.storage.findOne(
            "BtDraftA",
            MatchExp.atom({ key: "id", value: ["=", event.payload.draftId] }),
            undefined,
            ["*"]
          );
          return !!row;
        },
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Draft],
      relations: [],
      eventSources: [Activate],
    });
    await controller.setup(true);

    const result = await controller.runInBusinessTransaction({ name: "A" }, async () => {
      const draft = await system.storage.create("BtDraftA", { title: "t" });
      const dispatchResult = await controller.dispatch(Activate, {
        user,
        payload: { draftId: String(draft.id) },
      });
      expect(dispatchResult.error).toBeUndefined();
      return { draftId: draft.id, dispatchResult };
    });

    const draft = await system.storage.findOne(
      "BtDraftA",
      MatchExp.atom({ key: "id", value: ["=", result.draftId] }),
      undefined,
      ["*"]
    );
    expect(draft?.title).toBe("t");
    const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ["*"]);
    expect(events.some((e: any) => e.interactionName === "BtActivateA")).toBe(true);
    await system.destroy();
  });

  test("B: fn throws after create+dispatch → full ROLLBACK; SE not run", async () => {
    // SE must observe a mutation that successful dispatch actually produces
    // (InteractionEvent create). Watching only the pre-dispatch Draft entity is a
    // dead observer: early post-commit flush would still leave seRuns===0.
    let mutationSeRuns = 0;
    let postCommitRuns = 0;
    const Draft = Entity.create({
      name: "BtDraftB",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const Activate = Interaction.create({
      name: "BtActivateB",
      action: Action.create({ name: "btActivateB" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "draftId", type: "string", required: true })],
      }),
      conditions: Condition.create({
        name: "alwaysTrueB",
        content: async () => true,
      }),
    });
    Activate.postCommit = async () => {
      postCommitRuns++;
    };
    const sideEffect = RecordMutationSideEffect.create({
      name: "btActivateBEventSe",
      record: InteractionEventEntity,
      content: async () => {
        mutationSeRuns++;
        return "ran";
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Draft],
      relations: [],
      eventSources: [Activate],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    await expect(
      controller.runInBusinessTransaction({ name: "B" }, async () => {
        const draft = await system.storage.create("BtDraftB", { title: "t" });
        await controller.dispatch(Activate, { user, payload: { draftId: String(draft.id) } });
        // Successful dispatch would have deferred SE; early flush would already
        // have run them before this throw.
        expect(mutationSeRuns).toBe(0);
        expect(postCommitRuns).toBe(0);
        throw new Error("force bt rollback");
      })
    ).rejects.toThrow(/force bt rollback/);

    expect(mutationSeRuns).toBe(0);
    expect(postCommitRuns).toBe(0);
    const drafts = await system.storage.find("BtDraftB", undefined, undefined, ["*"]);
    const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ["*"]);
    expect(drafts).toHaveLength(0);
    expect(events.filter((e: any) => e.interactionName === "BtActivateB")).toHaveLength(0);
    await system.destroy();
  });

  test("C: Condition reject under default abort → rejects BT; no facts; no SE", async () => {
    let mutationSeRuns = 0;
    let postCommitRuns = 0;
    const Draft = Entity.create({
      name: "BtDraftC",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const Activate = Interaction.create({
      name: "BtActivateC",
      action: Action.create({ name: "btActivateC" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "draftId", type: "string", required: true })],
      }),
      conditions: Condition.create({
        name: "denyC",
        content: async () => false,
      }),
    });
    Activate.postCommit = async () => {
      postCommitRuns++;
    };
    const sideEffect = RecordMutationSideEffect.create({
      name: "btActivateCEventSe",
      record: InteractionEventEntity,
      content: async () => {
        mutationSeRuns++;
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Draft],
      relations: [],
      eventSources: [Activate],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    await expect(
      controller.runInBusinessTransaction({ name: "C" }, async () => {
        const draft = await system.storage.create("BtDraftC", { title: "t" });
        // default abort: must throw, not return soft result
        await controller.dispatch(Activate, { user, payload: { draftId: String(draft.id) } });
        return "should-not-reach";
      })
    ).rejects.toBeInstanceOf(InteractionGuardError);

    expect(mutationSeRuns).toBe(0);
    expect(postCommitRuns).toBe(0);
    expect(await system.storage.find("BtDraftC", undefined, undefined, ["*"])).toHaveLength(0);
    expect(
      (await system.storage.find(InteractionEventEntity.name, undefined, undefined, ["*"])).filter(
        (e: any) => e.interactionName === "BtActivateC"
      )
    ).toHaveLength(0);
    await system.destroy();
  });

  test("D: create then two dispatches; first Condition fails (abort) → no storage write, no events, no SE", async () => {
    let mutationSeRuns = 0;
    let postCommitRuns = 0;
    const Draft = Entity.create({
      name: "BtDraftD",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const FailFirst = Interaction.create({
      name: "BtFailFirstD",
      action: Action.create({ name: "btFailFirstD" }),
      conditions: Condition.create({ name: "denyD", content: async () => false }),
    });
    const Second = Interaction.create({
      name: "BtSecondD",
      action: Action.create({ name: "btSecondD" }),
      conditions: Condition.create({ name: "allowD", content: async () => true }),
    });
    Second.postCommit = async () => {
      postCommitRuns++;
    };
    const sideEffect = RecordMutationSideEffect.create({
      name: "btSecondDEventSe",
      record: InteractionEventEntity,
      content: async () => {
        mutationSeRuns++;
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Draft],
      relations: [],
      eventSources: [FailFirst, Second],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    await expect(
      controller.runInBusinessTransaction({ name: "D" }, async () => {
        await system.storage.create("BtDraftD", { title: "pre" });
        await controller.dispatch(FailFirst, { user });
        await controller.dispatch(Second, { user });
      })
    ).rejects.toBeInstanceOf(InteractionGuardError);

    expect(mutationSeRuns).toBe(0);
    expect(postCommitRuns).toBe(0);
    expect(await system.storage.find("BtDraftD", undefined, undefined, ["*"])).toHaveLength(0);
    const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ["*"]);
    expect(events.filter((e: any) => e.interactionName === "BtFailFirstD" || e.interactionName === "BtSecondD")).toHaveLength(0);
    await system.destroy();
  });

  test("E: EventSource create helper row then throw → nothing commits", async () => {
    const Helper = Entity.create({
      name: "BtHelperE",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Ev = Entity.create({
      name: "_BtEventE_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const source = EventSource.create<any, void>({
      name: "btEventSourceE",
      entity: Ev,
      mapEventData: () => ({ kind: "e" }),
      resolve: async function (this: Controller) {
        await this.system.storage.create("BtHelperE", { value: "helper" });
        throw new Error("event source fail");
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Helper],
      relations: [],
      eventSources: [source],
    });
    await controller.setup(true);

    await expect(
      controller.runInBusinessTransaction({ name: "E" }, async () => {
        await controller.dispatch(source, {});
      })
    ).rejects.toThrow(/event source fail/);

    expect(await system.storage.find("BtHelperE", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("_BtEventE_", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("F: BT RetryableWriteConflict once then success → single final event / fact", async () => {
    let attempts = 0;
    const Item = Entity.create({
      name: "BtItemF",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Add = Interaction.create({
      name: "BtAddF",
      action: Action.create({ name: "btAddF" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "value", type: "string", required: true })],
      }),
    });
    Add.resolve = async function (this: Controller, event: any) {
      attempts++;
      if (attempts === 1) {
        // Write something that must be wiped by SAVEPOINT rollback before retry.
        await this.system.storage.create("BtItemF", { value: "ghost-attempt-1" });
        throw new RetryableWriteConflict("bt inject write conflict");
      }
      await this.system.storage.create("BtItemF", { value: event.payload.value });
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [Add],
    });
    await controller.setup(true);

    await controller.runInBusinessTransaction({ name: "F" }, async () => {
      const result = await controller.dispatch(Add, { user, payload: { value: "final" } });
      expect(result.error).toBeUndefined();
    });

    expect(attempts).toBe(2);
    const items = await system.storage.find("BtItemF", undefined, undefined, ["*"]);
    expect(items.map((i: any) => i.value).sort()).toEqual(["final"]);
    const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ["*"]);
    expect(events.filter((e: any) => e.interactionName === "BtAddF")).toHaveLength(1);
    await system.destroy();
  });

  test("G: standalone dispatch retry still only keeps final attempt (non-BT regression)", async () => {
    let attempts = 0;
    const Item = Entity.create({
      name: "BtItemG",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Add = Interaction.create({
      name: "BtAddG",
      action: Action.create({ name: "btAddG" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "value", type: "string", required: true })],
      }),
    });
    Add.resolve = async function (this: Controller, event: any) {
      attempts++;
      if (attempts === 1) {
        await this.system.storage.create("BtItemG", { value: "ghost" });
        throw new RetryableWriteConflict("standalone conflict");
      }
      await this.system.storage.create("BtItemG", { value: event.payload.value });
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [Add],
    });
    await controller.setup(true);

    const result = await controller.dispatch(Add, { user, payload: { value: "ok" } });
    expect(result.error).toBeUndefined();
    expect(attempts).toBe(2);
    const items = await system.storage.find("BtItemG", undefined, undefined, ["*"]);
    expect(items.map((i: any) => i.value)).toEqual(["ok"]);
    await system.destroy();
  });

  test("H: non-BT successful dispatch still runs SE immediately", async () => {
    let seRuns = 0;
    const Item = Entity.create({
      name: "BtItemH",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Add = Interaction.create({
      name: "BtAddH",
      action: Action.create({ name: "btAddH" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "value", type: "string", required: true })],
      }),
    });
    Add.resolve = async function (this: Controller, event: any) {
      await this.system.storage.create("BtItemH", { value: event.payload.value });
    };
    const sideEffect = RecordMutationSideEffect.create({
      name: "btItemHSe",
      record: Item,
      content: async () => {
        seRuns++;
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [Add],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    const result = await controller.dispatch(Add, { user, payload: { value: "h" } });
    expect(result.error).toBeUndefined();
    expect(seRuns).toBe(1);
    await system.destroy();
  });

  test("I: nested dispatch inside BT still NestedDispatchError", async () => {
    const InnerEv = Entity.create({
      name: "_BtNestedInnerI_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const OuterEv = Entity.create({
      name: "_BtNestedOuterI_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    let controller!: Controller;
    const inner = EventSource.create<any, void>({
      name: "btNestedInnerI",
      entity: InnerEv,
      mapEventData: () => ({ kind: "inner" }),
    });
    const outer = EventSource.create<any, void>({
      name: "btNestedOuterI",
      entity: OuterEv,
      mapEventData: () => ({ kind: "outer" }),
      resolve: async function (this: Controller) {
        await controller.dispatch(inner, {});
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    controller = new Controller({
      system,
      entities: [],
      relations: [],
      eventSources: [inner, outer],
    });
    await controller.setup(true);

    await expect(
      controller.runInBusinessTransaction({ name: "I" }, async () => {
        await controller.dispatch(outer, {});
      })
    ).rejects.toBeInstanceOf(NestedDispatchError);

    expect(await system.storage.find("_BtNestedOuterI_", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("_BtNestedInnerI_", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("J: non-BT nested runInTransaction throw-catch keeps inner writes (reuse, not global savepoint)", async () => {
    const Row = Entity.create({
      name: "BtReuseJ",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Row], relations: [], eventSources: [] });
    await controller.setup(true);

    expect(system.storage.getTransactionCapability().nestedStrategy).toBe("reuse");

    await system.storage.runInTransaction({ name: "outer-j" }, async () => {
      try {
        await system.storage.runInTransaction({ name: "inner-j" }, async () => {
          await system.storage.create("BtReuseJ", { value: "inner-write" });
          throw new Error("inner fail");
        });
      } catch {
        // catch-continue: under reuse, inner writes remain in outer uncommitted snapshot
      }
      const rows = await system.storage.find("BtReuseJ", undefined, undefined, ["*"]);
      expect(rows.map((r: any) => r.value)).toEqual(["inner-write"]);
    });

    // outer committed the retained inner write
    const committed = await system.storage.find("BtReuseJ", undefined, undefined, ["*"]);
    expect(committed).toHaveLength(1);
    await system.destroy();
  });

  test("K: BT + RC RequireSerializableRetry fails once, recognizable, no upgrade loop", async () => {
    let attempts = 0;
    const Item = Entity.create({
      name: "BtItemK",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Add = Interaction.create({
      name: "BtAddK",
      action: Action.create({ name: "btAddK" }),
    });
    Add.resolve = async function (this: Controller) {
      attempts++;
      await this.system.storage.create("BtItemK", { value: `a${attempts}` });
      throw new RequireSerializableRetry("bt inject serializable");
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [Add],
    });
    await controller.setup(true);

    let caught: unknown;
    try {
      await controller.runInBusinessTransaction({ name: "K", isolation: "READ COMMITTED" }, async () => {
        await controller.dispatch(Add, { user });
      });
    } catch (e) {
      caught = e;
    }

    expect(isRequireSerializableRetry(caught)).toBe(true);
    expect(attempts).toBe(1);
    expect((caught as any)?.transactionAttempts).toBe(1);
    expect(await system.storage.find("BtItemK", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("K′: BT + SERIALIZABLE production gate path advances; injected S still fail-fast once", async () => {
    // Production gate: default Custom compute requires SERIALIZABLE.
    const Product = Entity.create({
      name: "BtProductK2",
      properties: [Property.create({ name: "price", type: "number" })],
    });
    const seenIsolations: unknown[] = [];
    const total = Dictionary.create({
      name: "btProductTotalK2",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "BtProductTotalK2",
        dataDeps: {
          products: { type: "records", source: Product, attributeQuery: ["price"] },
        },
        compute: async function (this: { controller: Controller }, dataDeps: any) {
          seenIsolations.push(this.controller.system.storage.getTransactionIsolation());
          return (dataDeps.products || []).reduce((sum: number, p: any) => sum + p.price, 0);
        },
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Product],
      relations: [],
      dict: [total],
    });
    await controller.setup(true);

    await controller.runInBusinessTransaction({ name: "K2", isolation: "SERIALIZABLE" }, async () => {
      await system.storage.create("BtProductK2", { price: 7 });
    });

    expect(seenIsolations).toEqual(["SERIALIZABLE"]);
    expect(await system.storage.dict.get("btProductTotalK2")).toBe(7);

    // Negative: injected S inside SERIALIZABLE BT still fail-fast (S ∉ SAVEPOINT retryable).
    let injectAttempts = 0;
    const Boom = Interaction.create({
      name: "BtBoomK2",
      action: Action.create({ name: "btBoomK2" }),
    });
    Boom.resolve = async function () {
      injectAttempts++;
      throw new RequireSerializableRetry("inject even under serializable bt");
    };
    const system2 = new MonoSystem(new PGLiteDB());
    system2.conceptClass = KlassByName;
    const controller2 = new Controller({
      system: system2,
      entities: [],
      relations: [],
      eventSources: [Boom],
    });
    await controller2.setup(true);

    await expect(
      controller2.runInBusinessTransaction({ name: "K2-neg", isolation: "SERIALIZABLE" }, async () => {
        await controller2.dispatch(Boom, { user });
      })
    ).rejects.toSatisfy((e: unknown) => isRequireSerializableRetry(e));
    expect(injectAttempts).toBe(1);

    await system.destroy();
    await system2.destroy();
  });

  test("L: runInBusinessTransaction inside storage.runInTransaction is rejected; fn not called", async () => {
    let fnCalls = 0;
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [], relations: [], eventSources: [] });
    await controller.setup(true);

    await expect(
      system.storage.runInTransaction({ name: "outer-L" }, async () => {
        await controller.runInBusinessTransaction({ name: "L" }, async () => {
          fnCalls++;
          return "nope";
        });
      })
    ).rejects.toSatisfy(
      (e: unknown) =>
        isBusinessTransactionBoundaryError(e) &&
        (e as BusinessTransactionBoundaryError).code === "NESTED_STORAGE_TRANSACTION"
    );
    expect(fnCalls).toBe(0);
    await system.destroy();
  });

  test("M: re-entrant runInBusinessTransaction is rejected; outer rejects when uncaught", async () => {
    let innerFnCalls = 0;
    const Row = Entity.create({
      name: "BtRowM",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Row], relations: [], eventSources: [] });
    await controller.setup(true);

    await expect(
      controller.runInBusinessTransaction({ name: "M-outer" }, async () => {
        await system.storage.create("BtRowM", { value: "outer" });
        await controller.runInBusinessTransaction({ name: "M-inner" }, async () => {
          innerFnCalls++;
        });
      })
    ).rejects.toSatisfy(
      (e: unknown) =>
        isBusinessTransactionBoundaryError(e) && (e as BusinessTransactionBoundaryError).code === "REENTRANT"
    );
    expect(innerFnCalls).toBe(0);
    expect(await system.storage.find("BtRowM", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("N: connection-fatal error inside BT → zero connection-level retries (attempt count 1)", async () => {
    let attempts = 0;
    const Item = Entity.create({
      name: "BtItemN",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Add = Interaction.create({
      name: "BtAddN",
      action: Action.create({ name: "btAddN" }),
    });
    Add.resolve = async function (this: Controller) {
      attempts++;
      await this.system.storage.create("BtItemN", { value: "n" });
      const err = new Error("simulated connection reset") as Error & { code?: string };
      err.code = "ECONNRESET";
      throw err;
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [Add],
    });
    await controller.setup(true);

    let caught: unknown;
    try {
      await controller.runInBusinessTransaction({ name: "N" }, async () => {
        await controller.dispatch(Add, { user });
      });
    } catch (e) {
      caught = e;
    }

    expect(attempts).toBe(1);
    expect((caught as any)?.transactionAttempts).toBe(1);
    expect(await system.storage.find("BtItemN", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("O: SE runs only after owned COMMIT (paired with B)", async () => {
    const order: string[] = [];
    let seRuns = 0;
    const Item = Entity.create({
      name: "BtItemO",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const Add = Interaction.create({
      name: "BtAddO",
      action: Action.create({ name: "btAddO" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "value", type: "string", required: true })],
      }),
    });
    Add.resolve = async function (this: Controller, event: any) {
      order.push("resolve");
      await this.system.storage.create("BtItemO", { value: event.payload.value });
    };
    Add.postCommit = async () => {
      order.push("postCommit");
      return { fromPostCommit: true };
    };
    const sideEffect = RecordMutationSideEffect.create({
      name: "btItemOSe",
      record: Item,
      content: async () => {
        seRuns++;
        order.push("mutationSe");
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [Add],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    const btResult = await controller.runInBusinessTransaction({ name: "O" }, async () => {
      order.push("before-dispatch");
      const r = await controller.dispatch(Add, { user, payload: { value: "o" } });
      order.push("after-dispatch");
      // SE must not have run yet — still inside uncommitted BT.
      expect(seRuns).toBe(0);
      expect(order).not.toContain("postCommit");
      expect(order).not.toContain("mutationSe");
      return r;
    });

    expect(seRuns).toBe(1);
    expect(order).toEqual(["before-dispatch", "resolve", "after-dispatch", "postCommit", "mutationSe"]);
    expect(btResult.error).toBeUndefined();
    expect(btResult.context).toMatchObject({ fromPostCommit: true });
    await system.destroy();
  });

  test("continue mode returns soft error without rejecting BT (opt-in)", async () => {
    const Deny = Interaction.create({
      name: "BtDenyContinue",
      action: Action.create({ name: "btDenyContinue" }),
      conditions: Condition.create({ name: "denyCont", content: async () => false }),
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [],
      relations: [],
      eventSources: [Deny],
    });
    await controller.setup(true);

    const out = await controller.runInBusinessTransaction(
      { name: "continue", onDispatchError: "continue" },
      async () => {
        const r = await controller.dispatch(Deny, { user });
        return softError(r);
      }
    );
    expect(out).toBeTruthy();
    await system.destroy();
  });

  test("sequential dispatches inside one BT are allowed", async () => {
    const One = Interaction.create({
      name: "BtSeqOne",
      action: Action.create({ name: "btSeqOne" }),
    });
    const Two = Interaction.create({
      name: "BtSeqTwo",
      action: Action.create({ name: "btSeqTwo" }),
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [],
      relations: [],
      eventSources: [One, Two],
    });
    await controller.setup(true);

    await controller.runInBusinessTransaction({ name: "seq" }, async () => {
      expect((await controller.dispatch(One, { user })).error).toBeUndefined();
      expect((await controller.dispatch(Two, { user })).error).toBeUndefined();
    });

    const events = await system.storage.find(InteractionEventEntity.name, undefined, undefined, ["*"]);
    expect(events.filter((e: any) => e.interactionName === "BtSeqOne")).toHaveLength(1);
    expect(events.filter((e: any) => e.interactionName === "BtSeqTwo")).toHaveLength(1);
    await system.destroy();
  });
});
