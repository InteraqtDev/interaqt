import { describe, expect, test } from "vitest";
import {
  Controller,
  Database,
  dbConsoleLogger,
  Entity,
  EntityIdRef,
  EventSource,
  isTransactionCapabilityError,
  MonoSystem,
  Property,
  TransactionCapability,
  TransactionCapabilityError,
} from "interaqt";
import { MysqlDB, PGLiteDB, PostgreSQLDB, SQLiteDB } from "@drivers";

class ReadCommittedOnlyDB implements Database {
  logger = dbConsoleLogger;
  transactionCapability: TransactionCapability = {
    transactions: true,
    isolationLevels: ["READ COMMITTED"] as const,
    transactionBoundConnection: false,
    concurrentTransactions: "unsupported" as const,
    nestedStrategy: "reuse" as const,
  };
  open = async () => undefined;
  scheme = async () => undefined;
  query = async <T>() => [] as T[];
  delete = async <T>() => [] as T[];
  insert = async () => ({ id: "1" }) as EntityIdRef;
  update = async () => [] as EntityIdRef[];
  getAutoId = async () => "1";
  mapToDBFieldType = () => "TEXT";
  close = async () => undefined;
}

class UnsupportedTransactionDB extends ReadCommittedOnlyDB {
  transactionCapability: TransactionCapability = {
    transactions: false,
    isolationLevels: [] as const,
    transactionBoundConnection: false,
    concurrentTransactions: "unsupported" as const,
    nestedStrategy: "unsupported" as const,
  };
}

describe("transaction capability", () => {
  test("exposes PostgreSQL as the strong transaction target", () => {
    const db = new PostgreSQLDB("transaction_capability_test");
    const system = new MonoSystem(db);

    expect(system.storage.getTransactionCapability()).toMatchObject({
      transactions: true,
      isolationLevels: ["READ COMMITTED", "SERIALIZABLE"],
      transactionBoundConnection: true,
      concurrentTransactions: "database",
      nestedStrategy: "reuse",
    });
  });

  test("PostgreSQLDB routes all transaction operations through one bound client", async () => {
    const calls: string[] = [];
    let releaseCount = 0;
    const transactionClient = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rows: [{ id: "row-1", _rowId: "row-1" }] };
      },
      release: () => {
        releaseCount++;
      },
    };
    const db = new PostgreSQLDB("transaction_capability_test");
    (db as any).pool = {
      connect: async () => transactionClient,
      query: async () => {
        throw new Error("pool query should not be used inside transaction");
      },
    };

    await db.runInTransaction({ name: "pg-bound-client", isolation: "SERIALIZABLE" }, async () => {
      await db.query("SELECT 1", []);
      await db.scheme("SELECT 2");
      await db.insert("INSERT INTO test DEFAULT VALUES", []);
      await db.update("UPDATE test SET value = $1", ["value"], "id");
      await db.delete("DELETE FROM test", []);
    });

    expect(calls).toEqual([
      "BEGIN ISOLATION LEVEL SERIALIZABLE",
      "SELECT 1",
      "SELECT 2",
      'INSERT INTO test DEFAULT VALUES RETURNING "_rowId"',
      'UPDATE test SET value = $1 RETURNING "id" AS id',
      "DELETE FROM test",
      "COMMIT",
    ]);
    expect(releaseCount).toBe(1);
  });

  test("marks PGLite as fallback transaction support, not production concurrent isolation", async () => {
    const db = new PGLiteDB();
    const system = new MonoSystem(db);

    expect(system.storage.getTransactionCapability()).toMatchObject({
      transactions: true,
      isolationLevels: ["READ COMMITTED", "SERIALIZABLE"],
      transactionBoundConnection: false,
      concurrentTransactions: "unsupported",
      nestedStrategy: "reuse",
    });
    expect(system.storage.getTransactionCapability().notes?.join(" ")).toContain("not a production PostgreSQL isolation guarantee");

    await db.close();
  });

  test("marks SQLite as local fallback atomicity only", () => {
    const db = new SQLiteDB();
    const system = new MonoSystem(db);

    expect(system.storage.getTransactionCapability()).toMatchObject({
      transactions: true,
      isolationLevels: ["READ COMMITTED", "SERIALIZABLE"],
      transactionBoundConnection: false,
      concurrentTransactions: "unsupported",
      nestedStrategy: "reuse",
    });
    expect(db.supportsSelectForUpdate).toBe(false);
  });

  test("marks the current MySQL driver as unsupported for strong dispatch transactions", () => {
    const db = new MysqlDB("transaction_capability_test");
    const system = new MonoSystem(db);

    expect(system.storage.getTransactionCapability()).toMatchObject({
      transactions: false,
      isolationLevels: [],
      transactionBoundConnection: false,
      concurrentTransactions: "unsupported",
      nestedStrategy: "unsupported",
    });
    expect(system.storage.getTransactionCapability().notes?.join(" ")).toContain("strong dispatch transactions are unsupported");
  });

  test("fails fast when a driver declares transactions unsupported", async () => {
    const system = new MonoSystem(new MysqlDB("transaction_capability_test"));

    await expect(
      system.storage.runInTransaction({ name: "mysql-unsupported" }, async () => undefined)
    ).rejects.toBeInstanceOf(TransactionCapabilityError);
  });

  test("dispatch fails fast when the driver declares transactions unsupported", async () => {
    const EventRecord = Entity.create({
      name: "_TransactionCapabilityUnsupportedDispatchEvent_",
      properties: [Property.create({ name: "kind", type: "string" })],
    });
    const source = EventSource.create({
      name: "transactionCapabilityUnsupportedDispatch",
      entity: EventRecord,
      mapEventData: () => ({ kind: "unsupported" }),
    });
    const system = new MonoSystem(new UnsupportedTransactionDB());
    const controller = new Controller({
      system,
      entities: [],
      relations: [],
      eventSources: [source],
    });
    await controller.setup(true);

    const result = await controller.dispatch(source, {});

    expect(result.error).toBeInstanceOf(TransactionCapabilityError);
  });

  test("fails fast when the requested isolation level is outside driver capability", async () => {
    const system = new MonoSystem(new ReadCommittedOnlyDB());

    try {
      await system.storage.runInTransaction(
        { name: "read-committed-only-serializable", isolation: "SERIALIZABLE" },
        async () => undefined
      );
      throw new Error("Expected SERIALIZABLE transaction to fail");
    } catch (error) {
      expect(isTransactionCapabilityError(error)).toBe(true);
      expect((error as TransactionCapabilityError).context).toMatchObject({
        transactionName: "read-committed-only-serializable",
        requestedIsolation: "SERIALIZABLE",
      });
    }
  });
});
