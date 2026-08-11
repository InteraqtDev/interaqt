/**
 * M-02/M-03 contract: AtomicStorage.reserveSequenceRange (single-connection)
 * and capability-driven `_ScopedSequence_` lifecycle (no Property-level opener).
 *
 * Covers empty-scope first N, append, interleave with nextSequenceValue,
 * rollback gap policy, count/transaction fail-fast, Transform/Custom paths
 * (no dialect SQL), install without ScopedSequence Property, and S2/S3
 * prepare+apply restoring the table when missing.
 */
import { describe, expect, test } from "vitest";
import {
  Controller,
  Custom,
  Dictionary,
  Entity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  Transform,
  UniqueConstraint,
  clearAllInstances,
} from "interaqt";
import { PGLiteDB } from "@drivers";

const WORKSPACE_ID = "00000000-0000-7000-8000-0000000000aa";

function emptyScope() {
  return [] as const;
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

/**
 * Install-only setup with **no** property-level ScopedSequence.
 * M-03: capability drivers always create `_ScopedSequence_` on setup(true).
 */
async function setupAtomicOnly(prefix: string) {
  clearAllInstances();
  const Marker = Entity.create({
    name: `${prefix}Marker`,
    properties: [Property.create({ name: "label", type: "string" })],
  });
  const system = new MonoSystem(new PGLiteDB());
  system.conceptClass = KlassByName;
  const controller = new Controller({
    system,
    entities: [Marker],
    relations: [],
  });
  await controller.setup(true);
  return { system, controller, Marker };
}

async function tableExists(system: MonoSystem, tableName: string): Promise<boolean> {
  const tables = await (system.storage as unknown as { getExistingTables: () => Promise<Set<string>> }).getExistingTables();
  return tables.has(tableName);
}

describe("reserveSequenceRange — atomic API without ScopedSequence Property (S1)", () => {
  test("empty scope: first reserve N returns contiguous start..end and writes lastValue", async () => {
    const { system } = await setupAtomicOnly("REmpty");
    expect(await tableExists(system, "_ScopedSequence_")).toBe(true);

    const target = {
      sequenceName: "REmptySeq",
      scope: [...emptyScope()],
      initialValue: 0,
      step: 1,
      count: 5,
    };

    const range = await system.storage.runInTransaction({ name: "range-empty-first" }, async () => {
      return system.storage.atomic.reserveSequenceRange(target);
    });

    expect(range).toEqual({ start: 1, count: 5, end: 5, step: 1 });
    expect(range.end - range.start + 1).toBe(range.count);

    const last = await system.storage.atomic.readSequenceValue({
      sequenceName: target.sequenceName,
      scope: target.scope,
    });
    expect(last).toBe(5);

    await system.destroy();
  });

  test("subsequent reserve appends without holes on the step grid", async () => {
    const { system } = await setupAtomicOnly("RAppend");
    const base = {
      sequenceName: "RAppendSeq",
      scope: workspaceScope(),
      initialValue: 0,
      step: 1,
    };

    const first = await system.storage.runInTransaction({ name: "range-append-1" }, async () => {
      return system.storage.atomic.reserveSequenceRange({ ...base, count: 3 });
    });
    const second = await system.storage.runInTransaction({ name: "range-append-2" }, async () => {
      return system.storage.atomic.reserveSequenceRange({ ...base, count: 4 });
    });

    expect(first).toEqual({ start: 1, count: 3, end: 3, step: 1 });
    expect(second).toEqual({ start: 4, count: 4, end: 7, step: 1 });
    expect(second.start).toBe(first.end + first.step);

    const values = [
      ...Array.from({ length: first.count }, (_, i) => first.start + i * first.step),
      ...Array.from({ length: second.count }, (_, i) => second.start + i * second.step),
    ];
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(Math.max(...values) - Math.min(...values) + 1).toBe(values.length);

    await system.destroy();
  });

  test("interleaves with nextSequenceValue without overlapping values", async () => {
    const { system } = await setupAtomicOnly("RInter");
    const base = {
      sequenceName: "RInterSeq",
      scope: [...emptyScope()],
      initialValue: 10,
      step: 2,
    };

    const collected: number[] = [];
    await system.storage.runInTransaction({ name: "range-interleave" }, async () => {
      const a = await system.storage.atomic.reserveSequenceRange({ ...base, count: 3 });
      for (let i = 0; i < a.count; i++) collected.push(a.start + i * a.step);

      const single = await system.storage.atomic.nextSequenceValue(base);
      collected.push(single);

      const b = await system.storage.atomic.reserveSequenceRange({ ...base, count: 2 });
      for (let i = 0; i < b.count; i++) collected.push(b.start + i * b.step);

      expect(a).toEqual({ start: 12, count: 3, end: 16, step: 2 });
      expect(single).toBe(18);
      expect(b).toEqual({ start: 20, count: 2, end: 22, step: 2 });
    });

    expect(collected).toEqual([12, 14, 16, 18, 20, 22]);
    expect(new Set(collected).size).toBe(collected.length);

    await system.destroy();
  });

  test("rollback after reserve allows a global gap (lastValue not rewound)", async () => {
    const { system } = await setupAtomicOnly("RGap");
    const base = {
      sequenceName: "RGapSeq",
      scope: [...emptyScope()],
      initialValue: 0,
      step: 1,
    };

    await system.storage.runInTransaction({ name: "range-gap-seed" }, async () => {
      const r = await system.storage.atomic.reserveSequenceRange({ ...base, count: 2 });
      expect(r).toEqual({ start: 1, count: 2, end: 2, step: 1 });
    });

    await expect(
      system.storage.runInTransaction({ name: "range-gap-rollback" }, async () => {
        const r = await system.storage.atomic.reserveSequenceRange({ ...base, count: 3 });
        expect(r).toEqual({ start: 3, count: 3, end: 5, step: 1 });
        throw new Error("forced rollback after range reserve");
      })
    ).rejects.toThrow(/forced rollback/);

    const after = await system.storage.runInTransaction({ name: "range-gap-after" }, async () => {
      return system.storage.atomic.reserveSequenceRange({ ...base, count: 2 });
    });

    expect(after.start).toBeGreaterThanOrEqual(3);
    expect(after.count).toBe(2);
    expect(after.end).toBe(after.start + 1);
    const issued = [after.start, after.end];
    expect(issued.every((n) => n >= 3)).toBe(true);

    await system.destroy();
  });

  test("count must be a positive integer (fail-fast)", async () => {
    const { system } = await setupAtomicOnly("RCount");
    const base = {
      sequenceName: "RCountSeq",
      scope: [...emptyScope()],
      initialValue: 0,
      step: 1,
    };

    await system.storage.runInTransaction({ name: "range-bad-count" }, async () => {
      await expect(
        system.storage.atomic.reserveSequenceRange({ ...base, count: 0 })
      ).rejects.toThrow(/count must be a positive integer/i);
      await expect(
        system.storage.atomic.reserveSequenceRange({ ...base, count: -1 })
      ).rejects.toThrow(/count must be a positive integer/i);
      await expect(
        system.storage.atomic.reserveSequenceRange({ ...base, count: 1.5 })
      ).rejects.toThrow(/count must be a positive integer/i);
      await expect(
        system.storage.atomic.reserveSequenceRange({ ...base, count: NaN })
      ).rejects.toThrow(/count must be a positive integer/i);
    });

    await system.destroy();
  });

  test("reserve outside an active transaction fail-fast", async () => {
    const { system } = await setupAtomicOnly("RTxn");
    await expect(
      system.storage.atomic.reserveSequenceRange({
        sequenceName: "RTxnSeq",
        scope: [...emptyScope()],
        initialValue: 0,
        step: 1,
        count: 2,
      })
    ).rejects.toThrow(/requires an active transaction/i);
    await system.destroy();
  });

  test("nextSequenceValue is equivalent to reserveSequenceRange count=1 start", async () => {
    const { system } = await setupAtomicOnly("REq");
    const base = {
      sequenceName: "REqSeq",
      scope: [...emptyScope()],
      initialValue: 100,
      step: 5,
    };

    await system.storage.runInTransaction({ name: "range-equiv" }, async () => {
      const viaNext = await system.storage.atomic.nextSequenceValue(base);
      const viaRange = await system.storage.atomic.reserveSequenceRange({ ...base, count: 1 });
      expect(viaNext).toBe(105);
      expect(viaRange).toEqual({ start: 110, count: 1, end: 110, step: 5 });
    });

    await system.destroy();
  });
});

describe("reserveSequenceRange — S2/S3 table lifecycle without Property declarations", () => {
  test("prepareMigration plans create-table when missing; apply restores reserve", async () => {
    clearAllInstances();

    const Note = Entity.create({
      name: "SeqRangeLifecycleNote",
      properties: [Property.create({ name: "body", type: "string" })],
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Note],
      relations: [],
    });
    await controller.setup(true);
    expect(await tableExists(system, "_ScopedSequence_")).toBe(true);

    // Simulate a store that has app tables but lost the internal sequence table.
    await (system.storage as any).db.scheme(
      `DROP TABLE IF EXISTS "_ScopedSequence_"`,
      "drop scoped sequence for lifecycle test"
    );
    expect(await tableExists(system, "_ScopedSequence_")).toBe(false);

    const states = (controller as any).scheduler.createStates();
    // Empty internalRequirements: no Property-level ScopedSequence declarations.
    const plan = await (system as any).prepareMigrationSchema(
      controller.entities,
      controller.relations,
      states,
      { internalRequirements: [] }
    );

    const createOps = (plan.preRecomputeDDL || []).filter(
      (op: any) => op.kind === "create-table" && op.tableName === "_ScopedSequence_"
    );
    expect(createOps.length).toBeGreaterThanOrEqual(1);

    await (system as any).applyMigrationSchema(plan);
    expect(await tableExists(system, "_ScopedSequence_")).toBe(true);

    const range = await system.storage.runInTransaction({ name: "range-after-s2s3" }, async () => {
      return system.storage.atomic.reserveSequenceRange({
        sequenceName: "LifecycleSeq",
        scope: [...emptyScope()],
        initialValue: 0,
        step: 1,
        count: 3,
      });
    });
    expect(range).toEqual({ start: 1, count: 3, end: 3, step: 1 });

    await system.destroy();
  });
});

