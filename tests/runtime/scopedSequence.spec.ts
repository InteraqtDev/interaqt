import { describe, expect, test } from "vitest";
import {
  Controller,
  Custom,
  Entity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Property,
  ScopedSequence,
  UniqueConstraint,
  createMigrationManifest,
  readMigrationManifest,
  writeMigrationManifest,
} from "interaqt";
import { PGLiteDB } from "@drivers";
import { SQLiteDB } from "@drivers";

const PROJECT_1 = "00000000-0000-0000-0000-000000000001";
const PROJECT_2 = "00000000-0000-0000-0000-000000000002";

function scopedSequenceScope(projectEntityName: string, projectId: string, prefix: string) {
  return [
    { name: "project", type: "ref" as const, value: { type: "ref" as const, entity: projectEntityName, id: projectId } },
    { name: "prefix", type: "string" as const, value: prefix },
  ];
}

function createEventSource(name: string, entity: any, map: (args: any) => any, resolve?: (this: Controller, args: any) => Promise<any>) {
  return {
    uuid: `${name}_uuid`,
    name,
    entity,
    guard: async () => true,
    mapEventData: map,
    resolve,
  } as any;
}

function createScopedSequenceModel(prefix: string, options: Partial<Parameters<typeof ScopedSequence.create>[0]> = {}) {
  const Project = Entity.create({
    name: `${prefix}Project`,
    properties: [Property.create({ name: "name", type: "string" })],
  });
  const sequence = ScopedSequence.create({
    name: `${prefix}MediaSerial`,
    scope: [
      { name: "project", type: "ref", base: Project, path: "project" },
      { name: "prefix", type: "string", path: "prefix" },
    ],
    initialValue: 0,
    step: 1,
    ...options,
  });
  const Media = Entity.create({
    name: `${prefix}Media`,
    properties: [
      Property.create({ name: "project", type: "id" }),
      Property.create({ name: "prefix", type: "string" }),
      Property.create({ name: "serialNumber", type: "number", computation: sequence }),
    ],
    constraints: [
      UniqueConstraint.create({
        name: `${prefix}MediaSerialUnique`,
        properties: ["project", "prefix", "serialNumber"],
      }),
    ],
  });
  const Command = Entity.create({
    name: `${prefix}Command`,
    properties: [Property.create({ name: "targetId", type: "id" })],
  });
  const CreateMedia = createEventSource(`${prefix}CreateMedia`, Media, (args) => args.payload);
  const CreateAndFail = createEventSource(`${prefix}CreateAndFail`, Media, (args) => args.payload, async () => {
    throw new Error("forced rollback");
  });
  const DeleteMedia = createEventSource(`${prefix}DeleteMedia`, Command, (args) => ({ targetId: args.payload.id }), async function(args) {
    return this.system.storage.delete(Media.name, MatchExp.atom({ key: "id", value: ["=", args.payload.id] }));
  });
  return { Project, Media, Command, CreateMedia, CreateAndFail, DeleteMedia, sequence };
}

async function setupController(model: ReturnType<typeof createScopedSequenceModel>, forceThrowDispatchError = false) {
  const system = new MonoSystem(new PGLiteDB());
  system.conceptClass = KlassByName;
  const controller = new Controller({
    system,
    entities: [model.Project, model.Media, model.Command],
    relations: [],
    eventSources: [model.CreateMedia, model.CreateAndFail, model.DeleteMedia],
    forceThrowDispatchError,
  });
  await controller.setup(true);
  return { system, controller };
}

function approveScopedSequenceDiff(diff: Awaited<ReturnType<Controller["generateMigrationDiff"]>>) {
  return {
    ...diff,
    status: "approved" as const,
    decisions: diff.requiredDecisions.map(requirement => {
      if (requirement.kind === "scoped-sequence-seed" || requirement.kind === "scoped-sequence-no-seed") {
        return {
          ...requirement,
          reason: "approved scoped sequence migration",
        };
      }
      if (requirement.kind === "computation-takeover") {
        return {
          kind: "computation-takeover" as const,
          dataContext: requirement.dataContext,
          computationId: requirement.computationId,
          targetType: requirement.targetType,
          previousAuthority: requirement.previousAuthority,
          nextAuthority: requirement.nextAuthority,
          oldDataStrategy: requirement.oldDataStrategy,
          expectedExistingCount: requirement.expectedExistingCount,
          expectedHostCount: requirement.expectedHostCount,
          destructiveScopeRef: requirement.destructiveScopeRef,
          reason: "approved scoped sequence takeover",
        };
      }
      return {
        kind: "computation" as const,
        id: (requirement as any).id,
        dataContext: (requirement as any).dataContext,
        decision: "unrebuildable" as const,
        reason: "reviewed scoped sequence as unrebuildable",
      };
    }),
  };
}

