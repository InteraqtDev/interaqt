import { describe, expect, test } from "vitest";
import {
  Action,
  Controller,
  Entity,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  Relation,
  StateMachine,
  StateNode,
  StateTransfer,
  Transform,
} from "interaqt";
import { findConstraintViolationError } from "../../src/runtime/errors/ConstraintErrors.js";
import {
  createFrameworkLogicalIdUniqueIndexSQL,
  createUniqueConstraintStatement,
  createUniqueIndexSQL,
  DBSetup,
  frameworkLogicalIdUniqueIndexName,
  frameworkLogicalIdUniqueIndexes,
  getSchemaDialect,
  MatchExp,
} from "@storage";
import { MysqlDB, PGLiteDB, PostgreSQLDB, SQLiteDB } from "@drivers";
import { normalizeDatabaseError } from "../../src/runtime/errors/DatabaseErrors.js";

function makeNoteEntity(name: string) {
  return Entity.create({
    name,
    properties: [Property.create({ name: "title", type: "string" })],
  });
}

async function setupSystem(
  db: InstanceType<typeof PGLiteDB> | InstanceType<typeof SQLiteDB> | InstanceType<typeof PostgreSQLDB> | InstanceType<typeof MysqlDB>,
  entities: ReturnType<typeof Entity.create>[],
  relations: ReturnType<typeof Relation.create>[] = []
) {
  const system = new MonoSystem(db);
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, entities, relations });
  await controller.setup(true);
  return { system, controller };
}

const MYSQL_ENABLED = !!process.env.INTERAQT_MYSQL_DATABASE;
const mysqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  user: process.env.MYSQL_USER || "interaqt",
  password: process.env.MYSQL_PASSWORD || "interaqt",
};

const POSTGRES_ENABLED = !!process.env.INTERAQT_POSTGRES_DATABASE;
const postgresConfig = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

