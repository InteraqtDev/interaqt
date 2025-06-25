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
  Summation,
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
        computedData: Summation.create({
          record: transactionEntity,
          attributeQuery: ['amount']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Initially, the sum should be 0
    let totalAmount = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(totalAmount).toBe(0);
    
    // Add some transactions
    await system.storage.create('Transaction', {
      amount: 100,
      type: 'income'
    });
    
    await system.storage.create('Transaction', {
      amount: 50,
      type: 'expense'
    });
    
    await system.storage.create('Transaction', {
      amount: 200,
      type: 'income'
    });
    
    // Check the sum
    totalAmount = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(totalAmount).toBe(350);
    
    // Update a transaction
    const transactions = await system.storage.find('Transaction', BoolExp.atom({key: 'amount', value: ['=', 50]}));
    await system.storage.update('Transaction', BoolExp.atom({key: 'id', value: ['=', transactions[0].id]}), {
      amount: 75
    });
    
    totalAmount = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(totalAmount).toBe(375);
    
    // Delete a transaction
    await system.storage.delete('Transaction', BoolExp.atom({key: 'id', value: ['=', transactions[0].id]}));
    
    totalAmount = await system.storage.get(DICTIONARY_RECORD, 'totalAmount');
    expect(totalAmount).toBe(300);
  });
  
  test('should handle NaN and Infinity values correctly', async () => {
    const scoreEntity = Entity.create({
      name: 'Score',
      properties: [
        Property.create({name: 'value', type: 'number'})
      ]
    });
    
    const entities = [scoreEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'totalScore',
        type: 'number',
        collection: false,
        computedData: Summation.create({
          record: scoreEntity,
          attributeQuery: ['value']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Add valid scores
    await system.storage.create('Score', { value: 10 });
    await system.storage.create('Score', { value: 20 });
    
    // Add invalid scores (should be ignored)
    await system.storage.create('Score', { value: NaN });
    await system.storage.create('Score', { value: Infinity });
    await system.storage.create('Score', { value: -Infinity });
    
    const totalScore = await system.storage.get(DICTIONARY_RECORD, 'totalScore');
    expect(totalScore).toBe(30); // Only valid scores are summed
  });

  test('should handle empty collections', async () => {
    const itemEntity = Entity.create({
      name: 'Item',
      properties: [
        Property.create({name: 'value', type: 'number'})
      ]
    });
    
    const entities = [itemEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'sumOfItems',
        type: 'number',
        collection: false,
        computedData: Summation.create({
          record: itemEntity,
          attributeQuery: ['value']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Initially empty, sum should be 0
    const sum = await system.storage.get(DICTIONARY_RECORD, 'sumOfItems');
    expect(sum).toBe(0);
  });
  
  test('should handle missing field values', async () => {
    const dataEntity = Entity.create({
      name: 'Data',
      properties: [
        Property.create({name: 'value', type: 'number'}),
        Property.create({name: 'category', type: 'string'})
      ]
    });
    
    const entities = [dataEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'dataSum',
        type: 'number',
        collection: false,
        computedData: Summation.create({
          record: dataEntity,
          attributeQuery: ['value']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Create records with and without values
    await system.storage.create('Data', { value: 10, category: 'A' });
    await system.storage.create('Data', { category: 'B' }); // missing value
    await system.storage.create('Data', { value: 20, category: 'C' });
    await system.storage.create('Data', { value: null, category: 'D' }); // null value
    await system.storage.create('Data', { value: undefined, category: 'E' }); // undefined value
    
    const sum = await system.storage.get(DICTIONARY_RECORD, 'dataSum');
    expect(sum).toBe(30); // Only valid numeric values are summed
  });

  test('should handle incremental updates correctly', async () => {
    const accountEntity = Entity.create({
      name: 'Account',
      properties: [
        Property.create({name: 'balance', type: 'number'}),
        Property.create({name: 'accountType', type: 'string'})
      ]
    });
    
    const entities = [accountEntity];
    
    const dictionary = [
      Dictionary.create({
        name: 'totalBalance',
        type: 'number',
        collection: false,
        computedData: Summation.create({
          record: accountEntity,
          attributeQuery: ['balance']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Create accounts
    const acc1 = await system.storage.create('Account', { balance: 1000, accountType: 'checking' });
    const acc2 = await system.storage.create('Account', { balance: 2000, accountType: 'savings' });
    const acc3 = await system.storage.create('Account', { balance: 500, accountType: 'credit' });
    
    let totalBalance = await system.storage.get(DICTIONARY_RECORD, 'totalBalance');
    expect(totalBalance).toBe(3500);
    
    // Update balance
    await system.storage.update('Account', BoolExp.atom({key: 'id', value: ['=', acc1.id]}), { balance: 1500 });
    totalBalance = await system.storage.get(DICTIONARY_RECORD, 'totalBalance');
    expect(totalBalance).toBe(4000);
    
    // Update non-balance field (should not trigger recomputation)
    await system.storage.update('Account', BoolExp.atom({key: 'id', value: ['=', acc2.id]}), { accountType: 'investment' });
    totalBalance = await system.storage.get(DICTIONARY_RECORD, 'totalBalance');
    expect(totalBalance).toBe(4000);
    
    // Delete an account
    await system.storage.delete('Account', BoolExp.atom({key: 'id', value: ['=', acc3.id]}));
    totalBalance = await system.storage.get(DICTIONARY_RECORD, 'totalBalance');
    expect(totalBalance).toBe(3500);
  });

  test('should work with filtered entities', async () => {
    // Create base entity
    const orderEntity = Entity.create({
      name: 'Order',
      properties: [
        Property.create({name: 'status', type: 'string'}),
        Property.create({name: 'amount', type: 'number'})
      ]
    })
    
    // Create filtered entity for completed orders
    const completedOrderEntity = Entity.create({
      name: 'CompletedOrder',
      sourceEntity: orderEntity,
      filterCondition: MatchExp.atom({
        key: 'status',
        value: ['=', 'completed']
      })
    })
    
    const entities = [orderEntity, completedOrderEntity]
    
    // Create dictionary to store sum of completed orders
    const dictionary = [
      Dictionary.create({
        name: 'completedOrdersTotal',
        type: 'number',
        collection: false,
        computedData: Summation.create({
          record: completedOrderEntity,
          attributeQuery: ['amount']
        })
      })
    ]
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Create orders with different statuses
    await system.storage.create(orderEntity.name, {
      status: 'pending',
      amount: 100
    })
    
    await system.storage.create(orderEntity.name, {
      status: 'completed',
      amount: 200
    })
    
    await system.storage.create(orderEntity.name, {
      status: 'completed',
      amount: 300
    })
    
    await system.storage.create(orderEntity.name, {
      status: 'cancelled',
      amount: 150
    })
    
    // Check that only completed orders are summed
    const total = await system.storage.get(
      DICTIONARY_RECORD,
      'completedOrdersTotal'
    )
    
    expect(total).toBe(500) // 200 + 300 (only completed orders)
  })

  test('should handle property level sum computation with relations', async () => {
    // Define entities first
    const customerEntity = Entity.create({
      name: 'Customer',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const purchaseEntity = Entity.create({
      name: 'Purchase',
      properties: [
        Property.create({name: 'product', type: 'string'}),
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'date', type: 'string'})
      ]
    });
    
    // Create relationship
    const customerPurchaseRelation = Relation.create({
      source: customerEntity,
      sourceProperty: 'purchases',
      target: purchaseEntity,
      targetProperty: 'customer',
      name: 'CustomerPurchase',
      type: '1:n'
    });
    
    // Add computed property to customer entity
    customerEntity.properties.push(
      Property.create({
        name: 'totalPurchases',
        type: 'number',
        collection: false,
        computedData: Summation.create({
          record: customerPurchaseRelation,
          attributeQuery: [['target', {attributeQuery: ['amount']}]]
        })
      })
    );
    
    const entities = [customerEntity, purchaseEntity];
    const relations = [customerPurchaseRelation];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // Create customers
    const alice = await system.storage.create('Customer', { name: 'Alice' });
    const bob = await system.storage.create('Customer', { name: 'Bob' });
    
    // Create purchases for Alice
    await system.storage.create('Purchase', {
      product: 'Laptop',
      amount: 1200,
      date: '2024-01-01',
      customer: alice
    });
    
    await system.storage.create('Purchase', {
      product: 'Mouse',
      amount: 50,
      date: '2024-01-02',
      customer: alice
    });
    
    await system.storage.create('Purchase', {
      product: 'Keyboard',
      amount: 150,
      date: '2024-01-03',
      customer: alice
    });
    
    // Create purchases for Bob
    await system.storage.create('Purchase', {
      product: 'Monitor',
      amount: 500,
      date: '2024-01-01',
      customer: bob
    });
    
    await system.storage.create('Purchase', {
      product: 'Headphones',
      amount: null, // Invalid amount
      date: '2024-01-02',
      customer: bob
    });
    
    await system.storage.create('Purchase', {
      product: 'Webcam',
      amount: 100,
      date: '2024-01-03',
      customer: bob
    });
    
    // Check computed totals
    const updatedAlice = await system.storage.findOne(
      'Customer',
      MatchExp.atom({key: 'id', value: ['=', alice.id]}),
      undefined,
      ['totalPurchases']
    );
    
    const updatedBob = await system.storage.findOne(
      'Customer',
      MatchExp.atom({key: 'id', value: ['=', bob.id]}),
      undefined,
      ['totalPurchases']
    );
    
    expect(updatedAlice.totalPurchases).toBe(1400); // 1200 + 50 + 150
    expect(updatedBob.totalPurchases).toBe(600); // 500 + 100 (null is ignored)
    
    // Test incremental update
    const mousePurchase = await system.storage.findOne(
      'Purchase',
      MatchExp.atom({key: 'product', value: ['=', 'Mouse']})
    );
    
    await system.storage.update('Purchase', 
      BoolExp.atom({key: 'id', value: ['=', mousePurchase.id]}), 
      { amount: 75 }
    );
    
    const finalAlice = await system.storage.findOne(
      'Customer',
      MatchExp.atom({key: 'id', value: ['=', alice.id]}),
      undefined,
      ['totalPurchases']
    );
    
    expect(finalAlice.totalPurchases).toBe(1425); // 1200 + 75 + 150
  });
}); 