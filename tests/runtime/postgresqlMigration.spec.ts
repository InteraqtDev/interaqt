import { describe, expect, test } from "vitest";
import {
  Any,
  Average,
  Controller,
  ComputationResult,
  Custom,
  Dictionary,
  Entity,
  Every,
  Expression,
  KlassByName,
  MatchExp,
  MonoSystem,
  NonNullConstraint,
  Property,
  RealTime,
  Relation,
  StateMachine,
  StateNode,
  StateTransfer,
  Transform,
  UniqueConstraint,
  WeightedSummation,
  createMigrationManifest,
  hashMigrationDiff,
  readMigrationManifest,
} from "interaqt";
import { PostgreSQLDB } from "@drivers";

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

async function approveGeneratedMigrationDiff(controller: Controller, options: {
  computationDecisions?: Record<string, "changed" | "unchanged" | "state-only" | "unrebuildable">;
} = {}) {
  const diff = await controller.generateMigrationDiff({ includeDestructiveScope: true });
  return {
    ...diff,
    status: "approved" as const,
    decisions: [
      ...diff.decisions,
      ...diff.requiredDecisions.map(requirement => {
        if (requirement.kind === "computation") {
          return {
            kind: "computation" as const,
            id: requirement.id,
            dataContext: requirement.dataContext,
            decision: options.computationDecisions?.[requirement.id] || requirement.recommendedDecision,
            reason: "approved by PostgreSQL migration test",
          };
        }
        if (requirement.kind === "event-rebuild-handler") {
          return {
            kind: "event-rebuild-handler" as const,
            dataContext: requirement.dataContext,
            handlerRef: requirement.dataContext,
            reason: "approved by PostgreSQL migration test",
          };
        }
        if (requirement.kind === "async-completion-handler") {
          return {
            kind: "async-completion-handler" as const,
            dataContext: requirement.dataContext,
            handlerRef: requirement.dataContext,
            reason: "approved by PostgreSQL migration test",
          };
        }
        if (requirement.kind === "computation-takeover") {
          return {
            kind: "computation-takeover" as const,
            dataContext: requirement.dataContext,
            computationId: requirement.computationId,
            targetType: requirement.targetType,
            previousAuthority: requirement.previousAuthority,
            nextAuthority: requirement.nextAuthority,
            oldDataStrategy: requirement.oldDataStrategy,
            expectedExistingCount: requirement.expectedExistingCount,
            expectedHostCount: requirement.expectedHostCount,
            destructiveScopeRef: requirement.destructiveScopeRef,
            reason: "approved by PostgreSQL migration test",
          };
        }
        if (requirement.kind === "empty-fact-record-removal") {
          return {
            kind: "empty-fact-record-removal" as const,
            recordName: requirement.recordName,
            tableName: requirement.tableName,
            expectedCount: requirement.expectedCount,
            reason: "approved by PostgreSQL migration test",
          };
        }
        if (requirement.kind === "scoped-sequence-seed" || requirement.kind === "scoped-sequence-no-seed") {
          return {
            ...requirement,
            reason: "approved by PostgreSQL migration test",
          };
        }
        return {
          kind: "destructive-scope" as const,
          dataContext: requirement.dataContext,
          recordName: requirement.recordName,
          ids: requirement.ids,
          reason: "approved by PostgreSQL migration test",
        };
      }),
    ],
  };
}

async function tableColumns(system: MonoSystem, tableName: string) {
  const dbHandle = (system as unknown as { db: PostgreSQLDB }).db;
  const columns = await dbHandle.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return columns.map(column => column.column_name);
}

