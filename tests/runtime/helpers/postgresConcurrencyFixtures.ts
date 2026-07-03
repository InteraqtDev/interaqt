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

/**
 * PostgreSQL 并发测试的共享 fixture。
 *
 * CAUTION 这些模型定义必须是 vitest 父进程和 worker 子进程共享的同一个模块。
 *  migration manifest 会对 computation 回调做 Function.prototype.toString() 哈希，
 *  而模块转换器（vite SSR）会把回调里引用的 import 重写成 __vite_ssr_import_N__ 这类
 *  与模块内 import 顺序相关的标识符。如果 spec 和 worker 各自复制一份"相同"的定义，
 *  两个文件的函数文本会不同 → modelHash 不一致 → setup(false) 正确地报
 *  "Model manifest mismatch"。共享同一模块（并用同一转换管线执行）才能保证一致。
 */

export function createGlobalSummationFixture() {
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

  return { counterEntity, totalDictionary, entities: [counterEntity], relations: [], dict: [totalDictionary] };
}

export function createPropertyAggregateFixture() {
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
  const UserOrder = Relation.create({
    name: 'PgAggregateUserOrder',
    source: User,
    sourceProperty: 'orders',
    target: Order,
    targetProperty: 'buyer',
    type: '1:n',
  });

  User.properties.push(
    Property.create({ name: 'orderCount', type: 'number', computation: Count.create({ property: 'orders' }) }),
    Property.create({ name: 'orderTotal', type: 'number', computation: Summation.create({ property: 'orders', attributeQuery: ['amount'] }) }),
    Property.create({ name: 'orderAverage', type: 'number', computation: Average.create({ property: 'orders', attributeQuery: ['amount'] }) }),
    Property.create({
      name: 'allPositive',
      type: 'boolean',
      computation: Every.create({ property: 'orders', attributeQuery: ['amount'], callback: (order: any) => order.amount > 0 }),
    }),
    Property.create({
      name: 'hasLargeOrder',
      type: 'boolean',
      computation: Any.create({ property: 'orders', attributeQuery: ['amount'], callback: (order: any) => order.amount >= 1000 }),
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

  return { User, Order, entities: [User, Order], relations: [UserOrder], dict: [] };
}

export function createStateMachineFixture() {
  const Order = Entity.create({
    name: 'PgStateOrder',
    properties: [Property.create({ name: 'title', type: 'string' })],
  });
  const Approve = Interaction.create({
    name: 'pgApproveOrder',
    action: Action.create({ name: 'pgApproveOrder' }),
    payload: Payload.create({ items: [PayloadItem.create({ name: 'order', type: 'Entity', base: Order, isRef: true })] }),
  });
  const Reject = Interaction.create({
    name: 'pgRejectOrder',
    action: Action.create({ name: 'pgRejectOrder' }),
    payload: Payload.create({ items: [PayloadItem.create({ name: 'order', type: 'Entity', base: Order, isRef: true })] }),
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

  return { Order, Approve, Reject, entities: [Order], relations: [], eventSources: [Approve, Reject] };
}

export function createTransformFixture() {
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

  return { Source, Derived, entities: [Source, Derived], relations: [], dict: [] };
}

export function createAsyncReturnFixture() {
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

  return { Source, AddSource, total, entities: [Source], relations: [], eventSources: [AddSource], dict: [total] };
}

export function createFullReplaceFixture() {
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
