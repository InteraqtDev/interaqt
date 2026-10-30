import { describe, expect, test } from "vitest";
import { readMigrationManifest, type MigrationManifest } from "interaqt";
import { PGLiteDB, SQLiteDB } from "@drivers";
import { approveGeneratedMigrationDiff, migrateWithApproval } from "./helpers/migrationApproval.js";
import {
    DEFAULT_MISMATCH_MESSAGE,
    captureError,
    controllerFor,
    install,
    migrateTo,
    recordingLogger,
    richController,
    setupLogs,
    stripDeclaredCompatibility,
    ticketController,
    type AnyDB,
} from "./helpers/setupAcceptanceFixtures.js";

/**
 * Compatibility declared by the migration (one2x-ai/mesh#2826, sskyy decision 2026-10-30).
 *
 * The migration is the only moment that knows both the old and the new modelHash, so it
 * classifies itself and records `compatibleFrom: [oldHash]` in the manifest it writes when the
 * old release can keep reading the new schema. setup() honors that declaration by default —
 * no runtime option — still subject to the superset check. Incompatible migrations (added
 * constraint on an existing table, changed existing computation, state remap, new fact property
 * that relies on an application-side default) record the reasons and declare nothing.
 */

type Manifest = MigrationManifest & {
    compatibleFrom?: string[];
    compatibility?: { fromModelHash: string; compatible: boolean; reasons: string[] };
};

async function storedManifest(controller: Parameters<typeof readMigrationManifest>[0]) {
    return (await readMigrationManifest(controller)) as Manifest;
}

const drivers: Array<{ name: string; create: () => AnyDB }> = [
    { name: "PGLite", create: () => new PGLiteDB() },
    { name: "SQLite", create: () => new SQLiteDB() },
];

