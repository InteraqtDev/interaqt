import { describe, expect, test } from "vitest";
import { ConstraintSetupError, readMigrationManifest } from "interaqt";
import { MysqlDB, PGLiteDB, SQLiteDB } from "@drivers";
import mysql from "mysql2/promise";
import { migrateWithApproval } from "./helpers/migrationApproval.js";
import {
    DEFAULT_MISMATCH_MESSAGE,
    captureError,
    controllerFor,
    install,
    migrateTo,
    recordingLogger,
    richController,
    setupLogs,
    type AnyDB,
} from "./helpers/setupAcceptanceFixtures.js";

/**
 * setup({ acceptModelHashes, requireSchemaSuperset }) — N-1 model acceptance (one2x-ai/mesh#2826).
 *
 * The scenario under test is a rollback or a canary restart: the database was migrated to the
 * model of release N, and the code of release N-1 restarts on it. Without an accept set the
 * strict modelHash comparison refuses to start. With the previous release's hash declared as
 * accepted, setup must start (read compatibility only) after verifying against the live
 * catalog that every table, column, and column type the current code maps to exists.
 *
 * The negative superset cases use the opposite direction (code of release N declaring the
 * hash of N-1 while the database is still at N-1): that is the natural way a wrong accept
 * declaration meets a database that lacks what the code needs, because the framework's own
 * migration never removes a column or changes a column type.
 */

const drivers: Array<{ name: string; create: () => AnyDB }> = [
    { name: "PGLite", create: () => new PGLiteDB() },
    { name: "SQLite", create: () => new SQLiteDB() },
];

