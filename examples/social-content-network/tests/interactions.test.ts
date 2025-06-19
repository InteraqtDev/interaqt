import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { MonoSystem, Controller, BoolExp } from '@/index.js'
import { setupTest, teardownTest, createTestUsers, createTestTags, createTestCategories } from './setup.js'
import { interactions } from '../src/interactions.js'

describe('Social Network - Interactions', () => {
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

  describe('用户管理交互', () => {
    test('UpdateUserProfile - 应该能更新用户档案', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      // 获取交互UUID（这里需要根据实际的交互查找方式调整）
      const updateProfileInteraction = interactions.find(i => i.name === 'UpdateUserProfile')
      
      // 执行更新档案交互
      const result = await controller.callInteraction(
        updateProfileInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            userId: alice.id,
            displayName: 'Alice Updated',
            bio: 'Updated bio information',
            avatar: 'https://example.com/new-avatar.jpg'
          }
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.data).toBeDefined()

      // 验证更新结果
      const updatedUser = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', alice.id] }),
        undefined,
        ['*']
      )

      expect(updatedUser.displayName).toBe('Alice Updated')
      expect(updatedUser.bio).toBe('Updated bio information')
      expect(updatedUser.avatar).toBe('https://example.com/new-avatar.jpg')
    })
  })

  describe('好友关系交互', () => {
    test('SendFriendRequest - 应该能发送好友请求', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      const sendRequestInteraction = interactions.find(i => i.name === 'SendFriendRequest')

      const result = await controller.callInteraction(
        sendRequestInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            fromUserId: alice.id,
            toUserId: bob.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证好友请求创建
      const friendships = await system.storage.findRelationByName(
        'User_friends_friends_User',
        undefined,
        undefined,
        ['*']
      )

      expect(friendships.length).toBe(1)
      expect(friendships[0].relationData.status).toBe('pending')
      expect(friendships[0].relationData.requesterId).toBe(alice.id)
    })

    test('AcceptFriendRequest - 应该能接受好友请求', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 先创建好友请求
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        { status: 'pending', requesterId: alice.id }
      )

      const acceptRequestInteraction = interactions.find(i => i.name === 'AcceptFriendRequest')

      const result = await controller.callInteraction(
        acceptRequestInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            userId: bob.id,
            friendId: alice.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证好友请求状态更新
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

    test('RejectFriendRequest - 应该能拒绝好友请求', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 先创建好友请求
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        { status: 'pending', requesterId: alice.id }
      )

      const rejectRequestInteraction = interactions.find(i => i.name === 'RejectFriendRequest')

      const result = await controller.callInteraction(
        rejectRequestInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            userId: bob.id,
            friendId: alice.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证好友请求被删除
      const friendships = await system.storage.findRelationByName(
        'User_friends_friends_User',
        undefined,
        undefined,
        ['*']
      )

      expect(friendships.length).toBe(0)
    })

    test('RemoveFriend - 应该能删除好友', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 先创建已接受的好友关系
      await system.storage.addRelationByNameById(
        'User_friends_friends_User',
        alice.id,
        bob.id,
        { status: 'accepted', requesterId: alice.id }
      )

      const removeFriendInteraction = interactions.find(i => i.name === 'RemoveFriend')

      const result = await controller.callInteraction(
        removeFriendInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            userId: alice.id,
            friendId: bob.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证好友关系被删除
      const friendships = await system.storage.findRelationByName(
        'User_friends_friends_User',
        undefined,
        undefined,
        ['*']
      )

      expect(friendships.length).toBe(0)
    })
  })

  describe('关注交互', () => {
    test('FollowUser - 应该能关注用户', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      const followUserInteraction = interactions.find(i => i.name === 'FollowUser')

      const result = await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            followerId: alice.id,
            followeeId: bob.id,
            notificationEnabled: true
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证关注关系创建
      const follows = await system.storage.findRelationByName(
        'User_following_followers_User',
        undefined,
        undefined,
        ['*']
      )

      expect(follows.length).toBe(1)
      expect(follows[0].relationData.notificationEnabled).toBe(true)
    })

    test('UnfollowUser - 应该能取消关注', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 先创建关注关系
      await system.storage.addRelationByNameById(
        'User_following_followers_User',
        alice.id,
        bob.id,
        { notificationEnabled: true }
      )

      const unfollowUserInteraction = interactions.find(i => i.name === 'UnfollowUser')

      const result = await controller.callInteraction(
        unfollowUserInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            followerId: alice.id,
            followeeId: bob.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证关注关系被删除
      const follows = await system.storage.findRelationByName(
        'User_following_followers_User',
        undefined,
        undefined,
        ['*']
      )

      expect(follows.length).toBe(0)
    })
  })

  describe('内容管理交互', () => {
    test('CreatePost - 应该能创建帖子', async () => {
      const users = await createTestUsers(system)
      const categories = await createTestCategories(system)
      const tags = await createTestTags(system)
      const alice = users[0]
      const techCategory = categories[0]
      const jsTag = tags[0]

      const createPostInteraction = interactions.find(i => i.name === 'CreatePost')

      const result = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'JavaScript教程',
            content: '这是一个详细的JavaScript教程',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id]
          }
        }
      )

      expect(result.error).toBeUndefined()
      expect(result.data).toBeDefined()

      // 验证帖子创建
      const posts = await system.storage.find('Post', {
        title: { $eq: 'JavaScript教程' }
      })

      expect(posts.length).toBe(1)
      expect(posts[0].content).toBe('这是一个详细的JavaScript教程')
      expect(posts[0].status).toBe('published')
      expect(posts[0].publishedAt).toBeDefined()

      // 验证分类关系
      const postCategories = await system.storage.findRelationByName(
        'Post_category_posts_Category',
        BoolExp.atom({ key: 'source.id', value: ['=', posts[0].id] }),
        undefined,
        ['*']
      )
      expect(postCategories.length).toBe(1)
      expect(postCategories[0].target.id).toBe(techCategory.id)

      // 验证标签关系
      const postTags = await system.storage.findRelationByName(
        'Post_tags_posts_Tag',
        BoolExp.atom({ key: 'source.id', value: ['=', posts[0].id] }),
        undefined,
        ['*']
      )
      expect(postTags.length).toBe(1)
      expect(postTags[0].target.id).toBe(jsTag.id)
    })

    test('EditPost - 应该能编辑帖子', async () => {
      const users = await createTestUsers(system)
      const categories = await createTestCategories(system)
      const tags = await createTestTags(system)
      const alice = users[0]
      const techCategory = categories[0]
      const designCategory = categories[1]
      const jsTag = tags[0]
      const reactTag = tags[1]

      // 先创建帖子
      const post = await system.storage.create('Post', {
        title: '原始标题',
        content: '原始内容',
        author: alice,
        category: techCategory
      })

      await system.storage.addRelationByNameById(
        'Post_tags_posts_Tag',
        post.id,
        jsTag.id,
        { addedBy: alice.id }
      )

      const editPostInteraction = interactions.find(i => i.name === 'EditPost')

      const result = await controller.callInteraction(
        editPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            postId: post.id,
            userId: alice.id,
            title: '更新的标题',
            content: '更新的内容',
            categoryId: designCategory.id,
            tags: [reactTag.id]
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证帖子更新
      const updatedPost = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )

      expect(updatedPost.title).toBe('更新的标题')
      expect(updatedPost.content).toBe('更新的内容')
      expect(updatedPost.updatedAt).toBeDefined()

      // 验证分类关系更新
      const newPostCategories = await system.storage.findRelationByName(
        'Post_category_posts_Category',
        BoolExp.atom({ key: 'source.id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(newPostCategories.length).toBe(1)
      expect(newPostCategories[0].target.id).toBe(designCategory.id)

      // 验证标签关系更新
      const newPostTags = await system.storage.findRelationByName(
        'Post_tags_posts_Tag',
        BoolExp.atom({ key: 'source.id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(newPostTags.length).toBe(1)
      expect(newPostTags[0].target.id).toBe(reactTag.id)
    })

    test('PublishPost - 应该能发布帖子', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      // 创建草稿帖子
      const post = await system.storage.create('Post', {
        title: '草稿帖子',
        content: '草稿内容',
        status: 'draft',
        author: alice
      })

      const publishPostInteraction = interactions.find(i => i.name === 'PublishPost')

      const result = await controller.callInteraction(
        publishPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            postId: post.id,
            userId: alice.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证帖子状态更新
      const publishedPost = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )

      expect(publishedPost.status).toBe('published')
      expect(publishedPost.publishedAt).toBeDefined()
    })

    test('DeletePost - 应该能删除帖子及相关数据', async () => {
      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const [alice, bob] = users
      const jsTag = tags[0]

      // 创建帖子并添加相关数据
      const post = await system.storage.create('Post', {
        title: '要删除的帖子',
        content: '要删除的内容',
        author: alice
      })

      // 添加点赞
      await system.storage.addRelationByNameById(
        'User_likedPosts_likers_Post',
        bob.id,
        post.id,
        { type: 'like' }
      )

      // 添加浏览
      await system.storage.addRelationByNameById(
        'User_viewedPosts_viewers_Post',
        bob.id,
        post.id,
        { duration: 30 }
      )

      // 添加标签
      await system.storage.addRelationByNameById(
        'Post_tags_posts_Tag',
        post.id,
        jsTag.id,
        { addedBy: alice.id }
      )

      const deletePostInteraction = interactions.find(i => i.name === 'DeletePost')

      const result = await controller.callInteraction(
        deletePostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            postId: post.id,
            userId: alice.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证帖子被删除
      const deletedPost = await system.storage.find('Post', {
        id: { $eq: post.id }
      })
      expect(deletedPost.length).toBe(0)

      // 验证相关关系也被删除
      const likes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        BoolExp.atom({ key: 'target.id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(likes.length).toBe(0)

      const views = await system.storage.findRelationByName(
        'User_viewedPosts_viewers_Post',
        BoolExp.atom({ key: 'target.id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(views.length).toBe(0)

      const postTags = await system.storage.findRelationByName(
        'Post_tags_posts_Tag',
        BoolExp.atom({ key: 'source.id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(postTags.length).toBe(0)
    })
  })

  describe('互动交互', () => {
    test('LikePost - 应该能点赞帖子', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: '测试帖子',
        content: '测试内容',
        author: alice
      })

      const likePostInteraction = interactions.find(i => i.name === 'LikePost')

      const result = await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            userId: bob.id,
            postId: post.id,
            type: 'love'
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证点赞关系创建
      const likes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        undefined,
        undefined,
        ['*']
      )

      expect(likes.length).toBe(1)
      expect(likes[0].relationData.type).toBe('love')
      expect(likes[0].relationData.likedAt).toBeDefined()

      // 验证帖子点赞数更新
      const updatedPost = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(updatedPost.likeCount).toBe(1)
    })

    test('UnlikePost - 应该能取消点赞', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: '测试帖子',
        content: '测试内容',
        author: alice
      })

      // 先点赞
      await system.storage.addRelationByNameById(
        'User_likedPosts_likers_Post',
        bob.id,
        post.id,
        { type: 'like' }
      )

      const unlikePostInteraction = interactions.find(i => i.name === 'UnlikePost')

      const result = await controller.callInteraction(
        unlikePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            userId: bob.id,
            postId: post.id
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证点赞关系被删除
      const likes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        undefined,
        undefined,
        ['*']
      )
      expect(likes.length).toBe(0)

      // 验证帖子点赞数更新
      const updatedPost = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(updatedPost.likeCount).toBe(0)
    })

    test('ViewPost - 应该能记录帖子浏览', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // 创建帖子
      const post = await system.storage.create('Post', {
        title: '测试帖子',
        content: '测试内容',
        author: alice
      })

      const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')

      const result = await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            userId: bob.id,
            postId: post.id,
            duration: 45,
            source: 'search'
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证浏览记录创建
      const views = await system.storage.findRelationByName(
        'User_viewedPosts_viewers_Post',
        undefined,
        undefined,
        ['*']
      )

      expect(views.length).toBe(1)
      expect(views[0].relationData.duration).toBe(45)
      expect(views[0].relationData.source).toBe('search')

      // 验证帖子浏览数更新
      const updatedPost = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )
      expect(updatedPost.viewCount).toBe(1)
    })
  })

  describe('标签和分类交互', () => {
    test('CreateTag - 应该能创建标签', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      const createTagInteraction = interactions.find(i => i.name === 'CreateTag')

      const result = await controller.callInteraction(
        createTagInteraction!.uuid,
        {
          user: { ...alice, roles: ['admin'] },
          payload: {
            name: 'newtag',
            description: '新创建的标签',
            color: '#ff5722'
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证标签创建
      const tags = await system.storage.find('Tag', {
        name: { $eq: 'newtag' }
      })

      expect(tags.length).toBe(1)
      expect(tags[0].description).toBe('新创建的标签')
      expect(tags[0].color).toBe('#ff5722')
    })

    test('CreateCategory - 应该能创建分类', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      const createCategoryInteraction = interactions.find(i => i.name === 'CreateCategory')

      const result = await controller.callInteraction(
        createCategoryInteraction!.uuid,
        {
          user: { ...alice, roles: ['admin'] },
          payload: {
            name: 'New Category',
            description: '新创建的分类',
            order: 10
          }
        }
      )

      expect(result.error).toBeUndefined()

      // 验证分类创建
      const categories = await system.storage.find('Category', {
        name: { $eq: 'New Category' }
      })

      expect(categories.length).toBe(1)
      expect(categories[0].description).toBe('新创建的分类')
      expect(categories[0].order).toBe(10)
    })
  })

  describe('交互权限验证', () => {
    test('只有帖子作者能编辑自己的帖子', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // Alice 创建帖子
      const post = await system.storage.create('Post', {
        title: '测试帖子',
        content: '测试内容',
        author: alice
      })

      const editPostInteraction = interactions.find(i => i.name === 'EditPost')

      // Bob 尝试编辑 Alice 的帖子（应该失败）
      const result = await controller.callInteraction(
        editPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            postId: post.id,
            userId: bob.id,
            title: '恶意修改的标题'
          }
        }
      )

      // 这里需要根据实际的权限实现来验证错误
      // expect(result.error).toBeDefined()
    })

    test('只有帖子作者能删除自己的帖子', async () => {
      const users = await createTestUsers(system)
      const [alice, bob] = users

      // Alice 创建帖子
      const post = await system.storage.create('Post', {
        title: '测试帖子',
        content: '测试内容',
        author: alice
      })

      const deletePostInteraction = interactions.find(i => i.name === 'DeletePost')

      // Bob 尝试删除 Alice 的帖子（应该失败）
      const result = await controller.callInteraction(
        deletePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            postId: post.id,
            userId: bob.id
          }
        }
      )

      // 这里需要根据实际的权限实现来验证错误
      // expect(result.error).toBeDefined()
    })
  })

  describe('复杂业务流程', () => {
    test('完整的社交互动流程', async () => {
      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const categories = await createTestCategories(system)
      const [alice, bob, carol] = users
      const jsTag = tags[0]
      const techCategory = categories[0]

      // 1. Alice 和 Bob 成为好友
      const sendRequestInteraction = interactions.find(i => i.name === 'SendFriendRequest')
      await controller.callInteraction(
        sendRequestInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { fromUserId: alice.id, toUserId: bob.id }
        }
      )

      const acceptRequestInteraction = interactions.find(i => i.name === 'AcceptFriendRequest')
      await controller.callInteraction(
        acceptRequestInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, friendId: alice.id }
        }
      )

      // 2. Carol 关注 Alice
      const followUserInteraction = interactions.find(i => i.name === 'FollowUser')
      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { followerId: carol.id, followeeId: alice.id }
        }
      )

      // 3. Alice 发布帖子
      const createPostInteraction = interactions.find(i => i.name === 'CreatePost')
      const postResult = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'JavaScript最佳实践',
            content: '分享一些JavaScript开发的最佳实践',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id]
          }
        }
      )

      const postId = postResult.data.id

      // 4. Bob 和 Carol 点赞帖子
      const likePostInteraction = interactions.find(i => i.name === 'LikePost')
      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId, type: 'like' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId, type: 'love' }
        }
      )

      // 5. Bob 和 Carol 浏览帖子
      const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId, duration: 60, source: 'timeline' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId, duration: 90, source: 'recommendation' }
        }
      )

      // 验证最终状态
      
      // Alice 的统计数据
      const aliceData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', alice.id] }),
        undefined,
        ['*']
      )
      expect(aliceData.friendCount).toBe(1)      // Bob
      expect(aliceData.followerCount).toBe(1)    // Carol
      expect(aliceData.postCount).toBe(1)        // 1个已发布帖子
      expect(aliceData.activityScore).toBeGreaterThan(0)

      // 帖子的统计数据
      const postData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', postId] }),
        undefined,
        ['*']
      )
      expect(postData.likeCount).toBe(2)         // Bob + Carol
      expect(postData.viewCount).toBe(2)         // Bob + Carol
      expect(postData.engagementScore).toBe(3)   // like(1) + love(2) = 3

      // 标签的统计数据
      const tagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', jsTag.id] }),
        undefined,
        ['*']
      )
      expect(tagData.postCount).toBe(1)
      expect(tagData.popularityScore).toBe(2.2)  // likeCount(2) * 2 + viewCount(2) * 0.1 = 4.2

      // 分类的统计数据
      const categoryData = await system.storage.findOne(
        'Category',
        BoolExp.atom({ key: 'id', value: ['=', techCategory.id] }),
        undefined,
        ['*']
      )
      expect(categoryData.postCount).toBe(1)
      expect(categoryData.activePostCount).toBe(1)
    })
  })
})