import { describe, expect, test } from "vitest";
import {
  BoolExp,
  Controller,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  ScopedSequence,
  UniqueConstraint,
} from "interaqt";
import { PostgreSQLDB } from "@drivers";

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};
const PROJECT_ID = "11";
const PROJECT_ASSET = "PROJECT_ASSET";
const PUBLIC_LIBRARY = "PUBLIC_LIBRARY";

function createEventSource(name: string, entity: any) {
  return {
    uuid: `${name}_uuid`,
    name,
    entity,
    guard: async () => true,
    mapEventData: (args: any) => args.payload,
  } as any;
}

function scopedSequenceScope(projectEntityName: string, projectId: string, prefix: string) {
  return [
    { name: "project", type: "ref" as const, value: { type: "ref" as const, entity: projectEntityName, id: projectId } },
    { name: "prefix", type: "string" as const, value: prefix },
  ];
}

function databaseNameFor(suffix: string) {
  return `${process.env.INTERAQT_POSTGRES_DATABASE}_${suffix.toLowerCase()}`;
}

function createModel(suffix: string) {
  const Project = Entity.create({
    name: `PgScopedSequence${suffix}Project`,
    properties: [Property.create({ name: "name", type: "string" })],
  });
  const Media = Entity.create({
    name: `PgScopedSequence${suffix}Media`,
    properties: [
      Property.create({ name: "project", type: "id" }),
      Property.create({ name: "prefix", type: "string" }),
      Property.create({ name: "kind", type: "string" }),
      Property.create({
        name: "serialNumber",
        type: "number",
        computation: ScopedSequence.create({
          name: `PgScopedSequence${suffix}MediaSerial`,
          scope: [
            { name: "project", type: "ref", base: Project, path: "project" },
            { name: "prefix", type: "string", path: "prefix" },
          ],
          match: BoolExp.atom({ key: "kind", value: ["=", PROJECT_ASSET] }),
        }),
      }),
    ],
    constraints: [
      UniqueConstraint.create({
        name: `PgScopedSequence${suffix}MediaUnique`,
        properties: ["project", "prefix", "serialNumber"],
      }),
    ],
  });
  return {
    Project,
    Media,
    CreateMedia: createEventSource(`PgScopedSequence${suffix}CreateMedia`, Media),
    databaseName: databaseNameFor(suffix),
  };
}

async function createController(model: ReturnType<typeof createModel>, install: boolean) {
  const db = new PostgreSQLDB(model.databaseName, dbOptions);
  const system = new MonoSystem(db);
  system.conceptClass = KlassByName;
  const controller = new Controller({
    system,
    entities: [model.Project, model.Media],
    relations: [],
    eventSources: [model.CreateMedia],
  });
  await controller.setup(install);
  return { system, controller, model };
}

describeIfPostgres("PostgreSQL ScopedSequence", () => {
  test("allocates unique scoped values across two controllers", async () => {
    const model = createModel("Unique");
    const first = await createController(model, true);
    const second = await createController(model, false);
    try {
      const responses = await Promise.all([
        ...Array.from({ length: 100 }, () => first.controller.dispatch(first.model.CreateMedia, { payload: { kind: PROJECT_ASSET, project: PROJECT_ID, prefix: "img" } })),
        ...Array.from({ length: 100 }, () => second.controller.dispatch(second.model.CreateMedia, { payload: { kind: PROJECT_ASSET, project: PROJECT_ID, prefix: "img" } })),
      ]);
      expect(responses.map(response => response.error).filter(Boolean)).toEqual([]);
      const records = await first.system.storage.find(first.model.Media.name, undefined, undefined, ["serialNumber"]);
      const serials = records.map(item => item.serialNumber).sort((a, b) => a - b);
      expect(serials).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
    } finally {
      await first.system.destroy();
      await second.system.destroy();
    }
  }, 30000);

  test("matches project assets under concurrent controllers without advancing for non-project media", async () => {
    const model = createModel("Match");
    const first = await createController(model, true);
    const second = await createController(model, false);
    try {
      const missingScope = await first.controller.dispatch(first.model.CreateMedia, {
        payload: { kind: PROJECT_ASSET, prefix: "img" },
      });
      expect(String(missingScope.error)).toContain('ScopedSequence scope "project" is missing');

      const responses = await Promise.all([
        ...Array.from({ length: 40 }, () => first.controller.dispatch(first.model.CreateMedia, {
          payload: { kind: PROJECT_ASSET, project: PROJECT_ID, prefix: "img" },
        })),
        ...Array.from({ length: 40 }, () => second.controller.dispatch(second.model.CreateMedia, {
          payload: { kind: PROJECT_ASSET, project: PROJECT_ID, prefix: "img" },
        })),
        ...Array.from({ length: 20 }, (_, index) => first.controller.dispatch(first.model.CreateMedia, {
          payload: { kind: PUBLIC_LIBRARY, prefix: "img", serialNumber: 10_000 + index },
        })),
        ...Array.from({ length: 20 }, () => second.controller.dispatch(second.model.CreateMedia, {
          payload: { kind: PUBLIC_LIBRARY, prefix: "img" },
        })),
      ]);
      expect(responses.map(response => response.error).filter(Boolean)).toEqual([]);

      const records = await first.system.storage.find(first.model.Media.name, undefined, undefined, ["kind", "serialNumber"]);
      const projectSerials = records
        .filter(item => item.kind === PROJECT_ASSET)
        .map(item => item.serialNumber)
        .sort((a, b) => a - b);
      expect(projectSerials).toEqual(Array.from({ length: 80 }, (_, index) => index + 1));
      expect(records.filter(item => item.kind === PUBLIC_LIBRARY && item.serialNumber === undefined)).toHaveLength(20);
      expect(records.filter(item => item.kind === PUBLIC_LIBRARY && typeof item.serialNumber === "number")).toHaveLength(20);

      const currentCounter = await first.system.storage.atomic.readSequenceValue({
        sequenceName: `PgScopedSequenceMatchMediaSerial`,
        scope: scopedSequenceScope(first.model.Project.name, PROJECT_ID, "img"),
      });
      expect(currentCounter).toBe(80);
    } finally {
      await first.system.destroy();
      await second.system.destroy();
    }
  }, 30000);
});
