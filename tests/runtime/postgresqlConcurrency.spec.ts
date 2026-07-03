import { describe, expect, test } from 'vitest';
import { Entity, Property, Dictionary, Controller, MonoSystem, MatchExp, KlassByName, Relation, Custom, Interaction, Action, Payload, PayloadItem, ComputationResult, runWithTransactionRetry } from 'interaqt';
import { PostgreSQLDB } from '@drivers';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const describeIfPostgres = process.env.INTERAQT_POSTGRES_DATABASE ? describe : describe.skip;
// CAUTION 独占的数据库名（带后缀）。postgres 相关的 spec 文件会被 vitest 并行执行，
//  且各自 setup(true) 会 DROP DATABASE ... WITH (FORCE)，共享库名会互相摧毁数据。
const database = process.env.INTERAQT_POSTGRES_DATABASE ? `${process.env.INTERAQT_POSTGRES_DATABASE}_concurrency` : '';
const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

// CAUTION 与 worker 子进程共享的模型 fixture（见该模块内注释：manifest 依赖函数文本一致性）。
import {
  createAsyncReturnFixture,
  createFullReplaceFixture,
  createGlobalSummationFixture,
  createPropertyAggregateFixture,
  createStateMachineFixture,
  createTransformFixture,
} from './helpers/postgresConcurrencyFixtures.js';

const specDir = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(specDir, 'helpers/postgresConcurrencyWorker.ts');
const require = createRequire(import.meta.url);
const viteNodeEntry = path.resolve(path.dirname(require.resolve('vite-node/package.json')), 'vite-node.mjs');
const vitestConfigPath = path.resolve(specDir, '../../vitest.config.ts');

// CAUTION worker 子进程必须使用和 vitest 父进程完全相同的模块转换管线（vite-node，同一份配置）。
//  migration manifest 会对 computation 回调做 Function.prototype.toString() 哈希：
//  父进程用 vitest(vite/esbuild) 转换、worker 若用其他 loader（如 tsx，会压缩空白），
//  同一份源码会得到不同的函数文本 → modelHash 不一致 → setup(false) 正确地报
//  "Model manifest mismatch"。这不是伪造绕过，而是让父子进程真正运行同一份编译产物。
function execWorker(env: Record<string, string>) {
  return execFileAsync(
    process.execPath,
    [viteNodeEntry, '--config', vitestConfigPath, workerPath],
    {
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024,
    }
  );
}

function createBarrier(count: number) {
  let waiting = 0;
  let release!: () => void;
  const promise = new Promise<void>(resolve => {
    release = resolve;
  });

  return async () => {
    waiting++;
    if (waiting === count) release();
    await promise;
  };
}

