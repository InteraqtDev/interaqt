import { describe, expect, test } from "vitest";
import {
  Controller,
  Entity,
  KlassByName,
  MatchExp,
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

  // r31：驱动 insert/update 的 Date 参数必须原样绑定（此前 JSON.stringify 产出带引号字符串，
  // 能否入库依赖 PG datetime 解析器对双引号的历史容忍）。方言匹配探针——PGLite 不能替代真实 PG
  // 的 pg 客户端参数序列化路径（AGENTS.md fix-the-class 清单第 7 条）。
  test("timestamp Date params bind natively through the real pg client (insert + update)", async () => {
    const EventRec = Entity.create({
      name: "PgTimestampEventRec",
      properties: [
        Property.create({ name: "name", type: "string" }),
        Property.create({ name: "happenedAt", type: "timestamp" }),
      ],
    });

    const system = new MonoSystem(new PostgreSQLDB(`${process.env.INTERAQT_POSTGRES_DATABASE!}_r31ts`, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({ system, entities: [EventRec], relations: [] });
    await controller.setup(true);
    try {
      const ms = Date.UTC(2026, 0, 2, 3, 4, 5);
      const created = await system.storage.create("PgTimestampEventRec", { name: "e1", happenedAt: new Date(ms) });
      const readBack = await system.storage.findOne("PgTimestampEventRec", MatchExp.atom({ key: "id", value: ["=", created.id] }), undefined, ["*"]);
      expect(readBack.happenedAt).toBe(ms);

      const ms2 = Date.UTC(2026, 5, 6, 7, 8, 9);
      await system.storage.update("PgTimestampEventRec", MatchExp.atom({ key: "id", value: ["=", created.id] }), { happenedAt: new Date(ms2) });
      const readBack2 = await system.storage.findOne("PgTimestampEventRec", MatchExp.atom({ key: "id", value: ["=", created.id] }), undefined, ["*"]);
      expect(readBack2.happenedAt).toBe(ms2);
    } finally {
      await system.destroy();
    }
  });
});
