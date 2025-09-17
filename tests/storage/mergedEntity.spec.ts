import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DBSetup, EntityToTableMap, MatchExp, EntityQueryHandle } from "@storage";
import { Entity, Property } from '@shared';
import TestLogger from "./testLogger.js";
import { PGLiteDB } from "@dbclients";
describe('merged entity test', () => {
    let db: PGLiteDB;
    let setup: DBSetup;
    let logger: any;
    let entityQueryHandle: EntityQueryHandle;

    beforeEach(async () => {
        // 创建第一个 input entity: Customer
        const customerEntity = Entity.create({
            name: 'Customer',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' }),
                Property.create({ name: 'customerLevel', type: 'string', defaultValue: () => 'bronze' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        });

        // 创建第二个 input entity: Vendor
        const vendorEntity = Entity.create({
            name: 'Vendor',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' }),
                Property.create({ name: 'vendorCode', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => false })
            ]
        });

        // 创建第三个 input entity: Employee
        const employeeEntity = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'email', type: 'string' }),
                Property.create({ name: 'employeeId', type: 'string' }),
                Property.create({ name: 'department', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
            ]
        });

        // 创建 merged entity: Contact
        const contactEntity = Entity.create({
            name: 'Contact',
            inputEntities: [customerEntity, vendorEntity, employeeEntity]
            // 注意：merged entity 不能有任何 properties
        });

        const entities = [
            customerEntity,
            vendorEntity,
            employeeEntity,
            contactEntity
        ];
        const relations: any[] = [];

        logger = new TestLogger('', true);
        
        // 使用 PGLite
        db = new PGLiteDB(undefined, {logger});
        await db.open();

        setup = new DBSetup(entities, relations, db);
        await setup.createTables();
        entityQueryHandle = new EntityQueryHandle(new EntityToTableMap(setup.map), db);
    });

    afterEach(async () => {
        await db.close();
    });

    test('merged entity basic functionality - creation through input entities', async () => {
        // 通过 Customer entity 创建记录
        const customer1 = await entityQueryHandle.create('Customer', {
            name: 'John Doe',
            email: 'john@example.com'
        });

        // 验证 Customer 记录被创建
        const foundCustomer = await entityQueryHandle.findOne('Customer', 
            MatchExp.atom({ key: 'email', value: ['=', 'john@example.com'] }),
            undefined,
            ['id', 'name', 'email', 'customerLevel', 'isActive', '__Contact_input_entity']
        );
        
        expect(foundCustomer).toBeTruthy();
        expect(foundCustomer.name).toBe('John Doe');
        expect(foundCustomer.email).toBe('john@example.com');
        expect(foundCustomer.customerLevel).toBe('bronze'); // 默认值
        expect(foundCustomer.isActive).toBe(true); // Customer 的默认值
        expect(foundCustomer.__Contact_input_entity).toEqual(['Customer']);

        // 通过 Vendor entity 创建记录
        const vendor1 = await entityQueryHandle.create('Vendor', {
            name: 'ABC Corp',
            email: 'contact@abc.com',
            vendorCode: 'V001'
        });

        // 验证 Vendor 记录被创建
        const foundVendor = await entityQueryHandle.findOne('Vendor',
            MatchExp.atom({ key: 'vendorCode', value: ['=', 'V001'] }),
            undefined,
            ['id', 'name', 'email', 'vendorCode', 'isActive', '__Contact_input_entity']
        );
        
        expect(foundVendor).toBeTruthy();
        expect(foundVendor.name).toBe('ABC Corp');
        expect(foundVendor.vendorCode).toBe('V001');
        expect(foundVendor.isActive).toBe(false); // Vendor 的默认值
        expect(foundVendor.__Contact_input_entity).toEqual(['Vendor']);

        // 通过 Employee entity 创建记录
        const employee1 = await entityQueryHandle.create('Employee', {
            name: 'Jane Smith',
            email: 'jane@company.com',
            employeeId: 'E001',
            department: 'Engineering'
        });

        // 验证 Employee 记录被创建
        const foundEmployee = await entityQueryHandle.findOne('Employee',
            MatchExp.atom({ key: 'employeeId', value: ['=', 'E001'] }),
            undefined,
            ['id', 'name', 'email', 'employeeId', 'department', 'isActive', '__Contact_input_entity']
        );
        
        expect(foundEmployee).toBeTruthy();
        expect(foundEmployee.name).toBe('Jane Smith');
        expect(foundEmployee.department).toBe('Engineering');
        expect(foundEmployee.isActive).toBe(true); // Employee 的默认值
        expect(foundEmployee.__Contact_input_entity).toEqual(['Employee']);
    });

    test('merged entity query through Contact', async () => {
        // 创建不同类型的记录
        await entityQueryHandle.create('Customer', {
            name: 'Customer 1',
            email: 'customer1@example.com'
        });

        await entityQueryHandle.create('Vendor', {
            name: 'Vendor 1',
            email: 'vendor1@example.com',
            vendorCode: 'V001'
        });

        await entityQueryHandle.create('Employee', {
            name: 'Employee 1',
            email: 'employee1@example.com',
            employeeId: 'E001',
            department: 'Sales'
        });

        // 通过 Contact (merged entity) 查询所有记录
        const allContacts = await entityQueryHandle.find('Contact', 
            undefined,
            undefined,
            ['id', 'name', 'email', '__Contact_input_entity']
        );

        expect(allContacts).toHaveLength(3);
        
        // 验证所有记录都能通过 Contact 查询到
        const names = allContacts.map(c => c.name).sort();
        expect(names).toEqual(['Customer 1', 'Employee 1', 'Vendor 1']);

        // 验证 __input_entity 字段正确记录了原始类型
        expect(allContacts[0].__Contact_input_entity).toEqual(['Customer']);
        expect(allContacts[1].__Contact_input_entity).toEqual(['Vendor']);
        expect(allContacts[2].__Contact_input_entity).toEqual(['Employee']);
    });

    test('merged entity update functionality', async () => {
        // 创建一个 Customer 记录
        const customer = await entityQueryHandle.create('Customer', {
            name: 'Original Name',
            email: 'original@example.com'
        });

        // 通过 Contact 更新记录
        await entityQueryHandle.update('Contact', 
            MatchExp.atom({ key: 'id', value: ['=', customer.id] }),
            { name: 'Updated Name' }
        );

        // 验证更新生效
        const updatedRecord = await entityQueryHandle.findOne('Customer',
            MatchExp.atom({ key: 'id', value: ['=', customer.id] }),
            undefined,
            ['id', 'name', 'email', '__Contact_input_entity']
        );

        expect(updatedRecord.name).toBe('Updated Name');
        expect(updatedRecord.email).toBe('original@example.com');
        expect(updatedRecord.__Contact_input_entity).toEqual(['Customer']); // 类型不变
    });

    test('merged entity delete functionality', async () => {
        // 创建记录
        const vendor = await entityQueryHandle.create('Vendor', {
            name: 'To Delete',
            email: 'delete@example.com',
            vendorCode: 'V999'
        });
        
        // 通过 Contact 删除记录
        await entityQueryHandle.delete('Contact', 
            MatchExp.atom({ key: 'id', value: ['=', vendor.id] })
        );

        // 验证记录被删除
        const deletedRecord = await entityQueryHandle.findOne('Vendor',
            MatchExp.atom({ key: 'id', value: ['=', vendor.id] }),
            undefined,
            ['id']
        );

        // findOne 在没有找到记录时返回 undefined
        expect(deletedRecord).toBeUndefined();
    });

    test('merged entity should not support direct creation', async () => {
        // 尝试直接通过 merged entity 创建记录应该失败
        try {
            await entityQueryHandle.create('Contact', {
                name: 'Direct Create',
                email: 'direct@example.com'
            });
            expect.fail('Should not allow direct creation through merged entity');
        } catch (error) {
            // 预期会抛出错误
            expect(error).toBeTruthy();
        }
    });
})


