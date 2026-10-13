/**
 * Catalog readers and definition comparison for framework-managed constraints
 * (src/storage/erstorage/ManagedConstraints.ts), on the dialects whose catalogs they read.
 *
 * The PostgreSQL cells create partial unique indexes with every predicate shape the
 * framework generates and without a fingerprint comment (the state of every index created
 * before fingerprints existed). The parser must read the server's deparsed predicate back
 * to the declared canonical form; a changed value must compare as different. PGLite runs
 * always; real PostgreSQL runs when INTERAQT_POSTGRES_DATABASE is set (same server engine,
 * but the deparse output is version dependent, so it is a separate dialect-matched probe).
 */
import { describe, expect, test } from "vitest";
import type { ConstraintPredicate } from "interaqt";
import type { Database } from "@runtime";
import {
    canonicalizeConstraintPredicate,
    classifyManagedConstraintName,
    createDesiredManagedConstraint,
    createUniqueIndexSQL,
    getSchemaDialect,
    managedConstraintFingerprintSQL,
    parsePostgresPredicate,
    readInstalledManagedConstraints,
    reconcileManagedConstraints,
    type DesiredManagedConstraint,
} from "@storage";
import { PGLiteDB, PostgreSQLDB, SQLiteDB } from "@drivers";

const TABLE = "ManagedCatalogProbe";

function desiredIndex(db: Database, name: string, fields: string[], where?: ConstraintPredicate): DesiredManagedConstraint {
    const dialect = getSchemaDialect(db);
    return createDesiredManagedConstraint({
        kind: "unique",
        physicalName: name,
        recordName: TABLE,
        constraintName: name,
        properties: fields,
        logicalPath: `${TABLE}.${fields.join(".")}`,
        definition: { objectType: "index", tableName: TABLE, fields, where: canonicalizeConstraintPredicate(where, property => property) },
        createSQL: createUniqueIndexSQL(name, TABLE, fields, dialect, where, property => property),
    });
}

async function statusOf(db: Database, desired: DesiredManagedConstraint) {
    const dialect = getSchemaDialect(db);
    const installed = await readInstalledManagedConstraints(db, dialect, [TABLE]);
    const entry = reconcileManagedConstraints([desired], installed.filter(item => item.physicalName === desired.physicalName), dialect)[0];
    return entry;
}

const PREDICATE_CASES: Array<{ label: string, where: ConstraintPredicate, changed: ConstraintPredicate }> = [
    { label: "equals string", where: { status: { op: "equals", value: "active" } }, changed: { status: { op: "equals", value: "archived" } } },
    { label: "equals string with quote", where: { status: { op: "equals", value: "O'Brien" } }, changed: { status: { op: "equals", value: "OBrien" } } },
    { label: "equals double", where: { score: { op: "equals", value: 1.5 } }, changed: { score: { op: "equals", value: 2.5 } } },
    { label: "equals negative double", where: { score: { op: "equals", value: -1 } }, changed: { score: { op: "equals", value: 1 } } },
    { label: "equals integer column", where: { rank: { op: "equals", value: 3 } }, changed: { rank: { op: "equals", value: 4 } } },
    { label: "equals boolean", where: { flag: { op: "equals", value: true } }, changed: { flag: { op: "equals", value: false } } },
    { label: "equals null", where: { status: { op: "equals", value: null } }, changed: { status: { op: "notEquals", value: null } } },
    { label: "notEquals string", where: { status: { op: "notEquals", value: "deleted" } }, changed: { status: { op: "notEquals", value: "gone" } } },
    { label: "isNull", where: { status: { op: "isNull" } }, changed: { status: { op: "isNotNull" } } },
    { label: "isNotNull", where: { status: { op: "isNotNull" } }, changed: { status: { op: "isNull" } } },
    { label: "in two strings", where: { status: { op: "in", value: ["a", "b"] } }, changed: { status: { op: "in", value: ["a", "c"] } } },
    { label: "in one string", where: { status: { op: "in", value: ["a"] } }, changed: { status: { op: "in", value: ["b"] } } },
    { label: "in with null", where: { status: { op: "in", value: ["a", null] } }, changed: { status: { op: "in", value: ["a"] } } },
    { label: "in only null", where: { status: { op: "in", value: [null] } }, changed: { status: { op: "notIn", value: [null] } } },
    { label: "in numbers", where: { score: { op: "in", value: [1, 2.5] } }, changed: { score: { op: "in", value: [1, 3] } } },
    { label: "notIn two strings", where: { status: { op: "notIn", value: ["a", "b"] } }, changed: { status: { op: "notIn", value: ["a"] } } },
    { label: "notIn with null", where: { status: { op: "notIn", value: ["a", null] } }, changed: { status: { op: "notIn", value: ["a"] } } },
    {
        label: "conjunction over three columns",
        where: { status: { op: "equals", value: "active" }, flag: { op: "equals", value: true }, score: { op: "notIn", value: [0, null] } },
        changed: { status: { op: "equals", value: "active" }, flag: { op: "equals", value: true }, score: { op: "notIn", value: [0] } },
    },
];

