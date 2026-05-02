import { describe, expect, test } from "vitest";
import {
  Action,
  BoolExp,
  Condition,
  Controller,
  Custom,
  Dictionary,
  Entity,
  EventSource,
  hasErrorCode,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  RecordMutationSideEffect,
  Relation,
  StateMachine,
  StateNode,
  StateTransfer,
  Summation,
  Transform,
} from "interaqt";
import { PGLiteDB } from "@drivers";

class NoopTransactionPGLiteDB extends PGLiteDB {
  async runInTransaction<T>(_options: unknown, fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

class TrackedTransactionPGLiteDB extends PGLiteDB {
  private activeTransactionId?: string;
  private nextTransactionId = 0;
  public transactionOperationIds: Array<string | undefined> = [];

  async runInTransaction<T>(_options: unknown, fn: () => Promise<T>): Promise<T> {
    const previous = this.activeTransactionId;
    this.activeTransactionId = `tx-${++this.nextTransactionId}`;
    try {
      await super.scheme("BEGIN", "tracked transaction");
      try {
        const result = await fn();
        await super.scheme("COMMIT", "tracked transaction");
        return result;
      } catch (error) {
        await super.scheme("ROLLBACK", "tracked transaction");
        throw error;
      }
    } finally {
      this.activeTransactionId = previous;
    }
  }

  private recordTransactionOperation() {
    if (this.activeTransactionId) {
      this.transactionOperationIds.push(this.activeTransactionId);
    }
  }

  async query<T>(sql: string, params: unknown[] = [], name = "") {
    this.recordTransactionOperation();
    return super.query<T>(sql, params, name);
  }

  async insert(sql: string, values: unknown[], name = "") {
    this.recordTransactionOperation();
    return super.insert(sql, values, name);
  }

  async update<T>(sql: string, values: unknown[], idField?: string, name = "") {
    this.recordTransactionOperation();
    return super.update<T>(sql, values, idField, name);
  }

  async delete<T>(sql: string, params: unknown[], name = "") {
    this.recordTransactionOperation();
    return super.delete<T>(sql, params, name);
  }

  async scheme(sql: string, name = "") {
    this.recordTransactionOperation();
    return super.scheme(sql, name);
  }
}

async function expectRollbackContractToCatchNoopDriver() {
  const EventRecord = Entity.create({
    name: "_NoopTransactionContractEvent_",
    properties: [Property.create({ name: "kind", type: "string" })],
  });
  const Write = Entity.create({
    name: "NoopTransactionContractWrite",
    properties: [Property.create({ name: "value", type: "string" })],
  });
  const source = EventSource.create<any, void>({
    name: "noopTransactionContractSource",
    entity: EventRecord,
    mapEventData: () => ({ kind: "noop" }),
    resolve: async function(this: Controller) {
      await this.system.storage.create("NoopTransactionContractWrite", { value: "leaked" });
      throw new Error("force rollback");
    },
  });

  const system = new MonoSystem(new NoopTransactionPGLiteDB());
  system.conceptClass = KlassByName;
  const controller = new Controller({
    system,
    entities: [Write],
    relations: [],
    eventSources: [source],
  });
  await controller.setup(true);

  await controller.dispatch(source, {});
  const eventRows = await system.storage.find("_NoopTransactionContractEvent_", undefined, undefined, ["*"]);
  const writes = await system.storage.find("NoopTransactionContractWrite", undefined, undefined, ["*"]);
  await system.destroy();

  if (eventRows.length > 0 || writes.length > 0) {
    throw new Error("transaction contract violation: driver does not rollback failed dispatch");
  }
}

describe("dispatch transaction acceptance", () => {
  test("does not create event records when Interaction conditions or EventSource guard reject", async () => {
    const User = Entity.create({
      name: "TxnAcceptanceConditionUser",
      properties: [Property.create({ name: "credits", type: "number" })],
    });
    const Protected = Entity.create({
      name: "TxnAcceptanceProtected",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const GuardEventRecord = Entity.create({
      name: "_TxnAcceptanceGuardEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const hasCredits = Condition.create({
      name: "txnAcceptanceHasCredits",
      content: async function(this: Controller, event: any) {
        const user = await this.system.storage.findOne(
          "TxnAcceptanceConditionUser",
          BoolExp.atom({ key: "id", value: ["=", event.user.id] }),
          undefined,
          ["credits"]
        );
        return user.credits > 0;
      },
    });
    const protectedAction = Interaction.create({
      name: "txnAcceptanceProtectedAction",
      action: Action.create({ name: "txnAcceptanceProtectedAction" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "protected", type: "Entity", base: Protected })],
      }),
      conditions: hasCredits,
    });
    const guarded = EventSource.create({
      name: "txnAcceptanceGuarded",
      entity: GuardEventRecord,
      guard: async () => {
        throw new Error("guard rejected");
      },
      mapEventData: () => ({ kind: "guarded" }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [User, Protected],
      relations: [],
      eventSources: [protectedAction, guarded],
    });
    await controller.setup(true);
    const user = await system.storage.create("TxnAcceptanceConditionUser", { credits: 0 });

    const conditionResult = await controller.dispatch(protectedAction, {
      user,
      payload: { protected: { value: "blocked" } },
    });
    const guardResult = await controller.dispatch(guarded, {});

    const interactionEvents = await system.storage.find(
      InteractionEventEntity.name,
      MatchExp.atom({ key: "interactionName", value: ["=", protectedAction.name] }),
      undefined,
      ["*"]
    );
    const guardEvents = await system.storage.find("_TxnAcceptanceGuardEvent_", undefined, undefined, ["*"]);

    expect(conditionResult.error).toBeDefined();
    expect(guardResult.error).toBeDefined();
    expect(interactionEvents).toHaveLength(0);
    expect(guardEvents).toHaveLength(0);
    await system.destroy();
  });

  test("rolls back when mapEventData or resolve fail", async () => {
    const MapEventRecord = Entity.create({
      name: "_TxnAcceptanceMapEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const ResolveEventRecord = Entity.create({
      name: "_TxnAcceptanceResolveEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const ResolveWrite = Entity.create({
      name: "TxnAcceptanceResolveWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const failInMap = EventSource.create<any, void>({
      name: "txnAcceptanceFailInMap",
      entity: MapEventRecord,
      mapEventData: () => {
        throw new Error("map failed");
      },
    });
    const failInResolve = EventSource.create<any, void>({
      name: "txnAcceptanceFailInResolve",
      entity: ResolveEventRecord,
      mapEventData: () => ({ kind: "resolve" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("TxnAcceptanceResolveWrite", { value: "before-error" });
        throw new Error("resolve failed");
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [ResolveWrite],
      relations: [],
      eventSources: [failInMap, failInResolve],
    });
    await controller.setup(true);

    const mapResult = await controller.dispatch(failInMap, {});
    const resolveResult = await controller.dispatch(failInResolve, {});

    expect(mapResult.error).toBeDefined();
    expect(resolveResult.error).toBeDefined();
    expect(await system.storage.find("_TxnAcceptanceMapEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("_TxnAcceptanceResolveEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("TxnAcceptanceResolveWrite", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("rejects nested dispatch from mapEventData before creating the outer event", async () => {
    let controller: Controller;
    const InnerEvent = Entity.create({
      name: "_TxnAcceptanceMapNestedInnerEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const OuterEvent = Entity.create({
      name: "_TxnAcceptanceMapNestedOuterEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const inner = EventSource.create({
      name: "txnAcceptanceMapNestedInner",
      entity: InnerEvent,
      mapEventData: () => ({ kind: "inner" }),
    });
    const outer = EventSource.create({
      name: "txnAcceptanceMapNestedOuter",
      entity: OuterEvent,
      mapEventData: async () => {
        await controller.dispatch(inner, {});
        return { kind: "outer" };
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

    const result = await controller.dispatch(outer, {});

    expect(result.error).toBeDefined();
    expect(await system.storage.find("_TxnAcceptanceMapNestedOuterEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("_TxnAcceptanceMapNestedInnerEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("rolls back event and resolve writes when afterDispatch throws", async () => {
    const EventRecord = Entity.create({
      name: "_TxnAcceptanceAfterDispatchRollbackEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const Write = Entity.create({
      name: "TxnAcceptanceAfterDispatchRollbackWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const source = EventSource.create({
      name: "txnAcceptanceAfterDispatchRollback",
      entity: EventRecord,
      mapEventData: () => ({ kind: "afterDispatch" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("TxnAcceptanceAfterDispatchRollbackWrite", { value: "before-error" });
      },
      afterDispatch: async () => {
        throw new Error("afterDispatch failed");
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Write],
      relations: [],
      eventSources: [source],
    });
    await controller.setup(true);

    const result = await controller.dispatch(source, {});

    expect(result.error).toBeDefined();
    expect(await system.storage.find("_TxnAcceptanceAfterDispatchRollbackEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("TxnAcceptanceAfterDispatchRollbackWrite", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("rolls back event, derived rows, state, and aggregations when a downstream computation fails", async () => {
    const newState = StateNode.create({ name: "new" });
    const acceptedState = StateNode.create({ name: "accepted" });
    const Source = Entity.create({
      name: "TxnAcceptanceSource",
      properties: [
        Property.create({ name: "amount", type: "number" }),
        Property.create({
          name: "status",
          type: "string",
          computation: StateMachine.create({
            states: [newState, acceptedState],
            initialState: newState,
            transfers: [
              StateTransfer.create({
                trigger: { recordName: "TxnAcceptanceSource", type: "create" },
                current: newState,
                next: acceptedState,
                computeTarget: (event: any) => ({ id: event.record.id }),
              }),
            ],
          }),
        }),
      ],
    });
    const Derived = Entity.create({
      name: "TxnAcceptanceDerived",
      properties: [
        Property.create({ name: "sourceId", type: "string" }),
        Property.create({ name: "amount", type: "number" }),
      ],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["id", "amount"],
        callback: (source: any) => ({ sourceId: source.id, amount: source.amount }),
      }),
    });
    const total = Dictionary.create({
      name: "txnAcceptanceDerivedTotal",
      type: "number",
      collection: false,
      computation: Summation.create({
        record: Derived,
        attributeQuery: ["amount"],
      }),
    });
    const failingCheck = Dictionary.create({
      name: "txnAcceptanceFailingCheck",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "TxnAcceptanceFailingCheck",
        dataDeps: {
          derived: { type: "records", source: Derived, attributeQuery: ["amount"] },
        },
        compute: async (dataDeps: any) => {
          if ((dataDeps.derived || []).some((item: any) => item.amount === 13)) {
            throw new Error("downstream computation failed");
          }
          return 0;
        },
        getInitialValue: () => 0,
      }),
    });
    const CreateSource = Interaction.create({
      name: "txnAcceptanceCreateSource",
      action: Action.create({ name: "txnAcceptanceCreateSource" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "source", type: "Entity", base: Source })],
      }),
    });
    CreateSource.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("TxnAcceptanceSource", event.payload.source);
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source, Derived],
      relations: [],
      eventSources: [CreateSource],
      dict: [total, failingCheck],
    });
    await controller.setup(true);

    const result = await controller.dispatch(CreateSource, {
      user: { id: "tester" },
      payload: { source: { amount: 13 } },
    });

    expect(result.error).toBeDefined();
    expect(await system.storage.find("TxnAcceptanceSource", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("TxnAcceptanceDerived", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.dict.get("txnAcceptanceDerivedTotal")).toBe(0);
    const events = await system.storage.find(
      InteractionEventEntity.name,
      MatchExp.atom({ key: "interactionName", value: ["=", CreateSource.name] }),
      undefined,
      ["*"]
    );
    expect(events).toHaveLength(0);
    await system.destroy();
  });

  test("successful dispatch drains event, transform, state machine, and summation before returning", async () => {
    const newState = StateNode.create({ name: "successNew" });
    const acceptedState = StateNode.create({ name: "successAccepted" });
    const Source = Entity.create({
      name: "TxnAcceptanceSuccessSource",
      properties: [
        Property.create({ name: "amount", type: "number" }),
        Property.create({
          name: "status",
          type: "string",
          computation: StateMachine.create({
            states: [newState, acceptedState],
            initialState: newState,
            transfers: [
              StateTransfer.create({
                trigger: { recordName: "TxnAcceptanceSuccessSource", type: "create" },
                current: newState,
                next: acceptedState,
                computeTarget: (event: any) => ({ id: event.record.id }),
              }),
            ],
          }),
        }),
      ],
    });
    const Derived = Entity.create({
      name: "TxnAcceptanceSuccessDerived",
      properties: [Property.create({ name: "amount", type: "number" })],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["amount"],
        callback: (source: any) => ({ amount: source.amount }),
      }),
    });
    const total = Dictionary.create({
      name: "txnAcceptanceSuccessTotal",
      type: "number",
      collection: false,
      computation: Summation.create({ record: Derived, attributeQuery: ["amount"] }),
    });
    const CreateSource = Interaction.create({
      name: "txnAcceptanceSuccessCreate",
      action: Action.create({ name: "txnAcceptanceSuccessCreate" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "source", type: "Entity", base: Source })],
      }),
    });
    CreateSource.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("TxnAcceptanceSuccessSource", event.payload.source);
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source, Derived],
      relations: [],
      eventSources: [CreateSource],
      dict: [total],
    });
    await controller.setup(true);

    const result = await controller.dispatch(CreateSource, {
      user: { id: "tester" },
      payload: { source: { amount: 8 } },
    });
    const sources = await system.storage.find("TxnAcceptanceSuccessSource", undefined, undefined, ["*"]);
    const derived = await system.storage.find("TxnAcceptanceSuccessDerived", undefined, undefined, ["*"]);

    expect(result.error).toBeUndefined();
    expect(sources).toHaveLength(1);
    expect(sources[0].status).toBe("successAccepted");
    expect(derived).toHaveLength(1);
    expect(await system.storage.dict.get("txnAcceptanceSuccessTotal")).toBe(8);
    await system.destroy();
  });

  test("direct storage mutations still open an atomic transaction and trigger synchronous computations", async () => {
    const Item = Entity.create({
      name: "TxnAcceptanceDirectStorageItem",
      properties: [Property.create({ name: "amount", type: "number" })],
    });
    const total = Dictionary.create({
      name: "txnAcceptanceDirectStorageTotal",
      type: "number",
      collection: false,
      computation: Summation.create({ record: Item, attributeQuery: ["amount"] }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      dict: [total],
    });
    await controller.setup(true);

    const item = await system.storage.create("TxnAcceptanceDirectStorageItem", { amount: 10 });
    await system.storage.update(
      "TxnAcceptanceDirectStorageItem",
      MatchExp.atom({ key: "id", value: ["=", item.id] }),
      { amount: 12 }
    );
    await system.storage.create("TxnAcceptanceDirectStorageItem", { amount: 3 });

    expect(await system.storage.dict.get("txnAcceptanceDirectStorageTotal")).toBe(15);
    await system.destroy();
  });

  test("rolls back relation rows and relation-based aggregations when downstream computation fails", async () => {
    const Customer = Entity.create({
      name: "TxnAcceptanceRelationCustomer",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Purchase = Entity.create({
      name: "TxnAcceptanceRelationPurchase",
      properties: [
        Property.create({ name: "amount", type: "number" }),
        Property.create({ name: "label", type: "string" }),
      ],
    });
    const CustomerPurchase = Relation.create({
      name: "TxnAcceptanceCustomerPurchase",
      source: Customer,
      sourceProperty: "purchases",
      target: Purchase,
      targetProperty: "customer",
      type: "1:n",
    });
    Customer.properties.push(Property.create({
      name: "purchaseTotal",
      type: "number",
      computation: Summation.create({ property: "purchases", attributeQuery: ["amount"] }),
    }));
    const relationGuard = Dictionary.create({
      name: "txnAcceptanceRelationGuard",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "TxnAcceptanceRelationGuard",
        dataDeps: {
          links: { type: "records", source: CustomerPurchase, attributeQuery: ["source", "target"] },
        },
        compute: async (dataDeps: any) => {
          if ((dataDeps.links || []).length > 0) {
            throw new Error("relation downstream failed");
          }
          return 0;
        },
        getInitialValue: () => 0,
      }),
    });
    const AddPurchase = EventSource.create({
      name: "txnAcceptanceRelationAddPurchase",
      entity: Entity.create({
        name: "_TxnAcceptanceRelationEvent_",
        properties: [Property.create({ name: "kind", type: "string" })],
      }),
      mapEventData: () => ({ kind: "relation" }),
      resolve: async function(this: Controller) {
        const customer = await this.system.storage.create("TxnAcceptanceRelationCustomer", { name: "Ada" });
        await this.system.storage.create("TxnAcceptanceRelationPurchase", {
          amount: 25,
          label: "book",
          customer,
        });
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Customer, Purchase],
      relations: [CustomerPurchase],
      eventSources: [AddPurchase],
      dict: [relationGuard],
    });
    await controller.setup(true);

    const result = await controller.dispatch(AddPurchase, {});

    expect(result.error).toBeDefined();
    expect(await system.storage.find("TxnAcceptanceRelationCustomer", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("TxnAcceptanceRelationPurchase", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.findRelationByName("TxnAcceptanceCustomerPurchase", undefined, undefined, ["*"])).toHaveLength(0);
    expect(await system.storage.find("_TxnAcceptanceRelationEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("all dispatch callbacks and computations share one transaction view", async () => {
    const Source = Entity.create({
      name: "TxnAcceptanceViewSource",
      properties: [Property.create({ name: "amount", type: "number" })],
    });
    const seen: unknown[] = [];
    const observedTotals: number[] = [];
    const total = Dictionary.create({
      name: "txnAcceptanceViewTotal",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "TxnAcceptanceViewTotal",
        dataDeps: {
          sources: { type: "records", source: Source, attributeQuery: ["amount"] },
        },
        compute: async function(this: { controller: Controller }, dataDeps: any) {
          seen.push(["custom", this.controller.system.storage.getTransactionIsolation()]);
          observedTotals.push((dataDeps.sources || []).reduce((sum: number, item: any) => sum + item.amount, 0));
          return observedTotals.at(-1);
        },
        getInitialValue: () => 0,
      }),
    });
    const CreateSource = EventSource.create({
      name: "txnAcceptanceViewCreate",
      entity: Entity.create({
        name: "_TxnAcceptanceViewEvent_",
        properties: [Property.create({ name: "kind", type: "string" })],
      }),
      guard: async function(this: Controller) {
        seen.push(["guard", this.system.storage.getTransactionIsolation()]);
      },
      mapEventData: () => {
        seen.push(["mapEventData", system.storage.getTransactionIsolation()]);
        return { kind: "view" };
      },
      resolve: async function(this: Controller) {
        seen.push(["resolve", this.system.storage.getTransactionIsolation()]);
        await this.system.storage.create("TxnAcceptanceViewSource", { amount: 5 });
      },
      afterDispatch: async function(this: Controller) {
        seen.push(["afterDispatch", this.system.storage.getTransactionIsolation()]);
        const records = await this.system.storage.find("TxnAcceptanceViewSource", undefined, undefined, ["amount"]);
        return { afterDispatchTotal: records.reduce((sum: number, item: any) => sum + item.amount, 0) };
      },
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source],
      relations: [],
      eventSources: [CreateSource],
      dict: [total],
    });
    await controller.setup(true);
    seen.length = 0;
    observedTotals.length = 0;

    const result = await controller.dispatch(CreateSource, {});

    expect(result.error).toBeUndefined();
    expect(result.context).toEqual({ afterDispatchTotal: 5 });
    expect(observedTotals).toContain(5);
    expect(seen).toEqual(expect.arrayContaining([
      ["guard", "READ COMMITTED"],
      ["mapEventData", "READ COMMITTED"],
      ["resolve", "READ COMMITTED"],
      ["guard", "SERIALIZABLE"],
      ["mapEventData", "SERIALIZABLE"],
      ["resolve", "SERIALIZABLE"],
      ["custom", "SERIALIZABLE"],
      ["afterDispatch", "SERIALIZABLE"],
    ]));
    await system.destroy();
  });

  test("driver-level transaction-bound operations use the same transaction context", async () => {
    const db = new TrackedTransactionPGLiteDB();
    const Source = Entity.create({
      name: "TxnAcceptanceTrackedSource",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const CreateSource = EventSource.create({
      name: "txnAcceptanceTrackedCreate",
      entity: Entity.create({
        name: "_TxnAcceptanceTrackedEvent_",
        properties: [Property.create({ name: "kind", type: "string" })],
      }),
      mapEventData: () => ({ kind: "tracked" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("TxnAcceptanceTrackedSource", { value: "tracked" });
        await this.system.storage.find("TxnAcceptanceTrackedSource", undefined, undefined, ["*"]);
      },
    });
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source],
      relations: [],
      eventSources: [CreateSource],
    });
    await controller.setup(true);
    db.transactionOperationIds = [];

    const result = await controller.dispatch(CreateSource, {});
    const uniqueTransactionIds = new Set(db.transactionOperationIds);

    expect(result.error).toBeUndefined();
    expect(db.transactionOperationIds.length).toBeGreaterThan(1);
    expect(uniqueTransactionIds.size).toBe(1);
    expect(uniqueTransactionIds.has(undefined)).toBe(false);
    await system.destroy();
  });

  test("default result mode and forceThrowDispatchError preserve business error codes", async () => {
    const EventRecord = Entity.create({
      name: "_TxnAcceptanceErrorEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const throwBusinessError = EventSource.create<any, void>({
      name: "txnAcceptanceBusinessError",
      entity: EventRecord,
      mapEventData: () => ({ kind: "business" }),
      resolve: async () => {
        const error = new Error("billing limit reached");
        Object.assign(error, { code: "BILLING_LIMIT" });
        throw error;
      },
    });

    const defaultSystem = new MonoSystem(new PGLiteDB());
    defaultSystem.conceptClass = KlassByName;
    const defaultController = new Controller({
      system: defaultSystem,
      entities: [],
      relations: [],
      eventSources: [throwBusinessError],
    });
    await defaultController.setup(true);

    const throwingSystem = new MonoSystem(new PGLiteDB());
    throwingSystem.conceptClass = KlassByName;
    const throwingController = new Controller({
      system: throwingSystem,
      entities: [],
      relations: [],
      eventSources: [throwBusinessError],
      forceThrowDispatchError: true,
    });
    await throwingController.setup(true);

    const result = await defaultController.dispatch(throwBusinessError, {});
    expect(hasErrorCode(result.error, "BILLING_LIMIT")).toBe(true);
    await expect(throwingController.dispatch(throwBusinessError, {})).rejects.toSatisfy((error: unknown) => {
      expect(hasErrorCode(error, "BILLING_LIMIT")).toBe(true);
      return true;
    });

    await defaultSystem.destroy();
    await throwingSystem.destroy();
  });

  test("computation error wrapping keeps business error codes discoverable", async () => {
    const Source = Entity.create({
      name: "TxnAcceptanceWrappedErrorSource",
      properties: [Property.create({ name: "value", type: "number" })],
    });
    const failing = Dictionary.create({
      name: "txnAcceptanceWrappedErrorDict",
      type: "number",
      collection: false,
      computation: Custom.create({
        name: "TxnAcceptanceWrappedErrorComputation",
        dataDeps: {
          sources: { type: "records", source: Source, attributeQuery: ["value"] },
        },
        compute: async (dataDeps: any) => {
          if ((dataDeps.sources || []).some((source: any) => source.value === 1)) {
            const error = new Error("ledger invariant failed");
            Object.assign(error, { code: "LEDGER_INVARIANT" });
            throw error;
          }
          return 0;
        },
        getInitialValue: () => 0,
      }),
    });
    const AddSource = EventSource.create({
      name: "txnAcceptanceWrappedErrorAdd",
      entity: Entity.create({
        name: "_TxnAcceptanceWrappedErrorEvent_",
        properties: [Property.create({ name: "kind", type: "string" })],
      }),
      mapEventData: () => ({ kind: "wrapped" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("TxnAcceptanceWrappedErrorSource", { value: 1 });
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source],
      relations: [],
      eventSources: [AddSource],
      dict: [failing],
    });
    await controller.setup(true);

    const result = await controller.dispatch(AddSource, {});

    expect(result.error).toBeDefined();
    expect(hasErrorCode(result.error, "LEDGER_INVARIANT")).toBe(true);
    await system.destroy();
  });

  test("record side-effect dispatch failure is isolated from the committed outer dispatch", async () => {
    const OuterEvent = Entity.create({
      name: "_TxnAcceptanceSideEffectOuterEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const InnerEvent = Entity.create({
      name: "_TxnAcceptanceSideEffectInnerEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const OuterWrite = Entity.create({
      name: "TxnAcceptanceSideEffectOuterWrite",
      properties: [Property.create({ name: "value", type: "string" })],
    });
    const inner = EventSource.create<any, void>({
      name: "txnAcceptanceSideEffectInner",
      entity: InnerEvent,
      mapEventData: () => ({ kind: "inner" }),
      resolve: async () => {
        throw new Error("inner dispatch failed");
      },
    });
    const outer = EventSource.create({
      name: "txnAcceptanceSideEffectOuter",
      entity: OuterEvent,
      mapEventData: () => ({ kind: "outer" }),
      resolve: async function(this: Controller) {
        await this.system.storage.create("TxnAcceptanceSideEffectOuterWrite", { value: "committed" });
      },
    });
    const sideEffect = RecordMutationSideEffect.create({
      name: "txn-acceptance-failing-dispatch-side-effect",
      record: OuterWrite,
      content: async function(this: Controller) {
        const result = await this.dispatch(inner, {});
        if (result.error) throw result.error;
      },
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [OuterWrite],
      relations: [],
      eventSources: [outer, inner],
      recordMutationSideEffects: [sideEffect],
    });
    await controller.setup(true);

    const result = await controller.dispatch(outer, {});

    expect(result.error).toBeUndefined();
    expect(result.sideEffects?.["txn-acceptance-failing-dispatch-side-effect"]?.error).toBeDefined();
    expect(await system.storage.find("TxnAcceptanceSideEffectOuterWrite", undefined, undefined, ["*"])).toHaveLength(1);
    expect(await system.storage.find("_TxnAcceptanceSideEffectInnerEvent_", undefined, undefined, ["*"])).toHaveLength(0);
    await system.destroy();
  });

  test("transaction contract test catches a driver that claims transactions but does not rollback", async () => {
    await expect(expectRollbackContractToCatchNoopDriver()).rejects.toThrow("does not rollback failed dispatch");
  });
});