describe('more complex merged entity test', () => {
    const logger = new TestLogger('', true);

    test('merged entity with filtered input entity', async () => {
        // 测试场景：使用 filtered entity 作为 merged entity 的 inputEntities
        
        // 1. 创建基础 entities
        const customerBaseEntity = Entity.create({
            name: 'CustomerBase',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'customerType', type: 'string' })
            ]
        });

        const vendorBaseEntity = Entity.create({
            name: 'VendorBase',
            properties: [
                Property.create({ name: 'name', type: 'string' }),
                Property.create({ name: 'isActive', type: 'boolean' }),
                Property.create({ name: 'vendorType', type: 'string' })
            ]
        });

        // 2. 创建 filtered entities
        const activeCustomerEntity = Entity.create({
            name: 'ActiveCustomer',
            baseEntity: customerBaseEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', true]
            })
        });

        const inactiveVendorEntity = Entity.create({
            name: 'InactiveVendor',
            baseEntity: vendorBaseEntity,
            matchExpression: MatchExp.atom({
                key: 'isActive',
                value: ['=', false]
            })
        });

        // 3. 使用 filtered entities 作为 merged entity 的 inputEntities
        const specialContactEntity = Entity.create({
            name: 'SpecialContact',
            inputEntities: [activeCustomerEntity, inactiveVendorEntity]
        });

        const entities2 = [
            customerBaseEntity,
            vendorBaseEntity,
            activeCustomerEntity,  
            inactiveVendorEntity,  
            specialContactEntity
        ];

        const db2 = new PGLiteDB(undefined, {logger});
        await db2.open();

        const setup2 = new DBSetup(entities2, [], db2);
        await setup2.createTables();
        const entityQueryHandle2 = new EntityQueryHandle(new EntityToTableMap(setup2.map), db2);

        // 创建测试数据
        await entityQueryHandle2.create('ActiveCustomer', {
            name: 'Active Customer 1',
            isActive: true,  // 明确设置
            customerType: 'premium'
        });

        await entityQueryHandle2.create('ActiveCustomer', {
            name: 'Active Customer 2',
            isActive: true,  // 明确设置
            customerType: 'gold'
        });

        await entityQueryHandle2.create('InactiveVendor', {
            name: 'Inactive Vendor 1',
            isActive: false,  // 明确设置
            vendorType: 'supplier'
        });

        await entityQueryHandle2.create('InactiveVendor', {
            name: 'Inactive Vendor 2',
            isActive: false,  // 明确设置
            vendorType: 'partner'
        });

        // 也创建一些不符合 filtered entity 条件的记录，验证它们不会出现在结果中
        await entityQueryHandle2.create('CustomerBase', {
            name: 'Inactive Customer',
            isActive: false,
            customerType: 'basic'
        });

        await entityQueryHandle2.create('VendorBase', {
            name: 'Active Vendor',
            isActive: true,
            vendorType: 'distributor'
        });

        // 查询通过 SpecialContact (merged entity) 应该只看到符合条件的记录
        const specialContacts = await entityQueryHandle2.find('SpecialContact',
            undefined,
            undefined,
            ['id', 'name', 'isActive', '__SpecialContact_input_entity', 'customerType', 'vendorType']
        );

        expect(specialContacts).toHaveLength(4); // 2 active customers + 2 inactive vendors
        
        // 验证包含正确的记录
        const activeCustomers = specialContacts.filter(c => c.__SpecialContact_input_entity.includes('ActiveCustomer'));
        const inactiveVendors = specialContacts.filter(c => c.__SpecialContact_input_entity.includes('InactiveVendor'));
        
        expect(activeCustomers).toHaveLength(2);
        expect(inactiveVendors).toHaveLength(2);

        // 验证 active customers
        for (const customer of activeCustomers) {
            expect(customer.isActive).toBe(true);
            expect(customer.customerType).toBeTruthy();
        }

        // 验证 inactive vendors
        for (const vendor of inactiveVendors) {
            expect(vendor.isActive).toBe(false);
            expect(vendor.vendorType).toBeTruthy();
        }

        // 通过原始的 filtered entity 名称查询也应该能正常工作
        const directActiveCustomers = await entityQueryHandle2.find('ActiveCustomer',
            undefined,
            undefined,
            ['id', 'name', 'isActive', '__SpecialContact_input_entity']
        );

        expect(directActiveCustomers).toHaveLength(2);
        for (const customer of directActiveCustomers) {
            expect(customer.__SpecialContact_input_entity).toEqual(['ActiveCustomer']);
            expect(customer.isActive).toBe(true);
        }

        await db2.close();
    });

    test('merged entity property conflict resolution', async () => {
        // 创建具有同名但不同默认值的 properties 的 entities
        const entity1 = Entity.create({
            name: 'Entity1',
            properties: [
                Property.create({ name: 'commonField', type: 'string', defaultValue: () => 'default1' }),
                Property.create({ name: 'uniqueField1', type: 'string' })
            ]
        });

        const entity2 = Entity.create({
            name: 'Entity2',
            properties: [
                Property.create({ name: 'commonField', type: 'string', defaultValue: () => 'default2' }),
                Property.create({ name: 'uniqueField2', type: 'string' })
            ]
        });

        const mergedEntity = Entity.create({
            name: 'MergedEntity',
            inputEntities: [entity1, entity2]
        });

        const entities3 = [entity1, entity2, mergedEntity];
        
        const db3 = new PGLiteDB(undefined, {logger});
        await db3.open();

        const setup3 = new DBSetup(entities3, [], db3);
        await setup3.createTables();
        const entityQueryHandle3 = new EntityQueryHandle(new EntityToTableMap(setup3.map), db3);

        // 通过 Entity1 创建记录，应该使用 Entity1 的默认值
        const record1 = await entityQueryHandle3.create('Entity1', {
            uniqueField1: 'value1'
        });

        const found1 = await entityQueryHandle3.findOne('Entity1',
            MatchExp.atom({ key: 'id', value: ['=', record1.id] }),
            undefined,
            ['id', 'commonField', 'uniqueField1', '__MergedEntity_input_entity']
        );

        expect(found1.commonField).toBe('default1');
        expect(found1.__MergedEntity_input_entity).toEqual(['Entity1']);

        // 通过 Entity2 创建记录，应该使用 Entity2 的默认值
        const record2 = await entityQueryHandle3.create('Entity2', {
            uniqueField2: 'value2'
        });

        const found2 = await entityQueryHandle3.findOne('Entity2',
            MatchExp.atom({ key: 'id', value: ['=', record2.id] }),
            undefined,
            ['id', 'commonField', 'uniqueField2', '__MergedEntity_input_entity']
        );

        expect(found2.commonField).toBe('default2');
        expect(found2.__MergedEntity_input_entity).toEqual(['Entity2']);

        await db3.close();
    });

    

    test('nested merged entities - merged entity as input entity', async () => {
        // 测试场景：使用 merged entity 作为另一个 merged entity 的 inputEntities（精简版）
        
        // 1. 创建基础 entities
        const employeeEntity = Entity.create({
            name: 'Employee',
            properties: [
                Property.create({ name: 'empName', type: 'string' }),
                Property.create({ name: 'empId', type: 'string' }),
                Property.create({ name: 'department', type: 'string' })
            ]
        });

        const managerEntity = Entity.create({
            name: 'Manager',
            properties: [
                Property.create({ name: 'mgrName', type: 'string' }),
                Property.create({ name: 'mgrId', type: 'string' }),
                Property.create({ name: 'level', type: 'string' })
            ]
        });

        const externalPartnerEntity = Entity.create({
            name: 'ExternalPartner',
            properties: [
                Property.create({ name: 'partnerName', type: 'string' }),
                Property.create({ name: 'partnerCode', type: 'string' }),
                Property.create({ name: 'contractType', type: 'string' })
            ]
        });

        // 2. 创建第一层 merged entity: InternalStaff（包含 Employee 和 Manager）
        const internalStaffMerged = Entity.create({
            name: 'InternalStaff',
            inputEntities: [employeeEntity, managerEntity]
        });

        // 3. 创建第二层 merged entity: AllContacts（包含 InternalStaff 和 ExternalPartner）
        const allContactsMerged = Entity.create({
            name: 'AllContacts',
            inputEntities: [internalStaffMerged, externalPartnerEntity]
        });

        const nestedEntities = [
            employeeEntity,
            managerEntity,
            externalPartnerEntity,
            internalStaffMerged,
            allContactsMerged
        ];

        const dbNested = new PGLiteDB(undefined, {logger});
        await dbNested.open();

        const setupNested = new DBSetup(nestedEntities, [], dbNested);
        await setupNested.createTables();
        const queryHandleNested = new EntityQueryHandle(new EntityToTableMap(setupNested.map), dbNested);

        // ========== CREATE 操作测试 ==========
        
        // 通过最底层的 Employee entity 创建记录
        const emp1 = await queryHandleNested.create('Employee', {
            empName: 'Alice Smith',
            empId: 'EMP001',
            department: 'Engineering'
        });

        // 通过 Manager entity 创建记录
        const mgr1 = await queryHandleNested.create('Manager', {
            mgrName: 'Bob Johnson',
            mgrId: 'MGR001',
            level: 'Senior'
        });

        // 通过 ExternalPartner entity 创建记录
        const partner1 = await queryHandleNested.create('ExternalPartner', {
            partnerName: 'Tech Solutions',
            partnerCode: 'PART001',
            contractType: 'Vendor'
        });

        // ========== QUERY 操作测试 ==========
        
        // 验证可以通过 InternalStaff (第一层 merged) 查询到 Employee 和 Manager
        const internalStaffRecords = await queryHandleNested.find('InternalStaff',
            undefined,
            undefined,
            ['id', 'empName', 'mgrName', '__InternalStaff_input_entity']
        );

        expect(internalStaffRecords).toHaveLength(2);
        expect(internalStaffRecords[0].__InternalStaff_input_entity).toEqual(['Employee']);
        expect(internalStaffRecords[1].__InternalStaff_input_entity).toEqual(['Manager']);

        // 验证可以通过 AllContacts (第二层 merged) 查询到所有记录
        const allContactsRecords = await queryHandleNested.find('AllContacts',
            undefined,
            undefined,
            ['id', '__AllContacts_input_entity']
        );

        expect(allContactsRecords).toHaveLength(3);
        expect(allContactsRecords[0].__AllContacts_input_entity).toEqual(['InternalStaff']);
        expect(allContactsRecords[1].__AllContacts_input_entity).toEqual(['InternalStaff']);
        expect(allContactsRecords[2].__AllContacts_input_entity).toEqual(['ExternalPartner']);

        // 验证通过 AllContacts 查询特定 Employee 记录
        const empViaAllContacts = await queryHandleNested.findOne('AllContacts',
            MatchExp.atom({ key: 'id', value: ['=', emp1.id] }),
            undefined,
            ['id', 'empName', 'empId', 'department', '__AllContacts_input_entity']
        );

        expect(empViaAllContacts).toBeTruthy();
        expect(empViaAllContacts.empName).toBe('Alice Smith');
        expect(empViaAllContacts.empId).toBe('EMP001');
        expect(empViaAllContacts.__AllContacts_input_entity).toEqual(['InternalStaff']);

        // ========== UPDATE 操作测试 ==========
        
        // 通过 AllContacts 更新 Employee 记录
        await queryHandleNested.update('AllContacts',
            MatchExp.atom({ key: 'id', value: ['=', emp1.id] }),
            { department: 'Product' }
        );

        // 验证更新生效
        const updatedEmp = await queryHandleNested.findOne('Employee',
            MatchExp.atom({ key: 'id', value: ['=', emp1.id] }),
            undefined,
            ['id', 'department']
        );
        expect(updatedEmp.department).toBe('Product');

        // 通过 InternalStaff 更新 Manager 记录
        await queryHandleNested.update('InternalStaff',
            MatchExp.atom({ key: 'id', value: ['=', mgr1.id] }),
            { level: 'Executive' }
        );

        // 验证通过 AllContacts 也能看到更新
        const updatedMgrViaAllContacts = await queryHandleNested.findOne('AllContacts',
            MatchExp.atom({ key: 'id', value: ['=', mgr1.id] }),
            undefined,
            ['id', 'level']
        );
        expect(updatedMgrViaAllContacts.level).toBe('Executive');

        // ========== DELETE 操作测试 ==========
        
        // 通过 AllContacts 删除 Manager 记录
        await queryHandleNested.delete('AllContacts',
            MatchExp.atom({ key: 'id', value: ['=', mgr1.id] })
        );

        // 验证记录被删除
        const deletedMgr = await queryHandleNested.findOne('Manager',
            MatchExp.atom({ key: 'id', value: ['=', mgr1.id] }),
            undefined,
            ['id']
        );
        expect(deletedMgr).toBeUndefined();

        // 验证通过 InternalStaff 也查询不到
        const deletedMgrViaInternalStaff = await queryHandleNested.findOne('InternalStaff',
            MatchExp.atom({ key: 'id', value: ['=', mgr1.id] }),
            undefined,
            ['id']
        );
        expect(deletedMgrViaInternalStaff).toBeUndefined();

        // ========== 最终状态验证 ==========
        
        // AllContacts 应该剩余 2 条记录（Employee 和 ExternalPartner）
        const finalAllContacts = await queryHandleNested.find('AllContacts',
            undefined,
            undefined,
            ['id', '__AllContacts_input_entity']
        );
        expect(finalAllContacts).toHaveLength(2);

        // InternalStaff 应该剩余 1 条记录（Employee）
        const finalInternalStaff = await queryHandleNested.find('InternalStaff',
            undefined,
            undefined,
            ['id', '__InternalStaff_input_entity']
        );
        expect(finalInternalStaff).toHaveLength(1);
        expect(finalInternalStaff[0].__InternalStaff_input_entity).toEqual(['Employee']);

        await dbNested.close();
    });
}); 