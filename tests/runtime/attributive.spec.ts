import { beforeEach, describe, expect, test } from "vitest";
import {
    Controller,
    MonoSystem,
    BoolExp,
    Interaction,
    KlassByName,
    removeAllInstance,
    Action,
    Attributive,
    PayloadItem,
    Entity,
    Property,
    Payload,
    boolExpToAttributives
} from 'interaqt';

describe('attributive checks', () => {
    let system: MonoSystem
    let controller: Controller

    beforeEach(async () => {
        removeAllInstance()
        system = new MonoSystem()
        system.conceptClass = KlassByName
    })

    describe('userAttributives checks', () => {
        test('should pass when user meets single attributive', async () => {
            // Define entities
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'role', type: 'string' }),
                    Property.create({ name: 'level', type: 'number', defaultValue: () => 1 })
                ]
            })

            // Create attributive that checks if user is admin
            const isAdmin = Attributive.create({
                name: 'isAdmin',
                content: function(this: Controller, user: any, event: any) {
                    return user.role === 'admin'
                }
            })

            // Create interaction with userAttributives
            const DeletePost = Interaction.create({
                name: 'deletePost',
                action: Action.create({ name: 'delete' }),
                userAttributives: isAdmin
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                activities: [],
                interactions: [DeletePost]
            })
            await controller.setup(true)

            // Create test users
            const adminUser = await system.storage.create('User', { name: 'Admin', role: 'admin' })
            const normalUser = await system.storage.create('User', { name: 'Normal', role: 'user' })

            // Test admin user - should pass
            const adminResult = await controller.callInteraction(DeletePost.name, {
                user: adminUser
            })
            expect(adminResult.error).toBeUndefined()

            // Test normal user - should fail
            const normalResult = await controller.callInteraction(DeletePost.name, {
                user: normalUser
            })
            expect(normalResult.error).toBeDefined()
            expect((normalResult.error as any).type).toBe('check user failed')
        })

        test('should handle BoolExp combinations in userAttributives', async () => {
            // Define entities
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'role', type: 'string' }),
                    Property.create({ name: 'level', type: 'number', defaultValue: () => 1 })
                ]
            })

            // Create attributives
            const isAdmin = Attributive.create({
                name: 'isAdmin',
                content: function(this: Controller, user: any, event: any) {
                    return user.role === 'admin'
                }
            })

            const isHighLevel = Attributive.create({
                name: 'isHighLevel',
                content: function(this: Controller, user: any, event: any) {
                    return user.level >= 5
                }
            })

            // Create interaction with OR combination
            const ModerateContent = Interaction.create({
                name: 'moderateContent',
                action: Action.create({ name: 'moderate' }),
                userAttributives: boolExpToAttributives(
                    BoolExp.atom(isAdmin).or(BoolExp.atom(isHighLevel))
                )
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                activities: [],
                interactions: [ModerateContent]
            })
            await controller.setup(true)

            // Create test users
            const adminUser = await system.storage.create('User', { name: 'Admin', role: 'admin', level: 3 })
            const highLevelUser = await system.storage.create('User', { name: 'HighLevel', role: 'user', level: 7 })
            const normalUser = await system.storage.create('User', { name: 'Normal', role: 'user', level: 2 })

            // Test admin user - should pass (is admin)
            const adminResult = await controller.callInteraction(ModerateContent.name, {
                user: adminUser
            })
            expect(adminResult.error).toBeUndefined()

            // Test high level user - should pass (level >= 5)
            const highLevelResult = await controller.callInteraction(ModerateContent.name, {
                user: highLevelUser
            })
            expect(highLevelResult.error).toBeUndefined()

            // Test normal user - should fail (neither admin nor high level)
            const normalResult = await controller.callInteraction(ModerateContent.name, {
                user: normalUser
            })
            expect(normalResult.error).toBeDefined()
        })
    })

    describe('payload attributives checks', () => {
        test('should check payload item attributives', async () => {
            // Define entities
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            const Post = Entity.create({
                name: 'Post',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
                    Property.create({ name: 'authorId', type: 'string' })
                ]
            })

            // Create attributive for published posts
            const isPublished = Attributive.create({
                name: 'isPublished',
                content: function(this: Controller, post: any, event: any) {
                    return post.status === 'published'
                }
            })

            // Create interaction that requires published posts
            const SharePost = Interaction.create({
                name: 'sharePost',
                action: Action.create({ name: 'share' }),
                payload: Payload.create({
                    items: [
                        PayloadItem.create({
                            name: 'post',
                            base: Post,
                            isRef: true,
                            attributives: isPublished
                        })
                    ]
                })
            })

            controller = new Controller({
                system: system,
                entities: [User, Post],
                relations: [],
                activities: [],
                interactions: [SharePost]
            })
            await controller.setup(true)

            // Create test data
            const user = await system.storage.create('User', { name: 'TestUser' })
            const publishedPost = await system.storage.create('Post', { 
                title: 'Published Post', 
                status: 'published',
                authorId: user.id 
            })
            const draftPost = await system.storage.create('Post', { 
                title: 'Draft Post', 
                status: 'draft',
                authorId: user.id 
            })

            // Test with published post - should pass
            const publishedResult = await controller.callInteraction(SharePost.name, {
                user: user,
                payload: {
                    post: { id: publishedPost.id }
                }
            })
            expect(publishedResult.error).toBeUndefined()

            // Test with draft post - should fail
            const draftResult = await controller.callInteraction(SharePost.name, {
                user: user,
                payload: {
                    post: { id: draftPost.id }
                }
            })
            expect(draftResult.error).toBeDefined()
            expect((draftResult.error as any).type).toBe('post not match attributive')
        })

        test('should check collection payload attributives', async () => {
            // Define entities
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            const Tag = Entity.create({
                name: 'Tag',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
                ]
            })

            // Create attributive for active tags
            const isActive = Attributive.create({
                name: 'isActive',
                content: function(this: Controller, tag: any, event: any) {
                    // Handle both boolean true and numeric 1 from database
                    return tag.isActive === true || tag.isActive === 1
                }
            })

            // Create interaction that requires all tags to be active
            const CreatePost = Interaction.create({
                name: 'createPost',
                action: Action.create({ name: 'create' }),
                payload: Payload.create({
                    items: [
                        PayloadItem.create({
                            name: 'tags',
                            base: Tag,
                            isRef: true,
                            isCollection: true,
                            attributives: isActive
                        })
                    ]
                })
            })

            controller = new Controller({
                system: system,
                entities: [User, Tag],
                relations: [],
                activities: [],
                interactions: [CreatePost]
            })
            await controller.setup(true)

            // Create test data
            const user = await system.storage.create('User', { name: 'TestUser' })
            const activeTag1 = await system.storage.create('Tag', { name: 'Active1', isActive: true })
            const activeTag2 = await system.storage.create('Tag', { name: 'Active2', isActive: true })
            const inactiveTag = await system.storage.create('Tag', { name: 'Inactive', isActive: false })

            // Test with all active tags - should pass
            const activeResult = await controller.callInteraction(CreatePost.name, {
                user: user,
                payload: {
                    tags: [{ id: activeTag1.id }, { id: activeTag2.id }]
                }
            })
            expect(activeResult.error).toBeUndefined()

            // Test with inactive tag included - should fail
            const mixedResult = await controller.callInteraction(CreatePost.name, {
                user: user,
                payload: {
                    tags: [{ id: activeTag1.id }, { id: inactiveTag.id }]
                }
            })
            expect(mixedResult.error).toBeDefined()
            expect((mixedResult.error as any).type).toBe('tags not every item match attribute')
        })
    })

    describe('error handling', () => {
        test('should handle attributive function errors gracefully', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create attributive that throws error
            const buggyAttributive = Attributive.create({
                name: 'buggyAttributive',
                content: function(this: Controller, user: any, event: any) {
                    throw new Error('Something went wrong!')
                }
            })

            const BuggyInteraction = Interaction.create({
                name: 'buggyInteraction',
                action: Action.create({ name: 'buggy' }),
                userAttributives: buggyAttributive
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                activities: [],
                interactions: [BuggyInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            // Should catch error and treat as false
            const result = await controller.callInteraction(BuggyInteraction.name, {
                user: user
            })
            expect(result.error).toBeDefined()
            expect((result.error as any).type).toBe('check user failed')
        })

        test('should handle undefined return from attributive', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create attributive that returns undefined
            const incompleteAttributive = Attributive.create({
                name: 'incompleteAttributive',
                content: function(this: Controller, user: any, event: any) {
                    // Returns undefined - should be treated as true with warning
                    return undefined
                }
            })

            const IncompleteInteraction = Interaction.create({
                name: 'incompleteInteraction',
                action: Action.create({ name: 'incomplete' }),
                userAttributives: incompleteAttributive
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                activities: [],
                interactions: [IncompleteInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            // Should treat undefined as true
            const result = await controller.callInteraction(IncompleteInteraction.name, {
                user: user
            })
            expect(result.error).toBeUndefined()
        })
    })
})