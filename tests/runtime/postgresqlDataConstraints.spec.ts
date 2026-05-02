import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  UniqueConstraint,
  findConstraintViolationError,
} from "interaqt";
import { PostgreSQLDB } from "@drivers";

const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

describeIfPostgres("PostgreSQL data constraints", () => {
  test("maps real PostgreSQL unique violation shape through constraint registry", async () => {
    const Account = Entity.create({
      name: "PgConstraintAccount",
      properties: [Property.create({ name: "email", type: "string" })],
      constraints: [
        UniqueConstraint.create({
          name: "PgConstraintAccount_email_unique",
          properties: ["email"],
          violationCode: "PG_ACCOUNT_EMAIL_DUPLICATE",
        }),
      ],
    });

    const system = new MonoSystem(new PostgreSQLDB(process.env.INTERAQT_POSTGRES_DATABASE!, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [Account], relations: [] });
    await controller.setup(true);

    await system.storage.create("PgConstraintAccount", { email: "same@example.com" });
    try {
      await system.storage.create("PgConstraintAccount", { email: "same@example.com" });
      throw new Error("Expected duplicate email to fail");
    } catch (error) {
      const constraintError = findConstraintViolationError(error);
      expect(constraintError).toMatchObject({
        constraintName: "PgConstraintAccount_email_unique",
        recordName: "PgConstraintAccount",
        properties: ["email"],
        context: {
          code: "PG_ACCOUNT_EMAIL_DUPLICATE",
          rawCode: "23505",
        },
      });
    } finally {
      await system.destroy();
    }
  });
});