function definePostgresCatalogCells(label: string, open: (cell: string) => Promise<Database>) {
    describe(`${label}: legacy partial indexes without a fingerprint comment`, () => {
        test.each(PREDICATE_CASES.map((item, index) => [index, item.label] as const))("case %i (%s): parser reads the deparsed predicate back", async index => {
            const item = PREDICATE_CASES[index];
            const db = await open(`p${index}`);
            await db.scheme(`CREATE TABLE "${TABLE}" ("ws" TEXT, "status" TEXT, "score" DOUBLE PRECISION, "rank" INT, "flag" BOOLEAN)`);
            const desired = desiredIndex(db, "uniq_ManagedCatalogProbe_case", ["ws"], item.where);
            await db.scheme(desired.createSQL);

            const equal = await statusOf(db, desired);
            expect(equal.installed?.fingerprint).toBeUndefined();
            expect(equal.installed?.predicate, "the catalog exposes the deparsed predicate").toBeTruthy();
            expect(parsePostgresPredicate(equal.installed!.predicate!)).toEqual(desired.definition.where);
            expect(equal.status).toBe("equal");
            expect(equal.needsFingerprint).toBe(true);

            const changed = await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_case", ["ws"], item.changed));
            expect(changed.status).toBe("different");
            await db.close();
        });

        test("recorded fingerprint decides, and a different declaration compares as different", async () => {
            const db = await open("fingerprint");
            await db.scheme(`CREATE TABLE "${TABLE}" ("ws" TEXT, "status" TEXT)`);
            const desired = desiredIndex(db, "uniq_ManagedCatalogProbe_fp", ["ws"], { status: { op: "equals", value: "active" } });
            await db.scheme(desired.createSQL);
            await db.scheme(managedConstraintFingerprintSQL(desired, getSchemaDialect(db))!);
            const entry = await statusOf(db, desired);
            expect(entry.installed?.fingerprint).toBe(desired.fingerprint);
            expect(entry.status).toBe("equal");
            expect(entry.needsFingerprint).toBe(false);
            const other = await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_fp", ["ws"], { status: { op: "equals", value: "archived" } }));
            expect(other.status).toBe("different");
            await db.close();
        });

        test("a predicate outside the generated forms is undecidable, never equal", async () => {
            const db = await open("foreign");
            await db.scheme(`CREATE TABLE "${TABLE}" ("ws" TEXT, "status" TEXT)`);
            await db.scheme(`CREATE UNIQUE INDEX "uniq_ManagedCatalogProbe_foreign" ON "${TABLE}" ("ws") WHERE lower("status") = 'active'`);
            const entry = await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_foreign", ["ws"], { status: { op: "equals", value: "active" } }));
            expect(entry.status).toBe("undecidable");
            await db.close();
        });

        test("column list, uniqueness and predicate presence are compared structurally", async () => {
            const db = await open("structure");
            await db.scheme(`CREATE TABLE "${TABLE}" ("ws" TEXT, "slug" TEXT, "status" TEXT)`);
            await db.scheme(`CREATE UNIQUE INDEX "uniq_ManagedCatalogProbe_cols" ON "${TABLE}" ("ws", "slug")`);
            await db.scheme(`CREATE INDEX "uniq_ManagedCatalogProbe_plain" ON "${TABLE}" ("ws")`);
            expect((await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_cols", ["ws", "slug"]))).status).toBe("equal");
            expect((await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_cols", ["slug", "ws"]))).status).toBe("different");
            expect((await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_cols", ["slug"]))).status).toBe("different");
            expect((await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_cols", ["ws", "slug"], { status: { op: "isNotNull" } }))).status).toBe("different");
            expect((await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_plain", ["ws"]))).status).toBe("different");
            await db.close();
        });
    });
}

definePostgresCatalogCells("PGLite", async () => {
    const db = new PGLiteDB();
    await db.open();
    return db;
});

const pgDatabase = process.env.INTERAQT_POSTGRES_DATABASE;
if (pgDatabase) {
    const dbOptions = {
        host: process.env.PGHOST,
        port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
    };
    definePostgresCatalogCells("PostgreSQL", async cell => {
        const db = new PostgreSQLDB(`${pgDatabase}_managed_catalog_${cell}`, dbOptions);
        await db.open(true);
        return db;
    });
}

describe("SQLite: stored CREATE statement decides partial index definitions", () => {
    test("generated statement compares equal; a structurally identical index with different text is undecidable", async () => {
        const db = new SQLiteDB(":memory:");
        await db.open();
        await db.scheme(`CREATE TABLE "${TABLE}" ("ws" TEXT, "status" TEXT)`);
        const desired = desiredIndex(db, "uniq_ManagedCatalogProbe_sqlite", ["ws"], { status: { op: "equals", value: "active" } });
        await db.scheme(desired.createSQL);
        expect((await statusOf(db, desired)).status).toBe("equal");
        expect((await statusOf(db, desiredIndex(db, "uniq_ManagedCatalogProbe_sqlite", ["ws"]))).status).toBe("different");

        await db.scheme(`DROP INDEX "uniq_ManagedCatalogProbe_sqlite"`);
        await db.scheme(`CREATE UNIQUE INDEX "uniq_ManagedCatalogProbe_sqlite" ON "${TABLE}" ("ws") WHERE "status" = 'archived'`);
        expect((await statusOf(db, desired)).status).toBe("undecidable");
        await db.close();
    });
});

describe("managed constraint ownership and canonical predicates", () => {
    test("reserved prefixes identify framework-owned objects", () => {
        expect(classifyManagedConstraintName("uniq_Channel_slug_unique_1abc", "index")).toBe("unique");
        expect(classifyManagedConstraintName("uniq_Channel_note_required_1abc", "check")).toBe("non-null");
        expect(classifyManagedConstraintName("interaqt_ident_0123456789abcdef0123", "index")).toBe("identity");
        expect(classifyManagedConstraintName("interaqt_id_0123456789abcdef0123", "index")).toBe("logical-id");
        expect(classifyManagedConstraintName("idx_transform_0123456789abcdef0123", "index")).toBe("transform-unique");
        expect(classifyManagedConstraintName("Channel_pkey", "index")).toBeUndefined();
        expect(classifyManagedConstraintName("channel_status_check", "check")).toBeUndefined();
    });

    test("equivalent operator spellings share one canonical form", () => {
        const canonical = (where: ConstraintPredicate) => canonicalizeConstraintPredicate(where, property => property);
        expect(canonical({ s: { op: "equals", value: "a" } })).toEqual(canonical({ s: { op: "in", value: ["a"] } }));
        expect(canonical({ s: { op: "equals", value: null } })).toEqual(canonical({ s: { op: "isNull" } }));
        expect(canonical({ s: { op: "notEquals", value: null } })).toEqual(canonical({ s: { op: "isNotNull" } }));
        expect(canonical({ s: { op: "in", value: ["b", "a", "a"] } })).toEqual(canonical({ s: { op: "in", value: ["a", "b"] } }));
        expect(canonical({ s: { op: "in", value: [1] } })).not.toEqual(canonical({ s: { op: "in", value: ["1"] } }));
    });

    test("the parser rejects text outside the generated grammar", () => {
        expect(parsePostgresPredicate("(lower(status) = 'a'::text)")).toBeUndefined();
        expect(parsePostgresPredicate("((a = 'x'::text) OR (b = 'y'::text))")).toBeUndefined();
        expect(parsePostgresPredicate("(a > 1)")).toBeUndefined();
        expect(parsePostgresPredicate("(a = ANY ('{x,y}'::text[]))")).toBeUndefined();
        expect(parsePostgresPredicate("((status = 'active'::text) AND (n = (1)::double precision) AND (b = true))")).toEqual([
            { field: "b", op: "in", values: [true], includesNull: false },
            { field: "n", op: "in", values: [1], includesNull: false },
            { field: "status", op: "in", values: ["active"], includesNull: false },
        ]);
    });
});