describeIfPostgres('PostgreSQL computation concurrency', () => {
  test('allocates unique ids through sequences during concurrent creates', async () => {
    const sequenceEntity = Entity.create({
      name: 'PgSequenceItem',
      properties: [
        Property.create({ name: 'value', type: 'number' }),
      ],
    });

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [sequenceEntity],
      relations: [],
    });
    try {
      await controller.setup(true);

      const created = await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          system.storage.create('PgSequenceItem', { value: index })
        )
      );

      const ids = created.map(item => String(item.id));
      expect(new Set(ids).size).toBe(created.length);
      expect(ids).toContain('1');
    } finally {
      await system.destroy();
    }
  }, 120000);

  test('allocates unique ids for relation links through sequences', async () => {
    const User = Entity.create({
      name: 'PgSequenceUser',
      properties: [Property.create({ name: 'name', type: 'string' })],
    });
    const Project = Entity.create({
      name: 'PgSequenceProject',
      properties: [Property.create({ name: 'name', type: 'string' })],
    });
    const Membership = Relation.create({
      name: 'PgSequenceMembership',
      source: User,
      sourceProperty: 'memberships',
      target: Project,
      targetProperty: 'members',
      type: 'n:n',
      properties: [Property.create({ name: 'role', type: 'string' })],
    });

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [User, Project],
      relations: [Membership],
    });
    try {
      await controller.setup(true);

      const users = await Promise.all(Array.from({ length: 30 }, (_, index) => system.storage.create('PgSequenceUser', { name: `u${index}` })));
      const project = await system.storage.create('PgSequenceProject', { name: 'p' });
      const links = await Promise.all(
        users.map(user => system.storage.addRelationByNameById('PgSequenceMembership', user.id, project.id, { role: 'member' }))
      );

      const ids = links.map(link => String(link.id));
      expect(new Set(ids).size).toBe(links.length);
    } finally {
      await system.destroy();
    }
  }, 120000);

  test('initializes PostgreSQL sequences from legacy ids, table max, missing ids table, and shared physical tables', async () => {
    const MigrationItem = Entity.create({
      name: 'PgSequenceMigrationItem',
      properties: [Property.create({ name: 'value', type: 'number' })],
    });
    const BaseItem = Entity.create({
      name: 'PgSharedSequenceBaseItem',
      properties: [
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'value', type: 'number' }),
      ],
    });
    const ActiveItem = Entity.create({
      name: 'PgSharedSequenceActiveItem',
      baseEntity: BaseItem,
      matchExpression: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
    });

    let system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    let controller = new Controller({
      system,
      entities: [MigrationItem, BaseItem, ActiveItem],
      relations: [],
    });
    await controller.setup(true);
    await system.storage.create('PgSequenceMigrationItem', { value: 1 });
    await system.destroy();

    let rawDb = new PostgreSQLDB(database, dbOptions);
    await rawDb.open(false);
    await rawDb.scheme(`CREATE TABLE "_IDS_" ("last" INTEGER, "name" TEXT)`);
    await rawDb.scheme(`INSERT INTO "_IDS_" ("name", "last") VALUES ('PgSequenceMigrationItem', 50)`);
    await rawDb.close();

    system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    controller = new Controller({ system, entities: [MigrationItem, BaseItem, ActiveItem], relations: [] });
    await controller.setup(false);
    const afterLegacyHigh = await system.storage.create('PgSequenceMigrationItem', { value: 2 });
    expect(Number(afterLegacyHigh.id)).toBe(51);
    await system.destroy();

    rawDb = new PostgreSQLDB(database, dbOptions);
    await rawDb.open(false);
    await rawDb.scheme(`DELETE FROM "_IDS_" WHERE "name" = 'PgSequenceMigrationItem'`);
    await rawDb.scheme(`INSERT INTO "_IDS_" ("name", "last") VALUES ('PgSequenceMigrationItem', 10)`);
    await rawDb.close();

    system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    controller = new Controller({ system, entities: [MigrationItem, BaseItem, ActiveItem], relations: [] });
    await controller.setup(false);
    const afterTableHigh = await system.storage.create('PgSequenceMigrationItem', { value: 3 });
    expect(Number(afterTableHigh.id)).toBe(52);
    await system.destroy();

    rawDb = new PostgreSQLDB(database, dbOptions);
    await rawDb.open(false);
    await rawDb.scheme(`DROP TABLE "_IDS_"`);
    await rawDb.close();

    system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    controller = new Controller({ system, entities: [MigrationItem, BaseItem, ActiveItem], relations: [] });
    await controller.setup(false);
    const afterMissingIds = await system.storage.create('PgSequenceMigrationItem', { value: 4 });
    const sharedBase = await system.storage.create('PgSharedSequenceBaseItem', { status: 'inactive', value: 1 });
    const sharedActive = await system.storage.create('PgSharedSequenceActiveItem', { status: 'active', value: 2 });

    expect(Number(afterMissingIds.id)).toBe(53);
    expect(sharedBase.id).not.toBe(sharedActive.id);
    await system.destroy();
  }, 120000);

  test('runs 50 concurrent dispatches through Pool without transaction cross-talk', async () => {
    const EventRecord = Entity.create({
      name: 'PgPoolDispatchEvent',
      properties: [Property.create({ name: 'value', type: 'number' })],
    });
    const AddEvent = Interaction.create({
      name: 'pgPoolAddEvent',
      action: Action.create({ name: 'pgPoolAddEvent' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            type: 'Entity',
            name: 'event',
            base: EventRecord,
          }),
        ],
      }),
    });
    AddEvent.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create('PgPoolDispatchEvent', event.payload.event);
    };

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [EventRecord],
      relations: [],
      eventSources: [AddEvent],
    });

    try {
      await controller.setup(true);

      const responses = await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          controller.dispatch(AddEvent, {
            user: { id: 'pg-user' },
            payload: { event: { value: index } },
          })
        )
      );

      expect(responses.every(response => !response.error)).toBe(true);
      const records = await system.storage.find('PgPoolDispatchEvent', undefined, undefined, ['id']);
      expect(records).toHaveLength(50);
    } finally {
      await system.destroy();
    }
  }, 120000);

  test('runs concurrent serializable custom dispatches through retry', async () => {
    const Counter = Entity.create({
      name: 'PgSerializableDispatchCounter',
      properties: [Property.create({ name: 'value', type: 'number' })],
    });
    const AddCounter = Interaction.create({
      name: 'pgAddSerializableDispatchCounter',
      action: Action.create({ name: 'pgAddSerializableDispatchCounter' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({
            type: 'Entity',
            name: 'counter',
            base: Counter,
          }),
        ],
      }),
    });
    AddCounter.resolve = async function(this: Controller, event: any) {
      return this.system.storage.create('PgSerializableDispatchCounter', event.payload.counter);
    };

    const total = Dictionary.create({
      name: 'pgSerializableDispatchTotal',
      type: 'number',
      collection: false,
      computation: Custom.create({
        name: 'PgSerializableDispatchTotal',
        useLastValue: true,
        dataDeps: {
          counters: { type: 'records', source: Counter, attributeQuery: ['value'] },
        },
        // 增量计算只依赖 lastValue（每个 mutation +1），不需要额外的增量数据依赖
        incrementalDataDeps: [],
        incrementalCompute: async (lastValue: number) => (lastValue || 0) + 1,
        getInitialValue: () => 0,
      }),
    });

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Counter],
      relations: [],
      eventSources: [AddCounter],
      dict: [total],
    });
    try {
      await controller.setup(true);

      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          controller.dispatch(AddCounter, {
            user: { id: 'pg-user' },
            payload: { counter: { value: index } },
          })
        )
      );

      expect(responses.every(response => !response.error)).toBe(true);
      expect(await system.storage.dict.get('pgSerializableDispatchTotal')).toBe(8);
    } finally {
      await system.destroy();
    }
  }, 120000);

  test('handles a PostgreSQL async task only once across repeated workers', async () => {
    const Source = Entity.create({
      name: 'PgAsyncOnceSource',
      properties: [Property.create({ name: 'value', type: 'number' })],
    });

    const total = Dictionary.create({
      name: 'pgAsyncOnceTotal',
      type: 'number',
      collection: false,
      computation: Custom.create({
        name: 'PgAsyncOnceTotal',
        dataDeps: {
          sources: { type: 'records', source: Source, attributeQuery: ['value'] },
        },
        compute: async () => ComputationResult.async({ freshnessKey: 'pg-async-once' }),
        asyncReturn: async (result: number) => result,
      }),
    });

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: [Source],
      relations: [],
      dict: [total],
    });
    try {
      await controller.setup(true);

      await system.storage.create('PgAsyncOnceSource', { value: 1 });
      const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
        item => item.dataContext.type === 'global' && item.dataContext.id.name === 'pgAsyncOnceTotal'
      ) as any;
      const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation);
      const task = (await system.storage.find(taskRecordName, undefined, undefined, ['*']))[0];
      await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', task.id] }), {
        status: 'success',
        result: 17,
      });

      const [first, second] = await Promise.all([
        controller.scheduler.handleAsyncReturn(computation, { id: task.id }),
        controller.scheduler.handleAsyncReturn(computation, { id: task.id }),
      ]);
      const skippedCount = [first, second].filter(result => result.skipped).length;
      const appliedCount = [first, second].filter(result => !result.skipped).length;

      expect(appliedCount).toBe(1);
      expect(skippedCount).toBe(1);
      expect(await system.storage.dict.get('pgAsyncOnceTotal')).toBe(17);
    } finally {
      await system.destroy();
    }
  }, 120000);

  test('keeps property aggregate computations consistent across worker processes', async () => {
    const fixture = createPropertyAggregateFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
    });

    await controller.setup(true);
    const user = await system.storage.create('PgAggregateUser', { name: 'aggregate-user' });
    await system.destroy();
    const workerCount = 4;
    const iterations = 12;

    await Promise.all(
      Array.from({ length: workerCount }, (_, workerIndex) =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_WORKER_MODE: 'property-aggregate',
          INTERAQT_POSTGRES_USER_ID: String(user.id),
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
          INTERAQT_POSTGRES_ITERATIONS: String(iterations),
        })
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
    });
    await verifyController.setup(false);

    const orders = await verifySystem.storage.find('PgAggregateOrder', undefined, undefined, ['amount', 'weight']);
    const aggregateUser = await verifySystem.storage.findOne(
      'PgAggregateUser',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['*']
    );
    const total = orders.reduce((sum, order) => sum + order.amount, 0);
    const weightedTotal = orders.reduce((sum, order) => sum + order.amount * order.weight, 0);

    expect(aggregateUser.orderCount).toBe(workerCount * iterations);
    expect(aggregateUser.orderTotal).toBe(total);
    expect(aggregateUser.orderAverage).toBe(total / orders.length);
    expect(aggregateUser.allPositive).toBe(true);
    expect(aggregateUser.hasLargeOrder).toBe(true);
    expect(aggregateUser.weightedTotal).toBe(weightedTotal);
    await verifySystem.destroy();
  }, 120000);

  test('keeps property aggregate computations consistent during concurrent updates and deletes', async () => {
    const fixture = createPropertyAggregateFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
    });

    await controller.setup(true);
    const user = await system.storage.create('PgAggregateUser', { name: 'aggregate-update-delete-user' });
    const orders: Array<{ id: string }> = [];
    for (let index = 0; index < 24; index++) {
      orders.push(await system.storage.create('PgAggregateOrder', {
        amount: 1000,
        weight: 1,
        buyer: { id: user.id },
      }));
    }
    await system.destroy();
    const chunks = [orders.slice(0, 8), orders.slice(8, 16), orders.slice(16, 24)];
    await Promise.all(
      chunks.map((chunk, workerIndex) =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_WORKER_MODE: 'property-aggregate-update',
          INTERAQT_POSTGRES_ORDER_IDS: JSON.stringify(chunk.map(order => order.id)),
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
        })
      )
    );
    await Promise.all(
      chunks.slice(0, 2).map((chunk, workerIndex) =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_WORKER_MODE: 'property-aggregate-delete',
          INTERAQT_POSTGRES_ORDER_IDS: JSON.stringify(chunk.map(order => order.id)),
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
        })
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
    });
    await verifyController.setup(false);
    const remainingOrders = await verifySystem.storage.find('PgAggregateOrder', undefined, undefined, ['amount', 'weight']);
    const aggregateUser = await verifySystem.storage.findOne(
      'PgAggregateUser',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['*']
    );
    const total = remainingOrders.reduce((sum, order) => sum + order.amount, 0);
    const weightedTotal = remainingOrders.reduce((sum, order) => sum + order.amount * order.weight, 0);

    expect(remainingOrders).toHaveLength(8);
    expect(aggregateUser.orderCount).toBe(8);
    expect(aggregateUser.orderTotal).toBe(total);
    expect(aggregateUser.orderAverage).toBe(total / remainingOrders.length);
    expect(aggregateUser.allPositive).toBe(true);
    expect(aggregateUser.hasLargeOrder).toBe(true);
    expect(aggregateUser.weightedTotal).toBe(weightedTotal);
    await verifySystem.destroy();
  }, 120000);

  test('serializes concurrent state machine transitions across worker processes', async () => {
    const fixture = createStateMachineFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
    });

    await controller.setup(true);
    const order = await system.storage.create('PgStateOrder', { title: 'state-order' });
    await system.destroy();

    await Promise.all(
      ['approve', 'reject'].map((action, workerIndex) =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_WORKER_MODE: 'state-machine',
          INTERAQT_POSTGRES_ORDER_ID: String(order.id),
          INTERAQT_POSTGRES_STATE_ACTION: action,
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
        })
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
    });
    await verifyController.setup(false);
    const verifiedOrder = await verifySystem.storage.findOne(
      'PgStateOrder',
      MatchExp.atom({ key: 'id', value: ['=', order.id] }),
      undefined,
      ['status']
    );

    expect(['approved', 'rejected']).toContain(verifiedOrder.status);
    await verifySystem.destroy();
  }, 120000);

  test('keeps transform mapped records aligned during concurrent source updates', async () => {
    const fixture = createTransformFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
    });

    await controller.setup(true);
    const source = await system.storage.create('PgTransformSource', { items: 2 });
    await system.destroy();
    await Promise.all(
      Array.from({ length: 4 }, (_, workerIndex) =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_WORKER_MODE: 'transform',
          INTERAQT_POSTGRES_SOURCE_ID: String(source.id),
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
          INTERAQT_POSTGRES_ITERATIONS: '6',
        })
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
    });
    await verifyController.setup(false);

    const verifiedSource = await verifySystem.storage.findOne(
      'PgTransformSource',
      MatchExp.atom({ key: 'id', value: ['=', source.id] }),
      undefined,
      ['items']
    );
    const derived = await verifySystem.storage.find('PgTransformDerived', undefined, undefined, ['idx']);

    expect(derived).toHaveLength(1);
    expect(derived[0].idx).toBe(verifiedSource.items);
    await verifySystem.destroy();
  }, 120000);

  test('keeps transform mapped records aligned during concurrent update/delete and installs unique index', async () => {
    const fixture = createTransformFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
    });

    await controller.setup(true);
    const source = await system.storage.create('PgTransformSource', { items: 3 });
    const indexRows = await (system.storage as any).db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'PgTransformDerived' AND indexname LIKE 'idx_transform_%'`,
      [],
      'verify transform unique index'
    );
    expect(indexRows.length).toBeGreaterThan(0);
    const mappedBefore = (await system.storage.find('PgTransformDerived', undefined, undefined, ['*']))[0];
    const stateKeys = Object.keys(mappedBefore).filter(key => key !== 'id' && key !== 'idx');
    const sourceRecordIdKey = stateKeys.find(key => String(mappedBefore[key]) === String(source.id));
    const transformIndexKey = stateKeys.find(key => mappedBefore[key] === 0);
    expect(sourceRecordIdKey).toBeTruthy();
    expect(transformIndexKey).toBeTruthy();
    await expect(system.storage.create('PgTransformDerived', {
      idx: 999,
      [sourceRecordIdKey!]: mappedBefore[sourceRecordIdKey!],
      [transformIndexKey!]: mappedBefore[transformIndexKey!],
    })).rejects.toThrow();
    await system.destroy();
    await Promise.all([
      execWorker({
        INTERAQT_POSTGRES_DATABASE: database,
        INTERAQT_POSTGRES_WORKER_MODE: 'transform',
        INTERAQT_POSTGRES_SOURCE_ID: String(source.id),
        INTERAQT_POSTGRES_WORKER_INDEX: '10',
        INTERAQT_POSTGRES_ITERATIONS: '6',
      }),
      execWorker({
        INTERAQT_POSTGRES_DATABASE: database,
        INTERAQT_POSTGRES_WORKER_MODE: 'transform-delete',
        INTERAQT_POSTGRES_SOURCE_ID: String(source.id),
        INTERAQT_POSTGRES_WORKER_DELAY: '20',
      }),
    ]);

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
    });
    await verifyController.setup(false);

    const sourceAfter = await verifySystem.storage.findOne(
      'PgTransformSource',
      MatchExp.atom({ key: 'id', value: ['=', source.id] }),
      undefined,
      ['id']
    );
    const derived = await verifySystem.storage.find('PgTransformDerived', undefined, undefined, ['idx']);

    expect(sourceAfter).toBeUndefined();
    expect(derived).toHaveLength(0);
    await verifySystem.destroy();
  }, 120000);

  test('handles the same PostgreSQL async task once across worker processes', async () => {
    const fixture = createAsyncReturnFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
      dict: fixture.dict,
    });
    await controller.setup(true);

    await system.storage.create('PgAsyncWorkerSource', { value: 1 });
    const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
      item => item.dataContext.type === 'global' && item.dataContext.id.name === 'pgAsyncWorkerTotal'
    ) as any;
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation);
    const task = (await system.storage.find(taskRecordName, undefined, undefined, ['*']))[0];
    await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', task.id] }), {
      status: 'success',
      result: 31,
    });
    await system.destroy();
    await Promise.all(
      [1, 2].map(workerIndex =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_WORKER_MODE: 'async-return',
          INTERAQT_POSTGRES_TASK_ID: String(task.id),
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex),
        })
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
      dict: fixture.dict,
    });
    await verifyController.setup(false);
    const handledTask = await verifySystem.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', task.id] }), undefined, ['status']);

    expect(handledTask.status).toBe('applied');
    expect(await verifySystem.storage.dict.get('pgAsyncWorkerTotal')).toBe(31);
    await verifySystem.destroy();
  }, 120000);

  test('skips stale async tasks when a newer dispatch wins concurrently', async () => {
    const fixture = createAsyncReturnFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
      dict: fixture.dict,
    });
    await controller.setup(true);

    await system.storage.create('PgAsyncWorkerSource', { value: 1 });
    const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
      item => item.dataContext.type === 'global' && item.dataContext.id.name === 'pgAsyncWorkerTotal'
    ) as any;
    const taskRecordName = controller.scheduler.getAsyncTaskRecordKey(computation);
    const oldTask = (await system.storage.find(taskRecordName, undefined, { orderBy: { id: 'ASC' } }, ['*']))[0];
    await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', oldTask.id] }), {
      status: 'success',
      result: 11,
    });
    const oldWorker = execWorker({
      INTERAQT_POSTGRES_DATABASE: database,
      INTERAQT_POSTGRES_WORKER_MODE: 'async-return',
      INTERAQT_POSTGRES_TASK_ID: String(oldTask.id),
      INTERAQT_POSTGRES_WORKER_DELAY: '30',
    });
    const dispatchResult = await controller.dispatch(fixture.AddSource, {
      user: { id: 'pg-async-dispatch-user' },
      payload: { source: { value: 2 } },
    });
    expect(dispatchResult.error).toBeUndefined();
    await oldWorker;

    const tasksAfterDispatch = await system.storage.find(taskRecordName, undefined, { orderBy: { id: 'ASC' } }, ['*']);
    const latestTask = tasksAfterDispatch[tasksAfterDispatch.length - 1];
    await system.storage.update(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', latestTask.id] }), {
      status: 'success',
      result: 55,
    });
    const latestResult = await controller.scheduler.handleAsyncReturn(computation, { id: latestTask.id });
    const oldTaskAfter = await system.storage.findOne(taskRecordName, MatchExp.atom({ key: 'id', value: ['=', oldTask.id] }), undefined, ['status']);

    expect(oldTaskAfter.status).toBe('skipped');
    expect(latestResult).toEqual({ skipped: false });
    expect(await system.storage.dict.get('pgAsyncWorkerTotal')).toBe(55);
    await system.destroy();
  }, 120000);

  test('retries real PostgreSQL serialization failures and deadlocks', async () => {
    const db = new PostgreSQLDB(database, dbOptions);
    await db.open(true);

    try {
      await db.scheme('CREATE TABLE "PgRetryCounter" ("id" INT PRIMARY KEY, "value" INT NOT NULL)');
      await db.scheme('INSERT INTO "PgRetryCounter" ("id", "value") VALUES (1, 0)');
      const serializationBarrier = createBarrier(2);
      let serializationAttempts = 0;
      const serializableIncrement = () =>
        runWithTransactionRetry('pg-real-40001', async (_isolation, attempt) => {
          serializationAttempts++;
          return db.runInTransaction({ isolation: 'SERIALIZABLE' }, async () => {
            const rows = await db.query<{ value: number }>('SELECT "value" FROM "PgRetryCounter" WHERE "id" = 1');
            if (attempt === 1) await serializationBarrier();
            await db.scheme(`UPDATE "PgRetryCounter" SET "value" = ${Number(rows[0].value) + 1} WHERE "id" = 1`);
          });
        });

      await Promise.all([serializableIncrement(), serializableIncrement()]);
      const serializationRows = await db.query<{ value: number }>('SELECT "value" FROM "PgRetryCounter" WHERE "id" = 1');
      expect(Number(serializationRows[0].value)).toBe(2);
      expect(serializationAttempts).toBeGreaterThan(2);

      await db.scheme('CREATE TABLE "PgDeadlockCounter" ("id" INT PRIMARY KEY, "value" INT NOT NULL)');
      await db.scheme('INSERT INTO "PgDeadlockCounter" ("id", "value") VALUES (1, 0), (2, 0)');
      const deadlockBarrier = createBarrier(2);
      let deadlockAttempts = 0;
      const deadlockIncrement = (firstId: number, secondId: number) =>
        runWithTransactionRetry('pg-real-40P01', async (_isolation, attempt) => {
          deadlockAttempts++;
          return db.runInTransaction({ isolation: 'READ COMMITTED' }, async () => {
            await db.scheme(`UPDATE "PgDeadlockCounter" SET "value" = "value" + 1 WHERE "id" = ${firstId}`);
            if (attempt === 1) await deadlockBarrier();
            await db.scheme(`UPDATE "PgDeadlockCounter" SET "value" = "value" + 1 WHERE "id" = ${secondId}`);
          });
        });

      await Promise.all([deadlockIncrement(1, 2), deadlockIncrement(2, 1)]);
      const deadlockRows = await db.query<{ value: number }>('SELECT "value" FROM "PgDeadlockCounter" ORDER BY "id"');
      expect(deadlockRows.map(row => Number(row.value))).toEqual([2, 2]);
      expect(deadlockAttempts).toBeGreaterThan(2);
    } finally {
      await db.close();
    }
  }, 120000);

  test('keeps entity and relation full replace equivalent to a serial order across worker processes', async () => {
    const fixture = createFullReplaceFixture();
    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
    });
    await controller.setup(true);
    const lefts = [
      await system.storage.create('PgReplaceLeft', { name: 'left-1' }),
      await system.storage.create('PgReplaceLeft', { name: 'left-2' }),
    ];
    const rights = [
      await system.storage.create('PgReplaceRight', { name: 'right-1' }),
      await system.storage.create('PgReplaceRight', { name: 'right-2' }),
    ];
    await system.destroy();
    await Promise.all([1, 2].map(workerIndex =>
      execWorker({
        INTERAQT_POSTGRES_DATABASE: database,
        INTERAQT_POSTGRES_WORKER_MODE: 'full-replace-entity',
        INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex),
      })
    ));

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
      eventSources: fixture.eventSources,
    });
    await verifyController.setup(false);
    const entityResults = await verifySystem.storage.find('PgReplaceResult', undefined, undefined, ['value']);
    const relationResults = await verifySystem.storage.find('PgReplaceRelation', undefined, undefined, ['value']);
    const entityValues = entityResults.map(row => row.value).sort((a, b) => a - b);
    const relationValues = relationResults.map(row => row.value).sort((a, b) => a - b);

    expect(entityValues).toEqual([100, 200]);
    expect(relationResults).toHaveLength(2);
    expect(relationValues).toEqual([100, 200]);
    await verifySystem.destroy();
  }, 120000);

  test('keeps global summation consistent across worker processes', async () => {
    const fixture = createGlobalSummationFixture();

    const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system,
      entities: fixture.entities,
      relations: fixture.relations,
      dict: fixture.dict,
    });

    await controller.setup(true);

    const counters: Array<{ id: string }> = [];
    for (let index = 0; index < 8; index++) {
      counters.push(await system.storage.create('PgAtomicCounter', { value: 0 }));
    }
    await system.destroy();
    const workerCount = 4;
    const iterations = 20;

    await Promise.all(
      Array.from({ length: workerCount }, (_, workerIndex) =>
        execWorker({
          INTERAQT_POSTGRES_DATABASE: database,
          INTERAQT_POSTGRES_COUNTER_IDS: JSON.stringify(counters.map(counter => counter.id)),
          INTERAQT_POSTGRES_WORKER_INDEX: String(workerIndex + 1),
          INTERAQT_POSTGRES_ITERATIONS: String(iterations),
        })
      )
    );

    const verifySystem = new MonoSystem(new PostgreSQLDB(database, dbOptions));
    verifySystem.conceptClass = KlassByName;
    const verifyController = new Controller({
      system: verifySystem,
      entities: fixture.entities,
      relations: fixture.relations,
      dict: fixture.dict,
    });
    await verifyController.setup(false);

    const records = await verifySystem.storage.find('PgAtomicCounter', undefined, undefined, ['value']);
    const scannedTotal = records.reduce((sum, record) => sum + record.value, 0);
    const computedTotal = await verifySystem.storage.dict.get('pgAtomicTotal');

    expect(computedTotal).toBe(scannedTotal);
    await verifySystem.destroy();
  }, 120000);
});