describe.each(drivers)("setup acceptModelHashes ($name)", ({ create }) => {
    test("expand-only (added column): N-1 code starts with the accepted hash and reads existing rows", async () => {
        const db = create();
        const { controller: v1, hash: hashA } = await install(db);
        await v1.system.storage.create("AcceptProduct", { name: "before", price: 1 });
        const { controller: v2, hash: hashB } = await migrateTo(db, { sku: true });
        expect(hashB).not.toBe(hashA);
        await v2.system.storage.create("AcceptProduct", { name: "after", price: 2, sku: "S-2" });

        const { logger, infos } = recordingLogger();
        const rollback = controllerFor(db, {}, logger);
        await rollback.setup({ install: false, acceptModelHashes: [hashB] });

        const rows = await rollback.system.storage.find("AcceptProduct", undefined, undefined, ["*"]);
        expect(rows.map(row => [row.name, row.price]).sort()).toEqual([["after", 2], ["before", 1]]);
        expect(setupLogs(infos)).toEqual([expect.objectContaining({
            manifestMode: "accepted",
            declaredModelHash: hashA,
            acceptedModelHash: hashB,
        })]);
        await db.close();
    });

    test("expand-only (added table): N-1 code starts with the accepted hash and reads existing rows", async () => {
        const db = create();
        const { controller: v1, hash: hashA } = await install(db);
        await v1.system.storage.create("AcceptProduct", { name: "kept", price: 3 });
        const { controller: v2, hash: hashB } = await migrateTo(db, { category: true });
        await v2.system.storage.create("AcceptCategory", { title: "new-table-row" });

        const rollback = controllerFor(db);
        await rollback.setup({ install: false, acceptModelHashes: ["unrelated-hash", hashB] });
        const rows = await rollback.system.storage.find("AcceptProduct", undefined, undefined, ["*"]);
        expect(rows.map(row => [row.name, row.price])).toEqual([["kept", 3]]);
        expect(hashA).not.toBe(hashB);
        await db.close();
    });

    test("no false positive: every column shape of a richer model passes the catalog check after an expand-only migration", async () => {
        const db = create();
        const { controller: v1, publish } = richController(db, false);
        await v1.setup(true);
        const hashA = (await readMigrationManifest(v1))!.modelHash;
        const author = await v1.system.storage.create("RichUser", {
            name: "ann", age: 30, active: true, joinedAt: Date.now(), profile: { city: "x" }, meta: { a: [1] }, tags: ["t1"],
            avatar: { url: "u" },
        });
        const post = await v1.system.storage.create("RichPost", { title: "p1", author: { id: author.id } });
        await v1.dispatch(publish, { user: { id: "rich-user" }, payload: { postId: String(post.id) } });

        const { controller: v2 } = richController(db, true);
        await migrateWithApproval(v2);
        const hashB = (await readMigrationManifest(v2))!.modelHash;
        expect(hashB).not.toBe(hashA);

        const { logger, infos } = recordingLogger();
        const { controller: rollback } = richController(db, false, logger);
        await rollback.setup({ install: false, acceptModelHashes: [hashB] });
        expect(setupLogs(infos)).toEqual([expect.objectContaining({ manifestMode: "accepted", acceptedModelHash: hashB })]);
        const users = await rollback.system.storage.find("RichUser", undefined, undefined, ["name", "postCount", "tags", ["posts", { attributeQuery: ["title", "status"] }]]);
        expect(users).toHaveLength(1);
        expect(users[0].name).toBe("ann");
        expect(Number(users[0].postCount)).toBe(1);
        expect(users[0].tags).toEqual(["t1"]);
        expect(users[0].posts.map((item: any) => [item.title, item.status])).toEqual([["p1", "published"]]);
        await db.close();
    });

    test("a database hash outside the accept set is rejected; the message lists the actual hash and the accept set", async () => {
        const db = create();
        const { hash: hashA } = await install(db);
        const { hash: hashB } = await migrateTo(db, { sku: true });

        const error = await captureError(controllerFor(db).setup({ install: false, acceptModelHashes: ["hash-of-some-other-release"] }));
        expect(error.message).toMatch(/^Model manifest mismatch\./);
        expect(error.message).toContain(hashB);
        expect(error.message).toContain(hashA);
        expect(error.message).toContain("hash-of-some-other-release");
        await db.close();
    });

    test("a missing column the current code needs refuses startup and names the column", async () => {
        const db = create();
        const { hash: hashA } = await install(db);

        // Code of release N (adds sku) wrongly declares the database model (N-1) compatible.
        const error = await captureError(controllerFor(db, { sku: true }).setup({ install: false, acceptModelHashes: [hashA] }));
        expect(error.name).toBe("SchemaSupersetError");
        expect(error.message).toContain("AcceptProduct.sku");
        expect(error.details?.violations).toEqual([expect.objectContaining({ kind: "missing-column", logicalPath: "AcceptProduct.sku" })]);
        await db.close();
    });

    test("requireSchemaSuperset: false skips the physical check (the same database then starts)", async () => {
        const db = create();
        const { hash: hashA } = await install(db);
        const { logger, infos } = recordingLogger();
        await controllerFor(db, { sku: true }, logger).setup({ install: false, acceptModelHashes: [hashA], requireSchemaSuperset: false });
        expect(setupLogs(infos)).toEqual([expect.objectContaining({ manifestMode: "accepted", acceptedModelHash: hashA })]);
        await db.close();
    });

    test("a missing table the current code needs refuses startup and names the table", async () => {
        const db = create();
        const { hash: hashA } = await install(db);
        const error = await captureError(controllerFor(db, { category: true }).setup({ install: false, acceptModelHashes: [hashA] }));
        expect(error.name).toBe("SchemaSupersetError");
        expect(error.message).toContain("AcceptCategory");
        expect(error.details?.violations).toEqual([expect.objectContaining({ kind: "missing-table", recordNames: ["AcceptCategory"] })]);
        await db.close();
    });

    test("a column whose catalog type differs from the declared type refuses startup", async () => {
        const db = create();
        const { hash: hashA } = await install(db);
        const error = await captureError(controllerFor(db, { priceType: "string" }).setup({ install: false, acceptModelHashes: [hashA] }));
        expect(error.name).toBe("SchemaSupersetError");
        expect(error.message).toContain("AcceptProduct.price");
        expect(error.details?.violations).toEqual([expect.objectContaining({ kind: "incompatible-column-type", logicalPath: "AcceptProduct.price" })]);
        await db.close();
    });

    test("default path regression: without an accept set the strict comparison and the 4.12.0 error text are unchanged", async () => {
        const db = create();
        await install(db);
        await migrateTo(db, { sku: true });

        const attempts: Array<() => Promise<unknown>> = [
            () => controllerFor(db).setup(false),
            () => controllerFor(db).setup(),
            () => controllerFor(db).setup({}),
            () => controllerFor(db).setup({ install: false }),
            () => controllerFor(db).setup({ install: false, acceptModelHashes: [] }),
        ];
        for (const attempt of attempts) {
            const error = await captureError(attempt());
            expect(error.constructor).toBe(Error);
            expect(error.message).toBe(DEFAULT_MISMATCH_MESSAGE);
        }
        await db.close();
    });

    test("an exact hash match starts in exact mode, with or without an accept set", async () => {
        const db = create();
        const { hash: hashA } = await install(db);

        const plain = recordingLogger();
        await controllerFor(db, {}, plain.logger).setup(false);
        expect(setupLogs(plain.infos)).toEqual([expect.objectContaining({ manifestMode: "exact", declaredModelHash: hashA, acceptedModelHash: hashA })]);

        const withSet = recordingLogger();
        await controllerFor(db, {}, withSet.logger).setup({ install: false, acceptModelHashes: ["hash-of-next-release"] });
        expect(setupLogs(withSet.infos)).toEqual([expect.objectContaining({ manifestMode: "exact", declaredModelHash: hashA, acceptedModelHash: hashA })]);
        await db.close();
    });

    test("constraint objects added by the newer model on a table the current code uses still block startup (documented limitation)", async () => {
        const db = create();
        await install(db);
        const { hash: hashB } = await migrateTo(db, { sku: true, skuUnique: true });
        const error = await captureError(controllerFor(db).setup({ install: false, acceptModelHashes: [hashB] }));
        expect(error).toBeInstanceOf(ConstraintSetupError);
        expect(error.message).toMatch(/extra unique/);
        await db.close();
    });
});

