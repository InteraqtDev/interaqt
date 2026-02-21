import { describe, expect, test } from "vitest";
import { Interaction, Action, Payload, PayloadItem, Controller, MonoSystem, InteractionEventEntity, Entity, Property } from 'interaqt';
import { SQLiteDB } from '@drivers';

describe('Interaction Context', () => {
    test('should store context when dispatching interaction', async () => {
        // 1. Setup system
        const system = new MonoSystem(new SQLiteDB());
        
        const UserEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        });

        // 2. Define a simple interaction
        const simpleInteraction = Interaction.create({
            name: 'simpleInteraction',
            action: Action.create({ name: 'simpleAction' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({ name: 'message', type: 'string' })
                ]
            })
        });

        // 3. Setup controller
        const controller = new Controller({
            system,
            entities: [UserEntity],
            relations: [],
            eventSources: [simpleInteraction],
        });
        await controller.setup(true);

        // 4. Create user
        const user = await controller.system.storage.create('User', { name: 'testUser' });

        // 5. Dispatch interaction with context
        const contextData = {
            source: 'agent',
            tool: 'testTool',
            timestamp: Date.now()
        };

        const result = await controller.dispatch(simpleInteraction, {
            user: { id: user.id },
            payload: { message: 'hello' },
            context: contextData
        });

        expect(result.error).toBeUndefined();

        // 6. Verify storage
        // InteractionEventEntity name is '_Interaction_'
        const interactions = await controller.system.storage.find(InteractionEventEntity.name, undefined, undefined, ['*']);
        
        expect(interactions.length).toBe(1);
        const storedInteraction = interactions[0];
        
        // Check if context is stored correctly
        expect(storedInteraction.context).toEqual(contextData);
        expect(storedInteraction.payload).toEqual({ message: 'hello' });
        expect(storedInteraction.interactionName).toBe('simpleInteraction');
    });
});
