import { describe, expect, test } from "vitest";
import { Controller, MonoSystem } from "@runtime";
import { MysqlDB } from "@drivers";
import { Entity, Property } from "@core";

/**
 * r32（r28 记录的 driver 项收口）：MySQL _IDS_ 计数器与存量数据对账。
 *
 * setup(false) attach 到已有数据而 _IDS_ 计数器缺失/落后（手工导入、备份恢复）时，
 * getAutoId 从 1 重发号——逻辑 id 列没有唯一索引，重复 id 是静默数据损坏。
 * setupRecordSequences 以 MAX(idField) 对账（只向前推进），与 PG 驱动 setupSequences
 * 同一契约。SQLite 面见 tests/storage/review-fixes-2026-07-15-r32.spec.ts C1；
 * 本套件是 MySQL 方言匹配探针（AGENTS.md fix-the-class 清单第 7 条）。
 * MySQL 驱动 transactions: false ⇒ storage.create 不可用，数据行以驱动级 SQL 写入，
 * 断言面在 getAutoId（发号器本体）。
 *
 * 同时覆盖 r31 回归：_Dictionary_/_System_ 的内部唯一约束在 unique 能力缺失的 MySQL
 * 方言上必须跳过而非让 setup 崩溃（此前 setup(true) 全量 ConstraintSetupError）。
 *
 * 需要真实 MySQL：INTERAQT_MYSQL_DATABASE + MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD
 * （默认 127.0.0.1/interaqt/interaqt），未设置时跳过。
 */
const MYSQL_ENABLED = !!process.env.INTERAQT_MYSQL_DATABASE;

const config = {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    user: process.env.MYSQL_USER || "interaqt",
    password: process.env.MYSQL_PASSWORD || "interaqt",
};

describe.skipIf(!MYSQL_ENABLED)("MySQL _IDS_ counter reconciliation (r32)", () => {
    test("setup(false) advances a lost/lagging counter to MAX(id); internal kv constraints skip instead of failing setup", async () => {
        const database = `${process.env.INTERAQT_MYSQL_DATABASE!}_ids_reconcile`;
        const mk = () => Entity.create({ name: "R32MyIdsUser", properties: [Property.create({ name: "name", type: "string" })] });
        const db1 = new MysqlDB(database, config);
        const system1 = new MonoSystem(db1);
        const c1 = new Controller({ system: system1, entities: [mk()], relations: [] });
        // r31 回归面：内部 kv 唯一约束不再让 MySQL setup 崩溃
        await c1.setup(true);

        // 驱动级写入两行存量数据（MySQL transactions:false ⇒ storage.create 不可用）
        const recordInfo = (system1.storage as any).queryHandle.map.getRecordInfo("R32MyIdsUser");
        const idField: string = recordInfo.idField;
        const table: string = recordInfo.table;
        const nameField: string = recordInfo.data.attributes.name.field;
        const id1 = await db1.getAutoId("R32MyIdsUser");
        const id2 = await db1.getAutoId("R32MyIdsUser");
        await db1.insert(`INSERT INTO "${table}" ("${idField}", "${nameField}") VALUES (?, ?)`, [id1, "u1"], "seed u1");
        await db1.insert(`INSERT INTO "${table}" ("${idField}", "${nameField}") VALUES (?, ?)`, [id2, "u2"], "seed u2");
        // 模拟计数器丢失（手工导入/备份恢复的库）
        await db1.update(`DELETE FROM "_IDS_"`, [], undefined, "simulate counter loss");
        await db1.close();

        const db2 = new MysqlDB(database, config);
        const system2 = new MonoSystem(db2);
        const c2 = new Controller({ system: system2, entities: [mk()], relations: [] });
        await c2.setup(false);
        // 对账后发号从 MAX(id)+1 继续（此前：重新从 1 发号 ⇒ 与 u1 重复）
        const id3 = await db2.getAutoId("R32MyIdsUser");
        expect(Number(id3)).toBe(3);
        await db2.insert(`INSERT INTO "${table}" ("${idField}", "${nameField}") VALUES (?, ?)`, [id3, "u3"], "seed u3");
        // 计数器落后（非缺失）同样只向前推进
        await db2.update(`UPDATE "_IDS_" SET last = 1 WHERE name = 'R32MyIdsUser'`, [], undefined, "simulate lagging counter");
        await db2.close();

        const db3 = new MysqlDB(database, config);
        const system3 = new MonoSystem(db3);
        const c3 = new Controller({ system: system3, entities: [mk()], relations: [] });
        await c3.setup(false);
        expect(Number(await db3.getAutoId("R32MyIdsUser"))).toBe(4);
        await db3.close();
    });
});
