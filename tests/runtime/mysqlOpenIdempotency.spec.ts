import { describe, expect, test } from "vitest";
import { MysqlDB } from '@drivers';
import mysql from 'mysql2/promise';

/**
 * r25 I-2：MySQL 驱动 open() 幂等性——四驱动连接管理不变量的最后一格。
 *
 * `Controller.setup(false)` 的固定调用序列是 prepareMigrationSchema（openForSchemaRead）
 * → system.setup（open(false)）。PG（`if (!this.pool)`）、SQLite（r22 I-5）、PGLite（no-op）
 * 都有幂等守卫；MySQL 此前每次 open() 无条件 createConnection 且不 end() 旧连接——
 * 旧工作连接被孤儿化，悬挂到服务端 wait_timeout（长驻进程多次 setup/迁移下连接耗尽）。
 *
 * 需要真实 MySQL：设置 INTERAQT_MYSQL_DATABASE（如 r25_open_idem）与
 * MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD（默认 127.0.0.1/interaqt/interaqt），未设置时跳过
 * （与 postgresql* 套件的 env-gate 约定一致——沉睡面见 r24 复盘教训）。
 */
const MYSQL_ENABLED = !!process.env.INTERAQT_MYSQL_DATABASE;

const config = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'interaqt',
  password: process.env.MYSQL_PASSWORD || 'interaqt',
};

// CAUTION 连接计数按**本套件独占的 database** 过滤（processlist.DB = 连接的默认库），
//  不能按 user 过滤：其他 MySQL env-gated 套件与本套件共用同一 MySQL 用户，并行运行时
//  它们的连接会污染计数（r28 记录的并行互扰假红，r32 收口——每个套件的库名唯一）。
//  admin 连接不带默认库，天然排除。
async function countConnections(database: string) {
  const admin = await mysql.createConnection(config);
  const [rows] = await admin.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.processlist WHERE user = ? AND db = ? AND command != 'Query'`,
    [config.user, database]
  );
  await admin.end();
  return Number((rows as Array<{ cnt: unknown }>)[0].cnt);
}

describe.skipIf(!MYSQL_ENABLED)('MySQL open() idempotency (r25 I-2)', () => {
  test('openForSchemaRead → open(false) → open(false) reuses the working connection', async () => {
    const database = `${process.env.INTERAQT_MYSQL_DATABASE!}_open_idem`
    // openForSchemaRead 契约要求库已存在（对应 setup(false) 之前已 install 过的场景）。
    const admin = await mysql.createConnection(config);
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, '``')}\``);
    await admin.end();

    const db = new MysqlDB(database, config);
    await db.openForSchemaRead();
    const afterSchemaRead = await countConnections(database);

    await db.open(false);
    const afterOpen = await countConnections(database);
    // 复用连接：不新增
    expect(afterOpen).toBe(afterSchemaRead);

    await db.open(false);
    expect(await countConnections(database)).toBe(afterSchemaRead);

    // 复用路径上框架表必须完成初始化（openForSchemaRead 刻意跳过 _IDS_）
    const ids = await db.query<{ cnt: unknown }>(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = '_IDS_'`,
      [database],
      'check ids table'
    );
    expect(Number(ids[0].cnt)).toBe(1);

    // forceDrop：关旧连接、重建库，同样不泄漏
    await db.open(true);
    expect(await countConnections(database)).toBeLessThanOrEqual(afterOpen);
    const probe = await db.query<{ ok: number }>('SELECT 1 AS ok', [], 'probe');
    expect(probe[0].ok).toBe(1);

    await db.close();
  }, 30000);
});
