import { describe, expect, test } from "vitest";
import {
  Action,
  Controller,
  Entity,
  Interaction,
  KlassByName,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  Relation,
  Transform,
  UniqueConstraint,
  ConstraintSetupError,
  normalizeDatabaseError,
  findConstraintViolationError,
} from "interaqt";
import {
  createUniqueIndexSQL,
  DBSetup,
  getSchemaDialect,
  MatchExp,
  predicateSQLForOperator,
} from "@storage";
import { PGLiteDB, SQLiteDB } from "@drivers";

describe("data constraints", () => {
  test("maps direct storage unique violations to ConstraintViolationError", async () => {
    const Charge = Entity.create({
      name: "ConstraintCharge",
      properties: [
        Property.create({ name: "idempotencyKey", type: "string" }),
      ],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintCharge_idempotencyKey_unique",
          properties: ["idempotencyKey"],
          violationCode: "CHARGE_DUPLICATE",
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Charge], relations: [] });
    await controller.setup(true);

    expect(system.storage.schema.constraints).toContainEqual(expect.objectContaining({
      constraintName: "ConstraintCharge_idempotencyKey_unique",
      recordName: "ConstraintCharge",
      properties: ["idempotencyKey"],
    }));
    expect(system.storage.schema.dialect.name).toBe("postgres");
    expect(system.storage.schema.records).toContainEqual(expect.objectContaining({
      recordName: "ConstraintCharge",
      tableName: "ConstraintCharge",
      isRelation: false,
      isFiltered: false,
    }));
    expect(system.storage.schema.tables).toContainEqual(expect.objectContaining({
      tableName: "ConstraintCharge",
    }));

    await system.storage.create("ConstraintCharge", { idempotencyKey: "same" });
    await expect(system.storage.create("ConstraintCharge", { idempotencyKey: "same" })).rejects.toMatchObject({
      name: "ConstraintViolationError",
      constraintName: "ConstraintCharge_idempotencyKey_unique",
      recordName: "ConstraintCharge",
      properties: ["idempotencyKey"],
      context: { code: "CHARGE_DUPLICATE", kind: "unique" },
    });

    await system.destroy();
  });

  test("supports filtered unique null semantics in PGLite and SQLite", async () => {
    for (const db of [new PGLiteDB(), new SQLiteDB(":memory:")]) {
      const Checkout = Entity.create({
        name: `ConstraintCheckout${db.constructor.name}`,
        properties: [
          Property.create({ name: "sessionId", type: "string" }),
        ],
        constraints: [
          UniqueConstraint.create({
            name: `ConstraintCheckout${db.constructor.name}_sessionId_unique`,
            properties: ["sessionId"],
            where: {
              sessionId: { op: "notIn", value: [null, ""] },
            },
          }),
        ],
      });

      const system = new MonoSystem(db);
      system.conceptClass = KlassByName;
      const controller = new Controller({ system, entities: [Checkout], relations: [] });
      await controller.setup(true);

      await system.storage.create(Checkout.name, { sessionId: null });
      await system.storage.create(Checkout.name, { sessionId: null });
      await system.storage.create(Checkout.name, { sessionId: "" });
      await system.storage.create(Checkout.name, { sessionId: "" });
      await system.storage.create(Checkout.name, { sessionId: "cs_1" });
      await expect(system.storage.create(Checkout.name, { sessionId: "cs_1" })).rejects.toMatchObject({
        name: "ConstraintViolationError",
      });

      await system.destroy();
    }
  });

  test("supports relation source/target unique constraints", async () => {
    const User = Entity.create({
      name: "ConstraintUser",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Group = Entity.create({
      name: "ConstraintGroup",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Membership = Relation.create({
      name: "ConstraintMembership",
      source: User,
      sourceProperty: "memberships",
      target: Group,
      targetProperty: "members",
      type: "n:n",
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintMembership_source_target_unique",
          properties: ["source", "target"],
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [User, Group], relations: [Membership] });
    await controller.setup(true);

    const user = await system.storage.create("ConstraintUser", { name: "u1" });
    const group = await system.storage.create("ConstraintGroup", { name: "g1" });
    await system.storage.create("ConstraintMembership", { source: user, target: group });
    await expect(system.storage.create("ConstraintMembership", { source: user, target: group })).rejects.toMatchObject({
      constraintName: "ConstraintMembership_source_target_unique",
      recordName: "ConstraintMembership",
      properties: ["source", "target"],
    });

    await system.destroy();
  });

  test("rolls back dispatch source event when synchronous computation violates a unique constraint", async () => {
    const Source = Entity.create({
      name: "ConstraintSource",
      properties: [Property.create({ name: "key", type: "string" })],
    });
    const Derived = Entity.create({
      name: "ConstraintDerived",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintDerived_key_unique",
          properties: ["key"],
        }),
      ],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["key"],
        callback: (source: any) => ({ key: source.key }),
      }),
    });
    const AddSource = Interaction.create({
      name: "addConstraintSource",
      action: Action.create({ name: "addConstraintSource" }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: "source", type: "Entity", base: Source }),
        ],
      }),
    });
    AddSource.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("ConstraintSource", event.payload.source);
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source, Derived],
      relations: [],
      eventSources: [AddSource],
      forceThrowDispatchError: true,
    });
    await controller.setup(true);

    await controller.dispatch(AddSource, { user: { id: "u1" }, payload: { source: { key: "dup" } } });
    await expect(controller.dispatch(AddSource, { user: { id: "u1" }, payload: { source: { key: "dup" } } })).rejects.toSatisfy((error: unknown) => {
      const constraintError = findConstraintViolationError(error);
      return constraintError?.constraintName === "ConstraintDerived_key_unique";
    });

    const sources = await system.storage.find("ConstraintSource", undefined, undefined, ["*"]);
    const derived = await system.storage.find("ConstraintDerived", undefined, undefined, ["*"]);
    expect(sources).toHaveLength(1);
    expect(derived).toHaveLength(1);

    await system.destroy();
  });

  test("preserves constraint errors in default dispatch result mode", async () => {
    const Source = Entity.create({
      name: "ConstraintResultSource",
      properties: [Property.create({ name: "key", type: "string" })],
    });
    const Derived = Entity.create({
      name: "ConstraintResultDerived",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintResultDerived_key_unique",
          properties: ["key"],
        }),
      ],
      computation: Transform.create({
        record: Source,
        attributeQuery: ["key"],
        callback: (source: any) => ({ key: source.key }),
      }),
    });
    const AddSource = Interaction.create({
      name: "addConstraintResultSource",
      action: Action.create({ name: "addConstraintResultSource" }),
      payload: Payload.create({
        items: [PayloadItem.create({ name: "source", type: "Entity", base: Source })],
      }),
    });
    AddSource.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create("ConstraintResultSource", event.payload.source);
    };

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source, Derived],
      relations: [],
      eventSources: [AddSource],
    });
    await controller.setup(true);

    await controller.dispatch(AddSource, { user: { id: "u1" }, payload: { source: { key: "dup" } } });
    const result = await controller.dispatch(AddSource, { user: { id: "u1" }, payload: { source: { key: "dup" } } });
    expect(findConstraintViolationError(result.error)?.constraintName).toBe("ConstraintResultDerived_key_unique");
    expect(result.effects).toHaveLength(0);

    await system.destroy();
  });

  test("wraps missing-table setup(false) constraint failures as ConstraintSetupError", async () => {
    const Missing = Entity.create({
      name: "ConstraintMissingTable",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintMissingTable_key_unique",
          properties: ["key"],
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({ system, entities: [Missing], relations: [] });

    await expect(controller.setup(false)).rejects.toMatchObject({
      name: "ConstraintSetupError",
      constraintName: "ConstraintMissingTable_key_unique",
      recordName: "ConstraintMissingTable",
      properties: ["key"],
      context: { code: "CONSTRAINT_SETUP_FAILED" },
    });

    await system.destroy();
  });

  test("wraps existing dirty data index creation failures as ConstraintSetupError", async () => {
    const DirtyRecord = Entity.create({
      name: "ConstraintDirtyRecord",
      properties: [Property.create({ name: "key", type: "string" })],
    });
    const db = new PGLiteDB();
    const firstSystem = new MonoSystem(db);
    const firstController = new Controller({ system: firstSystem, entities: [DirtyRecord], relations: [] });
    await firstController.setup(true);
    await firstSystem.storage.create("ConstraintDirtyRecord", { key: "dup" });
    await firstSystem.storage.create("ConstraintDirtyRecord", { key: "dup" });

    const ConstrainedDirtyRecord = Entity.create({
      name: "ConstraintDirtyRecord",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintDirtyRecord_key_unique",
          properties: ["key"],
        }),
      ],
    });
    const secondSystem = new MonoSystem(db);
    const secondController = new Controller({ system: secondSystem, entities: [ConstrainedDirtyRecord], relations: [] });

    await expect(secondController.setup(false)).rejects.toThrow(/Model manifest mismatch/);

    await secondSystem.destroy();
  });

  test("rejects invalid constraint definitions during setup", async () => {
    const InvalidWhere = Entity.create({
      name: "ConstraintInvalidWhere",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintInvalidWhere_key_unique",
          properties: ["key"],
          where: { key: { op: "contains", value: "x" } as any },
        }),
      ],
    });
    const Computed = Entity.create({
      name: "ConstraintComputed",
      properties: [
        Property.create({ name: "name", type: "string" }),
        Property.create({ name: "slug", type: "string", computed: (record: any) => record.name }),
      ],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintComputed_slug_unique",
          properties: ["slug"],
        }),
      ],
    });
    const RelationSource = Entity.create({ name: "ConstraintRelationSource", properties: [] });
    const RelationTarget = Entity.create({ name: "ConstraintRelationTarget", properties: [] });
    const InvalidRelation = Relation.create({
      name: "ConstraintInvalidRelationPath",
      source: RelationSource,
      sourceProperty: "targets",
      target: RelationTarget,
      targetProperty: "sources",
      type: "n:n",
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintInvalidRelationPath_source_id_unique",
          properties: ["source.id"],
        }),
      ],
    });

    for (const config of [
      { entities: [InvalidWhere], relations: [] },
      { entities: [Computed], relations: [] },
      { entities: [RelationSource, RelationTarget], relations: [InvalidRelation] },
    ]) {
      const system = new MonoSystem(new PGLiteDB());
      const controller = new Controller({ system, ...config });
      await expect(controller.setup(true)).rejects.toBeInstanceOf(ConstraintSetupError);
      await system.destroy();
    }
  });

  test("fails fast for filtered record constraints and MySQL declared constraints capability", async () => {
    const Base = Entity.create({
      name: "ConstraintFilteredBase",
      properties: [
        Property.create({ name: "key", type: "string" }),
        Property.create({ name: "active", type: "boolean" }),
      ],
    });
    const Filtered = Entity.create({
      name: "ConstraintFilteredEntity",
      baseEntity: Base,
      matchExpression: MatchExp.atom({ key: "active", value: ["=", true] }),
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintFilteredEntity_key_unique",
          properties: ["key"],
        }),
      ],
    });
    const MysqlLike = Entity.create({
      name: "ConstraintMysqlLike",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintMysqlLike_key_unique",
          properties: ["key"],
        }),
      ],
    });
    const mysqlLikeDatabase = {
      schemaDialect: {
        name: "mysql",
        maxIdentifierLength: 64,
        supportsCreateIndexIfNotExists: false,
        constraints: { unique: false, filteredUnique: false },
      },
      mapToDBFieldType: (type: string) => type,
    } as any;

    expect(() => new DBSetup([Base, Filtered], [], new PGLiteDB())).toThrow(/filtered record/);
    expect(() => new DBSetup([MysqlLike], [], mysqlLikeDatabase).createConstraintSQL()).toThrow(/unique constraints are not supported/);
  });

  test("fails fast when merged relation endpoints cannot resolve to physical fields", async () => {
    const File = Entity.create({
      name: "ConstraintMergedFile",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Owner = Entity.create({
      name: "ConstraintMergedOwner",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Ownership = Relation.create({
      name: "ConstraintMergedOwnership",
      source: File,
      sourceProperty: "owner",
      target: Owner,
      targetProperty: "files",
      type: "n:1",
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintMergedOwnership_source_target_unique",
          properties: ["source", "target"],
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({ system, entities: [File, Owner], relations: [Ownership] });
    await expect(controller.setup(true)).rejects.toBeInstanceOf(ConstraintSetupError);
    await system.destroy();
  });

  test("normalizes database unique errors for registry fallback", () => {
    const sqliteError = Object.assign(new Error('UNIQUE constraint failed: User.email, User.tenant'), {
      code: 'SQLITE_CONSTRAINT',
    });
    const postgresError = Object.assign(new Error('duplicate key value violates unique constraint "user_email_unique"'), {
      code: '23505',
      constraint: 'user_email_unique',
    });

    expect(normalizeDatabaseError(sqliteError)).toMatchObject({
      isUniqueViolation: true,
      rawCode: 'SQLITE_CONSTRAINT',
      tableName: 'User',
      fields: ['email', 'tenant'],
    });
    expect(normalizeDatabaseError(postgresError)).toMatchObject({
      isUniqueViolation: true,
      rawCode: '23505',
      constraintName: 'user_email_unique',
    });
  });

  test("schema dialect owns filtered predicate literal encoding", () => {
    const LiteralRecord = Entity.create({
      name: "ConstraintLiteralRecord",
      properties: [Property.create({ name: "key", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintLiteralRecord_key_unique",
          properties: ["key"],
          where: { key: { op: "equals", value: "a'b" } },
        }),
      ],
    });
    const setup = new DBSetup([LiteralRecord], [], new PGLiteDB());
    expect(setup.createConstraintSQL()[0].sql).toContain(`'a''b'`);
  });

  test("renders all supported predicate operators with public null semantics", () => {
    const postgresDialect = getSchemaDialect(new PGLiteDB());
    const sqliteDialect = getSchemaDialect(new SQLiteDB(":memory:"));

    expect(predicateSQLForOperator("key", { op: "isNull" }, postgresDialect)).toBe('"key" IS NULL');
    expect(predicateSQLForOperator("key", { op: "isNotNull" }, postgresDialect)).toBe('"key" IS NOT NULL');
    expect(predicateSQLForOperator("key", { op: "equals", value: null }, postgresDialect)).toBe('"key" IS NULL');
    expect(predicateSQLForOperator("key", { op: "notEquals", value: null }, postgresDialect)).toBe('"key" IS NOT NULL');
    expect(predicateSQLForOperator("key", { op: "equals", value: "a'b" }, postgresDialect)).toBe(`"key" = 'a''b'`);
    expect(predicateSQLForOperator("key", { op: "in", value: [null, "x"] }, postgresDialect)).toBe(`("key" IS NULL OR "key" IN ('x'))`);
    expect(predicateSQLForOperator("key", { op: "notIn", value: [null, ""] }, postgresDialect)).toBe(`("key" IS NOT NULL AND "key" NOT IN (''))`);
    expect(predicateSQLForOperator("flag", { op: "equals", value: true }, postgresDialect)).toBe('"flag" = TRUE');
    expect(predicateSQLForOperator("flag", { op: "equals", value: true }, sqliteDialect)).toBe('"flag" = 1');
    expect(createUniqueIndexSQL(
      "idx_bool",
      "Table",
      ["flag"],
      sqliteDialect,
      { flag: { op: "equals", value: false } },
    )).toContain('WHERE "flag" = 0');
  });

  test("exposes complete schema metadata for records, tables, relations, and filtered records", async () => {
    const MetadataUser = Entity.create({
      name: "ConstraintMetadataUser",
      properties: [
        Property.create({ name: "email", type: "string" }),
        Property.create({ name: "active", type: "boolean" }),
      ],
    });
    const MetadataGroup = Entity.create({
      name: "ConstraintMetadataGroup",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const MetadataActiveUser = Entity.create({
      name: "ConstraintMetadataActiveUser",
      baseEntity: MetadataUser,
      matchExpression: MatchExp.atom({ key: "active", value: ["=", true] }),
    });
    const MetadataMembership = Relation.create({
      name: "ConstraintMetadataMembership",
      source: MetadataUser,
      sourceProperty: "memberships",
      target: MetadataGroup,
      targetProperty: "members",
      type: "n:n",
      constraints: [
        UniqueConstraint.create({
          name: "ConstraintMetadataMembership_source_target_unique",
          properties: ["source", "target"],
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system,
      entities: [MetadataUser, MetadataGroup, MetadataActiveUser],
      relations: [MetadataMembership],
    });
    await controller.setup(true);

    expect(system.storage.schema.records).toContainEqual(expect.objectContaining({
      recordName: "ConstraintMetadataMembership",
      tableName: "ConstraintMetadataMembership",
      isRelation: true,
      isFiltered: false,
      attributes: expect.arrayContaining(["source", "target"]),
    }));
    expect(system.storage.schema.records).toContainEqual(expect.objectContaining({
      recordName: "ConstraintMetadataActiveUser",
      tableName: "ConstraintMetadataUser",
      isRelation: false,
      isFiltered: true,
      attributes: expect.arrayContaining(["email", "active"]),
    }));
    expect(system.storage.schema.tables).toContainEqual(expect.objectContaining({
      tableName: "ConstraintMetadataMembership",
      columns: expect.arrayContaining(["_rowId"]),
    }));
    expect(system.storage.schema.constraints).toContainEqual(expect.objectContaining({
      constraintName: "ConstraintMetadataMembership_source_target_unique",
      recordName: "ConstraintMetadataMembership",
      properties: ["source", "target"],
    }));

    await system.destroy();
  });
});
