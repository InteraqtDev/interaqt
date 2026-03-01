import {describe, expect, test} from "vitest";
import {stringifyAllInstances, createInstances, Property, Entity} from "@core";

describe('stringify and parse', () => {
    test('stringifyAllInstances with new class system', () => {
        const Ref = Entity.create({
            name: 'Ref',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        const FuncAndRef = Entity.create({
            name: 'FuncAndRef',
            properties: [
                Property.create({ name: 'funcProp', type: 'function', defaultValue: () => function() { return 1; } }),
                Property.create({ name: 'refProp', type: 'object' })
            ]
        });

        expect(typeof stringifyAllInstances).toBe('function');
        expect(typeof createInstances).toBe('function');
    })
})


