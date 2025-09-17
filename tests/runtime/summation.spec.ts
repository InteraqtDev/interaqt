import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@dbclients';
import {
  BoolExp,
  Controller,
  Dictionary, KlassByName,
  MonoSystem, Summation,
  WeightedSummation,
  MatchExp
} from 'interaqt';

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
        computation: Summation.create({
          record: transactionEntity,
          attributeQuery: ['amount']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Initially, the sum should be 0
    let totalAmount = await system.storage.dict.get('totalAmount');
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
    totalAmount = await system.storage.dict.get('totalAmount');
    expect(totalAmount).toBe(350);
    
    // Update a transaction
    const transactions = await system.storage.find('Transaction', BoolExp.atom({key: 'amount', value: ['=', 50]}));
    await system.storage.update('Transaction', BoolExp.atom({key: 'id', value: ['=', transactions[0].id]}), {
      amount: 75
    });
    
    totalAmount = await system.storage.dict.get('totalAmount');
    expect(totalAmount).toBe(375);
    
    // Delete a transaction
    await system.storage.delete('Transaction', BoolExp.atom({key: 'id', value: ['=', transactions[0].id]}));
    
    totalAmount = await system.storage.dict.get('totalAmount');
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
        computation: Summation.create({
          record: scoreEntity,
          attributeQuery: ['value']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Add valid scores
    await system.storage.create('Score', { value: 10 });
    await system.storage.create('Score', { value: 20 });
    
    // Add invalid scores (should be ignored)
    await system.storage.create('Score', { value: NaN });
    await system.storage.create('Score', { value: Infinity });
    await system.storage.create('Score', { value: -Infinity });
    
    const totalScore = await system.storage.dict.get('totalScore');
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
        computation: Summation.create({
          record: itemEntity,
          attributeQuery: ['value']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Initially empty, sum should be 0
    const sum = await system.storage.dict.get('sumOfItems');
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
        computation: Summation.create({
          record: dataEntity,
          attributeQuery: ['value']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create records with and without values
    await system.storage.create('Data', { value: 10, category: 'A' });
    await system.storage.create('Data', { category: 'B' }); // missing value
    await system.storage.create('Data', { value: 20, category: 'C' });
    await system.storage.create('Data', { value: null, category: 'D' }); // null value
    await system.storage.create('Data', { value: undefined, category: 'E' }); // undefined value
    
    const sum = await system.storage.dict.get('dataSum');
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
        computation: Summation.create({
          record: accountEntity,
          attributeQuery: ['balance']
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create accounts
    const acc1 = await system.storage.create('Account', { balance: 1000, accountType: 'checking' });
    const acc2 = await system.storage.create('Account', { balance: 2000, accountType: 'savings' });
    const acc3 = await system.storage.create('Account', { balance: 500, accountType: 'credit' });
    
    let totalBalance = await system.storage.dict.get('totalBalance');
    expect(totalBalance).toBe(3500);
    
    // Update balance
    await system.storage.update('Account', BoolExp.atom({key: 'id', value: ['=', acc1.id]}), { balance: 1500 });
    totalBalance = await system.storage.dict.get('totalBalance');
    expect(totalBalance).toBe(4000);
    
    // Update non-balance field (should not trigger recomputation)
    await system.storage.update('Account', BoolExp.atom({key: 'id', value: ['=', acc2.id]}), { accountType: 'investment' });
    totalBalance = await system.storage.dict.get('totalBalance');
    expect(totalBalance).toBe(4000);
    
    // Delete an account
    await system.storage.delete('Account', BoolExp.atom({key: 'id', value: ['=', acc3.id]}));
    totalBalance = await system.storage.dict.get('totalBalance');
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
      baseEntity: orderEntity,
      matchExpression: MatchExp.atom({
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
        computation: Summation.create({
          record: completedOrderEntity,
          attributeQuery: ['amount']
        })
      })
    ]
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        dict: dictionary,
        relations: [],
        activities: [],
        interactions: []
    });
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
    const total = await system.storage.dict.get('completedOrdersTotal'
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
        computation: Summation.create({
          property: 'purchases',
          attributeQuery: ['amount']
        })
      })
    );
    
    const entities = [customerEntity, purchaseEntity];
    const relations = [customerPurchaseRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
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
    expect(updatedBob.totalPurchases).toBe(600); // 500 + 0 + 100 (null is treated as 0)
    
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

  test('should handle property level summation with filtered relations', async () => {
    const warehouseEntity = Entity.create({
      name: 'Warehouse',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'location', type: 'string'})
      ]
    });
    
    const inventoryEntity = Entity.create({
      name: 'Inventory',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'unitPrice', type: 'number'})
      ]
    });
    
    // Create base relation with inventory status
    const warehouseInventoryRelation = Relation.create({
      source: warehouseEntity,
      sourceProperty: 'inventories',
      target: inventoryEntity,
      targetProperty: 'warehouse',
      name: 'WarehouseInventory',
      type: '1:n',
      properties: [
        Property.create({name: 'status', type: 'string'}), // available, reserved, damaged, expired
        Property.create({name: 'lastUpdated', type: 'string'}),
        Property.create({name: 'zone', type: 'string'}) // A, B, C, D
      ]
    });
    
    // Create filtered relation for available items in zones A and B
    const availableABZoneRelation = Relation.create({
      name: 'AvailableABZoneRelation',
      baseRelation: warehouseInventoryRelation,
      sourceProperty: 'availableABInventories',
      targetProperty: 'availableABWarehouse',
      matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'available']
      }).and(
        MatchExp.atom({
          key: 'zone',
          value: ['=', 'A']
        }).or({
          key: 'zone',
          value: ['=', 'B']
        })
      )
    });
    
    // Add computed properties to warehouse entity
    warehouseEntity.properties.push(
      Property.create({
        name: 'totalInventoryValue',
        type: 'number',
        collection: false,
        computation: WeightedSummation.create({
          property: 'inventories',
          attributeQuery: ['quantity', 'unitPrice'],
          callback: function(inventory: any) {
            return {
              weight: inventory.quantity || 0,
              value: inventory.unitPrice || 0
            };
          }
        })
      }),
      Property.create({
        name: 'availableABZoneValue',
        type: 'number',
        collection: false,
        computation: WeightedSummation.create({
          property: 'availableABInventories',
          attributeQuery: ['quantity', 'unitPrice'],
          callback: function(inventory: any) {
            return {
              weight: inventory.quantity || 0,
              value: inventory.unitPrice || 0
            };
          }
        })
      }),
      Property.create({
        name: 'availableABZoneQuantity',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'availableABInventories',
          attributeQuery: ['quantity']
        })
      })
    );
    
    const entities = [warehouseEntity, inventoryEntity];
    const relations = [warehouseInventoryRelation, availableABZoneRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const warehouse1 = await system.storage.create('Warehouse', { 
      name: 'North Warehouse',
      location: 'New York'
    });
    
    const inv1 = await system.storage.create('Inventory', { 
      productName: 'Widget A',
      quantity: 100,
      unitPrice: 10
    });
    const inv2 = await system.storage.create('Inventory', { 
      productName: 'Widget B',
      quantity: 50,
      unitPrice: 20
    });
    const inv3 = await system.storage.create('Inventory', { 
      productName: 'Widget C',
      quantity: 200,
      unitPrice: 5
    });
    const inv4 = await system.storage.create('Inventory', { 
      productName: 'Widget D',
      quantity: 75,
      unitPrice: 15
    });
    
    // Create relations with different statuses and zones
    const rel1 = await system.storage.create('WarehouseInventory', {
      source: warehouse1,
      target: inv1,
      status: 'available',
      zone: 'A',
      lastUpdated: '2024-01-01'
    });
    
    const rel2 = await system.storage.create('WarehouseInventory', {
      source: warehouse1,
      target: inv2,
      status: 'available',
      zone: 'B',
      lastUpdated: '2024-01-02'
    });
    
    const rel3 = await system.storage.create('WarehouseInventory', {
      source: warehouse1,
      target: inv3,
      status: 'available',
      zone: 'C',
      lastUpdated: '2024-01-03'
    });
    
    const rel4 = await system.storage.create('WarehouseInventory', {
      source: warehouse1,
      target: inv4,
      status: 'reserved',
      zone: 'A',
      lastUpdated: '2024-01-04'
    });
    
    // Check initial sums
    const warehouse1Data = await system.storage.findOne('Warehouse', 
      BoolExp.atom({key: 'id', value: ['=', warehouse1.id]}), 
      undefined, 
      ['id', 'name', 'totalInventoryValue', 'availableABZoneValue', 'availableABZoneQuantity']
    );
    
    expect(warehouse1Data.totalInventoryValue).toBe(4125); // (100*10) + (50*20) + (200*5) + (75*15)
    // Available items in zones A/B: inv1(zone A) and inv2(zone B)
    expect(warehouse1Data.availableABZoneValue).toBe(2000); // (100*10) + (50*20)
    expect(warehouse1Data.availableABZoneQuantity).toBe(150); // 100 + 50
    
    // Change status of zone A reserved item to available
    await system.storage.update('WarehouseInventory',
      MatchExp.atom({key: 'id', value: ['=', rel4.id]}),
      { status: 'available' }
    );
    
    // Check updated sums
    const warehouse1Data2 = await system.storage.findOne('Warehouse', 
      MatchExp.atom({key: 'id', value: ['=', warehouse1.id]}), 
      undefined, 
      ['id', 'name', 'totalInventoryValue', 'availableABZoneValue', 'availableABZoneQuantity']
    );
    
    expect(warehouse1Data2.totalInventoryValue).toBe(4125); // Total unchanged
    // Now inv4(zone A) is also available: inv1, inv2, inv4
    expect(warehouse1Data2.availableABZoneValue).toBe(3125); // (100*10) + (50*20) + (75*15)
    expect(warehouse1Data2.availableABZoneQuantity).toBe(225); // 100 + 50 + 75
    
    // Move inv3 from zone C to zone A
    await system.storage.update('WarehouseInventory',
      MatchExp.atom({key: 'id', value: ['=', rel3.id]}),
      { zone: 'A' }
    );
    
    // Check after zone change
    const warehouse1Data3 = await system.storage.findOne('Warehouse', 
      MatchExp.atom({key: 'id', value: ['=', warehouse1.id]}), 
      undefined, 
      ['id', 'name', 'totalInventoryValue', 'availableABZoneValue', 'availableABZoneQuantity']
    );
    
    expect(warehouse1Data3.totalInventoryValue).toBe(4125); // Total unchanged
    // Now inv3(zone A) is also available: inv1, inv2, inv3, inv4
    expect(warehouse1Data3.availableABZoneValue).toBe(4125); // All inventory is now in zones A/B and available
    expect(warehouse1Data3.availableABZoneQuantity).toBe(425); // 100 + 50 + 200 + 75
    
    // Update quantity of inv1
    await system.storage.update('Inventory',
      MatchExp.atom({key: 'id', value: ['=', inv1.id]}),
      { quantity: 150 }
    );
    
    // Check after quantity update
    const warehouse1Data4 = await system.storage.findOne('Warehouse', 
      MatchExp.atom({key: 'id', value: ['=', warehouse1.id]}), 
      undefined, 
      ['id', 'name', 'totalInventoryValue', 'availableABZoneValue', 'availableABZoneQuantity']
    );
    
    expect(warehouse1Data4.totalInventoryValue).toBe(4625); // Increased by 500 (50 * 10)
    // inv1 quantity updated from 100 to 150
    expect(warehouse1Data4.availableABZoneValue).toBe(4625); // (150*10) + (50*20) + (200*5) + (75*15)
    expect(warehouse1Data4.availableABZoneQuantity).toBe(475); // 150 + 50 + 200 + 75
    
    // Mark inv2 as damaged
    await system.storage.update('WarehouseInventory',
      MatchExp.atom({key: 'id', value: ['=', rel2.id]}),
      { status: 'damaged' }
    );
    
    // Check after status change
    const warehouse1Data5 = await system.storage.findOne('Warehouse', 
      MatchExp.atom({key: 'id', value: ['=', warehouse1.id]}), 
      undefined, 
      ['id', 'name', 'totalInventoryValue', 'availableABZoneValue', 'availableABZoneQuantity']
    );
    
    expect(warehouse1Data5.totalInventoryValue).toBe(4625); // Total unchanged
    // inv2 is now damaged, no longer available
    expect(warehouse1Data5.availableABZoneValue).toBe(3625); // (150*10) + (200*5) + (75*15)
    expect(warehouse1Data5.availableABZoneQuantity).toBe(425); // 150 + 200 + 75
    
    // Delete rel1
    await system.storage.delete('WarehouseInventory',
      MatchExp.atom({key: 'id', value: ['=', rel1.id]})
    );
    
    // Final check
    const warehouse1Data6 = await system.storage.findOne('Warehouse', 
      MatchExp.atom({key: 'id', value: ['=', warehouse1.id]}), 
      undefined, 
      ['id', 'name', 'totalInventoryValue', 'availableABZoneValue', 'availableABZoneQuantity']
    );
    
    expect(warehouse1Data6.totalInventoryValue).toBe(3125); // Decreased by 1500 (150*10)
    expect(warehouse1Data6.availableABZoneValue).toBe(2125); // Only inv3 and inv4 in A zone
    expect(warehouse1Data6.availableABZoneQuantity).toBe(275); // 200 + 75
  });
  
  test('should handle property level summation with filtered relations - Sales Territory Example', async () => {
    const territoryEntity = Entity.create({
      name: 'Territory',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'region', type: 'string'})
      ]
    });
    
    const salesRepEntity = Entity.create({
      name: 'SalesRep',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'department', type: 'string'})
      ]
    });
    
    // Create base relation with sales properties
    const territorySalesRelation = Relation.create({
      source: territoryEntity,
      sourceProperty: 'sales',
      target: salesRepEntity,
      targetProperty: 'territories',
      name: 'TerritorySales',
      type: 'n:n',
      properties: [
        Property.create({name: 'revenue', type: 'number'}),
        Property.create({name: 'quarter', type: 'string'}),
        Property.create({name: 'productLine', type: 'string'}), // hardware, software, services
        Property.create({name: 'dealType', type: 'string'}), // new, renewal, expansion
      ]
    });
    
    // Create filtered relations for different quarters and product lines
    const q1SalesRelation = Relation.create({
      name: 'Q1SalesRelation',
      baseRelation: territorySalesRelation,
      sourceProperty: 'q1Sales',
      targetProperty: 'q1Territories',
      matchExpression: MatchExp.atom({
        key: 'quarter',
        value: ['=', 'Q1-2024']
      })
    });
    
    const q2SalesRelation = Relation.create({
      name: 'Q2SalesRelation',
      baseRelation: territorySalesRelation,
      sourceProperty: 'q2Sales',
      targetProperty: 'q2Territories',
      matchExpression: MatchExp.atom({
        key: 'quarter',
        value: ['=', 'Q2-2024']
      })
    });
    
    const softwareSalesRelation = Relation.create({
      name: 'SoftwareSalesRelation',
      baseRelation: territorySalesRelation,
      sourceProperty: 'softwareSales',
      targetProperty: 'softwareTerritories',
      matchExpression: MatchExp.atom({
        key: 'productLine',
        value: ['=', 'software']
      })
    });
    
    const newDealRelation = Relation.create({
      name: 'NewDealRelation',
      baseRelation: territorySalesRelation,
      sourceProperty: 'newDeals',
      targetProperty: 'newDealTerritories',
      matchExpression: MatchExp.atom({
        key: 'dealType',
        value: ['=', 'new']
      })
    });
    
    // Combined filter: Q1 software sales
    const q1SoftwareRelation = Relation.create({
      name: 'Q1SoftwareRelation',
      baseRelation: territorySalesRelation,
      sourceProperty: 'q1SoftwareSales',
      targetProperty: 'q1SoftwareTerritories',
      matchExpression: MatchExp.atom({
        key: 'quarter',
        value: ['=', 'Q1-2024']
      }).and({
        key: 'productLine',
        value: ['=', 'software']
      })
    });
    
    // Add computed properties to territory entity
    territoryEntity.properties.push(
      Property.create({
        name: 'totalRevenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'sales',
          attributeQuery: [['&', {attributeQuery: ['revenue']}]]
        })
      }),
      Property.create({
        name: 'q1Revenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'q1Sales',
          attributeQuery: [['&', {attributeQuery: ['revenue']}]]
        })
      }),
      Property.create({
        name: 'q2Revenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'q2Sales',
          attributeQuery: [['&', {attributeQuery: ['revenue']}]]
        })
      }),
      Property.create({
        name: 'softwareRevenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'softwareSales',
          attributeQuery: [['&', {attributeQuery: ['revenue']}]]
        })
      }),
      Property.create({
        name: 'newBusinessRevenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'newDeals',
          attributeQuery: [['&', {attributeQuery: ['revenue']}]]
        })
      }),
      Property.create({
        name: 'q1SoftwareRevenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          property: 'q1SoftwareSales',
          attributeQuery: [['&', {attributeQuery: ['revenue']}]]
        })
      })
    );
    
    const entities = [territoryEntity, salesRepEntity];
    const relations = [territorySalesRelation, q1SalesRelation, q2SalesRelation, 
                      softwareSalesRelation, newDealRelation, q1SoftwareRelation];
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create test data
    const westCoast = await system.storage.create('Territory', { 
      name: 'West Coast',
      region: 'Pacific'
    });
    
    const rep1 = await system.storage.create('SalesRep', { 
      name: 'Alice Johnson',
      department: 'Enterprise'
    });
    
    const rep2 = await system.storage.create('SalesRep', { 
      name: 'Bob Smith',
      department: 'SMB'
    });
    
    // Create sales records with different combinations
    await system.storage.create('TerritorySales', {
      source: westCoast,
      target: rep1,
      revenue: 50000,
      quarter: 'Q1-2024',
      productLine: 'software',
      dealType: 'new'
    });
    
    await system.storage.create('TerritorySales', {
      source: westCoast,
      target: rep1,
      revenue: 30000,
      quarter: 'Q1-2024',
      productLine: 'hardware',
      dealType: 'new'
    });
    
    await system.storage.create('TerritorySales', {
      source: westCoast,
      target: rep2,
      revenue: 25000,
      quarter: 'Q1-2024',
      productLine: 'software',
      dealType: 'renewal'
    });
    
    await system.storage.create('TerritorySales', {
      source: westCoast,
      target: rep1,
      revenue: 60000,
      quarter: 'Q2-2024',
      productLine: 'software',
      dealType: 'expansion'
    });
    
    await system.storage.create('TerritorySales', {
      source: westCoast,
      target: rep2,
      revenue: 40000,
      quarter: 'Q2-2024',
      productLine: 'services',
      dealType: 'new'
    });
    
    // Check computed sums
    const territoryData = await system.storage.findOne('Territory', 
      BoolExp.atom({key: 'id', value: ['=', westCoast.id]}), 
      undefined, 
      ['id', 'name', 'totalRevenue', 'q1Revenue', 'q2Revenue', 
       'softwareRevenue', 'newBusinessRevenue', 'q1SoftwareRevenue']
    );
    
    expect(territoryData.totalRevenue).toBe(205000); // Sum of all sales
    // Now filtered relations work correctly
    expect(territoryData.q1Revenue).toBe(105000); // 50k + 30k + 25k
    expect(territoryData.q2Revenue).toBe(100000); // 60k + 40k
    expect(territoryData.softwareRevenue).toBe(135000); // 50k + 25k + 60k
    expect(territoryData.newBusinessRevenue).toBe(120000); // 50k + 30k + 40k
    expect(territoryData.q1SoftwareRevenue).toBe(75000); // Only the Q1 software new deal
    
    // Test dynamic updates: Add a new Q3 sale
    await system.storage.create('TerritorySales', {
      source: westCoast,
      target: rep1,
      revenue: 70000,
      quarter: 'Q3-2024',
      productLine: 'software',
      dealType: 'new'
    });
    
    // Check updated totals
    const territoryDataUpdated = await system.storage.findOne('Territory', 
      BoolExp.atom({key: 'id', value: ['=', westCoast.id]}), 
      undefined, 
      ['id', 'totalRevenue', 'softwareRevenue', 'newBusinessRevenue']
    );
    
    expect(territoryDataUpdated.totalRevenue).toBe(275000); // Previous + 70000
    // The new Q3 software new deal adds to both software and new business
    expect(territoryDataUpdated.softwareRevenue).toBe(205000); // 135k + 70k
    expect(territoryDataUpdated.newBusinessRevenue).toBe(190000); // 120k + 70k
  });

  test('should calculate summation for merged entity correctly', async () => {
    // Create input entities for merged entity
    const saleEntity = Entity.create({
      name: 'Sale',
      properties: [
        Property.create({name: 'productName', type: 'string'}),
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'date', type: 'string'}),
        Property.create({name: 'category', type: 'string', defaultValue: () => 'product'})
      ]
    });

    const serviceEntity = Entity.create({
      name: 'Service',
      properties: [
        Property.create({name: 'serviceName', type: 'string'}),
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'date', type: 'string'}),
        Property.create({name: 'category', type: 'string', defaultValue: () => 'service'})
      ]
    });

    const subscriptionEntity = Entity.create({
      name: 'Subscription',
      properties: [
        Property.create({name: 'planName', type: 'string'}),
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'date', type: 'string'}),
        Property.create({name: 'recurring', type: 'boolean', defaultValue: () => true}),
        Property.create({name: 'category', type: 'string', defaultValue: () => 'subscription'})
      ]
    });

    // Create merged entity: Revenue (combining Sale, Service, and Subscription)
    const revenueEntity = Entity.create({
      name: 'Revenue',
      inputEntities: [saleEntity, serviceEntity, subscriptionEntity]
    });

    const entities = [saleEntity, serviceEntity, subscriptionEntity, revenueEntity];

    // Create dictionary items to store sums
    const dictionary = [
      Dictionary.create({
        name: 'totalRevenue',
        type: 'number',
        collection: false,
        computation: Summation.create({
          record: revenueEntity,
          attributeQuery: ['amount']
        })
      }),


    ];

    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system: system,
      entities: entities,
      dict: dictionary,
      relations: [],
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Initial sums should be 0
    let totalRevenue = await system.storage.dict.get('totalRevenue');
    
    expect(totalRevenue).toBe(0);

    // Create sales records
    await system.storage.create('Sale', {
      productName: 'Laptop',
      amount: 1500,
      date: '2024-01-01'
    });

    await system.storage.create('Sale', {
      productName: 'Mouse',
      amount: 50,
      date: '2024-01-02'
    });

    // Create service records
    await system.storage.create('Service', {
      serviceName: 'Consulting',
      amount: 2000,
      date: '2024-01-03'
    });

    await system.storage.create('Service', {
      serviceName: 'Support',
      amount: 500,
      date: '2024-01-04'
    });

    // Create subscription records
    await system.storage.create('Subscription', {
      planName: 'Premium',
      amount: 100,
      date: '2024-01-05'
    });

    await system.storage.create('Subscription', {
      planName: 'Basic',
      amount: 50,
      date: '2024-01-06',
      recurring: false
    });

    // Check the sums
    totalRevenue = await system.storage.dict.get('totalRevenue');
    
    expect(totalRevenue).toBe(4200); // 1500 + 50 + 2000 + 500 + 100 + 50

    // Update a sale amount
    const sales = await system.storage.find('Sale', 
      BoolExp.atom({key: 'productName', value: ['=', 'Laptop']}),
      undefined,
      ['id']
    );
    
    await system.storage.update('Sale',
      MatchExp.atom({key: 'id', value: ['=', sales[0].id]}),
      { amount: 1800 }
    );

    // Check updated sums
    totalRevenue = await system.storage.dict.get('totalRevenue');
    
    expect(totalRevenue).toBe(4500); // Increased by 300

    // Delete a service
    const services = await system.storage.find('Service',
      BoolExp.atom({key: 'serviceName', value: ['=', 'Support']}),
      undefined,
      ['id']
    );
    
    await system.storage.delete('Service',
      MatchExp.atom({key: 'id', value: ['=', services[0].id]})
    );

    // Check final sums
    totalRevenue = await system.storage.dict.get('totalRevenue');
    
    expect(totalRevenue).toBe(4000); // Decreased by 500
  });

  test('should work with merged relation in property level computation', async () => {
    // Define entities
    const customerEntity = Entity.create({
      name: 'Customer',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'email', type: 'string'})
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

    // Create input relations
    const customerOnlinePurchaseRelation = Relation.create({
      name: 'CustomerOnlinePurchase',
      source: customerEntity,
      sourceProperty: 'onlinePurchases',
      target: purchaseEntity,
      targetProperty: 'onlineCustomer',
      type: '1:n',
      properties: [
        Property.create({ name: 'channel', type: 'string', defaultValue: () => 'online' }),
        Property.create({ name: 'paymentMethod', type: 'string', defaultValue: () => 'credit' })
      ]
    });

    const customerStorePurchaseRelation = Relation.create({
      name: 'CustomerStorePurchase',
      source: customerEntity,
      sourceProperty: 'storePurchases',
      target: purchaseEntity,
      targetProperty: 'storeCustomer',
      type: '1:n',
      properties: [
        Property.create({ name: 'channel', type: 'string', defaultValue: () => 'store' }),
        Property.create({ name: 'storeName', type: 'string', defaultValue: () => 'Main St' })
      ]
    });

    // Create merged relation
    const customerAllPurchasesRelation = Relation.create({
      name: 'CustomerAllPurchases',
      sourceProperty: 'allPurchases',
      targetProperty: 'anyCustomer',
      inputRelations: [customerOnlinePurchaseRelation, customerStorePurchaseRelation]
    });

    // Add summation computation to customer entity
    customerEntity.properties.push(
      Property.create({
        name: 'totalPurchaseAmount',
        type: 'number',
        computation: Summation.create({
          property: 'allPurchases',
          attributeQuery: ['amount']
        })
      })
    );

    const entities = [customerEntity, purchaseEntity];
    const relations = [customerOnlinePurchaseRelation, customerStorePurchaseRelation, customerAllPurchasesRelation];

    // Setup system
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
      system: system,
      entities: entities,
      relations: relations,
      activities: [],
      interactions: []
    });
    await controller.setup(true);

    // Create test data
    const customer1 = await system.storage.create('Customer', {
      name: 'Alice Smith',
      email: 'alice@example.com'
    });

    const purchase1 = await system.storage.create('Purchase', {
      product: 'Laptop',
      amount: 1200,
      date: '2024-01-01'
    });

    const purchase2 = await system.storage.create('Purchase', {
      product: 'Mouse',
      amount: 50,
      date: '2024-01-02'
    });

    const purchase3 = await system.storage.create('Purchase', {
      product: 'Keyboard',
      amount: 150,
      date: '2024-01-03'
    });

    // Create relations through input relations
    await system.storage.create('CustomerOnlinePurchase', {
      source: { id: customer1.id },
      target: { id: purchase1.id }
    });

    await system.storage.create('CustomerStorePurchase', {
      source: { id: customer1.id },
      target: { id: purchase2.id }
    });

    await system.storage.create('CustomerOnlinePurchase', {
      source: { id: customer1.id },
      target: { id: purchase3.id }
    });

    // Check total amount
    const customerData = await system.storage.findOne('Customer',
      MatchExp.atom({ key: 'id', value: ['=', customer1.id] }),
      undefined,
      ['id', 'name', 'totalPurchaseAmount']
    );

    expect(customerData.totalPurchaseAmount).toBe(1400); // 1200 + 50 + 150

    // Update a purchase amount
    await system.storage.update('Purchase',
      MatchExp.atom({ key: 'id', value: ['=', purchase2.id] }),
      { amount: 80 }
    );

    // Check updated total
    const customerData2 = await system.storage.findOne('Customer',
      MatchExp.atom({ key: 'id', value: ['=', customer1.id] }),
      undefined,
      ['id', 'name', 'totalPurchaseAmount']
    );

    expect(customerData2.totalPurchaseAmount).toBe(1430); // 1200 + 80 + 150
  });
}); 