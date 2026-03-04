import { describe, test, expect, beforeEach } from 'vitest';
import {
    Entity, Property,
    Any, Every, Custom,
    StateMachine, StateNode, StateTransfer,
    WeightedSummation, RealTime, Transform,
    EventSource,
    clearAllInstances
} from '@core';

const allClasses = [
    Entity, Property,
    Any, Every, Custom,
    StateMachine, StateNode, StateTransfer,
    WeightedSummation, RealTime, Transform,
    EventSource
];

beforeEach(() => {
    clearAllInstances(...allClasses);
});

describe('Any serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const callback = (item: any) => item.value > 0;
        const instance = Any.create({ callback, property: 'score' }, { uuid: 'any-1' });

        const json = Any.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('Any');
        expect(data.uuid).toBe('any-1');
        expect(data.public.property).toBe('score');
        expect(data.public.callback).toMatch(/^func::/);

        clearAllInstances(Any);
        const parsed = Any.parse(json);
        expect(parsed.uuid).toBe('any-1');
        expect(parsed._type).toBe('Any');
        expect(parsed.property).toBe('score');
        expect(typeof parsed.callback).toBe('function');
    });

    test('is() positive and negative', () => {
        const instance = Any.create({ callback: () => true });
        expect(Any.is(instance)).toBe(true);
        expect(Any.is(null)).toBe(false);
        expect(Any.is({})).toBe(false);
        expect(Any.is({ _type: 'Every' })).toBe(false);
    });

    test('check() validates object shape', () => {
        const instance = Any.create({ callback: () => true });
        expect(Any.check(instance)).toBe(true);
        expect(Any.check(null)).toBe(false);
        expect(Any.check({})).toBe(false);
        expect(Any.check({ uuid: 123 })).toBe(false);
        expect(Any.check({ uuid: 'abc' })).toBe(true);
    });

    test('clone() creates independent copy', () => {
        const instance = Any.create({ callback: () => true, property: 'val' });
        const cloned = Any.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.property).toBe(instance.property);
        expect(cloned.callback).toBe(instance.callback);
    });
});

describe('Every serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const callback = (item: any) => item.active;
        const instance = Every.create({ callback, notEmpty: true }, { uuid: 'every-1' });

        const json = Every.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('Every');
        expect(data.public.callback).toMatch(/^func::/);

        clearAllInstances(Every);
        const parsed = Every.parse(json);
        expect(parsed.uuid).toBe('every-1');
        expect(parsed._type).toBe('Every');
        expect(typeof parsed.callback).toBe('function');
    });

    test('is() positive and negative', () => {
        const instance = Every.create({ callback: () => true });
        expect(Every.is(instance)).toBe(true);
        expect(Every.is(null)).toBe(false);
        expect(Every.is({ _type: 'Any' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Every.check({ uuid: 'x' })).toBe(true);
        expect(Every.check(null)).toBe(false);
        expect(Every.check({ uuid: 123 })).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const instance = Every.create({ callback: () => true, notEmpty: true });
        const cloned = Every.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.callback).toBe(instance.callback);
        expect(cloned.notEmpty).toBe(true);
    });
});

