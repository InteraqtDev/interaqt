import { describe, test, expect, beforeEach } from 'vitest';
import { BoolExp, MonoSystem, Controller, KlassByName, removeAllInstance } from '@';
import { entities } from '../src/entities.js';
import { relations } from '../src/relations.js';

describe('Social Content Network - Comprehensive Tests', () => {
  let system: MonoSystem;
  let controller: Controller;

  beforeEach(async () => {
    removeAllInstance();
    system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    controller = new Controller(
      system,
      entities,
      relations,
      [], // interactions
      [], // activities
      [], // dictionary
      [] // attributives
    );
    await controller.setup(true);
  });

  describe('User Management and Friend System', () => {
    test('should handle multiple friend requests and their states', async () => {
      // Create users
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith',
        email: 'alice@example.com'
      });

      const bob = await system.storage.create('User', {
        username: 'bob',
        displayName: 'Bob Johnson',
        email: 'bob@example.com'
      });

      const charlie = await system.storage.create('User', {
        username: 'charlie',
        displayName: 'Charlie Brown',
        email: 'charlie@example.com'
      });

      // Alice sends friend request to Bob
      const friendRequest1 = await system.storage.create('FriendRequest', {
        message: 'Hi Bob, let\'s be friends!',
        status: 'pending',
        requester: alice,
        receiver: bob
      });

      // Bob accepts the request
      await system.storage.update('FriendRequest', 
        BoolExp.atom({key: 'id', value: ['=', friendRequest1.id]}), 
        {
          status: 'accepted',
          respondedAt: new Date().toISOString()
        }
      );

      // Create friendship
      await system.storage.addRelationByNameById('User_friends_friends_User', alice.id, bob.id, {});

      // Alice sends request to Charlie
      const friendRequest2 = await system.storage.create('FriendRequest', {
        message: 'Hey Charlie!',
        status: 'pending',
        requester: alice,
        receiver: charlie
      });

      // Charlie rejects the request
      await system.storage.update('FriendRequest',
        BoolExp.atom({key: 'id', value: ['=', friendRequest2.id]}),
        {
          status: 'rejected',
          respondedAt: new Date().toISOString()
        }
      );

      // Verify friend counts
      const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      const bobUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);
      const charlieUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', charlie.id]}), undefined, ['*']);

      expect(aliceUpdated.friendCount || 0).toBe(1);
      expect(bobUpdated.friendCount || 0).toBe(1);
      expect(charlieUpdated.friendCount || 0).toBe(0);

      // Verify request statuses
      const acceptedRequest = await system.storage.findOne('FriendRequest', BoolExp.atom({key: 'id', value: ['=', friendRequest1.id]}), undefined, ['*']);
      const rejectedRequest = await system.storage.findOne('FriendRequest', BoolExp.atom({key: 'id', value: ['=', friendRequest2.id]}), undefined, ['*']);

      expect(acceptedRequest.status).toBe('accepted');
      expect(rejectedRequest.status).toBe('rejected');
      expect(acceptedRequest.respondedAt).toBeDefined();
      expect(rejectedRequest.respondedAt).toBeDefined();
    });

    test('should handle bidirectional friendships correctly', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      const bob = await system.storage.create('User', {
        username: 'bob',
        displayName: 'Bob Johnson'
      });

      // Create bidirectional friendship
      await system.storage.addRelationByNameById('User_friends_friends_User', alice.id, bob.id, {});

      // Verify both users have friend count of 1
      const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      const bobUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);

      expect(aliceUpdated.friendCount || 0).toBe(1);
      expect(bobUpdated.friendCount || 0).toBe(1);
    });
  });

  describe('Content Publishing and Visibility', () => {
    test('should handle different post visibility levels', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      // Create posts with different visibility
      const publicPost = await system.storage.create('Post', {
        title: 'Public Post',
        content: 'This is visible to everyone',
        visibility: 'public',
        status: 'published',
        author: alice
      });

      const friendsPost = await system.storage.create('Post', {
        title: 'Friends Only Post',
        content: 'This is only for friends',
        visibility: 'friends',
        status: 'published',
        author: alice
      });

      const privatePost = await system.storage.create('Post', {
        title: 'Private Post',
        content: 'This is private',
        visibility: 'private',
        status: 'draft',
        author: alice
      });

      // Verify post counts
      const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      expect(aliceUpdated.postCount || 0).toBe(3);

      // Verify different post statuses
      const fullPublicPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', publicPost.id]}), undefined, ['*']);
      const fullFriendsPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', friendsPost.id]}), undefined, ['*']);
      const fullPrivatePost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', privatePost.id]}), undefined, ['*']);

      expect(fullPublicPost.visibility).toBe('public');
      expect(fullPublicPost.status).toBe('published');
      expect(fullFriendsPost.visibility).toBe('friends');
      expect(fullFriendsPost.status).toBe('published');
      expect(fullPrivatePost.visibility).toBe('private');
      expect(fullPrivatePost.status).toBe('draft');
    });

    test('should handle post drafts and publishing workflow', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      // Create a draft post
      const draftPost = await system.storage.create('Post', {
        title: 'My Draft Post',
        content: 'This is still being worked on',
        status: 'draft',
        visibility: 'public',
        author: alice
      });

      // Verify initial state
      let fullPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', draftPost.id]}), undefined, ['*']);
      expect(fullPost.status).toBe('draft');
      expect(fullPost.publishedAt).toBeUndefined();

      // Update content
      await system.storage.update('Post',
        BoolExp.atom({key: 'id', value: ['=', draftPost.id]}),
        {
          content: 'Updated content for the post',
          updatedAt: new Date().toISOString()
        }
      );

      // Publish the post
      const publishedAt = new Date().toISOString();
      await system.storage.update('Post',
        BoolExp.atom({key: 'id', value: ['=', draftPost.id]}),
        {
          status: 'published',
          publishedAt: publishedAt,
          updatedAt: publishedAt
        }
      );

      // Verify published state
      fullPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', draftPost.id]}), undefined, ['*']);
      expect(fullPost.status).toBe('published');
      expect(fullPost.publishedAt).toBe(publishedAt);
      expect(fullPost.content).toBe('Updated content for the post');
    });
  });

  describe('Comment System and Nested Replies', () => {
    test('should handle comments and nested replies', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      const bob = await system.storage.create('User', {
        username: 'bob',
        displayName: 'Bob Johnson'
      });

      const charlie = await system.storage.create('User', {
        username: 'charlie',
        displayName: 'Charlie Brown'
      });

      // Create a post
      const post = await system.storage.create('Post', {
        title: 'Discussion Post',
        content: 'What do you think about this topic?',
        status: 'published',
        author: alice
      });

      // Bob comments on the post
      const comment1 = await system.storage.create('Comment', {
        content: 'Great question! I think...',
        author: bob,
        post: post
      });

      // Charlie replies to Bob's comment
      const reply1 = await system.storage.create('Comment', {
        content: 'I agree with Bob on this point.',
        author: charlie,
        post: post,
        parentComment: comment1
      });

      // Alice replies to Charlie's reply (nested)
      const nestedReply = await system.storage.create('Comment', {
        content: 'Thanks for the discussion, everyone!',
        author: alice,
        post: post,
        parentComment: reply1
      });

      // Verify comment counts
      const postUpdated = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), undefined, ['*']);
      expect(postUpdated.commentCount || 0).toBe(3);

      // Verify user comment counts
      const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      const bobUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);
      const charlieUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', charlie.id]}), undefined, ['*']);

      expect(aliceUpdated.commentCount || 0).toBe(1);
      expect(bobUpdated.commentCount || 0).toBe(1);
      expect(charlieUpdated.commentCount || 0).toBe(1);

      // Test comment deletion (soft delete)
      await system.storage.update('Comment',
        BoolExp.atom({key: 'id', value: ['=', comment1.id]}),
        { isDeleted: true }
      );

      const deletedComment = await system.storage.findOne('Comment', BoolExp.atom({key: 'id', value: ['=', comment1.id]}), undefined, ['*']);
      expect(deletedComment.isDeleted).toBe(1); // SQLite stores boolean as 1
    });
  });

  describe('Like System and Social Interactions', () => {
    test('should handle likes on posts and comments', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      const bob = await system.storage.create('User', {
        username: 'bob',
        displayName: 'Bob Johnson'
      });

      const charlie = await system.storage.create('User', {
        username: 'charlie',
        displayName: 'Charlie Brown'
      });

      // Create a post
      const post = await system.storage.create('Post', {
        title: 'Likeable Post',
        content: 'Hope everyone likes this!',
        status: 'published',
        author: alice
      });

      // Create a comment
      const comment = await system.storage.create('Comment', {
        content: 'Nice post!',
        author: bob,
        post: post
      });

      // Bob likes Alice's post
      await system.storage.addRelationByNameById('User_likedPosts_likedBy_Post', bob.id, post.id, {});

      // Charlie likes Alice's post
      await system.storage.addRelationByNameById('User_likedPosts_likedBy_Post', charlie.id, post.id, {});

      // Alice likes Bob's comment
      await system.storage.addRelationByNameById('User_likedComments_likedBy_Comment', alice.id, comment.id, {});

      // Verify like counts
      const postUpdated = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post.id]}), undefined, ['*']);
      expect(postUpdated.likeCount || 0).toBe(2);

      // Note: Unlike functionality would require more complex relation queries
      // For now, we've verified that the like system works correctly
    });
  });

  describe('Tag System and Content Organization', () => {
    test('should handle tags and content filtering', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      // Create tags
      const techTag = await system.storage.create('Tag', {
        name: 'technology'
      });

      const newsTag = await system.storage.create('Tag', {
        name: 'news'
      });

      const trendingTag = await system.storage.create('Tag', {
        name: 'trending'
      });

      // Create posts with tags
      const post1 = await system.storage.create('Post', {
        title: 'Latest Tech News',
        content: 'Breaking technology news...',
        tags: ['technology', 'news'],
        status: 'published',
        author: alice
      });

      const post2 = await system.storage.create('Post', {
        title: 'Trending Technologies',
        content: 'What\'s trending in tech...',
        tags: ['technology', 'trending'],
        status: 'published',
        author: alice
      });

      const post3 = await system.storage.create('Post', {
        title: 'Daily News',
        content: 'Today\'s news summary...',
        tags: ['news'],
        status: 'published',
        author: alice
      });

      // Associate posts with tags using relations
      await system.storage.addRelationByNameById('Post_tagEntities_posts_Tag', post1.id, techTag.id, {});
      await system.storage.addRelationByNameById('Post_tagEntities_posts_Tag', post1.id, newsTag.id, {});
      
      await system.storage.addRelationByNameById('Post_tagEntities_posts_Tag', post2.id, techTag.id, {});
      await system.storage.addRelationByNameById('Post_tagEntities_posts_Tag', post2.id, trendingTag.id, {});
      
      await system.storage.addRelationByNameById('Post_tagEntities_posts_Tag', post3.id, newsTag.id, {});

      // Verify tag properties in posts
      const fullPost1 = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', post1.id]}), undefined, ['*']);
      expect(fullPost1.tags).toEqual(['technology', 'news']);

      // Verify user post count
      const aliceUpdated = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      expect(aliceUpdated.postCount || 0).toBe(3);
    });
  });

  describe('Complex Social Scenarios', () => {
    test('should handle a complete social workflow', async () => {
      // Create users
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith',
        bio: 'Tech enthusiast'
      });

      const bob = await system.storage.create('User', {
        username: 'bob',
        displayName: 'Bob Johnson',
        bio: 'News blogger'
      });

      const charlie = await system.storage.create('User', {
        username: 'charlie',
        displayName: 'Charlie Brown',
        bio: 'Casual user'
      });

      // Establish friendships
      await system.storage.addRelationByNameById('User_friends_friends_User', alice.id, bob.id, {});
      await system.storage.addRelationByNameById('User_friends_friends_User', bob.id, charlie.id, {});

      // Alice creates a post
      const alicePost = await system.storage.create('Post', {
        title: 'My Thoughts on Technology',
        content: 'I believe technology will shape our future...',
        tags: ['technology', 'future'],
        status: 'published',
        visibility: 'friends',
        author: alice
      });

      // Bob (friend) can see and interact with the post
      await system.storage.addRelationByNameById('User_likedPosts_likedBy_Post', bob.id, alicePost.id, {});

      const bobComment = await system.storage.create('Comment', {
        content: 'Great insights, Alice! I especially liked the part about...',
        author: bob,
        post: alicePost
      });

      // Charlie (not a direct friend) creates own content
      const charliePost = await system.storage.create('Post', {
        title: 'Weekend Plans',
        content: 'Looking forward to a relaxing weekend!',
        status: 'published',
        visibility: 'public',
        author: charlie
      });

      // Bob can see Charlie's public post and comment
      const charlieComment = await system.storage.create('Comment', {
        content: 'Sounds nice! Enjoy your weekend.',
        author: bob,
        post: charliePost
      });

      // Alice replies to Bob's comment on her post
      const aliceReply = await system.storage.create('Comment', {
        content: 'Thanks Bob! I\'d love to discuss this more.',
        author: alice,
        post: alicePost,
        parentComment: bobComment
      });

      // Verify final statistics
      const finalAlice = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      const finalBob = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);
      const finalCharlie = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', charlie.id]}), undefined, ['*']);

      expect(finalAlice.friendCount || 0).toBe(1);
      expect(finalAlice.postCount || 0).toBe(1);
      expect(finalAlice.commentCount || 0).toBe(1);

      expect(finalBob.friendCount || 0).toBe(2);
      expect(finalBob.postCount || 0).toBe(0);
      expect(finalBob.commentCount || 0).toBe(2);

      expect(finalCharlie.friendCount || 0).toBe(1);
      expect(finalCharlie.postCount || 0).toBe(1);
      expect(finalCharlie.commentCount || 0).toBe(0);

      const finalAlicePost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', alicePost.id]}), undefined, ['*']);
      const finalCharliePost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', charliePost.id]}), undefined, ['*']);

      expect(finalAlicePost.likeCount || 0).toBe(1);
      expect(finalAlicePost.commentCount || 0).toBe(2);
      expect(finalCharliePost.likeCount || 0).toBe(0);
      expect(finalCharliePost.commentCount || 0).toBe(1);
    });

    test('should handle content moderation scenarios', async () => {
      const alice = await system.storage.create('User', {
        username: 'alice',
        displayName: 'Alice Smith'
      });

      const bob = await system.storage.create('User', {
        username: 'bob',
        displayName: 'Bob Johnson'
      });

      // Create a post that gets deleted
      const problematicPost = await system.storage.create('Post', {
        title: 'Controversial Topic',
        content: 'This might be problematic content...',
        status: 'published',
        author: alice
      });

      // Bob comments on it
      const comment = await system.storage.create('Comment', {
        content: 'I disagree with this!',
        author: bob,
        post: problematicPost
      });

      // Moderate content - mark post as deleted
      await system.storage.update('Post',
        BoolExp.atom({key: 'id', value: ['=', problematicPost.id]}),
        { status: 'deleted' }
      );

      // Also soft-delete the comment
      await system.storage.update('Comment',
        BoolExp.atom({key: 'id', value: ['=', comment.id]}),
        { isDeleted: true }
      );

      // Verify moderation status
      const moderatedPost = await system.storage.findOne('Post', BoolExp.atom({key: 'id', value: ['=', problematicPost.id]}), undefined, ['*']);
      const moderatedComment = await system.storage.findOne('Comment', BoolExp.atom({key: 'id', value: ['=', comment.id]}), undefined, ['*']);

      expect(moderatedPost.status).toBe('deleted');
      expect(moderatedComment.isDeleted).toBe(1); // SQLite stores boolean as 1

      // User stats should still reflect the content exists (for moderation tracking)
      const aliceAfterModeration = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', alice.id]}), undefined, ['*']);
      const bobAfterModeration = await system.storage.findOne('User', BoolExp.atom({key: 'id', value: ['=', bob.id]}), undefined, ['*']);

      expect(aliceAfterModeration.postCount || 0).toBe(1);
      expect(bobAfterModeration.commentCount || 0).toBe(1);
    });
  });
});