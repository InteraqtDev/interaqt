import { describe, expect, test } from "vitest";
import {
  Action,
  Controller,
  Custom,
  Dictionary,
  Entity,
  EventSource,
  Interaction,
  KlassByName,
  MonoSystem,
  MatchExp,
  NestedDispatchError,
  Payload,
  PayloadItem,
  Property,
  RecordMutationSideEffect,
  ComputationResult,
  collectErrorChain,
  hasErrorCode,
  isRetryableTransactionError,
  isTransactionRetryExhaustedError,
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
        incrementalDataDeps: [],
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
        incrementalDataDeps: [],
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

  test("rejects nested dispatch inside a dispatch transaction and rolls back the outer event", async () => {
    const OuterEventRecord = Entity.create({
      name: "_NestedDispatchOuterEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const InnerEventRecord = Entity.create({
      name: "_NestedDispatchInnerEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const InnerWrite = Entity.create({
      name: "NestedDispatchInnerWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });

    const inner = EventSource.create({
      name: "nestedDispatchInner",
      entity: InnerEventRecord,
      mapEventData: () => ({ kind: "inner" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("NestedDispatchInnerWrite", { value: "inner" });
      },
    });
    const outer = EventSource.create({
      name: "nestedDispatchOuter",
      entity: OuterEventRecord,
      mapEventData: () => ({ kind: "outer" }),
      resolve: async function(this: Controller) {
        await this.dispatch(inner, {});
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [InnerWrite],
      relations: [],
      eventSources: [outer, inner],
    });
    await controller.setup(true);

    const result = await controller.dispatch(outer, {});
    const outerEvents = await system.storage.find("_NestedDispatchOuterEvent_", undefined, undefined, ["*"]);
    const innerEvents = await system.storage.find("_NestedDispatchInnerEvent_", undefined, undefined, ["*"]);
    const innerWrites = await system.storage.find("NestedDispatchInnerWrite", undefined, undefined, ["*"]);

    expect(result.error).toBeInstanceOf(NestedDispatchError);
    expect(outerEvents).toHaveLength(0);
    expect(innerEvents).toHaveLength(0);
    expect(innerWrites).toHaveLength(0);
    await system.destroy();
  });

  test("rejects nested dispatch from guard, afterDispatch, and synchronous computation", async () => {
    let controller: Controller;
    const InnerEventRecord = Entity.create({
      name: "_NestedDispatchBoundaryInnerEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const GuardEventRecord = Entity.create({
      name: "_NestedDispatchGuardEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const AfterEventRecord = Entity.create({
      name: "_NestedDispatchAfterEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const ComputationEventRecord = Entity.create({
      name: "_NestedDispatchComputationEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const ComputationSource = Entity.create({
      name: "NestedDispatchComputationSource",
      properties: [Property.create({ name: "value", type: "number" })],
    });

    const inner = EventSource.create({
      name: "nestedDispatchBoundaryInner",
      entity: InnerEventRecord,
      mapEventData: () => ({ kind: "inner" }),
    });
    const fromGuard = EventSource.create({
      name: "nestedDispatchFromGuard",
      entity: GuardEventRecord,
      guard: async function(this: Controller) {
        await this.dispatch(inner, {});
      },
      mapEventData: () => ({ kind: "guard" }),
    });
    const fromAfterDispatch = EventSource.create({
      name: "nestedDispatchFromAfterDispatch",
      entity: AfterEventRecord,
      mapEventData: () => ({ kind: "afterDispatch" }),
      afterDispatch: async function(this: Controller) {
        await this.dispatch(inner, {});
      },
    });
    const fromComputation = EventSource.create({
      name: "nestedDispatchFromComputation",
      entity: ComputationEventRecord,
      mapEventData: () => ({ kind: "computation" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("NestedDispatchComputationSource", { value: 1 });
      },
    });
    const computationResult = Dictionary.create({
      name: "nestedDispatchComputationResult",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "NestedDispatchComputationResult",
        dataDeps: {
          sources: { type: "records", source: ComputationSource, attributeQuery: ["value"] },
        },
        compute: async () => {
          await controller.dispatch(inner, {});
          return 1;
        },
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    controller = new Controller({
      system,
      entities: [ComputationSource],
      relations: [],
      eventSources: [inner, fromGuard, fromAfterDispatch, fromComputation],
      dict: [computationResult],
    });
    await controller.setup(true);

    const guardResult = await controller.dispatch(fromGuard, {});
    const afterResult = await controller.dispatch(fromAfterDispatch, {});
    const computationDispatchResult = await controller.dispatch(fromComputation, {});
    const computationSources = await system.storage.find("NestedDispatchComputationSource", undefined, undefined, ["*"]);
    const innerEvents = await system.storage.find("_NestedDispatchBoundaryInnerEvent_", undefined, undefined, ["*"]);

    expect(guardResult.error).toBeInstanceOf(NestedDispatchError);
    expect(afterResult.error).toBeInstanceOf(NestedDispatchError);
    expect(collectErrorChain(computationDispatchResult.error).some(error => error instanceof NestedDispatchError)).toBe(true);
    expect(computationSources).toHaveLength(0);
    expect(innerEvents).toHaveLength(0);
    await system.destroy();
  });

  test("allows post-commit and record side effect dispatch as independent transactions", async () => {
    const PrimaryEventRecord = Entity.create({
      name: "_PostCommitDispatchPrimaryEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const PostCommitEventRecord = Entity.create({
      name: "_PostCommitDispatchEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const SideEffectEventRecord = Entity.create({
      name: "_SideEffectDispatchEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const PrimaryWrite = Entity.create({
      name: "PostCommitDispatchPrimaryWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const PostCommitWrite = Entity.create({
      name: "PostCommitDispatchWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const SideEffectWrite = Entity.create({
      name: "SideEffectDispatchWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });

    const postCommitDispatch = EventSource.create({
      name: "postCommitDispatchTarget",
      entity: PostCommitEventRecord,
      mapEventData: () => ({ kind: "postCommit" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("PostCommitDispatchWrite", { value: "postCommit" });
      },
    });
    const sideEffectDispatch = EventSource.create({
      name: "sideEffectDispatchTarget",
      entity: SideEffectEventRecord,
      mapEventData: () => ({ kind: "sideEffect" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("SideEffectDispatchWrite", { value: "sideEffect" });
      },
    });
    const primary = EventSource.create({
      name: "postCommitDispatchPrimary",
      entity: PrimaryEventRecord,
      mapEventData: () => ({ kind: "primary" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("PostCommitDispatchPrimaryWrite", { value: "primary" });
      },
      postCommit: async function(this: Controller) {
        const result = await this.dispatch(postCommitDispatch, {});
        if (result.error) throw result.error;
        return { postCommitDispatch: "ok" };
      },
    });
    const sideEffect = RecordMutationSideEffect.create({
      name: "dispatch-from-record-side-effect",
      record: PrimaryWrite,
      content: async function(this: Controller) {
        const result = await this.dispatch(sideEffectDispatch, {});
        if (result.error) throw result.error;
        return "ok";
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [PrimaryWrite, PostCommitWrite, SideEffectWrite],
      relations: [],
      eventSources: [primary, postCommitDispatch, sideEffectDispatch],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    const result = await controller.dispatch(primary, {});
    const primaryWrites = await system.storage.find("PostCommitDispatchPrimaryWrite", undefined, undefined, ["*"]);
    const postCommitWrites = await system.storage.find("PostCommitDispatchWrite", undefined, undefined, ["*"]);
    const sideEffectWrites = await system.storage.find("SideEffectDispatchWrite", undefined, undefined, ["*"]);

    expect(result.error).toBeUndefined();
    expect(result.context).toMatchObject({ postCommitDispatch: "ok" });
    expect(result.sideEffects?.["dispatch-from-record-side-effect"]?.result).toBe("ok");
    expect(primaryWrites).toHaveLength(1);
    expect(postCommitWrites).toHaveLength(1);
    expect(sideEffectWrites).toHaveLength(1);
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

  test("exposes transaction error helpers across wrapped error chains", async () => {
    const businessError = new Error("business rule failed");
    Object.assign(businessError, { code: "BILLING_LIMIT" });

    expect(hasErrorCode({ causedBy: { error: businessError } }, "BILLING_LIMIT")).toBe(true);

    try {
      await runWithTransactionRetry(
        "retry-helper-test",
        async () => {
          const error = new Error("serialization failure");
          Object.assign(error, { code: "40001" });
          throw error;
        },
        { maxAttempts: 1 }
      );
      throw new Error("Expected retry-helper-test to fail");
    } catch (error) {
      expect(isTransactionRetryExhaustedError(error)).toBe(true);
      expect(hasErrorCode(error, "40001")).toBe(true);
      expect((error as any).transactionAttempts).toBe(1);
      expect((error as any).transactionIsolation).toBe("READ COMMITTED");
      expect((error as any).transactionName).toBe("retry-helper-test");
    }
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