describe('Custom serialization', () => {
    test('stringify/parse round-trip with multiple function fields', () => {
        const compute = (deps: any) => deps.count * 2;
        const incrementalCompute = (last: any, patch: any) => last + patch;
        const instance = Custom.create({
            name: 'myCustom',
            compute,
            incrementalCompute,
            useLastValue: true,
        }, { uuid: 'custom-1' });

        const json = Custom.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('Custom');
        expect(data.public.name).toBe('myCustom');
        expect(data.public.compute).toMatch(/^func::/);
        expect(data.public.incrementalCompute).toMatch(/^func::/);
        expect(data.public.useLastValue).toBe(true);

        clearAllInstances(Custom);
        const parsed = Custom.parse(json);
        expect(parsed.uuid).toBe('custom-1');
        expect(parsed.name).toBe('myCustom');
        expect(typeof parsed.compute).toBe('function');
        expect(typeof parsed.incrementalCompute).toBe('function');
        expect(parsed.useLastValue).toBe(true);
    });

    test('stringify/parse with all optional function fields', () => {
        const instance = Custom.create({
            name: 'full',
            compute: () => 1,
            incrementalCompute: () => 2,
            incrementalPatchCompute: () => 3,
            createState: () => ({}),
            getInitialValue: () => 0,
            asyncReturn: async () => 'done',
        }, { uuid: 'custom-full' });

        const json = Custom.stringify(instance);
        clearAllInstances(Custom);
        const parsed = Custom.parse(json);
        expect(typeof parsed.compute).toBe('function');
        expect(typeof parsed.incrementalCompute).toBe('function');
        expect(typeof parsed.incrementalPatchCompute).toBe('function');
        expect(typeof parsed.createState).toBe('function');
        expect(typeof parsed.getInitialValue).toBe('function');
        expect(typeof parsed.asyncReturn).toBe('function');
    });

    test('is() positive and negative', () => {
        const instance = Custom.create({ name: 'test' });
        expect(Custom.is(instance)).toBe(true);
        expect(Custom.is(null)).toBe(false);
        expect(Custom.is({ _type: 'Any' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Custom.check({ uuid: 'x' })).toBe(true);
        expect(Custom.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const compute = () => 42;
        const instance = Custom.create({ name: 'orig', compute, useLastValue: true });
        const cloned = Custom.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.name).toBe('orig');
        expect(cloned.compute).toBe(compute);
        expect(cloned.useLastValue).toBe(true);
    });
});

describe('StateNode serialization', () => {
    test('stringify/parse round-trip preserves name', () => {
        const instance = StateNode.create({ name: 'active' }, { uuid: 'sn-1' });

        const json = StateNode.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('StateNode');
        expect(data.public.name).toBe('active');

        clearAllInstances(StateNode);
        const parsed = StateNode.parse(json);
        expect(parsed.uuid).toBe('sn-1');
        expect(parsed.name).toBe('active');
    });

    test('is() positive and negative', () => {
        const instance = StateNode.create({ name: 'idle' });
        expect(StateNode.is(instance)).toBe(true);
        expect(StateNode.is(null)).toBe(false);
        expect(StateNode.is({ _type: 'StateMachine' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(StateNode.check({ uuid: 'x' })).toBe(true);
        expect(StateNode.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const computeValue = () => 'val';
        const instance = StateNode.create({ name: 'idle', computeValue });
        const cloned = StateNode.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.name).toBe('idle');
        expect(cloned.computeValue).toBe(computeValue);
    });
});

describe('StateTransfer serialization', () => {
    test('stringify/parse round-trip preserves fields', () => {
        const active = StateNode.create({ name: 'active' }, { uuid: 'st-a' });
        const inactive = StateNode.create({ name: 'inactive' }, { uuid: 'st-b' });
        const trigger = { recordName: 'User', type: 'update' as const };
        const instance = StateTransfer.create(
            { trigger, current: active, next: inactive },
            { uuid: 'stf-1' }
        );

        const json = StateTransfer.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('StateTransfer');
        expect(data.public.trigger.recordName).toBe('User');

        clearAllInstances(StateTransfer);
        const parsed = StateTransfer.parse(json);
        expect(parsed.uuid).toBe('stf-1');
        expect(parsed.trigger.recordName).toBe('User');
    });

    test('is() positive and negative', () => {
        const node = StateNode.create({ name: 'a' });
        const instance = StateTransfer.create({
            trigger: { recordName: 'X', type: 'create' },
            current: node,
            next: node
        });
        expect(StateTransfer.is(instance)).toBe(true);
        expect(StateTransfer.is(null)).toBe(false);
        expect(StateTransfer.is({ _type: 'StateNode' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(StateTransfer.check({ uuid: 'x' })).toBe(true);
        expect(StateTransfer.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const node = StateNode.create({ name: 'n' });
        const instance = StateTransfer.create({
            trigger: { recordName: 'X', type: 'create' },
            current: node,
            next: node,
            computeTarget: () => 'target',
        });
        const cloned = StateTransfer.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.trigger).toBe(instance.trigger);
        expect(cloned.computeTarget).toBe(instance.computeTarget);
    });
});

describe('StateMachine serialization', () => {
    test('stringify/parse round-trip preserves structure', () => {
        const idle = StateNode.create({ name: 'idle' }, { uuid: 'sm-idle' });
        const running = StateNode.create({ name: 'running' }, { uuid: 'sm-running' });
        const transfer = StateTransfer.create({
            trigger: { recordName: 'Task', type: 'update' },
            current: idle,
            next: running
        }, { uuid: 'sm-transfer' });
        const instance = StateMachine.create({
            states: [idle, running],
            transfers: [transfer],
            initialState: idle
        }, { uuid: 'sm-1' });

        const json = StateMachine.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('StateMachine');

        clearAllInstances(StateMachine);
        const parsed = StateMachine.parse(json);
        expect(parsed.uuid).toBe('sm-1');
        expect(parsed._type).toBe('StateMachine');
    });

    test('is() positive and negative', () => {
        const node = StateNode.create({ name: 's' });
        const instance = StateMachine.create({
            states: [node],
            transfers: [],
            initialState: node
        });
        expect(StateMachine.is(instance)).toBe(true);
        expect(StateMachine.is(null)).toBe(false);
        expect(StateMachine.is({ _type: 'StateNode' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(StateMachine.check({ uuid: 'x' })).toBe(true);
        expect(StateMachine.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const node = StateNode.create({ name: 's' });
        const instance = StateMachine.create({
            states: [node],
            transfers: [],
            initialState: node
        });
        const cloned = StateMachine.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.states).toBe(instance.states);
        expect(cloned.initialState).toBe(instance.initialState);
    });
});

describe('WeightedSummation serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const callback = (item: any) => item.weight * item.score;
        const instance = WeightedSummation.create(
            { callback, property: 'total' },
            { uuid: 'ws-1' }
        );

        const json = WeightedSummation.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('WeightedSummation');
        expect(data.public.callback).toMatch(/^func::/);

        clearAllInstances(WeightedSummation);
        const parsed = WeightedSummation.parse(json);
        expect(parsed.uuid).toBe('ws-1');
        expect(typeof parsed.callback).toBe('function');
    });

    test('is() positive and negative', () => {
        const instance = WeightedSummation.create({ callback: () => 1 });
        expect(WeightedSummation.is(instance)).toBe(true);
        expect(WeightedSummation.is(null)).toBe(false);
        expect(WeightedSummation.is({ _type: 'Any' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(WeightedSummation.check({ uuid: 'x' })).toBe(true);
        expect(WeightedSummation.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const instance = WeightedSummation.create({ callback: () => 1, property: 'p' });
        const cloned = WeightedSummation.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.property).toBe('p');
    });
});

describe('RealTime serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const callback = () => Date.now();
        const nextRecomputeTime = () => Date.now() + 1000;
        const instance = RealTime.create(
            { callback, nextRecomputeTime },
            { uuid: 'rt-1' }
        );

        expect(instance._type).toBe('RealTimeValue');

        const json = RealTime.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('RealTimeValue');
        expect(data.public.callback).toMatch(/^func::/);
        expect(data.public.nextRecomputeTime).toMatch(/^func::/);

        clearAllInstances(RealTime);
        const parsed = RealTime.parse(json);
        expect(parsed.uuid).toBe('rt-1');
        expect(typeof parsed.callback).toBe('function');
        expect(typeof parsed.nextRecomputeTime).toBe('function');
    });

    test('is() uses RealTimeValue _type', () => {
        const instance = RealTime.create({ callback: () => 0 });
        expect(RealTime.is(instance)).toBe(true);
        expect(instance._type).toBe('RealTimeValue');
        expect(RealTime.is(null)).toBe(false);
        expect(RealTime.is({ _type: 'RealTime' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(RealTime.check({ uuid: 'x' })).toBe(true);
        expect(RealTime.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const cb = () => 0;
        const nrt = () => 1000;
        const instance = RealTime.create({ callback: cb, nextRecomputeTime: nrt });
        const cloned = RealTime.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.callback).toBe(cb);
        expect(cloned.nextRecomputeTime).toBe(nrt);
    });
});

describe('Transform serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const entity = Entity.create({ name: 'Item' }, { uuid: 'tf-entity' });
        const callback = (event: any) => ({ name: event.data.name });
        const instance = Transform.create(
            { record: entity, callback },
            { uuid: 'tf-1' }
        );

        const json = Transform.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('Transform');
        expect(data.public.callback).toMatch(/^func::/);
        expect(data.public.record).toMatch(/^uuid::/);

        clearAllInstances(Transform);
        const parsed = Transform.parse(json);
        expect(parsed.uuid).toBe('tf-1');
        expect(typeof parsed.callback).toBe('function');
    });

    test('is() positive and negative', () => {
        const entity = Entity.create({ name: 'T' });
        const instance = Transform.create({ record: entity, callback: () => ({}) });
        expect(Transform.is(instance)).toBe(true);
        expect(Transform.is(null)).toBe(false);
        expect(Transform.is({ _type: 'Custom' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Transform.check({ uuid: 'x' })).toBe(true);
        expect(Transform.check(null)).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const entity = Entity.create({ name: 'T' });
        const cb = () => ({});
        const instance = Transform.create({ record: entity, callback: cb });
        const cloned = Transform.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.record).toBe(entity);
        expect(cloned.callback).toBe(cb);
    });
});

describe('EventSource serialization', () => {
    test('stringify/parse round-trip preserves name and entity', () => {
        const entity = Entity.create({ name: 'User' }, { uuid: 'es-entity' });
        const instance = EventSource.create(
            { name: 'register', entity },
            { uuid: 'es-1' }
        );

        const json = EventSource.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('EventSource');
        expect(data.public.name).toBe('register');

        clearAllInstances(EventSource);
        const parsed = EventSource.parse(json);
        expect(parsed.uuid).toBe('es-1');
        expect(parsed.name).toBe('register');
    });

    test('is() positive and negative', () => {
        const entity = Entity.create({ name: 'E' });
        const instance = EventSource.create({ name: 'evt', entity });
        expect(EventSource.is(instance)).toBe(true);
        expect(EventSource.is(null)).toBe(false);
        expect(EventSource.is({ _type: 'Interaction' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(EventSource.check({ uuid: 'x' })).toBe(true);
        expect(EventSource.check(null)).toBe(false);
    });

    test('clone() preserves callbacks', () => {
        const entity = Entity.create({ name: 'E' });
        const guard = async () => {};
        const instance = EventSource.create({ name: 'evt', entity, guard });
        const cloned = EventSource.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.name).toBe('evt');
        expect(cloned.entity).toBe(entity);
        expect(cloned.guard).toBe(guard);
    });
});
