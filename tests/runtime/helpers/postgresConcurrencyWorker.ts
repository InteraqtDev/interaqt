import {
  Action,
  Any,
  Average,
  Controller,
  Count,
  Custom,
  ComputationResult,
  Dictionary,
  Entity,
  Every,
  Interaction,
  InteractionEventEntity,
  KlassByName,
  MatchExp,
  MonoSystem,
  Payload,
  PayloadItem,
  Property,
  Relation,
  StateMachine,
  StateNode,
  StateTransfer,
  Summation,
  Transform,
  WeightedSummation,
} from 'interaqt';
import { PostgreSQLDB } from '@drivers';

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

function createGlobalSummationFixture() {
  const counterEntity = Entity.create({
    name: 'PgAtomicCounter',
    properties: [Property.create({ name: 'value', type: 'number' })],
  });

  const totalDictionary = Dictionary.create({
    name: 'pgAtomicTotal',
    type: 'number',
    collection: false,
    computation: Summation.create({
      record: counterEntity,
      attributeQuery: ['value'],
    }),
  });

  return { entities: [counterEntity], relations: [], dict: [totalDictionary] };
}

function createPropertyAggregateFixture() {
  const User = Entity.create({
    name: 'PgAggregateUser',
    properties: [Property.create({ name: 'name', type: 'string' })],
  });
  const Order = Entity.create({
    name: 'PgAggregateOrder',
    properties: [
      Property.create({ name: 'amount', type: 'number' }),
      Property.create({ name: 'weight', type: 'number' }),
    ],
  });

  User.properties.push(
    Property.create({
      name: 'orderCount',
      type: 'number',
      computation: Count.create({ property: 'orders' }),
    }),
    Property.create({
      name: 'orderTotal',
      type: 'number',
      computation: Summation.create({ property: 'orders', attributeQuery: ['amount'] }),
    }),
    Property.create({
      name: 'orderAverage',
      type: 'number',
      computation: Average.create({ property: 'orders', attributeQuery: ['amount'] }),
    }),
    Property.create({
      name: 'allPositive',
      type: 'boolean',
      computation: Every.create({
        property: 'orders',
        attributeQuery: ['amount'],
        callback: (order: any) => order.amount > 0,
      }),
    }),
    Property.create({
      name: 'hasLargeOrder',
      type: 'boolean',
      computation: Any.create({
        property: 'orders',
        attributeQuery: ['amount'],
        callback: (order: any) => order.amount >= 1000,
      }),
    }),
    Property.create({
      name: 'weightedTotal',
      type: 'number',
      computation: WeightedSummation.create({
        property: 'orders',
        attributeQuery: ['amount', 'weight'],
        callback: (order: any) => ({ value: order.amount || 0, weight: order.weight || 0 }),
      }),
    })
  );

  const UserOrder = Relation.create({
    name: 'PgAggregateUserOrder',
    source: User,
    sourceProperty: 'orders',
    target: Order,
    targetProperty: 'buyer',
    type: '1:n',
  });

  return { entities: [User, Order], relations: [UserOrder], dict: [] };
}

function createStateMachineFixture() {
  const Order = Entity.create({
    name: 'PgStateOrder',
    properties: [Property.create({ name: 'title', type: 'string' })],
  });
  const Approve = Interaction.create({
    name: 'pgApproveOrder',
    action: Action.create({ name: 'pgApproveOrder' }),
    payload: Payload.create({
      items: [PayloadItem.create({ name: 'order', type: 'Entity', base: Order, isRef: true })],
    }),
  });
  const Reject = Interaction.create({
    name: 'pgRejectOrder',
    action: Action.create({ name: 'pgRejectOrder' }),
    payload: Payload.create({
      items: [PayloadItem.create({ name: 'order', type: 'Entity', base: Order, isRef: true })],
    }),
  });
  const pending = StateNode.create({ name: 'pending' });
  const approved = StateNode.create({ name: 'approved' });
  const rejected = StateNode.create({ name: 'rejected' });
  Order.properties.push(Property.create({
    name: 'status',
    type: 'string',
    computation: StateMachine.create({
      states: [pending, approved, rejected],
      initialState: pending,
      transfers: [
        StateTransfer.create({
          trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: Approve.name } },
          current: pending,
          next: approved,
          computeTarget: (event: any) => ({ id: event.record.payload.order.id }),
        }),
        StateTransfer.create({
          trigger: { recordName: InteractionEventEntity.name, type: 'create', record: { interactionName: Reject.name } },
          current: pending,
          next: rejected,
          computeTarget: (event: any) => ({ id: event.record.payload.order.id }),
        }),
      ],
    }),
  }));

  return { entities: [Order], relations: [], eventSources: [Approve, Reject], approve: Approve, reject: Reject };
}