describe("setup acceptModelHashes option validation", () => {
    test("more than two accepted hashes is rejected before the database is read", async () => {
        const db = new PGLiteDB();
        await install(db);
        await expect(controllerFor(db).setup({ install: false, acceptModelHashes: ["a", "b", "c"] }))
            .rejects.toThrow(/acceptModelHashes accepts at most 2 hashes/);
        await db.close();
    });

    test("malformed or conflicting options are rejected", async () => {
        const db = new PGLiteDB();
        await install(db);
        await expect(controllerFor(db).setup({ install: false, acceptModelHashes: "abc" as unknown as string[] }))
            .rejects.toThrow(/acceptModelHashes must be an array/);
        await expect(controllerFor(db).setup({ install: false, acceptModelHashes: [""] }))
            .rejects.toThrow(/non-empty string/);
        await expect(controllerFor(db).setup({ install: false, acceptModelHashes: ["a", "a"] }))
            .rejects.toThrow(/duplicate/);
        await expect(controllerFor(db).setup({ install: true, acceptModelHashes: ["a"] }))
            .rejects.toThrow(/cannot be combined with install: true/);
        await expect(controllerFor(db).setup({ migrate: { dryRun: true }, acceptModelHashes: ["a"] }))
            .rejects.toThrow(/cannot be combined with migrate/);
        await db.close();
    });
});

// Real MySQL probe of the catalog type reader (env-gated like the other MySQL suites).
// MySQL cannot run dispatch, but setup and attach work; the expand-only database is built
// with install because migrate needs storage transactions.
const MYSQL_ENABLED = !!process.env.INTERAQT_MYSQL_DATABASE;
const mysqlConfig = {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : undefined,
    user: process.env.MYSQL_USER || "interaqt",
    password: process.env.MYSQL_PASSWORD || "interaqt",
};

describe.skipIf(!MYSQL_ENABLED)("setup acceptModelHashes (MySQL)", () => {
    async function freshDatabase(suffix: string) {
        const database = `${process.env.INTERAQT_MYSQL_DATABASE!}_${suffix}`;
        const admin = await mysql.createConnection(mysqlConfig);
        await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
        await admin.query(`CREATE DATABASE \`${database}\``);
        await admin.end();
        return new MysqlDB(database, mysqlConfig);
    }

    test("accepted hash on a superset database starts; missing column and incompatible type refuse", async () => {
        const superset = await freshDatabase("accept_superset");
        const { controller: v2, hash: hashB } = await install(superset, { sku: true });
        // storage.create needs storage transactions, which the MySQL driver does not provide;
        // seed the row through the compiled physical names instead.
        const record = v2.system.storage.schema.records.find(item => item.recordName === "AcceptProduct")!;
        const field = (name: string) => record.attributeDetails!.find(attribute => attribute.name === name)!.fieldName!;
        await superset.insert(
            `INSERT INTO "${record.tableName}" ("${field("id")}", "${field("name")}", "${field("price")}", "${field("sku")}") VALUES (?, ?, ?, ?)`,
            [1, "mysql-row", 5, "S-5"],
        );
        const rollback = controllerFor(superset);
        await rollback.setup({ install: false, acceptModelHashes: [hashB] });
        const rows = await rollback.system.storage.find("AcceptProduct", undefined, undefined, ["*"]);
        expect(rows.map(row => [row.name, Number(row.price)])).toEqual([["mysql-row", 5]]);
        await superset.close();

        const subset = await freshDatabase("accept_subset");
        const { hash: hashA } = await install(subset);
        const missing = await captureError(controllerFor(subset, { sku: true }).setup({ install: false, acceptModelHashes: [hashA] }));
        expect(missing.details?.violations).toEqual([expect.objectContaining({ kind: "missing-column", logicalPath: "AcceptProduct.sku" })]);
        const retyped = await captureError(controllerFor(subset, { priceType: "string" }).setup({ install: false, acceptModelHashes: [hashA] }));
        expect(retyped.details?.violations).toEqual([expect.objectContaining({ kind: "incompatible-column-type", logicalPath: "AcceptProduct.price" })]);
        await subset.close();
    });

    test("no false positive: every column shape of the richer model passes the MySQL catalog check", async () => {
        const db = await freshDatabase("accept_rich");
        const { controller: v2 } = richController(db, true, undefined, { dictionary: false });
        await v2.setup(true);
        const hashB = (await readMigrationManifest(v2))!.modelHash;
        const { logger, infos } = recordingLogger();
        await richController(db, false, logger, { dictionary: false }).controller.setup({ install: false, acceptModelHashes: [hashB] });
        expect(setupLogs(infos)).toEqual([expect.objectContaining({ manifestMode: "accepted", acceptedModelHash: hashB })]);
        await db.close();
    });
});