describe("entity identity — storage invariants (M-01)", () => {
  test("create omits id / carries unique id on PGLite and SQLite", async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const Note = makeNoteEntity(`IdNote${db.constructor.name}`);
      const { system } = await setupSystem(db, [Note]);

      const auto = await system.storage.create(Note.name, { title: "auto" });
      expect(auto.id).toBeDefined();
      expect(auto.id).not.toBeNull();

      const externalId = db instanceof PGLiteDB
        ? "11111111-1111-7111-8111-111111111111"
        : 900001;
      const external = await system.storage.create(Note.name, { id: externalId, title: "external" });
      expect(String(external.id)).toBe(String(externalId));

      const found = await system.storage.findOne(
        Note.name,
        MatchExp.atom({ key: "id", value: ["=", externalId] }),
        undefined,
        ["*"]
      );
      expect(found?.title).toBe("external");

      await system.destroy();
    }
  });

  test("duplicate logical id create fails loud (unique index)", async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const Note = makeNoteEntity(`DupNote${db.constructor.name}`);
      const { system } = await setupSystem(db, [Note]);

      const externalId = db instanceof PGLiteDB
        ? "22222222-2222-7222-8222-222222222222"
        : 42;
      await system.storage.create(Note.name, { id: externalId, title: "first" });
      await expect(
        system.storage.create(Note.name, { id: externalId, title: "second" })
      ).rejects.toBeTruthy();

      const rows = await system.storage.find(
        Note.name,
        MatchExp.atom({ key: "id", value: ["=", externalId] }),
        undefined,
        ["*"]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("first");

      await system.destroy();
    }
  });

  test("update payload id is stripped: row id unchanged and no throw", async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const Note = makeNoteEntity(`UpdNote${db.constructor.name}`);
      const { system } = await setupSystem(db, [Note]);

      const created = await system.storage.create(Note.name, { title: "before" });
      const originalId = created.id;
      const otherId = db instanceof PGLiteDB
        ? "33333333-3333-7333-8333-333333333333"
        : 999999;

      await expect(
        system.storage.update(
          Note.name,
          MatchExp.atom({ key: "id", value: ["=", originalId] }),
          { id: otherId, title: "after" }
        )
      ).resolves.toBeTruthy();

      const byOriginal = await system.storage.findOne(
        Note.name,
        MatchExp.atom({ key: "id", value: ["=", originalId] }),
        undefined,
        ["*"]
      );
      expect(byOriginal?.title).toBe("after");
      expect(String(byOriginal?.id)).toBe(String(originalId));

      const byOther = await system.storage.findOne(
        Note.name,
        MatchExp.atom({ key: "id", value: ["=", otherId] }),
        undefined,
        ["*"]
      );
      expect(byOther).toBeUndefined();

      await system.destroy();
    }
  });

  test("SQLite: external large id advances sequence — auto creates do not collide", async () => {
    const Note = makeNoteEntity("SeqNoteSQLite");
    const { system } = await setupSystem(new SQLiteDB(":memory:"), [Note]);

    await system.storage.create(Note.name, { id: 5, title: "external-5" });
    const ids = new Set<string>(["5"]);
    for (let i = 0; i < 8; i++) {
      const row = await system.storage.create(Note.name, { title: `auto-${i}` });
      const idKey = String(row.id);
      expect(ids.has(idKey)).toBe(false);
      ids.add(idKey);
    }
    expect(ids.size).toBe(9);

    await system.destroy();
  });

  // Real PostgreSQL: create-path noteAllocatedId must advance setval the same way as
  // setupSequences MAX reconciliation. Without this pin, only SQLite exercised the
  // online counter path while PG relied on untested setval SQL (M-05 audit V7).
  test.skipIf(!POSTGRES_ENABLED)(
    "PostgreSQL: external large id advances sequence — auto creates do not collide",
    async () => {
      const database = `${process.env.INTERAQT_POSTGRES_DATABASE!}_entity_id_seq`;
      const Note = makeNoteEntity("SeqNotePostgreSQL");
      const { system } = await setupSystem(new PostgreSQLDB(database, postgresConfig), [Note]);

      try {
        await system.storage.create(Note.name, { id: 5, title: "external-5" });
        const ids = new Set<string>(["5"]);
        for (let i = 0; i < 8; i++) {
          const row = await system.storage.create(Note.name, { title: `auto-${i}` });
          const idKey = String(row.id);
          expect(ids.has(idKey)).toBe(false);
          ids.add(idKey);
        }
        expect(ids.size).toBe(9);
        // Unique index still fail-loud on the external id after auto allocation.
        await expect(
          system.storage.create(Note.name, { id: 5, title: "dup-external" })
        ).rejects.toBeTruthy();
      } finally {
        await system.destroy();
      }
    },
    60000
  );

  test("PGLite: external UUID id path works with unique index", async () => {
    const Note = makeNoteEntity("UuidNotePGLite");
    const { system } = await setupSystem(new PGLiteDB(), [Note]);
    const uuid = "44444444-4444-7444-8444-444444444444";
    await system.storage.create(Note.name, { id: uuid, title: "u" });
    await expect(
      system.storage.create(Note.name, { id: uuid, title: "dup" })
    ).rejects.toBeTruthy();
    const found = await system.storage.findOne(
      Note.name,
      MatchExp.atom({ key: "id", value: ["=", uuid] }),
      undefined,
      ["*"]
    );
    expect(found?.title).toBe("u");
    await system.destroy();
  });

  test("physical idField UNIQUE INDEX contract: enumeration, column names, combined table", async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const User = Entity.create({
        name: `IdUser${db.constructor.name}`,
        properties: [Property.create({ name: "name", type: "string" })],
      });
      const Profile = Entity.create({
        name: `IdProfile${db.constructor.name}`,
        properties: [Property.create({ name: "bio", type: "string" })],
      });
      const UserProfile = Relation.create({
        source: User,
        sourceProperty: "profile",
        target: Profile,
        targetProperty: "user",
        type: "1:1",
        isTargetReliance: true,
      });

      const { system } = await setupSystem(db, [User, Profile], [UserProfile]);
      const map = (system.storage as unknown as { queryHandle: { map: { data: { records: Record<string, any> } } } }).queryHandle.map;
      const records = map.data.records;
      const emitted = frameworkLogicalIdUniqueIndexes(map.data);

      for (const item of emitted) {
        expect(item.idField).toBeTruthy();
        expect(item.idField).not.toBe("id");
        expect(records[item.recordName].attributes.id.field).toBe(item.idField);
        expect(records[item.recordName].isFilteredEntity).toBeFalsy();
        expect(records[item.recordName].isFilteredRelation).toBeFalsy();
      }

      // Every non-filtered entity/relation with id is present exactly once
      const expectedNames = Object.entries(records)
        .filter(([, r]) => !r.isFilteredEntity && !r.isFilteredRelation && r.attributes?.id?.field)
        .map(([name]) => name)
        .sort();
      expect(emitted.map(e => e.recordName).sort()).toEqual(expectedNames);

      // Combined 1:1 reliance: same physical table, multiple distinct idFields indexed
      const userTable = records[User.name].table;
      const profileTable = records[Profile.name].table;
      const linkName = UserProfile.name!;
      const linkTable = records[linkName].table;
      expect(userTable).toBe(profileTable);
      expect(userTable).toBe(linkTable);

      const onCombined = emitted.filter(e => e.table === userTable);
      const idFields = new Set(onCombined.map(e => e.idField));
      expect(onCombined.length).toBeGreaterThanOrEqual(2);
      expect(idFields.size).toBe(onCombined.length);

      // SQL uses idField, not literal "id"
      const dialect = getSchemaDialect(db);
      for (const item of createFrameworkLogicalIdUniqueIndexSQL(map.data, dialect)) {
        expect(item.sql).toContain(item.idField);
        // Quoted "id" as sole column would be wrong for current hashed names
        expect(item.sql).not.toMatch(/\(\s*"id"\s*\)/);
        expect(item.sql).toMatch(/CREATE UNIQUE INDEX/i);
      }

      // Fail-loud on any of the combined-table records
      const externalId = db instanceof PGLiteDB
        ? "55555555-5555-7555-8555-555555555555"
        : 777001;
      await system.storage.create(User.name, { id: externalId, name: "u1" });
      await expect(
        system.storage.create(User.name, { id: externalId, name: "u2" })
      ).rejects.toBeTruthy();

      await system.destroy();
    }
  });

  test("mysql-like dialect: framework id UNIQUE via createUniqueIndexSQL; user UniqueConstraint still fail-fast", () => {
    const Note = makeNoteEntity("MysqlLikeIdNote");
    const mysqlLikeDatabase = {
      schemaDialect: {
        name: "mysql" as const,
        maxIdentifierLength: 64,
        supportsCreateIndexIfNotExists: false,
        enforceMaxIdentifierLength: true,
        encodeLiteral: (v: unknown) => JSON.stringify(v),
        constraints: { unique: false, filteredUnique: false, nonNull: false },
      },
      mapToDBFieldType: (type: string) => {
        if (type === "pk") return "INT AUTO_INCREMENT PRIMARY KEY";
        if (type === "id") return "INT";
        if (type === "string") return "TEXT";
        return type;
      },
    };

    const setup = new DBSetup([Note], [], mysqlLikeDatabase as any);
    const dialect = getSchemaDialect(mysqlLikeDatabase as any);
    expect(dialect.constraints.unique).toBe(false);

    // User UniqueConstraint path still throws (existing contract)
    const userUniqueItem = {
      kind: "unique" as const,
      constraintName: "MysqlLikeIdNote_title_unique",
      physicalName: "MysqlLikeIdNote_title_unique",
      recordName: Note.name,
      tableName: Note.name,
      properties: ["title"],
      fields: ["title"],
    };
    expect(() => createUniqueConstraintStatement(userUniqueItem, dialect, p => p)).toThrow(
      /unique constraints are not supported/
    );

    // Framework id indexes still emit via createUniqueIndexSQL with fields=[idField]
    const items = createFrameworkLogicalIdUniqueIndexSQL(setup.map, dialect);
    expect(items.length).toBeGreaterThanOrEqual(1);
    const noteItem = items.find(i => i.recordName === Note.name);
    expect(noteItem).toBeDefined();
    expect(noteItem!.idField).not.toBe("id");
    expect(noteItem!.sql).toBe(
      createUniqueIndexSQL(noteItem!.indexName, noteItem!.table, [noteItem!.idField], dialect)
    );
    expect(noteItem!.sql).toContain(noteItem!.idField);
    expect(noteItem!.sql).not.toMatch(/\(\s*"id"\s*\)/);
    // MySQL has no IF NOT EXISTS — re-entry must treat "index already exists" as success
    expect(noteItem!.sql).not.toMatch(/IF NOT EXISTS/i);
    expect(noteItem!.sql).toMatch(/CREATE UNIQUE INDEX/i);

    // Error normalization for the no-IF-NOT-EXISTS path (D1)
    const mysqlDup = Object.assign(new Error("Duplicate key name 'interaqt_id_abc'"), { errno: 1061, code: "ER_DUP_KEYNAME" });
    expect(normalizeDatabaseError(mysqlDup).isIndexAlreadyExists).toBe(true);
    expect(normalizeDatabaseError(mysqlDup).isUniqueViolation).toBe(false);
    const pgAlready = Object.assign(new Error('relation "interaqt_id_abc" already exists'), { code: "42P07" });
    expect(normalizeDatabaseError(pgAlready).isIndexAlreadyExists).toBe(true);
  });

  test("setup(true) then setup(false) is idempotent for framework logical id UNIQUE INDEX", async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const Note = makeNoteEntity(`ReentryNote${db.constructor.name}`);
      const system1 = new MonoSystem(db);
      system1.conceptClass = KlassByName;
      const c1 = new Controller({ system: system1, entities: [Note], relations: [] });
      await c1.setup(true);

      const emitted = frameworkLogicalIdUniqueIndexes(
        (system1.storage as any).queryHandle.map.data
      );
      const noteIndex = emitted.find(e => e.recordName === Note.name);
      expect(noteIndex).toBeDefined();

      // V2: schema.constraints registers framework id indexes (observability)
      const idish = system1.storage.schema.constraints.filter(
        (c): c is Extract<typeof c, { kind: "unique" }> =>
          c.kind === "unique"
          && c.properties.includes("id")
          && String(c.physicalName).startsWith("interaqt_id_")
      );
      expect(idish.length).toBeGreaterThanOrEqual(1);
      const noteMeta = idish.find(c => c.recordName === Note.name);
      expect(noteMeta).toBeDefined();
      expect(noteMeta!.fields).toEqual([noteIndex!.idField]);
      expect(noteMeta!.physicalName).toBe(
        frameworkLogicalIdUniqueIndexName(Note.name, noteIndex!.idField)
      );

      // First create with external id succeeds; uniqueness holds after re-entry
      const externalId = db instanceof PGLiteDB
        ? "66666666-6666-7666-8666-666666666666"
        : 600001;
      await system1.storage.create(Note.name, { id: externalId, title: "first" });

      // Attach path: new MonoSystem/Controller on same DB, setup(false)
      const system2 = new MonoSystem(db);
      system2.conceptClass = KlassByName;
      const c2 = new Controller({ system: system2, entities: [Note], relations: [] });
      await expect(c2.setup(false)).resolves.toBeUndefined();

      await expect(
        system2.storage.create(Note.name, { id: externalId, title: "dup" })
      ).rejects.toBeTruthy();
      const rows = await system2.storage.find(
        Note.name,
        MatchExp.atom({ key: "id", value: ["=", externalId] }),
        undefined,
        ["*"]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("first");

      await system2.destroy();
    }
  });

  test("MySQL-like re-entry: setupFrameworkLogicalIdUniqueIndexes swallows index-already-exists only", async () => {
    // PGLite/SQLite emit CREATE INDEX IF NOT EXISTS, so full setup(false) never hits the
    // catch branch that MySQL needs (supportsCreateIndexIfNotExists === false). Drive that
    // private path directly with a scheme stub so removing isIndexAlreadyExists fails this test.
    const Note = makeNoteEntity("CatchPathNote");
    const real = new SQLiteDB(":memory:");
    const system = new MonoSystem(real);
    system.conceptClass = KlassByName;
    await new Controller({ system, entities: [Note], relations: [] }).setup(true);

    const map = (system.storage as any).map;
    const mysqlDialect = {
      name: "mysql" as const,
      maxIdentifierLength: 64,
      supportsCreateIndexIfNotExists: false,
      enforceMaxIdentifierLength: true,
      encodeLiteral: (v: unknown) => JSON.stringify(v),
      constraints: { unique: false, filteredUnique: false, nonNull: false },
    };
    const items = createFrameworkLogicalIdUniqueIndexSQL(map, mysqlDialect as any);
    expect(items.some(i => i.recordName === Note.name)).toBe(true);
    expect(items.every(i => !/IF NOT EXISTS/i.test(i.sql))).toBe(true);

    let schemeCalls = 0;
    const stubDb = {
      constructor: { name: "MysqlDB" },
      schemaDialect: mysqlDialect,
      async scheme(sql: string) {
        schemeCalls++;
        if (/CREATE UNIQUE INDEX/i.test(sql) && /interaqt_id_/i.test(sql)) {
          const err = Object.assign(new Error("Duplicate key name 'interaqt_id_x'"), {
            errno: 1061,
            code: "ER_DUP_KEYNAME",
          });
          throw err;
        }
      },
    };
    // Swap the live storage's db only for the framework-id setup call.
    const storage = system.storage as any;
    const originalDb = storage.db;
    storage.db = stubDb;
    try {
      await expect(storage.setupFrameworkLogicalIdUniqueIndexes({ map })).resolves.toBeUndefined();
    } finally {
      storage.db = originalDb;
    }
    expect(schemeCalls).toBe(items.length);

    // Row-level unique violation must NOT be treated as index-already-exists (fail closed).
    const uniqErr = Object.assign(new Error("Duplicate entry '1' for key 'interaqt_id_x'"), {
      errno: 1062,
      code: "ER_DUP_ENTRY",
    });
    expect(normalizeDatabaseError(uniqErr).isIndexAlreadyExists).toBe(false);
    expect(normalizeDatabaseError(uniqErr).isUniqueViolation).toBe(true);

    storage.db = {
      constructor: { name: "MysqlDB" },
      schemaDialect: mysqlDialect,
      async scheme() {
        throw uniqErr;
      },
    };
    try {
      await expect(storage.setupFrameworkLogicalIdUniqueIndexes({ map })).rejects.toBeTruthy();
    } finally {
      storage.db = originalDb;
    }

    await system.destroy();
  });

  test.skipIf(!MYSQL_ENABLED)(
    "MySQL: setup(true)→setup(false) attach succeeds; duplicate logical id still fail-loud",
    async () => {
      const database = `${process.env.INTERAQT_MYSQL_DATABASE!}_entity_identity_reentry`;
      const Note = makeNoteEntity("MysqlIdReentryNote");
      const mk = () => makeNoteEntity(Note.name);

      const db1 = new MysqlDB(database, mysqlConfig);
      const system1 = new MonoSystem(db1);
      system1.conceptClass = KlassByName;
      const c1 = new Controller({ system: system1, entities: [mk()], relations: [] });
      await c1.setup(true);

      const recordInfo = (system1.storage as any).queryHandle.map.getRecordInfo(Note.name);
      const idField: string = recordInfo.idField;
      const table: string = recordInfo.table;
      const titleField: string = recordInfo.data.attributes.title.field;
      expect(idField).not.toBe("id");

      // Metadata lists the framework id index with physical idField
      const idMeta = system1.storage.schema.constraints.find(
        (c): c is Extract<typeof c, { kind: "unique" }> =>
          c.kind === "unique"
          && c.recordName === Note.name
          && String(c.physicalName).startsWith("interaqt_id_")
      );
      expect(idMeta).toBeDefined();
      expect(idMeta!.fields).toEqual([idField]);

      // Seed a row with external logical id via driver SQL (transactions:false)
      await db1.insert(
        `INSERT INTO "${table}" ("${idField}", "${titleField}") VALUES (?, ?)`,
        [42, "first"],
        "seed first"
      );
      await db1.close();

      const db2 = new MysqlDB(database, mysqlConfig);
      const system2 = new MonoSystem(db2);
      system2.conceptClass = KlassByName;
      const c2 = new Controller({ system: system2, entities: [mk()], relations: [] });
      // D1: must not fail with Duplicate key name on framework id UNIQUE INDEX
      await expect(c2.setup(false)).resolves.toBeUndefined();

      await expect(
        db2.insert(
          `INSERT INTO "${table}" ("${idField}", "${titleField}") VALUES (?, ?)`,
          [42, "dup"],
          "seed dup"
        )
      ).rejects.toBeTruthy();

      await db2.close();
    }
  );
});