function createTransformFixture() {
  const Source = Entity.create({
    name: 'PgTransformSource',
    properties: [Property.create({ name: 'items', type: 'number' })],
  });
  const Derived = Entity.create({
    name: 'PgTransformDerived',
    properties: [Property.create({ name: 'idx', type: 'number' })],
    computation: Transform.create({
      record: Source,
      attributeQuery: ['*'],
      callback: (source: any) => ({ idx: source.items || 0 }),
    }),
  });

  return { entities: [Source, Derived], relations: [], dict: [] };
}

function createAsyncReturnFixture() {
  const Source = Entity.create({
    name: 'PgAsyncWorkerSource',
    properties: [Property.create({ name: 'value', type: 'number' })],
  });
  const AddSource = Interaction.create({
    name: 'pgAddAsyncWorkerSource',
    action: Action.create({ name: 'pgAddAsyncWorkerSource' }),
    payload: Payload.create({
      items: [PayloadItem.create({ name: 'source', type: 'Entity', base: Source })],
    }),
  });
  AddSource.resolve = async function(this: Controller, event: any) {
    return this.system.storage.create('PgAsyncWorkerSource', event.payload.source);
  };
  const total = Dictionary.create({
    name: 'pgAsyncWorkerTotal',
    type: 'number',
    collection: false,
    computation: Custom.create({
      name: 'PgAsyncWorkerTotal',
      dataDeps: {
        sources: { type: 'records', source: Source, attributeQuery: ['value'] },
      },
      compute: async () => ComputationResult.async({ freshnessKey: 'pg-async-worker' }),
      asyncReturn: async (result: number) => result,
    }),
  });

  return { entities: [Source], relations: [], eventSources: [AddSource], dict: [total], addSource: AddSource };
}

function createFullReplaceFixture() {
  const Trigger = Entity.create({
    name: 'PgReplaceTrigger',
    properties: [Property.create({ name: 'value', type: 'number' })],
  });
  const AddTrigger = Interaction.create({
    name: 'pgAddReplaceTrigger',
    action: Action.create({ name: 'pgAddReplaceTrigger' }),
    payload: Payload.create({
      items: [PayloadItem.create({ name: 'trigger', type: 'Entity', base: Trigger })],
    }),
  });
  AddTrigger.resolve = async function(this: Controller, event: any) {
    return this.system.storage.create('PgReplaceTrigger', event.payload.trigger);
  };
  const Result = Entity.create({
    name: 'PgReplaceResult',
    properties: [Property.create({ name: 'value', type: 'number' })],
    computation: Custom.create({
      name: 'PgReplaceResultComputation',
      dataDeps: {
        triggers: { type: 'records', source: Trigger, attributeQuery: ['value'] },
      },
      compute: async (dataDeps: any) => (dataDeps.triggers || []).map((trigger: any) => ({ value: trigger.value })),
    }),
  });
  const Left = Entity.create({
    name: 'PgReplaceLeft',
    properties: [Property.create({ name: 'name', type: 'string' })],
  });
  const Right = Entity.create({
    name: 'PgReplaceRight',
    properties: [Property.create({ name: 'name', type: 'string' })],
  });
  const ResultRelation = Relation.create({
    name: 'PgReplaceRelation',
    source: Left,
    sourceProperty: 'replaceLinks',
    target: Right,
    targetProperty: 'replaceLinkedBy',
    type: 'n:n',
    properties: [Property.create({ name: 'value', type: 'number' })],
    computation: Custom.create({
      name: 'PgReplaceRelationComputation',
      dataDeps: {
        triggers: { type: 'records', source: Trigger, attributeQuery: ['value'] },
        lefts: { type: 'records', source: Left, attributeQuery: ['id'] },
        rights: { type: 'records', source: Right, attributeQuery: ['id'] },
      },
      compute: async (dataDeps: any) => {
        const lefts = dataDeps.lefts || [];
        const rights = dataDeps.rights || [];
        return (dataDeps.triggers || []).slice(0, Math.min(lefts.length, rights.length)).map((trigger: any, index: number) => ({
          source: { id: lefts[index].id },
          target: { id: rights[index].id },
          value: trigger.value,
        }));
      },
    }),
  });

  return { Trigger, AddTrigger, Result, Left, Right, ResultRelation, entities: [Trigger, Result, Left, Right], relations: [ResultRelation], eventSources: [AddTrigger] };
}

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

  await controller.dispatch(action === 'approve' ? fixture.approve : fixture.reject, {
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
