import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { MonoSystem, Controller, BoolExp } from '@/index.js'
import { setupTest, teardownTest, createTestUsers, createTestTags, createTestCategories } from './setup.js'

describe('Social Network - Relations', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    const setup = await setupTest()
    system = setup.system
    controller = setup.controller
  })

  afterEach(async () => {
    await teardownTest(system)
  })

  describe('Friendship 好友关系', () => {
    test('应该能创建好友关系', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建好友关系
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        {
          status: 'pending',
          requesterId: alice.id
        }
      )

      // 查询关系
      const friendships = await system.storage.findRelationByName(
        'User_friends_friends_User',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(friendships.length).toBe(1)
      expect(friendships[0].relationData.status).toBe('pending')
      expect(friendships[0].relationData.requesterId).toBe(alice.id)
    })

    test('对称关系应该双向可见', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // Alice 向 Bob 发送好友请求
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        {
          status: 'accepted',
          requesterId: alice.id,
          acceptedAt: new Date().toISOString()
        }
      )

      // 从 Alice 视角查询好友
      const aliceFriends = await system.storage.findRelationByName(
        'User_friends_friends_User',
        BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      // 从 Bob 视角查询好友
      const bobFriends = await system.storage.findRelationByName(
        'User_friends_friends_User',
        BoolExp.atom({ key: 'source.id', value: ['=', bob.id] }),
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(aliceFriends.length).toBe(1)
      expect(bobFriends.length).toBe(1)
      expect(aliceFriends[0].target.id).toBe(bob.id)
      expect(bobFriends[0].target.id).toBe(alice.id)
    })

    test('应该能更新好友关系状态', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建待处理的好友请求
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        {
          status: 'pending',
          requesterId: alice.id
        }
      )

      // 接受好友请求
      await system.storage.updateRelationByName(
        'User_friends_friends_User',
        BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
        BoolExp.atom({ key: 'target.id', value: ['=', bob.id] }),
        {
          status: 'accepted',
          acceptedAt: new Date().toISOString()
        }
      )

      // 验证状态更新
      const friendships = await system.storage.findRelationByName(
        'User_friends_friends_User',
        undefined,
        undefined,
        ['*']
      )

      expect(friendships.length).toBe(1)
      expect(friendships[0].relationData.status).toBe('accepted')
      expect(friendships[0].relationData.acceptedAt).toBeDefined()
    })
  })

  describe('Follow 关注关系', () => {
    test('应该能创建关注关系', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // Alice 关注 Bob
      await system.storage.addRelationByNameById(
        'User_following_followers_User',
        alice.id,
        bob.id,
        {
          notificationEnabled: true
        }
      )

      // 查询关注关系
      const follows = await system.storage.findRelationByName(
        'User_following_followers_User',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(follows.length).toBe(1)
      expect(follows[0].source.id).toBe(alice.id)
      expect(follows[0].target.id).toBe(bob.id)
      expect(follows[0].relationData.notificationEnabled).toBe(true)
    })

    test('关注关系应该是非对称的', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // Alice 关注 Bob
      await system.storage.addRelationByNameById(
        'User_following_followers_User',
        alice.id,
        bob.id
      )

      // Alice 的关注列表应该包含 Bob
      const aliceFollowing = await system.storage.findRelationByName(
        'User_following_followers_User',
        BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
        undefined,
        ['*', ['target', { attributeQuery: ['*'] }]]
      )

      // Bob 的粉丝列表应该包含 Alice
      const bobFollowers = await system.storage.findRelationByName(
        'User_following_followers_User',
        BoolExp.atom({ key: 'target.id', value: ['=', bob.id] }),
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }]]
      )

      // Bob 的关注列表应该为空
      const bobFollowing = await system.storage.findRelationByName(
        'User_following_followers_User',
        BoolExp.atom({ key: 'source.id', value: ['=', bob.id] }),
        undefined,
        ['*']
      )

      expect(aliceFollowing.length).toBe(1)
      expect(aliceFollowing[0].target.id).toBe(bob.id)
      expect(bobFollowers.length).toBe(1)
      expect(bobFollowers[0].source.id).toBe(alice.id)
      expect(bobFollowing.length).toBe(0)
    })
  })

  describe('UserPost 用户帖子关系', () => {
    test('应该能创建用户帖子关系', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: 'Alice的帖子',
        content: '这是Alice的第一篇帖子',
        author: alice
      })

      // 验证关系
      const userPosts = await system.storage.findRelationByName(
        'User_posts_author_Post',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(userPosts.length).toBe(1)
      expect(userPosts[0].source.id).toBe(alice.id)
      expect(userPosts[0].target.id).toBe(post.id)
    })
  })

  describe('Like 点赞关系', () => {
    test('应该能创建点赞关系', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: 'Bob的帖子',
        content: '这是Bob的帖子',
        author: bob
      })

      // Alice 点赞 Bob 的帖子
      await system.storage.addRelationByNameById(
        'User_likedPosts_likers_Post',
        alice.id,
        post.id,
        {
          type: 'love'
        }
      )

      // 查询点赞关系
      const likes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(likes.length).toBe(1)
      expect(likes[0].source.id).toBe(alice.id)
      expect(likes[0].target.id).toBe(post.id)
      expect(likes[0].relationData.type).toBe('love')
      expect(likes[0].relationData.likedAt).toBeDefined()
    })
  })

  describe('View 浏览关系', () => {
    test('应该能创建浏览关系', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: 'Bob的帖子',
        content: '这是Bob的帖子',
        author: bob
      })

      // Alice 浏览 Bob 的帖子
      await system.storage.addRelationByNameById(
        'User_viewedPosts_viewers_Post',
        alice.id,
        post.id,
        {
          duration: 30,
          source: 'timeline'
        }
      )

      // 查询浏览关系
      const views = await system.storage.findRelationByName(
        'User_viewedPosts_viewers_Post',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(views.length).toBe(1)
      expect(views[0].source.id).toBe(alice.id)
      expect(views[0].target.id).toBe(post.id)
      expect(views[0].relationData.duration).toBe(30)
      expect(views[0].relationData.source).toBe('timeline')
    })
  })

  describe('PostTag 帖子标签关系', () => {
    test('应该能创建帖子标签关系', async () => {
      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const alice = users[0]
      const jsTag = tags[0]

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: 'JavaScript教程',
        content: '这是一个JavaScript教程',
        author: alice
      })

      // 添加标签
      await system.storage.addRelationByNameById(
        'Post_tags_posts_Tag',
        post.id,
        jsTag.id,
        {
          addedBy: alice.id
        }
      )

      // 查询标签关系
      const postTags = await system.storage.findRelationByName(
        'Post_tags_posts_Tag',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(postTags.length).toBe(1)
      expect(postTags[0].source.id).toBe(post.id)
      expect(postTags[0].target.id).toBe(jsTag.id)
      expect(postTags[0].relationData.addedBy).toBe(alice.id)
    })
  })

  describe('PostCategory 帖子分类关系', () => {
    test('应该能创建帖子分类关系', async () => {
      const users = await createTestUsers(system)
      const categories = await createTestCategories(system)
      const alice = users[0]
      const techCategory = categories[0]

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: '技术文章',
        content: '这是一篇技术文章',
        author: alice,
        category: techCategory
      })

      // 查询分类关系
      const postCategories = await system.storage.findRelationByName(
        'Post_category_posts_Category',
        undefined,
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }], ['target', { attributeQuery: ['*'] }]]
      )

      expect(postCategories.length).toBe(1)
      expect(postCategories[0].source.id).toBe(post.id)
      expect(postCategories[0].target.id).toBe(techCategory.id)
    })
  })

  describe('复杂关系查询', () => {
    test('应该能查询用户的所有好友', async () => {
      const users = await createTestUsers(system)
      const [alice, bob, carol] = users

      // Alice 与 Bob、Carol 成为好友
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        { status: 'accepted', requesterId: alice.id }
      )
      
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        carol.id,
        { status: 'accepted', requesterId: alice.id }
      )

      // 查询 Alice 的所有已接受的好友
      const aliceFriends = await system.storage.findRelationByName(
        'User_friends_friends_User',
        BoolExp.and([
          BoolExp.atom({ key: 'source.id', value: ['=', alice.id] }),
          BoolExp.atom({ key: 'relationData.status', value: ['=', 'accepted'] })
        ]),
        undefined,
        ['*', ['target', { attributeQuery: ['*'] }]]
      )

      expect(aliceFriends.length).toBe(2)
      const friendIds = aliceFriends.map(f => f.target.id)
      expect(friendIds).toContain(bob.id)
      expect(friendIds).toContain(carol.id)
    })

    test('应该能查询帖子的所有点赞', async () => {
      const users = await createTestUsers(system)
      const [alice, bob, carol] = users

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: '热门帖子',
        content: '这是一个热门帖子',
        author: alice
      })

      // 多个用户点赞
      await system.storage.addRelationByNameById(
        'User_likedPosts_likers_Post',
        bob.id,
        post.id,
        { type: 'like' }
      )
      
      await system.storage.addRelationByNameById(
        'User_likedPosts_likers_Post',
        carol.id,
        post.id,
        { type: 'love' }
      )

      // 查询帖子的所有点赞
      const postLikes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        BoolExp.atom({ key: 'target.id', value: ['=', post.id] }),
        undefined,
        ['*', ['source', { attributeQuery: ['*'] }]]
      )

      expect(postLikes.length).toBe(2)
      const likerIds = postLikes.map(l => l.source.id)
      expect(likerIds).toContain(bob.id)
      expect(likerIds).toContain(carol.id)
    })
  })
})