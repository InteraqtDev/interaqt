import { describe, expect, test } from "vitest";
import { Entity, Property, Controller, MonoSystem, MatchExp } from "interaqt";
import { PGLiteDB } from "@drivers";

describe("Atomic storage primitives", () => {
  test("should update record and global state atomically", async () => {
    const counterEntity = Entity.create({
      name: "AtomicCounter",
      properties: [
        Property.create({ name: "name", type: "string" }),
        Property.create({ name: "count", type: "number" }),
        Property.create({ name: "status", type: "string" }),
      ],
    });

    const system = new MonoSystem(new PGLiteDB());
    const controller = new Controller({
      system,
      entities: [counterEntity],
      relations: [],
    });

    await controller.setup(true);

    const counter = await system.storage.create("AtomicCounter", {
      name: "counter",
      count: 0,
      status: "pending",
    });

    await Promise.all(
      Array.from({ length: 100 }, () =>
        system.storage.atomic.increment(
          { recordName: "AtomicCounter", id: counter.id, field: "count" },
          1
        )
      )
    );

    const updatedCounter = await system.storage.findOne(
      "AtomicCounter",
      MatchExp.atom({ key: "id", value: ["=", counter.id] }),
      undefined,
      ["count", "status"]
    );
    expect(updatedCounter.count).toBe(100);

    const replaceResult = await system.storage.atomic.replace(
      { recordName: "AtomicCounter", id: counter.id, field: "status" },
      "reviewing"
    );
    expect(replaceResult.oldValue).toBe("pending");
    expect(replaceResult.newValue).toBe("reviewing");

    const casResults = await Promise.all([
      system.storage.atomic.compareAndSet(
        { recordName: "AtomicCounter", id: counter.id, field: "status" },
        "reviewing",
        "approved",
        { defaultValue: "pending" }
      ),
      system.storage.atomic.compareAndSet(
        { recordName: "AtomicCounter", id: counter.id, field: "status" },
        "reviewing",
        "rejected",
        { defaultValue: "pending" }
      ),
    ]);
    expect(casResults.filter(Boolean)).toHaveLength(1);

    await Promise.all(
      Array.from({ length: 50 }, () =>
        system.storage.atomic.increment(
          { key: "atomic-global-total", valueType: "number", defaultValue: 0 },
          1
        )
      )
    );
    await system.storage.atomic.increment(
      { key: "atomic-global-total", valueType: "number", defaultValue: 0 },
      -5
    );

    const globalTotal = await system.storage.atomic.get<number>({
      key: "atomic-global-total",
      valueType: "number",
      defaultValue: 0,
    });
    expect(globalTotal).toBe(45);

    await expect(
      system.storage.atomic.lockGlobal({
        key: "atomic-global-lock",
        valueType: "string",
        defaultValue: "initial",
      })
    ).rejects.toThrow("requires an active transaction");

    await system.storage.runInTransaction({ name: "atomic-lock-test" }, async () => {
      const lockedGlobal = await system.storage.atomic.lockGlobal<string>({
        key: "atomic-global-lock",
        valueType: "string",
        defaultValue: "initial",
      });
      expect(lockedGlobal).toBe("initial");

      const aggregate = await system.storage.atomic.updateGlobalFields(
        { key: "atomic-global-aggregate", valueType: "json", defaultValue: { sum: 0, count: 0 } },
        { sum: 10, count: 2 },
        { sum: 0, count: 0 }
      );
      expect(aggregate).toEqual({ sum: 10, count: 2 });

      const lockedCounter = await system.storage.atomic.lockRecord(
        "AtomicCounter",
        counter.id,
        ["status"]
      );
      expect(lockedCounter?.status).toBeDefined();
    });

    await system.destroy();
  });
});