describe.each(drivers)("migration-declared compatibility ($name)", ({ create }) => {
    test("expand-only (added column): the migration declares compatibleFrom and N-1 code starts with setup(false)", async () => {
        const db = create();
        const { controller: v1, hash: hashA } = await install(db);
        await v1.system.storage.create("AcceptProduct", { name: "before", price: 1 });
        const { controller: v2, hash: hashB } = await migrateTo(db, { sku: true });
        await v2.system.storage.create("AcceptProduct", { name: "after", price: 2, sku: "S-2" });

        const manifest = await storedManifest(v2);
        expect(manifest.compatibleFrom).toEqual([hashA]);
        expect(manifest.compatibility).toEqual({ fromModelHash: hashA, compatible: true, reasons: [] });

        const { logger, infos } = recordingLogger();
        const rollback = controllerFor(db, {}, logger);
        await rollback.setup(false);
        const rows = await rollback.system.storage.find("AcceptProduct", undefined, undefined, ["*"]);
        expect(rows.map(row => [row.name, row.price]).sort()).toEqual([["after", 2], ["before", 1]]);
        expect(setupLogs(infos)).toEqual([expect.objectContaining({
            manifestMode: "declared-compatible",
            declaredModelHash: hashA,
            acceptedModelHash: hashB,
        })]);
        await db.close();
    });

    test("expand-only (added table, new property with a default on the new table): declared compatible", async () => {
        const db = create();
        const { controller: v1, hash: hashA } = await install(db);
        await v1.system.storage.create("AcceptProduct", { name: "kept", price: 3 });
        const { controller: v2 } = await migrateTo(db, { category: true, categoryTitleDefault: true });
        expect((await storedManifest(v2)).compatibleFrom).toEqual([hashA]);

        const rollback = controllerFor(db);
        await rollback.setup();
        expect((await rollback.system.storage.find("AcceptProduct", undefined, undefined, ["*"])).map(row => row.name)).toEqual(["kept"]);
        await db.close();
    });

    test("no false positive: a richer model's expand-only migration is declared compatible and N-1 reads its data", async () => {
        const db = create();
        const { controller: v1, publish } = richController(db, false);
        await v1.setup(true);
        const hashA = (await readMigrationManifest(v1))!.modelHash;
        const author = await v1.system.storage.create("RichUser", { name: "ann", age: 30, active: true, tags: ["t1"], avatar: { url: "u" } });
        const post = await v1.system.storage.create("RichPost", { title: "p1", author: { id: author.id } });
        await v1.dispatch(publish, { user: { id: "rich-user" }, payload: { postId: String(post.id) } });
        const { controller: v2 } = richController(db, true);
        await migrateWithApproval(v2);
        expect((await storedManifest(v2)).compatibility).toEqual({ fromModelHash: hashA, compatible: true, reasons: [] });

        const { controller: rollback } = richController(db, false);
        await rollback.setup(false);
        const users = await rollback.system.storage.find("RichUser", undefined, undefined, ["name", "postCount", ["posts", { attributeQuery: ["status"] }]]);
        expect(users.map(user => [user.name, Number(user.postCount), user.posts.map((item: any) => item.status)])).toEqual([["ann", 1, ["published"]]]);
        await db.close();
    });

    test("a constraint added on an existing table: nothing is declared and N-1 is refused with the reason", async () => {
        const db = create();
        const { hash: hashA } = await install(db);
        const { controller: v2, hash: hashB } = await migrateTo(db, { sku: true, skuUnique: true });
        const manifest = await storedManifest(v2);
        expect(manifest.compatibleFrom).toEqual([]);
        expect(manifest.compatibility?.compatible).toBe(false);
        expect(manifest.compatibility?.reasons).toEqual([expect.stringMatching(/^constraint added on existing table "AcceptProduct": unique/)]);

        const error = await captureError(controllerFor(db).setup(false));
        expect(error.message).toMatch(/^Model manifest mismatch\./);
        expect(error.message).toContain(`database manifest declares compatibleFrom []`);
        expect(error.message).toContain(`The migration from ${hashA} to ${hashB} was classified incompatible: constraint added on existing table "AcceptProduct": unique`);
        await db.close();
    });

    test("an existing computation changed: nothing is declared unless the change is approved as 'unchanged'", async () => {
        const db = create();
        const { controller: v1, hash: hashA } = await install(db, { doublePrice: "times-two" });
        await v1.system.storage.create("AcceptProduct", { name: "a", price: 5 });
        const { controller: v2 } = await migrateTo(db, { doublePrice: "times-three" });
        const manifest = await storedManifest(v2);
        expect(manifest.compatibleFrom).toEqual([]);
        expect(manifest.compatibility?.reasons).toEqual([expect.stringMatching(/^existing computation changed: property:AcceptProduct\.doublePrice \(decision: changed\)/)]);
        const error = await captureError(controllerFor(db, { doublePrice: "times-two" }).setup(false));
        expect(error.message).toContain("existing computation changed: property:AcceptProduct.doublePrice");

        // Same change on a fresh database, approved as a non-semantic edit.
        const db2 = create();
        await install(db2, { doublePrice: "times-two" });
        const reviewer = controllerFor(db2, { doublePrice: "times-three" });
        const diff = await reviewer.generateMigrationDiff();
        const requirement = diff.requiredDecisions.find(item => item.kind === "computation" && item.dataContext === "property:AcceptProduct.doublePrice") as { id: string };
        const approvedDiff = await approveGeneratedMigrationDiff(reviewer, { computationDecisions: { [requirement.id]: "unchanged" } });
        await reviewer.migrate({ approvedDiff });
        expect((await storedManifest(reviewer)).compatibility).toEqual({ fromModelHash: hashA, compatible: true, reasons: [] });
        await controllerFor(db2, { doublePrice: "times-two" }).setup(false);
        await db.close();
        await db2.close();
    });

    test("a StateMachine state remap: nothing is declared and N-1 is refused with the reason", async () => {
        const db = create();
        const v1 = ticketController(db, ["pending", "approved", "archived"]);
        await v1.setup(true);
        await v1.system.storage.create("CompatTicket", { title: "t" });
        const v2 = ticketController(db, ["pending", "accepted", "archived"]);
        await migrateWithApproval(v2, { handlers: { eventRebuild: { "property:CompatTicket.status": async () => "pending" } } });
        const manifest = await storedManifest(v2);
        expect(manifest.compatibleFrom).toEqual([]);
        expect(manifest.compatibility?.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/^StateMachine state remap: property:CompatTicket\.status/)]));
        const error = await captureError(ticketController(db, ["pending", "approved", "archived"]).setup(false));
        expect(error.message).toContain("StateMachine state remap: property:CompatTicket.status");
        await db.close();
    });

    test("a new fact property on an existing record that relies on an application-side default: nothing is declared", async () => {
        const db = create();
        await install(db);
        const { controller: v2 } = await migrateTo(db, { skuDefault: true });
        const manifest = await storedManifest(v2);
        expect(manifest.compatibleFrom).toEqual([]);
        expect(manifest.compatibility?.reasons).toEqual([expect.stringMatching(/^new fact property AcceptProduct\.sku relies on an application-side default value/)]);
        const error = await captureError(controllerFor(db).setup(false));
        expect(error.message).toContain("new fact property AcceptProduct.sku relies on an application-side default value");
        await db.close();
    });

    test("only the immediately previous model is declared: two compatible steps do not chain", async () => {
        const db = create();
        await install(db);
        const { hash: hashB } = await migrateTo(db, { sku: true });
        const { controller: v3 } = await migrateTo(db, { sku: true, category: true });
        expect((await storedManifest(v3)).compatibleFrom).toEqual([hashB]);
        const error = await captureError(controllerFor(db).setup(false));
        expect(error.message).toContain(`database manifest declares compatibleFrom [${hashB}]`);
        await controllerFor(db, { sku: true }).setup(false);
        await db.close();
    });

    test("a migration that leaves the model unchanged keeps the existing declaration", async () => {
        const db = create();
        const { hash: hashA } = await install(db);
        await migrateTo(db, { sku: true });
        const { controller: again } = await migrateTo(db, { sku: true });
        expect((await storedManifest(again)).compatibleFrom).toEqual([hashA]);
        await controllerFor(db).setup(false);
        await db.close();
    });

    test("a manifest without the declaration (install, or interaqt 4.12.x) keeps strict equality and the 4.12.0 text", async () => {
        const installed = create();
        await install(installed, { sku: true });
        const installedError = await captureError(controllerFor(installed).setup(false));
        expect(installedError.message).toBe(DEFAULT_MISMATCH_MESSAGE);
        await installed.close();

        const migrated = create();
        await install(migrated);
        const { controller: v2 } = await migrateTo(migrated, { sku: true });
        await stripDeclaredCompatibility(v2);
        const legacyError = await captureError(controllerFor(migrated).setup(false));
        expect(legacyError.constructor).toBe(Error);
        expect(legacyError.message).toBe(DEFAULT_MISMATCH_MESSAGE);
        await migrated.close();
    });

    test("a declared-compatible database still has to pass the live superset check", async () => {
        const db = create();
        await install(db);
        const { controller: v2 } = await migrateTo(db, { sku: true });
        // Drop a column the N-1 code needs, outside migration.
        const record = v2.system.storage.schema.records.find(item => item.recordName === "AcceptProduct")!;
        const price = record.attributeDetails!.find(attribute => attribute.name === "price")!;
        await db.scheme(`ALTER TABLE "${record.tableName}" DROP COLUMN "${price.fieldName}"`);
        const error = await captureError(controllerFor(db).setup(false));
        expect(error.name).toBe("SchemaSupersetError");
        expect(error.message).toContain("declared-compatible");
        expect(error.details?.violations).toEqual([expect.objectContaining({ kind: "missing-column", logicalPath: "AcceptProduct.price" })]);
        await db.close();
    });

    test("generateMigrationDiff reports the provisional classification; migrate's plan reports the final one", async () => {
        const db = create();
        const { hash: hashA } = await install(db, { doublePrice: "times-two" });
        const expandDiff = await controllerFor(db, { doublePrice: "times-two", sku: true }).generateMigrationDiff();
        expect(expandDiff.compatibility).toEqual({ fromModelHash: hashA, compatible: true, reasons: [] });
        const constraintDiff = await controllerFor(db, { doublePrice: "times-two", sku: true, skuUnique: true }).generateMigrationDiff();
        expect(constraintDiff.compatibility?.compatible).toBe(false);
        // Before decisions are made, a changed existing computation counts as a semantic change.
        const computationDiff = await controllerFor(db, { doublePrice: "times-three" }).generateMigrationDiff();
        expect(computationDiff.compatibility?.reasons).toEqual([expect.stringMatching(/^existing computation changed: property:AcceptProduct\.doublePrice \(not yet decided; approve it as 'unchanged' if the change is not semantic\)/)]);
        const dryRun = await migrateWithApproval(controllerFor(db, { doublePrice: "times-two", sku: true }), { dryRun: true });
        expect(dryRun.compatibility).toEqual({ fromModelHash: hashA, compatible: true, reasons: [] });
        await db.close();
    });
});
