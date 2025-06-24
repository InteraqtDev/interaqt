import { describe, expect, test } from "vitest";
import {
  BoolExp,
  Controller,
  Dictionary,
  Entity,
  KlassByName,
  MonoSystem,
  Property,
  Relation,
  Sum,
  MatchExp,
  DICTIONARY_RECORD
} from '@';

describe('Sum computed handle', () => {
  
  test('should calculate global sum correctly', async () => {
    // Create entity
    const transactionEntity = Entity.create({
      name: 'Transaction',
      properties: [
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'type', type: 'string'}) // income or expense
      ]
    });
    
    const entities = [transactionEntity];
    
    // Create dictionary item to store global sum
    const dictionary = [
      Dictionary.create({
        name: 'totalAmount',
        type: 'number',
        collection: false,
        computedData: Sum.create({
          record: transactionEntity,
          attributeQuery: ['amount'],
          callback: function(transaction) {
            return transaction.amount || 0;
          }
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Initial sum should be 0
    const initialSum = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(initialSum).toBe(0);
    
    // Create transactions
    await system.storage.create('Transaction', {amount: 100, type: 'income'});
    await system.storage.create('Transaction', {amount: 50, type: 'expense'});
    await system.storage.create('Transaction', {amount: 75, type: 'income'});
    
    // Sum should be 100 + 50 + 75 = 225
    const sum1 = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(sum1).toBe(225);
    
    // Update a transaction
    const transactions = await system.storage.find('Transaction', BoolExp.atom({key: 'amount', value: ['=', 50]}));
    await system.storage.update('Transaction', BoolExp.atom({key: 'id', value: ['=', transactions[0].id]}), {amount: 30});
    
    // Sum should be 100 + 30 + 75 = 205
    const sum2 = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(sum2).toBe(205);
    
    // Delete a transaction
    const transToDelete = await system.storage.find('Transaction', BoolExp.atom({key: 'amount', value: ['=', 100]}));
    await system.storage.delete('Transaction', BoolExp.atom({key: 'id', value: ['=', transToDelete[0].id]}));
    
    // Sum should be 30 + 75 = 105
    const sum3 = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(sum3).toBe(105);
  });
  
  test('should calculate property sum correctly', async () => {
    // Create entities
    const orderEntity = Entity.create({
      name: 'Order',
      properties: [
        Property.create({name: 'orderNumber', type: 'string'})
      ]
    });
    
    const orderItemEntity = Entity.create({
      name: 'OrderItem',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    const entities = [orderEntity, orderItemEntity];
    
    // Create relationship between order and items
    const orderItemsRelation = Relation.create({
      source: orderEntity,
      sourceProperty: 'items',
      target: orderItemEntity,
      targetProperty: 'order',
      name: 'orderItems',
      type: '1:n'
    });
    
    const relations = [orderItemsRelation];
    
    // Add order property to sum total amount
    orderEntity.properties.push(
      Property.create({
        name: 'totalAmount',
        type: 'number',
        defaultValue: () => 0,
        computedData: Sum.create({
          record: orderItemsRelation,
          attributeQuery: [['target', { attributeQuery: ['quantity', 'price'] }]],
          callback: function(relation) {
            const item = relation.target;
            return (item.quantity || 0) * (item.price || 0);
          }
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // Create order
    const order = await system.storage.create('Order', {orderNumber: 'ORD001'});
    
    // Check initial total
    const order1 = await system.storage.findOne('Order', BoolExp.atom({key: 'id', value: ['=', order.id]}), undefined, ['*']);
    expect(order1.totalAmount).toBe(0);
    
    // Create order items
    await system.storage.create('OrderItem', {productName: 'Item 1', quantity: 2, price: 10, order: order});
    await system.storage.create('OrderItem', {productName: 'Item 2', quantity: 3, price: 15, order: order});
    
    // Check updated total: (2*10) + (3*15) = 20 + 45 = 65
    const order2 = await system.storage.findOne('Order', BoolExp.atom({key: 'id', value: ['=', order.id]}), undefined, ['*']);
    expect(order2.totalAmount).toBe(65);
    
    // Add another item
    await system.storage.create('OrderItem', {productName: 'Item 3', quantity: 1, price: 25, order: order});
    
    // Check updated total: 65 + 25 = 90
    const order3 = await system.storage.findOne('Order', BoolExp.atom({key: 'id', value: ['=', order.id]}), undefined, ['*']);
    expect(order3.totalAmount).toBe(90);
    
    // Update an item's quantity
    const items = await system.storage.find('OrderItem', BoolExp.atom({key: 'productName', value: ['=', 'Item 2']}));
    await system.storage.update('OrderItem', BoolExp.atom({key: 'id', value: ['=', items[0].id]}), {quantity: 5});
    
    // Check updated total: (2*10) + (5*15) + (1*25) = 20 + 75 + 25 = 120
    const order4 = await system.storage.findOne('Order', BoolExp.atom({key: 'id', value: ['=', order.id]}), undefined, ['*']);
    expect(order4.totalAmount).toBe(120);
    
    // Remove an item from the order
    const itemToRemove = await system.storage.find('OrderItem', BoolExp.atom({key: 'productName', value: ['=', 'Item 3']}));
    await system.storage.update('OrderItem', BoolExp.atom({key: 'id', value: ['=', itemToRemove[0].id]}), {order: null});
    
    // Check updated total: 120 - 25 = 95
    const order5 = await system.storage.findOne('Order', BoolExp.atom({key: 'id', value: ['=', order.id]}), undefined, ['*']);
    expect(order5.totalAmount).toBe(95);
  });
  
  test('should handle sum with dataDeps correctly', async () => {
    // Create entity
    const salesEntity = Entity.create({
      name: 'Sales',
      properties: [
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'taxRate', type: 'number'}) // percentage
      ]
    });
    
    const entities = [salesEntity];
    
    // Create dictionary for tax multiplier
    const taxMultiplierDict = Dictionary.create({
      name: 'taxMultiplier',
      type: 'number',
      collection: false
    });
    
    // Create dictionary item to store total tax amount
    const dictionary = [
      taxMultiplierDict,
      Dictionary.create({
        name: 'totalTax',
        type: 'number',
        collection: false,
        computedData: Sum.create({
          record: salesEntity,
          attributeQuery: ['amount', 'taxRate'],
          dataDeps: {
            multiplier: {
              type: 'global',
              source: taxMultiplierDict
            }
          },
          callback: function(sale, dataDeps) {
            const baseAmount = sale.amount || 0;
            const taxRate = sale.taxRate || 0;
            const multiplier = dataDeps.multiplier || 1;
            return baseAmount * (taxRate / 100) * multiplier;
          }
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Set tax multiplier
    await system.storage.set(DICTIONARY_RECORD, 'taxMultiplier', 1.2);
    
    // Create sales
    await system.storage.create('Sales', {amount: 1000, taxRate: 10}); // Tax: 1000 * 0.1 * 1.2 = 120
    await system.storage.create('Sales', {amount: 500, taxRate: 20});  // Tax: 500 * 0.2 * 1.2 = 120
    
    // Total tax should be 120 + 120 = 240
    const totalTax1 = await system.storage.get(DICTIONARY_RECORD, 'totalTax');
    expect(totalTax1).toBe(240);
    
    // Update tax multiplier
    await system.storage.set(DICTIONARY_RECORD, 'taxMultiplier', 1.5);
    
    // Total tax should be recalculated: (1000 * 0.1 * 1.5) + (500 * 0.2 * 1.5) = 150 + 150 = 300
    const totalTax2 = await system.storage.get(DICTIONARY_RECORD, 'totalTax');
    expect(totalTax2).toBe(300);
  });
  
  test('should handle negative values and zero correctly', async () => {
    // Create entity
    const accountEntity = Entity.create({
      name: 'Account',
      properties: [
        Property.create({name: 'balance', type: 'number'}),
        Property.create({name: 'type', type: 'string'}) // asset or liability
      ]
    });
    
    const entities = [accountEntity];
    
    // Create dictionary item for net worth
    const dictionary = [
      Dictionary.create({
        name: 'netWorth',
        type: 'number',
        collection: false,
        computedData: Sum.create({
          record: accountEntity,
          attributeQuery: ['balance', 'type'],
          callback: function(account) {
            const balance = account.balance || 0;
            // Assets are positive, liabilities are negative
            return account.type === 'liability' ? -balance : balance;
          }
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Create accounts
    await system.storage.create('Account', {balance: 1000, type: 'asset'});     // +1000
    await system.storage.create('Account', {balance: 500, type: 'liability'});  // -500
    await system.storage.create('Account', {balance: 0, type: 'asset'});        // 0
    await system.storage.create('Account', {balance: 300, type: 'asset'});      // +300
    
    // Net worth should be 1000 - 500 + 0 + 300 = 800
    const netWorth = await system.storage.get(DICTIONARY_RECORD, 'netWorth');
    expect(netWorth).toBe(800);
  });
  
  test('should handle NaN and invalid values gracefully', async () => {
    // Create entity
    const dataEntity = Entity.create({
      name: 'DataPoint',
      properties: [
        Property.create({name: 'value', type: 'number'}),
        Property.create({name: 'multiplier', type: 'number'})
      ]
    });
    
    const entities = [dataEntity];
    
    // Create dictionary item
    const dictionary = [
      Dictionary.create({
        name: 'total',
        type: 'number',
        collection: false,
        computedData: Sum.create({
          record: dataEntity,
          callback: function(data) {
            // This might produce NaN if multiplier is 0 and we divide
            const result = data.value / data.multiplier;
            return result; // The Sum handler should filter out NaN
          }
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Create data points
    await system.storage.create('DataPoint', {value: 10, multiplier: 2});  // 10/2 = 5
    await system.storage.create('DataPoint', {value: 20, multiplier: 0});  // 20/0 = Infinity (should be ignored)
    await system.storage.create('DataPoint', {value: 15, multiplier: 3});  // 15/3 = 5
    
    // Total should only include valid numbers: 5 + 5 = 10
    const total = await system.storage.get(DICTIONARY_RECORD, 'total');
    expect(total).toBe(10);
  });
  
  test('should handle multi-entity sum with relationships', async () => {
    // Create entities
    const departmentEntity = Entity.create({
      name: 'Department',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const employeeEntity = Entity.create({
      name: 'Employee',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'salary', type: 'number'}),
        Property.create({name: 'bonus', type: 'number'})
      ]
    });
    
    const entities = [departmentEntity, employeeEntity];
    
    // Create relationship
    const deptEmployeeRelation = Relation.create({
      source: departmentEntity,
      sourceProperty: 'employees',
      target: employeeEntity,
      targetProperty: 'department',
      name: 'deptEmployee',
      type: '1:n'
    });
    
    const relations = [deptEmployeeRelation];
    
    // Add department property to sum total compensation
    departmentEntity.properties.push(
      Property.create({
        name: 'totalCompensation',
        type: 'number',
        defaultValue: () => 0,
        computedData: Sum.create({
          record: deptEmployeeRelation,
          attributeQuery: [['target', { attributeQuery: ['salary', 'bonus'] }]],
          callback: function(relation) {
            const emp = relation.target;
            return (emp.salary || 0) + (emp.bonus || 0);
          }
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // Create departments
    const dept1 = await system.storage.create('Department', {name: 'Engineering'});
    const dept2 = await system.storage.create('Department', {name: 'Sales'});
    
    // Create employees
    await system.storage.create('Employee', {name: 'Alice', salary: 80000, bonus: 10000, department: dept1});
    await system.storage.create('Employee', {name: 'Bob', salary: 75000, bonus: 8000, department: dept1});
    await system.storage.create('Employee', {name: 'Charlie', salary: 70000, bonus: 15000, department: dept2});
    
    // Check department totals
    const engDept = await system.storage.findOne('Department', BoolExp.atom({key: 'id', value: ['=', dept1.id]}), undefined, ['*']);
    const salesDept = await system.storage.findOne('Department', BoolExp.atom({key: 'id', value: ['=', dept2.id]}), undefined, ['*']);
    
    expect(engDept.totalCompensation).toBe(90000 + 83000); // 173000
    expect(salesDept.totalCompensation).toBe(85000);
    
    // Transfer an employee
    const bob = await system.storage.find('Employee', BoolExp.atom({key: 'name', value: ['=', 'Bob']}));
    await system.storage.update('Employee', BoolExp.atom({key: 'id', value: ['=', bob[0].id]}), {department: dept2});
    
    // Check updated totals
    const engDeptUpdated = await system.storage.findOne('Department', BoolExp.atom({key: 'id', value: ['=', dept1.id]}), undefined, ['*']);
    const salesDeptUpdated = await system.storage.findOne('Department', BoolExp.atom({key: 'id', value: ['=', dept2.id]}), undefined, ['*']);
    
    expect(engDeptUpdated.totalCompensation).toBe(90000);
    expect(salesDeptUpdated.totalCompensation).toBe(85000 + 83000); // 168000
  });
}); 