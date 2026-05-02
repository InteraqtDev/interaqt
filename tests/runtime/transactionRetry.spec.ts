import { describe, expect, test } from "vitest";
import {
  Action,
  Controller,
  Custom,
  Dictionary,
  Entity,
  Interaction,
  KlassByName,
  MonoSystem,
  MatchExp,
  Payload,
  PayloadItem,
  Property,
  RecordMutationSideEffect,
  ComputationResult,
  isRetryableTransactionError,
  runWithTransactionRetry,
} from "interaqt";
import { PGLiteDB } from "@drivers";

describe("transaction retry and serializable promotion", () => {
  test("runs default custom computation in the promoted SERIALIZABLE attempt", async () => {
    const Product = Entity.create({
      name: "RetryProduct",
      properties: [Property.create({ name: "price", type: "number" })],
    });

    const seenIsolations: unknown[] = [];
    const total = Dictionary.create({
      name: "retryProductTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "RetryProductTotal",
        dataDeps: {
          products: { type: "records", source: Product, attributeQuery: ["price"] },
        },
        compute: async function(this: { controller: Controller }, dataDeps: any) {
          seenIsolations.push(this.controller.system.storage.getTransactionIsolation());
          return (dataDeps.products || []).reduce((sum: number, product: any) => sum + product.price, 0);
        },
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Product], relations: [], dict: [total] });
    await controller.setup(true);

    await system.storage.create("RetryProduct", { price: 5 });

    expect(seenIsolations).toEqual(["SERIALIZABLE"]);
    expect(await system.storage.dict.get("retryProductTotal")).toBe(5);
    await system.destroy();
  });

  test("does not promote atomic-safe custom incremental computation", async () => {
    const Counter = Entity.create({
      name: "AtomicSafeRetryCounter",
      properties: [Property.create({ name: "value", type: "number" })],
    });

    const seenIsolations: unknown[] = [];
    const total = Dictionary.create({
      name: "atomicSafeRetryTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "AtomicSafeRetryTotal",
        concurrency: "atomic-safe",
        useLastValue: true,
        dataDeps: {
          counters: { type: "records", source: Counter, attributeQuery: ["value"] },
        },
        incrementalCompute: async function(this: { controller: Controller }, lastValue: number, mutationEvent: any) {
          seenIsolations.push(this.controller.system.storage.getTransactionIsolation());
          return (lastValue || 0) + (mutationEvent.record?.value || 0);
        },
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Counter], relations: [], dict: [total] });
    await controller.setup(true);

    await system.storage.create("AtomicSafeRetryCounter", { value: 3 });

    expect(seenIsolations).toEqual(["READ COMMITTED"]);
    expect(await system.storage.dict.get("atomicSafeRetryTotal")).toBe(3);
    await system.destroy();
  });

  test("promotes atomic-safe custom full recompute fallback", async () => {
    const Item = Entity.create({
      name: "FullRecomputeRetryItem",
      properties: [Property.create({ name: "value", type: "number" })],
    });

    const incrementalIsolations: unknown[] = [];
    const computeIsolations: unknown[] = [];
    const total = Dictionary.create({
      name: "fullRecomputeRetryTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "FullRecomputeRetryTotal",
        concurrency: "atomic-safe",
        dataDeps: {
          items: { type: "records", source: Item, attributeQuery: ["value"] },
        },
        incrementalCompute: async function(this: { controller: Controller }) {
          incrementalIsolations.push(this.controller.system.storage.getTransactionIsolation());
          return ComputationResult.fullRecompute("test fallback");
        },
        compute: async function(this: { controller: Controller }, dataDeps: any) {
          computeIsolations.push(this.controller.system.storage.getTransactionIsolation());
          return (dataDeps.items || []).reduce((sum: number, item: any) => sum + item.value, 0);
        },
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Item], relations: [], dict: [total] });
    await controller.setup(true);

    await system.storage.create("FullRecomputeRetryItem", { value: 7 });

    expect(incrementalIsolations).toEqual(["READ COMMITTED", "SERIALIZABLE"]);
    expect(computeIsolations).toEqual(["SERIALIZABLE"]);
    expect(await system.storage.dict.get("fullRecomputeRetryTotal")).toBe(7);
    await system.destroy();
  });

  test("runs record mutation side effects only for the successful retry attempt", async () => {
    const Product = Entity.create({
      name: "DispatchRetryProduct",
      properties: [Property.create({ name: "price", type: "number" })],
    });

    const AddProduct = Interaction.create({
      name: "addDispatchRetryProduct",
      action: Action.create({ name: "addDispatchRetryProduct" }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            type: "Entity",
            name: "product",
            base: Product,
          }),
        ],
      }),
    });
    AddProduct.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("DispatchRetryProduct", event.payload.product);
    };

    const total = Dictionary.create({
      name: "dispatchRetryProductTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "DispatchRetryProductTotal",
        dataDeps: {
          products: { type: "records", source: Product, attributeQuery: ["price"] },
        },
        compute: async (_dataDeps: any) => 1,
        getInitialValue: () => 0,
      }),
    });

    let sideEffectRuns = 0;
    const sideEffect = RecordMutationSideEffect.create({
      name: "count-dispatch-retry-product",
      record: Product,
      content: async () => {
        sideEffectRuns++;
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Product],
      relations: [],
      eventSources: [AddProduct],
      dict: [total],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    const result = await controller.dispatch(AddProduct, {
      user: { id: "tester" },
      payload: { product: { price: 9 } },
    });

    expect(result.error).toBeUndefined();
    expect(sideEffectRuns).toBe(1);
    expect(result.effects?.filter(event => event.recordName === "DispatchRetryProduct")).toHaveLength(1);
    await system.destroy();
  });

  test("replays afterDispatch on retry and exposes only successful attempt effects", async () => {
    const Item = Entity.create({
      name: "AfterDispatchRetryItem",
      properties: [Property.create({ name: "value", type: "number" })],
    });
    const AddItem = Interaction.create({
      name: "addAfterDispatchRetryItem",
      action: Action.create({ name: "addAfterDispatchRetryItem" }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            type: "Entity",
            name: "item",
            base: Item,
          }),
        ],
      }),
    });

    let afterDispatchRuns = 0;
    AddItem.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("AfterDispatchRetryItem", event.payload.item);
    };
    AddItem.afterDispatch = async () => {
      afterDispatchRuns++;
      if (afterDispatchRuns === 1) {
        const error = new Error("serialization failure from afterDispatch");
        Object.assign(error, { code: "40001" });
        throw error;
      }
      return { afterDispatchRuns };
    };

    let sideEffectRuns = 0;
    const sideEffect = RecordMutationSideEffect.create({
      name: "after-dispatch-retry-side-effect",
      record: Item,
      content: async () => {
        sideEffectRuns++;
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [AddItem],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    const result = await controller.dispatch(AddItem, {
      user: { id: "tester" },
      payload: { item: { value: 1 } },
    });
    const records = await system.storage.find("AfterDispatchRetryItem", undefined, undefined, ["id", "value"]);

    expect(result.error).toBeUndefined();
    expect(result.context).toEqual({ afterDispatchRuns: 2 });
    expect(afterDispatchRuns).toBe(2);
    expect(sideEffectRuns).toBe(1);
    expect(records).toHaveLength(1);
    expect(result.effects?.filter(event => event.recordName === "AfterDispatchRetryItem")).toHaveLength(1);
    await system.destroy();
  });

  test("runs postCommit after commit and does not roll back when it fails", async () => {
    const Item = Entity.create({
      name: "PostCommitItem",
      properties: [Property.create({ name: "value", type: "number" })],
    });
    const AddItem = Interaction.create({
      name: "addPostCommitItem",
      action: Action.create({ name: "addPostCommitItem" }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            type: "Entity",
            name: "item",
            base: Item,
          }),
        ],
      }),
    });

    let postCommitRuns = 0;
    AddItem.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("PostCommitItem", event.payload.item);
    };
    AddItem.postCommit = async () => {
      postCommitRuns++;
      throw new Error("external side effect failed");
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [AddItem],
    });
    await controller.setup(true);

    const result = await controller.dispatch(AddItem, {
      user: { id: "tester" },
      payload: { item: { value: 1 } },
    });
    const records = await system.storage.find("PostCommitItem", undefined, undefined, ["id", "value"]);

    expect(result.error).toBeUndefined();
    expect(result.sideEffects?.__postCommit?.error).toBeDefined();
    expect(postCommitRuns).toBe(1);
    expect(records).toHaveLength(1);
    await system.destroy();
  });

  test("merges successful postCommit context and skips postCommit when dispatch fails", async () => {
    const Item = Entity.create({
      name: "PostCommitSuccessItem",
      properties: [Property.create({ name: "value", type: "number" })],
    });
    const AddItem = Interaction.create({
      name: "addPostCommitSuccessItem",
      action: Action.create({ name: "addPostCommitSuccessItem" }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            type: "Entity",
            name: "item",
            base: Item,
          }),
        ],
      }),
    });

    let postCommitRuns = 0;
    AddItem.resolve = async function(this: Controller, event: any) {
      if (event.payload.item.value < 0) {
        throw new Error("reject negative value");
      }
      return this.system.storage.create("PostCommitSuccessItem", event.payload.item);
    };
    AddItem.afterDispatch = async () => ({ transactionContext: "committed" });
    AddItem.postCommit = async (_args, result) => {
      postCommitRuns++;
      return {
        postCommitContext: "sent",
        sawTransactionContext: result.context?.transactionContext,
      };
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      eventSources: [AddItem],
    });
    await controller.setup(true);

    const success = await controller.dispatch(AddItem, {
      user: { id: "tester" },
      payload: { item: { value: 1 } },
    });
    const failed = await controller.dispatch(AddItem, {
      user: { id: "tester" },
      payload: { item: { value: -1 } },
    });

    expect(success.error).toBeUndefined();
    expect(success.context).toMatchObject({
      transactionContext: "committed",
      postCommitContext: "sent",
      sawTransactionContext: "committed",
    });
    expect(failed.error).toBeDefined();
    expect(postCommitRuns).toBe(1);
    await system.destroy();
  });

  test("retries retryable SQLSTATE errors regardless of current isolation", async () => {
    let attempts = 0;

    const result = await runWithTransactionRetry("read-committed-deadlock", async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("deadlock");
        Object.assign(error, { code: "40P01" });
        throw error;
      }
      return "ok";
    });

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(isRetryableTransactionError({ error: { code: "40001" } })).toBe(true);
  });

  test("requires serializable transaction for entity replace outside a transaction", async () => {
    const EntityResult = Entity.create({
      name: "EntityReplaceRequiresSerializable",
      properties: [Property.create({ name: "value", type: "number" })],
      computation: Custom.create({
        name: "EntityReplaceRequiresSerializableComputation",
        concurrency: "atomic-safe",
        compute: async () => [{ value: 1 }],
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [EntityResult], relations: [] });
    await controller.setup(true);

    await expect(controller.applyResult({ type: "entity", id: EntityResult }, [{ value: 1 }])).rejects.toThrow("SERIALIZABLE");
    await system.destroy();
  });

  test("validates Custom concurrency values at runtime", () => {
    expect(() =>
      Custom.create({
        name: "InvalidConcurrency",
        concurrency: "unsafe" as any,
      })
    ).toThrow("Invalid Custom concurrency");
  });

  test("promotes default custom asyncReturn before callback and handles the same task once", async () => {
    const AsyncSource = Entity.create({
      name: "AsyncReturnRetrySource",
      properties: [Property.create({ name: "value", type: "number" })],
    });

    const asyncReturnIsolations: unknown[] = [];
    const total = Dictionary.create({
      name: "asyncReturnRetryTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "AsyncReturnRetryTotal",
        dataDeps: {
          sources: { type: "records", source: AsyncSource, attributeQuery: ["value"] },
        },
        compute: async () => ComputationResult.async({ freshnessKey: "async-total" }),
        asyncReturn: async function(this: { controller: Controller }, result: number) {
          asyncReturnIsolations.push(this.controller.system.storage.getTransactionIsolation());
          return result;
        },
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [AsyncSource], relations: [], dict: [total] });
    await controller.setup(true);

    await system.storage.create("AsyncReturnRetrySource", { value: 1 });
    const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
      item => item.dataContext.type === "global" && item.dataContext.id.name === "asyncReturnRetryTotal"
    ) as any;
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation);
    const task = (await system.storage.find(taskRecordName, undefined, undefined, ["*"]))[0];

    await system.storage.update(taskRecordName, MatchExp.atom({ key: "id", value: ["=", task.id] }), {
      result: 42,
      status: "success",
    });

    const first = await controller.scheduler.handleAsyncReturn(computation, { id: task.id });
    const second = await controller.scheduler.handleAsyncReturn(computation, { id: task.id });
    const handledTask = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: "id", value: ["=", task.id] }), undefined, ["status"]);

    expect(first).toEqual({ skipped: false });
    expect(second).toEqual({ skipped: true, reason: "already-handled" });
    expect(asyncReturnIsolations).toEqual(["SERIALIZABLE"]);
    expect(handledTask.status).toBe("applied");
    expect(await system.storage.dict.get("asyncReturnRetryTotal")).toBe(42);
    await system.destroy();
  });

  test("skips stale async tasks without running asyncReturn", async () => {
    const StaleSource = Entity.create({
      name: "StaleAsyncRetrySource",
      properties: [Property.create({ name: "value", type: "number" })],
    });

    let asyncReturnCalls = 0;
    const total = Dictionary.create({
      name: "staleAsyncRetryTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "StaleAsyncRetryTotal",
        concurrency: "atomic-safe",
        dataDeps: {
          sources: { type: "records", source: StaleSource, attributeQuery: ["value"] },
        },
        compute: async () => ComputationResult.async({ freshnessKey: "stale-total" }),
        asyncReturn: async (result: number) => {
          asyncReturnCalls++;
          return result;
        },
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [StaleSource], relations: [], dict: [total] });
    await controller.setup(true);

    await system.storage.create("StaleAsyncRetrySource", { value: 1 });
    await system.storage.create("StaleAsyncRetrySource", { value: 2 });
    const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
      item => item.dataContext.type === "global" && item.dataContext.id.name === "staleAsyncRetryTotal"
    ) as any;
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation);
    const tasks = await system.storage.find(taskRecordName, undefined, { orderBy: { id: "ASC" } }, ["*"]);
    const [oldTask, latestTask] = tasks;

    await system.storage.update(taskRecordName, MatchExp.atom({ key: "id", value: ["in", [oldTask.id, latestTask.id]] }), {
      result: 7,
      status: "success",
    });

    const staleResult = await controller.scheduler.handleAsyncReturn(computation, { id: oldTask.id });
    const oldTaskAfter = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: "id", value: ["=", oldTask.id] }), undefined, ["status"]);

    expect(staleResult).toEqual({ skipped: true, reason: "stale-task" });
    expect(oldTaskAfter.status).toBe("skipped");
    expect(asyncReturnCalls).toBe(0);
    await system.destroy();
  });
});

