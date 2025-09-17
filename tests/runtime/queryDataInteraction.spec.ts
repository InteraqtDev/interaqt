import { beforeEach, describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB } from '@dbclients';
import {
    Controller,
    MonoSystem,
    BoolExp,
    Interaction,
    GetAction,
    Action,
    Attributive, Query,
    QueryItem, removeAllInstance,
    MatchExp,
    Condition,
    Conditions,
    ConditionError
} from 'interaqt';

describe('Get Data Interaction', () => {
    let system: MonoSystem
    let controller: Controller

    beforeEach(async () => {
        removeAllInstance()
        system = new MonoSystem(new PGLiteDB())
    })

    describe('Basic data retrieval', () => {
        test('should get all entities without filters', async () => {
            // Define User entity
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'email', type: 'string' }),
                    Property.create({ name: 'role', type: 'string' }),
                    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
                ]
            })

            // Create a get interaction
            const GetUsers = Interaction.create({
                name: 'getUsers',
                action: GetAction,
                data: User
            })

            controller = new Controller({
                system,
                entities: [User],
                interactions: [GetUsers]
            })
            await controller.setup(true)

            // Create some test data
            await system.storage.create('User', { name: 'Alice', email: 'alice@example.com', role: 'admin' })
            await system.storage.create('User', { name: 'Bob', email: 'bob@example.com', role: 'user' })
            await system.storage.create('User', { name: 'Charlie', email: 'charlie@example.com', role: 'user' })

            // Call the interaction
            const result = await controller.callInteraction('getUsers', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'name', 'email', 'role', 'status']
                }
            })

            expect(result.error).toBeUndefined()
            expect(result.data).toBeDefined()
            const data = result.data as any[]
            expect(Array.isArray(data)).toBe(true)
            expect(data).toHaveLength(3)
            expect(data[0]).toHaveProperty('name')
            expect(data[0]).toHaveProperty('email')
        })

        test('should get entities with specific fields', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'email', type: 'string' }),
                    Property.create({ name: 'role', type: 'string' }),
                    Property.create({ name: 'bio', type: 'string' })
                ]
            })

            const GetUsers = Interaction.create({
                name: 'getUsers',
                action: GetAction,
                data: User
            })

            controller = new Controller({
                system,
                entities: [User],
                interactions: [GetUsers]
            })
            await controller.setup(true)

            await system.storage.create('User', { 
                name: 'Alice', 
                email: 'alice@example.com', 
                role: 'admin',
                bio: 'Long bio text here...'
            })

            // Get only specific fields
            const result = await controller.callInteraction('getUsers', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'name', 'email']  // Don't include bio
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(1)
            expect(data[0]).toHaveProperty('name')
            expect(data[0]).toHaveProperty('email')
            expect(data[0]).not.toHaveProperty('bio')
        })
    })

    describe('Data retrieval with filters', () => {
        test('should filter data using query.match instead of dataAttributives', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'role', type: 'string' })
                ]
            })

            // No dataAttributives, just a simple get interaction
            const GetActiveUsers = Interaction.create({
                name: 'getActiveUsers',
                action: GetAction,
                data: User
            })

            controller = new Controller({
                system,
                entities: [User],
                interactions: [GetActiveUsers]
            })
            await controller.setup(true)

            // Create test data with different statuses
            await system.storage.create('User', { name: 'Alice', status: 'active', role: 'admin' })
            await system.storage.create('User', { name: 'Bob', status: 'inactive', role: 'user' })
            await system.storage.create('User', { name: 'Charlie', status: 'active', role: 'user' })
            await system.storage.create('User', { name: 'David', status: 'deleted', role: 'user' })

            // Pass filter through query.match
            const result = await controller.callInteraction('getActiveUsers', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'status', value: ['=', 'active'] }),
                    attributeQuery: ['id', 'name', 'status', 'role']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(2)
            expect(data.every((u: any) => u.status === 'active')).toBe(true)
        })

        test('should combine multiple filters with AND logic using query.match', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'role', type: 'string' })
                ]
            })

            // No filters in interaction definition
            const GetActiveAdmins = Interaction.create({
                name: 'getActiveAdmins',
                action: GetAction,
                data: User
            })

            controller = new Controller({
                system,
                entities: [User],
                interactions: [GetActiveAdmins]
            })
            await controller.setup(true)

            await system.storage.create('User', { name: 'Alice', status: 'active', role: 'admin' })
            await system.storage.create('User', { name: 'Bob', status: 'inactive', role: 'admin' })
            await system.storage.create('User', { name: 'Charlie', status: 'active', role: 'user' })
            await system.storage.create('User', { name: 'David', status: 'active', role: 'admin' })

            // Pass combined filters through query.match
            const result = await controller.callInteraction('getActiveAdmins', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
                        .and(MatchExp.atom({ key: 'role', value: ['=', 'admin'] })),
                    attributeQuery: ['id', 'name', 'status', 'role']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(2)
            expect(data.every((u: any) => u.status === 'active' && u.role === 'admin')).toBe(true)
        })

        test('should filter products using query.match only', async () => {
            const Product = Entity.create({
                name: 'Product',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'category', type: 'string' }),
                    Property.create({ name: 'price', type: 'number' }),
                    Property.create({ name: 'inStock', type: 'boolean', defaultValue: () => true })
                ]
            })

            // No dataAttributives, just basic get interaction
            const GetProducts = Interaction.create({
                name: 'getProducts',
                action: GetAction,
                data: Product
            })

            controller = new Controller({
                system,
                entities: [Product],
                interactions: [GetProducts]
            })
            await controller.setup(true)

            await system.storage.create('Product', { name: 'Laptop', category: 'electronics', price: 999, inStock: true })
            await system.storage.create('Product', { name: 'Phone', category: 'electronics', price: 599, inStock: false })
            await system.storage.create('Product', { name: 'Desk', category: 'furniture', price: 299, inStock: true })
            await system.storage.create('Product', { name: 'Chair', category: 'furniture', price: 199, inStock: true })

            // Filter for in-stock electronics using query.match 
            const result = await controller.callInteraction('getProducts', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'category', value: ['=', 'electronics'] }),
                    attributeQuery: ['id', 'name', 'category', 'price', 'inStock']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(2)  // Both electronics products
            expect(data.every((p: any) => p.category === 'electronics')).toBe(true)
            
            // Now filter for in-stock furniture
            const furnitureResult = await controller.callInteraction('getProducts', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'inStock', value: ['=', true] }),
                    attributeQuery: ['id', 'name', 'category', 'price', 'inStock']
                }
            })
            
            const furnitureData = furnitureResult.data as any[]
            expect(furnitureData).toHaveLength(3)  // All in-stock products
        })
    })

    describe('Data retrieval with pagination and sorting', () => {
        test('should support pagination using modifier', async () => {
            const Post = Entity.create({
                name: 'Post',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'content', type: 'string' }),
                    Property.create({ name: 'createdAt', type: 'string' })
                ]
            })

            const GetPosts = Interaction.create({
                name: 'getPosts',
                action: GetAction,
                data: Post
            })

            controller = new Controller({
                system,
                entities: [Post],
                interactions: [GetPosts]
            })
            await controller.setup(true)

            // Create 10 posts
            for (let i = 1; i <= 10; i++) {
                await system.storage.create('Post', {
                    title: `Post ${i}`,
                    content: `Content of post ${i}`,
                    createdAt: new Date(2024, 0, i).toISOString()
                })
            }

            // Get first page (5 items)
            const page1 = await controller.callInteraction('getPosts', {
                user: { id: 'test-user' },
                query: {
                    modifier: { limit: 5, offset: 0 },
                    attributeQuery: ['id', 'title']
                }
            })

            expect(page1.error).toBeUndefined()
            expect((page1.data as any[]).length).toBe(5)

            // Get second page
            const page2 = await controller.callInteraction('getPosts', {
                user: { id: 'test-user' },
                query: {
                    modifier: { limit: 5, offset: 5 },
                    attributeQuery: ['id', 'title']
                }
            })

            expect(page2.error).toBeUndefined()
            expect((page2.data as any[]).length).toBe(5)
            
            // Ensure no overlap between pages
            const page1Ids = (page1.data as any[]).map((p: any) => p.id)
            const page2Ids = (page2.data as any[]).map((p: any) => p.id)
            const intersection = page1Ids.filter((id: string) => page2Ids.includes(id))
            expect(intersection).toHaveLength(0)
        })

        test('should support fixed query parameters', async () => {
            const Article = Entity.create({
                name: 'Article',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'author', type: 'string' }),
                    Property.create({ name: 'views', type: 'number', defaultValue: () => 0 })
                ]
            })

            // Create interaction with fixed pagination
            const GetTopArticles = Interaction.create({
                name: 'getTopArticles',
                action: GetAction,
                data: Article,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'modifier',
                            value: { limit: 3 } as any
                        }),
                        QueryItem.create({
                            name: 'attributeQuery',
                            value: ['id', 'title', 'views'] as any
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Article],
                interactions: [GetTopArticles]
            })
            await controller.setup(true)

            await system.storage.create('Article', { title: 'Article 1', author: 'Alice', views: 100 })
            await system.storage.create('Article', { title: 'Article 2', author: 'Bob', views: 500 })
            await system.storage.create('Article', { title: 'Article 3', author: 'Charlie', views: 250 })
            await system.storage.create('Article', { title: 'Article 4', author: 'David', views: 50 })
            await system.storage.create('Article', { title: 'Article 5', author: 'Eve', views: 750 })

            const result = await controller.callInteraction('getTopArticles', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'title', 'views']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(3)
            // Verify we got 3 articles with title and views
            data.forEach((article: any) => {
                expect(article).toHaveProperty('id')
                expect(article).toHaveProperty('title')
                expect(article).toHaveProperty('views')
            })
        })
    })

    describe('Data retrieval with user permissions', () => {
        test('should check user permissions before returning data', async () => {
            const SecretDocument = Entity.create({
                name: 'SecretDocument',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'content', type: 'string' }),
                    Property.create({ name: 'classification', type: 'string' })
                ]
            })

            // Only admins can get secret documents
            const isAdmin = Attributive.create({
                name: 'isAdmin',
                content: function(this: Controller, user: any, event: any) {
                    return user.role === 'admin'
                }
            })

            const GetSecretDocuments = Interaction.create({
                name: 'getSecretDocuments',
                action: GetAction,
                data: SecretDocument,
                userAttributives: isAdmin
            })

            controller = new Controller({
                system,
                entities: [SecretDocument],
                interactions: [GetSecretDocuments]
            })
            await controller.setup(true)

            await system.storage.create('SecretDocument', {
                title: 'Top Secret',
                content: 'Classified information',
                classification: 'top-secret'
            })

            // Try as regular user - should fail
            const regularResult = await controller.callInteraction('getSecretDocuments', {
                user: { id: 'user-1', role: 'user' },
                query: {
                    attributeQuery: ['id', 'title', 'content']
                }
            })

            expect(regularResult.error).toBeDefined()
            expect(regularResult.data).toBeUndefined()

            // Try as admin - should succeed
            const adminResult = await controller.callInteraction('getSecretDocuments', {
                user: { id: 'admin-1', role: 'admin' },
                query: {
                    attributeQuery: ['id', 'title', 'content']
                }
            })

            expect(adminResult.error).toBeUndefined()
            const adminData = adminResult.data as any[]
            expect(adminData).toHaveLength(1)
            expect(adminData[0].title).toBe('Top Secret')
        })

        test('should filter data based on user context using query.match', async () => {
            const Task = Entity.create({
                name: 'Task',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'assignedTo', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' })
                ]
            })

            // No dataAttributives, just basic get interaction
            const GetMyTasks = Interaction.create({
                name: 'getMyTasks',
                action: GetAction,
                data: Task
            })

            controller = new Controller({
                system,
                entities: [Task],
                interactions: [GetMyTasks]
            })
            await controller.setup(true)

            // Create tasks for different users
            await system.storage.create('Task', { title: 'Task 1', assignedTo: 'user-1', status: 'pending' })
            await system.storage.create('Task', { title: 'Task 2', assignedTo: 'user-2', status: 'done' })
            await system.storage.create('Task', { title: 'Task 3', assignedTo: 'user-1', status: 'in-progress' })
            await system.storage.create('Task', { title: 'Task 4', assignedTo: 'user-3', status: 'pending' })

            // Get tasks for user-1 - pass user id in query.match
            const user1Result = await controller.callInteraction('getMyTasks', {
                user: { id: 'user-1' },
                query: {
                    match: MatchExp.atom({ key: 'assignedTo', value: ['=', 'user-1'] }),
                    attributeQuery: ['id', 'title', 'assignedTo', 'status']
                }
            })

            expect(user1Result.error).toBeUndefined()
            const user1Data = user1Result.data as any[]
            expect(user1Data).toHaveLength(2)
            expect(user1Data.every((t: any) => t.assignedTo === 'user-1')).toBe(true)

            // Get tasks for user-2 - pass user id in query.match
            const user2Result = await controller.callInteraction('getMyTasks', {
                user: { id: 'user-2' },
                query: {
                    match: MatchExp.atom({ key: 'assignedTo', value: ['=', 'user-2'] }),
                    attributeQuery: ['id', 'title', 'assignedTo', 'status']
                }
            })

            expect(user2Result.error).toBeUndefined()
            const user2Data = user2Result.data as any[]
            expect(user2Data).toHaveLength(1)
            expect(user2Data[0].assignedTo).toBe('user-2')
        })
    })

    describe('Relation data retrieval', () => {
        test('should get relation data', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            const Project = Entity.create({
                name: 'Project',
                properties: [
                    Property.create({ name: 'title', type: 'string' })
                ]
            })

            const UserProjectRelation = Relation.create({
                name: 'UserProject',
                source: User,
                sourceProperty: 'projects',
                target: Project,
                targetProperty: 'members',
                type: 'n:n'
            })

            const GetUserProjects = Interaction.create({
                name: 'getUserProjects',
                action: GetAction,
                data: UserProjectRelation
            })

            controller = new Controller({
                system,
                entities: [User, Project],
                relations: [UserProjectRelation],
                interactions: [GetUserProjects]
            })
            await controller.setup(true)

            // Create users and projects
            const user1 = await system.storage.create('User', { name: 'Alice' })
            const user2 = await system.storage.create('User', { name: 'Bob' })
            const project1 = await system.storage.create('Project', { title: 'Project Alpha' })
            const project2 = await system.storage.create('Project', { title: 'Project Beta' })

            // Create relations
            await system.storage.create('UserProject', {
                source: { id: user1.id },
                target: { id: project1.id }
            })
            await system.storage.create('UserProject', {
                source: { id: user1.id },
                target: { id: project2.id }
            })
            await system.storage.create('UserProject', {
                source: { id: user2.id },
                target: { id: project1.id }
            })

            const result = await controller.callInteraction('getUserProjects', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'source', 'target']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(3)
            expect(data[0]).toHaveProperty('source')
            expect(data[0]).toHaveProperty('target')
        })
    })

    describe('Error handling', () => {
        test('should handle non-existent interaction gracefully', async () => {
            controller = new Controller({
                system,
                entities: [],
                interactions: []
            })
            await controller.setup(true)

            await expect(
                controller.callInteraction('nonExistentInteraction', {
                    user: { id: 'test-user' }
                })
            ).rejects.toThrow('Failed to call interaction')
        })

        test('should return error when action is not GetAction', async () => {
            const User = Entity.create({
                name: 'User',
                properties: [
                    Property.create({ name: 'name', type: 'string' })
                ]
            })

            // Create interaction with wrong action type
            const CreateUser = Interaction.create({
                name: 'createUser',
                action: Action.create({ name: 'create' }),  // Not GetAction
                data: User
            })

            controller = new Controller({
                system,
                entities: [User],
                interactions: [CreateUser]
            })
            await controller.setup(true)

            await system.storage.create('User', { name: 'Alice' })

            const result = await controller.callInteraction('createUser', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'name']
                }
            })

            // Should not return data since it's not a GetAction
            expect(result.data).toBeUndefined()
        })
    })

    describe('Complex query scenarios', () => {
        test('should handle OR conditions in filters using query.match', async () => {
            const Product = Entity.create({
                name: 'Product',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'category', type: 'string' }),
                    Property.create({ name: 'featured', type: 'boolean', defaultValue: () => false })
                ]
            })

            // No dataAttributives
            const GetSpecialProducts = Interaction.create({
                name: 'getSpecialProducts',
                action: GetAction,
                data: Product
            })

            controller = new Controller({
                system,
                entities: [Product],
                interactions: [GetSpecialProducts]
            })
            await controller.setup(true)

            await system.storage.create('Product', { name: 'Laptop', category: 'electronics', featured: false })
            await system.storage.create('Product', { name: 'Featured Book', category: 'books', featured: true })
            await system.storage.create('Product', { name: 'Regular Book', category: 'books', featured: false})
            await system.storage.create('Product', { name: 'Phone', category: 'electronics', featured: true })

            // Pass OR conditions through query.match
            const result = await controller.callInteraction('getSpecialProducts', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'featured', value: ['=', true] })
                        .or(MatchExp.atom({ key: 'category', value: ['=', 'electronics'] })),
                    attributeQuery: ['id', 'name', 'category', 'featured']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(3)  // Laptop, Featured Book, Phone
            
            const hasElectronicsOrFeatured = data.every((p: any) => 
                p.category === 'electronics' || p.featured === true
            )
            expect(hasElectronicsOrFeatured).toBe(true)
        })

        test('should handle IN operator for multiple values using query.match', async () => {
            const Order = Entity.create({
                name: 'Order',
                properties: [
                    Property.create({ name: 'orderNumber', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'amount', type: 'number' })
                ]
            })

            // No dataAttributives
            const GetActiveOrders = Interaction.create({
                name: 'getActiveOrders',
                action: GetAction,
                data: Order
            })

            controller = new Controller({
                system,
                entities: [Order],
                interactions: [GetActiveOrders]
            })
            await controller.setup(true)

            await system.storage.create('Order', { orderNumber: 'ORD001', status: 'pending', amount: 100 })
            await system.storage.create('Order', { orderNumber: 'ORD002', status: 'processing', amount: 200 })
            await system.storage.create('Order', { orderNumber: 'ORD003', status: 'delivered', amount: 150 })
            await system.storage.create('Order', { orderNumber: 'ORD004', status: 'cancelled', amount: 75 })
            await system.storage.create('Order', { orderNumber: 'ORD005', status: 'shipped', amount: 300 })

            // Pass IN operator through query.match
            const result = await controller.callInteraction('getActiveOrders', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({
                        key: 'status',
                        value: ['in', ['pending', 'processing', 'shipped']]
                    }),
                    attributeQuery: ['id', 'orderNumber', 'status', 'amount']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(3)
            
            const activeStatuses = ['pending', 'processing', 'shipped']
            const allActive = data.every((o: any) => activeStatuses.includes(o.status))
            expect(allActive).toBe(true)
        })
    })

    describe('Data retrieval with fixed match parameters', () => {
        test('should apply fixed match parameter from interaction definition', async () => {
            const Product = Entity.create({
                name: 'Product',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'category', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'price', type: 'number' })
                ]
            })

            // Create interaction with fixed match for status = 'active'
            const GetActiveProducts = Interaction.create({
                name: 'getActiveProducts',
                action: GetAction,
                data: Product,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Product],
                interactions: [GetActiveProducts]
            })
            await controller.setup(true)

            // Create test products with different statuses
            await system.storage.create('Product', { name: 'Product 1', category: 'electronics', status: 'active', price: 100 })
            await system.storage.create('Product', { name: 'Product 2', category: 'electronics', status: 'inactive', price: 200 })
            await system.storage.create('Product', { name: 'Product 3', category: 'furniture', status: 'active', price: 300 })
            await system.storage.create('Product', { name: 'Product 4', category: 'furniture', status: 'deleted', price: 400 })

            // Call without user match - should only get active products
            const result = await controller.callInteraction('getActiveProducts', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'name', 'category', 'status', 'price']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(2)
            expect(data.every((p: any) => p.status === 'active')).toBe(true)
        })

        test('should combine fixed match with user-provided match using AND logic', async () => {
            const Product = Entity.create({
                name: 'Product',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'category', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'price', type: 'number' })
                ]
            })

            // Create interaction with fixed match for status = 'active'
            const GetActiveProducts = Interaction.create({
                name: 'getActiveProducts',
                action: GetAction,
                data: Product,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Product],
                interactions: [GetActiveProducts]
            })
            await controller.setup(true)

            // Create test products
            await system.storage.create('Product', { name: 'Active Electronics 1', category: 'electronics', status: 'active', price: 100 })
            await system.storage.create('Product', { name: 'Inactive Electronics', category: 'electronics', status: 'inactive', price: 200 })
            await system.storage.create('Product', { name: 'Active Furniture', category: 'furniture', status: 'active', price: 300 })
            await system.storage.create('Product', { name: 'Active Electronics 2', category: 'electronics', status: 'active', price: 150 })

            // Call with user match for category = 'electronics'
            // Should only get products that are BOTH active AND electronics
            const result = await controller.callInteraction('getActiveProducts', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'category', value: ['=', 'electronics'] }),
                    attributeQuery: ['id', 'name', 'category', 'status', 'price']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(2)
            expect(data.every((p: any) => p.status === 'active' && p.category === 'electronics')).toBe(true)
        })

        test('should support fixed match with modifier and attributeQuery', async () => {
            const Article = Entity.create({
                name: 'Article',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'author', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'publishedAt', type: 'string' }),
                    Property.create({ name: 'views', type: 'number', defaultValue: () => 0 })
                ]
            })

            // Create interaction with fixed match, modifier, and attributeQuery
            const GetPublishedArticles = Interaction.create({
                name: 'getPublishedArticles',
                action: GetAction,
                data: Article,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: MatchExp.atom({ key: 'status', value: ['=', 'published'] })
                        }),
                        QueryItem.create({
                            name: 'modifier',
                            value: { limit: 5, orderBy: { views: 'desc' } } as any
                        }),
                        QueryItem.create({
                            name: 'attributeQuery',
                            value: ['id', 'title', 'author', 'views'] as any
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Article],
                interactions: [GetPublishedArticles]
            })
            await controller.setup(true)

            // Create test articles
            await system.storage.create('Article', { 
                title: 'Article 1', 
                author: 'Alice', 
                status: 'published', 
                publishedAt: '2024-01-01',
                views: 1000 
            })
            await system.storage.create('Article', { 
                title: 'Article 2', 
                author: 'Bob', 
                status: 'draft', 
                publishedAt: null,
                views: 0 
            })
            await system.storage.create('Article', { 
                title: 'Article 3', 
                author: 'Charlie', 
                status: 'published', 
                publishedAt: '2024-01-02',
                views: 500 
            })
            await system.storage.create('Article', { 
                title: 'Article 4', 
                author: 'David', 
                status: 'published', 
                publishedAt: '2024-01-03',
                views: 2000 
            })
            await system.storage.create('Article', { 
                title: 'Article 5', 
                author: 'Eve', 
                status: 'published', 
                publishedAt: '2024-01-04',
                views: 750 
            })
            await system.storage.create('Article', { 
                title: 'Article 6', 
                author: 'Frank', 
                status: 'published', 
                publishedAt: '2024-01-05',
                views: 300 
            })

            // Call with additional user filters
            const result = await controller.callInteraction('getPublishedArticles', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'views', value: ['>=', 500] }),
                    attributeQuery: ['id', 'title', 'author', 'views', 'status']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            // Should be limited to 5 by fixed modifier
            expect(data.length).toBeLessThanOrEqual(5)
            // All should be published (from fixed match) AND have views >= 500 (from user match)
            expect(data.every((a: any) => a.status === 'published' && a.views >= 500)).toBe(true)
            // Should be ordered by views desc (from fixed modifier)
            if (data.length > 1) {
                for (let i = 1; i < data.length; i++) {
                    expect(data[i-1].views).toBeGreaterThanOrEqual(data[i].views)
                }
            }
        })

        test('should work with complex fixed match expressions', async () => {
            const Task = Entity.create({
                name: 'Task',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'priority', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'assignee', type: 'string' })
                ]
            })

            // Create interaction with complex fixed match (status = 'open' AND priority IN ['high', 'critical'])
            const GetUrgentTasks = Interaction.create({
                name: 'getUrgentTasks',
                action: GetAction,
                data: Task,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: MatchExp.atom({ key: 'status', value: ['=', 'open'] })
                                .and(MatchExp.atom({ key: 'priority', value: ['in', ['high', 'critical']] }))
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Task],
                interactions: [GetUrgentTasks]
            })
            await controller.setup(true)

            // Create test tasks
            await system.storage.create('Task', { title: 'Task 1', priority: 'high', status: 'open', assignee: 'Alice' })
            await system.storage.create('Task', { title: 'Task 2', priority: 'low', status: 'open', assignee: 'Bob' })
            await system.storage.create('Task', { title: 'Task 3', priority: 'critical', status: 'closed', assignee: 'Charlie' })
            await system.storage.create('Task', { title: 'Task 4', priority: 'critical', status: 'open', assignee: 'David' })
            await system.storage.create('Task', { title: 'Task 5', priority: 'medium', status: 'open', assignee: 'Eve' })

            // Call without additional filters
            const result1 = await controller.callInteraction('getUrgentTasks', {
                user: { id: 'test-user' },
                query: {
                    attributeQuery: ['id', 'title', 'priority', 'status', 'assignee']
                }
            })

            expect(result1.error).toBeUndefined()
            const data1 = result1.data as any[]
            expect(data1).toHaveLength(2) // Task 1 and Task 4
            expect(data1.every((t: any) => 
                t.status === 'open' && ['high', 'critical'].includes(t.priority)
            )).toBe(true)

            // Call with additional assignee filter
            const result2 = await controller.callInteraction('getUrgentTasks', {
                user: { id: 'test-user' },
                query: {
                    match: MatchExp.atom({ key: 'assignee', value: ['=', 'David'] }),
                    attributeQuery: ['id', 'title', 'priority', 'status', 'assignee']
                }
            })

            expect(result2.error).toBeUndefined()
            const data2 = result2.data as any[]
            expect(data2).toHaveLength(1) // Only Task 4
            expect(data2[0].assignee).toBe('David')
            expect(data2[0].priority).toBe('critical')
            expect(data2[0].status).toBe('open')
        })
    })

    describe('Data retrieval with dynamic match conditions', () => {
        test('should support function-based match that returns MatchExp', async () => {
            const Task = Entity.create({
                name: 'Task',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'priority', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' })
                ]
            })

            // Create interaction with dynamic match function
            const GetTasksByPriority = Interaction.create({
                name: 'getTasksByPriority',
                action: GetAction,
                data: Task,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: function(this: Controller, event: any) {
                                // Dynamic match based on current state
                                const priorityFilter = event.user?.preferredPriority || 'high'
                                return MatchExp.atom({ key: 'priority', value: ['=', priorityFilter] })
                            }
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Task],
                interactions: [GetTasksByPriority]
            })
            await controller.setup(true)

            // Create test tasks
            await system.storage.create('Task', { title: 'Task 1', priority: 'low', status: 'open' })
            await system.storage.create('Task', { title: 'Task 2', priority: 'high', status: 'open' })
            await system.storage.create('Task', { title: 'Task 3', priority: 'medium', status: 'open' })
            await system.storage.create('Task', { title: 'Task 4', priority: 'high', status: 'closed' })

            // Test 1: User prefers high priority
            const highPriorityResult = await controller.callInteraction('getTasksByPriority', {
                user: { id: 'user-1', preferredPriority: 'high' },
                query: {
                    attributeQuery: ['id', 'title', 'priority', 'status']
                }
            })

            expect(highPriorityResult.error).toBeUndefined()
            const highPriorityData = highPriorityResult.data as any[]
            expect(highPriorityData).toHaveLength(2)
            expect(highPriorityData.every((t: any) => t.priority === 'high')).toBe(true)

            // Test 2: User prefers low priority
            const lowPriorityResult = await controller.callInteraction('getTasksByPriority', {
                user: { id: 'user-2', preferredPriority: 'low' },
                query: {
                    attributeQuery: ['id', 'title', 'priority', 'status']
                }
            })

            expect(lowPriorityResult.error).toBeUndefined()
            const lowPriorityData = lowPriorityResult.data as any[]
            expect(lowPriorityData).toHaveLength(1)
            expect(lowPriorityData[0].priority).toBe('low')
        })

        test('should support async function-based match', async () => {
            const Product = Entity.create({
                name: 'Product',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'category', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' })
                ]
            })

            // Mock Dictionary-like storage
            const categoryFilter = { current: 'electronics' }

            const GetFilteredProducts = Interaction.create({
                name: 'getFilteredProducts',
                action: GetAction,
                data: Product,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: async function(this: Controller, event: any) {
                                // Simulate async operation (e.g., fetching from Dictionary)
                                await new Promise(resolve => setTimeout(resolve, 10))
                                return MatchExp.atom({ 
                                    key: 'category', 
                                    value: ['=', categoryFilter.current] 
                                })
                            }
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Product],
                interactions: [GetFilteredProducts]
            })
            await controller.setup(true)

            // Create test products
            await system.storage.create('Product', { name: 'Laptop', category: 'electronics', status: 'active' })
            await system.storage.create('Product', { name: 'Phone', category: 'electronics', status: 'active' })
            await system.storage.create('Product', { name: 'Desk', category: 'furniture', status: 'active' })
            await system.storage.create('Product', { name: 'Chair', category: 'furniture', status: 'active' })

            // Test 1: Filter is set to electronics
            const electronicsResult = await controller.callInteraction('getFilteredProducts', {
                user: { id: 'user-1' },
                query: {
                    attributeQuery: ['id', 'name', 'category']
                }
            })

            expect(electronicsResult.error).toBeUndefined()
            const electronicsData = electronicsResult.data as any[]
            expect(electronicsData).toHaveLength(2)
            expect(electronicsData.every((p: any) => p.category === 'electronics')).toBe(true)

            // Test 2: Change filter to furniture
            categoryFilter.current = 'furniture'
            const furnitureResult = await controller.callInteraction('getFilteredProducts', {
                user: { id: 'user-2' },
                query: {
                    attributeQuery: ['id', 'name', 'category']
                }
            })

            expect(furnitureResult.error).toBeUndefined()
            const furnitureData = furnitureResult.data as any[]
            expect(furnitureData).toHaveLength(2)
            expect(furnitureData.every((p: any) => p.category === 'furniture')).toBe(true)
        })

        test('should combine dynamic match with user-provided match', async () => {
            const Order = Entity.create({
                name: 'Order',
                properties: [
                    Property.create({ name: 'orderNumber', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'priority', type: 'string' }),
                    Property.create({ name: 'amount', type: 'number' })
                ]
            })

            // Dynamic match for priority based on amount threshold
            const GetHighValueOrders = Interaction.create({
                name: 'getHighValueOrders',
                action: GetAction,
                data: Order,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: function(this: Controller, event: any) {
                                // High value threshold changes based on context
                                const threshold = event.user?.isVip ? 500 : 1000
                                return MatchExp.atom({ 
                                    key: 'amount', 
                                    value: ['>=', threshold] 
                                })
                            }
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Order],
                interactions: [GetHighValueOrders]
            })
            await controller.setup(true)

            // Create test orders
            await system.storage.create('Order', { orderNumber: 'ORD001', status: 'pending', priority: 'normal', amount: 300 })
            await system.storage.create('Order', { orderNumber: 'ORD002', status: 'pending', priority: 'urgent', amount: 600 })
            await system.storage.create('Order', { orderNumber: 'ORD003', status: 'delivered', priority: 'normal', amount: 1200 })
            await system.storage.create('Order', { orderNumber: 'ORD004', status: 'pending', priority: 'urgent', amount: 1500 })

            // Test 1: VIP user (threshold = 500) + filter for pending status
            const vipResult = await controller.callInteraction('getHighValueOrders', {
                user: { id: 'vip-user', isVip: true },
                query: {
                    match: MatchExp.atom({ key: 'status', value: ['=', 'pending'] }),
                    attributeQuery: ['id', 'orderNumber', 'status', 'amount']
                }
            })

            expect(vipResult.error).toBeUndefined()
            const vipData = vipResult.data as any[]
            expect(vipData).toHaveLength(2) // ORD002 and ORD004
            expect(vipData.every((o: any) => o.amount >= 500 && o.status === 'pending')).toBe(true)

            // Test 2: Regular user (threshold = 1000) + filter for urgent priority
            const regularResult = await controller.callInteraction('getHighValueOrders', {
                user: { id: 'regular-user', isVip: false },
                query: {
                    match: MatchExp.atom({ key: 'priority', value: ['=', 'urgent'] }),
                    attributeQuery: ['id', 'orderNumber', 'priority', 'amount']
                }
            })

            expect(regularResult.error).toBeUndefined()
            const regularData = regularResult.data as any[]
            expect(regularData).toHaveLength(1) // Only ORD004
            expect(regularData[0].amount).toBe(1500)
            expect(regularData[0].priority).toBe('urgent')
        })

        test('should handle function returning raw match data', async () => {
            const Document = Entity.create({
                name: 'Document',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'type', type: 'string' }),
                    Property.create({ name: 'department', type: 'string' })
                ]
            })

            const GetDepartmentDocuments = Interaction.create({
                name: 'getDepartmentDocuments',
                action: GetAction,
                data: Document,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: function(this: Controller, event: any) {
                                // Return raw match data instead of MatchExp
                                return {
                                    key: 'department',
                                    value: ['=', event.user?.department || 'general']
                                }
                            }
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Document],
                interactions: [GetDepartmentDocuments]
            })
            await controller.setup(true)

            // Create test documents
            await system.storage.create('Document', { title: 'HR Policy', type: 'policy', department: 'hr' })
            await system.storage.create('Document', { title: 'IT Guidelines', type: 'guide', department: 'it' })
            await system.storage.create('Document', { title: 'General Info', type: 'info', department: 'general' })

            // Test: User from HR department
            const result = await controller.callInteraction('getDepartmentDocuments', {
                user: { id: 'hr-user', department: 'hr' },
                query: {
                    attributeQuery: ['id', 'title', 'department']
                }
            })

            expect(result.error).toBeUndefined()
            const data = result.data as any[]
            expect(data).toHaveLength(1)
            expect(data[0].department).toBe('hr')
        })

        test('should handle function returning null/undefined', async () => {
            const Item = Entity.create({
                name: 'Item',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' })
                ]
            })

            const GetConditionalItems = Interaction.create({
                name: 'getConditionalItems',
                action: GetAction,
                data: Item,
                query: Query.create({
                    items: [
                        QueryItem.create({
                            name: 'match',
                            value: function(this: Controller, event: any) {
                                // Return null if no filter should be applied
                                if (event.user?.applyFilter === false) {
                                    return null
                                }
                                return MatchExp.atom({ key: 'status', value: ['=', 'active'] })
                            }
                        })
                    ]
                })
            })

            controller = new Controller({
                system,
                entities: [Item],
                interactions: [GetConditionalItems]
            })
            await controller.setup(true)

            // Create test items
            await system.storage.create('Item', { name: 'Item 1', status: 'active' })
            await system.storage.create('Item', { name: 'Item 2', status: 'inactive' })
            await system.storage.create('Item', { name: 'Item 3', status: 'active' })

            // Test 1: With filter applied
            const withFilterResult = await controller.callInteraction('getConditionalItems', {
                user: { id: 'user-1', applyFilter: true },
                query: {
                    attributeQuery: ['id', 'name', 'status']
                }
            })

            expect(withFilterResult.error).toBeUndefined()
            const withFilterData = withFilterResult.data as any[]
            expect(withFilterData).toHaveLength(2)
            expect(withFilterData.every((i: any) => i.status === 'active')).toBe(true)

            // Test 2: Without filter (function returns null)
            const withoutFilterResult = await controller.callInteraction('getConditionalItems', {
                user: { id: 'user-2', applyFilter: false },
                query: {
                    attributeQuery: ['id', 'name', 'status']
                }
            })

            expect(withoutFilterResult.error).toBeUndefined()
            const withoutFilterData = withoutFilterResult.data as any[]
            expect(withoutFilterData).toHaveLength(3) // All items
        })
    })

    describe('Data retrieval with Condition-based permissions', () => {
        test('should allow data retrieval when condition passes', async () => {
            const Document = Entity.create({
                name: 'Document',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'content', type: 'string' }),
                    Property.create({ name: 'classification', type: 'string' }),
                    Property.create({ name: 'department', type: 'string' })
                ]
            })

            // Condition to check if user has access to the department
            const hasDepartmentAccess = Condition.create({
                name: 'hasDepartmentAccess',
                content: async function(this: Controller, event: any) {
                    // Check if user's department matches the requested department
                    const requestedDept = event.query?.match?.raw?.data?.value?.[1] || 'all'
                    const userDept = event.user?.department || 'none'
                    
                    // User can access their own department or if they're admin
                    return userDept === requestedDept || event.user?.role === 'admin'
                }
            })

            const GetDocuments = Interaction.create({
                name: 'getDocuments',
                action: GetAction,
                data: Document,
                conditions: hasDepartmentAccess
            })

            controller = new Controller({
                system,
                entities: [Document],
                interactions: [GetDocuments]
            })
            await controller.setup(true)

            // Create test documents
            await system.storage.create('Document', { 
                title: 'HR Policy', 
                content: 'HR content', 
                classification: 'internal',
                department: 'hr'
            })
            await system.storage.create('Document', { 
                title: 'IT Security', 
                content: 'IT content', 
                classification: 'internal',
                department: 'it'
            })
            await system.storage.create('Document', { 
                title: 'Finance Report', 
                content: 'Finance content', 
                classification: 'confidential',
                department: 'finance'
            })

            // Test 1: HR user can access HR documents
            const hrResult = await controller.callInteraction('getDocuments', {
                user: { id: 'hr-user-1', department: 'hr', role: 'user' },
                query: {
                    match: MatchExp.atom({ key: 'department', value: ['=', 'hr'] }),
                    attributeQuery: ['id', 'title', 'department', 'classification']
                }
            })

            expect(hrResult.error).toBeUndefined()
            const hrData = hrResult.data as any[]
            expect(hrData).toHaveLength(1)
            expect(hrData[0].department).toBe('hr')

            // Test 2: Admin can access any department
            const adminResult = await controller.callInteraction('getDocuments', {
                user: { id: 'admin-1', department: 'management', role: 'admin' },
                query: {
                    match: MatchExp.atom({ key: 'department', value: ['=', 'finance'] }),
                    attributeQuery: ['id', 'title', 'department', 'classification']
                }
            })

            expect(adminResult.error).toBeUndefined()
            const adminData = adminResult.data as any[]
            expect(adminData).toHaveLength(1)
            expect(adminData[0].department).toBe('finance')
        })

        test('should deny data retrieval when condition fails', async () => {
            const Document = Entity.create({
                name: 'Document',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'content', type: 'string' }),
                    Property.create({ name: 'department', type: 'string' })
                ]
            })

            // Strict department access condition
            const strictDepartmentAccess = Condition.create({
                name: 'strictDepartmentAccess',
                content: async function(this: Controller, event: any) {
                    const requestedDept = event.query?.match?.raw?.data?.value?.[1]
                    const userDept = event.user?.department
                    return userDept === requestedDept
                }
            })

            const GetDocuments = Interaction.create({
                name: 'getDocuments',
                action: GetAction,
                data: Document,
                conditions: strictDepartmentAccess
            })

            controller = new Controller({
                system,
                entities: [Document],
                interactions: [GetDocuments]
            })
            await controller.setup(true)

            await system.storage.create('Document', { 
                title: 'Confidential HR', 
                content: 'Sensitive HR data', 
                department: 'hr'
            })

            // IT user tries to access HR documents - should be denied
            const result = await controller.callInteraction('getDocuments', {
                user: { id: 'it-user-1', department: 'it', role: 'user' },
                query: {
                    match: MatchExp.atom({ key: 'department', value: ['=', 'hr'] }),
                    attributeQuery: ['id', 'title', 'department']
                }
            })

            expect(result.error).toBeDefined()
            expect((result.error as ConditionError).type).toBe('condition check failed')
            expect((result.error as ConditionError).error.data.name).toBe('strictDepartmentAccess')
            expect(result.data).toBeUndefined()
        })

        test('should handle multiple conditions with AND logic', async () => {
            const SensitiveData = Entity.create({
                name: 'SensitiveData',
                properties: [
                    Property.create({ name: 'title', type: 'string' }),
                    Property.create({ name: 'level', type: 'number' }),
                    Property.create({ name: 'content', type: 'string' })
                ]
            })

            // Condition 1: User must be verified
            const userIsVerified = Condition.create({
                name: 'userIsVerified',
                content: async function(this: Controller, event: any) {
                    return event.user?.verified === true
                }
            })

            // Condition 2: User must have sufficient clearance level
            const hasClearanceLevel = Condition.create({
                name: 'hasClearanceLevel',
                content: async function(this: Controller, event: any) {
                    const userClearance = event.user?.clearanceLevel || 0
                    // For GetAction with query, we check general access
                    // User needs at least level 2 clearance for any sensitive data
                    return userClearance >= 2
                }
            })

            // Both conditions must pass
            const GetSensitiveData = Interaction.create({
                name: 'getSensitiveData',
                action: GetAction,
                data: SensitiveData,
                conditions: Conditions.create({
                    content: BoolExp.atom(userIsVerified).and(BoolExp.atom(hasClearanceLevel))
                })
            })

            controller = new Controller({
                system,
                entities: [SensitiveData],
                interactions: [GetSensitiveData]
            })
            await controller.setup(true)

            await system.storage.create('SensitiveData', { 
                title: 'Top Secret', 
                level: 5, 
                content: 'Classified information'
            })
            await system.storage.create('SensitiveData', { 
                title: 'Secret', 
                level: 3, 
                content: 'Restricted information'
            })

            // Test 1: Verified user with high clearance - should pass
            const authorizedResult = await controller.callInteraction('getSensitiveData', {
                user: { id: 'user-1', verified: true, clearanceLevel: 3 },
                query: {
                    attributeQuery: ['id', 'title', 'level']
                }
            })

            expect(authorizedResult.error).toBeUndefined()
            const authorizedData = authorizedResult.data as any[]
            expect(authorizedData).toHaveLength(2)

            // Test 2: Verified user with low clearance - should fail
            const lowClearanceResult = await controller.callInteraction('getSensitiveData', {
                user: { id: 'user-2', verified: true, clearanceLevel: 1 },
                query: {
                    attributeQuery: ['id', 'title', 'level']
                }
            })

            expect(lowClearanceResult.error).toBeDefined()
            expect((lowClearanceResult.error as ConditionError).error.data.name).toBe('hasClearanceLevel')

            // Test 3: Unverified user with high clearance - should fail
            const unverifiedResult = await controller.callInteraction('getSensitiveData', {
                user: { id: 'user-3', verified: false, clearanceLevel: 5 },
                query: {
                    attributeQuery: ['id', 'title', 'level']
                }
            })

            expect(unverifiedResult.error).toBeDefined()
            expect((unverifiedResult.error as ConditionError).error.data.name).toBe('userIsVerified')
        })

        test('should combine conditions with query.match for fine-grained access control', async () => {
            const Project = Entity.create({
                name: 'Project',
                properties: [
                    Property.create({ name: 'name', type: 'string' }),
                    Property.create({ name: 'status', type: 'string' }),
                    Property.create({ name: 'visibility', type: 'string' }),
                    Property.create({ name: 'teamId', type: 'string' })
                ]
            })

            // Condition: User can only see projects they have access to
            const canAccessProject = Condition.create({
                name: 'canAccessProject',
                content: async function(this: Controller, event: any) {
                    const userTeams = event.user?.teams || []
                    const isPublicQuery = event.query?.match?.raw?.data?.key === 'visibility' &&
                                        event.query?.match?.raw?.data?.value?.[1] === 'public'
                    
                    // Allow if querying public projects or user is in a team
                    return isPublicQuery || userTeams.length > 0
                }
            })

            const GetProjects = Interaction.create({
                name: 'getProjects',
                action: GetAction,
                data: Project,
                conditions: canAccessProject
            })

            controller = new Controller({
                system,
                entities: [Project],
                interactions: [GetProjects]
            })
            await controller.setup(true)

            // Create test projects
            await system.storage.create('Project', { 
                name: 'Public Project', 
                status: 'active',
                visibility: 'public',
                teamId: 'team-1'
            })
            await system.storage.create('Project', { 
                name: 'Team Project', 
                status: 'active',
                visibility: 'private',
                teamId: 'team-2'
            })
            await system.storage.create('Project', { 
                name: 'Another Public', 
                status: 'completed',
                visibility: 'public',
                teamId: 'team-3'
            })

            // Test 1: User without teams can see public projects
            const publicResult = await controller.callInteraction('getProjects', {
                user: { id: 'external-user', teams: [] },
                query: {
                    match: MatchExp.atom({ key: 'visibility', value: ['=', 'public'] }),
                    attributeQuery: ['id', 'name', 'visibility', 'teamId']
                }
            })

            expect(publicResult.error).toBeUndefined()
            const publicData = publicResult.data as any[]
            expect(publicData).toHaveLength(2)
            expect(publicData.every((p: any) => p.visibility === 'public')).toBe(true)

            // Test 2: User with teams can query team projects
            const teamResult = await controller.callInteraction('getProjects', {
                user: { id: 'team-member', teams: ['team-2', 'team-3'] },
                query: {
                    match: MatchExp.atom({ key: 'teamId', value: ['=', 'team-2'] }),
                    attributeQuery: ['id', 'name', 'visibility', 'teamId']
                }
            })

            expect(teamResult.error).toBeUndefined()
            const teamData = teamResult.data as any[]
            expect(teamData).toHaveLength(1)
            expect(teamData[0].teamId).toBe('team-2')

            // Test 3: User without teams cannot query private projects
            const deniedResult = await controller.callInteraction('getProjects', {
                user: { id: 'external-user', teams: [] },
                query: {
                    match: MatchExp.atom({ key: 'visibility', value: ['=', 'private'] }),
                    attributeQuery: ['id', 'name', 'visibility']
                }
            })

            expect(deniedResult.error).toBeDefined()
            expect((deniedResult.error as ConditionError).error.data.name).toBe('canAccessProject')
        })
    })
})
