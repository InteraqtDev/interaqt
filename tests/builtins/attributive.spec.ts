import { describe, test, expect, beforeEach } from 'vitest';
import { clearAllInstances, BoolExp, BoolAtomData, BoolExpressionData } from '@core';
import {
    Attributive,
    Attributives,
    boolExpToAttributives,
} from '../../src/builtins/interaction/Attributive.js';
import { Conditions } from '../../src/builtins/interaction/Conditions.js';
import {
    Activity,
    ActivityGroup,
    Transfer,
} from '../../src/builtins/interaction/Activity.js';

beforeEach(() => {
    clearAllInstances(
        Attributive, Attributives,
        Conditions, Activity, ActivityGroup, Transfer,
        BoolAtomData, BoolExpressionData,
    );
});

describe('Attributive serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const content = (user: any) => user.role === 'admin';
        const instance = Attributive.create({ content, name: 'isAdmin' }, { uuid: 'attr-1' });

        const json = Attributive.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('Attributive');
        expect(data.public.name).toBe('isAdmin');
        expect(data.public.content).toMatch(/^func::/);

        clearAllInstances(Attributive);
        const parsed = Attributive.parse(json);
        expect(parsed.uuid).toBe('attr-1');
        expect(parsed.name).toBe('isAdmin');
        expect(typeof parsed.content).toBe('function');
    });

    test('is() positive and negative', () => {
        const instance = Attributive.create({ content: () => true });
        expect(Attributive.is(instance)).toBe(true);
        expect(Attributive.is(null)).toBe(false);
        expect(Attributive.is({ _type: 'Attributives' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Attributive.check({ uuid: 'abc' })).toBe(true);
        expect(Attributive.check(null)).toBe(false);
        expect(Attributive.check({})).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const content = () => true;
        const instance = Attributive.create({ content, name: 'test', isRef: true });
        const cloned = Attributive.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.content).toBe(content);
        expect(cloned.name).toBe('test');
        expect(cloned.isRef).toBe(true);
    });
});

