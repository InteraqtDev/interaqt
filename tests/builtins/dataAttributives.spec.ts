import { describe, test, expect, beforeEach } from 'vitest';
import { clearAllInstances, BoolAtomData, BoolExpressionData } from '@core';
import {
    DataAttributives,
} from '../../src/builtins/interaction/DataAttributives.js';

beforeEach(() => {
    clearAllInstances(DataAttributives, BoolAtomData, BoolExpressionData);
});

describe('DataAttributives serialization', () => {
    test('stringify/parse round-trip preserves data', () => {
        const content = BoolAtomData.create({ key: 'role', value: ['=', 'admin'] });
        const instance = DataAttributives.create({ content }, { uuid: 'da-1' });

        const json = DataAttributives.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('DataAttributives');
        expect(data.uuid).toBe('da-1');
        expect(data.public.content).toBeTruthy();

        clearAllInstances(DataAttributives);
        const parsed = DataAttributives.parse(json);
        expect(parsed.uuid).toBe('da-1');
        expect(parsed._type).toBe('DataAttributives');
    });

    test('stringify/parse round-trip without content', () => {
        const instance = DataAttributives.create({}, { uuid: 'da-empty' });

        const json = DataAttributives.stringify(instance);
        const data = JSON.parse(json);
        expect(data.type).toBe('DataAttributives');
        expect(data.public).toEqual({});

        clearAllInstances(DataAttributives);
        const parsed = DataAttributives.parse(json);
        expect(parsed.uuid).toBe('da-empty');
    });

    test('stringify preserves options', () => {
        const instance = DataAttributives.create({}, { uuid: 'da-opts' });
        const json = DataAttributives.stringify(instance);
        const data = JSON.parse(json);
        expect(data.options).toEqual({ uuid: 'da-opts' });
    });
});

describe('DataAttributives.is()', () => {
    test('positive: recognizes DataAttributives instance', () => {
        const instance = DataAttributives.create({});
        expect(DataAttributives.is(instance)).toBe(true);
    });

    test('negative: rejects null', () => {
        expect(DataAttributives.is(null)).toBe(false);
    });

    test('negative: rejects non-object', () => {
        expect(DataAttributives.is(42)).toBe(false);
        expect(DataAttributives.is('string')).toBe(false);
        expect(DataAttributives.is(undefined)).toBe(false);
    });

    test('negative: rejects object with wrong _type', () => {
        expect(DataAttributives.is({ _type: 'Attributive' })).toBe(false);
        expect(DataAttributives.is({ _type: 'Entity' })).toBe(false);
    });

    test('negative: rejects object without _type', () => {
        expect(DataAttributives.is({ uuid: 'abc' })).toBe(false);
    });
});

describe('DataAttributives.check()', () => {
    test('positive: valid object with uuid string', () => {
        expect(DataAttributives.check({ uuid: 'abc' })).toBe(true);
    });

    test('positive: full instance passes check', () => {
        const instance = DataAttributives.create({});
        expect(DataAttributives.check(instance)).toBe(true);
    });

    test('negative: rejects null', () => {
        expect(DataAttributives.check(null)).toBe(false);
    });

    test('negative: rejects non-object', () => {
        expect(DataAttributives.check(42)).toBe(false);
        expect(DataAttributives.check('string')).toBe(false);
    });

    test('negative: rejects object without uuid', () => {
        expect(DataAttributives.check({})).toBe(false);
    });

    test('negative: rejects object with non-string uuid', () => {
        expect(DataAttributives.check({ uuid: 123 })).toBe(false);
    });
});

describe('DataAttributives.clone()', () => {
    test('creates independent copy with new uuid', () => {
        const content = BoolAtomData.create({ key: 'status', value: ['=', 'active'] });
        const instance = DataAttributives.create({ content });
        const cloned = DataAttributives.clone(instance, false);

        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.content).toBe(content);
        expect(cloned._type).toBe('DataAttributives');
    });

    test('creates copy without content', () => {
        const instance = DataAttributives.create({});
        const cloned = DataAttributives.clone(instance, false);

        expect(cloned.uuid).not.toBe(instance.uuid);
        expect(cloned.content).toBeUndefined();
    });

    test('clone is registered in instances', () => {
        const instance = DataAttributives.create({});
        const cloned = DataAttributives.clone(instance, false);
        expect(DataAttributives.instances).toContain(cloned);
    });
});

describe('DataAttributives.create()', () => {
    test('basic construction assigns uuid and content', () => {
        const content = BoolAtomData.create({ key: 'x', value: ['=', 1] });
        const instance = DataAttributives.create({ content }, { uuid: 'da-test' });

        expect(instance.uuid).toBe('da-test');
        expect(instance._type).toBe('DataAttributives');
        expect(instance.content).toBe(content);
    });

    test('auto-generates uuid when no options provided', () => {
        const instance = DataAttributives.create({});
        expect(instance.uuid).toBeTruthy();
        expect(typeof instance.uuid).toBe('string');
    });

    test('registers instance in static instances array', () => {
        const instance = DataAttributives.create({});
        expect(DataAttributives.instances).toContain(instance);
    });

    test('throws on duplicate uuid', () => {
        DataAttributives.create({}, { uuid: 'dup-uuid' });
        expect(() => {
            DataAttributives.create({}, { uuid: 'dup-uuid' });
        }).toThrow(/duplicate uuid/);
    });
});

describe('DataAttributives static properties', () => {
    test('has correct displayName', () => {
        expect(DataAttributives.displayName).toBe('DataAttributives');
    });

    test('has isKlass set to true', () => {
        expect(DataAttributives.isKlass).toBe(true);
    });

    test('public descriptor defines content field', () => {
        expect(DataAttributives.public.content).toBeDefined();
        expect(DataAttributives.public.content.type).toContain('BoolExpressionData');
        expect(DataAttributives.public.content.type).toContain('BoolAtomData');
        expect(DataAttributives.public.content.required).toBe(false);
        expect(DataAttributives.public.content.collection).toBe(false);
    });
});
