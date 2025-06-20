import { describe, test, expect, beforeEach } from 'vitest';
import { BoolExp, MonoSystem, Controller, KlassByName, removeAllInstance } from '@';
import { entities } from '../src/entities.js';
import { relations } from '../src/relations.js';

describe('Social Content Network - Minimal Tests', () => {
  test('should create basic entities', async () => {
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    const controller = new Controller(
      system,
      entities,
      relations,
      [], // interactions
      [], // activities
      [], // dictionary
      [] // attributives
    );
    await controller.setup(true);
    // Create a user
    const alice = await system.storage.create('User', {
      username: 'alice',
      displayName: 'Alice Smith',
      email: 'alice@example.com'
    });
    
    expect(alice).toBeDefined();
    expect(alice.username).toBe('alice');
    expect(alice.displayName).toBe('Alice Smith');
    
    // Create a post
    const post = await system.storage.create('Post', {
      title: 'Hello World',
      content: 'My first post',
      author: alice
    });
    
    expect(post).toBeDefined();
    expect(post.title).toBe('Hello World');
    
    // Get the complete post with default values
    const fullPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), undefined, ['*']);
    expect(fullPost.status).toBe('draft');
    
    // Publish the post
    await system.storage.update('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), {
      status: 'published',
      publishedAt: new Date().toISOString()
    });
    
    const publishedPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), undefined, ['*']);
    expect(publishedPost.status).toBe('published');
  });

  test('should create friend relationships', async () => {
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    const controller = new Controller(
      system,
      entities,
      relations,
      [], // interactions
      [], // activities
      [], // dictionary
      [] // attributives
    );
    await controller.setup(true);
    const alice = await system.storage.create('User', {
      username: 'alice',
      displayName: 'Alice Smith'
    });
    
    const bob = await system.storage.create('User', {
      username: 'bob', 
      displayName: 'Bob Johnson'
    });
    
    // Create friend request
    const request = await system.storage.create('FriendRequest', {
      requester: alice,
      receiver: bob,
      status: 'pending'
    });
    
    expect(request).toBeDefined();
    expect(request.status).toBe('pending');
    
    // Accept friend request by creating friendship relation
    await system.storage.update('FriendRequest', BoolExp.atom({key: 'id', value: ['=', request.id]}), {
      status: 'accepted',
      respondedAt: new Date().toISOString()
    });
    
    // Create friendship relation
    await system.storage.addRelationByNameById('User_friends_friends_User', alice.id, bob.id, {
      createdAt: new Date().toISOString()
    });
    
    // Verify friendship
    const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
    expect(aliceUpdated.friendCount || 0).toBe(1);
  });

  test('should handle basic social interactions', async () => {
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    const controller = new Controller(
      system,
      entities,
      relations,
      [], // interactions
      [], // activities
      [], // dictionary
      [] // attributives
    );
    await controller.setup(true);
    const alice = await system.storage.create('User', {
      username: 'alice',
      displayName: 'Alice Smith'
    });
    
    const bob = await system.storage.create('User', {
      username: 'bob',
      displayName: 'Bob Johnson'  
    });
    
    // Create and publish a post
    const post = await system.storage.create('Post', {
      title: 'Test Post',
      content: 'Testing reactive computations',
      author: alice,
      status: 'published'
    });
    
    // Bob likes the post
    await system.storage.addRelationByNameById('User_likedPosts_likedBy_Post', bob.id, post.id, {
      createdAt: new Date().toISOString()
    });
    
    // Bob comments on the post
    await system.storage.create('Comment', {
      content: 'Great post!',
      author: bob,
      post: post
    });
    
    // Verify reactive computations updated
    const postUpdated = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), undefined, ['*']);
    const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
    const bobUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);
    
    expect(postUpdated.likeCount || 0).toBe(1);
    expect(postUpdated.commentCount || 0).toBe(1);
    expect(aliceUpdated.postCount || 0).toBe(1);
    expect(bobUpdated.commentCount || 0).toBe(1);
  });
});