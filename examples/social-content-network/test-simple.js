// Simple test runner to verify the social content network example
// This file demonstrates basic usage of the social network system

import { MonoSystem, Controller, KlassByName, BoolExp } from '@';
import { entities } from './src/entities.js';
import { relations } from './src/relations.js';

async function runSimpleTest() {
  console.log('🚀 Starting Social Content Network Test...');
  
  try {
    // Start the system
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    const controller = new Controller(
      system,
      entities,
      relations,
      [],
      [],
      [],
      []
    );
    
    await controller.setup(true);
    console.log('✅ System started successfully');
    
    // Create test users
    console.log('\n👥 Creating users...');
    const alice = await system.storage.create('User', {
      username: 'alice',
      displayName: 'Alice Smith',
      email: 'alice@example.com',
      bio: 'Love connecting with friends!'
    });
    console.log(`✅ Created user: ${alice.displayName} (${alice.username})`);
    
    const bob = await system.storage.create('User', {
      username: 'bob',
      displayName: 'Bob Johnson',
      email: 'bob@example.com',
      bio: 'Tech enthusiast'
    });
    console.log(`✅ Created user: ${bob.displayName} (${bob.username})`);
    
    // Create friendship
    console.log('\n🤝 Establishing friendship...');
    const request = await system.storage.create('FriendRequest', {
      requester: alice,
      receiver: bob,
      message: 'Hi Bob, let\'s be friends!',
      status: 'pending'
    });
    console.log(`✅ Friend request sent from ${alice.displayName} to ${bob.displayName}`);
    
    // Accept friend request
    await system.storage.update('FriendRequest', BoolExp.atom({key: 'id', value: ['=', request.id]}), {
      status: 'accepted',
      respondedAt: new Date().toISOString()
    });
    
    await system.storage.addRelationByNameById('User_friends_friends_User', alice.id, bob.id, {
      createdAt: new Date().toISOString()
    });
    console.log(`✅ Friend request accepted - they are now friends!`);
    
    // Create and publish content
    console.log('\n📝 Creating content...');
    const post = await system.storage.create('Post', {
      title: 'My First Social Post',
      content: 'Hello everyone! This is my first post on this social network.',
      tags: ['introduction', 'hello', 'social'],
      visibility: 'public',
      author: alice
    });
    console.log(`✅ Created post: "${post.title}" by ${alice.displayName}`);
    
    await system.storage.update('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), {
      status: 'published',
      publishedAt: new Date().toISOString()
    });
    console.log(`✅ Post published successfully`);
    
    // Social interactions
    console.log('\n💬 Social interactions...');
    
    // Bob views the post
    await system.storage.update('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), {
      viewCount: (post.viewCount || 0) + 1
    });
    console.log(`✅ ${bob.displayName} viewed the post`);
    
    // Bob likes the post
    await system.storage.addRelationByNameById('User_likedPosts_likedBy_Post', bob.id, post.id, {
      createdAt: new Date().toISOString()
    });
    console.log(`✅ ${bob.displayName} liked the post`);
    
    // Bob comments on the post
    const comment = await system.storage.create('Comment', {
      content: 'Great post Alice! Welcome to the network.',
      author: bob,
      post: post
    });
    console.log(`✅ ${bob.displayName} commented: "${comment.content}"`);
    
    // Alice replies to the comment
    await system.storage.create('Comment', {
      content: 'Thanks Bob! Happy to be here.',
      author: alice,
      post: post,
      parentComment: comment
    });
    console.log(`✅ ${alice.displayName} replied to the comment`);
    
    // Check final statistics
    console.log('\n📊 Final Statistics:');
    
    const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
    const bobUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);
    const postUpdated = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), undefined, ['*']);
    
    console.log(`📈 Alice: ${aliceUpdated.friendCount || 0} friends, ${aliceUpdated.postCount || 0} posts, activity score: ${aliceUpdated.activityScore || 0}`);
    console.log(`📈 Bob: ${bobUpdated.friendCount || 0} friends, ${bobUpdated.commentCount || 0} comments, activity score: ${bobUpdated.activityScore || 0}`);
    console.log(`📈 Post: ${postUpdated.likeCount || 0} likes, ${postUpdated.commentCount || 0} comments, ${postUpdated.viewCount || 0} views, hot score: ${postUpdated.hotScore || 0}`);
    
    console.log('\n✅ System test completed successfully');
    console.log('🎉 Social Content Network test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runSimpleTest().catch(console.error);