import { describe, expect, test } from "vitest";
import {
  Controller,
  Custom,
  Entity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  createMigrationManifest,
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
      compute: async (_deps: any, record: any) => record.price * 2,
    }, { uuid: "pg-migration-double-price-computation" });
    (doublePrice as any).migrationKey = "v1";
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
    const plan = await controllerV2.migrate();

    expect(plan.changedComputations.map(item => item.dataContext)).toEqual(["property:PgMigrationProduct.doublePrice"]);
    const migrated = await systemV2.storage.findOne("PgMigrationProduct", MatchExp.atom({ key: "id", value: ["=", product.id] }), undefined, ["*"]);
    expect(migrated.doublePrice).toBe(42);
    const manifest = await readMigrationManifest(controllerV2);
    expect(manifest?.modelHash).toBe(createMigrationManifest(controllerV2).modelHash);
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
    const dryRunPlan = await controllerV2.migrate({ dryRun: true });
    const firstOperation = dryRunPlan.schemaPlan!.preRecomputeDDL[0];
    await (systemV2 as any).db.scheme(firstOperation.sql!);

    const states = controllerV2.scheduler.createStates();
    const schemaPlan = await (systemV2 as any).prepareMigrationSchema(controllerV2.entities, controllerV2.relations, states);
    const modelHash = createMigrationManifest(controllerV2, schemaPlan.schema).modelHash;
    const migrationId = "pg-operation-resume-migration";
    const operationKey = `schema:0:${firstOperation.kind}:${firstOperation.tableName || ""}:${firstOperation.columnName || ""}:${firstOperation.logicalPath || ""}:${firstOperation.sql || firstOperation.description}`;
    await (systemV2 as any).db.scheme(`INSERT INTO "__interaqt_migration_log" ("id", "modelHash", "phase", "status", "createdAt", "updatedAt") VALUES ('${migrationId}', '${modelHash}', 'pending', 'failed', 'now', 'now')`);
    await (systemV2 as any).db.scheme(`INSERT INTO "__interaqt_migration_operation_log" ("migrationId", "operationKey", "status") VALUES ('${migrationId}', '${operationKey.replace(/'/g, "''")}', 'succeeded')`);

    await controllerV2.migrate();

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