describe('Attributives', () => {
    test('is() positive and negative', () => {
        const instance = Attributives.create({});
        expect(Attributives.is(instance)).toBe(true);
        expect(Attributives.is(null)).toBe(false);
        expect(Attributives.is({ _type: 'Attributive' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Attributives.check({ uuid: 'x' })).toBe(true);
        expect(Attributives.check(null)).toBe(false);
    });

    test('stringify/parse round-trip', () => {
        const instance = Attributives.create({}, { uuid: 'attrs-1' });
        const json = Attributives.stringify(instance);
        clearAllInstances(Attributives);
        const parsed = Attributives.parse(json);
        expect(parsed.uuid).toBe('attrs-1');
    });

    test('clone() creates independent copy', () => {
        const instance = Attributives.create({});
        const cloned = Attributives.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
    });
});

describe('boolExpToAttributives', () => {
    test('converts atom BoolExp to Attributives', () => {
        const attr = Attributive.create({ content: () => true, name: 'check' });
        const boolExp = BoolExp.atom(attr);
        const result = boolExpToAttributives(boolExp);

        expect(Attributives.is(result)).toBe(true);
        expect(result.content).toBeTruthy();
    });

    test('converts AND expression to Attributives', () => {
        const a1 = Attributive.create({ content: () => true, name: 'a1' });
        const a2 = Attributive.create({ content: () => false, name: 'a2' });
        const boolExp = BoolExp.atom(a1).and(a2);
        const result = boolExpToAttributives(boolExp);

        expect(Attributives.is(result)).toBe(true);
        expect(result.content).toBeTruthy();
        expect((result.content as any)._type).toBe('BoolExpressionData');
    });

    test('converts OR expression to Attributives', () => {
        const a1 = Attributive.create({ content: () => true, name: 'a1' });
        const a2 = Attributive.create({ content: () => false, name: 'a2' });
        const boolExp = BoolExp.atom(a1).or(a2);
        const result = boolExpToAttributives(boolExp);

        expect(Attributives.is(result)).toBe(true);
        expect(result.content).toBeTruthy();
    });
});

describe('Conditions serialization', () => {
    test('is() positive and negative', () => {
        const instance = Conditions.create({});
        expect(Conditions.is(instance)).toBe(true);
        expect(Conditions.is(null)).toBe(false);
        expect(Conditions.is({ _type: 'Attributives' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Conditions.check({ uuid: 'x' })).toBe(true);
        expect(Conditions.check(null)).toBe(false);
    });

    test('stringify/parse round-trip', () => {
        const instance = Conditions.create({}, { uuid: 'cond-1' });
        const json = Conditions.stringify(instance);
        clearAllInstances(Conditions);
        const parsed = Conditions.parse(json);
        expect(parsed.uuid).toBe('cond-1');
    });

    test('clone() creates independent copy', () => {
        const instance = Conditions.create({});
        const cloned = Conditions.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
    });

    test('accepts BoolExp as content and converts', () => {
        const boolExp = BoolExp.atom({ check: () => true });
        const instance = Conditions.create({ content: boolExp });
        expect(instance.content).toBeTruthy();
    });
});

describe('Activity serialization', () => {
    test('is() positive and negative', () => {
        const instance = Activity.create({ name: 'TestActivity' });
        expect(Activity.is(instance)).toBe(true);
        expect(Activity.is(null)).toBe(false);
        expect(Activity.is({ _type: 'Interaction' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(Activity.check({ uuid: 'x' })).toBe(true);
        expect(Activity.check(null)).toBe(false);
    });

    test('stringify/parse round-trip', () => {
        const instance = Activity.create({ name: 'Flow' }, { uuid: 'act-1' });
        const json = Activity.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('Activity');
        expect(data.public.name).toBe('Flow');

        clearAllInstances(Activity);
        const parsed = Activity.parse(json);
        expect(parsed.uuid).toBe('act-1');
        expect(parsed.name).toBe('Flow');
    });

    test('clone() creates independent copy', () => {
        const instance = Activity.create({ name: 'A' });
        const cloned = Activity.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.name).toBe('A');
    });
});

describe('ActivityGroup serialization', () => {
    test('is() positive and negative', () => {
        const instance = ActivityGroup.create({ type: 'parallel' });
        expect(ActivityGroup.is(instance)).toBe(true);
        expect(ActivityGroup.is(null)).toBe(false);
        expect(ActivityGroup.is({ _type: 'Activity' })).toBe(false);
    });

    test('check() validates object shape', () => {
        expect(ActivityGroup.check({ uuid: 'x' })).toBe(true);
        expect(ActivityGroup.check(null)).toBe(false);
    });

    test('stringify/parse round-trip', () => {
        const instance = ActivityGroup.create({ type: 'exclusive' }, { uuid: 'ag-1' });
        const json = ActivityGroup.stringify(instance);
        clearAllInstances(ActivityGroup);
        const parsed = ActivityGroup.parse(json);
        expect(parsed.uuid).toBe('ag-1');
        expect(parsed.type).toBe('exclusive');
    });

    test('clone() creates independent copy', () => {
        const instance = ActivityGroup.create({ type: 'parallel' });
        const cloned = ActivityGroup.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.type).toBe('parallel');
    });
});

describe('Transfer serialization', () => {
    test('check() validates object shape', () => {
        expect(Transfer.check({ uuid: 'x' })).toBe(true);
        expect(Transfer.check(null)).toBe(false);
    });

    test('is() positive and negative', () => {
        const group1 = ActivityGroup.create({ type: 'p' });
        const group2 = ActivityGroup.create({ type: 'q' });
        const instance = Transfer.create({
            name: 'flow',
            source: group1,
            target: group2,
        });
        expect(Transfer.is(instance)).toBe(true);
        expect(Transfer.is(null)).toBe(false);
        expect(Transfer.is({ _type: 'Activity' })).toBe(false);
    });

    test('clone() creates independent copy', () => {
        const group1 = ActivityGroup.create({ type: 'a' });
        const group2 = ActivityGroup.create({ type: 'b' });
        const instance = Transfer.create({ name: 't', source: group1, target: group2 });
        const cloned = Transfer.clone(instance, false);
        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.name).toBe('t');
        expect(cloned.source).toBe(group1);
    });
});
