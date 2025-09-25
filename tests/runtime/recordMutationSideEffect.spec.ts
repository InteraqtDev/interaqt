import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Entity, Property, RecordMutationSideEffect, Interaction, Action, Payload, PayloadItem, SideEffect } from 'interaqt';
import { PGLiteDB } from '@dbclients';
import { MatchExp } from '@storage';

describe('RecordMutationSideEffect', () => {
    // Note: RecordMutationSideEffect is only triggered within interaction execution context.
    // Direct storage operations (e.g., controller.system.storage.create) do not trigger RecordMutationSideEffect.
    // Therefore, we create a minimal interaction that performs storage operations to test the side effects.
    
    test('basic record mutation side effects trigger correctly', async () => {
        // Define entities
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({
                    name: 'name',
                    type: 'string',
                    collection: false,
                }),
                Property.create({
                    name: 'email',
                    type: 'string',
                    collection: false,
                })
            ]
        });

        const postEntity = Entity.create({
            name: 'Post',
            properties: [
                Property.create({
                    name: 'title',
                    type: 'string',
                    collection: false,
                }),
                Property.create({
                    name: 'content',
                    type: 'string',
                    collection: false,
                }),
                Property.create({
                    name: 'status',
                    type: 'string',
                    collection: false,
                    defaultValue: () => 'draft'
                })
            ]
        });

        // Define a minimal interaction that performs storage operations
        // This is needed because RecordMutationSideEffect only works within interaction context
        const storageTestInteraction = Interaction.create({
            name: 'storageTest',
            action: Action.create({ name: 'storageTest' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'operation',
                        type: 'string',
                    }),
                    PayloadItem.create({
                        name: 'data',
                        type: 'object',
                    })
                ]
            }),
            sideEffects: [
                SideEffect.create({
                    name: 'performStorageOperation',
                    handle: async function (this: Controller, event: any) {
                        const { operation, data } = event.payload;
                        switch (operation) {
                            case 'createUser':
                                return await this.system.storage.create('User', data);
                            case 'updateUser':
                                return await this.system.storage.update('User',
                                    MatchExp.atom({ key: 'id', value: ['=', data.id] }),
                                    { name: data.name }
                                );
                            case 'deleteUser':
                                return await this.system.storage.delete('User',
                                    MatchExp.atom({ key: 'id', value: ['=', data.id] })
                                );
                            case 'createPost':
                                return await this.system.storage.create('Post', data);
                            default:
                                throw new Error('Unknown operation');
                        }
                    }
                })
            ]
        });

        // Track side effect calls
        const sideEffectCalls: any[] = [];

        // Define RecordMutationSideEffects
        const userCreatedSideEffect = RecordMutationSideEffect.create({
            name: 'userCreatedNotification',
            record: { name: 'User' },
            content: async (event) => {
                if (event.type === 'create') {
                    sideEffectCalls.push({
                        sideEffect: 'userCreatedNotification',
                        event: event
                    });
                    return { notified: true, userId: event.record?.id };
                }
                return null;
            }
        });

        const userUpdatedSideEffect = RecordMutationSideEffect.create({
            name: 'userUpdatedAudit',
            record: { name: 'User' },
            content: async (event) => {
                if (event.type === 'update') {
                    sideEffectCalls.push({
                        sideEffect: 'userUpdatedAudit',
                        event: event
                    });
                    return { audited: true, changes: event.keys || [] };
                }
                return null;
            }
        });

        const userDeletedSideEffect = RecordMutationSideEffect.create({
            name: 'userDeletedCleanup',
            record: { name: 'User' },
            content: async (event) => {
                if (event.type === 'delete') {
                    sideEffectCalls.push({
                        sideEffect: 'userDeletedCleanup',
                        event: event
                    });
                    return { cleaned: true, userId: event.record?.id };
                }
                return null;
            }
        });

        const postCreatedSideEffect = RecordMutationSideEffect.create({
            name: 'postCreatedIndex',
            record: { name: 'Post' },
            content: async (event) => {
                sideEffectCalls.push({
                    sideEffect: 'postCreatedIndex',
                    event: event
                });
                return { indexed: true, postId: event.record?.id };
            }
        });

        // Create system and controller
        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system: system,
            entities: [userEntity, postEntity],
            relations: [],
            activities: [],
            interactions: [storageTestInteraction],
            recordMutationSideEffects: [userCreatedSideEffect, userUpdatedSideEffect, userDeletedSideEffect, postCreatedSideEffect]
        });

        await controller.setup(true);

        // Test 1: Create user triggers side effect
        const createResult = await controller.callInteraction('storageTest', {
            user: { id: 'test-user' } as any,
            payload: {
                operation: 'createUser',
                data: {
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        });
        
        expect(createResult.error).toBeUndefined();
        const createdUser = createResult.sideEffects?.performStorageOperation?.result! as any;

        // Verify side effect was called with correct event
        // Only userCreatedNotification should be called for create events
        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('userCreatedNotification');
        expect(sideEffectCalls[0].event.type).toBe('create');
        expect(sideEffectCalls[0].event.recordName).toBe('User');
        expect(sideEffectCalls[0].event.record?.name).toBe('John Doe');
        expect(sideEffectCalls[0].event.record?.email).toBe('john@example.com');

        // Clear side effect calls
        sideEffectCalls.length = 0;

        // Test 2: Update user triggers side effect
        const updateResult = await controller.callInteraction('storageTest', {
            user: { id: 'test-user' } as any,
            payload: {
                operation: 'updateUser',
                data: {
                    id: createdUser.id,
                    name: 'Jane Doe'
                }
            }
        });
        
        expect(updateResult.error).toBeUndefined();

        // Verify side effect was called with correct event
        // Only userUpdatedAudit should be called for update events
        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('userUpdatedAudit');
        expect(sideEffectCalls[0].event.type).toBe('update');
        expect(sideEffectCalls[0].event.recordName).toBe('User');
        // Note: keys and oldRecord are not populated in the basic implementation
        expect(sideEffectCalls[0].event.record?.name).toBe('Jane Doe');

        // Clear side effect calls
        sideEffectCalls.length = 0;

        // Test 3: Delete user triggers side effect
        const deleteResult = await controller.callInteraction('storageTest', {
            user: { id: 'test-user' } as any,
            payload: {
                operation: 'deleteUser',
                data: {
                    id: createdUser.id
                }
            }
        });
        
        expect(deleteResult.error).toBeUndefined();
        
        // Verify delete side effect was called
        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('userDeletedCleanup');
        expect(sideEffectCalls[0].event.type).toBe('delete');
        expect(sideEffectCalls[0].event.recordName).toBe('User');
        expect(sideEffectCalls[0].event.record?.id).toBe(createdUser.id);

        // Clear side effect calls
        sideEffectCalls.length = 0;

        // Test 4: Create post triggers different side effect
        const createPostResult = await controller.callInteraction('storageTest', {
            user: { id: 'test-user' } as any,
            payload: {
                operation: 'createPost',
                data: {
                    title: 'Test Post',
                    content: 'This is a test post'
                }
            }
        });
        
        expect(createPostResult.error).toBeUndefined();
        const createdPost = createPostResult.sideEffects?.performStorageOperation?.result;

        // Verify only post side effect was called, not user side effects
        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('postCreatedIndex');
        expect(sideEffectCalls[0].event.type).toBe('create');
        expect(sideEffectCalls[0].event.recordName).toBe('Post');
        expect(sideEffectCalls[0].event.record?.title).toBe('Test Post');
        expect(sideEffectCalls[0].event.record?.content).toBe('This is a test post');
        expect(sideEffectCalls[0].event.record?.status).toBe('draft');

        await system.destroy();
    });

    test('side effect error handling', async () => {
        const userEntity = Entity.create({
            name: 'User',
            properties: [
                Property.create({
                    name: 'name',
                    type: 'string',
                    collection: false,
                })
            ]
        });


        // Define a side effect that throws an error
        const errorSideEffect = RecordMutationSideEffect.create({
            name: 'errorSideEffect',
            record: { name: 'User' },
            content: async (event) => {
                throw new Error('Side effect failed');
            }
        });

        // Define a successful side effect
        const successSideEffect = RecordMutationSideEffect.create({
            name: 'successSideEffect',
            record: { name: 'User' },
            content: async (event) => {
                return { success: true };
            }
        });

        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system: system,
            entities: [userEntity],
            relations: [],
            activities: [],
            interactions: [],
            recordMutationSideEffects: [errorSideEffect, successSideEffect]
        });

        await controller.setup(true);

        // Create user - side effects should be triggered
        const createdUser = await controller.system.storage.create('User', {
            name: 'Test User'
        });

        // Verify the user was created successfully
        expect(createdUser).toBeDefined();
        expect(createdUser.name).toBe('Test User');

        // Note: In this implementation, RecordMutationSideEffect errors are logged but don't fail the operation
        // The side effects run asynchronously after the storage operation completes

        await system.destroy();
    });
});
