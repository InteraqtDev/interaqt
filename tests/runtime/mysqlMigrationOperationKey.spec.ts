import { describe, expect, test } from "vitest";
import { MysqlDB } from '@drivers';
import { MonoSystem } from '@runtime';
import mysql from 'mysql2/promise';

/**
 * r27 I-3：MySQL 迁移 operationKey 的 sha256 代理键接线。
 *
 * r26 把迁移簿记表的键列改为 VARCHAR(191)（MySQL TEXT 不能做主键）并**声称**在 MySQL 上以
 * sha256 代理键存储，但归一化 helper 从未被 read/write 路径调用（死代码）。operationKey 是
 * 内容寻址键（`content#occurrence`，content 携带完整 DDL 文本），CREATE TABLE 语句轻松超过
 * 191 字符；驱动 `SET sql_mode='ANSI_QUOTES'` 替换掉了 STRICT_TRANS_TABLES——超长键被
 * **静默截断**：不同操作截到同一前缀即主键碰撞（第二个操作被误判已完成 → DDL 静默跳过），
 * resume 判定（isMigrationOperationComplete 用全长键查询）恒 miss → 幂等性失效。
 *
 * 需要真实 MySQL：设置 INTERAQT_MYSQL_DATABASE（与 mysqlOpenIdempotency 同一 env-gate 约定）。
 */
const MYSQL_ENABLED = !!process.env.INTERAQT_MYSQL_DATABASE;

const config = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'interaqt',
  password: process.env.MYSQL_PASSWORD || 'interaqt',
};

describe.skipIf(!MYSQL_ENABLED)('MySQL migration operation key sha256 surrogate (r27 I-3)', () => {
  test('mark + isComplete round-trips keys longer than VARCHAR(191); distinct long keys with a shared 191-char prefix do not collide', async () => {
    const database = `${process.env.INTERAQT_MYSQL_DATABASE!}_opkey`;
    const admin = await mysql.createConnection(config);
    await admin.query(`DROP DATABASE IF EXISTS \`${database.replace(/`/g, '``')}\``);
    await admin.query(`CREATE DATABASE \`${database.replace(/`/g, '``')}\``);
    await admin.end();

    const db = new MysqlDB(database, config);
    await db.open(false);
    const system = new MonoSystem(db);
    // 簿记表初始化 + 读写路径（ensureMigrationManifestTable 在两个方法内部幂等执行）
    const migrationId = 'r27-opkey-test';

    // 400+ 字符的内容寻址键（真实迁移中 CREATE TABLE 的 content key 形态）
    const sharedPrefix = `schema:create-table:VeryLongTable:${'col_'.repeat(60)}`;
    expect(sharedPrefix.length).toBeGreaterThan(191);
    const keyA = `${sharedPrefix}:variantA#0`;
    const keyB = `${sharedPrefix}:variantB#0`;

    expect(await system.isMigrationOperationComplete(migrationId, keyA)).toBe(false);
    await system.markMigrationOperationComplete(migrationId, keyA);
    // 全长键 round-trip：resume 判定必须命中（修复前：截断写入 + 全长查询恒 miss）
    expect(await system.isMigrationOperationComplete(migrationId, keyA)).toBe(true);

    // 共享 191 前缀的不同键不得碰撞（修复前：截断到同一主键，B 被误判已完成/或 INSERT 主键冲突）
    expect(await system.isMigrationOperationComplete(migrationId, keyB)).toBe(false);
    await system.markMigrationOperationComplete(migrationId, keyB);
    expect(await system.isMigrationOperationComplete(migrationId, keyB)).toBe(true);

    // 幂等重放（resume 语义）不抛错
    await system.markMigrationOperationComplete(migrationId, keyA);
    expect(await system.isMigrationOperationComplete(migrationId, keyA)).toBe(true);

    await db.close();
  }, 30000);
});
