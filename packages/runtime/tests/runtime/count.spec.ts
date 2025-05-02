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
  Count
} from '@';

describe('Count computed handle', () => {
  
  test('should calculate global count correctly', async () => {
    // Create entity
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    const entities = [productEntity];
    
    // Create dictionary item to store global count
    const dictionary = [
      Dictionary.create({
        name: 'productCount',
        type: 'number',
        collection: false,
        computedData: Count.create({
          record: productEntity
        })
      })
    ];
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, [], [], [], dictionary, []);
    await controller.setup(true);
    
    // Initial count should be 0
    const initialCount = await system.storage.get('state', 'productCount');
    expect(initialCount).toBe(0);
    
    // Create products
    await system.storage.create('Product', {name: 'Product 1', price: 10});
    await system.storage.create('Product', {name: 'Product 2', price: 20});
    
    // Count should be 2
    const count1 = await system.storage.get('state', 'productCount');
    expect(count1).toBe(2);
    
    // Create another product
    await system.storage.create('Product', {name: 'Product 3', price: 30});
    
    // Count should be 3
    const count2 = await system.storage.get('state', 'productCount');
    expect(count2).toBe(3);
    
    // Delete a product
    const products = await system.storage.find('Product', BoolExp.atom({key: 'name', value: ['=', 'Product 2']}));
    const idMatch = BoolExp.atom({
      key: 'id',
      value: ['=', products[0].id]
    });
    await system.storage.delete('Product', idMatch);
    
    // Count should be 2
    const count3 = await system.storage.get('state', 'productCount');
    expect(count3).toBe(2);
  });
  
  test('should calculate property count correctly', async () => {
    // Create entities
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({
          name: 'username',
          type: 'string'
        })
      ]
    });
    
    const taskEntity = Entity.create({
      name: 'Task',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'completed', type: 'boolean', defaultValue: () => false})
      ]
    });
    
    const entities = [userEntity, taskEntity];
    
    // Create relationship between user and tasks
    const ownsTaskRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'tasks',
      target: taskEntity,
      targetProperty: 'owner',
      name: 'ownsTask',
      type: '1:n'
    });
    
    const relations = [ownsTaskRelation];
    
    // Add user property to count tasks
    userEntity.properties.push(
      Property.create({
        name: 'taskCount',
        type: 'number',
        defaultValue: () => 0,
        computedData: Count.create({
          record: ownsTaskRelation
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // Create user
    const user = await system.storage.create('User', {username: 'testuser'});
    
    // Check initial task count
    const user1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    expect(user1.taskCount).toBe(0);
    
    // Create tasks for the user
    await system.storage.create('Task', {title: 'Task 1', owner: user});
    await system.storage.create('Task', {title: 'Task 2', owner: user});
    
    // Check updated task count
    const user2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    expect(user2.taskCount).toBe(2);
    
    // Create another task for the user
    await system.storage.create('Task', {title: 'Task 3', owner: user});
    
    // Check updated task count
    const user3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    expect(user3.taskCount).toBe(3);
    
    // Remove task from user
    const tasks = await system.storage.find('Task', BoolExp.atom({key: 'title', value: ['=', 'Task 2']}));
    await system.storage.update('Task', BoolExp.atom({key: 'id', value: ['=', tasks[0].id]}), {owner: null});
    
    // Check updated task count
    const user4 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user.id]}), undefined, ['*']);
    expect(user4.taskCount).toBe(2);
  });
  
  test('should handle multi-user task counting correctly', async () => {
    // Create entities
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'})
      ]
    });
    
    const taskEntity = Entity.create({
      name: 'Task',
      properties: [
        Property.create({name: 'title', type: 'string'})
      ]
    });
    
    const entities = [userEntity, taskEntity];
    
    // Create relationship
    const ownsTaskRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'tasks',
      target: taskEntity,
      targetProperty: 'owner',
      name: 'ownsTask',
      type: '1:n'
    });
    
    const relations = [ownsTaskRelation];
    
    // Add user property to count tasks
    userEntity.properties.push(
      Property.create({
        name: 'taskCount',
        type: 'number',
        defaultValue: () => 0,
        computedData: Count.create({
          record: ownsTaskRelation
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    const controller = new Controller(system, entities, relations, [], [], [], []);
    await controller.setup(true);
    
    // Create users
    const user1 = await system.storage.create('User', {username: 'user1'});
    const user2 = await system.storage.create('User', {username: 'user2'});
    
    // Create tasks for each user
    await system.storage.create('Task', {title: 'User1 Task 1', owner: user1});
    await system.storage.create('Task', {title: 'User1 Task 2', owner: user1});
    await system.storage.create('Task', {title: 'User2 Task 1', owner: user2});
    
    // Check task counts
    const updatedUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const updatedUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    
    expect(updatedUser1.taskCount).toBe(2);
    expect(updatedUser2.taskCount).toBe(1);
    
    // Move a task from user1 to user2
    const tasks = await system.storage.find('Task', BoolExp.atom({key: 'title', value: ['=', 'User1 Task 2']}));
    await system.storage.update('Task', BoolExp.atom({key: 'id', value: ['=', tasks[0].id]}), {owner: user2});
    
    // Check updated task counts
    const finalUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const finalUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    
    expect(finalUser1.taskCount).toBe(1);
    expect(finalUser2.taskCount).toBe(2);
  });
}); 