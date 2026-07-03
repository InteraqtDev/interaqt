import {
  Controller,
  KlassByName,
  MatchExp,
  MonoSystem,
} from 'interaqt';
import { PostgreSQLDB } from '@drivers';
// CAUTION 模型定义必须与 vitest 父进程共享同一个模块（并通过同一转换管线执行），
//  否则 migration manifest 的函数文本哈希会不一致，setup(false) 会报 "Model manifest mismatch"。
import {
  createAsyncReturnFixture,
  createFullReplaceFixture,
  createGlobalSummationFixture,
  createPropertyAggregateFixture,
  createStateMachineFixture,
  createTransformFixture,
} from './postgresConcurrencyFixtures.js';

const database = process.env.INTERAQT_POSTGRES_DATABASE!;
const mode = process.env.INTERAQT_POSTGRES_WORKER_MODE || 'global-summation';
const workerIndex = Number(process.env.INTERAQT_POSTGRES_WORKER_INDEX || 0);
const iterations = Number(process.env.INTERAQT_POSTGRES_ITERATIONS || 10);
const workerDelay = Number(process.env.INTERAQT_POSTGRES_WORKER_DELAY || 0);

const dbOptions = {
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
};

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runGlobalSummationWorker() {
  const ids = JSON.parse(process.env.INTERAQT_POSTGRES_COUNTER_IDS || '[]') as string[];
  const fixture = createGlobalSummationFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  for (let iteration = 1; iteration <= iterations; iteration++) {
    for (const id of ids) {
      await system.storage.update(
        'PgAtomicCounter',
        MatchExp.atom({ key: 'id', value: ['=', id] }),
        { value: workerIndex * 100000 + iteration }
      );
    }
  }

  await system.destroy();
}

async function runPropertyAggregateWorker() {
  const userId = process.env.INTERAQT_POSTGRES_USER_ID!;
  const fixture = createPropertyAggregateFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  for (let iteration = 1; iteration <= iterations; iteration++) {
    await system.storage.create('PgAggregateOrder', {
      amount: 1000,
      weight: workerIndex,
      buyer: { id: userId },
    });
  }

  await system.destroy();
}

async function runPropertyAggregateUpdateWorker() {
  const orderIds = JSON.parse(process.env.INTERAQT_POSTGRES_ORDER_IDS || '[]') as string[];
  const fixture = createPropertyAggregateFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  for (const id of orderIds) {
    await system.storage.update(
      'PgAggregateOrder',
      MatchExp.atom({ key: 'id', value: ['=', id] }),
      { amount: 1024, weight: workerIndex + 1 }
    );
  }

  await system.destroy();
}

async function runPropertyAggregateDeleteWorker() {
  const orderIds = JSON.parse(process.env.INTERAQT_POSTGRES_ORDER_IDS || '[]') as string[];
  const fixture = createPropertyAggregateFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  for (const id of orderIds) {
    await system.storage.delete('PgAggregateOrder', MatchExp.atom({ key: 'id', value: ['=', id] }));
  }

  await system.destroy();
}

async function runStateMachineWorker() {
  const orderId = process.env.INTERAQT_POSTGRES_ORDER_ID!;
  const action = process.env.INTERAQT_POSTGRES_STATE_ACTION!;
  const fixture = createStateMachineFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  await controller.dispatch(action === 'approve' ? fixture.Approve : fixture.Reject, {
    user: { id: `pg-state-worker-${workerIndex}` },
    payload: { order: { id: orderId } },
  });

  await system.destroy();
}

async function runTransformWorker() {
  const sourceId = process.env.INTERAQT_POSTGRES_SOURCE_ID!;
  const fixture = createTransformFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  for (let iteration = 1; iteration <= iterations; iteration++) {
    await system.storage.update(
      'PgTransformSource',
      MatchExp.atom({ key: 'id', value: ['=', sourceId] }),
      { items: workerIndex + iteration }
    );
  }

  await system.destroy();
}

async function runTransformDeleteWorker() {
  const sourceId = process.env.INTERAQT_POSTGRES_SOURCE_ID!;
  const fixture = createTransformFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);

  if (workerDelay) await delay(workerDelay);
  await system.storage.delete('PgTransformSource', MatchExp.atom({ key: 'id', value: ['=', sourceId] }));
  await system.destroy();
}

async function runAsyncReturnWorker() {
  const taskId = process.env.INTERAQT_POSTGRES_TASK_ID!;
  const fixture = createAsyncReturnFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, ...fixture });
  await controller.setup(false);
  const computation = Array.from(controller.scheduler.computationsHandles.values()).find(
    item => item.dataContext.type === 'global' && item.dataContext.id.name === 'pgAsyncWorkerTotal'
  ) as any;

  if (workerDelay) await delay(workerDelay);
  await controller.scheduler.handleAsyncReturn(computation, { id: taskId });
  await system.destroy();
}

async function runFullReplaceEntityWorker() {
  const fixture = createFullReplaceFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, entities: fixture.entities, relations: fixture.relations, eventSources: fixture.eventSources });
  await controller.setup(false);

  const response = await controller.dispatch(fixture.AddTrigger, {
    user: { id: `pg-replace-worker-${workerIndex}` },
    payload: { trigger: { value: workerIndex * 100 } },
  });
  if (response.error) throw response.error;
  await system.destroy();
}

async function runFullReplaceRelationWorker() {
  const fixture = createFullReplaceFixture();
  const system = new MonoSystem(new PostgreSQLDB(database, dbOptions));
  system.conceptClass = KlassByName;
  const controller = new Controller({ system, entities: fixture.entities, relations: fixture.relations, eventSources: fixture.eventSources });
  await controller.setup(false);

  const response = await controller.dispatch(fixture.AddTrigger, {
    user: { id: `pg-replace-relation-worker-${workerIndex}` },
    payload: { trigger: { value: workerIndex * 100 } },
  });
  if (response.error) throw response.error;
  await system.destroy();
}

switch (mode) {
  case 'global-summation':
    await runGlobalSummationWorker();
    break;
  case 'property-aggregate':
    await runPropertyAggregateWorker();
    break;
  case 'property-aggregate-update':
    await runPropertyAggregateUpdateWorker();
    break;
  case 'property-aggregate-delete':
    await runPropertyAggregateDeleteWorker();
    break;
  case 'state-machine':
    await runStateMachineWorker();
    break;
  case 'transform':
    await runTransformWorker();
    break;
  case 'transform-delete':
    await runTransformDeleteWorker();
    break;
  case 'async-return':
    await runAsyncReturnWorker();
    break;
  case 'full-replace-entity':
    await runFullReplaceEntityWorker();
    break;
  case 'full-replace-relation':
    await runFullReplaceRelationWorker();
    break;
  default:
    throw new Error(`Unknown PostgreSQL concurrency worker mode: ${mode}`);
}
