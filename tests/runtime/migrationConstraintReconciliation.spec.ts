/**
 * one2x-ai/mesh#1674: migration reconciles the database's constraint objects with the
 * declared constraints.
 *
 * Before the fix, constraint DDL was planned as "create every constraint the new model
 * declares" and nothing read the installed state, so:
 *   - removed constraints were never dropped (C1, C2, C5, C8);
 *   - a constraint redefined under the same name was skipped, because the physical name
 *     depends only on (recordName, constraintName) and the DDL is
 *     `CREATE UNIQUE INDEX IF NOT EXISTS` (C3 relaxation, C4 tightening);
 *   - NonNullConstraint DDL (`ALTER TABLE ... ADD CONSTRAINT`) was not idempotent, so every
 *     later migration and every setup(false) attach failed (C6, C7, C9);
 *   - Entity.identity indexes followed the same create-only path (C8, C10);
 *   - the diff listed no constraint DDL, so reviewers approved an empty change list.
 * C1-C10 failed on v4.11.2 (PGLite and PostgreSQL 17.6). C11-C20 pin the review surface,
 * the transaction ordering, the startup check and the legacy (pre-fingerprint) catalog states.
 *
 * Oracle: a fresh install of each cell's v2 satisfies the same expectations ("fresh-install
 * twins"), so every expectation is "what setup(true) of v2 produces".
 */
import { describe, expect, test } from "vitest";
import { ConstraintSetupError, Controller, Custom, Entity, KlassByName, MatchExp, MonoSystem, NonNullConstraint, Property, Transform, UniqueConstraint, type ConstraintPredicate } from "interaqt";
import type { Database } from "@runtime";
import { getSchemaDialect } from "@storage";
import { PGLiteDB, PostgreSQLDB, SQLiteDB } from "@drivers";
import { approveGeneratedMigrationDiff } from "./helpers/migrationApproval.js";

const RECORD = "ConstraintReconcileChannel";

type ConstraintDecl =
    | { kind: "unique"; name: string; properties: string[]; where?: ConstraintPredicate; violationCode?: string }
    | { kind: "non-null"; name: string; property: string };

type ChannelOptions = {
    identity?: string[];
    extraProperty?: boolean;
    /** Custom computation of `slugKey`; its text takes part in the migration signature. */
    slugKey?: (deps: unknown, record: { slug: string }) => Promise<string>;
};

function channel(constraints: ConstraintDecl[], options: ChannelOptions = {}) {
    const slugKeyComputation = options.slugKey && new Custom({
        name: "ConstraintReconcileSlugKey",
        dataDeps: { current: { type: "property", attributeQuery: ["slug"] } },
        compute: options.slugKey,
    }, { uuid: "constraint-reconcile-slug-key-computation" });
    return new Entity({
        name: RECORD,
        ...(options.identity ? { identity: { name: "byKey", properties: options.identity } } : {}),
        properties: [
            new Property({ name: "workspaceId", type: "string" }, { uuid: "constraint-reconcile-workspace" }),
            new Property({ name: "slug", type: "string" }, { uuid: "constraint-reconcile-slug" }),
            new Property({ name: "status", type: "string" }, { uuid: "constraint-reconcile-status" }),
            new Property({ name: "activeSlugKey", type: "string" }, { uuid: "constraint-reconcile-active-slug-key" }),
            new Property({ name: "note", type: "string" }, { uuid: "constraint-reconcile-note" }),
            ...(options.extraProperty ? [new Property({ name: "extra", type: "string" }, { uuid: "constraint-reconcile-extra" })] : []),
            ...(slugKeyComputation ? [new Property({ name: "slugKey", type: "string", computation: slugKeyComputation }, { uuid: "constraint-reconcile-slug-key" })] : []),
        ],
        constraints: constraints.map(item => item.kind === "unique"
            ? new UniqueConstraint(
                { name: item.name, properties: item.properties, ...(item.where ? { where: item.where } : {}), ...(item.violationCode ? { violationCode: item.violationCode } : {}) },
                { uuid: `constraint-reconcile-${item.name}-${item.properties.join("-")}-${item.where ? "partial" : "full"}` },
            )
            : new NonNullConstraint({ name: item.name, property: item.property }, { uuid: `constraint-reconcile-${item.name}` })),
    }, { uuid: "constraint-reconcile-channel" });
}