describe("ScopedSequence", () => {
  test("validates core arguments and host property type", async () => {
    const Project = Entity.create({ name: "ScopedValidationProject", properties: [] });
    expect(() => ScopedSequence.create({
      name: "BadStepSequence",
      scope: [{ name: "project", type: "ref", base: Project, path: "project" }],
      step: 0,
    })).toThrow("positive integer");
    expect(() => ScopedSequence.create({
      name: "DuplicateScopeSequence",
      scope: [
        { name: "project", type: "ref", base: Project, path: "project" },
        { name: "project", type: "string", path: "prefix" },
      ],
    })).toThrow("duplicated");
    expect(() => ScopedSequence.create({
      name: "MissingInitializerScopeSequence",
      scope: [
        { name: "project", type: "ref", base: Project, path: "project" },
        { name: "prefix", type: "string", path: "prefix" },
      ],
      initializeFrom: {
        record: Project,
        valuePath: "serialNumber",
        scope: [{ name: "project", path: "project" }],
        aggregate: "max",
      },
    })).toThrow('missing declared scope item "prefix"');
    expect(() => ScopedSequence.create({
      name: "UnknownInitializerScopeSequence",
      scope: [{ name: "project", type: "ref", base: Project, path: "project" }],
      initializeFrom: {
        record: Project,
        valuePath: "serialNumber",
        scope: [
          { name: "project", path: "project" },
          { name: "tenant", path: "tenant" },
        ],
        aggregate: "max",
      },
    })).toThrow('is not declared in scope');
    expect(() => ScopedSequence.create({
      name: "DuplicateInitializerScopeSequence",
      scope: [{ name: "project", type: "ref", base: Project, path: "project" }],
      initializeFrom: {
        record: Project,
        valuePath: "serialNumber",
        scope: [
          { name: "project", path: "project" },
          { name: "project", path: "projectId" },
        ],
        aggregate: "max",
      },
    })).toThrow("duplicated");
    expect(() => ScopedSequence.create({
      name: "InvalidInitializerPathSequence",
      scope: [{ name: "project", type: "ref", base: Project, path: "project" }],
      initializeFrom: {
        record: Project,
        valuePath: "serial..Number",
        scope: [{ name: "project", path: "project" }],
        aggregate: "max",
      },
    })).toThrow("stable path");

    const BadHost = Entity.create({
      name: "ScopedBadHost",
      properties: [
        Property.create({ name: "project", type: "id" }),
        Property.create({
          name: "serialNumber",
          type: "string",
          computation: ScopedSequence.create({
            name: "BadHostSequence",
            scope: [{ name: "project", type: "ref", base: Project, path: "project" }],
          }),
        }),
      ],
    });
    const system = new MonoSystem(new PGLiteDB());
    expect(() => new Controller({ system, entities: [Project, BadHost], relations: [] })).toThrow('must have type "number"');
  });

  test("allocates first values, isolates scopes, rejects manual values by default, and records timing effects", async () => {
    const model = createScopedSequenceModel("ScopedMatrixA");
    const { system, controller } = await setupController(model);

    const first = await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    expect(first.error).toBeUndefined();
    expect(first.effects?.map(effect => `${effect.recordName}:${effect.type}:${effect.keys?.join(",") || "*"}`)).toContain("ScopedMatrixAMedia:create:*");
    expect(first.effects?.some(effect => effect.recordName === "ScopedMatrixAMedia" && effect.type === "update")).toBe(true);

    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "video" } });
    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_2, prefix: "img" } });

    const records = await system.storage.find(model.Media.name, undefined, undefined, ["project", "prefix", "serialNumber"]);
    expect(records.filter(item => item.project === PROJECT_1 && item.prefix === "img").map(item => item.serialNumber).sort()).toEqual([1, 2]);
    expect(records.find(item => item.project === PROJECT_1 && item.prefix === "video")?.serialNumber).toBe(1);
    expect(records.find(item => item.project === PROJECT_2 && item.prefix === "img")?.serialNumber).toBe(1);

    const manual = await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 99 } });
    expect(String(manual.error)).toContain("cannot be set manually");

    await system.destroy();
  });

  test("applies initialValue plus step for the first allocation", async () => {
    const model = createScopedSequenceModel("ScopedMatrixStep", { initialValue: 10, step: 5 });
    const { system, controller } = await setupController(model);

    const result = await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    expect(result.error).toBeUndefined();
    const records = await system.storage.find(model.Media.name, undefined, undefined, ["serialNumber"]);
    expect(records.map(item => item.serialNumber)).toEqual([15]);

    await system.destroy();
  });

  test("preserves manual import values without advancing the counter when explicitly allowed", async () => {
    const model = createScopedSequenceModel("ScopedMatrixB", { allowManualValue: true });
    const { system, controller } = await setupController(model);

    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 10 } });
    expect(await system.storage.atomic.readSequenceValue({
      sequenceName: model.sequence.name,
      scope: scopedSequenceScope(model.Project.name, PROJECT_1, "img"),
    })).toBeUndefined();

    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    const records = await system.storage.find(model.Media.name, undefined, undefined, ["serialNumber"]);
    expect(records.map(item => item.serialNumber).sort((a, b) => a - b)).toEqual([1, 10]);

    await system.destroy();
  });

  test("keeps unique constraint as the fallback for conflicting imported values", async () => {
    const model = createScopedSequenceModel("ScopedMatrixUnique", { allowManualValue: true });
    const { system, controller } = await setupController(model);

    const first = await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 10 } });
    expect(first.error).toBeUndefined();
    const duplicate = await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 10 } });
    expect(duplicate.error).toBeDefined();
    const records = await system.storage.find(model.Media.name, undefined, undefined, ["serialNumber"]);
    expect(records.map(item => item.serialNumber)).toEqual([10]);

    await system.destroy();
  });

  test("fails clearly when the driver does not support atomic scoped sequences", () => {
    const model = createScopedSequenceModel("ScopedMatrixUnsupported");
    const system = new MonoSystem(new PGLiteDB());
    delete ((system.storage as unknown as { db: { atomicSequenceCapability?: unknown } }).db.atomicSequenceCapability);

    expect(() => new Controller({
      system,
      entities: [model.Project, model.Media, model.Command],
      relations: [],
      eventSources: [model.CreateMedia],
    })).toThrow("ScopedSequence is not supported");
  });

  test("keeps transactional rollback and delete semantics", async () => {
    const model = createScopedSequenceModel("ScopedMatrixC");
    const { system, controller } = await setupController(model);

    await expect(controller.dispatch(model.CreateAndFail, { payload: { project: PROJECT_1, prefix: "img" } })).resolves.toMatchObject({ error: expect.any(Error) });
    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    let records = await system.storage.find(model.Media.name, undefined, undefined, ["id", "serialNumber"]);
    expect(records.map(item => item.serialNumber)).toEqual([1]);

    await controller.dispatch(model.DeleteMedia, { payload: { id: records[0].id } });
    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    records = await system.storage.find(model.Media.name, undefined, undefined, ["serialNumber"]);
    expect(records.map(item => item.serialNumber)).toEqual([2]);

    await system.destroy();
  });

  test("handles single-controller concurrent allocation without duplicates", async () => {
    const model = createScopedSequenceModel("ScopedMatrixD");
    const { system, controller } = await setupController(model);

    await Promise.all(Array.from({ length: 100 }, () =>
      controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } })
    ));
    const records = await system.storage.find(model.Media.name, undefined, undefined, ["serialNumber"]);
    expect(new Set(records.map(item => item.serialNumber))).toHaveLength(100);
    expect(records.map(item => item.serialNumber).sort((a, b) => a - b)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));

    await system.destroy();
  });

  test("allows downstream property computations to react to the sequence update", async () => {
    const Project = Entity.create({
      name: "ScopedMatrixDisplayProject",
      properties: [Property.create({ name: "name", type: "string" })],
    });
    const serial = ScopedSequence.create({
      name: "ScopedMatrixDisplaySerial",
      scope: [
        { name: "project", type: "ref", base: Project, path: "project" },
        { name: "prefix", type: "string", path: "prefix" },
      ],
    });
    const Media = Entity.create({
      name: "ScopedMatrixDisplayMedia",
      properties: [
        Property.create({ name: "project", type: "id" }),
        Property.create({ name: "prefix", type: "string" }),
        Property.create({ name: "serialNumber", type: "number", computation: serial }),
        Property.create({
          name: "displayName",
          type: "string",
          computation: Custom.create({
            name: "ScopedMatrixDisplayName",
            concurrency: "atomic-safe",
            dataDeps: { current: { type: "property", attributeQuery: ["prefix", "serialNumber"] } },
            compute: ({ current }: { current: { prefix?: string; serialNumber?: number } }) =>
              current.serialNumber === undefined ? undefined : `${current.prefix}-${current.serialNumber}`,
          }),
        }),
      ],
    });
    const CreateMedia = createEventSource("ScopedMatrixDisplayCreateMedia", Media, (args) => args.payload);
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Project, Media], relations: [], eventSources: [CreateMedia] });
    await controller.setup(true);

    const result = await controller.dispatch(CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    expect(result.error).toBeUndefined();
    const records = await system.storage.find(Media.name, undefined, undefined, ["serialNumber", "displayName"]);
    expect(records).toMatchObject([{ serialNumber: 1, displayName: "img-1" }]);

    await system.destroy();
  });

  test("captures allocation signatures in manifests and seeds from existing data during migration", async () => {
    const v1 = createScopedSequenceModel("ScopedMatrixE", { allowManualValue: true });
    const { system, controller } = await setupController(v1);
    await controller.dispatch(v1.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 7 } });
    await controller.dispatch(v1.CreateMedia, { payload: { project: PROJECT_2, prefix: "img", serialNumber: 3 } });
    const baseline = createMigrationManifest(controller);
    expect(baseline.sequences).toMatchObject([{
      hostRecord: v1.Media.name,
      property: "serialNumber",
      sequenceName: v1.sequence.name,
    }]);
    await writeMigrationManifest(controller, baseline);

    const v2 = createScopedSequenceModel("ScopedMatrixE", {
      allowManualValue: false,
      initializeFrom: {
        record: v1.Media,
        valuePath: "serialNumber",
        scope: [
          { name: "prefix", path: "prefix" },
          { name: "project", path: "project" },
        ],
        aggregate: "max",
      },
    });
    const controllerV2 = new Controller({
      system,
      entities: [v2.Project, v2.Media, v2.Command],
      relations: [],
      eventSources: [v2.CreateMedia, v2.CreateAndFail, v2.DeleteMedia],
    });
    const diff = await controllerV2.generateMigrationDiff();
    const tamperedSeedDecision = approveScopedSequenceDiff(diff);
    const tamperedIndex = tamperedSeedDecision.decisions.findIndex(decision => decision.kind === "scoped-sequence-seed");
    expect(tamperedIndex).toBeGreaterThanOrEqual(0);
    tamperedSeedDecision.decisions[tamperedIndex] = {
      ...(tamperedSeedDecision.decisions[tamperedIndex] as any),
      hostRecord: "TamperedHost",
    };
    await expect(controllerV2.migrate({ approvedDiff: tamperedSeedDecision, dryRun: true })).rejects.toThrow(/seed decision does not match/);

    const approvedDiff = {
      ...diff,
      status: "approved" as const,
      decisions: diff.requiredDecisions.map(requirement => requirement.kind === "scoped-sequence-seed"
        ? {
          ...requirement,
          reason: "approved scoped sequence seed",
        }
        : {
          kind: "computation" as const,
          id: (requirement as any).id,
          dataContext: (requirement as any).dataContext,
          decision: "unrebuildable" as const,
          reason: "reviewed scoped sequence as unrebuildable",
        }),
    };
    const dryRunPlan = await controllerV2.migrate({ approvedDiff, dryRun: true });
    expect(dryRunPlan.scopedSequenceSeedOperations).toMatchObject([{
      sequenceName: v2.sequence.name,
      hostRecord: v2.Media.name,
      targetProperty: "serialNumber",
      valuePath: "serialNumber",
      aggregate: "max",
      mode: "max",
    }]);
    await controllerV2.migrate({ approvedDiff });
    await system.storage.runInTransaction({ name: "verify scoped sequence seed" }, async () => {
      const next = await system.storage.atomic.nextSequenceValue({
        sequenceName: v2.sequence.name,
        scope: scopedSequenceScope(v2.Project.name, PROJECT_1, "img"),
        initialValue: 0,
        step: 1,
      });
      expect(next).toBe(8);
    });
    expect((await readMigrationManifest(controllerV2))?.computations[0].allocationSignature).toBeDefined();

    const changedStep = createScopedSequenceModel("ScopedMatrixEStep", { step: 2 });
    const changedManifest = createMigrationManifest(new Controller({
      system: new MonoSystem(new PGLiteDB()),
      entities: [changedStep.Project, changedStep.Media, changedStep.Command],
      relations: [],
      eventSources: [changedStep.CreateMedia],
    }));
    expect(changedManifest.computations[0].allocationSignature).toBeDefined();

    await system.destroy();
  });

  test("seeds only matched existing rows with storage-level aggregate migration", async () => {
    const v1 = createScopedSequenceModel("ScopedMatrixSeedMatch", { allowManualValue: true });
    const { system, controller } = await setupController(v1);
    await controller.dispatch(v1.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 7 } });
    await controller.dispatch(v1.CreateMedia, { payload: { project: PROJECT_1, prefix: "video", serialNumber: 3 } });
    await writeMigrationManifest(controller, createMigrationManifest(controller));

    const v2 = createScopedSequenceModel("ScopedMatrixSeedMatch", {
      allowManualValue: false,
      initializeFrom: {
        record: v1.Media,
        valuePath: "serialNumber",
        scope: [
          { name: "project", path: "project" },
          { name: "prefix", path: "prefix" },
        ],
        aggregate: "max",
        match: MatchExp.atom({ key: "prefix", value: ["=", "img"] }),
      },
    });
    const controllerV2 = new Controller({
      system,
      entities: [v2.Project, v2.Media, v2.Command],
      relations: [],
      eventSources: [v2.CreateMedia],
    });
    const diff = await controllerV2.generateMigrationDiff();
    const approvedDiff = approveScopedSequenceDiff(diff);
    await controllerV2.migrate({ approvedDiff });
    await system.storage.runInTransaction({ name: "verify matched scoped sequence seed" }, async () => {
      const imgNext = await system.storage.atomic.nextSequenceValue({
        sequenceName: v2.sequence.name,
        scope: scopedSequenceScope(v2.Project.name, PROJECT_1, "img"),
        initialValue: 0,
        step: 1,
      });
      const videoNext = await system.storage.atomic.nextSequenceValue({
        sequenceName: v2.sequence.name,
        scope: scopedSequenceScope(v2.Project.name, PROJECT_1, "video"),
        initialValue: 0,
        step: 1,
      });
      expect(imgNext).toBe(8);
      expect(videoNext).toBe(1);
    });

    await system.destroy();
  });

  test("allows no-initialize migration only when the host table is empty and plans internal schema", async () => {
    const ProjectV1 = new Entity({
      name: "ScopedMatrixNoInitProject",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "scoped-no-init-project-name" })],
    }, { uuid: "scoped-no-init-project" });
    const MediaV1 = new Entity({
      name: "ScopedMatrixNoInitMedia",
      properties: [
        new Property({ name: "project", type: "id" }, { uuid: "scoped-no-init-media-project" }),
        new Property({ name: "prefix", type: "string" }, { uuid: "scoped-no-init-media-prefix" }),
        new Property({ name: "serialNumber", type: "number" }, { uuid: "scoped-no-init-media-serial" }),
      ],
    }, { uuid: "scoped-no-init-media" });
    const db = new PGLiteDB();
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controllerV1 = new Controller({ system, entities: [ProjectV1, MediaV1], relations: [] });
    await controllerV1.setup(true);
    await writeMigrationManifest(controllerV1, createMigrationManifest(controllerV1));

    const ProjectV2 = new Entity({
      name: "ScopedMatrixNoInitProject",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "scoped-no-init-project-name" })],
    }, { uuid: "scoped-no-init-project" });
    const sequence = new ScopedSequence({
      name: "ScopedMatrixNoInitSerial",
      scope: [
        { name: "project", type: "ref", base: ProjectV2, path: "project" },
        { name: "prefix", type: "string", path: "prefix" },
      ],
    }, { uuid: "scoped-no-init-sequence" });
    const MediaV2 = new Entity({
      name: "ScopedMatrixNoInitMedia",
      properties: [
        new Property({ name: "project", type: "id" }, { uuid: "scoped-no-init-media-project" }),
        new Property({ name: "prefix", type: "string" }, { uuid: "scoped-no-init-media-prefix" }),
        new Property({ name: "serialNumber", type: "number", computation: sequence }, { uuid: "scoped-no-init-media-serial" }),
      ],
    }, { uuid: "scoped-no-init-media" });
    const CreateMedia = createEventSource("ScopedMatrixNoInitCreateMedia", MediaV2, (args) => args.payload);
    const controllerV2 = new Controller({ system, entities: [ProjectV2, MediaV2], relations: [], eventSources: [CreateMedia] });
    const diff = await controllerV2.generateMigrationDiff();
    expect(diff.requiredDecisions.some(requirement => requirement.kind === "scoped-sequence-no-seed" && requirement.expectedHostCount === 0)).toBe(true);
    const approvedDiff = approveScopedSequenceDiff(diff);
    const dryRun = await controllerV2.migrate({ approvedDiff, dryRun: true });
    expect(dryRun.blockingChanges).toEqual([]);
    expect(dryRun.scopedSequenceNoSeedOperations).toMatchObject([{
      sequenceName: "ScopedMatrixNoInitSerial",
      hostRecord: "ScopedMatrixNoInitMedia",
      targetProperty: "serialNumber",
      expectedHostCount: 0,
    }]);
    expect(dryRun.schemaPlan?.preRecomputeDDL.some(operation => operation.kind === "create-table" && operation.tableName === "_ScopedSequence_")).toBe(true);
    await controllerV2.migrate({ approvedDiff });
    const result = await controllerV2.dispatch(CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    expect(result.error).toBeUndefined();
    const records = await system.storage.find(MediaV2.name, undefined, undefined, ["serialNumber"]);
    expect(records.map(record => record.serialNumber)).toEqual([1]);

    await system.destroy();
  });

  test("blocks no-initialize migration when existing host rows need counters", async () => {
    const v1 = createScopedSequenceModel("ScopedMatrixNoInitExisting", { allowManualValue: true });
    const { system, controller } = await setupController(v1);
    await controller.dispatch(v1.CreateMedia, { payload: { project: PROJECT_1, prefix: "img", serialNumber: 7 } });
    await writeMigrationManifest(controller, createMigrationManifest(controller));

    const v2 = createScopedSequenceModel("ScopedMatrixNoInitExisting", { allowManualValue: false });
    const controllerV2 = new Controller({
      system,
      entities: [v2.Project, v2.Media, v2.Command],
      relations: [],
      eventSources: [v2.CreateMedia],
    });
    const diff = await controllerV2.generateMigrationDiff();
    expect(diff.requiredDecisions.some(requirement => requirement.kind === "scoped-sequence-no-seed")).toBe(false);
    const approvedDiff = {
      ...diff,
      status: "approved" as const,
      decisions: diff.requiredDecisions
        .filter(requirement => requirement.kind === "computation")
        .map(requirement => ({
          kind: "computation" as const,
          id: (requirement as any).id,
          dataContext: (requirement as any).dataContext,
          decision: "unrebuildable" as const,
          reason: "reviewed scoped sequence as unrebuildable",
        })),
    };
    const dryRun = await controllerV2.migrate({ approvedDiff, dryRun: true });
    expect(dryRun.blockingChanges.some(message => message.includes("unrebuildable"))).toBe(true);

    await system.destroy();
  });

  test("rejects initializeFrom when existing host rows do not all have valid sequence values", async () => {
    const ProjectV1 = new Entity({
      name: "ScopedMatrixInvalidSeedProject",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "scoped-invalid-seed-project-name" })],
    }, { uuid: "scoped-invalid-seed-project" });
    const MediaV1 = new Entity({
      name: "ScopedMatrixInvalidSeedMedia",
      properties: [
        new Property({ name: "project", type: "id" }, { uuid: "scoped-invalid-seed-media-project" }),
        new Property({ name: "prefix", type: "string" }, { uuid: "scoped-invalid-seed-media-prefix" }),
        new Property({ name: "serialNumber", type: "number" }, { uuid: "scoped-invalid-seed-media-serial" }),
      ],
    }, { uuid: "scoped-invalid-seed-media" });
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [ProjectV1, MediaV1], relations: [] });
    await controller.setup(true);
    await system.storage.create(MediaV1.name, { project: PROJECT_1, prefix: "img" });
    await writeMigrationManifest(controller, createMigrationManifest(controller));

    const ProjectV2 = new Entity({
      name: "ScopedMatrixInvalidSeedProject",
      properties: [new Property({ name: "name", type: "string" }, { uuid: "scoped-invalid-seed-project-name" })],
    }, { uuid: "scoped-invalid-seed-project" });
    const sequence = new ScopedSequence({
      name: "ScopedMatrixInvalidSeedSerial",
      scope: [
        { name: "project", type: "ref", base: ProjectV2, path: "project" },
        { name: "prefix", type: "string", path: "prefix" },
      ],
      initializeFrom: {
        record: MediaV1,
        valuePath: "serialNumber",
        scope: [
          { name: "project", path: "project" },
          { name: "prefix", path: "prefix" },
        ],
        aggregate: "max",
      },
    }, { uuid: "scoped-invalid-seed-sequence" });
    const MediaV2 = new Entity({
      name: "ScopedMatrixInvalidSeedMedia",
      properties: [
        new Property({ name: "project", type: "id" }, { uuid: "scoped-invalid-seed-media-project" }),
        new Property({ name: "prefix", type: "string" }, { uuid: "scoped-invalid-seed-media-prefix" }),
        new Property({ name: "serialNumber", type: "number", computation: sequence }, { uuid: "scoped-invalid-seed-media-serial" }),
      ],
    }, { uuid: "scoped-invalid-seed-media" });
    const CreateMedia = createEventSource("ScopedMatrixInvalidSeedCreateMedia", MediaV2, (args) => args.payload);
    const controllerV2 = new Controller({
      system,
      entities: [ProjectV2, MediaV2],
      relations: [],
      eventSources: [CreateMedia],
    });
    const diff = await controllerV2.generateMigrationDiff();
    const approvedDiff = approveScopedSequenceDiff(diff);
    await expect(controllerV2.migrate({ approvedDiff })).rejects.toThrow(/valuePath must be present/);

    await system.destroy();
  });

  test("runs scoped sequence allocation on SQLite for test/single-process drivers", async () => {
    const model = createScopedSequenceModel("ScopedMatrixSQLite");
    const db = new SQLiteDB(":memory:");
    const system = new MonoSystem(db);
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [model.Project, model.Media, model.Command],
      relations: [],
      eventSources: [model.CreateMedia],
    });
    await controller.setup(true);
    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    await controller.dispatch(model.CreateMedia, { payload: { project: PROJECT_1, prefix: "img" } });
    const records = await system.storage.find(model.Media.name, undefined, undefined, ["serialNumber"]);
    expect(records.map(record => record.serialNumber).sort()).toEqual([1, 2]);
    await system.destroy();
  });

  test("requires explicit migration decisions for allocation argument changes", async () => {
    const assertAllocationReview = async (
      suffix: string,
      nextOptions: Partial<Parameters<typeof ScopedSequence.create>[0]>,
    ) => {
      const v1 = createScopedSequenceModel(`ScopedMatrixDiff${suffix}`);
      const { system, controller } = await setupController(v1);
      await writeMigrationManifest(controller, createMigrationManifest(controller));

      const v2 = createScopedSequenceModel(`ScopedMatrixDiff${suffix}`, nextOptions);
      const controllerV2 = new Controller({
        system,
        entities: [v2.Project, v2.Media, v2.Command],
        relations: [],
        eventSources: [v2.CreateMedia],
      });
      const diff = await controllerV2.generateMigrationDiff();
      expect(diff.requiredDecisions.some(requirement =>
        requirement.kind === "computation" &&
        requirement.recommendedDecision === "unrebuildable" &&
        requirement.reason.includes("allocation")
      )).toBe(true);
      await system.destroy();
    };

    await assertAllocationReview("Scope", {
      scope: [
        { name: "prefix", type: "string", path: "prefix" },
        { name: "project", type: "ref", base: Entity.create({ name: "ScopedMatrixDiffScopeProjectRef", properties: [] }), path: "project" },
      ],
    });
    await assertAllocationReview("Initial", { initialValue: 5 });
    await assertAllocationReview("Step", { step: 2 });
    await assertAllocationReview("Manual", { allowManualValue: true });
  });
});
