import { describe, expect, test } from "vitest";
import {
  Entity, Property, Relation, Transform, BoolExp,
  Controller, MonoSystem, EventSource, Interaction, Action, Payload, PayloadItem,
  InteractionEventEntity, KlassByName, Dictionary
} from 'interaqt';
import { PGLiteDB } from '@drivers';

describe('EventSource', () => {

  describe('Custom EventSource with dispatch', () => {

    test('should dispatch a custom event source and trigger computation', async () => {
      const CronEventRecord = Entity.create({
        name: '_CronEvent_',
        properties: [
          Property.create({ name: 'triggeredAt', type: 'string' }),
          Property.create({ name: 'scheduleName', type: 'string' }),
        ]
      });

      type CronEventArgs = {
        triggeredAt: string
        scheduleName: string
      }

      const dailySettlement = EventSource.create<CronEventArgs>({
        name: 'dailySettlement',
        entity: CronEventRecord,
        mapEventData: (args) => ({
          triggeredAt: args.triggeredAt,
          scheduleName: args.scheduleName,
        })
      });

      const SettlementLogEntity = Entity.create({
        name: 'SettlementLog',
        properties: [
          Property.create({ name: 'triggeredAt', type: 'string' }),
          Property.create({ name: 'scheduleName', type: 'string' }),
          Property.create({ name: 'processedAt', type: 'string' }),
        ],
        computation: Transform.create({
          eventDeps: {
            CronEvent: {
              recordName: '_CronEvent_',
              type: 'create'
            }
          },
          callback: function(mutationEvent: any) {
            if (mutationEvent.recordName !== '_CronEvent_') return null;
            return {
              triggeredAt: mutationEvent.record.triggeredAt,
              scheduleName: mutationEvent.record.scheduleName,
              processedAt: new Date().toISOString(),
            };
          }
        })
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [SettlementLogEntity],
        relations: [],
        eventSources: [dailySettlement],
      });
      await controller.setup(true);

      const result = await controller.dispatch(dailySettlement, {
        triggeredAt: '2024-01-01T00:00:00Z',
        scheduleName: 'daily-settlement'
      });

      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(Array.isArray(result.effects)).toBe(true);

      const cronEvents = await system.storage.find('_CronEvent_', undefined, undefined, ['*']);
      expect(cronEvents).toHaveLength(1);
      expect(cronEvents[0].triggeredAt).toBe('2024-01-01T00:00:00Z');
      expect(cronEvents[0].scheduleName).toBe('daily-settlement');

      const logs = await system.storage.find('SettlementLog', undefined, undefined, ['*']);
      expect(logs).toHaveLength(1);
      expect(logs[0].triggeredAt).toBe('2024-01-01T00:00:00Z');
      expect(logs[0].scheduleName).toBe('daily-settlement');
    });

    test('should support guard validation on custom event source', async () => {
      const WebhookRecord = Entity.create({
        name: '_WebhookEvent_',
        properties: [
          Property.create({ name: 'source', type: 'string' }),
          Property.create({ name: 'payload', type: 'object' }),
        ]
      });

      type WebhookArgs = {
        signature: string
        source: string
        payload: Record<string, any>
      }

      const webhookEvent = EventSource.create<WebhookArgs>({
        name: 'paymentWebhook',
        entity: WebhookRecord,
        guard: async function(args) {
          if (args.signature !== 'valid-signature') {
            throw new Error('Invalid webhook signature');
          }
        },
        mapEventData: (args) => ({
          source: args.source,
          payload: args.payload,
        })
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        eventSources: [webhookEvent],
      });
      await controller.setup(true);

      // Should fail with invalid signature
      const failResult = await controller.dispatch(webhookEvent, {
        signature: 'bad-signature',
        source: 'stripe',
        payload: { orderId: '123' },
      });
      expect(failResult.error).toBeDefined();
      expect((failResult.error as Error).message).toBe('Invalid webhook signature');

      // Should succeed with valid signature
      const successResult = await controller.dispatch(webhookEvent, {
        signature: 'valid-signature',
        source: 'stripe',
        payload: { orderId: '456' },
      });
      expect(successResult.error).toBeUndefined();

      const events = await system.storage.find('_WebhookEvent_', undefined, undefined, ['*']);
      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('stripe');
      expect(events[0].payload.orderId).toBe('456');
    });

    test('should support ignoreGuard option to skip guard checks', async () => {
      const TestRecord = Entity.create({
        name: '_TestGuardSkip_',
        properties: [
          Property.create({ name: 'data', type: 'string' }),
        ]
      });

      const guardedSource = EventSource.create({
        name: 'guardedSource',
        entity: TestRecord,
        guard: async function() {
          throw new Error('Guard should be skipped');
        },
        mapEventData: (args: any) => ({ data: args.data }),
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        eventSources: [guardedSource],
        ignoreGuard: true,
      });
      await controller.setup(true);

      const result = await controller.dispatch(guardedSource, { data: 'test' });
      expect(result.error).toBeUndefined();

      const records = await system.storage.find('_TestGuardSkip_', undefined, undefined, ['*']);
      expect(records).toHaveLength(1);
      expect(records[0].data).toBe('test');
    });

    test('should support resolve function for data retrieval event sources', async () => {
      const QueryRecord = Entity.create({
        name: '_QueryEvent_',
        properties: [
          Property.create({ name: 'queryType', type: 'string' }),
        ]
      });

      const ItemEntity = Entity.create({
        name: 'Item',
        properties: [
          Property.create({ name: 'name', type: 'string' }),
          Property.create({ name: 'price', type: 'number' }),
        ]
      });

      type QueryArgs = {
        queryType: string
        minPrice?: number
      }

      const queryItems = EventSource.create<QueryArgs, any[]>({
        name: 'queryItems',
        entity: QueryRecord,
        mapEventData: (args) => ({ queryType: args.queryType }),
        resolve: async function(this: any, args) {
          const match = args.minPrice
            ? BoolExp.atom({ key: 'price', value: ['>=', args.minPrice] })
            : undefined;
          return this.system.storage.find('Item', match, undefined, ['*']);
        }
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [ItemEntity],
        relations: [],
        eventSources: [queryItems],
      });
      await controller.setup(true);

      await system.storage.create('Item', { name: 'Cheap', price: 10 });
      await system.storage.create('Item', { name: 'Medium', price: 50 });
      await system.storage.create('Item', { name: 'Expensive', price: 100 });

      const allResult = await controller.dispatch(queryItems, { queryType: 'all' });
      expect(allResult.error).toBeUndefined();
      expect(allResult.data).toHaveLength(3);

      const filteredResult = await controller.dispatch(queryItems, { queryType: 'filtered', minPrice: 50 });
      expect(filteredResult.error).toBeUndefined();
      expect(filteredResult.data).toHaveLength(2);
    });

    test('should roll back transaction on guard failure', async () => {
      const TxRecord = Entity.create({
        name: '_TxTestEvent_',
        properties: [
          Property.create({ name: 'value', type: 'string' }),
        ]
      });

      const txSource = EventSource.create({
        name: 'txTest',
        entity: TxRecord,
        guard: async function(args: any) {
          if (args.shouldFail) {
            throw new Error('Intentional failure');
          }
        },
        mapEventData: (args: any) => ({ value: args.value }),
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        eventSources: [txSource],
      });
      await controller.setup(true);

      // This should fail and roll back
      const failResult = await controller.dispatch(txSource, { shouldFail: true, value: 'fail' });
      expect(failResult.error).toBeDefined();

      // No records should exist
      const records = await system.storage.find('_TxTestEvent_', undefined, undefined, ['*']);
      expect(records).toHaveLength(0);

      // This should succeed
      const successResult = await controller.dispatch(txSource, { shouldFail: false, value: 'success' });
      expect(successResult.error).toBeUndefined();

      const recordsAfter = await system.storage.find('_TxTestEvent_', undefined, undefined, ['*']);
      expect(recordsAfter).toHaveLength(1);
      expect(recordsAfter[0].value).toBe('success');
    });

    test('should support forceThrowDispatchError option', async () => {
      const ThrowRecord = Entity.create({
        name: '_ThrowTestEvent_',
        properties: [
          Property.create({ name: 'value', type: 'string' }),
        ]
      });

      const throwSource = EventSource.create({
        name: 'throwTest',
        entity: ThrowRecord,
        guard: async function() {
          throw new Error('Test error');
        },
        mapEventData: (args: any) => ({ value: args.value }),
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        eventSources: [throwSource],
        forceThrowDispatchError: true,
      });
      await controller.setup(true);

      await expect(
        controller.dispatch(throwSource, { value: 'test' })
      ).rejects.toThrow('Test error');
    });

    test('should handle side effects for custom event source records', async () => {
      const SideEffectRecord = Entity.create({
        name: '_SideEffectEvent_',
        properties: [
          Property.create({ name: 'action', type: 'string' }),
        ]
      });

      const sideEffectSource = EventSource.create({
        name: 'sideEffectTest',
        entity: SideEffectRecord,
        mapEventData: (args: any) => ({ action: args.action }),
      });

      let sideEffectCalled = false;
      let sideEffectEvent: any = null;

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;

      const { RecordMutationSideEffect } = await import('interaqt');

      const mySideEffect = RecordMutationSideEffect.create({
        name: 'testSideEffect',
        record: SideEffectRecord,
        content: async function(event) {
          sideEffectCalled = true;
          sideEffectEvent = event;
          return { processed: true };
        }
      });

      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        eventSources: [sideEffectSource],
        recordMutationSideEffects: [mySideEffect],
      });
      await controller.setup(true);

      const result = await controller.dispatch(sideEffectSource, { action: 'test-action' });

      expect(result.error).toBeUndefined();
      expect(sideEffectCalled).toBe(true);
      expect(sideEffectEvent.recordName).toBe('_SideEffectEvent_');
      expect(sideEffectEvent.type).toBe('create');
      expect(result.sideEffects!['testSideEffect']).toBeDefined();
      expect(result.sideEffects!['testSideEffect'].result).toEqual({ processed: true });
    });
  });

  describe('Mixed EventSource and Interaction', () => {

    test('should support both eventSources and interactions in same controller', async () => {
      const CronRecord = Entity.create({
        name: '_MixedCron_',
        properties: [
          Property.create({ name: 'timestamp', type: 'string' }),
        ]
      });

      const cronSource = EventSource.create({
        name: 'cronJob',
        entity: CronRecord,
        mapEventData: (args: any) => ({ timestamp: args.timestamp }),
      });

      const testInteraction = Interaction.create({
        name: 'doSomething',
        action: Action.create({ name: 'doSomething' }),
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        interactions: [testInteraction],
        eventSources: [cronSource],
      });
      await controller.setup(true);

      // Dispatch the custom event source
      const dispatchResult = await controller.dispatch(cronSource, { timestamp: new Date().toISOString() });
      expect(dispatchResult.error).toBeUndefined();

      const cronRecords = await system.storage.find('_MixedCron_', undefined, undefined, ['*']);
      expect(cronRecords).toHaveLength(1);

      // callInteraction still works for interactions
      const interactionResult = await controller.callInteraction('doSomething', {
        user: { id: 'user1' },
      });
      expect(interactionResult.error).toBeUndefined();
    });

    test('should support multiple custom event sources triggering different computations', async () => {
      const PaymentRecord = Entity.create({
        name: '_PaymentCallback_',
        properties: [
          Property.create({ name: 'orderId', type: 'string' }),
          Property.create({ name: 'amount', type: 'string' }),
          Property.create({ name: 'status', type: 'string' }),
        ]
      });

      const ShippingRecord = Entity.create({
        name: '_ShippingUpdate_',
        properties: [
          Property.create({ name: 'orderId', type: 'string' }),
          Property.create({ name: 'trackingNumber', type: 'string' }),
        ]
      });

      const paymentCallback = EventSource.create({
        name: 'paymentCallback',
        entity: PaymentRecord,
        mapEventData: (args: any) => ({
          orderId: args.orderId,
          amount: String(args.amount),
          status: args.status,
        }),
      });

      const shippingUpdate = EventSource.create({
        name: 'shippingUpdate',
        entity: ShippingRecord,
        mapEventData: (args: any) => ({
          orderId: args.orderId,
          trackingNumber: args.trackingNumber,
        }),
      });

      const PaymentLogEntity = Entity.create({
        name: 'PaymentLog',
        properties: [
          Property.create({ name: 'orderId', type: 'string' }),
          Property.create({ name: 'amount', type: 'string' }),
        ],
        computation: Transform.create({
          eventDeps: {
            Payment: { recordName: '_PaymentCallback_', type: 'create' }
          },
          callback: function(event: any) {
            if (event.recordName !== '_PaymentCallback_') return null;
            return {
              orderId: event.record.orderId,
              amount: event.record.amount,
            };
          }
        })
      });

      const ShippingLogEntity = Entity.create({
        name: 'ShippingLog',
        properties: [
          Property.create({ name: 'orderId', type: 'string' }),
          Property.create({ name: 'trackingNumber', type: 'string' }),
        ],
        computation: Transform.create({
          eventDeps: {
            Shipping: { recordName: '_ShippingUpdate_', type: 'create' }
          },
          callback: function(event: any) {
            if (event.recordName !== '_ShippingUpdate_') return null;
            return {
              orderId: event.record.orderId,
              trackingNumber: event.record.trackingNumber,
            };
          }
        })
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [PaymentLogEntity, ShippingLogEntity],
        relations: [],
        eventSources: [paymentCallback, shippingUpdate],
      });
      await controller.setup(true);

      // Dispatch payment event
      await controller.dispatch(paymentCallback, {
        orderId: 'order-1',
        amount: 99.99,
        status: 'paid',
      });

      const paymentLogs = await system.storage.find('PaymentLog', undefined, undefined, ['*']);
      expect(paymentLogs).toHaveLength(1);
      expect(paymentLogs[0].orderId).toBe('order-1');
      expect(paymentLogs[0].amount).toBe('99.99');

      // Dispatch shipping event
      await controller.dispatch(shippingUpdate, {
        orderId: 'order-1',
        trackingNumber: 'TRACK-123',
      });

      const shippingLogs = await system.storage.find('ShippingLog', undefined, undefined, ['*']);
      expect(shippingLogs).toHaveLength(1);
      expect(shippingLogs[0].orderId).toBe('order-1');
      expect(shippingLogs[0].trackingNumber).toBe('TRACK-123');

      // Verify they don't cross-contaminate
      const paymentLogsAfter = await system.storage.find('PaymentLog', undefined, undefined, ['*']);
      expect(paymentLogsAfter).toHaveLength(1);
    });
  });

  describe('EventSource without mapEventData', () => {
    test('should create empty event record when mapEventData is not provided', async () => {
      const SimpleRecord = Entity.create({
        name: '_SimpleEvent_',
        properties: []
      });

      const simpleSource = EventSource.create({
        name: 'simpleEvent',
        entity: SimpleRecord,
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [],
        relations: [],
        eventSources: [simpleSource],
      });
      await controller.setup(true);

      const result = await controller.dispatch(simpleSource, {});
      expect(result.error).toBeUndefined();

      const records = await system.storage.find('_SimpleEvent_', undefined, undefined, ['*']);
      expect(records).toHaveLength(1);
    });
  });

  describe('Guard with controller context', () => {
    test('guard function should receive controller as this context', async () => {
      const GuardRecord = Entity.create({
        name: '_GuardContextEvent_',
        properties: [
          Property.create({ name: 'value', type: 'string' }),
        ]
      });

      const CounterEntity = Entity.create({
        name: 'Counter',
        properties: [
          Property.create({ name: 'count', type: 'number' }),
        ]
      });

      const guardedSource = EventSource.create({
        name: 'guardedContextTest',
        entity: GuardRecord,
        guard: async function(this: any, args: any) {
          // Guard has access to controller (this) and can query storage
          const counters = await this.system.storage.find('Counter', undefined, undefined, ['*']);
          if (counters.length > 0 && counters[0].count >= 3) {
            throw new Error('Counter limit reached');
          }
        },
        mapEventData: (args: any) => ({ value: args.value }),
      });

      const system = new MonoSystem(new PGLiteDB());
      system.conceptClass = KlassByName;
      const controller = new Controller({
        system,
        entities: [CounterEntity],
        relations: [],
        eventSources: [guardedSource],
      });
      await controller.setup(true);

      // Should succeed — no counter yet
      const result1 = await controller.dispatch(guardedSource, { value: 'test1' });
      expect(result1.error).toBeUndefined();

      // Add a counter at the limit
      await system.storage.create('Counter', { count: 3 });

      // Should now fail
      const result2 = await controller.dispatch(guardedSource, { value: 'test2' });
      expect(result2.error).toBeDefined();
      expect((result2.error as Error).message).toBe('Counter limit reached');
    });
  });
});