function row(workspaceId: string, slug: string, extra: Record<string, unknown> = {}) {
    return { workspaceId, slug, status: "active", activeSlugKey: slug, note: "n", ...extra };
}

type Backend = {
    label: string;
    nonNull: boolean;
    postgresCatalog: boolean;
    database: (cell: string) => DbFactory;
};

type DbFactory = {
    open: () => Database;
    // PGLite and SQLite cells share one in-memory database, so v1 must stay open for v2.
    closeBetweenVersions: boolean;
};

async function install(createDb: DbFactory, entities: Entity[], rows: Record<string, unknown>[] = []) {
    const system = new MonoSystem(createDb.open());
    system.conceptClass = KlassByName;
    await new Controller({ system, entities, relations: [] }).setup(true);
    for (const item of rows) await system.storage.create(RECORD, item);
    if (createDb.closeBetweenVersions) await system.destroy();
    return system;
}

function openNext(createDb: DbFactory, entities: Entity[]) {
    const system = new MonoSystem(createDb.open());
    system.conceptClass = KlassByName;
    return { system, controller: new Controller({ system, entities, relations: [] }) };
}

function dbOf(system: MonoSystem): Database {
    return (system as unknown as { db: Database }).db;
}

type Target = MonoSystem | Database;

function databaseOf(target: Target): Database {
    return target instanceof MonoSystem ? dbOf(target) : target;
}

/** A raw connection for planting catalog states; shared in-memory databases reuse the installed one. */
async function rawDatabase(createDb: DbFactory, installed: MonoSystem) {
    if (!createDb.closeBetweenVersions) return { db: dbOf(installed), close: async () => undefined };
    const db = createDb.open();
    await db.open();
    return { db, close: () => db.close() };
}

async function indexes(target: Target, tableName = RECORD) {
    const db = databaseOf(target);
    if (getSchemaDialect(db).name === "postgres") {
        return db.query<{ name: string; definition: string }>(
            `SELECT indexname AS "name", indexdef AS "definition" FROM pg_indexes WHERE tablename = '${tableName}'`,
            [],
        );
    }
    return db.query<{ name: string; definition: string }>(
        `SELECT name AS "name", sql AS "definition" FROM sqlite_master WHERE type = 'index' AND tbl_name = '${tableName}' AND sql IS NOT NULL`,
        [],
    );
}

