import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property, Relation } from '@shared';
import TestLogger from "./testLogger.js";
import { PGLiteDB } from "@dbclients";

describe('merged entity in relation test', () => {
    const logger = new TestLogger('', true);

    test('merged entity as relation source', async () => {
        // 测试场景：使用 merged entity 作为 relation 的 source
        
        // 1. 创建基础 entities
        const customerEntity = Entity.create({
            name: 'Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' }),
                Property.create({ name: 'customerLevel', type: 'string' })
            ]
        });

        const vendorEntity = Entity.create({
            name: 'Vendor',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' }),
                Property.create({ name: 'vendorCode', type: 'string' })
            ]
        });

        const orderEntity = Entity.create({
            name: 'Order',
            properties: [
                Property.create({ name: 'orderNumber', type: 'string' }),
                Property.create({ name: 'amount', type: 'number' })
            ]
        });

        // 2. 创建 merged entity
        const contactEntity = Entity.create({
            name: 'Contact',
            inputEntities: [customerEntity, vendorEntity]
        });

        // 3. 创建 relation (使用 merged entity 作为 source)
        const contactOrderRelation = Relation.create({
            name: 'ContactOrderRelation',
            source: contactEntity,
            sourceProperty: 'orders',
            target: orderEntity,
            targetProperty: 'contact',
            type: 'n:1'
        });

        const entities = [customerEntity, vendorEntity, orderEntity, contactEntity];
        const relations = [contactOrderRelation];

        const db = new PGLiteDB(undefined, {logger});
        await db.open();

        try {
            const setup = new DBSetup(entities, relations, db);
            await setup.createTables();
            const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

            // 4. 通过 Customer 创建数据并关联 Order
            const customer1 = await entityQueryHandle.create('Customer', {
                name: 'John Doe',
                email: 'john@example.com',
                customerLevel: 'gold'
            });

            const order1 = await entityQueryHandle.create('Order', {
                orderNumber: 'ORD-001',
                amount: 100,
                contact: { id: customer1.id }
            });

            // 5. 验证可以通过 Contact (merged entity) 查询
            const contacts = await entityQueryHandle.find('Contact',
                undefined,
                undefined,
                ['id', 'name', 'email', '__Contact_input_entity']
            );

            expect(contacts).toHaveLength(1);
            expect(contacts[0].name).toBe('John Doe');
            expect(contacts[0].__Contact_input_entity).toEqual(['Customer']);

            // 6. 验证可以通过 relation 查询 Contact 的 orders
            const contactWithOrders = await entityQueryHandle.findOne('Contact',
                MatchExp.atom({ key: 'id', value: ['=', customer1.id] }),
                undefined,
                ['id', 'name', 'orders']
            );

            expect(contactWithOrders).toBeTruthy();
            expect(contactWithOrders!.orders).toBeTruthy();
            expect(contactWithOrders!.orders.id).toBe(order1.id);

            // 7. 验证可以通过反向 relation 查询
            const orderWithContact = await entityQueryHandle.findOne('Order',
                MatchExp.atom({ key: 'id', value: ['=', order1.id] }),
                undefined,
                ['id', 'orderNumber', 'contact']
            );

            expect(orderWithContact).toBeTruthy();
            expect(orderWithContact!.contact).toBeTruthy();
            expect(orderWithContact!.contact[0].id).toBe(customer1.id);

            // 8. 通过 Vendor 创建数据并关联 Order
            const vendor1 = await entityQueryHandle.create('Vendor', {
                name: 'Acme Corp',
                email: 'contact@acme.com',
                vendorCode: 'V001'
            });

            const order2 = await entityQueryHandle.create('Order', {
                orderNumber: 'ORD-002',
                amount: 200,
                contact: { id: vendor1.id }
            });

            // 9. 验证两种 input entity 都能通过 Contact 查询到
            const allContacts = await entityQueryHandle.find('Contact',
                undefined,
                undefined,
                ['id', 'name', '__Contact_input_entity']
            );

            expect(allContacts).toHaveLength(2);
            const inputTypes = allContacts.map(c => c.__Contact_input_entity[0]).sort();
            expect(inputTypes).toEqual(['Customer', 'Vendor']);

            // 10. 通过 relation contact attrubuteQuery 查找 common properties 字段。
            const orderWithContact2 = await entityQueryHandle.findOne('Order',
                MatchExp.atom({ key: 'id', value: ['=', order1.id] }),
                undefined,
                [
                    'id', 
                    'orderNumber', 
                    ['contact', { attributeQuery: ['id', 'name'] }]
                ]
            );

            expect(orderWithContact2).toBeTruthy();
            expect(orderWithContact2!.contact).toBeTruthy();
            expect(orderWithContact2!.contact[0].id).toBe(customer1.id);
            expect(orderWithContact2!.contact[0].name).toBe('John Doe');

        } finally {
            await db.close();
        }
    });

    test('merged entity as relation target', async () => {
        // 测试场景：使用 merged entity 作为 relation 的 target
        
        // 1. 创建基础 entities
        const customerEntity = Entity.create({
            name: 'Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' })
            ]
        });

        const vendorEntity = Entity.create({
            name: 'Vendor',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' })
            ]
        });

        const orderEntity = Entity.create({
            name: 'Order',
            properties: [
                Property.create({ name: 'orderNumber', type: 'string' }),
                Property.create({ name: 'totalAmount', type: 'number' })
            ]
        });

        // 2. 创建 merged entity
        const contactEntity = Entity.create({
            name: 'Contact',
            inputEntities: [customerEntity, vendorEntity]
        });

        // 3. 创建 relation (使用 merged entity 作为 target)
        const orderContactRelation = Relation.create({
            name: 'OrderContactRelation',
            source: orderEntity,
            sourceProperty: 'contact',
            target: contactEntity,
            targetProperty: 'orders',
            type: '1:n'
        });

        const entities = [customerEntity, vendorEntity, orderEntity, contactEntity];
        const relations = [orderContactRelation];

        const db = new PGLiteDB(undefined, {logger});
        await db.open();

        try {
            const setup = new DBSetup(entities, relations, db);
            await setup.createTables();
            const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

            // 4. 创建 Customer 和 Order
            const customer1 = await entityQueryHandle.create('Customer', {
                name: 'Alice Johnson',
                email: 'alice@example.com'
            });

            const order1 = await entityQueryHandle.create('Order', {
                orderNumber: 'ORD-101',
                totalAmount: 150,
                contact: [{ id: customer1.id }]
            });

            // 5. 验证通过 Order 可以查询到 Contact
            const orderWithContact = await entityQueryHandle.findOne('Order',
                MatchExp.atom({ key: 'id', value: ['=', order1.id] }),
                undefined,
                ['id', 'orderNumber', 'contact']
            );

            expect(orderWithContact).toBeTruthy();
            expect(orderWithContact!.contact).toBeTruthy();
            expect(orderWithContact!.contact[0].id).toBe(customer1.id);

            // 6. 验证通过 Contact 可以查询到 orders
            const contactWithOrders = await entityQueryHandle.findOne('Contact',
                MatchExp.atom({ key: 'id', value: ['=', customer1.id] }),
                undefined,
                ['id', 'name', 'orders']
            );

            expect(contactWithOrders).toBeTruthy();
            expect(contactWithOrders!.orders).toBeTruthy();
            // 对于 1:n 关系，从 target 方查询 source 可能返回数组
            if (Array.isArray(contactWithOrders!.orders)) {
                expect(contactWithOrders!.orders.length).toBeGreaterThan(0);
            } else {
                expect(contactWithOrders!.orders.id).toBeTruthy();
            }

        } finally {
            await db.close();
        }
    });

    test('merged entity as both source and target in different relations', async () => {
        // 测试场景：merged entity 同时作为不同 relation 的 source 和 target
        
        // 1. 创建基础 entities
        const personEntity = Entity.create({
            name: 'Person',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'personType', type: 'string' })
            ]
        });

        const companyEntity = Entity.create({
            name: 'Company',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'companyType', type: 'string' })
            ]
        });

        const projectEntity = Entity.create({
            name: 'Project',
            properties: [
                Property.create({ name: 'projectName', type: 'string' }),
                Property.create({ name: 'budget', type: 'number' })
            ]
        });

        const taskEntity = Entity.create({
            name: 'Task',
            properties: [
                Property.create({ name: 'taskName', type: 'string' }),
                Property.create({ name: 'status', type: 'string' })
            ]
        });

        // 2. 创建 merged entity
        const actorEntity = Entity.create({
            name: 'Actor',
            inputEntities: [personEntity, companyEntity]
        });

        // 3. 创建 relations (merged entity 作为 source 和 target)
        const actorOwnsProject = Relation.create({
            name: 'ActorOwnsProject',
            source: actorEntity,
            sourceProperty: 'ownedProjects',
            target: projectEntity,
            targetProperty: 'owner',
            type: 'n:1'
        });

        const taskAssignedToActor = Relation.create({
            name: 'TaskAssignedToActor',
            source: taskEntity,
            sourceProperty: 'assignee',
            target: actorEntity,
            targetProperty: 'assignedTasks',
            type: '1:n'
        });

        const entities = [personEntity, companyEntity, projectEntity, taskEntity, actorEntity];
        const relations = [actorOwnsProject, taskAssignedToActor];

        const db = new PGLiteDB(undefined, {logger});
        await db.open();

        try {
            const setup = new DBSetup(entities, relations, db);
            await setup.createTables();
            const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

            // 4. 创建 Person 和相关数据
            const person1 = await entityQueryHandle.create('Person', {
                name: 'Bob Smith',
                personType: 'individual'
            });

            const project1 = await entityQueryHandle.create('Project', {
                projectName: 'Website Redesign',
                budget: 50000,
                owner: { id: person1.id }
            });

            const task1 = await entityQueryHandle.create('Task', {
                taskName: 'Design mockups',
                status: 'in-progress',
                assignee: [{ id: person1.id }]
            });

            // 5. 验证 Actor 作为 source 的 relation
            const actorWithProjects = await entityQueryHandle.findOne('Actor',
                MatchExp.atom({ key: 'id', value: ['=', person1.id] }),
                undefined,
                ['id', 'name', 'ownedProjects']
            );

            expect(actorWithProjects).toBeTruthy();
            expect(actorWithProjects!.ownedProjects).toBeTruthy();
            expect(actorWithProjects!.ownedProjects.id).toBe(project1.id);

            // 6. 验证 Actor 作为 target 的 relation
            const actorWithTasks = await entityQueryHandle.findOne('Actor',
                MatchExp.atom({ key: 'id', value: ['=', person1.id] }),
                undefined,
                ['id', 'name', 'assignedTasks']
            );

            expect(actorWithTasks).toBeTruthy();
            expect(actorWithTasks!.assignedTasks).toBeTruthy();
            // 对于 1:n 关系，从 target 方查询 source 可能返回数组
            if (Array.isArray(actorWithTasks!.assignedTasks)) {
                expect(actorWithTasks!.assignedTasks.length).toBeGreaterThan(0);
            } else {
                expect(actorWithTasks!.assignedTasks.id).toBeTruthy();
            }

            // 7. 创建 Company 和相关数据
            const company1 = await entityQueryHandle.create('Company', {
                name: 'Tech Corp',
                companyType: 'enterprise'
            });

            const project2 = await entityQueryHandle.create('Project', {
                projectName: 'Product Launch',
                budget: 100000,
                owner: { id: company1.id }
            });

            // 8. 验证 Company 作为 Actor 也能正常工作
            const companyAsActor = await entityQueryHandle.findOne('Actor',
                MatchExp.atom({ key: 'id', value: ['=', company1.id] }),
                undefined,
                ['id', 'name', 'ownedProjects', '__Actor_input_entity']
            );

            expect(companyAsActor).toBeTruthy();
            expect(companyAsActor!.__Actor_input_entity).toEqual(['Company']);
            expect(companyAsActor!.ownedProjects).toBeTruthy();

        } finally {
            await db.close();
        }
    });

    test('merged entity with empty inputEntities and commonProperties - should handle attributeQuery', async () => {
        // 测试场景：merged entity 没有指定任何 input entity (inputEntities 为空)，
        // 只指定了 commonProperties，通过 relation 查询并指定 attributeQuery 应该不报错
        
        // 1. 创建一个普通 entity
        const orderEntity = Entity.create({
            name: 'Order',
            properties: [
                Property.create({ name: 'orderNumber', type: 'string' }),
                Property.create({ name: 'amount', type: 'number' })
            ]
        });

        // 2. 创建 merged entity：inputEntities 为空数组，但定义了 commonProperties
        const contactEntity = Entity.create({
            name: 'Contact',
            inputEntities: [], // 空数组
            commonProperties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' })
            ]
        });

        // 3. 创建 relation (使用 merged entity 作为 target)
        const orderContactRelation = Relation.create({
            name: 'OrderContactRelation',
            source: orderEntity,
            sourceProperty: 'contact',
            target: contactEntity,
            targetProperty: 'orders',
            type: 'n:1'
        });

        const entities = [orderEntity, contactEntity];
        const relations = [orderContactRelation];

        const db = new PGLiteDB(undefined, {logger});
        await db.open();

        try {
            const setup = new DBSetup(entities, relations, db);
            await setup.createTables();
            const entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);

            // 4. 创建一个 Order（没有关联 contact）
            const order1 = await entityQueryHandle.create('Order', {
                orderNumber: 'ORD-001',
                amount: 100
            });

            // 5. 通过 relation 查询并指定 attributeQuery 查询 common properties
            // 这个查询应该会触发 bug
            const orderWithContact = await entityQueryHandle.findOne('Order',
                MatchExp.atom({ key: 'id', value: ['=', order1.id] }),
                undefined,
                [
                    'id', 
                    'orderNumber', 
                    ['contact', { attributeQuery: ['id', 'name', 'email'] }]
                ]
            );

            // 验证查询结果
            expect(orderWithContact).toBeTruthy();
            expect(orderWithContact!.id).toBe(order1.id);
            expect(orderWithContact!.orderNumber).toBe('ORD-001');
            // contact 应该为 null 或空（因为没有关联任何 contact）
            expect(orderWithContact!.contact).toBeFalsy();

        } finally {
            await db.close();
        }
    });
});