describe("reserveSequenceRange — Transform this.atomic path", () => {
  test("Transform callback reserves N and emits contiguous seq rows (this.atomic)", async () => {
    clearAllInstances();

    const Batch = Entity.create({
      name: "SeqRangeBatch",
      properties: [
        Property.create({ name: "workspaceId", type: "string" }),
        Property.create({ name: "itemCount", type: "number" }),
      ],
    });

    const Change = Entity.create({
      name: "SeqRangeChange",
      properties: [
        Property.create({ name: "workspaceId", type: "string" }),
        Property.create({ name: "seq", type: "number" }),
        Property.create({ name: "label", type: "string" }),
      ],
      constraints: [
        UniqueConstraint.create({
          name: "SeqRangeChangeUnique",
          properties: ["workspaceId", "seq"],
        }),
      ],
      computation: Transform.create({
        record: Batch,
        attributeQuery: ["workspaceId", "itemCount"],
        callback: async function (this: any, batch: any) {
          const n = batch.itemCount as number;
          // M-06 official path: ComputationActionContext.atomic
          expect(this.atomic).toBeDefined();
          expect(this.controller).toBeDefined();
          expect(this.atomic).toBe(this.controller.system.storage.atomic);
          const { start, count, step } = await this.atomic.reserveSequenceRange({
            sequenceName: "WorkspaceChangeSeqTx",
            scope: [
              {
                name: "workspace",
                type: "ref",
                value: { type: "ref", entity: "Workspace", id: batch.workspaceId },
              },
            ],
            initialValue: 0,
            step: 1,
            count: n,
          });
          expect(count).toBe(n);
          return Array.from({ length: n }, (_, i) => ({
            workspaceId: batch.workspaceId,
            seq: start + i * step,
            label: `item-${i}`,
          }));
        },
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Batch, Change],
      relations: [],
    });
    await controller.setup(true);

    await system.storage.create("SeqRangeBatch", {
      workspaceId: WORKSPACE_ID,
      itemCount: 4,
    });

    const rows = await system.storage.find(
      "SeqRangeChange",
      MatchExp.atom({ key: "workspaceId", value: ["=", WORKSPACE_ID] }),
      undefined,
      ["workspaceId", "seq", "label"]
    );
    const seqs = rows.map((r: any) => r.seq).sort((a: number, b: number) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(Math.max(...seqs) - Math.min(...seqs) + 1).toBe(seqs.length);

    await system.destroy();
  });
});

describe("reserveSequenceRange — Custom this.atomic path", () => {
  test("Custom compute reserves N via this.atomic (official ComputationActionContext)", async () => {
    clearAllInstances();

    const Source = Entity.create({
      name: "SeqRangeCustomSource",
      properties: [
        Property.create({ name: "workspaceId", type: "string" }),
        Property.create({ name: "parts", type: "number" }),
      ],
    });

    const Derived = Entity.create({
      name: "SeqRangeCustomDerived",
      properties: [
        Property.create({ name: "workspaceId", type: "string" }),
        Property.create({ name: "seq", type: "number" }),
        Property.create({ name: "partIndex", type: "number" }),
      ],
      constraints: [
        UniqueConstraint.create({
          name: "SeqRangeCustomDerivedUnique",
          properties: ["workspaceId", "seq"],
        }),
      ],
      computation: Custom.create({
        name: "SeqRangeCustomAssign",
        dataDeps: {
          sources: {
            type: "records",
            source: Source,
            attributeQuery: ["workspaceId", "parts"],
          },
        },
        compute: async function (this: any, dataDeps: any) {
          expect(this.system).toBeUndefined();
          expect(this.controller).toBeDefined();
          expect(this.atomic).toBeDefined();
          expect(this.atomic).toBe(this.controller.system.storage.atomic);

          const sources = dataDeps.sources || [];
          if (!sources.length) return [];

          const out: any[] = [];
          for (const src of sources) {
            const n = src.parts as number;
            const { start, count, step } = await this.atomic.reserveSequenceRange({
              sequenceName: "WorkspaceChangeSeqCu",
              scope: [
                {
                  name: "workspace",
                  type: "ref",
                  value: { type: "ref", entity: "Workspace", id: src.workspaceId },
                },
              ],
              initialValue: 0,
              step: 1,
              count: n,
            });
            expect(count).toBe(n);
            for (let i = 0; i < n; i++) {
              out.push({
                workspaceId: src.workspaceId,
                seq: start + i * step,
                partIndex: i,
              });
            }
          }
          return out;
        },
        getInitialValue: () => [],
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source, Derived],
      relations: [],
    });
    await controller.setup(true);

    await system.storage.create("SeqRangeCustomSource", {
      workspaceId: WORKSPACE_ID,
      parts: 3,
    });

    const rows = await system.storage.find(
      "SeqRangeCustomDerived",
      MatchExp.atom({ key: "workspaceId", value: ["=", WORKSPACE_ID] }),
      undefined,
      ["workspaceId", "seq", "partIndex"]
    );
    const seqs = rows.map((r: any) => r.seq).sort((a: number, b: number) => a - b);
    expect(seqs).toEqual([1, 2, 3]);
    expect(Math.max(...seqs) - Math.min(...seqs) + 1).toBe(seqs.length);

    await system.destroy();
  });

  test("Custom incrementalCompute also binds this.atomic for range API", async () => {
    clearAllInstances();

    const Item = Entity.create({
      name: "SeqRangeIncrItem",
      properties: [Property.create({ name: "amount", type: "number" })],
    });

    const seenStarts: number[] = [];
    const dict = Dictionary.create({
      name: "seqRangeIncrLastEnd",
      type: "number",
      defaultValue: () => 0,
      computation: Custom.create({
        name: "SeqRangeIncrCustom",
        dataDeps: {
          items: {
            type: "records",
            source: Item,
            attributeQuery: ["amount"],
          },
        },
        incrementalDataDeps: [],
        compute: async function (this: any) {
          expect(this.system).toBeUndefined();
          expect(this.atomic).toBeDefined();
          return 0;
        },
        incrementalCompute: async function (this: any, lastValue: any, mutationEvent: any) {
          expect(this.system).toBeUndefined();
          expect(this.controller).toBeDefined();
          expect(this.atomic).toBeDefined();
          expect(this.atomic).toBe(this.controller.system.storage.atomic);
          if (mutationEvent?.type === "create") {
            const range = await this.atomic.reserveSequenceRange({
              sequenceName: "IncrBlockSeq",
              scope: [...emptyScope()],
              initialValue: 0,
              step: 1,
              count: 2,
            });
            seenStarts.push(range.start);
            return range.end;
          }
          return lastValue ?? 0;
        },
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Item],
      relations: [],
      dict: [dict],
    });
    await controller.setup(true);

    await system.storage.create("SeqRangeIncrItem", { amount: 1 });
    await system.storage.create("SeqRangeIncrItem", { amount: 2 });

    expect(seenStarts).toEqual([1, 3]);
    const end = await system.storage.dict.get("seqRangeIncrLastEnd");
    expect(end).toBe(4);

    await system.destroy();
  });
});

describe("reserveSequenceRange — same-transaction multi-row write integrity", () => {
  test("reserve N then insert N unique (scope, seq) rows in one transaction", async () => {
    clearAllInstances();

    const Workspace = Entity.create({
      name: "SeqRangeWriteWorkspace",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const Entry = Entity.create({
      name: "SeqRangeWriteEntry",
      properties: [
        Property.create({ name: "workspaceId", type: "string" }),
        Property.create({ name: "seq", type: "number" }),
        Property.create({ name: "body", type: "string" }),
      ],
      constraints: [
        UniqueConstraint.create({
          name: "SeqRangeWriteEntryUnique",
          properties: ["workspaceId", "seq"],
        }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Workspace, Entry],
      relations: [],
    });
    await controller.setup(true);

    const N = 6;
    await system.storage.runInTransaction({ name: "range-write-n" }, async () => {
      const range = await system.storage.atomic.reserveSequenceRange({
        sequenceName: "WriteBatchSeq",
        scope: workspaceScope(),
        initialValue: 0,
        step: 1,
        count: N,
      });
      expect(range.count).toBe(N);
      expect(range.end - range.start + 1).toBe(N);

      for (let i = 0; i < N; i++) {
        await system.storage.create("SeqRangeWriteEntry", {
          workspaceId: WORKSPACE_ID,
          seq: range.start + i * range.step,
          body: `row-${i}`,
        });
      }
    });

    const rows = await system.storage.find(
      "SeqRangeWriteEntry",
      MatchExp.atom({ key: "workspaceId", value: ["=", WORKSPACE_ID] }),
      undefined,
      ["seq", "body"]
    );
    const seqs = rows.map((r: any) => r.seq).sort((a: number, b: number) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Math.max(...seqs) - Math.min(...seqs) + 1).toBe(N);

    await system.destroy();
  });
});
