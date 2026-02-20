import {describe, test, expect} from "vitest";
import { 
    Entity, Property, PropertyTypes, Relation,
    clearAllInstances
} from "@core";
import {
    Action, Interaction, Payload, PayloadItem
} from "interaqt";

describe("refactored types", () => {
    test('relation types', () => {
        const relation = Relation.create({
            source: Entity.create({name: 'test'}),
            target: Entity.create({name: 'test2'}),
            type: '1:1',
            sourceProperty: 'to2',
            targetProperty: 'to1',
        })
        expect(relation.source.name).toBe('test');
        expect(relation.target.name).toBe('test2');
        expect(relation.type).toBe('1:1');
        expect(relation._type).toBe('Relation');
    })

    test('entity type', () => {
        const testEntity = Entity.create({
            name: 'test',
        })

        expect(testEntity.properties).toEqual([])
        expect(testEntity.name).toBe('test')
        expect(testEntity._type).toBe('Entity');
    })

    test('create instances with refactored ES6 classes', () => {
        // Property.create now returns a PropertyInstance
        const p1 = Property.create({name: 'role', type: PropertyTypes.String});
        expect(p1.name).toBe('role');
        expect(p1.type).toBe(PropertyTypes.String);
        expect(p1._type).toBe('Property');
        
        // Entity.create returns an EntityInstance
        const UserEntity = Entity.create({
            name: 'User',
            properties: [p1],
        });
        expect(UserEntity.name).toBe('User');
        expect(UserEntity.properties).toContain(p1);
        expect(UserEntity._type).toBe('Entity');
        
        // Test instance tracking
        expect(Property.instances).toContain(p1);
        expect(Entity.instances).toContain(UserEntity);
    })

    test('interaction types', () => {
        const action = Action.create({ name: 'testAction' });
        const payload = Payload.create({
            items: [
                PayloadItem.create({
                    name: 'data',
                    type: 'string',
                    isRef: false,
                    base: Entity.create({ name: 'TestEntity' })
                })
            ]
        });
        
        const interaction = Interaction.create({
            name: 'TestInteraction',
            action: action,
            payload: payload
        });
        
        expect(interaction.name).toBe('TestInteraction');
        expect(interaction.action).toBe(action);
        expect(interaction.payload).toBe(payload);
        expect(interaction._type).toBe('Interaction');
    })

    test('type checking with is() method', () => {
        const entity = Entity.create({ name: 'Test' });
        const property = Property.create({ name: 'prop', type: 'string' });
        const relation = Relation.create({
            source: entity,
            target: entity,
            sourceProperty: 'self',
            targetProperty: 'self',
            type: '1:1'
        });
        
        // Test is() methods
        expect(Entity.is(entity)).toBe(true);
        expect(Entity.is(property)).toBe(false);
        expect(Property.is(property)).toBe(true);
        expect(Property.is(entity)).toBe(false);
        expect(Relation.is(relation)).toBe(true);
        expect(Relation.is(entity)).toBe(false);
    })

    test('stringify and parse', () => {
        const entity = Entity.create({ name: 'TestEntity' });
        const stringified = Entity.stringify(entity);
        const data = JSON.parse(stringified);
        
        // Clear instances before parsing to avoid duplicate UUID error
        clearAllInstances(Entity);
        
        const parsed = Entity.parse(stringified);
        
        expect(parsed.name).toBe(entity.name);
        expect(parsed._type).toBe(entity._type);
        expect(parsed.uuid).toBe(entity.uuid); // Should preserve UUID
        
        // Verify the stringified format contains expected data
        expect(data.type).toBe('Entity');
        expect(data.public.name).toBe('TestEntity');
        expect(data.uuid).toBe(entity.uuid);
    })
})
