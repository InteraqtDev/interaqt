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
}); 