async function checkConstraintNames(target: Target) {
    const rows = await databaseOf(target).query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conrelid = '"${RECORD}"'::regclass AND contype = 'c'`,
        [],
    );
    return rows.map(item => item.conname);
}

async function comments(target: Target) {
    const rows = await databaseOf(target).query<{ name: string; comment: string | null }>(
        `SELECT c.relname AS "name", obj_description(c.oid, 'pg_class') AS "comment" FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid WHERE t.relname = '${RECORD}'`,
        [],
    );
    return new Map(rows.map(item => [item.name, item.comment]));
}

function fieldOf(system: MonoSystem, property: string) {
    const record = system.storage.schema.records.find(item => item.recordName === RECORD)!;
    return record.attributeDetails!.find(item => item.name === property)!.fieldName!;
}

const physicalPrefix = (constraintName: string) => `uniq_${RECORD}_${constraintName}_`;

type Diff = Awaited<ReturnType<Controller["generateMigrationDiff"]>>;

function constraintChanges(diff: Diff) {
    return diff.changes.filter((change): change is Extract<Diff["changes"][number], { kind: "constraint" }> => change.kind === "constraint");
}

function removalRequirements(diff: Diff) {
    return diff.requiredDecisions.filter((item): item is Extract<Diff["requiredDecisions"][number], { kind: "constraint-removal" }> => item.kind === "constraint-removal");
}

function defineCells(backend: Backend) {
    const testNonNull = backend.nonNull ? test : test.skip;
    const testPostgres = backend.postgresCatalog ? test : test.skip;
    const createDbFor = backend.database;

    describe(`${backend.label}: migration reconciles declared constraints with installed constraints`, () => {
        test("C1 removed UniqueConstraint: diff lists the removal and migrate drops the index", async () => {
            const createDb = createDbFor("c1");
            await install(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([])]);
            const diff = await controller.generateMigrationDiff({ includeDestructiveScope: true });
            expect(diff.fromModelHash).not.toBe(diff.toModelHash);
            expect(constraintChanges(diff)).toEqual([
                expect.objectContaining({ changeType: "removed", constraintKind: "unique", tableName: RECORD, dataContext: `constraint:${RECORD}.slug_unique` }),
            ]);
            expect(removalRequirements(diff)).toEqual([
                expect.objectContaining({ tableName: RECORD, constraintKind: "unique", constraintName: "slug_unique", physicalName: expect.stringMatching(new RegExp(`^${physicalPrefix("slug_unique")}`)) }),
            ]);

            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect((await indexes(system)).map(item => item.name).filter(name => name.startsWith(physicalPrefix("slug_unique")))).toEqual([]);
            await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
            await system.destroy();
        });

        test("C2 replaced UniqueConstraint (issue shape): only the new index remains", async () => {
            const createDb = createDbFor("c2");
            await install(
                createDb,
                [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])],
                [row("w1", "a", { status: "archived", activeSlugKey: "archived:1" })],
            );
            const { system, controller } = openNext(createDb, [channel([{ kind: "unique", name: "active_slug_unique", properties: ["workspaceId", "activeSlugKey"] }])]);
            const diff = await controller.generateMigrationDiff({ includeDestructiveScope: true });
            expect(constraintChanges(diff).map(change => [change.changeType, change.dataContext])).toEqual([
                ["added", `constraint:${RECORD}.active_slug_unique`],
                ["removed", `constraint:${RECORD}.slug_unique`],
            ]);

            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            const names = (await indexes(system)).map(item => item.name);
            expect(names.some(name => name.startsWith(physicalPrefix("active_slug_unique")))).toBe(true);
            expect(names.filter(name => name.startsWith(physicalPrefix("slug_unique")))).toEqual([]);
            // A new active channel reuses the archived channel's slug: allowed by the new declaration.
            await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
            await system.destroy();
        });

        test("C3 same-name UniqueConstraint gains a where predicate: the partial definition is applied", async () => {
            const createDb = createDbFor("c3");
            await install(
                createDb,
                [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])],
                [row("w1", "a", { status: "archived" })],
            );
            const { system, controller } = openNext(createDb, [channel([{
                kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"],
                where: { status: { op: "equals", value: "active" } },
            }])]);
            const diff = await controller.generateMigrationDiff({ includeDestructiveScope: true });
            expect(constraintChanges(diff)).toEqual([expect.objectContaining({ changeType: "changed", constraintKind: "unique" })]);
            // Redefinition drops the old guarantee: it needs the same approval as a removal.
            expect(removalRequirements(diff)).toHaveLength(1);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            const index = (await indexes(system)).find(item => item.name.startsWith(physicalPrefix("slug_unique")));
            expect(index?.definition).toMatch(/WHERE/);
            await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
            await system.destroy();
        });

        test("C4 same-name UniqueConstraint narrowed to fewer properties: the stricter declaration is enforced", async () => {
            const createDb = createDbFor("c4");
            await install(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["slug"] }])]);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            // Declared: slug is unique across workspaces. A second "a" must be rejected.
            await expect(system.storage.create(RECORD, row("w2", "a"))).rejects.toThrow();
            expect(await system.storage.find(RECORD, undefined, undefined, ["id"])).toHaveLength(1);
            await system.destroy();
        });

        testNonNull("C5 removed NonNullConstraint: diff lists the removal and migrate drops the CHECK constraint", async () => {
            const createDb = createDbFor("c5");
            await install(createDb, [channel([{ kind: "non-null", name: "note_required", property: "note" }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([])]);
            const diff = await controller.generateMigrationDiff({ includeDestructiveScope: true });
            expect(constraintChanges(diff)).toEqual([expect.objectContaining({ changeType: "removed", constraintKind: "non-null", dataContext: `constraint:${RECORD}.note_required` })]);
            expect(removalRequirements(diff)).toHaveLength(1);

            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect(await checkConstraintNames(system)).toEqual([]);
            await expect(system.storage.create(RECORD, row("w1", "b", { note: null }))).resolves.toBeDefined();
            await system.destroy();
        });

        testNonNull("C6 unchanged NonNullConstraint does not break a later unrelated migration", async () => {
            const createDb = createDbFor("c6");
            await install(createDb, [channel([{ kind: "non-null", name: "note_required", property: "note" }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "non-null", name: "note_required", property: "note" }], { extraProperty: true })]);
            const plan = await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect(plan.schemaPlan?.postRecomputeDDL.filter(operation => operation.kind === "create-constraint")).toEqual([]);
            await expect(system.storage.create(RECORD, row("w1", "b", { note: null }))).rejects.toThrow();
            await system.destroy();
        });

        testNonNull("C7 unchanged NonNullConstraint does not break setup(false) on an existing database", async () => {
            const createDb = createDbFor("c7");
            await install(createDb, [channel([{ kind: "non-null", name: "note_required", property: "note" }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "non-null", name: "note_required", property: "note" }])]);
            await expect(controller.setup(false)).resolves.toBeUndefined();
            await system.destroy();
        });

        test("C8 removed Entity.identity: migrate drops the framework identity index", async () => {
            const createDb = createDbFor("c8");
            await install(createDb, [channel([], { identity: ["workspaceId", "slug"] })], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([])]);
            const diff = await controller.generateMigrationDiff({ includeDestructiveScope: true });
            expect(removalRequirements(diff)).toEqual([expect.objectContaining({ constraintKind: "identity" })]);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect((await indexes(system)).map(item => item.name).filter(name => name.startsWith("interaqt_ident_"))).toEqual([]);
            await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
            await system.destroy();
        });

        testNonNull("C9 same-name NonNullConstraint moved to another property: migrate applies the new CHECK", async () => {
            const createDb = createDbFor("c9");
            await install(createDb, [channel([{ kind: "non-null", name: "note_required", property: "note" }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "non-null", name: "note_required", property: "slug" }])]);
            await expect(controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) })).resolves.toBeDefined();
            await expect(system.storage.create(RECORD, row("w1", "b", { note: null }))).resolves.toBeDefined();
            await expect(system.storage.create(RECORD, row("w1", "c", { slug: null }))).rejects.toThrow();
            await system.destroy();
        });

        test("C10 Entity.identity moved to other properties: only the new identity index remains", async () => {
            const createDb = createDbFor("c10");
            await install(createDb, [channel([], { identity: ["workspaceId", "slug"] })], [row("w1", "a", { activeSlugKey: "archived:1" })]);
            const { system, controller } = openNext(createDb, [channel([], { identity: ["workspaceId", "activeSlugKey"] })]);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect((await indexes(system)).filter(item => item.name.startsWith("interaqt_ident_"))).toHaveLength(1);
            // New identity key (w1, "a") is unused, so the create inserts a second row.
            await system.storage.create(RECORD, row("w1", "a"));
            expect(await system.storage.find(RECORD, undefined, undefined, ["id"])).toHaveLength(2);
            await system.destroy();
        });

        test("C11 removal needs the generated constraint-removal decision; a stale or missing decision is refused", async () => {
            const createDb = createDbFor("c11");
            await install(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([])]);
            const approved = await approveGeneratedMigrationDiff(controller);
            const withoutRemoval = { ...approved, decisions: approved.decisions.filter(decision => decision.kind !== "constraint-removal") };
            await expect(controller.migrate({ approvedDiff: withoutRemoval })).rejects.toThrow(/removes or redefines unique constraint .* without an approved decision/);
            const stale = {
                ...approved,
                decisions: approved.decisions.map(decision => decision.kind === "constraint-removal" ? { ...decision, previousDefinition: `${decision.previousDefinition} ` } : decision),
            };
            await expect(controller.migrate({ approvedDiff: stale })).rejects.toThrow(/constraint removal decision does not match a required review item/);
            expect((await indexes(system)).some(item => item.name.startsWith(physicalPrefix("slug_unique")))).toBe(true);
            await controller.migrate({ approvedDiff: approved });
            expect((await indexes(system)).some(item => item.name.startsWith(physicalPrefix("slug_unique")))).toBe(false);
            await system.destroy();
        });

        test("C12 a new constraint is listed as an added constraint change without a removal decision", async () => {
            const createDb = createDbFor("c12");
            await install(createDb, [channel([])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])]);
            const diff = await controller.generateMigrationDiff();
            expect(constraintChanges(diff)).toEqual([
                expect.objectContaining({ changeType: "added", constraintKind: "unique", nextDefinition: expect.stringContaining("CREATE UNIQUE INDEX") }),
            ]);
            expect(removalRequirements(diff)).toEqual([]);
            await system.destroy();
        });

        test("C13 a dropped constraint stops applying before recompute writes rows that only the new model allows", async () => {
            const createDb = createDbFor("c13");
            await install(
                createDb,
                [channel([{ kind: "unique", name: "slug_key_unique", properties: ["slugKey"] }], { slugKey: async (_deps, record) => record.slug })],
                [row("w1", "a"), row("w1", "b")],
            );
            const { system, controller } = openNext(createDb, [channel([], { slugKey: async () => "shared" })]);
            const plan = await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect(plan.schemaPlan?.constraintCleanupDDL).toEqual([expect.objectContaining({ kind: "drop-constraint" })]);
            const rows = await system.storage.find(RECORD, undefined, undefined, ["slugKey"]);
            expect(rows.map(item => item.slugKey)).toEqual(["shared", "shared"]);
            await system.destroy();
        });

        test("C14 a failed verification rolls back the drop of the replaced constraint", async () => {
            const createDb = createDbFor("c14");
            await install(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"] }])], [row("w1", "a"), row("w2", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "unique", name: "global_slug_unique", properties: ["slug"] }])]);
            await expect(controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) })).rejects.toThrow(/Migration verification failed/);
            let names = (await indexes(system)).map(item => item.name);
            expect(names.some(name => name.startsWith(physicalPrefix("slug_unique")))).toBe(true);
            expect(names.some(name => name.startsWith(physicalPrefix("global_slug_unique")))).toBe(false);

            await system.storage.delete(RECORD, MatchExp.atom({ key: "workspaceId", value: ["=", "w2"] }));
            const retry = openNext(createDb, [channel([{ kind: "unique", name: "global_slug_unique", properties: ["slug"] }])]);
            await retry.controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(retry.controller) });
            names = (await indexes(retry.system)).map(item => item.name);
            expect(names.some(name => name.startsWith(physicalPrefix("slug_unique")))).toBe(false);
            expect(names.some(name => name.startsWith(physicalPrefix("global_slug_unique")))).toBe(true);
            if (createDb.closeBetweenVersions) await system.destroy();
            await retry.system.destroy();
        });

        test("C15 setup(false) refuses a database that still holds a constraint the model no longer declares; a reviewed migration removes it", async () => {
            const createDb = createDbFor("c15");
            const installed = await install(createDb, [channel([])], [row("w1", "a")]);
            const probe = await rawDatabase(createDb, installed);
            // The state a <= 4.11.2 migration left behind: an index the manifest no longer lists.
            const orphan = `uniq_${RECORD}_slug_unique_legacy`;
            await probe.db.scheme(`CREATE UNIQUE INDEX "${orphan}" ON "${RECORD}" ("${fieldOf(installed, "workspaceId")}", "${fieldOf(installed, "slug")}")`);

            const attach = openNext(createDb, [channel([])]);
            const error = await attach.controller.setup(false).catch(caught => caught);
            expect(error).toBeInstanceOf(ConstraintSetupError);
            expect((error as ConstraintSetupError).mismatches).toEqual([expect.objectContaining({ status: "extra", kind: "unique", physicalName: orphan })]);
            expect((error as Error).message).toMatch(/generateMigrationDiff/);

            const { system, controller } = openNext(createDb, [channel([])]);
            const diff = await controller.generateMigrationDiff();
            expect(diff.fromModelHash).toBe(diff.toModelHash);
            expect(removalRequirements(diff)).toEqual([expect.objectContaining({ physicalName: orphan })]);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect((await indexes(system)).map(item => item.name)).not.toContain(orphan);

            const restart = openNext(createDb, [channel([])]);
            await expect(restart.controller.setup(false)).resolves.toBeUndefined();
            await expect(restart.system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
            await probe.close();
            if (createDb.closeBetweenVersions) await Promise.all([attach.system.destroy(), system.destroy()]);
            await restart.system.destroy();
        });

        test("C16 setup(false) refuses a same-name index whose definition differs from the declaration; a reviewed migration rebuilds it", async () => {
            const createDb = createDbFor("c16");
            const partial = channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"], where: { status: { op: "equals", value: "active" } } }]);
            const installed = await install(createDb, [partial], [row("w1", "a", { status: "archived" })]);
            const probe = await rawDatabase(createDb, installed);
            // The state a <= 4.11.2 same-name redefinition left behind: the old full definition under the declared name.
            const name = (await indexes(probe.db)).find(item => item.name.startsWith(physicalPrefix("slug_unique")))!.name;
            await probe.db.scheme(`DROP INDEX "${name}"`);
            await probe.db.scheme(`CREATE UNIQUE INDEX "${name}" ON "${RECORD}" ("${fieldOf(installed, "workspaceId")}", "${fieldOf(installed, "slug")}")`);

            const attach = openNext(createDb, [partial]);
            const error = await attach.controller.setup(false).catch(caught => caught);
            expect((error as ConstraintSetupError).mismatches).toEqual([expect.objectContaining({ status: "different", physicalName: name })]);

            const { system, controller } = openNext(createDb, [partial]);
            const diff = await controller.generateMigrationDiff();
            expect(constraintChanges(diff)).toEqual([expect.objectContaining({ changeType: "changed", physicalName: name })]);
            expect(removalRequirements(diff)).toHaveLength(1);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect((await indexes(system)).find(item => item.name === name)?.definition).toMatch(/WHERE/);
            await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
            const restart = openNext(createDb, [partial]);
            await expect(restart.controller.setup(false)).resolves.toBeUndefined();
            await probe.close();
            if (createDb.closeBetweenVersions) await Promise.all([attach.system.destroy(), system.destroy()]);
            await restart.system.destroy();
        });

        testPostgres("C17 objects created before definition fingerprints existed: attach accepts them and the next migration records fingerprints", async () => {
            const createDb = createDbFor("c17");
            const constraints: ConstraintDecl[] = [
                { kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"], where: { status: { op: "in", value: ["active", null] } } },
                { kind: "non-null", name: "note_required", property: "note" },
            ];
            const installed = await install(createDb, [channel(constraints, { identity: ["workspaceId", "activeSlugKey"] })], [row("w1", "a")]);
            const probe = await rawDatabase(createDb, installed);
            const indexNames = [...(await comments(probe.db)).keys()].filter(item => /^(uniq_|interaqt_)/.test(item));
            expect(indexNames).toHaveLength(3);
            for (const indexName of indexNames) await probe.db.scheme(`COMMENT ON INDEX "${indexName}" IS NULL`);
            for (const checkName of await checkConstraintNames(probe.db)) await probe.db.scheme(`COMMENT ON CONSTRAINT "${checkName}" ON "${RECORD}" IS NULL`);
            expect([...(await comments(probe.db)).values()].filter(Boolean)).toEqual([]);

            const attach = openNext(createDb, [channel(constraints, { identity: ["workspaceId", "activeSlugKey"] })]);
            await expect(attach.controller.setup(false)).resolves.toBeUndefined();

            const { system, controller } = openNext(createDb, [channel(constraints, { identity: ["workspaceId", "activeSlugKey"], extraProperty: true })]);
            const plan = await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect(plan.schemaPlan?.postRecomputeDDL.filter(operation => operation.tableName === RECORD && operation.kind === "create-constraint")).toEqual([]);
            expect(plan.schemaPlan?.postRecomputeDDL.filter(operation => operation.tableName === RECORD && operation.kind === "annotate-constraint").length).toBeGreaterThanOrEqual(indexNames.length + 1);
            const after = await comments(system);
            expect(indexNames.every(indexName => after.get(indexName)?.startsWith("interaqt-constraint:v1:"))).toBe(true);
            await probe.close();
            if (createDb.closeBetweenVersions) await attach.system.destroy();
            await system.destroy();
        });

        testPostgres("C18 an index whose definition cannot be verified does not block startup; the next migration rebuilds it without a removal decision", async () => {
            const createDb = createDbFor("c18");
            const partial = channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"], where: { status: { op: "equals", value: "active" } } }]);
            const installed = await install(createDb, [partial], [row("w1", "a")]);
            const probe = await rawDatabase(createDb, installed);
            const name = (await indexes(probe.db)).find(item => item.name.startsWith(physicalPrefix("slug_unique")))!.name;
            const status = fieldOf(installed, "status");
            await probe.db.scheme(`DROP INDEX "${name}"`);
            await probe.db.scheme(`CREATE UNIQUE INDEX "${name}" ON "${RECORD}" ("${fieldOf(installed, "workspaceId")}", "${fieldOf(installed, "slug")}") WHERE lower("${status}") = 'active'`);

            const attach = openNext(createDb, [partial]);
            await expect(attach.controller.setup(false)).resolves.toBeUndefined();

            const { system, controller } = openNext(createDb, [partial]);
            const diff = await controller.generateMigrationDiff();
            expect(constraintChanges(diff)).toEqual([expect.objectContaining({ changeType: "changed", physicalName: name, reason: expect.stringMatching(/outside the predicate forms/) })]);
            expect(removalRequirements(diff)).toEqual([]);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            const rebuilt = (await indexes(system)).find(item => item.name === name)!;
            expect(rebuilt.definition).not.toMatch(/lower\(/);
            expect((await comments(system)).get(name)).toMatch(/^interaqt-constraint:v1:/);
            await probe.close();
            if (createDb.closeBetweenVersions) await attach.system.destroy();
            await system.destroy();
        });

        test("C19 a metadata-only constraint change (violationCode) changes no constraint objects", async () => {
            const createDb = createDbFor("c19");
            await install(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"], violationCode: "SLUG_TAKEN" }])], [row("w1", "a")]);
            const { system, controller } = openNext(createDb, [channel([{ kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"], violationCode: "SLUG_IN_USE" }])]);
            const diff = await controller.generateMigrationDiff();
            expect(diff.fromModelHash).not.toBe(diff.toModelHash);
            expect(constraintChanges(diff)).toEqual([]);
            const plan = await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect(plan.schemaPlan?.constraintCleanupDDL).toEqual([]);
            expect(plan.schemaPlan?.postRecomputeDDL.filter(operation => operation.kind === "create-constraint")).toEqual([]);
            await expect(system.storage.create(RECORD, row("w1", "a"))).rejects.toMatchObject({ context: expect.objectContaining({ code: "SLUG_IN_USE" }) });
            await system.destroy();
        });

        test("C20 the unique index of a removed Transform is dropped as a listed change without a removal decision", async () => {
            const createDb = createDbFor("c20");
            const source = () => new Entity({
                name: "ConstraintReconcileSource",
                properties: [new Property({ name: "n", type: "number" }, { uuid: "constraint-reconcile-source-n" })],
            }, { uuid: "constraint-reconcile-source" });
            const derived = (withTransform: boolean, sourceEntity: Entity) => new Entity({
                name: "ConstraintReconcileDerived",
                properties: [new Property({ name: "n2", type: "number" }, { uuid: "constraint-reconcile-derived-n2" })],
                ...(withTransform ? {
                    computation: new Transform({
                        record: sourceEntity,
                        attributeQuery: ["n"],
                        callback: (item: { n: number }) => ({ n2: item.n * 2 }),
                    }, { uuid: "constraint-reconcile-derived-transform" }),
                } : {}),
            }, { uuid: "constraint-reconcile-derived" });
            const sourceV1 = source();
            const installed = await install(createDb, [sourceV1, derived(true, sourceV1)]);
            if (!createDb.closeBetweenVersions) await installed.storage.create("ConstraintReconcileSource", { n: 1 });
            const transformIndexes = async (system: MonoSystem) => (await indexes(system, "ConstraintReconcileDerived")).map(item => item.name).filter(name => name.startsWith("idx_transform_"));

            const sourceV2 = source();
            const { system, controller } = openNext(createDb, [sourceV2, derived(false, sourceV2)]);
            const diff = await controller.generateMigrationDiff();
            expect(constraintChanges(diff)).toEqual([expect.objectContaining({ changeType: "removed", constraintKind: "transform-unique" })]);
            expect(removalRequirements(diff)).toEqual([]);
            await controller.migrate({ approvedDiff: await approveGeneratedMigrationDiff(controller) });
            expect(await transformIndexes(system)).toEqual([]);
            await system.destroy();
        });
    });
}

// Oracle positive control: a fresh install of each cell's v2 satisfies the same
// expectations, so the expected contract is "what setup(true) of v2 produces".
describe("PGLite: fresh-install twins satisfy the expected contract", () => {
    async function fresh(entity: Entity, rows: Record<string, unknown>[]) {
        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        await new Controller({ system, entities: [entity], relations: [] }).setup(true);
        for (const item of rows) await system.storage.create(RECORD, item);
        return system;
    }

    test("C1/C5/C8 twin: no constraint declared", async () => {
        const system = await fresh(channel([]), [row("w1", "a")]);
        await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
        await expect(system.storage.create(RECORD, row("w1", "b", { note: null }))).resolves.toBeDefined();
        await system.destroy();
    });

    test("C2 twin: replacement constraint only", async () => {
        const system = await fresh(
            channel([{ kind: "unique", name: "active_slug_unique", properties: ["workspaceId", "activeSlugKey"] }]),
            [row("w1", "a", { status: "archived", activeSlugKey: "archived:1" })],
        );
        await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
        await system.destroy();
    });

    test("C3 twin: partial unique index", async () => {
        const system = await fresh(channel([{
            kind: "unique", name: "slug_unique", properties: ["workspaceId", "slug"],
            where: { status: { op: "equals", value: "active" } },
        }]), [row("w1", "a", { status: "archived" })]);
        const index = (await indexes(system)).find(item => item.name.startsWith(physicalPrefix("slug_unique")));
        expect(index?.definition).toMatch(/WHERE/);
        await expect(system.storage.create(RECORD, row("w1", "a"))).resolves.toBeDefined();
        await system.destroy();
    });

    test("C4 twin: narrowed unique constraint", async () => {
        const system = await fresh(channel([{ kind: "unique", name: "slug_unique", properties: ["slug"] }]), [row("w1", "a")]);
        await expect(system.storage.create(RECORD, row("w2", "a"))).rejects.toThrow();
        await system.destroy();
    });

    test("C9 twin: NonNullConstraint on slug", async () => {
        const system = await fresh(channel([{ kind: "non-null", name: "note_required", property: "slug" }]), [row("w1", "a")]);
        await expect(system.storage.create(RECORD, row("w1", "b", { note: null }))).resolves.toBeDefined();
        await expect(system.storage.create(RECORD, row("w1", "c", { slug: null }))).rejects.toThrow();
        await system.destroy();
    });

    test("C10 twin: identity on (workspaceId, activeSlugKey)", async () => {
        const system = await fresh(channel([], { identity: ["workspaceId", "activeSlugKey"] }), [row("w1", "a", { activeSlugKey: "archived:1" })]);
        await system.storage.create(RECORD, row("w1", "a"));
        expect(await system.storage.find(RECORD, undefined, undefined, ["id"])).toHaveLength(2);
        await system.destroy();
    });
});

defineCells({
    label: "PGLite",
    nonNull: true,
    postgresCatalog: true,
    database: () => {
        let db: PGLiteDB | undefined;
        return { open: () => (db ??= new PGLiteDB()), closeBetweenVersions: false };
    },
});

defineCells({
    label: "SQLite",
    // SQLite has no post-install NonNullConstraint support (setup fails fast).
    nonNull: false,
    postgresCatalog: false,
    database: () => {
        let db: SQLiteDB | undefined;
        return { open: () => (db ??= new SQLiteDB(":memory:")), closeBetweenVersions: false };
    },
});

// Real PostgreSQL (dialect-matched probe; the issue was observed there).
const pgDatabase = process.env.INTERAQT_POSTGRES_DATABASE;
if (pgDatabase) {
    const dbOptions = {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
    };
    defineCells({
        label: "PostgreSQL",
        nonNull: true,
        postgresCatalog: true,
        database: cell => ({
            open: () => new PostgreSQLDB(`${pgDatabase}_constraint_reconcile_${cell}`, dbOptions),
            closeBetweenVersions: true,
        }),
    });
} else {
    describe.skip("PostgreSQL: migration reconciles declared constraints with installed constraints", () => {
        test("requires INTERAQT_POSTGRES_DATABASE", () => {});
    });
}