describe("entity identity — Transform / applyResultPatch (M-02)", () => {
  test("data-based Transform insert may carry unique top-level id", async () => {
    const Source = Entity.create({
      name: "M02SrcInsert",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const explicitId = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";
    const Dest = Entity.create({
      name: "M02DstInsert",
      properties: [Property.create({ name: "title", type: "string" })],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["*"],
        callback: (row: any) => ({ id: explicitId, title: row.title }),
      }),
    });
    const { system } = await setupSystem(new PGLiteDB(), [Source, Dest]);
    await system.storage.create(Source.name, { title: "hello" });
    const rows = await system.storage.find(Dest.name, undefined, undefined, ["*"]);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].id)).toBe(explicitId);
    expect(rows[0].title).toBe("hello");
    await system.destroy();
  });

  test("data-based Transform spread shares source id when free; second source with same id fails loud", async () => {
    // When target has no row with source.id, spread inserts with id === source.id (documented).
    // A second insert that would duplicate that logical id must fail (unique index), not create two rows.
    const Source = Entity.create({
      name: "M02SrcShare",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const Dest = Entity.create({
      name: "M02DstShare",
      properties: [Property.create({ name: "title", type: "string" })],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["*"],
        callback: (row: any) => ({ ...row }),
      }),
    });
    const { system } = await setupSystem(new PGLiteDB(), [Source, Dest]);
    const sharedId = "dddddddd-dddd-7ddd-8ddd-dddddddddddd";
    const src = await system.storage.create(Source.name, { id: sharedId, title: "one" });
    expect(String(src.id)).toBe(sharedId);

    const destRows = await system.storage.find(Dest.name, undefined, undefined, ["*"]);
    expect(destRows).toHaveLength(1);
    expect(String(destRows[0].id)).toBe(sharedId);
    expect(destRows[0].title).toBe("one");

    // Direct create on dest with same id must fail (unique); same for a Transform path that collides.
    let directErr: unknown;
    try {
      await system.storage.create(Dest.name, { id: sharedId, title: "collide-direct" });
    } catch (e) {
      directErr = e;
    }
    expect(directErr).toBeTruthy();
    const violation = findConstraintViolationError(directErr);
    expect(violation?.properties).toEqual(expect.arrayContaining(["id"]));

    expect(
      await system.storage.find(Dest.name, undefined, undefined, ["*"])
    ).toHaveLength(1);
    await system.destroy();
  });

  test("data-based Transform update strips top-level id: mapped row identity stays on affectedId", async () => {
    const createId = "eeeeeeee-eeee-7eee-8eee-eeeeeeeeeeee";
    const rewriteId = "11111111-eeee-7eee-8eee-eeeeeeeeeeee";
    let transformCalls = 0;
    const Source = Entity.create({
      name: "M02SrcUpd",
      properties: [Property.create({ name: "title", type: "string" })],
    });
    const Dest = Entity.create({
      name: "M02DstUpd",
      properties: [Property.create({ name: "title", type: "string" })],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["*"],
        // First call (insert) uses createId; later calls (update) try to rewrite identity.
        callback: (row: any) => {
          transformCalls += 1;
          return {
            id: transformCalls === 1 ? createId : rewriteId,
            title: row.title,
          };
        },
      }),
    });
    const { system } = await setupSystem(new PGLiteDB(), [Source, Dest]);
    const src = await system.storage.create(Source.name, { title: "before" });
    const before = await system.storage.find(Dest.name, undefined, undefined, ["*"]);
    expect(before).toHaveLength(1);
    const mappedId = before[0].id;
    expect(String(mappedId)).toBe(createId);

    await system.storage.update(
      Source.name,
      MatchExp.atom({ key: "id", value: ["=", src.id] }),
      { title: "after" }
    );
    expect(transformCalls).toBeGreaterThanOrEqual(2);

    const after = await system.storage.find(Dest.name, undefined, undefined, ["*"]);
    expect(after).toHaveLength(1);
    expect(String(after[0].id)).toBe(String(mappedId));
    expect(String(after[0].id)).not.toBe(rewriteId);
    expect(after[0].title).toBe("after");

    const byRewrite = await system.storage.findOne(
      Dest.name,
      MatchExp.atom({ key: "id", value: ["=", rewriteId] }),
      undefined,
      ["*"]
    );
    expect(byRewrite).toBeUndefined();
    await system.destroy();
  });

  test("event-based Transform insert may carry unique top-level id", async () => {
    const explicitId = "ffffffff-ffff-7fff-8fff-ffffffffffff";
    const createFact = Interaction.create({
      name: "M02CreateFact",
      action: Action.create({ name: "m02CreateFact" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "title", type: "string" })],
      }),
    });
    const Fact = Entity.create({
      name: "M02EventFact",
      properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({ name: "sourceEventId", type: "string" }),
      ],
      computation: Transform.create({
        eventDeps: {
          InteractionEvent: {
            recordName: InteractionEventEntity.name,
            type: "create",
          },
        },
        callback: (mutationEvent: any) => {
          const interactionData = mutationEvent.record;
          if (!interactionData || mutationEvent.recordName !== InteractionEventEntity.name) return null;
          if (interactionData.interactionName !== createFact.name) return null;
          return {
            id: explicitId,
            title: interactionData.payload?.title,
            sourceEventId: String(interactionData.id ?? ""),
          };
        },
      }),
    });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Fact],
      relations: [],
      eventSources: [createFact],
      forceThrowDispatchError: true,
    });
    await controller.setup(true);

    await controller.dispatch(createFact, {
      user: { id: "m02-user", roles: [] },
      payload: { title: "from-event" },
    });

    const rows = await system.storage.find(Fact.name, undefined, undefined, ["*"]);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].id)).toBe(explicitId);
    expect(rows[0].title).toBe("from-event");
    await system.destroy();
  });

  test("applyResultPatch entity update strips data.id at the controller choke point", async () => {
    const Note = makeNoteEntity("M02PatchStrip");
    const { system, controller } = await setupSystem(new PGLiteDB(), [Note]);
    const created = await system.storage.create(Note.name, { title: "t0" });
    const otherId = "99999999-9999-7999-8999-999999999999";

    // Pin the Controller choke point itself: storage.update must receive a payload
    // without top-level `id`. Relying only on post-find identity would still pass if
    // only CreationExecutor pins oldRecord.id (M-01 gate B) while applyResultPatch
    // forwarded data.id — that misses design §3.3.2 A / §3.4.
    const updatePayloads: unknown[] = [];
    const originalUpdate = system.storage.update.bind(system.storage);
    system.storage.update = (async (...args: Parameters<typeof originalUpdate>) => {
      updatePayloads.push(args[2]);
      return originalUpdate(...args);
    }) as typeof system.storage.update;

    await controller.applyResultPatch(
      { type: "entity", id: Note },
      {
        type: "update",
        affectedId: created.id,
        data: { id: otherId, title: "t1" },
      }
    );

    expect(updatePayloads.length).toBeGreaterThanOrEqual(1);
    for (const payload of updatePayloads) {
      expect(payload && typeof payload === "object").toBe(true);
      expect(Object.prototype.hasOwnProperty.call(payload, "id")).toBe(false);
      expect((payload as { title?: string }).title).toBe("t1");
    }

    const byOriginal = await system.storage.findOne(
      Note.name,
      MatchExp.atom({ key: "id", value: ["=", created.id] }),
      undefined,
      ["*"]
    );
    expect(byOriginal?.title).toBe("t1");
    expect(String(byOriginal?.id)).toBe(String(created.id));

    const byOther = await system.storage.findOne(
      Note.name,
      MatchExp.atom({ key: "id", value: ["=", otherId] }),
      undefined,
      ["*"]
    );
    expect(byOther).toBeUndefined();
    await system.destroy();
  });
});

