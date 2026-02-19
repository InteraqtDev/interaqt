import { describe, expect, test } from "vitest";
import { Entity, Property, Relation } from 'interaqt';
import { PGLiteDB } from '@drivers';
import {
  BoolExp,
  Controller, KlassByName,
  MonoSystem, Count,
  MatchExp
} from 'interaqt';

describe('Symmetric relation computation', () => {
  
  test('should support symmetric relation on deletion', async () => {
    // Create User entity
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({
          name: 'username',
          type: 'string'
        })
      ]
    });
    
    const entities = [userEntity];
    
    // Create symmetric friend relation
    const friendRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'friends',
      target: userEntity,
      targetProperty: 'friends',  // Same as sourceProperty - this makes it symmetric
      name: 'User_friends_friends_User',
      type: 'n:n'
    });
    
    const relations = [friendRelation];
    
    // Add computed property to count friends
    userEntity.properties.push(
      Property.create({
        name: 'friendCount',
        type: 'number',
        computation: Count.create({
          record: friendRelation
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
    
    // Create just two users
    const user1 = await system.storage.create('User', {username: 'Alice'});
    const user2 = await system.storage.create('User', {username: 'Bob'});
    
    console.log('\n=== Creating friendship between Alice and Bob ===');
    // Create friendship: Alice -> Bob
    const rel1 = await system.storage.addRelationByNameById('User_friends_friends_User', user1.id, user2.id, {});
    
    // Check counts after creation
    const afterCreateUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const afterCreateUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    
    console.log('After creating friendship:');
    console.log(`Alice (user1) friendCount: ${afterCreateUser1.friendCount}`);
    console.log(`Bob (user2) friendCount: ${afterCreateUser2.friendCount}`);
    
    // For symmetric relations, both users should have 1 friend
    expect(afterCreateUser1.friendCount).toBe(1);
    expect(afterCreateUser2.friendCount).toBe(1);
    
    console.log('\n=== Deleting friendship ===');
    // Delete the relationship
    await system.storage.removeRelationByName('User_friends_friends_User', BoolExp.atom({key: 'id', value: ['=', rel1.id]}));
    
    // Check counts after deletion
    const afterDeleteUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const afterDeleteUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    
    console.log('After deleting friendship:');
    console.log(`Alice (user1) friendCount: ${afterDeleteUser1.friendCount}`);
    console.log(`Bob (user2) friendCount: ${afterDeleteUser2.friendCount}`);
    
    // After deletion, both users should have 0 friends
    expect(afterDeleteUser1.friendCount).toBe(0);
    expect(afterDeleteUser2.friendCount).toBe(0);
  });
  
  test('should handle symmetric relation deletion without triggering infinite computation', async () => {
    // Create User entity
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({
          name: 'username',
          type: 'string'
        })
      ]
    });
    
    const entities = [userEntity];
    
    // Create symmetric friend relation
    const friendRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'friends',
      target: userEntity,
      targetProperty: 'friends',  // Same as sourceProperty - this makes it symmetric
      name: 'User_friends_friends_User',
      type: 'n:n'
    });
    
    const relations = [friendRelation];
    
    // Add computed property to count friends
    // This is where the bug occurs - counting on a symmetric relation
    userEntity.properties.push(
      Property.create({
        name: 'friendCount',
        type: 'number',
        computation: Count.create({
          record: friendRelation
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
    
    // Create friendships
    // user1 -> user2
    const rel1 = await system.storage.addRelationByNameById('User_friends_friends_User', user1.id, user2.id, {});
    // user1 -> user3
    const rel2 = await system.storage.addRelationByNameById('User_friends_friends_User', user1.id, user3.id, {});
    // user3 -> user2 (note: user3 is source here, creating a symmetric scenario)
    const rel3 = await system.storage.addRelationByNameById('User_friends_friends_User', user3.id, user2.id, {});
    
    // Check initial counts
    const initialUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const initialUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    const initialUser3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user3.id]}), undefined, ['*']);
    
    console.log('Initial counts:');
    console.log(`user1.friendCount: ${initialUser1.friendCount}`);
    console.log(`user2.friendCount: ${initialUser2.friendCount}`);
    console.log(`user3.friendCount: ${initialUser3.friendCount}`);
    
    // For symmetric relations, the count should include both directions
    // user1 has 2 friends (user2, user3)
    // user2 has 2 friends (user1, user3) 
    // user3 has 2 friends (user1, user2)
    expect(initialUser1.friendCount).toBe(2);
    expect(initialUser2.friendCount).toBe(2);
    expect(initialUser3.friendCount).toBe(2);
    
    console.log('\n--- Deleting relationship between user1 and user2 ---');
    console.log(`Deleting relation with id: ${rel1.id}`);
    
    // Query all relations before deletion
    const relsBefore = await system.storage.findRelationByName('User_friends_friends_User', undefined, undefined, ['*']);
    console.log('Relations before deletion:', relsBefore);
    
    // Delete a relationship - this is where the bug might occur
    await system.storage.removeRelationByName('User_friends_friends_User', BoolExp.atom({key: 'id', value: ['=', rel1.id]}));
    
    // Query all relations after deletion
    const relsAfter = await system.storage.findRelationByName('User_friends_friends_User', undefined, undefined, ['*']);
    console.log('Relations after deletion:', relsAfter);
    
    // Check counts after deletion
    const afterUser1 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user1.id]}), undefined, ['*']);
    const afterUser2 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user2.id]}), undefined, ['*']);
    const afterUser3 = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', user3.id]}), undefined, ['*']);
    
    console.log('\nCounts after deletion:');
    console.log(`user1.friendCount: ${afterUser1.friendCount}`);
    console.log(`user2.friendCount: ${afterUser2.friendCount}`);
    console.log(`user3.friendCount: ${afterUser3.friendCount}`);
    
    // After deleting rel1 (user1 -> user2):
    // user1 should have 1 friend (user3)
    // user2 should have 1 friend (user3)
    // user3 should have 2 friends (user1, user2)
    expect(afterUser1.friendCount).toBe(1);
    expect(afterUser2.friendCount).toBe(1);
    expect(afterUser3.friendCount).toBe(2);
  });
  
  test('should correctly query symmetric relations from both directions', async () => {
    // Create User entity
    const userEntity = Entity.create({
      name: 'User',
      properties: [
        Property.create({
          name: 'username',
          type: 'string'
        })
      ]
    });
    
    const entities = [userEntity];
    
    // Create symmetric friend relation
    const friendRelation = Relation.create({
      source: userEntity,
      sourceProperty: 'friends',
      target: userEntity,
      targetProperty: 'friends',
      name: 'User_friends_friends_User',
      type: 'n:n'
    });
    
    const relations = [friendRelation];
    
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
    const user1 = await system.storage.create('User', {username: 'Alice'});
    const user2 = await system.storage.create('User', {username: 'Bob'});
    
    // Create friendship from user1 to user2
    await system.storage.addRelationByNameById('User_friends_friends_User', user1.id, user2.id, {level: 'bestfriend'});
    
    // Query friends of user1
    const user1WithFriends = await system.storage.findOne(
      'User', 
      MatchExp.atom({key: 'id', value: ['=', user1.id]}), 
      undefined, 
      ['*', ['friends', {attributeQuery: ['*']}]]
    );
    
    // Query friends of user2 (should also include user1 due to symmetric relation)
    const user2WithFriends = await system.storage.findOne(
      'User', 
      MatchExp.atom({key: 'id', value: ['=', user2.id]}), 
      undefined, 
      ['*', ['friends', {attributeQuery: ['*']}]]
    );
    
    console.log('\nSymmetric relation query results:');
    console.log(`user1 (${user1WithFriends.username}) friends:`, user1WithFriends.friends);
    console.log(`user2 (${user2WithFriends.username}) friends:`, user2WithFriends.friends);
    
    // Both users should see each other as friends
    expect(user1WithFriends.friends).toHaveLength(1);
    expect(user1WithFriends.friends[0].id).toBe(user2.id);
    
    expect(user2WithFriends.friends).toHaveLength(1);
    expect(user2WithFriends.friends[0].id).toBe(user1.id);
  });
}); 