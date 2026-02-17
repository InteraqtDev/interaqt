import { describe, expect, test } from "vitest";
import { Controller, MonoSystem, Entity, Property, RecordMutationSideEffect } from 'interaqt';
import { PGLiteDB } from '@dbclients';
import { MatchExp } from '@storage';

describe('RecordMutationSideEffect', () => {
    test('basic record mutation side effects trigger correctly', async () => {
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

        const sideEffectCalls: any[] = [];

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

        const system = new MonoSystem(new PGLiteDB());
        const controller = new Controller({
            system: system,
            entities: [userEntity, postEntity],
            relations: [],
            activities: [],
            interactions: [],
            recordMutationSideEffects: [userCreatedSideEffect, userUpdatedSideEffect, userDeletedSideEffect, postCreatedSideEffect]
        });

        await controller.setup(true);

        // Test 1: Create user triggers side effect
        const createdUser = await controller.system.storage.create('User', {
            name: 'John Doe',
            email: 'john@example.com'
        });

        let mockResult: any = {
            effects: [
                { recordName: 'User', type: 'create', record: createdUser }
            ],
            sideEffects: {}
        };
        await controller.runRecordChangeSideEffects(mockResult, controller.system.logger);

        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('userCreatedNotification');
        expect(sideEffectCalls[0].event.type).toBe('create');
        expect(sideEffectCalls[0].event.recordName).toBe('User');
        expect(sideEffectCalls[0].event.record?.name).toBe('John Doe');
        expect(sideEffectCalls[0].event.record?.email).toBe('john@example.com');
        expect(mockResult.sideEffects.userCreatedNotification.result).toEqual({ notified: true, userId: createdUser.id });

        sideEffectCalls.length = 0;

        // Test 2: Update user triggers side effect
        await controller.system.storage.update('User',
            MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
            { name: 'Jane Doe' }
        );

        mockResult = {
            effects: [
                { recordName: 'User', type: 'update', record: { ...createdUser, name: 'Jane Doe' }, oldRecord: createdUser }
            ],
            sideEffects: {}
        };
        await controller.runRecordChangeSideEffects(mockResult, controller.system.logger);

        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('userUpdatedAudit');
        expect(sideEffectCalls[0].event.type).toBe('update');
        expect(sideEffectCalls[0].event.recordName).toBe('User');
        expect(sideEffectCalls[0].event.record?.name).toBe('Jane Doe');

        sideEffectCalls.length = 0;

        // Test 3: Delete user triggers side effect
        await controller.system.storage.delete('User',
            MatchExp.atom({ key: 'id', value: ['=', createdUser.id] })
        );

        mockResult = {
            effects: [
                { recordName: 'User', type: 'delete', record: { id: createdUser.id } }
            ],
            sideEffects: {}
        };
        await controller.runRecordChangeSideEffects(mockResult, controller.system.logger);

        expect(sideEffectCalls.length).toBe(1);
        expect(sideEffectCalls[0].sideEffect).toBe('userDeletedCleanup');
        expect(sideEffectCalls[0].event.type).toBe('delete');
        expect(sideEffectCalls[0].event.recordName).toBe('User');
        expect(sideEffectCalls[0].event.record?.id).toBe(createdUser.id);

        sideEffectCalls.length = 0;

        // Test 4: Create post triggers different side effect
        const createdPost = await controller.system.storage.create('Post', {
            title: 'Test Post',
            content: 'This is a test post',
            status: 'draft'
        });

        mockResult = {
            effects: [
                { recordName: 'Post', type: 'create', record: createdPost }
            ],
            sideEffects: {}
        };
        await controller.runRecordChangeSideEffects(mockResult, controller.system.logger);

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

        const errorSideEffect = RecordMutationSideEffect.create({
            name: 'errorSideEffect',
            record: { name: 'User' },
            content: async (event) => {
                throw new Error('Side effect failed');
            }
        });

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

        const createdUser = await controller.system.storage.create('User', {
            name: 'Test User'
        });

        expect(createdUser).toBeDefined();
        expect(createdUser.name).toBe('Test User');

        // Test that errors in one side effect don't prevent others from running
        const mockResult: any = {
            effects: [
                { recordName: 'User', type: 'create', record: createdUser }
            ],
            sideEffects: {}
        };
        await controller.runRecordChangeSideEffects(mockResult, controller.system.logger);

        // errorSideEffect should have an error
        expect(mockResult.sideEffects.errorSideEffect.error).toBeDefined();
        // successSideEffect should have succeeded
        expect(mockResult.sideEffects.successSideEffect.result).toEqual({ success: true });

        await system.destroy();
    });
});
