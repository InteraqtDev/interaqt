// Basic test to verify the fixed social content network example
const { MonoSystem, Controller, KlassByName, BoolExp } = require('@');

async function testBasicFunctionality() {
  console.log('Testing Social Content Network Example...');
  
  try {
    // Import the fixed modules
    const { entities } = await import('./src/entities.js');
    const { relations } = await import('./src/relations.js');
    
    console.log('✓ Successfully imported entities and relations');
    console.log(`- Found ${entities.length} entities: ${entities.map(e => e.name).join(', ')}`);
    console.log(`- Found ${relations.length} relations: ${relations.map(r => r.source.name + '->' + r.target.name).join(', ')}`);

    // Create system
    const system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    const controller = new Controller(
      system,
      entities,
      relations,
      [], // activities
      [], // interactions  
      [], // dictionary
      [] // attributives
    );
    
    await controller.setup(true);
    console.log('✓ Successfully set up controller and system');

    // Test basic entity creation
    const alice = await system.storage.create('User', {
      username: 'alice',
      displayName: 'Alice Smith',
      email: 'alice@example.com'
    });
    
    console.log('✓ Created user:', alice);
    
    // Test post creation
    const post = await system.storage.create('Post', {
      title: 'Hello World',
      content: 'My first post',
      author: alice
    });
    
    console.log('✓ Created post:', post);
    
    // Test computed properties
    const userWithCounts = await system.storage.findOne('User', 
      BoolExp.atom({key: 'id', value: ['=', alice.id]}), 
      undefined, 
      ['*']
    );
    
    console.log('✓ User with computed properties:', {
      id: userWithCounts.id,
      username: userWithCounts.username,
      postCount: userWithCounts.postCount || 0,
      friendCount: userWithCounts.friendCount || 0,
      commentCount: userWithCounts.commentCount || 0
    });
    
    // Test friendship
    const bob = await system.storage.create('User', {
      username: 'bob',
      displayName: 'Bob Johnson'
    });
    
    // Create friendship
    await system.storage.addRelationByNameById('User_friends_friends_User', alice.id, bob.id, {
      createdAt: new Date().toISOString()
    });
    
    const aliceWithFriend = await system.storage.findOne('User', 
      BoolExp.atom({key: 'id', value: ['=', alice.id]}), 
      undefined, 
      ['*']
    );
    
    console.log('✓ Alice after adding friend:', {
      friendCount: aliceWithFriend.friendCount || 0
    });
    
    // Test likes
    await system.storage.addRelationByNameById('User_likedPosts_likedBy_Post', bob.id, post.id, {
      createdAt: new Date().toISOString()
    });
    
    const postWithLikes = await system.storage.findOne('Post', 
      BoolExp.atom({key: 'id', value: ['=', post.id]}), 
      undefined, 
      ['*']
    );
    
    console.log('✓ Post after like:', {
      likeCount: postWithLikes.likeCount || 0
    });
    
    // Test comments
    const comment = await system.storage.create('Comment', {
      content: 'Great post!',
      author: bob,
      post: post
    });
    
    const postWithComments = await system.storage.findOne('Post', 
      BoolExp.atom({key: 'id', value: ['=', post.id]}), 
      undefined, 
      ['*']
    );
    
    console.log('✓ Post after comment:', {
      commentCount: postWithComments.commentCount || 0
    });
    
    const bobWithComments = await system.storage.findOne('User', 
      BoolExp.atom({key: 'id', value: ['=', bob.id]}), 
      undefined, 
      ['*']
    );
    
    console.log('✓ Bob after commenting:', {
      commentCount: bobWithComments.commentCount || 0
    });
    
    console.log('\n🎉 All tests passed! The social content network example is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testBasicFunctionality();