describe("entity identity — pregenerated id × Relation × computeTarget (M-03)", () => {
  test("pregenerated entity ids: Relation, nested attributeQuery, StateMachine.computeTarget", async () => {
    // Single-identity E2E: client-pregenerated logical ids are the same values used by
    // Relation endpoints, nested attributeQuery, and property StateMachine computeTarget.
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const isPglite = db instanceof PGLiteDB;
      const authorId = isPglite
        ? "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa"
        : 800001;
      const postId = isPglite
        ? "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb"
        : 800002;
      // Second post: computeTarget must select by pregenerated id, not transition every row.
      const otherPostId = isPglite
        ? "cccccccc-cccc-7ccc-8ccc-cccccccccccc"
        : 800003;

      const pending = StateNode.create({ name: "pending" });
      const approved = StateNode.create({ name: "approved" });

      const ApprovePost = Interaction.create({
        name: `M03ApprovePost${db.constructor.name}`,
        action: Action.create({ name: `m03ApprovePost${db.constructor.name}` }),
        payload: Payload.create({
          items: [
            PayloadItem.create({ name: "postId", type: "string", required: true }),
          ],
        }),
      });

      const Author = Entity.create({
        name: `M03Author${db.constructor.name}`,
        properties: [Property.create({ name: "name", type: "string" })],
      });
      const Post = Entity.create({
        name: `M03Post${db.constructor.name}`,
        properties: [
          Property.create({ name: "title", type: "string" }),
          Property.create({
            name: "status",
            type: "string",
            computation: StateMachine.create({
              states: [pending, approved],
              initialState: pending,
              transfers: [
                StateTransfer.create({
                  current: pending,
                  next: approved,
                  trigger: {
                    recordName: InteractionEventEntity.name,
                    type: "create",
                    record: { interactionName: ApprovePost.name },
                  },
                  // Application identity === logical id: payload carries the pregenerated post id.
                  computeTarget: (event: any) => ({
                    id: event.record?.payload?.postId,
                  }),
                }),
              ],
            }),
          }),
        ],
      });
      const AuthoredBy = Relation.create({
        source: Post,
        sourceProperty: "author",
        target: Author,
        targetProperty: "posts",
        type: "n:1",
      });

      const system = new MonoSystem(db);
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [Author, Post],
        relations: [AuthoredBy],
        eventSources: [ApprovePost],
        forceThrowDispatchError: true,
      });
      await controller.setup(true);

      // 1) Create both ends with client-pregenerated logical ids
      const author = await system.storage.create(Author.name, {
        id: authorId,
        name: "ada",
      });
      expect(String(author.id)).toBe(String(authorId));

      const post = await system.storage.create(Post.name, {
        id: postId,
        title: "first",
        author: { id: authorId },
      });
      expect(String(post.id)).toBe(String(postId));

      const otherPost = await system.storage.create(Post.name, {
        id: otherPostId,
        title: "second",
        author: { id: authorId },
      });
      expect(String(otherPost.id)).toBe(String(otherPostId));

      // 2) Nested attributeQuery / relation path uses the same pregenerated ids
      // (re-find so computed StateMachine initial state is included in attributeQuery)
      const postWithAuthor = await system.storage.findOne(
        Post.name,
        MatchExp.atom({ key: "id", value: ["=", postId] }),
        undefined,
        ["id", "title", "status", ["author", { attributeQuery: ["id", "name"] }]]
      );
      expect(postWithAuthor).toBeDefined();
      expect(String(postWithAuthor!.id)).toBe(String(postId));
      expect(postWithAuthor!.status).toBe("pending");
      expect(String(postWithAuthor!.author?.id)).toBe(String(authorId));
      expect(postWithAuthor!.author?.name).toBe("ada");

      const authorWithPosts = await system.storage.findOne(
        Author.name,
        MatchExp.atom({ key: "id", value: ["=", authorId] }),
        undefined,
        ["id", "name", ["posts", { attributeQuery: ["id", "title", "status"] }]]
      );
      expect(authorWithPosts).toBeDefined();
      expect(String(authorWithPosts!.id)).toBe(String(authorId));
      expect(authorWithPosts!.posts).toHaveLength(2);
      const postIds = (authorWithPosts!.posts as any[])
        .map((p) => String(p.id))
        .sort();
      expect(postIds).toEqual([String(otherPostId), String(postId)].sort());
      expect(
        (authorWithPosts!.posts as any[]).every((p) => p.status === "pending")
      ).toBe(true);

      // Relation record itself references the pregenerated endpoints
      const links = await system.storage.find(
        AuthoredBy.name!,
        undefined,
        undefined,
        [
          "*",
          ["source", { attributeQuery: ["id"] }],
          ["target", { attributeQuery: ["id"] }],
        ]
      );
      expect(links).toHaveLength(2);
      const linkSourceIds = links
        .map((l: any) => String(l.source?.id ?? l.source))
        .sort();
      expect(linkSourceIds).toEqual(
        [String(postId), String(otherPostId)].map(String).sort()
      );
      for (const link of links) {
        expect(String(link.target?.id ?? link.target)).toBe(String(authorId));
      }

      // 3) StateMachine.computeTarget locates the row by the same pregenerated id
      const user = await system.storage.create(Author.name, {
        name: "dispatcher",
      });
      await controller.dispatch(ApprovePost, {
        user: { id: user.id, roles: [] },
        // Payload item is string-typed; logical id may be INT on SQLite — coerce for the wire.
        payload: { postId: String(postId) },
      });

      const afterApprove = await system.storage.findOne(
        Post.name,
        MatchExp.atom({ key: "id", value: ["=", postId] }),
        undefined,
        ["id", "title", "status", ["author", { attributeQuery: ["id", "name"] }]]
      );
      expect(String(afterApprove?.id)).toBe(String(postId));
      expect(afterApprove?.status).toBe("approved");
      expect(String(afterApprove?.author?.id)).toBe(String(authorId));

      // Sibling with a different pregenerated id must remain pending (selectivity of computeTarget).
      const otherAfter = await system.storage.findOne(
        Post.name,
        MatchExp.atom({ key: "id", value: ["=", otherPostId] }),
        undefined,
        ["id", "status"]
      );
      expect(String(otherAfter?.id)).toBe(String(otherPostId));
      expect(otherAfter?.status).toBe("pending");

      // Identity must not drift through the SM update path
      const byWrongId = await system.storage.findOne(
        Post.name,
        MatchExp.atom({
          key: "id",
          value: ["=", isPglite ? "00000000-0000-7000-8000-000000000000" : 1],
        }),
        undefined,
        ["*"]
      );
      // Auto-created dispatcher author may occupy integer id 1 on SQLite — only assert post not found under a free id.
      if (isPglite) {
        expect(byWrongId).toBeUndefined();
      }

      await system.destroy();
    }
  });

  test("SQLite: pregenerated Relation endpoints + computeTarget with integer application ids", async () => {
    // Focused INT-driver path (design §2.2: pregenerated type must match driver id type).
    // Two articles prove computeTarget selects by pregenerated id (not "transition every row").
    const authorId = 910001;
    const postA = 910002;
    const postB = 910003;
    const pending = StateNode.create({ name: "pending" });
    const published = StateNode.create({ name: "published" });
    const Publish = Interaction.create({
      name: "M03PublishInt",
      action: Action.create({ name: "m03PublishInt" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "postId", type: "string", required: true })],
      }),
    });
    const User = Entity.create({
      name: "M03IntUser",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Article = Entity.create({
      name: "M03IntArticle",
      properties: [
        Property.create({ name: "title", type: "string" }),
        Property.create({
          name: "status",
          type: "string",
          computation: StateMachine.create({
            states: [pending, published],
            initialState: pending,
            transfers: [
              StateTransfer.create({
                current: pending,
                next: published,
                trigger: {
                  recordName: InteractionEventEntity.name,
                  type: "create",
                  record: { interactionName: Publish.name },
                },
                computeTarget: (event: any) => ({ id: event.record?.payload?.postId }),
              }),
            ],
          }),
        }),
      ],
    });
    const WrittenBy = Relation.create({
      source: Article,
      sourceProperty: "writer",
      target: User,
      targetProperty: "articles",
      type: "n:1",
    });

    const system = new MonoSystem(new SQLiteDB(":memory:"));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [User, Article],
      relations: [WrittenBy],
      eventSources: [Publish],
      forceThrowDispatchError: true,
    });
    await controller.setup(true);

    await system.storage.create(User.name, { id: authorId, name: "int-author" });
    await system.storage.create(Article.name, {
      id: postA,
      title: "int-post-a",
      writer: { id: authorId },
    });
    await system.storage.create(Article.name, {
      id: postB,
      title: "int-post-b",
      writer: { id: authorId },
    });

    const nested = await system.storage.findOne(
      Article.name,
      MatchExp.atom({ key: "id", value: ["=", postA] }),
      undefined,
      ["id", "title", "status", ["writer", { attributeQuery: ["id", "name"] }]]
    );
    expect(Number(nested?.id)).toBe(postA);
    expect(Number(nested?.writer?.id)).toBe(authorId);
    expect(nested?.status).toBe("pending");

    const authorWithArticles = await system.storage.findOne(
      User.name,
      MatchExp.atom({ key: "id", value: ["=", authorId] }),
      undefined,
      ["id", ["articles", { attributeQuery: ["id", "title"] }]]
    );
    expect(authorWithArticles?.articles).toHaveLength(2);
    const articleIds = (authorWithArticles!.articles as any[])
      .map((a) => Number(a.id))
      .sort((a, b) => a - b);
    expect(articleIds).toEqual([postA, postB]);

    const actor = await system.storage.create(User.name, { name: "actor" });
    await controller.dispatch(Publish, {
      user: { id: actor.id, roles: [] },
      // Payload is string-typed; MatchExp / storage must still resolve the integer logical id.
      payload: { postId: String(postA) },
    });

    const afterA = await system.storage.findOne(
      Article.name,
      MatchExp.atom({ key: "id", value: ["=", postA] }),
      undefined,
      ["id", "status", ["writer", { attributeQuery: ["id"] }]]
    );
    const afterB = await system.storage.findOne(
      Article.name,
      MatchExp.atom({ key: "id", value: ["=", postB] }),
      undefined,
      ["id", "status"]
    );
    expect(Number(afterA?.id)).toBe(postA);
    expect(afterA?.status).toBe("published");
    expect(Number(afterA?.writer?.id)).toBe(authorId);
    // Sibling row with a different pregenerated id must not transition.
    expect(Number(afterB?.id)).toBe(postB);
    expect(afterB?.status).toBe("pending");

    await system.destroy();
  });
});
