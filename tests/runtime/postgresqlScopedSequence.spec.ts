import { describe, expect, test } from "vitest";
import {
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
const PROJECT_ID = 11;

function createEventSource(name: string, entity: any) {
  return {
    uuid: `${name}_uuid`,
    name,
    entity,
    guard: async () => true,
    mapEventData: (args: any) => args.payload,
  } as any;
}

function createModel() {
  const Project = Entity.create({
    name: "PgScopedSequenceProject",
    properties: [Property.create({ name: "name", type: "string" })],
  });
  const Media = Entity.create({
    name: "PgScopedSequenceMedia",
    properties: [
      Property.create({ name: "project", type: "id" }),
      Property.create({ name: "prefix", type: "string" }),
      Property.create({
        name: "serialNumber",
        type: "number",
        computation: ScopedSequence.create({
          name: "PgScopedSequenceMediaSerial",
          scope: [
            { name: "project", type: "ref", base: Project, path: "project" },
            { name: "prefix", type: "string", path: "prefix" },
          ],
        }),
      }),
    ],
    constraints: [
      UniqueConstraint.create({
        name: "PgScopedSequenceMediaUnique",
        properties: ["project", "prefix", "serialNumber"],
      }),
    ],
  });
  return { Project, Media, CreateMedia: createEventSource("PgScopedSequenceCreateMedia", Media) };
}

async function createController(model: ReturnType<typeof createModel>, install: boolean) {
  const db = new PostgreSQLDB(process.env.INTERAQT_POSTGRES_DATABASE!, dbOptions);
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
    const model = createModel();
    const first = await createController(model, true);
    const second = await createController(model, false);
    try {
      const responses = await Promise.all([
        ...Array.from({ length: 100 }, () => first.controller.dispatch(first.model.CreateMedia, { payload: { project: PROJECT_ID, prefix: "img" } })),
        ...Array.from({ length: 100 }, () => second.controller.dispatch(second.model.CreateMedia, { payload: { project: PROJECT_ID, prefix: "img" } })),
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
});
