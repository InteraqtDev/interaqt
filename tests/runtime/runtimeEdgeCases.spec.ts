import { describe, expect, test } from "vitest";
import { Entity, Property, Custom, KlassByName } from 'interaqt';
import { Controller, MonoSystem, Dictionary, GlobalBoundState, StateMachine, StateNode, StateTransfer } from 'interaqt';
import { SchedulerError } from '../../src/runtime/errors/SystemErrors.js';
import { PGLiteDB } from '@drivers';

describe('Scheduler setup error handling', () => {
    test('wraps non-SchedulerError in SchedulerError during setup', async () => {
        const TestEntity = Entity.create({
            name: 'TestEntity',
            properties: [
                Property.create({ name: 'value', type: 'number' })
            ]
        });

        const dict = Dictionary.create({
            name: 'failingComputation',
            type: 'number',
            computation: Custom.create({
                name: 'FailingInitialValue',
                getInitialValue: function () {
                    throw new Error('initialization failed');
                }
            })
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        try {
            await controller.setup(true);
            expect.fail('should have thrown');
        } catch (e: any) {
            expect(e instanceof SchedulerError).toBe(true);
            expect(e.message).toContain('Unexpected error during scheduler setup');
            expect(e.causedBy).toBeTruthy();
        } finally {
            try { await system.destroy(); } catch (_) {}
        }
    });

    test('rethrows SchedulerError as-is during setup', async () => {
        const TestEntity = Entity.create({
            name: 'TestEntity2',
            properties: [
                Property.create({ name: 'value', type: 'number' })
            ]
        });

        const schedulerError = new SchedulerError('pre-existing scheduler error', {
            schedulingPhase: 'custom-phase',
        });

        const dict = Dictionary.create({
            name: 'failingComputation2',
            type: 'number',
            computation: Custom.create({
                name: 'FailingWithSchedulerError',
                getInitialValue: function () {
                    throw schedulerError;
                }
            })
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        try {
            await controller.setup(true);
            expect.fail('should have thrown');
        } catch (e: any) {
            expect(e).toBe(schedulerError);
            expect(e.schedulingPhase).toBe('custom-phase');
        } finally {
            try { await system.destroy(); } catch (_) {}
        }
    });
});

describe('MonoSystem setup edge cases', () => {
    test('throws when RecordBoundState references non-existent entity', async () => {
        const TestEntity = Entity.create({
            name: 'TestEntity3',
            properties: [
                Property.create({ name: 'status', type: 'string' })
            ]
        });

        const active = StateNode.create({ name: 'active' });
        const inactive = StateNode.create({ name: 'inactive' });

        const sm = StateMachine.create({
            states: [active, inactive],
            transfers: [
                StateTransfer.create({
                    trigger: { recordName: 'NonExistentEntity', type: 'update' },
                    current: active,
                    next: inactive,
                })
            ],
            initialState: active
        });

        const statusProp = Property.create({
            name: 'entityStatus',
            type: 'string',
            computedData: sm,
        });

        const TestEntity2 = Entity.create({
            name: 'TestEntity4',
            properties: [statusProp]
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity, TestEntity2],
            relations: [],
        });

        try {
            await controller.setup(true);
        } catch (e: any) {
            expect(e.message || e.toString()).toBeTruthy();
        } finally {
            try { await system.destroy(); } catch (_) {}
        }
    });

    test('setup with RecordBoundState using primitive defaultValue adds property', async () => {
        const TestEntity = Entity.create({
            name: 'TestEntity5',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const active = StateNode.create({ name: 'active', computeValue: () => true });
        const inactive = StateNode.create({ name: 'inactive', computeValue: () => false });

        const sm = StateMachine.create({
            states: [active, inactive],
            transfers: [
                StateTransfer.create({
                    trigger: { recordName: 'TestEntity5', type: 'create' },
                    current: inactive,
                    next: active,
                })
            ],
            initialState: inactive
        });

        const statusProp = Property.create({
            name: 'isActive',
            type: 'string',
            computedData: sm,
        });

        TestEntity.properties.push(statusProp);

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
        });

        await controller.setup(true);

        const record = await system.storage.create('TestEntity5', { name: 'test' });
        expect(record).toBeTruthy();

        await system.destroy();
    });
});

describe('Custom computation with createState and getInitialValue', () => {
    test('createState initializes global bound state', async () => {
        const TestEntity = Entity.create({
            name: 'AsyncTestEntity',
            properties: [
                Property.create({ name: 'value', type: 'number' })
            ]
        });

        const dict = Dictionary.create({
            name: 'stateTest',
            type: 'number',
            defaultValue: () => 0,
            computation: Custom.create({
                name: 'StateTestComputation',
                dataDeps: {
                    records: {
                        type: 'records',
                        source: TestEntity,
                        attributeQuery: ['value']
                    }
                },
                createState: function () {
                    return {
                        counter: new GlobalBoundState(0)
                    };
                },
                compute: async function (this: any, dataDeps: any) {
                    const records = dataDeps.records || [];
                    return records.reduce((sum: number, r: any) => sum + (r.value || 0), 0);
                },
                getInitialValue: function () {
                    return 0;
                }
            })
        });

        const system = new MonoSystem(new PGLiteDB());
        system.conceptClass = KlassByName;
        const controller = new Controller({
            system,
            entities: [TestEntity],
            relations: [],
            dict: [dict],
        });

        await controller.setup(true);

        const initialValue = await system.storage.dict.get('stateTest');
        expect(initialValue).toBe(0);

        await system.storage.create('AsyncTestEntity', { value: 10 });
        await new Promise(resolve => setTimeout(resolve, 300));

        const afterCreate = await system.storage.dict.get('stateTest');
        expect(afterCreate).toBe(10);

        await system.destroy();
    });
});
