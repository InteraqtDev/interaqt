import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from '@storage';
import { SQLiteDB } from '@drivers';
import { Entity, Property, Relation } from '@core';
describe('filtered relation', () => {
    let db: SQLiteDB
    let setup: DBSetup
    let handle: EntityQueryHandle

    beforeEach(async () => {
        db = new SQLiteDB()
        await db.open()
    })

    afterEach(async () => {
        await db.close()
    })

    test('basic filtered relation', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
            ]
        })

        const Post = Entity.create({
            name: 'Post',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'published' })
            ]
        })

        // Define relation with a property that can be filtered
        const UserPostRelation = Relation.create({
            source: User,
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'author',
            type: '1:n',
            properties: [
                Property.create({ name: 'relationshipType', type: 'string', defaultValue: () => 'author' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        })

        // Define filtered relation - only active relationships
        const ActiveUserPostRelation = Relation.create({
            name: 'ActiveUserPostRelation',
            baseRelation: UserPostRelation,
            sourceProperty: 'activePosts',
            targetProperty: 'activeAuthor',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Setup database
        setup = new DBSetup([User, Post], [UserPostRelation, ActiveUserPostRelation], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const user1 = await handle.create('User', { name: 'User 1' })
        const user2 = await handle.create('User', { name: 'User 2' })
        const post1 = await handle.create('Post', { title: 'Post 1' })
        const post2 = await handle.create('Post', { title: 'Post 2' })
        const post3 = await handle.create('Post', { title: 'Post 3' })

        // Create relations with different isActive values
        const relationName = UserPostRelation.name!
        await handle.create(relationName, {
            source: { id: user1.id },
            target: { id: post1.id },
            isActive: true
        })
        await handle.create(relationName, {
            source: { id: user1.id },
            target: { id: post2.id },
            isActive: false  // This should be filtered out
        })
        await handle.create(relationName, {
            source: { id: user2.id },
            target: { id: post3.id },
            isActive: true
        })

        // Query filtered relation - should only return active relationships
        const filteredRelations = await handle.find(
            ActiveUserPostRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isActive']
        )
        
        expect(filteredRelations.length).toBe(2)
        
        // Check that all returned relations have isActive = true
        filteredRelations.forEach(relation => {
            expect(relation.isActive).toBeTruthy() // SQLite stores booleans as 0/1
        })

        // Query all relations to verify filtering worked
        const allRelations = await handle.find(
            UserPostRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isActive']
        )
        
        expect(allRelations.length).toBe(3) // All 3 relations exist
        expect(filteredRelations.length).toBeLessThan(allRelations.length) // Filtered has fewer
        
        // Test update: Change isActive from false to true
        const inactiveRelation = allRelations.find(r => !r.isActive)
        expect(inactiveRelation).toBeDefined()
        
        await handle.update(
            UserPostRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', inactiveRelation!.id] }),
            { isActive: true }
        )
        
        // Re-query filtered relation - should now have 3 active relationships
        const filteredAfterUpdate = await handle.find(
            ActiveUserPostRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isActive']
        )
        
        expect(filteredAfterUpdate.length).toBe(3)
        
        // Test update: Change isActive from true to false for user1's relations
        const user1Relations = allRelations.filter((r: any) => r.source.id === user1.id)
        for (const rel of user1Relations) {
            await handle.update(
                UserPostRelation.name!,
                MatchExp.atom({ key: 'id', value: ['=', rel.id] }),
                { isActive: false }
            )
        }
        
        // Re-query filtered relation - should now have only 1 active relationship
        const filteredAfterSecondUpdate = await handle.find(
            ActiveUserPostRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isActive']
        )
        
        expect(filteredAfterSecondUpdate.length).toBe(1)
        expect(filteredAfterSecondUpdate[0].source.id).toBe(user2.id)
        
        // Test delete: Remove one relation
        const user2Relation = filteredAfterSecondUpdate[0]
        await handle.delete(
            UserPostRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', user2Relation.id] })
        )
        
        // Re-query filtered relation - should now have 0 active relationships
        const filteredAfterDelete = await handle.find(
            ActiveUserPostRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isActive']
        )
        
        expect(filteredAfterDelete.length).toBe(0)
    })

    test('nested filtered relation', async () => {
        // Define entities
        const Company = Entity.create({
            name: 'Company',
            properties: [
                Property.create({ name: 'name', type: 'string' })
            ]
        })

        const Department = Entity.create({
            name: 'Department',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isOperational', type: 'boolean', defaultValue: () => true })
            ]
        })

        const Employee = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        })

        // Define relations with properties
        const CompanyDepartmentRelation = Relation.create({
            source: Company,
            sourceProperty: 'departments',
            target: Department,
            targetProperty: 'company',
            type: '1:n',
            properties: [
                Property.create({ name: 'relationStatus', type: 'string', defaultValue: () => 'active' })
            ]
        })

        const DepartmentEmployeeRelation = Relation.create({
            source: Department,
            sourceProperty: 'employees',
            target: Employee,
            targetProperty: 'department',
            type: '1:n',
            properties: [
                Property.create({ name: 'employmentType', type: 'string', defaultValue: () => 'full-time' })
            ]
        })

        // Filtered relation - only active company-department relationships
        const ActiveCompanyDepartmentRelation = Relation.create({
            name: 'ActiveCompanyDepartmentRelation',
            baseRelation: CompanyDepartmentRelation,
            sourceProperty: 'activeDepartments',
            targetProperty: 'activeCompany',
            matchExpression: MatchExp.atom({
                key: 'relationStatus',
                value: ['=', 'active']
            })
        })

        // Filtered relation - only full-time employment relationships
        const FullTimeEmployeeRelation = Relation.create({
            name: 'FullTimeEmployeeRelation',
            baseRelation: DepartmentEmployeeRelation,
            sourceProperty: 'fullTimeEmployees',
            targetProperty: 'fullTimeDepartment',
            matchExpression: MatchExp.atom({
                key: 'employmentType',
                value: ['=', 'full-time']
            })
        })

        // Setup database
        setup = new DBSetup(
            [Company, Department, Employee],
            [CompanyDepartmentRelation, DepartmentEmployeeRelation, ActiveCompanyDepartmentRelation, FullTimeEmployeeRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const company = await handle.create('Company', { name: 'Test Company' })
        
        const dept1 = await handle.create('Department', { name: 'Engineering', isOperational: true })
        const dept2 = await handle.create('Department', { name: 'Research', isOperational: false })
        
        const emp1 = await handle.create('Employee', { name: 'Alice', isActive: true })
        const emp2 = await handle.create('Employee', { name: 'Bob', isActive: false })
        const emp3 = await handle.create('Employee', { name: 'Charlie', isActive: true })

        // Create company-department relations
        await handle.create(CompanyDepartmentRelation.name!, {
            source: { id: company.id },
            target: { id: dept1.id },
            relationStatus: 'active'
        })
        await handle.create(CompanyDepartmentRelation.name!, {
            source: { id: company.id },
            target: { id: dept2.id },
            relationStatus: 'inactive'  // This should be filtered out
        })
        
        // Create department-employee relations
        await handle.create(DepartmentEmployeeRelation.name!, {
            source: { id: dept1.id },
            target: { id: emp1.id },
            employmentType: 'full-time'
        })
        await handle.create(DepartmentEmployeeRelation.name!, {
            source: { id: dept1.id },
            target: { id: emp2.id },
            employmentType: 'part-time'  // This should be filtered out
        })
        await handle.create(DepartmentEmployeeRelation.name!, {
            source: { id: dept2.id },
            target: { id: emp3.id },
            employmentType: 'full-time'
        })

        // Test active company-department filter
        const activeDepts = await handle.find(
            ActiveCompanyDepartmentRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'relationStatus']
        )

        expect(activeDepts.length).toBe(1)
        expect(activeDepts[0].target.id).toBe(dept1.id)
        expect(activeDepts[0].relationStatus).toBe('active')

        // Test full-time employee filter
        const fullTimeEmps = await handle.find(
            FullTimeEmployeeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'employmentType']
        )

        expect(fullTimeEmps.length).toBe(2)
        fullTimeEmps.forEach(rel => {
            expect(rel.employmentType).toBe('full-time')
        })

        // Test combined query - full-time employees in a specific department
        const dept1FullTime = await handle.find(
            FullTimeEmployeeRelation.name!,
            MatchExp.atom({
                key: 'source.id',  // Use source.id instead of just source
                value: ['=', dept1.id]
            }),
            undefined,
            ['source', 'target', 'employmentType']
        )

        expect(dept1FullTime.length).toBe(1)
        expect(dept1FullTime[0].target.id).toBe(emp1.id)
        
        // Test update: Change relationStatus from inactive to active
        const inactiveDeptRelations = await handle.find(
            CompanyDepartmentRelation.name!,
            MatchExp.atom({ key: 'relationStatus', value: ['=', 'inactive'] }),
            undefined,
            ['id', 'source', 'target', 'relationStatus']
        )
        expect(inactiveDeptRelations.length).toBe(1)
        
        await handle.update(
            CompanyDepartmentRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', inactiveDeptRelations[0].id] }),
            { relationStatus: 'active' }
        )
        
        // Re-query active departments - should now have 2
        const activeDeptsAfterUpdate = await handle.find(
            ActiveCompanyDepartmentRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'relationStatus']
        )
        
        expect(activeDeptsAfterUpdate.length).toBe(2)
        
        // Test update: Change employmentType from part-time to full-time
        const partTimeRelations = await handle.find(
            DepartmentEmployeeRelation.name!,
            MatchExp.atom({ key: 'employmentType', value: ['=', 'part-time'] }),
            undefined,
            ['id', 'source', 'target', 'employmentType']
        )
        expect(partTimeRelations.length).toBe(1)
        
        await handle.update(
            DepartmentEmployeeRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', partTimeRelations[0].id] }),
            { employmentType: 'full-time' }
        )
        
        // Re-query full-time employees - should now have 3
        const fullTimeEmpsAfterUpdate = await handle.find(
            FullTimeEmployeeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'employmentType']
        )
        
        expect(fullTimeEmpsAfterUpdate.length).toBe(3)
        
        // Test delete: Remove an active department relation
        const dept1Relations = activeDeptsAfterUpdate.filter((r: any) => r.target.id === dept1.id)
        expect(dept1Relations.length).toBe(1)
        
        await handle.delete(
            CompanyDepartmentRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', dept1Relations[0].id] })
        )
        
        // Re-query active departments - should now have 1
        const activeDeptsAfterDelete = await handle.find(
            ActiveCompanyDepartmentRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'relationStatus']
        )
        
        expect(activeDeptsAfterDelete.length).toBe(1)
        expect(activeDeptsAfterDelete[0].target.id).toBe(dept2.id)
        
        // Test delete: Remove a full-time employee relation from dept2
        const dept2EmpRelations = await handle.find(
            DepartmentEmployeeRelation.name!,
            MatchExp.atom({ key: 'source.id', value: ['=', dept2.id] })
                .and({ key: 'employmentType', value: ['=', 'full-time'] }),
            undefined,
            ['id', 'source', 'target', 'employmentType']
        )
        expect(dept2EmpRelations.length).toBeGreaterThan(0)
        
        await handle.delete(
            DepartmentEmployeeRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', dept2EmpRelations[0].id] })
        )
        
        // Re-query full-time employees - should now have 2
        const fullTimeEmpsAfterDelete = await handle.find(
            FullTimeEmployeeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'employmentType']
        )
        
        expect(fullTimeEmpsAfterDelete.length).toBe(2)
    })

    test('filtered relation with properties', async () => {
        // Define entities
        const Product = Entity.create({
            name: 'Product',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'category', type: 'string' })
            ]
        })

        const Order = Entity.create({
            name: 'Order',
            properties: [
                Property.create({ name: 'orderNumber', type: 'string' }),
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'pending' })
            ]
        })

        // Define relation with properties
        const OrderProductRelation = Relation.create({
            source: Order,
            sourceProperty: 'products',
            target: Product,
            targetProperty: 'orders',
            type: 'n:n',
            properties: [
                Property.create({ name: 'quantity', type: 'number' }),
                Property.create({ name: 'price', type: 'number' })
            ]
        })

        // Filtered relation - only completed orders with high-value items
        const CompletedHighValueOrderRelation = Relation.create({
            name: 'CompletedHighValueOrderRelation',
            baseRelation: OrderProductRelation,
            sourceProperty: 'highValueProducts',
            targetProperty: 'completedOrders',
            matchExpression: MatchExp.atom({
                key: 'source.status',
                value: ['=', 'completed']
            }).and({
                key: 'price',
                value: ['>', 100]
            })
        })

        // Setup database
        setup = new DBSetup(
            [Product, Order],
            [OrderProductRelation, CompletedHighValueOrderRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const product1 = await handle.create('Product', { name: 'Product 1', category: 'Electronics' })
        const product2 = await handle.create('Product', { name: 'Product 2', category: 'Books' })

        const order1 = await handle.create('Order', { orderNumber: 'ORD001', status: 'completed' })
        const order2 = await handle.create('Order', { orderNumber: 'ORD002', status: 'pending' })

        // Create relations with properties
        await handle.create(OrderProductRelation.name!, {
            source: { id: order1.id },
            target: { id: product1.id },
            quantity: 2,
            price: 150
        })
        await handle.create(OrderProductRelation.name!, {
            source: { id: order1.id },
            target: { id: product2.id },
            quantity: 1,
            price: 50
        })
        await handle.create(OrderProductRelation.name!, {
            source: { id: order2.id },
            target: { id: product1.id },
            quantity: 1,
            price: 150
        })

        // Query filtered relation
        const filteredRelations = await handle.find(
            CompletedHighValueOrderRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'price']
        )

        expect(filteredRelations.length).toBe(1)
        expect(filteredRelations[0].source.id).toBe(order1.id)
        expect(filteredRelations[0].target.id).toBe(product1.id)
        expect(filteredRelations[0].price).toBe(150)

        // Verify that pending order and low-value product relations are filtered out
        const allRelations = await handle.find(
            OrderProductRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'price']
        )
        
        expect(allRelations.length).toBe(3)
        expect(filteredRelations.length).toBeLessThan(allRelations.length)
        
        // Test update: Change order status from pending to completed
        // First, find the pending order
        const pendingOrderRelations = await handle.find(
            OrderProductRelation.name!,
            MatchExp.atom({ key: 'source.status', value: ['=', 'pending'] }),
            undefined,
            ['id', 'source', 'target', 'price']
        )
        
        // Update the order entity directly
        await handle.update(
            'Order',
            MatchExp.atom({ key: 'id', value: ['=', order2.id] }),
            { status: 'completed' }
        )
        
        // Re-query filtered relation - should now have 2 high-value completed orders
        const filteredAfterOrderUpdate = await handle.find(
            CompletedHighValueOrderRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'price']
        )
        
        expect(filteredAfterOrderUpdate.length).toBe(2)
        
        // Test update: Change price from low to high
        const lowPriceRelations = await handle.find(
            OrderProductRelation.name!,
            MatchExp.atom({ key: 'price', value: ['<=', 100] }),
            undefined,
            ['id', 'source', 'target', 'price']
        )
        
        for (const rel of lowPriceRelations) {
            await handle.update(
                OrderProductRelation.name!,
                MatchExp.atom({ key: 'id', value: ['=', rel.id] }),
                { price: 200 }
            )
        }
        
        // Re-query filtered relation - should now have 3 high-value completed orders
        const filteredAfterPriceUpdate = await handle.find(
            CompletedHighValueOrderRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'price']
        )
        
        expect(filteredAfterPriceUpdate.length).toBe(3)
        
        // Test update: Change order status from completed to cancelled
        await handle.update(
            'Order',
            MatchExp.atom({ key: 'id', value: ['=', order1.id] }),
            { status: 'cancelled' }
        )
        
        // Re-query filtered relation - should now have 2 high-value completed orders
        const filteredAfterCancelUpdate = await handle.find(
            CompletedHighValueOrderRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'price']
        )
        
        expect(filteredAfterCancelUpdate.length).toBe(1)
        
        // Test delete: Remove order-product relations for order2
        const order2Relations = await handle.find(
            OrderProductRelation.name!,
            MatchExp.atom({ key: 'source.id', value: ['=', order2.id] }),
            undefined,
            ['id']
        )
        
        for (const rel of order2Relations) {
            await handle.delete(
                OrderProductRelation.name!,
                MatchExp.atom({ key: 'id', value: ['=', rel.id] })
            )
        }
        
        // Re-query filtered relation - should now have 0 relations (as we deleted both relations for order2)
        const filteredAfterDelete = await handle.find(
            CompletedHighValueOrderRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'price']
        )
        
        expect(filteredAfterDelete.length).toBe(0)
    })

    test('filtered relation with cross-entity filtering attempts', async () => {
        // 这个测试展示了当前的限制：不支持跨实体筛选
        // Define entities
        const Author = Entity.create({
            name: 'Author',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'verified', type: 'boolean', defaultValue: () => false })
            ]
        })

        const Book = Entity.create({
            name: 'Book',
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'published', type: 'boolean', defaultValue: () => false })
            ]
        })

        const AuthorBookRelation = Relation.create({
            name: 'authorBook',
            source: Author,
            sourceProperty: 'books',
            target: Book,
            targetProperty: 'authors',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string', defaultValue: () => 'author' })
            ]
        })

        // 尝试创建跨实体筛选的关系
        // 1. 基于源实体属性的筛选 - 只有验证过的作者
        const VerifiedAuthorRelation = Relation.create({
            name: 'VerifiedAuthorRelation',
            baseRelation: AuthorBookRelation,
            sourceProperty: 'verifiedBooks',
            targetProperty: 'verifiedAuthors',
            matchExpression: MatchExp.atom({
                key: 'source.verified',
                value: ['=', true]
            })
        })

        // 2. 基于目标实体属性的筛选 - 只有已出版的书
        const PublishedBookRelation = Relation.create({
            name: 'PublishedBookRelation',
            baseRelation: AuthorBookRelation,
            sourceProperty: 'publishedBooks',
            targetProperty: 'publishedAuthors',
            matchExpression: MatchExp.atom({
                key: 'target.published',
                value: ['=', true]
            })
        })

        // Setup database
        setup = new DBSetup(
            [Author, Book],
            [AuthorBookRelation, VerifiedAuthorRelation, PublishedBookRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const verifiedAuthor = await handle.create('Author', {
            name: 'Verified Author',
            verified: true
        })
        
        const unverifiedAuthor = await handle.create('Author', {
            name: 'Unverified Author',
            verified: false
        })

        const publishedBook = await handle.create('Book', {
            title: 'Published Book',
            published: true
        })
        
        const unpublishedBook = await handle.create('Book', {
            title: 'Unpublished Book',
            published: false
        })

        // Create relations
        await handle.create('authorBook', {
            source: { id: verifiedAuthor.id },
            target: { id: publishedBook.id },
            role: 'main author'
        })
        await handle.create('authorBook', {
            source: { id: verifiedAuthor.id },
            target: { id: unpublishedBook.id },
            role: 'co-author'
        })
        await handle.create('authorBook', {
            source: { id: unverifiedAuthor.id },
            target: { id: publishedBook.id },
            role: 'editor'
        })
        await handle.create('authorBook', {
            source: { id: unverifiedAuthor.id },
            target: { id: unpublishedBook.id },
            role: 'reviewer'
        })

        // Test: VerifiedAuthorRelation should only show relations from verified authors
        const verifiedAuthorRelations = await handle.find(
            'VerifiedAuthorRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        expect(verifiedAuthorRelations.length).toBe(2)
        expect(verifiedAuthorRelations.every((r: any) => r.source.id === verifiedAuthor.id)).toBe(true)
        
        // Test: PublishedBookRelation should only show relations to published books
        const publishedBookRelations = await handle.find(
            'PublishedBookRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        expect(publishedBookRelations.length).toBe(2)
        expect(publishedBookRelations.every((r: any) => r.target.id === publishedBook.id)).toBe(true)
        
        // Test update: Change author from unverified to verified
        await handle.update(
            'Author',
            MatchExp.atom({ key: 'id', value: ['=', unverifiedAuthor.id] }),
            { verified: true }
        )
        
        // Re-query verified author relations - should now have 4
        const verifiedAfterAuthorUpdate = await handle.find(
            'VerifiedAuthorRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        expect(verifiedAfterAuthorUpdate.length).toBe(4)
        
        // Test update: Change book from unpublished to published
        await handle.update(
            'Book',
            MatchExp.atom({ key: 'id', value: ['=', unpublishedBook.id] }),
            { published: true }
        )
        
        // Re-query published book relations - should now have 4
        const publishedAfterBookUpdate = await handle.find(
            'PublishedBookRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        expect(publishedAfterBookUpdate.length).toBe(4)
        
        // Test update: Change author back to unverified
        await handle.update(
            'Author',
            MatchExp.atom({ key: 'id', value: ['=', verifiedAuthor.id] }),
            { verified: false }
        )
        
        // Re-query verified author relations - should now have 2
        const verifiedAfterSecondUpdate = await handle.find(
            'VerifiedAuthorRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        expect(verifiedAfterSecondUpdate.length).toBe(2)
        expect(verifiedAfterSecondUpdate.every((r: any) => r.source.id === unverifiedAuthor.id)).toBe(true)
        
        // Test delete: Remove all relations for unverified author
        const unverifiedAuthorRelations = await handle.find(
            'authorBook',
            MatchExp.atom({ key: 'source.id', value: ['=', unverifiedAuthor.id] }),
            undefined,
            ['id']
        )
        
        for (const rel of unverifiedAuthorRelations) {
            await handle.delete(
                'authorBook',
                MatchExp.atom({ key: 'id', value: ['=', rel.id] })
            )
        }
        
        // Re-query both filtered relations
        const verifiedAfterDelete = await handle.find(
            'VerifiedAuthorRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        const publishedAfterDelete = await handle.find(
            'PublishedBookRelation',
            undefined,
            undefined,
            ['id', 'role', 'source', 'target']
        )
        
        expect(verifiedAfterDelete.length).toBe(0)
        expect(publishedAfterDelete.length).toBe(2)
    })

    test('multi-level filtered relations', async () => {
        // 测试多层级的 filtered relations
        const Country = Entity.create({
            name: 'Country',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        })

        const City = Entity.create({
            name: 'City',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'population', type: 'number' })
            ]
        })

        const Store = Entity.create({
            name: 'Store',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'revenue', type: 'number' })
            ]
        })

        // Base relations
        const CountryCityRelation = Relation.create({
            source: Country,
            sourceProperty: 'cities',
            target: City,
            targetProperty: 'country',
            type: '1:n',
            properties: [
                Property.create({ name: 'isCapital', type: 'boolean', defaultValue: () => false }),
                Property.create({ name: 'tier', type: 'number', defaultValue: () => 2 })
            ]
        })

        const CityStoreRelation = Relation.create({
            source: City,
            sourceProperty: 'stores',
            target: Store,
            targetProperty: 'city',
            type: '1:n',
            properties: [
                Property.create({ name: 'storeType', type: 'string', defaultValue: () => 'regular' }),
                Property.create({ name: 'yearEstablished', type: 'number' })
            ]
        })

        // Filtered relations - 层级1：首都城市
        const CapitalCityRelation = Relation.create({
            name: 'CapitalCityRelation',
            baseRelation: CountryCityRelation,
            sourceProperty: 'capitalCities',
            targetProperty: 'capitalCountry',
            matchExpression: MatchExp.atom({
                key: 'isCapital',
                value: ['=', true]
            })
        })

        // Filtered relations - 层级1：一线城市
        const Tier1CityRelation = Relation.create({
            name: 'Tier1CityRelation',
            baseRelation: CountryCityRelation,
            sourceProperty: 'tier1Cities',
            targetProperty: 'tier1Country',
            matchExpression: MatchExp.atom({
                key: 'tier',
                value: ['=', 1]
            })
        })

        // Filtered relations - 层级2：旗舰店
        const FlagshipStoreRelation = Relation.create({
            name: 'FlagshipStoreRelation',
            baseRelation: CityStoreRelation,
            sourceProperty: 'flagshipStores',
            targetProperty: 'flagshipCity',
            matchExpression: MatchExp.atom({
                key: 'storeType',
                value: ['=', 'flagship']
            })
        })

        // Filtered relations - 层级2：新店（2020年后）
        const NewStoreRelation = Relation.create({
            name: 'NewStoreRelation',
            baseRelation: CityStoreRelation,
            sourceProperty: 'newStores',
            targetProperty: 'newStoreCity',
            matchExpression: MatchExp.atom({
                key: 'yearEstablished',
                value: ['>=', 2020]
            })
        })

        // Setup database
        setup = new DBSetup(
            [Country, City, Store],
            [CountryCityRelation, CityStoreRelation, CapitalCityRelation, Tier1CityRelation, FlagshipStoreRelation, NewStoreRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const usa = await handle.create('Country', { name: 'USA', isActive: true })
        const china = await handle.create('Country', { name: 'China', isActive: true })

        const washington = await handle.create('City', { name: 'Washington DC', population: 700000 })
        const newyork = await handle.create('City', { name: 'New York', population: 8000000 })
        const beijing = await handle.create('City', { name: 'Beijing', population: 21000000 })
        const shanghai = await handle.create('City', { name: 'Shanghai', population: 24000000 })

        // Create country-city relations
        await handle.create(CountryCityRelation.name!, {
            source: { id: usa.id },
            target: { id: washington.id },
            isCapital: true,
            tier: 2
        })
        await handle.create(CountryCityRelation.name!, {
            source: { id: usa.id },
            target: { id: newyork.id },
            isCapital: false,
            tier: 1
        })
        await handle.create(CountryCityRelation.name!, {
            source: { id: china.id },
            target: { id: beijing.id },
            isCapital: true,
            tier: 1
        })
        await handle.create(CountryCityRelation.name!, {
            source: { id: china.id },
            target: { id: shanghai.id },
            isCapital: false,
            tier: 1
        })

        // Create stores
        const store1 = await handle.create('Store', { name: 'DC Store', revenue: 1000000 })
        const store2 = await handle.create('Store', { name: 'NY Flagship', revenue: 5000000 })
        const store3 = await handle.create('Store', { name: 'Beijing Main', revenue: 3000000 })
        const store4 = await handle.create('Store', { name: 'Shanghai New', revenue: 2000000 })

        // Create city-store relations
        await handle.create(CityStoreRelation.name!, {
            source: { id: washington.id },
            target: { id: store1.id },
            storeType: 'regular',
            yearEstablished: 2018
        })
        await handle.create(CityStoreRelation.name!, {
            source: { id: newyork.id },
            target: { id: store2.id },
            storeType: 'flagship',
            yearEstablished: 2021
        })
        await handle.create(CityStoreRelation.name!, {
            source: { id: beijing.id },
            target: { id: store3.id },
            storeType: 'flagship',
            yearEstablished: 2019
        })
        await handle.create(CityStoreRelation.name!, {
            source: { id: shanghai.id },
            target: { id: store4.id },
            storeType: 'regular',
            yearEstablished: 2022
        })

        // Test capital cities
        const capitals = await handle.find(
            CapitalCityRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isCapital']
        )
        expect(capitals.length).toBe(2)
        expect(capitals.every(rel => rel.isCapital)).toBe(true)

        // Test tier 1 cities
        const tier1Cities = await handle.find(
            Tier1CityRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'tier']
        )
        expect(tier1Cities.length).toBe(3)
        expect(tier1Cities.every(rel => rel.tier === 1)).toBe(true)

        // Test flagship stores
        const flagshipStores = await handle.find(
            FlagshipStoreRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'storeType']
        )
        expect(flagshipStores.length).toBe(2)
        expect(flagshipStores.every(rel => rel.storeType === 'flagship')).toBe(true)

        // Test new stores
        const newStores = await handle.find(
            NewStoreRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'yearEstablished']
        )
        expect(newStores.length).toBe(2)
        expect(newStores.every(rel => rel.yearEstablished >= 2020)).toBe(true)

        // 组合查询：找出特定国家的首都
        const usaCapitals = await handle.find(
            CapitalCityRelation.name!,
            MatchExp.atom({
                key: 'source.id',
                value: ['=', usa.id]
            }),
            undefined,
            ['source', 'target', 'isCapital']
        )
        expect(usaCapitals.length).toBe(1)
        expect(usaCapitals[0].target.id).toBe(washington.id)
        
        // Test update: Change a city from non-capital to capital
        const newyorkRelations = await handle.find(
            CountryCityRelation.name!,
            MatchExp.atom({ key: 'target.id', value: ['=', newyork.id] }),
            undefined,
            ['id', 'source', 'target', 'isCapital']
        )
        expect(newyorkRelations.length).toBe(1)
        
        await handle.update(
            CountryCityRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', newyorkRelations[0].id] }),
            { isCapital: true }
        )
        
        // Re-query capital cities - should now have 3
        const capitalCitiesAfterUpdate = await handle.find(
            CapitalCityRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isCapital']
        )
        expect(capitalCitiesAfterUpdate.length).toBe(3)
        
        // Test update: Change store type from regular to flagship
        const regularStores = await handle.find(
            CityStoreRelation.name!,
            MatchExp.atom({ key: 'storeType', value: ['=', 'regular'] }),
            undefined,
            ['id', 'source', 'target', 'storeType']
        )
        expect(regularStores.length).toBeGreaterThan(0)
        
        await handle.update(
            CityStoreRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', regularStores[0].id] }),
            { storeType: 'flagship' }
        )
        
        // Re-query flagship stores - should now have 3
        const flagshipStoresAfterUpdate = await handle.find(
            FlagshipStoreRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'storeType']
        )
        expect(flagshipStoresAfterUpdate.length).toBe(3)
        
        // Test update: Change year established to old year
        const store4Relations = await handle.find(
            CityStoreRelation.name!,
            MatchExp.atom({ key: 'target.id', value: ['=', store4.id] }),
            undefined,
            ['id', 'source', 'target', 'yearEstablished']
        )
        expect(store4Relations.length).toBe(1)
        
        await handle.update(
            CityStoreRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', store4Relations[0].id] }),
            { yearEstablished: 2010 }
        )
        
        // Re-query new stores - should now have 1
        const newStoresAfterUpdate = await handle.find(
            NewStoreRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'yearEstablished']
        )
        expect(newStoresAfterUpdate.length).toBe(1)
        
        // Test delete: Remove capital city relations
        const capitalRelations = await handle.find(
            CountryCityRelation.name!,
            MatchExp.atom({ key: 'isCapital', value: ['=', true] }),
            undefined,
            ['id']
        )
        
        for (const rel of capitalRelations) {
            await handle.delete(
                CountryCityRelation.name!,
                MatchExp.atom({ key: 'id', value: ['=', rel.id] })
            )
        }
        
        // Re-query capital cities - should now have 0
        const capitalCitiesAfterDelete = await handle.find(
            CapitalCityRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'isCapital']
        )
        expect(capitalCitiesAfterDelete.length).toBe(0)
        
        // Re-query tier 1 cities - should still have some (as not all tier 1 cities were capitals)
        const tier1CitiesAfterDelete = await handle.find(
            Tier1CityRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'tier']
        )
        expect(tier1CitiesAfterDelete.length).toBeGreaterThan(0)
    })

    test('filtered relation with complex boolean expressions', async () => {
        // 测试复杂的布尔表达式过滤
        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'budget', type: 'number' })
            ]
        })

        const Developer = Entity.create({
            name: 'Developer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'level', type: 'string' })
            ]
        })

        const ProjectDeveloperRelation = Relation.create({
            source: Project,
            sourceProperty: 'developers',
            target: Developer,
            targetProperty: 'projects',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'hoursPerWeek', type: 'number' }),
                Property.create({ name: 'rate', type: 'number' }),
                Property.create({ name: 'startDate', type: 'string' })
            ]
        })

        // 复杂过滤：高级开发者且每周工作时间大于20小时
        const SeniorActiveRelation = Relation.create({
            name: 'SeniorActiveRelation',
            baseRelation: ProjectDeveloperRelation,
            sourceProperty: 'seniorActiveDevelopers',
            targetProperty: 'seniorActiveProjects',
            matchExpression: MatchExp.atom({
                key: 'role',
                value: ['in', ['lead', 'senior']]
            }).and({
                key: 'hoursPerWeek',
                value: ['>', 20]
            })
        })

        // 复杂过滤：高薪兼职（时薪高但工时少）
        const HighValuePartTimeRelation = Relation.create({
            name: 'HighValuePartTimeRelation',
            baseRelation: ProjectDeveloperRelation,
            sourceProperty: 'highValuePartTimeDevelopers',
            targetProperty: 'highValuePartTimeProjects',
            matchExpression: MatchExp.atom({
                key: 'rate',
                value: ['>=', 150]
            }).and({
                key: 'hoursPerWeek',
                value: ['<=', 20]
            })
        })

        // Setup database
        setup = new DBSetup(
            [Project, Developer],
            [ProjectDeveloperRelation, SeniorActiveRelation, HighValuePartTimeRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const project1 = await handle.create('Project', { name: 'Project Alpha', budget: 1000000 })
        const project2 = await handle.create('Project', { name: 'Project Beta', budget: 500000 })

        const dev1 = await handle.create('Developer', { name: 'Alice', level: 'senior' })
        const dev2 = await handle.create('Developer', { name: 'Bob', level: 'junior' })
        const dev3 = await handle.create('Developer', { name: 'Charlie', level: 'senior' })
        const dev4 = await handle.create('Developer', { name: 'David', level: 'expert' })

        // Create relations with various combinations
        await handle.create(ProjectDeveloperRelation.name!, {
            source: { id: project1.id },
            target: { id: dev1.id },
            role: 'lead',
            hoursPerWeek: 40,
            rate: 120,
            startDate: '2024-01-01'
        })
        await handle.create(ProjectDeveloperRelation.name!, {
            source: { id: project1.id },
            target: { id: dev2.id },
            role: 'junior',
            hoursPerWeek: 30,
            rate: 60,
            startDate: '2024-02-01'
        })
        await handle.create(ProjectDeveloperRelation.name!, {
            source: { id: project1.id },
            target: { id: dev3.id },
            role: 'senior',
            hoursPerWeek: 20,
            rate: 100,
            startDate: '2024-01-15'
        })
        await handle.create(ProjectDeveloperRelation.name!, {
            source: { id: project2.id },
            target: { id: dev4.id },
            role: 'consultant',
            hoursPerWeek: 10,
            rate: 200,
            startDate: '2024-03-01'
        })

        // Test senior active developers
        const seniorActive = await handle.find(
            SeniorActiveRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'role', 'hoursPerWeek']
        )
        
        expect(seniorActive.length).toBe(1)
        expect(seniorActive[0].role).toBe('lead')
        expect(seniorActive[0].hoursPerWeek).toBeGreaterThan(20)

        // Test high-value part-time
        const highValuePartTime = await handle.find(
            HighValuePartTimeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'rate', 'hoursPerWeek']
        )

        expect(highValuePartTime.length).toBe(1)
        expect(highValuePartTime[0].rate).toBeGreaterThanOrEqual(150)
        expect(highValuePartTime[0].hoursPerWeek).toBeLessThanOrEqual(20)
        
        // Test update: Change role from junior to senior
        const juniorDevRelations = await handle.find(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'role', value: ['=', 'junior'] }),
            undefined,
            ['id', 'source', 'target', 'role', 'hoursPerWeek']
        )
        expect(juniorDevRelations.length).toBeGreaterThan(0)
        
        await handle.update(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', juniorDevRelations[0].id] }),
            { role: 'senior', hoursPerWeek: 30 }
        )
        
        // Re-query senior active developers - should now have 2
        const seniorActiveAfterUpdate = await handle.find(
            SeniorActiveRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'role', 'hoursPerWeek']
        )
        expect(seniorActiveAfterUpdate.length).toBe(2)
        
        // Test update: Change hours and rate for consultant
        const consultantRelations = await handle.find(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'role', value: ['=', 'consultant'] }),
            undefined,
            ['id', 'source', 'target', 'role', 'hoursPerWeek', 'rate']
        )
        expect(consultantRelations.length).toBeGreaterThan(0)
        
        await handle.update(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', consultantRelations[0].id] }),
            { hoursPerWeek: 15, rate: 160 }
        )
        
        // Re-query high-value part-time - should now have 2
        const highValuePartTimeAfterUpdate = await handle.find(
            HighValuePartTimeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'rate', 'hoursPerWeek']
        )
        expect(highValuePartTimeAfterUpdate.length).toBe(1)
        
        // Test update: Change lead developer to part-time hours
        const leadDevRelations = await handle.find(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'role', value: ['=', 'lead'] }),
            undefined,
            ['id', 'source', 'target', 'role', 'hoursPerWeek']
        )
        expect(leadDevRelations.length).toBeGreaterThan(0)
        
        await handle.update(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'id', value: ['=', leadDevRelations[0].id] }),
            { hoursPerWeek: 20 }
        )
        
        // Re-query senior active developers - should now have 1
        const seniorActiveAfterSecondUpdate = await handle.find(
            SeniorActiveRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'role', 'hoursPerWeek']
        )
        expect(seniorActiveAfterSecondUpdate.length).toBe(1)
        
        // Re-query high-value part-time - lead should now appear here too
        const highValuePartTimeAfterSecondUpdate = await handle.find(
            HighValuePartTimeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'rate', 'hoursPerWeek']
        )
        expect(highValuePartTimeAfterSecondUpdate.length).toBe(1) // Only consultant meets the criteria (rate >= 150)
        
        // Test delete: Remove all senior developers
        const seniorAndLeadRelations = await handle.find(
            ProjectDeveloperRelation.name!,
            MatchExp.atom({ key: 'role', value: ['in', ['senior', 'lead']] }),
            undefined,
            ['id']
        )
        
        for (const rel of seniorAndLeadRelations) {
            await handle.delete(
                ProjectDeveloperRelation.name!,
                MatchExp.atom({ key: 'id', value: ['=', rel.id] })
            )
        }
        
        // Re-query both filtered relations - should be significantly reduced
        const seniorActiveAfterDelete = await handle.find(
            SeniorActiveRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'role', 'hoursPerWeek']
        )
        const highValuePartTimeAfterDelete = await handle.find(
            HighValuePartTimeRelation.name!,
            undefined,
            undefined,
            ['source', 'target', 'rate', 'hoursPerWeek']
        )
        
        expect(seniorActiveAfterDelete.length).toBe(0)
        expect(highValuePartTimeAfterDelete.length).toBe(1) // Only consultant remains
    })

    test('filtered relation with deep cross-entity filtering (3+ levels)', async () => {
        // 测试跨越多个实体层级的筛选能力
        // 场景：Organization -> Division -> Team -> Member 的四层结构
        
        const Organization = Entity.create({
            name: 'Organization',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true }),
                Property.create({ name: 'tier', type: 'string', defaultValue: () => 'standard' })
            ]
        })

        const Division = Entity.create({
            name: 'Division',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'budget', type: 'number' })
            ]
        })

        const Team = Entity.create({
            name: 'Team',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'size', type: 'number' })
            ]
        })

        const Member = Entity.create({
            name: 'Member',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'skill', type: 'string' })
            ]
        })

        const Project = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'priority', type: 'string', defaultValue: () => 'normal' })
            ]
        })

        // Define relations creating the hierarchy
        const OrgDivisionRelation = Relation.create({
            name: 'OrgDivision',
            source: Organization,
            sourceProperty: 'divisions',
            target: Division,
            targetProperty: 'organization',
            type: '1:n'
        })

        const DivisionTeamRelation = Relation.create({
            name: 'DivisionTeam',
            source: Division,
            sourceProperty: 'teams',
            target: Team,
            targetProperty: 'division',
            type: '1:n'
        })

        const TeamMemberRelation = Relation.create({
            name: 'TeamMember',
            source: Team,
            sourceProperty: 'members',
            target: Member,
            targetProperty: 'team',
            type: '1:n'
        })

        // The main relation we want to filter
        const MemberProjectRelation = Relation.create({
            name: 'MemberProject',
            source: Member,
            sourceProperty: 'projects',
            target: Project,
            targetProperty: 'members',
            type: 'n:n',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'allocation', type: 'number' }) // percentage
            ]
        })

        // Filtered relation: Only projects from members in teams of divisions in premium active organizations
        // This tests a 3-level deep cross-entity filter: source.team.division.organization.tier
        const PremiumOrgProjectRelation = Relation.create({
            name: 'PremiumOrgProjectRelation',
            baseRelation: MemberProjectRelation,
            sourceProperty: 'premiumOrgProjects',
            targetProperty: 'premiumOrgMembers',
            matchExpression: MatchExp.atom({
                key: 'source.team.division.organization.tier',
                value: ['=', 'premium']
            }).and({
                key: 'source.team.division.organization.isActive',
                value: ['=', true]
            }).and({
                key: 'target.priority',
                value: ['=', 'high']
            })
        })

        // Another filtered relation: Projects from members in large teams (size > 5) with high budget divisions
        const LargeTeamHighBudgetProjectRelation = Relation.create({
            name: 'LargeTeamHighBudgetProjectRelation',
            baseRelation: MemberProjectRelation,
            sourceProperty: 'largeTeamHighBudgetProjects',
            targetProperty: 'largeTeamHighBudgetMembers',
            matchExpression: MatchExp.atom({
                key: 'source.team.size',
                value: ['>', 5]
            }).and({
                key: 'source.team.division.budget',
                value: ['>=', 1000000]
            })
        })

        // Setup database
        setup = new DBSetup(
            [Organization, Division, Team, Member, Project],
            [OrgDivisionRelation, DivisionTeamRelation, TeamMemberRelation, MemberProjectRelation, 
             PremiumOrgProjectRelation, LargeTeamHighBudgetProjectRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data - Organizations
        const premiumOrg = await handle.create('Organization', { 
            name: 'Premium Corp', 
            isActive: true, 
            tier: 'premium' 
        })
        const standardOrg = await handle.create('Organization', { 
            name: 'Standard Inc', 
            isActive: true, 
            tier: 'standard' 
        })
        const inactiveOrg = await handle.create('Organization', { 
            name: 'Inactive Ltd', 
            isActive: false, 
            tier: 'premium' 
        })

        // Create Divisions
        const techDiv = await handle.create('Division', { 
            name: 'Tech Division', 
            budget: 2000000 
        })
        const salesDiv = await handle.create('Division', { 
            name: 'Sales Division', 
            budget: 500000 
        })
        const researchDiv = await handle.create('Division', { 
            name: 'Research Division', 
            budget: 3000000 
        })

        // Link Organizations to Divisions
        await handle.create('OrgDivision', {
            source: { id: premiumOrg.id },
            target: { id: techDiv.id }
        })
        await handle.create('OrgDivision', {
            source: { id: standardOrg.id },
            target: { id: salesDiv.id }
        })
        await handle.create('OrgDivision', {
            source: { id: inactiveOrg.id },
            target: { id: researchDiv.id }
        })

        // Create Teams
        const devTeam = await handle.create('Team', { 
            name: 'Dev Team', 
            size: 8 
        })
        const qaTeam = await handle.create('Team', { 
            name: 'QA Team', 
            size: 4 
        })
        const bigSalesTeam = await handle.create('Team', { 
            name: 'Big Sales Team', 
            size: 10 
        })

        // Link Divisions to Teams
        await handle.create('DivisionTeam', {
            source: { id: techDiv.id },
            target: { id: devTeam.id }
        })
        await handle.create('DivisionTeam', {
            source: { id: techDiv.id },
            target: { id: qaTeam.id }
        })
        await handle.create('DivisionTeam', {
            source: { id: salesDiv.id },
            target: { id: bigSalesTeam.id }
        })

        // Create Members
        const alice = await handle.create('Member', { 
            name: 'Alice', 
            skill: 'backend' 
        })
        const bob = await handle.create('Member', { 
            name: 'Bob', 
            skill: 'frontend' 
        })
        const charlie = await handle.create('Member', { 
            name: 'Charlie', 
            skill: 'sales' 
        })

        // Link Teams to Members
        await handle.create('TeamMember', {
            source: { id: devTeam.id },
            target: { id: alice.id }
        })
        await handle.create('TeamMember', {
            source: { id: devTeam.id },
            target: { id: bob.id }
        })
        await handle.create('TeamMember', {
            source: { id: bigSalesTeam.id },
            target: { id: charlie.id }
        })

        // Create Projects
        const criticalProject = await handle.create('Project', { 
            name: 'Critical System', 
            priority: 'high' 
        })
        const normalProject = await handle.create('Project', { 
            name: 'Regular Feature', 
            priority: 'normal' 
        })
        const highSalesProject = await handle.create('Project', { 
            name: 'Big Deal', 
            priority: 'high' 
        })

        // Create Member-Project relations
        // Alice (in premium org) -> Critical Project
        await handle.create('MemberProject', {
            source: { id: alice.id },
            target: { id: criticalProject.id },
            role: 'lead',
            allocation: 80
        })
        // Alice (in premium org) -> Normal Project
        await handle.create('MemberProject', {
            source: { id: alice.id },
            target: { id: normalProject.id },
            role: 'contributor',
            allocation: 20
        })
        // Bob (in premium org) -> Critical Project
        await handle.create('MemberProject', {
            source: { id: bob.id },
            target: { id: criticalProject.id },
            role: 'developer',
            allocation: 100
        })
        // Charlie (in standard org) -> High Sales Project
        await handle.create('MemberProject', {
            source: { id: charlie.id },
            target: { id: highSalesProject.id },
            role: 'manager',
            allocation: 100
        })

        // Test 1: Premium org projects (3-level deep filtering)
        const premiumOrgProjects = await handle.find(
            'PremiumOrgProjectRelation',
            undefined,
            undefined,
            ['source', 'target', 'role', 'allocation']
        )

        // Should only include Alice and Bob's high priority project from premium org
        expect(premiumOrgProjects.length).toBe(2)
        expect(premiumOrgProjects.every((rel: any) => 
            rel.target.id === criticalProject.id
        )).toBe(true)
        expect(premiumOrgProjects.map((rel: any) => rel.source.id).sort()).toEqual(
            [alice.id, bob.id].sort()
        )

        // Test 2: Large team high budget projects (2-level deep filtering)
        const largeTeamProjects = await handle.find(
            'LargeTeamHighBudgetProjectRelation',
            undefined,
            undefined,
            ['source', 'target', 'role']
        )

        // Should include Alice and Bob's projects (team size 8, budget 2M)
        // But NOT Charlie's projects (budget only 500k)
        expect(largeTeamProjects.length).toBe(3) // Alice's 2 projects + Bob's 1 project
        expect(largeTeamProjects.every((rel: any) => 
            rel.source.id === alice.id || rel.source.id === bob.id
        )).toBe(true)

        // Verify the deep filtering by checking that no projects from standard org appear
        const allMemberProjects = await handle.find(
            'MemberProject',
            undefined,
            undefined,
            ['source', 'target']
        )
        expect(allMemberProjects.length).toBe(4) // Total of 4 member-project relations
        expect(premiumOrgProjects.length).toBeLessThan(allMemberProjects.length)
        
        // Test update: Change organization tier from standard to premium
        await handle.update(
            'Organization',
            MatchExp.atom({ key: 'id', value: ['=', standardOrg.id] }),
            { tier: 'premium' }
        )
        
        // Re-query premium org projects - should now include Charlie's project
        const premiumOrgProjectsAfterOrgUpdate = await handle.find(
            PremiumOrgProjectRelation.name!,
            undefined,
            undefined,
            ['source', 'target']
        )
        expect(premiumOrgProjectsAfterOrgUpdate.length).toBe(3) // Now includes Charlie's project
        
        // Test update: Change project priority from normal to high
        await handle.update(
            'Project',
            MatchExp.atom({ key: 'id', value: ['=', normalProject.id] }),
            { priority: 'high' }
        )
        
        // Re-query premium org projects - should now include the updated project
        const premiumOrgProjectsAfterProjectUpdate = await handle.find(
            PremiumOrgProjectRelation.name!,
            undefined,
            undefined,
            ['source', 'target']
        )
        expect(premiumOrgProjectsAfterProjectUpdate.length).toBe(4) // All projects are now included
        
        // Test update: Change team size to small
        await handle.update(
            'Team',
            MatchExp.atom({ key: 'id', value: ['=', devTeam.id] }),
            { size: 3 }
        )
        
        // Re-query large team projects - should now have 0
        const largeTeamProjectsAfterTeamUpdate = await handle.find(
            LargeTeamHighBudgetProjectRelation.name!,
            undefined,
            undefined,
            ['source', 'target']
        )
        expect(largeTeamProjectsAfterTeamUpdate.length).toBe(0)
        
        // Test update: Deactivate organization
        await handle.update(
            'Organization',
            MatchExp.atom({ key: 'id', value: ['=', premiumOrg.id] }),
            { isActive: false }
        )
        
        // Re-query premium org projects - should exclude projects from inactive org
        const premiumOrgProjectsAfterDeactivate = await handle.find(
            PremiumOrgProjectRelation.name!,
            undefined,
            undefined,
            ['source', 'target']
        )
        expect(premiumOrgProjectsAfterDeactivate.length).toBe(1) // Only Charlie's project remains
        expect(premiumOrgProjectsAfterDeactivate[0].source.id).toBe(charlie.id)
        
        // Test delete: Remove member-project relations
        const aliceRelations = await handle.find(
            'MemberProject',
            MatchExp.atom({ key: 'source.id', value: ['=', alice.id] }),
            undefined,
            ['id']
        )
        
        for (const rel of aliceRelations) {
            await handle.delete(
                'MemberProject',
                MatchExp.atom({ key: 'id', value: ['=', rel.id] })
            )
        }
        
        // Re-query all filtered relations
        const premiumOrgProjectsAfterDelete = await handle.find(
            PremiumOrgProjectRelation.name!,
            undefined,
            undefined,
            ['source', 'target']
        )
        const largeTeamProjectsAfterDelete = await handle.find(
            LargeTeamHighBudgetProjectRelation.name!,
            undefined,
            undefined,
            ['source', 'target']
        )
        
        expect(premiumOrgProjectsAfterDelete.length).toBe(1) // Only Charlie's project
        expect(largeTeamProjectsAfterDelete.length).toBe(0) // No relations left
    })

    test('filtered relation sourceProperty/targetProperty queries', async () => {
        // Define entities
        const User = Entity.create({
            name: 'User',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        })

        const Post = Entity.create({
            name: 'Post', 
            properties: [
                Property.create({ name: 'title', type: 'string' }),
                Property.create({ name: 'content', type: 'string' })
            ]
        })

        // Base relation
        const UserPostRelation = Relation.create({
            source: User,
            sourceProperty: 'posts',
            target: Post,
            targetProperty: 'author',
            type: '1:n',
            properties: [
                Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
                Property.create({ name: 'publishedAt', type: 'string' })
            ]
        })

        // Filtered relation - only published posts
        const PublishedPostRelation = Relation.create({
            name: 'PublishedPostRelation',
            baseRelation: UserPostRelation,
            sourceProperty: 'publishedPosts',
            targetProperty: 'publishedAuthor',
            matchExpression: MatchExp.atom({
                key: 'status',
                value: ['=', 'published']
            })
        })

        // Setup database
        setup = new DBSetup([User, Post], [UserPostRelation, PublishedPostRelation], db)
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const user1 = await handle.create('User', { name: 'Alice', isActive: true })
        const user2 = await handle.create('User', { name: 'Bob', isActive: false })

        const post1 = await handle.create('Post', { title: 'Post 1', content: 'Content 1' })
        const post2 = await handle.create('Post', { title: 'Post 2', content: 'Content 2' })
        const post3 = await handle.create('Post', { title: 'Post 3', content: 'Content 3' })

        // Create relations
        await handle.create(UserPostRelation.name!, {
            source: { id: user1.id },
            target: { id: post1.id },
            status: 'published',
            publishedAt: '2024-01-01'
        })
        await handle.create(UserPostRelation.name!, {
            source: { id: user1.id },
            target: { id: post2.id },
            status: 'draft'
        })
        await handle.create(UserPostRelation.name!, {
            source: { id: user2.id },
            target: { id: post3.id },
            status: 'published',
            publishedAt: '2024-01-02'
        })

        // Test 1: Query user with publishedPosts through sourceProperty
        const userWithPublishedPosts = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            [
                'id',
                'name',
                ['publishedPosts', {
                    attributeQuery: ['id', 'title', 'content']
                }]
            ]
        )

        console.log('userWithPublishedPosts:', JSON.stringify(userWithPublishedPosts, null, 2))

        expect(userWithPublishedPosts).toBeDefined()
        expect(userWithPublishedPosts!.name).toBe('Alice')
        expect(userWithPublishedPosts!.publishedPosts).toBeDefined()
        expect(userWithPublishedPosts!.publishedPosts.length).toBe(1)
        expect(userWithPublishedPosts!.publishedPosts[0].title).toBe('Post 1')

        // Test 2: Query post with publishedAuthor through targetProperty
        const postWithPublishedAuthor = await handle.findOne(
            'Post',
            MatchExp.atom({ key: 'id', value: ['=', post1.id] }),
            undefined,
            [
                'id',
                'title',
                ['publishedAuthor', {
                    attributeQuery: ['id', 'name']
                }]
            ]
        )

        expect(postWithPublishedAuthor).toBeDefined()
        expect(postWithPublishedAuthor!.title).toBe('Post 1')
        expect(postWithPublishedAuthor!.publishedAuthor).toBeDefined()
        expect(postWithPublishedAuthor!.publishedAuthor.name).toBe('Alice')

        // Test 3: Query all users with their published posts
        const allUsersWithPublishedPosts = await handle.find(
            'User',
            undefined,
            undefined,
            [
                'id',
                'name',
                ['publishedPosts', {
                    attributeQuery: ['id', 'title']
                }]
            ]
        )

        expect(allUsersWithPublishedPosts.length).toBe(2)
        const alice = allUsersWithPublishedPosts.find(u => u.name === 'Alice')
        const bob = allUsersWithPublishedPosts.find(u => u.name === 'Bob')
        
        expect(alice!.publishedPosts.length).toBe(1)
        expect(bob!.publishedPosts.length).toBe(1)

        // Test 4: Update relation status and verify filtered query
        await handle.update(
            UserPostRelation.name!,
            MatchExp.atom({ 
                key: 'source.id', 
                value: ['=', user1.id] 
            }).and({
                key: 'target.id',
                value: ['=', post2.id]
            }),
            { status: 'published', publishedAt: '2024-01-03' }
        )

        // Re-query user's published posts
        const userAfterUpdate = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            [
                'id',
                'name',
                ['publishedPosts', {
                    attributeQuery: ['id', 'title']
                }]
            ]
        )

        expect(userAfterUpdate!.publishedPosts.length).toBe(2)
        expect(userAfterUpdate!.publishedPosts.map((p: any) => p.title).sort()).toEqual(['Post 1', 'Post 2'])

        // Test 5: Create new post with relation through sourceProperty
        const newPost = await handle.create('Post', { 
            title: 'New Post',
            content: 'New Content'
        })

        await handle.create(UserPostRelation.name!, {
            source: { id: user1.id },
            target: { id: newPost.id },
            status: 'published',
            publishedAt: '2024-01-04'
        })

        // Query to verify
        const userWithNewPost = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            [
                'id',
                ['publishedPosts', {
                    attributeQuery: ['id', 'title']
                }]
            ]
        )

        expect(userWithNewPost!.publishedPosts.length).toBe(3)
        expect(userWithNewPost!.publishedPosts.find((p: any) => p.title === 'New Post')).toBeDefined()

        // Test 6: Delete relation and verify filtered query
        await handle.delete(
            UserPostRelation.name!,
            MatchExp.atom({
                key: 'source.id',
                value: ['=', user1.id]
            }).and({
                key: 'target.id', 
                value: ['=', post1.id]
            })
        )

        // Re-query
        const userAfterDelete = await handle.findOne(
            'User',
            MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
            undefined,
            [
                'id',
                ['publishedPosts', {
                    attributeQuery: ['id', 'title']
                }]
            ]
        )

        expect(userAfterDelete!.publishedPosts.length).toBe(2)
        expect(userAfterDelete!.publishedPosts.find((p: any) => p.title === 'Post 1')).toBeUndefined()
    })

    test('nested filtered relation sourceProperty/targetProperty queries', async () => {
        // Define entities
        const Company = Entity.create({
            name: 'Company',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'type', type: 'string' })
            ]
        })

        const Department = Entity.create({
            name: 'Department',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'budget', type: 'number' })
            ]
        })

        const Employee = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'salary', type: 'number' })
            ]
        })

        // Relations
        const CompanyDepartmentRelation = Relation.create({
            source: Company,
            sourceProperty: 'departments',
            target: Department,
            targetProperty: 'company',
            type: '1:n'
        })

        const DepartmentEmployeeRelation = Relation.create({
            source: Department,
            sourceProperty: 'employees',
            target: Employee,
            targetProperty: 'department',
            type: '1:n',
            properties: [
                Property.create({ name: 'role', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        })

        // Filtered relation - only active employees
        const ActiveEmployeeRelation = Relation.create({
            name: 'ActiveEmployeeRelation',
            baseRelation: DepartmentEmployeeRelation,
            sourceProperty: 'activeEmployees',
            targetProperty: 'activeDepartment',
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        })

        // Setup database
        setup = new DBSetup(
            [Company, Department, Employee],
            [CompanyDepartmentRelation, DepartmentEmployeeRelation, ActiveEmployeeRelation],
            db
        )
        await setup.createTables()
        handle = new EntityQueryHandle(new EntityToTableMap(setup.map, setup.aliasManager), db)

        // Create test data
        const company = await handle.create('Company', { name: 'Tech Corp', type: 'technology' })
        const dept1 = await handle.create('Department', { name: 'Engineering', budget: 1000000 })
        const dept2 = await handle.create('Department', { name: 'Sales', budget: 500000 })
        
        const emp1 = await handle.create('Employee', { name: 'Alice', salary: 100000 })
        const emp2 = await handle.create('Employee', { name: 'Bob', salary: 80000 })
        const emp3 = await handle.create('Employee', { name: 'Charlie', salary: 90000 })

        // Create relations
        await handle.create(CompanyDepartmentRelation.name!, {
            source: { id: company.id },
            target: { id: dept1.id }
        })
        await handle.create(CompanyDepartmentRelation.name!, {
            source: { id: company.id },
            target: { id: dept2.id }
        })

        await handle.create(DepartmentEmployeeRelation.name!, {
            source: { id: dept1.id },
            target: { id: emp1.id },
            role: 'engineer',
            isActive: true
        })
        await handle.create(DepartmentEmployeeRelation.name!, {
            source: { id: dept1.id },
            target: { id: emp2.id },
            role: 'engineer',
            isActive: false
        })
        await handle.create(DepartmentEmployeeRelation.name!, {
            source: { id: dept2.id },
            target: { id: emp3.id },
            role: 'sales',
            isActive: true
        })

        // Test nested query with filtered relation
        const companyWithActiveEmployees = await handle.findOne(
            'Company',
            MatchExp.atom({ key: 'id', value: ['=', company.id] }),
            undefined,
            [
                'id',
                'name',
                ['departments', {
                    attributeQuery: [
                        'id',
                        'name',
                        ['activeEmployees', {
                            attributeQuery: ['id', 'name', 'salary']
                        }]
                    ]
                }]
            ]
        )

        expect(companyWithActiveEmployees).toBeDefined()
        expect(companyWithActiveEmployees!.departments.length).toBe(2)
        
        const engineering = companyWithActiveEmployees!.departments.find((d: any) => d.name === 'Engineering')
        const sales = companyWithActiveEmployees!.departments.find((d: any) => d.name === 'Sales')
        
        expect(engineering!.activeEmployees.length).toBe(1)
        expect(engineering!.activeEmployees[0].name).toBe('Alice')
        
        expect(sales!.activeEmployees.length).toBe(1)
        expect(sales!.activeEmployees[0].name).toBe('Charlie')

        // Test reverse query
        const employeeWithActiveDepartment = await handle.findOne(
            'Employee',
            MatchExp.atom({ key: 'id', value: ['=', emp1.id] }),
            undefined,
            [
                'id',
                'name',
                ['activeDepartment', {
                    attributeQuery: [
                        'id',
                        'name',
                        ['company', {
                            attributeQuery: ['id', 'name']
                        }]
                    ]
                }]
            ]
        )

        expect(employeeWithActiveDepartment).toBeDefined()
        expect(employeeWithActiveDepartment!.activeDepartment).toBeDefined()
        expect(employeeWithActiveDepartment!.activeDepartment.name).toBe('Engineering')
        expect(employeeWithActiveDepartment!.activeDepartment.company.name).toBe('Tech Corp')
    })
}) 