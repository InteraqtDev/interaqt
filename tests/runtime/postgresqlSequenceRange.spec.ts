/**
 * M-03 contract: real PostgreSQL dual-connection concurrent reserveSequenceRange.
 *
 * PGLite / single connection must not stand in for this proof. Env-gated on
 * INTERAQT_POSTGRES_DATABASE (same pattern as postgresqlScopedSequence).
 *
 * No property-level ScopedSequence opener — capability install creates the table.
 */
import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  UniqueConstraint,
  clearAllInstances,
} from "interaqt";
import { PostgreSQLDB } from "@drivers";

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

const WORKSPACE_ID = "00000000-0000-7000-8000-0000000000bb";

function databaseNameFor(suffix: string) {
  return `${process.env.INTERAQT_POSTGRES_DATABASE}_${suffix.toLowerCase()}`;
}

function workspaceScope(workspaceId: string = WORKSPACE_ID) {
  return [
    {
      name: "workspace",
      type: "ref" as const,
      value: { type: "ref" as const, entity: "Workspace", id: workspaceId },
    },
  ];
}

function createModel(suffix: string) {
  const Entry = Entity.create({
    name: `PgSeqRange${suffix}Entry`,
    properties: [
      Property.create({ name: "workspaceId", type: "string" }),
      Property.create({ name: "seq", type: "number" }),
      Property.create({ name: "owner", type: "string" }),
      Property.create({ name: "body", type: "string" }),
    ],
    constraints: [
      UniqueConstraint.create({
        name: `PgSeqRange${suffix}EntryUnique`,
        properties: ["workspaceId", "seq"],
      }),
    ],
  });
  return {
    Entry,
    databaseName: databaseNameFor(`seqrange_${suffix}`),
  };
}

async function createController(model: ReturnType<typeof createModel>, install: boolean) {
  const db = new PostgreSQLDB(model.databaseName, dbOptions);
  const system = new MonoSystem(db);
  system.conceptClass = KlassByName;
  const controller = new Controller({
    system,
    entities: [model.Entry],
    relations: [],
  });
  await controller.setup(install);
  return { system, controller, model };
}

describeIfPostgres("PostgreSQL reserveSequenceRange (dual connection)", () => {
  test("concurrent reserve(10) and reserve(7) yield disjoint ranges; all inserts succeed under unique (scope, seq)", async () => {
    clearAllInstances();
    const model = createModel("Concurrent");
    const first = await createController(model, true);
    const second = await createController(model, false);

    const base = {
      sequenceName: "PgConcurrentRangeSeq",
      scope: workspaceScope(),
      initialValue: 0,
      step: 1,
    };

    try {
      // Two independent connections/controllers; start both reserves concurrently.
      const [rangeA, rangeB] = await Promise.all([
        first.system.storage.runInTransaction({ name: "pg-range-a" }, async () => {
          const range = await first.system.storage.atomic.reserveSequenceRange({
            ...base,
            count: 10,
          });
          for (let i = 0; i < range.count; i++) {
            await first.system.storage.create(model.Entry.name, {
              workspaceId: WORKSPACE_ID,
              seq: range.start + i * range.step,
              owner: "A",
              body: `a-${i}`,
            });
          }
          return range;
        }),
        second.system.storage.runInTransaction({ name: "pg-range-b" }, async () => {
          const range = await second.system.storage.atomic.reserveSequenceRange({
            ...base,
            count: 7,
          });
          for (let i = 0; i < range.count; i++) {
            await second.system.storage.create(model.Entry.name, {
              workspaceId: WORKSPACE_ID,
              seq: range.start + i * range.step,
              owner: "B",
              body: `b-${i}`,
            });
          }
          return range;
        }),
      ]);

      expect(rangeA.count).toBe(10);
      expect(rangeB.count).toBe(7);
      expect(rangeA.end - rangeA.start + 1).toBe(10);
      expect(rangeB.end - rangeB.start + 1).toBe(7);

      const valuesA = Array.from({ length: rangeA.count }, (_, i) => rangeA.start + i * rangeA.step);
      const valuesB = Array.from({ length: rangeB.count }, (_, i) => rangeB.start + i * rangeB.step);
      const setA = new Set(valuesA);
      const setB = new Set(valuesB);
      for (const v of valuesA) expect(setB.has(v)).toBe(false);
      for (const v of valuesB) expect(setA.has(v)).toBe(false);

      const rows = await first.system.storage.find(
        model.Entry.name,
        MatchExp.atom({ key: "workspaceId", value: ["=", WORKSPACE_ID] }),
        undefined,
        ["seq", "owner", "body"]
      );
      expect(rows).toHaveLength(17);
      const seqs = rows.map((r: any) => r.seq as number).sort((a, b) => a - b);
      expect(seqs).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
      expect(Math.max(...seqs) - Math.min(...seqs) + 1).toBe(17);
      expect(new Set(seqs).size).toBe(17);
    } finally {
      await first.system.destroy();
      await second.system.destroy();
    }
  }, 60000);

  test("install without ScopedSequence Property still allows reserve on real PostgreSQL", async () => {
    clearAllInstances();
    const model = createModel("NoProp");
    const { system } = await createController(model, true);
    try {
      const range = await system.storage.runInTransaction({ name: "pg-range-noprop" }, async () => {
        return system.storage.atomic.reserveSequenceRange({
          sequenceName: "PgNoPropSeq",
          scope: [...workspaceScope()],
          initialValue: 0,
          step: 1,
          count: 4,
        });
      });
      expect(range).toEqual({ start: 1, count: 4, end: 4, step: 1 });
    } finally {
      await system.destroy();
    }
  }, 30000);
});
