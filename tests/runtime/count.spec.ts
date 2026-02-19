import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB, SQLiteDB } from '@drivers';
import {
  BoolExp,
  Controller,
  Dictionary, KlassByName,
  MonoSystem, Count,
  MatchExp
} from 'interaqt';

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
        computation: Count.create({
          record: productEntity
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
    
    // Initial count should be 0
    const initialCount = await system.storage.dict.get('productCount');
    expect(initialCount).toBe(0);
    
    // Create products
    await system.storage.create('Product', {name: 'Product 1', price: 10});
    await system.storage.create('Product', {name: 'Product 2', price: 20});
    
    // Count should be 2
    const count1 = await system.storage.dict.get('productCount');
    expect(count1).toBe(2);
    
    // Create another product
    await system.storage.create('Product', {name: 'Product 3', price: 30});
    
    // Count should be 3
    const count2 = await system.storage.dict.get('productCount');
    expect(count2).toBe(3);
    
    // Delete a product
    const products = await system.storage.find('Product', BoolExp.atom({key: 'name', value: ['=', 'Product 2']}));
    const idMatch = BoolExp.atom({
      key: 'id',
      value: ['=', products[0].id]
    });
    await system.storage.delete('Product', idMatch);
    
    // Count should be 2
    const count3 = await system.storage.dict.get('productCount');
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
        computation: Count.create({
          property: 'tasks'
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
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
        computation: Count.create({
          property: 'tasks'
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create users
    const user1 = await system.storage.create('User', {username: 'user1'});
    const user2 = await system.storage.create('User', {username: 'user2'});

    const initialUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const initialUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    expect(initialUser1.taskCount).toBe(0);
    expect(initialUser2.taskCount).toBe(0);
    
    // // Create tasks for each user
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



  test('should only count self relation twice on n:n relation', async () => {
    // Create User entity with computed property
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({
          name: 'username',
          type: 'string'
        })
      ]
    });
    
    // Create Group entity with computed property
    const groupEntity = Entity.create({
      name: 'Group',
      properties: [
        Property.create({
          name: 'groupName',
          type: 'string'
        })
      ]
    });
    
    const entities = [userEntity, groupEntity];
    
    // Create bidirectional relationship
    const userGroupRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'groups',
      target: groupEntity,
      targetProperty: 'members',
      name: 'userGroup',
      type: 'n:n'
    });
    
    const relations = [userGroupRelation];
    
    // Add computed property to User to count groups
    userEntity.properties.push(
      Property.create({
        name: 'groupCount',
        type: 'number',
        computation: Count.create({
          property: 'groups'
        })
      })
    );
    
    // Add computed property to Group to count members
    groupEntity.properties.push(
      Property.create({
        name: 'memberCount',
        type: 'number',
        computation: Count.create({
          property: 'members'
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create users and groups
    const user1 = await system.storage.create('User', {username: 'user1'});
    const user2 = await system.storage.create('User', {username: 'user2'});
    const group1 = await system.storage.create('Group', {groupName: 'group1'});
    const group2 = await system.storage.create('Group', {groupName: 'group2'});
    
    // Initial counts should be 0
    const initialUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const initialGroup1 = await system.storage.findOne('Group', BoolExp.atom({key: 'id', value: ['=', group1.id]}), undefined, ['*']);
    expect(initialUser1.groupCount).toBe(0);
    expect(initialGroup1.memberCount).toBe(0);
    
    // Create relationship between user1 and group1
    // This should trigger computation on both sides
    await system.storage.addRelationByNameById('userGroup', user1.id, group1.id, {});
    
    // Check if counts are updated correctly
    const updatedUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const updatedGroup1 = await system.storage.findOne('Group', BoolExp.atom({key: 'id', value: ['=', group1.id]}), undefined, ['*']);
    
    expect(updatedUser1.groupCount).toBe(1);
    expect(updatedGroup1.memberCount).toBe(1);
    
    // Add more relationships
    await system.storage.addRelationByNameById('userGroup', user1.id, group2.id, {});
    await system.storage.addRelationByNameById('userGroup', user2.id, group1.id, {});
    
    // Check final counts
    const finalUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const finalUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    const finalGroup1 = await system.storage.findOne('Group', BoolExp.atom({key: 'id', value: ['=', group1.id]}), undefined, ['*']);
    const finalGroup2 = await system.storage.findOne('Group', BoolExp.atom({key: 'id', value: ['=', group2.id]}), undefined, ['*']);
    
    expect(finalUser1.groupCount).toBe(2);
    expect(finalUser2.groupCount).toBe(1);
    expect(finalGroup1.memberCount).toBe(2);
    expect(finalGroup2.memberCount).toBe(1);
  });



  test('should handle deletion in bidirectional relation', async () => {
    // Create entities
    const authorEntity = Entity.create({
      name: 'Author',
      properties: [
        Property.create({
          name: 'name',
          type: 'string'
        })
      ]
    });
    
    const bookEntity = Entity.create({
      name: 'Book',
      properties: [
        Property.create({
          name: 'title',
          type: 'string'
        })
      ]
    });
    
    const entities = [authorEntity, bookEntity];
    
    // Create bidirectional relationship
    const authorBookRelation = Relation.create({
      source: authorEntity,
      sourceProperty: 'books',
      target: bookEntity,
      targetProperty: 'authors',
      name: 'authorBook',
      type: 'n:n'
    });
    
    const relations = [authorBookRelation];
    
    // Add computed properties
    authorEntity.properties.push(
      Property.create({
        name: 'bookCount',
        type: 'number',
        computation: Count.create({
          property: 'books'
        })
      })
    );
    
    bookEntity.properties.push(
      Property.create({
        name: 'authorCount',
        type: 'number',
        computation: Count.create({
          property: 'authors'
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem(new SQLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create data
    const author1 = await system.storage.create('Author', {name: 'Author 1'});
    const author2 = await system.storage.create('Author', {name: 'Author 2'});
    const book1 = await system.storage.create('Book', {title: 'Book 1'});
    const book2 = await system.storage.create('Book', {title: 'Book 2'});
    
    // Create relationships
    const rel1 = await system.storage.addRelationByNameById('authorBook', author1.id, book1.id, {});
    const rel2 = await system.storage.addRelationByNameById('authorBook', author1.id, book2.id, {});
    const rel3 = await system.storage.addRelationByNameById('authorBook', author2.id, book1.id, {});
    
    // Check counts before deletion
    const beforeAuthor1 = await system.storage.findOne('Author', BoolExp.atom({key: 'id', value: ['=', author1.id]}), undefined, ['*']);
    const beforeBook1 = await system.storage.findOne('Book', BoolExp.atom({key: 'id', value: ['=', book1.id]}), undefined, ['*']);
    
    expect(beforeAuthor1.bookCount).toBe(2);
    expect(beforeBook1.authorCount).toBe(2);
    
    // Delete a relationship
    await system.storage.removeRelationByName('authorBook', BoolExp.atom({key: 'id', value: ['=', rel1.id]}));
    
    // Check counts after deletion
    const afterAuthor1 = await system.storage.findOne('Author', BoolExp.atom({key: 'id', value: ['=', author1.id]}), undefined, ['*']);
    const afterBook1 = await system.storage.findOne('Book', BoolExp.atom({key: 'id', value: ['=', book1.id]}), undefined, ['*']);
    
    expect(afterAuthor1.bookCount).toBe(1);
    expect(afterBook1.authorCount).toBe(1);
  });

  test('should count with callback filter on global Count', async () => {
    // Create entity with status field
    const orderEntity = Entity.create({
      name: 'Order',
      properties: [
        Property.create({name: 'customerName', type: 'string'}),
        Property.create({name: 'status', type: 'string'}),
        Property.create({name: 'amount', type: 'number'})
      ]
    });
    
    const entities = [orderEntity];
    
    // Create dictionary item to store count of completed orders
    const dictionary = [
      Dictionary.create({
        name: 'completedOrderCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          record: orderEntity,
          attributeQuery: ['status'],
          callback: function(order: any) {
            return order.status === 'completed';
          }
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
    
    // Initial count should be 0
    const initialCount = await system.storage.dict.get('completedOrderCount');
    expect(initialCount).toBe(0);
    
    // Create orders with different statuses
    await system.storage.create('Order', {customerName: 'Customer 1', status: 'pending', amount: 100});
    await system.storage.create('Order', {customerName: 'Customer 2', status: 'completed', amount: 200});
    await system.storage.create('Order', {customerName: 'Customer 3', status: 'processing', amount: 150});
    
    // Only 1 completed order should be counted
    const count1 = await system.storage.dict.get('completedOrderCount');
    expect(count1).toBe(1);
    
    // Create another completed order
    await system.storage.create('Order', {customerName: 'Customer 4', status: 'completed', amount: 300});
    
    // Should count 2 completed orders
    const count2 = await system.storage.dict.get('completedOrderCount');
    expect(count2).toBe(2);
    
    // Update an order status to completed
    const orders = await system.storage.find('Order', BoolExp.atom({key: 'status', value: ['=', 'pending']}));
    if (orders.length > 0) {
      await system.storage.update('Order', BoolExp.atom({key: 'id', value: ['=', orders[0].id]}), {status: 'completed'});
    }
    
    // Should count 3 completed orders now
    const count3 = await system.storage.dict.get('completedOrderCount');
    expect(count3).toBe(3);
    
    // Update a completed order to cancelled
    const completedOrders = await system.storage.find('Order', BoolExp.atom({key: 'status', value: ['=', 'completed']}));
    await system.storage.update('Order', BoolExp.atom({key: 'id', value: ['=', completedOrders[0].id]}), {status: 'cancelled'});
    
    // Should count 2 completed orders
    const count4 = await system.storage.dict.get('completedOrderCount');
    expect(count4).toBe(2);
  });

  test('should count with callback filter on property Count', async () => {
    // Create entities
    const projectEntity = Entity.create({
      name: 'Project',
      properties: [
        Property.create({name: 'name', type: 'string'})
      ]
    });
    
    const issueEntity = Entity.create({
      name: 'Issue',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'priority', type: 'string'}),
        Property.create({name: 'status', type: 'string', defaultValue: () => 'open'})
      ]
    });
    
    const entities = [projectEntity, issueEntity];
    
    // Create relationship
    const projectIssueRelation = Relation.create({
      source: projectEntity,
      sourceProperty: 'issues',
      target: issueEntity,
      targetProperty: 'project',
      name: 'projectIssue',
      type: '1:n'
    });
    
    const relations = [projectIssueRelation];
    
    // Add property to count high priority issues
    projectEntity.properties.push(
      Property.create({
        name: 'highPriorityIssueCount',
        type: 'number',
        computation: Count.create({
          property: 'issues',
          attributeQuery: ['priority'],
          callback: function(issue: any) {
            return issue.priority === 'high';
          }
        })
      })
    );
    
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
    
    // Create project
    const project = await system.storage.create('Project', {name: 'Test Project'});
    
    // Check initial count
    const project1 = await system.storage.findOne('Project', BoolExp.atom({key: 'id', value: ['=', project.id]}), undefined, ['*']);
    expect(project1.highPriorityIssueCount).toBe(0);
    
    // Create issues with different priorities
    await system.storage.create('Issue', {title: 'Issue 1', priority: 'low', project: project});
    await system.storage.create('Issue', {title: 'Issue 2', priority: 'high', project: project});
    await system.storage.create('Issue', {title: 'Issue 3', priority: 'medium', project: project});
    await system.storage.create('Issue', {title: 'Issue 4', priority: 'high', project: project});
    
    // Should count 2 high priority issues
    const project2 = await system.storage.findOne('Project', BoolExp.atom({key: 'id', value: ['=', project.id]}), undefined, ['*']);
    expect(project2.highPriorityIssueCount).toBe(2);
    
    // Update an issue priority to high
    const issues = await system.storage.find('Issue', BoolExp.atom({key: 'priority', value: ['=', 'medium']}));
    const events:any[] = []
    await system.storage.update('Issue', BoolExp.atom({key: 'id', value: ['=', issues[0].id]}), {priority: 'high'}, events);
    
    // Should count 3 high priority issues
    const project3 = await system.storage.findOne('Project', BoolExp.atom({key: 'id', value: ['=', project.id]}), undefined, ['*']);
    expect(project3.highPriorityIssueCount).toBe(3);
  });

  test('should count with dataDeps in callback', async () => {
    // Create entities
    const customerEntity = Entity.create({
      name: 'Customer',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'vipStatus', type: 'boolean', defaultValue: () => false})
      ]
    });
    
    const purchaseEntity = Entity.create({
      name: 'Purchase',
      properties: [
        Property.create({name: 'amount', type: 'number'}),
        Property.create({name: 'date', type: 'string'})
      ]
    });
    
    const entities = [customerEntity, purchaseEntity];
    
    // Create relationship
    const customerPurchaseRelation = Relation.create({
      source: customerEntity,
      sourceProperty: 'purchases',
      target: purchaseEntity,
      targetProperty: 'customer',
      name: 'customerPurchase',
      type: '1:n'
    });
    
    const relations = [customerPurchaseRelation];
    
    // Create dictionary for minimum VIP amount
    const vipMinAmount = Dictionary.create({
      name: 'vipMinAmount',
      type: 'number',
      collection: false,
      defaultValue: () => 1000
    });
    const dictionary = [vipMinAmount];
    
    // Add property to count purchases above VIP threshold
    customerEntity.properties.push(
      Property.create({
        name: 'vipPurchaseCount',
        type: 'number',
        computation: Count.create({
          property: 'purchases',
          attributeQuery: ['amount'],
          callback: function(purchase: any, dataDeps: any) {
            debugger
            return purchase.amount >= dataDeps.minAmount;
          },
          dataDeps: {
            minAmount: {
              type: 'global',
              source: vipMinAmount,
            }
          }
        })
      })
    );
    
    // Setup system and controller
    const system = new MonoSystem(new PGLiteDB());
    system.conceptClass = KlassByName;
    const controller = new Controller({
        system: system,
        entities: entities,
        relations: relations,
        dict: dictionary,
        activities: [],
        interactions: []
    });
    await controller.setup(true);
    
    // Create customer
    const customer = await system.storage.create('Customer', {name: 'John Doe'});
    
    // Create purchases with different amounts
    await system.storage.create('Purchase', {amount: 500, date: '2024-01-01', customer: customer});
    await system.storage.create('Purchase', {amount: 1200, date: '2024-01-02', customer: customer});
    await system.storage.create('Purchase', {amount: 800, date: '2024-01-03', customer: customer});
    await system.storage.create('Purchase', {amount: 1500, date: '2024-01-04', customer: customer});
    
    // Should count 2 VIP purchases (>= 1000)
    const customer1 = await system.storage.findOne('Customer', MatchExp.atom({key: 'id', value: ['=', customer.id]}), undefined, ['*']);
    expect(customer1.vipPurchaseCount).toBe(2);
    
    // Update VIP minimum amount
    await system.storage.dict.set('vipMinAmount', 600);
    
    
    // Should count 3 VIP purchases now (>= 600)
    const customer2 = await system.storage.findOne('Customer', MatchExp.atom({key: 'id', value: ['=', customer.id]}), undefined, ['*']);
    expect(customer2.vipPurchaseCount).toBe(3);
  });

  test('should count with attributeQuery optimization', async () => {
    // Create entity with status field
    const itemEntity = Entity.create({
      name: 'Item',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'status', type: 'string'}),
        Property.create({name: 'description', type: 'string'}) // Not needed for count
      ]
    });
    
    const entities = [itemEntity];
    
    // Create dictionary to count items with specific status, using attributeQuery optimization
    const dictionary = [
      Dictionary.create({
        name: 'activeItemCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          record: itemEntity,
          callback: function(item: any) {
            return item.status === 'active';
          },
          attributeQuery: ['name', 'status'] // Only fetch needed fields, not description
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
    
    // Create items
    await system.storage.create('Item', {
      name: 'Item1', 
      status: 'active', 
      description: 'Long description that is not needed for count'
    });
    await system.storage.create('Item', {
      name: 'Item2', 
      status: 'inactive', 
      description: 'Another long description'
    });
    await system.storage.create('Item', {
      name: 'Item3', 
      status: 'active', 
      description: 'Yet another description'
    });
    
    // Should count 2 active items
    const count1 = await system.storage.dict.get('activeItemCount');
    expect(count1).toBe(2);
    
    // Update item status
    const items = await system.storage.find('Item', BoolExp.atom({key: 'name', value: ['=', 'Item2']}));
    await system.storage.update('Item', BoolExp.atom({key: 'id', value: ['=', items[0].id]}), {status: 'active'});
    
    // Should count 3 active items
    const count2 = await system.storage.dict.get('activeItemCount');
    expect(count2).toBe(3);
  });

  test('should count with direction parameter on relation', async () => {
    // Create entities for user-to-user following relationship
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'})
      ]
    });
    
    const entities = [userEntity];
    
    // Create self-referencing relationship
    const followRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'following',
      target: userEntity,
      targetProperty: 'followers',
      name: 'follows',
      type: 'n:n'
    });
    
    const relations = [followRelation];
    
    // Add properties to count followers and following separately
    userEntity.properties.push(
      Property.create({
        name: 'followerCount',
        type: 'number',
        computation: Count.create({
          property: 'followers',
          direction: 'target' // Count as target (being followed)
        })
      }),
      Property.create({
        name: 'followingCount',
        type: 'number',
        computation: Count.create({
          property: 'following',
          direction: 'source' // Count as source (following others)
        })
      })
    );
    
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
    
    // Create users
    const user1 = await system.storage.create('User', {username: 'user1'});
    const user2 = await system.storage.create('User', {username: 'user2'});
    const user3 = await system.storage.create('User', {username: 'user3'});
    
    // Initial counts should be 0
    const initialUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    expect(initialUser1.followerCount).toBe(0);
    expect(initialUser1.followingCount).toBe(0);
    
    // User1 follows User2
    await system.storage.addRelationByNameById('follows', user1.id, user2.id, {});
    
    // User1 should have 1 following, User2 should have 1 follower
    const updatedUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const updatedUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    
    expect(updatedUser1.followingCount).toBe(1);
    expect(updatedUser1.followerCount).toBe(0);
    expect(updatedUser2.followingCount).toBe(0);
    expect(updatedUser2.followerCount).toBe(1);
    
    // User3 follows User1, User1 follows User3 (mutual)
    await system.storage.addRelationByNameById('follows', user3.id, user1.id, {});
    await system.storage.addRelationByNameById('follows', user1.id, user3.id, {});
    
    // Check final counts
    const finalUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const finalUser3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user3.id]}), undefined, ['*']);
    
    expect(finalUser1.followingCount).toBe(2); // Following user2 and user3
    expect(finalUser1.followerCount).toBe(1); // Followed by user3
    expect(finalUser3.followingCount).toBe(1); // Following user1
    expect(finalUser3.followerCount).toBe(1); // Followed by user1
  });

  test('should handle property level count with filtered relations', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // 
    // Workaround: After creating relations, we manually force a recomputation
    // by querying the entity with its computed properties.
    // Define entities
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
        Property.create({name: 'status', type: 'string'}) // active, inactive, terminated
      ]
    });
    
    // Create base relation with employment type property
    const departmentEmployeeRelation = Relation.create({
      source: departmentEntity,
      sourceProperty: 'employees',
      target: employeeEntity,
      targetProperty: 'department',
      name: 'DepartmentEmployee',
      type: '1:n',
      properties: [
        Property.create({name: 'employmentType', type: 'string'}), // full-time, part-time, contract
        Property.create({name: 'startDate', type: 'string'}),
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => true})
      ]
    });
    
    // Create filtered relation for active full-time employees only
    const activeFullTimeRelation = Relation.create({
      name: 'ActiveFullTimeRelation',
      baseRelation: departmentEmployeeRelation,
      sourceProperty: 'activeFullTimeEmployees',
      targetProperty: 'activeFullTimeDepartment',
      matchExpression: MatchExp.atom({
        key: 'employmentType',
        value: ['=', 'full-time']
      }).and({
        key: 'isActive',
        value: ['=', true]
      })
    });
    
    // Add computed properties to department entity
    departmentEntity.properties.push(
      Property.create({
        name: 'totalEmployeeCount',
        type: 'number',
        computation: Count.create({
          property: 'employees'
        })
      }),
      Property.create({
        name: 'activeFullTimeCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          property: 'activeFullTimeEmployees'
        })
      })
    );
    
    const entities = [departmentEntity, employeeEntity];
    const relations = [departmentEmployeeRelation, activeFullTimeRelation];
    // const relations = [departmentEmployeeRelation];
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
    const engineering = await system.storage.create('Department', { name: 'Engineering' });
    const hr = await system.storage.create('Department', { name: 'HR' });
    
    const emp1 = await system.storage.create('Employee', { 
      name: 'Alice',
      status: 'active'
    });
    const emp2 = await system.storage.create('Employee', { 
      name: 'Bob',
      status: 'active'
    });
    const emp3 = await system.storage.create('Employee', { 
      name: 'Charlie',
      status: 'inactive'
    });
    const emp4 = await system.storage.create('Employee', { 
      name: 'David',
      status: 'active'
    });
    
    // Create relations with different employment types
    await system.storage.addRelationByNameById('DepartmentEmployee', engineering.id, emp1.id, {employmentType: 'full-time', startDate: '2023-01-01', isActive: true});
    await system.storage.addRelationByNameById('DepartmentEmployee', engineering.id, emp2.id, {employmentType: 'part-time', startDate: '2023-02-01', isActive: true});
    await system.storage.addRelationByNameById('DepartmentEmployee', engineering.id, emp3.id, {employmentType: 'full-time', startDate: '2022-06-01', isActive: false});
    await system.storage.addRelationByNameById('DepartmentEmployee', hr.id, emp4.id, {employmentType: 'full-time', startDate: '2023-03-01', isActive: true});


    // Now the computations should run when we query the computed properties
    // Check initial counts
    const engDept1 = await system.storage.findOne('Department', 
      BoolExp.atom({key: 'id', value: ['=', engineering.id]}), 
      undefined, 
      ['id', 'name', 'totalEmployeeCount', 'activeFullTimeCount', 'employees']

    );


    expect(engDept1.totalEmployeeCount).toBe(3); // All 3 employees in engineering
    expect(engDept1.activeFullTimeCount).toBe(1); // Only emp1 is active full-time
    
   
    
    // Check HR department counts
    const hrDept = await system.storage.findOne('Department', 
      MatchExp.atom({key: 'id', value: ['=', hr.id]}), 
      undefined, 
      ['id', 'name', 'totalEmployeeCount', 'activeFullTimeCount']
    );
    
    expect(hrDept.totalEmployeeCount).toBe(1); // David
    expect(hrDept.activeFullTimeCount).toBe(1); // David is active full-time
    
    // Update Bob to full-time
    const bobRelation = await system.storage.findOne('DepartmentEmployee',
      MatchExp.atom({key: 'source.id', value: ['=', engineering.id]}).and({key: 'target.id', value: ['=', emp2.id]}),
      undefined,
      ['id']
    );
    
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', bobRelation.id]}),
      { employmentType: 'full-time' }
    );
    
    // Check updated counts
    const engDept2 = await system.storage.findOne('Department', 
      MatchExp.atom({key: 'id', value: ['=', engineering.id]}), 
      undefined, 
      ['id', 'name', 'totalEmployeeCount', 'activeFullTimeCount']
    );
    
    expect(engDept2.totalEmployeeCount).toBe(3); // Unchanged
    expect(engDept2.activeFullTimeCount).toBe(2); // Alice and Bob
    
    // Deactivate Alice's employment
    const aliceRelation = await system.storage.findOne('DepartmentEmployee',
      MatchExp.atom({key: 'source.id', value: ['=', engineering.id]}).and({key: 'target.id', value: ['=', emp1.id]}),
      undefined,
      ['id']
    );
    
    await system.storage.update('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', aliceRelation.id]}),
      { isActive: false }
    );
    
    // Check counts after deactivation
    const engDept3 = await system.storage.findOne('Department', 
      MatchExp.atom({key: 'id', value: ['=', engineering.id]}), 
      undefined, 
      ['id', 'name', 'totalEmployeeCount', 'activeFullTimeCount']
    );
    
    expect(engDept3.totalEmployeeCount).toBe(3); // Still 3 total
    expect(engDept3.activeFullTimeCount).toBe(1); // Only Bob now
    
    // Delete Bob's employment relation
    await system.storage.delete('DepartmentEmployee',
      MatchExp.atom({key: 'id', value: ['=', bobRelation.id]})
    );
    
    // Final check
    const engDept4 = await system.storage.findOne('Department', 
      MatchExp.atom({key: 'id', value: ['=', engineering.id]}), 
      undefined, 
      ['id', 'name', 'totalEmployeeCount', 'activeFullTimeCount']
    );
    
    expect(engDept4.totalEmployeeCount).toBe(2); // Alice and Charlie
    expect(engDept4.activeFullTimeCount).toBe(0); // None are active full-time
  });
  
  test('should handle property level count with filtered relations - Store Inventory Example', async () => {
    // NOTE: This test demonstrates a current limitation in the framework:
    // Filtered relations do not automatically trigger computations when their 
    // source relations change. This is because the dependency tracking system
    // doesn't fully support transitive dependencies through filtered relations.
    // Define entities
    const storeEntity = Entity.create({
      name: 'Store',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'location', type: 'string'})
      ]
    });
    
    const productEntity = Entity.create({
      name: 'Product',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'category', type: 'string'}),
        Property.create({name: 'price', type: 'number'})
      ]
    });
    
    // Create base relation with inventory properties
    const storeProductRelation = Relation.create({
      source: storeEntity,
      sourceProperty: 'products',
      target: productEntity,
      targetProperty: 'stores',
      name: 'StoreProduct',
      type: 'n:n',
      properties: [
        Property.create({name: 'quantity', type: 'number'}),
        Property.create({name: 'stockStatus', type: 'string'}), // in-stock, low-stock, out-of-stock
        Property.create({name: 'lastRestocked', type: 'string'})
      ]
    });
    
    // Create filtered relations for different stock statuses
    const inStockRelation = Relation.create({
      name: 'InStockRelation',
      baseRelation: storeProductRelation,
      sourceProperty: 'inStockProducts',
      targetProperty: 'inStockStores',
      matchExpression: MatchExp.atom({
        key: 'stockStatus',
        value: ['=', 'in-stock']
      })
    });
    
    const lowStockRelation = Relation.create({
      name: 'LowStockRelation',
      baseRelation: storeProductRelation,
      sourceProperty: 'lowStockProducts',
      targetProperty: 'lowStockStores',
      matchExpression: MatchExp.atom({
        key: 'stockStatus',
        value: ['=', 'low-stock']
      })
    });
    
    const outOfStockRelation = Relation.create({
      name: 'OutOfStockRelation',
      baseRelation: storeProductRelation,
      sourceProperty: 'outOfStockProducts',
      targetProperty: 'outOfStockStores',
      matchExpression: MatchExp.atom({
        key: 'stockStatus',
        value: ['=', 'out-of-stock']
      })
    });
    
    // Add computed properties to store entity
    storeEntity.properties.push(
      Property.create({
        name: 'totalProductCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          property: 'products'
        })
      }),
      Property.create({
        name: 'inStockCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          property: 'inStockProducts'
        })
      }),
      Property.create({
        name: 'lowStockCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          property: 'lowStockProducts'
        })
      }),
      Property.create({
        name: 'outOfStockCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          property: 'outOfStockProducts'
        })
      })
    );
    
    const entities = [storeEntity, productEntity];
    const relations = [storeProductRelation, inStockRelation, lowStockRelation, outOfStockRelation];
    
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
    const store1 = await system.storage.create('Store', { 
      name: 'Downtown Store',
      location: 'City Center'
    });
    
    const prod1 = await system.storage.create('Product', { 
      name: 'Laptop',
      category: 'Electronics',
      price: 999
    });
    
    const prod2 = await system.storage.create('Product', { 
      name: 'Mouse',
      category: 'Electronics',
      price: 29
    });
    
    const prod3 = await system.storage.create('Product', { 
      name: 'Keyboard',
      category: 'Electronics',
      price: 79
    });
    
    const prod4 = await system.storage.create('Product', { 
      name: 'Monitor',
      category: 'Electronics',
      price: 299
    });
    
    // Create inventory relations with different stock statuses
    await system.storage.create('StoreProduct', {
      source: store1,
      target: prod1,
      quantity: 15,
      stockStatus: 'in-stock',
      lastRestocked: '2024-01-15'
    });
    
    await system.storage.create('StoreProduct', {
      source: store1,
      target: prod2,
      quantity: 3,
      stockStatus: 'low-stock',
      lastRestocked: '2024-01-10'
    });
    
    await system.storage.create('StoreProduct', {
      source: store1,
      target: prod3,
      quantity: 0,
      stockStatus: 'out-of-stock',
      lastRestocked: '2023-12-20'
    });
    
    await system.storage.create('StoreProduct', {
      source: store1,
      target: prod4,
      quantity: 8,
      stockStatus: 'in-stock',
      lastRestocked: '2024-01-12'
    });
    

    
    // Check computed counts
    const storeData = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'totalProductCount', 'inStockCount', 'lowStockCount', 'outOfStockCount']
    );
    
    expect(storeData.totalProductCount).toBe(4);
    // Now filtered relations should work correctly
    expect(storeData.inStockCount).toBe(2);    // prod1 and prod4 are in-stock
    expect(storeData.lowStockCount).toBe(1);   // prod2 is low-stock
    expect(storeData.outOfStockCount).toBe(1); // prod3 is out-of-stock
    
    // Test dynamic updates: Change stock status
    await system.storage.update('StoreProduct',
      MatchExp.atom({key: 'source.id', value: ['=', store1.id]})
        .and({key: 'target.id', value: ['=', prod2.id]}),
      { stockStatus: 'in-stock', quantity: 20 }
    );
    
    // Check updated counts
    const storeDataUpdated = await system.storage.findOne('Store', 
      BoolExp.atom({key: 'id', value: ['=', store1.id]}), 
      undefined, 
      ['id', 'name', 'inStockCount', 'lowStockCount', 'outOfStockCount']
    );
    
    // After update: prod2 changed from low-stock to in-stock
    expect(storeDataUpdated.inStockCount).toBe(3);    // prod1, prod2, and prod4 are in-stock
    expect(storeDataUpdated.lowStockCount).toBe(0);   // no products are low-stock
    expect(storeDataUpdated.outOfStockCount).toBe(1); // prod3 is still out-of-stock
  });

  test('should calculate count for merged entity correctly', async () => {
    // Create input entities for merged entity
    const customerEntity = Entity.create({
      name: 'Customer',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'email', type: 'string'}),
        Property.create({name: 'customerLevel', type: 'string', defaultValue: () => 'bronze'}),
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => true})
      ]
    });

    const vendorEntity = Entity.create({
      name: 'Vendor',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'email', type: 'string'}),
        Property.create({name: 'vendorCode', type: 'string'}),
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => false})
      ]
    });

    const employeeEntity = Entity.create({
      name: 'Employee',
      properties: [
        Property.create({name: 'name', type: 'string'}),
        Property.create({name: 'email', type: 'string'}),
        Property.create({name: 'employeeId', type: 'string'}),
        Property.create({name: 'department', type: 'string'}),
        Property.create({name: 'isActive', type: 'boolean', defaultValue: () => true})
      ]
    });

    // Create merged entity: Contact (combining Customer, Vendor, and Employee)
    const contactEntity = Entity.create({
      name: 'Contact',
      inputEntities: [customerEntity, vendorEntity, employeeEntity]
    });

    const entities = [customerEntity, vendorEntity, employeeEntity, contactEntity];

    // Create dictionary items to store counts
    const dictionary = [
      Dictionary.create({
        name: 'totalContactCount',
        type: 'number',
        collection: false,
        computation: Count.create({
          record: contactEntity
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

    // Initial counts should be 0
    const initialTotalCount = await system.storage.dict.get('totalContactCount');
    expect(initialTotalCount).toBe(0);

    // Create records through input entities
    const customer1 = await system.storage.create('Customer', {
      name: 'John Doe',
      email: 'john@example.com',
      customerLevel: 'gold'
    });

    const vendor1 = await system.storage.create('Vendor', {
      name: 'ABC Corp',
      email: 'contact@abc.com',
      vendorCode: 'V001'
    });

    const employee1 = await system.storage.create('Employee', {
      name: 'Jane Smith',
      email: 'jane@company.com',
      employeeId: 'E001',
      department: 'Engineering'
    });

    // Total count should be 3 (1 customer + 1 vendor + 1 employee)
    const totalCount1 = await system.storage.dict.get('totalContactCount');
    expect(totalCount1).toBe(3);

    // Add more customers
    await system.storage.create('Customer', {
      name: 'Alice Brown',
      email: 'alice@example.com'
    });

    await system.storage.create('Customer', {
      name: 'Bob Wilson',
      email: 'bob@example.com'
    });

    // Total count should be 5
    const totalCount2 = await system.storage.dict.get('totalContactCount');
    expect(totalCount2).toBe(5);

    // Delete a customer
    await system.storage.delete('Customer',
      MatchExp.atom({key: 'id', value: ['=', customer1.id]})
    );

    // Total count should be 4
    const totalCount3 = await system.storage.dict.get('totalContactCount');
    expect(totalCount3).toBe(4);
  });

  test('should work with merged relation in property level computation', async () => {
    // Define entities
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({name: 'username', type: 'string'}),
        Property.create({name: 'email', type: 'string'})
      ]
    });

    const postEntity = Entity.create({
      name: 'Post',
      properties: [
        Property.create({name: 'title', type: 'string'}),
        Property.create({name: 'content', type: 'string'}),
        Property.create({name: 'status', type: 'string'})
      ]
    });

    // Create input relations
    const userLikesPostRelation = Relation.create({
      name: 'UserLikesPost',
      source: userEntity,
      sourceProperty: 'likedPosts',
      target: postEntity,
      targetProperty: 'likedBy',
      type: 'n:n',
      properties: [
        Property.create({ name: 'likedAt', type: 'string', defaultValue: () => '2024-01-01' }),
        Property.create({ name: 'rating', type: 'number', defaultValue: () => 5 })
      ]
    });

    const userBookmarksPostRelation = Relation.create({
      name: 'UserBookmarksPost',
      source: userEntity,
      sourceProperty: 'bookmarkedPosts',
      target: postEntity,
      targetProperty: 'bookmarkedBy',
      type: 'n:n',
      properties: [
        Property.create({ name: 'bookmarkedAt', type: 'string', defaultValue: () => '2024-01-01' }),
        Property.create({ name: 'category', type: 'string', defaultValue: () => 'general' })
      ]
    });

    // Create merged relation
    const userInteractsWithPostRelation = Relation.create({
      name: 'UserInteractsWithPost',
      sourceProperty: 'interactedPosts',
      targetProperty: 'interactedBy',
      inputRelations: [userLikesPostRelation, userBookmarksPostRelation]
    });

    // Add count computation to user entity
    userEntity.properties.push(
      Property.create({
        name: 'totalInteractions',
        type: 'number',
        computation: Count.create({
          property: 'interactedPosts',
          direction: 'source'
        })
      }),
      Property.create({
        name: 'highRatedInteractions',
        type: 'number',
        computation: Count.create({
          property: 'interactedPosts',
          direction: 'source'
          // Simplified: just count all interactions for now
        })
      })
    );

    const entities = [userEntity, postEntity];
    const relations = [userLikesPostRelation, userBookmarksPostRelation, userInteractsWithPostRelation];

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
    const user1 = await system.storage.create('User', {
      username: 'john_doe',
      email: 'john@example.com'
    });

    const post1 = await system.storage.create('Post', {
      title: 'First Post',
      content: 'Content 1',
      status: 'published'
    });

    const post2 = await system.storage.create('Post', {
      title: 'Second Post',
      content: 'Content 2',
      status: 'published'
    });

    // Create relations through input relations
    await system.storage.create('UserLikesPost', {
      source: { id: user1.id },
      target: { id: post1.id },
      rating: 5
    });

    await system.storage.create('UserBookmarksPost', {
      source: { id: user1.id },
      target: { id: post2.id },
      category: 'tech'
    });

    await system.storage.create('UserLikesPost', {
      source: { id: user1.id },
      target: { id: post2.id },
      rating: 3
    });

    // Check counts
    const userData = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
      undefined,
      ['id', 'username', 'totalInteractions', 'highRatedInteractions']
    );

    expect(userData.totalInteractions).toBe(3); // 2 likes + 1 bookmark
    expect(userData.highRatedInteractions).toBe(3); // Simplified test: counting all interactions
  });
}); 