async function tableExists(system: MonoSystem, tableName: string) {
  const dbHandle = (system as unknown as { db: PostgreSQLDB }).db;
  const rows = await dbHandle.query<{ exists: number }>(
    `SELECT 1 AS "exists" FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

describeIfPostgres("PostgreSQL migration integration", () => {
  test("runs compute migration against real PostgreSQL and persists manifest", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_compute`;
    const ProductV1 = new Entity({
      name: "PgMigrationProduct",
      properties: [
        new Property({ name: "price", type: "number" }, { uuid: "pg-migration-product-price" }),
      ],
    }, { uuid: "pg-migration-product" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    const controllerV1 = new Controller({ system: systemV1, entities: [ProductV1], relations: [] });
    await controllerV1.setup(true);
    const product = await systemV1.storage.create("PgMigrationProduct", { price: 21 });
    await systemV1.destroy();

    const doublePrice = new Custom({
      name: "PgMigrationDoublePrice",
      dataDeps: { current: { type: "property", attributeQuery: ["price"] } },
      compute: async (deps: any) => deps.current.price * 2,
    }, { uuid: "pg-migration-double-price-computation" });
    const ProductV2 = new Entity({
      name: "PgMigrationProduct",
      properties: [
        new Property({ name: "price", type: "number" }, { uuid: "pg-migration-product-price" }),
        new Property({ name: "doublePrice", type: "number", computation: doublePrice }, { uuid: "pg-migration-product-double-price" }),
      ],
    }, { uuid: "pg-migration-product" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
    const plan = await controllerV2.migrate({ approvedDiff });

    expect(plan.changedComputations.map(item => item.dataContext)).toEqual(["property:PgMigrationProduct.doublePrice"]);
    const migrated = await systemV2.storage.findOne("PgMigrationProduct", MatchExp.atom({ key: "id", value: ["=", product.id] }), undefined, ["*"]);
    expect(migrated.doublePrice).toBe(42);
    const manifest = await readMigrationManifest(controllerV2);
    expect(manifest?.modelHash).toBe(createMigrationManifest(controllerV2).modelHash);
    await systemV2.destroy();
  });

  test("runs a PostgreSQL computation safety matrix in one approved migration", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_matrix`;
    const ProductV1 = new Entity({
      name: "PgMatrixProduct",
      properties: [
        new Property({ name: "price", type: "number" }, { uuid: "pg-matrix-product-price" }),
        new Property({ name: "weight", type: "number" }, { uuid: "pg-matrix-product-weight" }),
        new Property({ name: "status", type: "string" }, { uuid: "pg-matrix-product-status" }),
      ],
    }, { uuid: "pg-matrix-product" });
    const UserV1 = new Entity({
      name: "PgMatrixUser",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "pg-matrix-user-name" })],
    }, { uuid: "pg-matrix-user" });
    const OwnsProductV1 = new Relation({
      source: UserV1,
      sourceProperty: "products",
      target: ProductV1,
      targetProperty: "owner",
      name: "PgMatrixOwnsProduct",
      type: "1:n",
    }, { uuid: "pg-matrix-owns-product" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    await new Controller({ system: systemV1, entities: [ProductV1, UserV1], relations: [OwnsProductV1] }).setup(true);
    const user = await systemV1.storage.create("PgMatrixUser", { name: "Alice" });
    const product1 = await systemV1.storage.create("PgMatrixProduct", { price: 10, weight: 1, status: "open" });
    const product2 = await systemV1.storage.create("PgMatrixProduct", { price: 20, weight: 2, status: "closed" });
    await systemV1.storage.addRelationByNameById("PgMatrixOwnsProduct", user.id, product1.id);
    await systemV1.storage.addRelationByNameById("PgMatrixOwnsProduct", user.id, product2.id);
    await systemV1.destroy();

    const ProductV2 = new Entity({
      name: "PgMatrixProduct",
      properties: [
        new Property({ name: "price", type: "number" }, { uuid: "pg-matrix-product-price" }),
        new Property({ name: "weight", type: "number" }, { uuid: "pg-matrix-product-weight" }),
        new Property({ name: "status", type: "string" }, { uuid: "pg-matrix-product-status" }),
        new Property({
          name: "doublePrice",
          type: "number",
          computation: new Custom({
            name: "PgMatrixDoublePrice",
            dataDeps: { current: { type: "property", attributeQuery: ["price"] } },
            // CAUTION 数据必须取自声明的 dataDeps：链式重建/增量路径传入的 record 只是
            //  dirty-record 骨架（可能只有 id），record.price 在这些路径下是 undefined。
            compute: async (deps: any) => deps.current.price * 2,
          }, { uuid: "pg-matrix-double-price-computation" }),
        }, { uuid: "pg-matrix-product-double-price" }),
        new Property({
          name: "clock",
          type: "number",
          computation: new RealTime({
            attributeQuery: ["price"],
            callback: async (now: Expression) => now.subtract(now).add(3),
            nextRecomputeTime: () => 1000,
          }, { uuid: "pg-matrix-realtime-property-computation" }),
        }, { uuid: "pg-matrix-product-clock" }),
        new Property({
          name: "lifecycle",
          type: "string",
          computation: new StateMachine({
            states: [
              new StateNode({ name: "new" }, { uuid: "pg-matrix-state-new" }),
              new StateNode({ name: "seen" }, { uuid: "pg-matrix-state-seen" }),
            ],
            transfers: [
              new StateTransfer({
                trigger: { recordName: "PgMatrixProduct", type: "update" },
                current: new StateNode({ name: "new" }, { uuid: "pg-matrix-state-new" }),
                next: new StateNode({ name: "seen" }, { uuid: "pg-matrix-state-seen" }),
                computeTarget: (event: any) => ({ id: event.record.id }),
              }, { uuid: "pg-matrix-state-transfer" }),
            ],
            initialState: new StateNode({ name: "new" }, { uuid: "pg-matrix-state-new" }),
          }, { uuid: "pg-matrix-state-machine-computation" }),
        }, { uuid: "pg-matrix-product-lifecycle" }),
      ],
    }, { uuid: "pg-matrix-product" });
    const UserV2 = new Entity({
      name: "PgMatrixUser",
      properties: [
        new Property({ name: "name", type: "string" }, { uuid: "pg-matrix-user-name" }),
        new Property({
          name: "avgPrice",
          type: "number",
          computation: new Average({ property: "products", attributeQuery: ["price"] }, { uuid: "pg-matrix-user-average-computation" }),
        }, { uuid: "pg-matrix-user-avg-price" }),
        new Property({
          name: "weightedPrice",
          type: "number",
          computation: new WeightedSummation({
            property: "products",
            attributeQuery: ["price", "weight"],
            callback: (product: any) => ({ value: product.price, weight: product.weight }),
          }, { uuid: "pg-matrix-user-weighted-computation" }),
        }, { uuid: "pg-matrix-user-weighted-price" }),
        new Property({
          name: "hasOpen",
          type: "boolean",
          computation: new Any({
            property: "products",
            attributeQuery: ["status"],
            callback: (product: any) => product.status === "open",
          }, { uuid: "pg-matrix-user-any-computation" }),
        }, { uuid: "pg-matrix-user-has-open" }),
        new Property({
          name: "allPriced",
          type: "boolean",
          computation: new Every({
            property: "products",
            attributeQuery: ["price"],
            callback: (product: any) => product.price > 0,
            notEmpty: true,
          }, { uuid: "pg-matrix-user-every-computation" }),
        }, { uuid: "pg-matrix-user-all-priced" }),
      ],
    }, { uuid: "pg-matrix-user" });
    const OwnsProductV2 = new Relation({
      source: UserV2,
      sourceProperty: "products",
      target: ProductV2,
      targetProperty: "owner",
      name: "PgMatrixOwnsProduct",
      type: "1:n",
    }, { uuid: "pg-matrix-owns-product" });
    const transform = new Transform({
      record: ProductV2,
      attributeQuery: ["id", "price", "status"],
      callback: (product: any) => product.status === "open" ? { price: product.price } : null,
    }, { uuid: "pg-matrix-transform-computation" });
    const OpenProductSnapshot = new Entity({
      name: "PgMatrixOpenProductSnapshot",
      properties: [new Property({ name: "price", type: "number" }, { uuid: "pg-matrix-open-snapshot-price" })],
      computation: transform,
    }, { uuid: "pg-matrix-open-snapshot" });
    const totalCount = new Dictionary({
      name: "pgMatrixProductCount",
      type: "number",
      collection: false,
      computation: new Custom({
        name: "PgMatrixAsyncCount",
        compute: async () => ComputationResult.async({ value: 2 }),
        asyncReturn: async () => 0,
      }, { uuid: "pg-matrix-async-count-computation" }),
    }, { uuid: "pg-matrix-product-count-dict" });
    const clockDict = new Dictionary({
      name: "pgMatrixClock",
      type: "number",
      collection: false,
      computation: new RealTime({
        callback: async (now: Expression) => now.subtract(now).add(5),
        nextRecomputeTime: () => 1000,
      }, { uuid: "pg-matrix-realtime-global-computation" }),
    }, { uuid: "pg-matrix-clock-dict" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({
      system: systemV2,
      entities: [ProductV2, UserV2, OpenProductSnapshot],
      relations: [OwnsProductV2],
      dict: [totalCount, clockDict],
    });
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
    const plan = await controllerV2.migrate({
      approvedDiff,
      handlers: {
        asyncCompletion: {
          "global:pgMatrixProductCount": async ({ args }: any) => args.value,
        },
        eventRebuild: {
          "property:PgMatrixProduct.lifecycle": async () => "migrated",
        },
      },
    });

    expect(plan.blockingChanges).toHaveLength(0);
    expect(plan.rebuildPlan.map(item => item.dataContext)).toEqual(expect.arrayContaining([
      "property:PgMatrixProduct.doublePrice",
      "property:PgMatrixProduct.clock",
      "property:PgMatrixProduct.lifecycle",
      "property:PgMatrixUser.avgPrice",
      "property:PgMatrixUser.weightedPrice",
      "property:PgMatrixUser.hasOpen",
      "property:PgMatrixUser.allPriced",
      "entity:PgMatrixOpenProductSnapshot",
      "global:pgMatrixProductCount",
      "global:pgMatrixClock",
    ]));
    const migratedProduct = await systemV2.storage.findOne("PgMatrixProduct", MatchExp.atom({ key: "id", value: ["=", product1.id] }), undefined, ["*"]);
    expect(migratedProduct.doublePrice).toBe(20);
    expect(migratedProduct.clock).toBe(3);
    expect(migratedProduct.lifecycle).toBe("migrated");
    const migratedUser = await systemV2.storage.findOne("PgMatrixUser", MatchExp.atom({ key: "id", value: ["=", user.id] }), undefined, ["*"]);
    expect(migratedUser.avgPrice).toBe(15);
    expect(migratedUser.weightedPrice).toBe(50);
    expect(migratedUser.hasOpen).toBe(true);
    expect(migratedUser.allPriced).toBe(true);
    expect(await systemV2.storage.dict.get("pgMatrixProductCount")).toBe(2);
    expect(await systemV2.storage.dict.get("pgMatrixClock")).toBe(5);
    const snapshots = await systemV2.storage.find("PgMatrixOpenProductSnapshot", undefined, undefined, ["price"]);
    expect(snapshots.map(item => item.price)).toEqual([10]);
    await systemV2.destroy();
  });

  test("keeps PostgreSQL dry-run read-only while reporting schema and safety gates", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_dryrun_matrix`;
    const probe = new Custom({
      name: "PgDryRunCode",
      dataDeps: { current: { type: "property", attributeQuery: ["name"] } },
      compute: async (_deps: any, record: any) => record.name.toUpperCase(),
    }, { uuid: "pg-dryrun-code-computation" });
    const ProbeV1 = new Entity({
      name: "PgDryRunProbe",
      properties: [
        new Property({ name: "name", type: "string" }, { uuid: "pg-dryrun-name" }),
        new Property({ name: "code", type: "string", computation: probe }, { uuid: "pg-dryrun-code" }),
      ],
    }, { uuid: "pg-dryrun-probe" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    await new Controller({ system: systemV1, entities: [ProbeV1], relations: [] }).setup(true);
    await systemV1.storage.create("PgDryRunProbe", { name: "a" });
    await systemV1.destroy();

    const ProbeV2 = new Entity({
      name: "PgDryRunProbe",
      properties: [
        new Property({ name: "name", type: "string" }, { uuid: "pg-dryrun-name" }),
        new Property({ name: "tag", type: "string" }, { uuid: "pg-dryrun-tag" }),
      ],
    }, { uuid: "pg-dryrun-probe" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [ProbeV2], relations: [] });
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
    const plan = await controllerV2.migrate({ approvedDiff, dryRun: true });

    expect(plan.schemaPlan?.preRecomputeDDL.some(operation => operation.kind === "add-column")).toBe(true);
    expect(plan.blockingChanges.join("\n")).toMatch(/PgDryRunProbe\.code/);
    expect(plan.blockingChanges.join("\n")).toMatch(/computed attribute physical cleanup is not supported/);
    const columns = await tableColumns(systemV2, "PgDryRunProbe");
    expect(columns).not.toContain(plan.schemaPlan!.preRecomputeDDL.find(operation => operation.logicalPath === "PgDryRunProbe.tag")?.columnName);
    await systemV2.destroy();
  });

  test("reports PostgreSQL event, async, output ownership, and fact deletion safety gates", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_safety_gates`;
    const SourceV1 = new Entity({
      name: "PgSafetySource",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "pg-safety-source-name" })],
    }, { uuid: "pg-safety-source" });
    const Throwaway = new Entity({
      name: "PgSafetyThrowaway",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "pg-safety-throwaway-name" })],
    }, { uuid: "pg-safety-throwaway" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    await new Controller({ system: systemV1, entities: [SourceV1, Throwaway], relations: [] }).setup(true);
    await systemV1.storage.create("PgSafetySource", { name: "A" });
    await systemV1.storage.create("PgSafetyThrowaway", { name: "must block" });
    await systemV1.destroy();

    const SourceV2 = new Entity({
      name: "PgSafetySource",
      properties: [
        new Property({ name: "name", type: "string" }, { uuid: "pg-safety-source-name" }),
        new Property({
          name: "status",
          type: "string",
          computation: new StateMachine({
            states: [
              new StateNode({ name: "open" }, { uuid: "pg-safety-open" }),
              new StateNode({ name: "closed" }, { uuid: "pg-safety-closed" }),
            ],
            transfers: [
              new StateTransfer({
                trigger: { recordName: "PgSafetySource", type: "update" },
                current: new StateNode({ name: "open" }, { uuid: "pg-safety-open" }),
                next: new StateNode({ name: "closed" }, { uuid: "pg-safety-closed" }),
                computeTarget: (event: any) => ({ id: event.record.id }),
              }, { uuid: "pg-safety-transfer" }),
            ],
            initialState: new StateNode({ name: "open" }, { uuid: "pg-safety-open" }),
          }, { uuid: "pg-safety-state-machine" }),
        }, { uuid: "pg-safety-status" }),
        new Property({
          name: "asyncValue",
          type: "number",
          computation: new Custom({
            name: "PgSafetyAsync",
            compute: async () => ComputationResult.async({ value: 1 }),
            asyncReturn: async () => 0,
          }, { uuid: "pg-safety-async-computation" }),
        }, { uuid: "pg-safety-async-value" }),
      ],
    }, { uuid: "pg-safety-source" });
    const customEntity = new Custom({
      name: "PgSafetyCustomEntity",
      compute: async () => [{ label: "unsafe" }],
    }, { uuid: "pg-safety-custom-entity-computation" });
    const UnsafeOutput = new Entity({
      name: "PgSafetyUnsafeOutput",
      properties: [new Property({ name: "label", type: "string" }, { uuid: "pg-safety-unsafe-label" })],
      computation: customEntity,
    }, { uuid: "pg-safety-unsafe-output" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [SourceV2, UnsafeOutput], relations: [] });
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);

    await expect(controllerV2.migrate({ approvedDiff, dryRun: true })).rejects.toThrow(/Missing migration (event rebuild|async completion) handler/);
    const plan = await controllerV2.migrate({
      approvedDiff,
      dryRun: true,
      handlers: {
        eventRebuild: {
          "property:PgSafetySource.status": async () => "open",
        },
        asyncCompletion: {
          "property:PgSafetySource.asyncValue": async ({ args }: any) => args.value,
        },
      },
    });
    const blocking = plan.blockingChanges.join("\n");
    expect(blocking).toMatch(/unsupported-destructive-schema-change: PgSafetyThrowaway/);
    expect(blocking).toMatch(/entity:PgSafetyUnsafeOutput/);
    expect(blocking).toMatch(/data-based Transform with sourceRecordId and transformIndex/);
    await systemV2.destroy();
  });

  test("drops approved empty fact tables on PostgreSQL", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_empty_fact_cleanup`;
    const ProductV1 = new Entity({
      name: "PgEmptyFactProduct",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "pg-empty-fact-product-name" })],
    }, { uuid: "pg-empty-fact-product" });
    const RetiredV1 = new Entity({
      name: "PgEmptyFactRetired",
      properties: [new Property({ name: "note", type: "string" }, { uuid: "pg-empty-fact-retired-note" })],
    }, { uuid: "pg-empty-fact-retired" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    await new Controller({ system: systemV1, entities: [ProductV1, RetiredV1], relations: [] }).setup(true);
    expect(await tableExists(systemV1, "PgEmptyFactRetired")).toBe(true);
    await systemV1.destroy();

    const ProductV2 = new Entity({
      name: "PgEmptyFactProduct",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "pg-empty-fact-product-name" })],
    }, { uuid: "pg-empty-fact-product" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
    const diff = await controllerV2.generateMigrationDiff();
    expect(diff.requiredDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "empty-fact-record-removal", recordName: "PgEmptyFactRetired", expectedCount: 0 }),
    ]));
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
    const plan = await controllerV2.migrate({ approvedDiff });

    expect(plan.schemaPlan?.postRecomputeDDL).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "drop-empty-fact-table", logicalPath: "PgEmptyFactRetired" }),
    ]));
    expect(await tableExists(systemV2, "PgEmptyFactRetired")).toBe(false);
    await systemV2.destroy();
  });

  test("creates PostgreSQL post-recompute constraints after a combined backfill", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_constraints_matrix`;
    const AccountV1 = new Entity({
      name: "PgConstraintMatrixAccount",
      properties: [
        new Property({ name: "email", type: "string" }, { uuid: "pg-constraint-matrix-email" }),
      ],
    }, { uuid: "pg-constraint-matrix-account" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    await new Controller({ system: systemV1, entities: [AccountV1], relations: [] }).setup(true);
    await systemV1.storage.create("PgConstraintMatrixAccount", { email: "a@example.com" });
    await systemV1.destroy();

    const normalizedEmail = new Custom({
      name: "PgConstraintMatrixNormalizedEmail",
      dataDeps: { current: { type: "property", attributeQuery: ["email"] } },
      compute: async (_deps: any, record: any) => record.email.toLowerCase(),
    }, { uuid: "pg-constraint-matrix-normalized-computation" });
    const AccountV2 = new Entity({
      name: "PgConstraintMatrixAccount",
      properties: [
        new Property({ name: "email", type: "string" }, { uuid: "pg-constraint-matrix-email" }),
        new Property({ name: "normalizedEmail", type: "string", computation: normalizedEmail }, { uuid: "pg-constraint-matrix-normalized" }),
      ],
      constraints: [
        new NonNullConstraint({ name: "normalized_email_required", property: "normalizedEmail" }, { uuid: "pg-constraint-matrix-normalized-not-null" }),
        new UniqueConstraint({ name: "normalized_email_unique", properties: ["normalizedEmail"] }, { uuid: "pg-constraint-matrix-normalized-unique" }),
      ],
    }, { uuid: "pg-constraint-matrix-account" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [AccountV2], relations: [] });
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
    const plan = await controllerV2.migrate({ approvedDiff });

    // 只断言本实体的两条用户约束：schema 级 verificationDDL 还包含系统表约束
    // （如 r31 起 _Dictionary_ key 的唯一守恒律），精确总数断言会随系统约束演化而脆化。
    expect(plan.schemaPlan?.verificationDDL.filter(operation => operation.logicalPath?.startsWith("PgConstraintMatrixAccount"))).toHaveLength(2);
    expect(plan.schemaPlan?.postRecomputeDDL.length).toBeGreaterThanOrEqual(2);
    const migrated = await systemV2.storage.findOne("PgConstraintMatrixAccount", undefined, undefined, ["*"]);
    expect(migrated.normalizedEmail).toBe("a@example.com");
    await expect(systemV2.storage.create("PgConstraintMatrixAccount", { email: "b@example.com", normalizedEmail: null })).rejects.toThrow();
    await expect(systemV2.storage.create("PgConstraintMatrixAccount", { email: "c@example.com", normalizedEmail: "a@example.com" })).rejects.toThrow();
    await systemV2.destroy();
  });

  test("resumes PostgreSQL schema migration using operation log", async () => {
    const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_resume`;
    const ProductV1 = new Entity({
      name: "PgMigrationResumeProduct",
      properties: [
        new Property({ name: "name", type: "string" }, { uuid: "pg-migration-resume-name" }),
      ],
    }, { uuid: "pg-migration-resume-product" });
    const systemV1 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV1.conceptClass = KlassByName;
    await new Controller({ system: systemV1, entities: [ProductV1], relations: [] }).setup(true);
    await systemV1.destroy();

    const ProductV2 = new Entity({
      name: "PgMigrationResumeProduct",
      properties: [
        new Property({ name: "name", type: "string" }, { uuid: "pg-migration-resume-name" }),
        new Property({ name: "tag", type: "string" }, { uuid: "pg-migration-resume-tag" }),
        new Property({ name: "category", type: "string" }, { uuid: "pg-migration-resume-category" }),
      ],
    }, { uuid: "pg-migration-resume-product" });
    const systemV2 = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    systemV2.conceptClass = KlassByName;
    const controllerV2 = new Controller({ system: systemV2, entities: [ProductV2], relations: [] });
    const approvedDiff = await approveGeneratedMigrationDiff(controllerV2);
    const dryRunPlan = await controllerV2.migrate({ approvedDiff, dryRun: true });
    const firstOperation = dryRunPlan.schemaPlan!.preRecomputeDDL[0];
    await (systemV2 as any).db.scheme(firstOperation.sql!);

    const states = controllerV2.scheduler.createStates();
    const schemaPlan = await (systemV2 as any).prepareMigrationSchema(controllerV2.entities, controllerV2.relations, states);
    const modelHash = createMigrationManifest(controllerV2, schemaPlan.schema).modelHash;
    const approvedDiffHash = hashMigrationDiff(approvedDiff);
    const migrationId = "pg-operation-resume-migration";
    const operationKey = `schema:0:${firstOperation.kind}:${firstOperation.tableName || ""}:${firstOperation.columnName || ""}:${firstOperation.logicalPath || ""}:${firstOperation.sql || firstOperation.description}`;
    await (systemV2 as any).db.scheme(`INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "approvedDiffHash", "phase", "status", "createdAt", "updatedAt") VALUES ('${migrationId}', '${modelHash}', '${approvedDiffHash}', 'pending', 'failed', 'now', 'now')`);
    await (systemV2 as any).db.scheme(`INSERT INTO "__interaqt_migration_operation_log" ("migrationId", "operationKey", "status") VALUES ('${migrationId}', '${operationKey.replace(/'/g, "''")}', 'succeeded')`);

    await controllerV2.migrate({ approvedDiff });

    const dbHandle = (systemV2 as unknown as { db: PostgreSQLDB }).db;
    const columns = await dbHandle.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      ["PgMigrationResumeProduct"],
    );
    const columnNames = columns.map(column => column.column_name);
    expect(columnNames).toContain(dryRunPlan.schemaPlan!.preRecomputeDDL[0].columnName);
    expect(columnNames).toContain(dryRunPlan.schemaPlan!.preRecomputeDDL[1].columnName);
    await systemV2.destroy();
  });
});
