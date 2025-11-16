import { beforeEach, describe, expect, test } from "vitest";
import { Entity, Property } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@dbclients';
import {
    Controller,
    MonoSystem,
    BoolExp,
    Interaction,
    KlassByName,
    removeAllInstance,
    Action,
    Condition,
    Conditions,
    ConditionError, Payload,
    PayloadItem
} from 'interaqt';

describe('condition checks', () => {
    let system: MonoSystem
    let controller: Controller

    beforeEach(async () => {
        removeAllInstance()
        system = new MonoSystem(new SQLiteDB())
        system.conceptClass = KlassByName
    })

    test('should check single condition', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'credits', type: 'number', defaultValue: () => 0 })
            ]
        })

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'isPremium', type: 'boolean', defaultValue: () => false })
            ]
        })

        // Create condition that checks if user has enough credits
        const hasEnoughCredits = Condition.create({
            name: 'hasEnoughCredits',
            content: async function(this: Controller, event: any) {
                const user = await this.system.storage.findOne('User', 
                    BoolExp.atom({ key: 'id', value: ['=', event.user.id] }),
                    undefined,
                    ['*']
                )
                const post = event.payload?.post
                return !post?.isPremium || user.credits >= 10
            }
        })

        // Create interaction with condition
        const ViewPost = Interaction.create({
            name: 'viewPost',
            action: Action.create({ name: 'view' }),
            payload: Payload.create({
                items: [
                    PayloadItem.create({
                        name: 'post',
                        type: 'Entity',
                        base: Post
                    })
                ]
            }),
            conditions: hasEnoughCredits
        })

        controller = new Controller({
            system: system,
            entities: [User, Post],
            relations: [],
            activities: [],
            interactions: [ViewPost]
        })
        await controller.setup(true)

        // Create test data
        const richUser = await system.storage.create('User', { name: 'Rich', credits: 20 })
        const poorUser = await system.storage.create('User', { name: 'Poor', credits: 5 })

        // Test viewing regular post - should pass for both users
        const regularPost = { title: 'Regular Post', isPremium: false }
        
        const richRegularResult = await controller.callInteraction(ViewPost.name, {
            user: richUser,
            payload: { post: regularPost }
        })
        expect(richRegularResult.error).toBeUndefined()

        const poorRegularResult = await controller.callInteraction(ViewPost.name, {
            user: poorUser,
            payload: { post: regularPost }
        })
        expect(poorRegularResult.error).toBeUndefined()

        // Test viewing premium post
        const premiumPost = { title: 'Premium Post', isPremium: true }

        // Rich user should pass
        const richPremiumResult = await controller.callInteraction(ViewPost.name, {
            user: richUser,
            payload: { post: premiumPost }
        })
        expect(richPremiumResult.error).toBeUndefined()

        // Poor user should fail
        const poorPremiumResult = await controller.callInteraction(ViewPost.name, {
            user: poorUser,
            payload: { post: premiumPost }
        })
        expect(poorPremiumResult.error).toBeDefined()
        expect((poorPremiumResult.error as ConditionError).type).toBe('condition check failed')
        expect((poorPremiumResult.error as ConditionError).error.data.name).toBe('hasEnoughCredits')
    })

    test('should handle BoolExp combinations in conditions', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isVerified', type: 'boolean', defaultValue: () => false })
            ]
        })

        const System = Entity.create({
            name: 'System',
            properties: [
                Property.create({ name: 'maintenanceMode', type: 'boolean', defaultValue: () => false })
            ]
        })

        // Create conditions
        const systemNotInMaintenance = Condition.create({
            name: 'systemNotInMaintenance',
            content: async function(this: Controller, event: any) {
                const system = await this.system.storage.findOne('System', undefined, undefined, ['*'])
                return !system?.maintenanceMode
            }
        })

        const userIsVerified = Condition.create({
            name: 'userIsVerified',
            content: async function(this: Controller, event: any) {
                const user = await this.system.storage.findOne('User',
                    BoolExp.atom({ key: 'id', value: ['=', event.user.id] }),
                    undefined,
                    ['*']
                )
                // Handle both boolean true and numeric 1 from database
                return user?.isVerified === true || user?.isVerified === 1
            }
        })

        // Create interaction with AND conditions
        const PublishContent = Interaction.create({
            name: 'publishContent',
            action: Action.create({ name: 'publish' }),
            conditions: Conditions.create({
                content: BoolExp.atom(systemNotInMaintenance).and(BoolExp.atom(userIsVerified))
            })
        })

        controller = new Controller({
            system: system,
            entities: [User, System],
            relations: [],
            activities: [],
            interactions: [PublishContent]
        })
        await controller.setup(true)

        // Create system state
        await system.storage.create('System', { maintenanceMode: false })

        // Create test users
        const verifiedUser = await system.storage.create('User', { name: 'Verified', isVerified: true })
        const unverifiedUser = await system.storage.create('User', { name: 'Unverified', isVerified: false })

        // Test verified user when system is not in maintenance - should pass
        const verifiedResult = await controller.callInteraction(PublishContent.name, {
            user: verifiedUser
        })
        expect(verifiedResult.error).toBeUndefined()

        // Test unverified user - should fail
        const unverifiedResult = await controller.callInteraction(PublishContent.name, {
            user: unverifiedUser
        })
        expect(unverifiedResult.error).toBeDefined()
        expect((unverifiedResult.error as ConditionError).type).toBe('condition check failed')
        // The error should indicate that userIsVerified condition failed
        expect((unverifiedResult.error as ConditionError).error.data.name).toBe('userIsVerified')

        // Put system in maintenance mode
        await system.storage.update('System', undefined, { maintenanceMode: true })

        // Test verified user when system is in maintenance - should fail
        const maintenanceResult = await controller.callInteraction(PublishContent.name, {
            user: verifiedUser
        })
        expect(maintenanceResult.error).toBeDefined()
        expect((maintenanceResult.error as ConditionError).type).toBe('condition check failed')
        // The error should indicate that systemNotInMaintenance condition failed
        expect((maintenanceResult.error as ConditionError).error.data.name).toBe('systemNotInMaintenance')
    })

    describe('condition error handling', () => {
        test('should handle condition function errors gracefully', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create condition that throws error
            const buggyCondition = Condition.create({
                name: 'buggyCondition',
                content: async function(this: Controller, event: any) {
                    throw new Error('Condition evaluation failed!')
                }
            })

            const BuggyInteraction = Interaction.create({
                name: 'buggyInteraction',
                action: Action.create({ name: 'buggy' }),
                conditions: buggyCondition
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

            // Should catch error and treat as failed condition
            const result = await controller.callInteraction(BuggyInteraction.name, {
                user: user
            })
            expect(result.error).toBeDefined()
            expect((result.error as ConditionError).type).toBe('condition check failed')
            expect((result.error as ConditionError).error.data.name).toBe('buggyCondition')
        })

        test('should capture detailed exception message when condition throws', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create condition that throws error with specific message
            const detailedErrorCondition = Condition.create({
                name: 'detailedErrorCondition',
                content: async function(this: Controller, event: any) {
                    throw new Error('Database connection timeout after 30 seconds')
                }
            })

            const DetailedErrorInteraction = Interaction.create({
                name: 'detailedErrorInteraction',
                action: Action.create({ name: 'detailed' }),
                conditions: detailedErrorCondition
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                activities: [],
                interactions: [DetailedErrorInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            const result = await controller.callInteraction(DetailedErrorInteraction.name, {
                user: user
            })
            
            expect(result.error).toBeDefined()
            const conditionError = result.error as ConditionError
            expect(conditionError.type).toBe('condition check failed')
            expect(conditionError.error.data.name).toBe('detailedErrorCondition')
            
            // Verify that the detailed exception message is captured
            expect(conditionError.error.error).toContain('detailedErrorCondition')
            expect(conditionError.error.error).toContain('threw exception')
            expect(conditionError.error.error).toContain('Database connection timeout after 30 seconds')
        })

        test('should capture exception details in complex BoolExp conditions', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create conditions - one passes, one throws
            const passingCondition = Condition.create({
                name: 'passingCondition',
                content: async function(this: Controller, event: any) {
                    return true
                }
            })

            const throwingCondition = Condition.create({
                name: 'throwingCondition',
                content: async function(this: Controller, event: any) {
                    throw new Error('Network error: Failed to fetch user permissions')
                }
            })

            // Use AND - should fail at throwingCondition
            const ComplexInteraction = Interaction.create({
                name: 'complexInteraction',
                action: Action.create({ name: 'complex' }),
                conditions: Conditions.create({
                    content: BoolExp.atom(passingCondition).and(BoolExp.atom(throwingCondition))
                })
            })

            controller = new Controller({
                system: system,
                entities: [User],
                relations: [],
                activities: [],
                interactions: [ComplexInteraction]
            })
            await controller.setup(true)

            const user = await system.storage.create('User', { name: 'TestUser' })

            const result = await controller.callInteraction(ComplexInteraction.name, {
                user: user
            })
            
            expect(result.error).toBeDefined()
            const conditionError = result.error as ConditionError
            expect(conditionError.type).toBe('condition check failed')
            
            // Should identify which condition failed
            expect(conditionError.error.data.name).toBe('throwingCondition')
            
            // Should contain detailed exception message
            expect(conditionError.error.error).toContain('throwingCondition')
            expect(conditionError.error.error).toContain('Network error: Failed to fetch user permissions')
        })

        test('should handle undefined return from condition', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create condition that returns undefined
            const incompleteCondition = Condition.create({
                name: 'incompleteCondition',
                content: async function(this: Controller, event: any) {
                    // Returns undefined - framework treats as true (passes)
                    return undefined as any
                }
            })

            const IncompleteInteraction = Interaction.create({
                name: 'incompleteInteraction',
                action: Action.create({ name: 'incomplete' }),
                conditions: incompleteCondition
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

            // Framework treats undefined as true (condition passes)
            const result = await controller.callInteraction(IncompleteInteraction.name, {
                user: user
            })
            expect(result.error).toBeUndefined()
        })
    })
})
