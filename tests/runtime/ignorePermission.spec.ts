import { describe, it, expect, beforeEach } from 'vitest';
import { Entity, Property } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
    Controller, Interaction,
    Action,
    Payload,
    PayloadItem,
    Condition, MonoSystem,
    Transform,
    InteractionEventEntity
} from 'interaqt';

describe('Controller ignorePermission parameter', () => {
    let system: MonoSystem
    let User: any
    let Post: any
    let CreatePostInteraction: any
    let restrictedCondition: any

    beforeEach(async () => {
        system = new MonoSystem(new PGLiteDB())

        // Define entities
        User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'username', type: 'string' }),
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' })
            ]
        })

        Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'content', type: 'string' })
            ],
            computation: Transform.create({
                record: InteractionEventEntity,
                attributeQuery: [
                    'payload',
                    'interactionName'
                ],
                callback: (event: any) => {
                    if (event.interactionName === 'CreatePost') {
                        return {
                            title: event.payload.title,
                            content: event.payload.content
                        }
                    }
                    return null
                }
            })
        })

        // Create a restrictive condition that always returns false
        restrictedCondition = Condition.create({
            name: 'AlwaysFail',
            content: async function(event: any) {
                // This condition always fails to test ignorePermission
                return false
            }
        })

        // Create interaction with restrictive condition
        CreatePostInteraction = Interaction.create({
            name: 'CreatePost',
            action: Action.create({ name: 'create' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'title',
                        type: 'string',
                        required: true
                    }),
                    PayloadItem.create({
                        name: 'content',
                        type: 'string',
                        required: true
                    })
                ]
            }),
            conditions: restrictedCondition,
            data: Post
        })
    })

    it('should fail interaction when condition fails and ignorePermission is false', async () => {
        // Create controller without ignorePermission (defaults to false)
        const controller = new Controller({
            system,
            entities: [User, Post],
            relations: [],
            eventSources: [CreatePostInteraction]
        })

        await controller.setup(true)

        // Create a test user
        const user = await system.storage.create('User', {
            username: 'testuser',
            role: 'user',
            isActive: true
        })

        // Try to call interaction - should fail due to condition
        const result = await controller.dispatch(CreatePostInteraction, {
            user: user,
            payload: {
                title: 'Test Post',
                content: 'This should fail'
            }
        })

        // Expect error due to condition check failure
        expect(result.error).toBeDefined()
        expect(result.error).toHaveProperty('type', 'condition check failed')
    })

    it('should allow interaction when condition fails but ignorePermission is true', async () => {
        // Create controller with ignorePermission set to true
        const controller = new Controller({
            system,
            entities: [User, Post],
            relations: [],
            eventSources: [CreatePostInteraction],
            ignoreGuard: true
        })

        await controller.setup(true)

        // Create a test user
        const user = await system.storage.create('User', {
            username: 'adminuser',
            role: 'admin',
            isActive: true
        })

        // Try to call interaction - should succeed despite condition failure
        const result = await controller.dispatch(CreatePostInteraction, {
            user: user,
            payload: {
                title: 'Test Post with Bypass',
                content: 'This should succeed with ignorePermission'
            }
        })

        // Expect no error despite condition that always returns false
        expect(result.error).toBeUndefined()
        
        // Verify post was created
        const posts = await system.storage.find('Post', undefined, undefined, ['id', 'title', 'content'])
        expect(posts).toHaveLength(1)
        expect(posts[0].title).toBe('Test Post with Bypass')
        expect(posts[0].content).toBe('This should succeed with ignorePermission')
    })


    it('should dynamically respect ignorePermission changes', async () => {
        // Start with ignorePermission false
        const controller = new Controller({
            system,
            entities: [User, Post],
            relations: [],
            eventSources: [CreatePostInteraction],
            ignoreGuard: false
        })

        await controller.setup(true)

        const user = await system.storage.create('User', {
            username: 'testuser',
            role: 'user',
            isActive: true
        })

        // First call should fail
        let result = await controller.dispatch(CreatePostInteraction, {
            user: user,
            payload: {
                title: 'First Post',
                content: 'Should fail'
            }
        })

        expect(result.error).toBeDefined()

        // Change ignoreGuard to true at runtime
        controller.ignoreGuard = true

        // Second call should succeed
        result = await controller.dispatch(CreatePostInteraction, {
            user: user,
            payload: {
                title: 'Second Post',
                content: 'Should succeed'
            }
        })

        expect(result.error).toBeUndefined()

        // Verify post was created
        const posts = await system.storage.find('Post', undefined, undefined, ['id', 'title'])
        expect(posts).toHaveLength(1)
        expect(posts[0].title).toBe('Second Post')

        // Change back to false
        controller.ignoreGuard = false

        // Third call should fail again
        result = await controller.dispatch(CreatePostInteraction, {
            user: user,
            payload: {
                title: 'Third Post',
                content: 'Should fail again'
            }
        })

        expect(result.error).toBeDefined()
    })
})
