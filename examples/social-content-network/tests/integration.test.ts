import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { MonoSystem, Controller, BoolExp } from '@/index.js'
import { setupTest, teardownTest, createTestUsers, createTestTags, createTestCategories } from './setup.js'
import { interactions } from '../src/interactions.js'

describe('Social Network - Integration Tests', () => {
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

  describe('端到端用户场景', () => {
    test('新用户注册后的完整体验流程', async () => {
      // 场景：Alice 是新用户，她要使用社交网络的各种功能

      // 1. 准备测试数据
      const users = await createTestUsers(system)
      const tags = await createTestTags(system) 
      const categories = await createTestCategories(system)
      const [alice, bob, carol, david] = users
      const [jsTag, reactTag, designTag, techTag] = tags
      const [techCategory, designCategory, lifestyleCategory] = categories

      // 2. Alice 更新个人档案
      const updateProfileInteraction = interactions.find(i => i.name === 'UpdateUserProfile')
      await controller.callInteraction(
        updateProfileInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            userId: alice.id,
            displayName: 'Alice the Developer',
            bio: 'Full-stack developer passionate about JavaScript and React',
            avatar: 'https://example.com/alice-professional.jpg'
          }
        }
      )

      // 3. Alice 发送好友请求给 Bob 和 Carol
      const sendFriendRequestInteraction = interactions.find(i => i.name === 'SendFriendRequest')
      
      await controller.callInteraction(
        sendFriendRequestInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { fromUserId: alice.id, toUserId: bob.id }
        }
      )

      await controller.callInteraction(
        sendFriendRequestInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { fromUserId: alice.id, toUserId: carol.id }
        }
      )

      // 4. Bob 接受好友请求，Carol 拒绝
      const acceptFriendRequestInteraction = interactions.find(i => i.name === 'AcceptFriendRequest')
      const rejectFriendRequestInteraction = interactions.find(i => i.name === 'RejectFriendRequest')

      await controller.callInteraction(
        acceptFriendRequestInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, friendId: alice.id }
        }
      )

      await controller.callInteraction(
        rejectFriendRequestInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, friendId: alice.id }
        }
      )

      // 5. Alice 关注 Carol 和 David（非对等关系）
      const followUserInteraction = interactions.find(i => i.name === 'FollowUser')

      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { followerId: alice.id, followeeId: carol.id }
        }
      )

      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { followerId: alice.id, followeeId: david.id }
        }
      )

      // 6. David 也关注 Alice
      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { followerId: david.id, followeeId: alice.id }
        }
      )

      // 7. Alice 创建多篇不同类型的帖子
      const createPostInteraction = interactions.find(i => i.name === 'CreatePost')

      // 技术文章
      const techPostResult = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'React Hooks 深度解析',
            content: '本文将深入探讨 React Hooks 的原理和最佳实践...',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id, reactTag.id]
          }
        }
      )

      // 设计文章
      const designPostResult = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'UI设计趋势 2024',
            content: '2024年的UI设计趋势包括...',
            authorId: alice.id,
            status: 'published',
            categoryId: designCategory.id,
            tags: [designTag.id]
          }
        }
      )

      // 草稿文章
      const draftPostResult = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: '未完成的想法',
            content: '这是一个还在构思中的文章...',
            authorId: alice.id,
            status: 'draft',
            categoryId: lifestyleCategory.id,
            tags: []
          }
        }
      )

      const techPostId = techPostResult.data.id
      const designPostId = designPostResult.data.id

      // 8. 其他用户与 Alice 的帖子互动
      const likePostInteraction = interactions.find(i => i.name === 'LikePost')
      const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')

      // Bob 点赞两篇文章
      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: techPostId, type: 'love' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: designPostId, type: 'like' }
        }
      )

      // Carol 浏览并点赞技术文章
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId: techPostId, duration: 120, source: 'search' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId: techPostId, type: 'wow' }
        }
      )

      // David 浏览两篇文章
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: techPostId, duration: 90, source: 'timeline' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: designPostId, duration: 60, source: 'recommendation' }
        }
      )

      // 9. Alice 编辑设计文章
      const editPostInteraction = interactions.find(i => i.name === 'EditPost')
      await controller.callInteraction(
        editPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            postId: designPostId,
            userId: alice.id,
            title: 'UI设计趋势 2024 - 更新版',
            content: '2024年的UI设计趋势包括... [已更新内容]',
            categoryId: designCategory.id,
            tags: [designTag.id, techTag.id] // 添加新标签
          }
        }
      )

      // 10. Alice 发布草稿文章
      const publishPostInteraction = interactions.find(i => i.name === 'PublishPost')
      await controller.callInteraction(
        publishPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            postId: draftPostResult.data.id,
            userId: alice.id
          }
        }
      )

      // === 验证最终状态 ===

      // 验证 Alice 的个人数据
      const aliceData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', alice.id] }),
        undefined,
        ['*']
      )

      expect(aliceData.displayName).toBe('Alice the Developer')
      expect(aliceData.bio).toBe('Full-stack developer passionate about JavaScript and React')
      expect(aliceData.friendCount).toBe(1)      // 只有 Bob
      expect(aliceData.followerCount).toBe(1)    // 只有 David
      expect(aliceData.followingCount).toBe(2)   // Carol 和 David
      expect(aliceData.postCount).toBe(3)        // 3篇已发布的帖子
      expect(aliceData.activityScore).toBeGreaterThan(30) // 活跃度应该很高

      // 验证技术帖子的数据
      const techPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', techPostId] }),
        undefined,
        ['*']
      )

      expect(techPostData.likeCount).toBe(2)          // Bob 和 Carol
      expect(techPostData.viewCount).toBe(2)          // Carol 和 David
      expect(techPostData.engagementScore).toBe(3.5)  // love(2) + wow(1.5) = 3.5
      expect(techPostData.isPopular).toBe(false)      // 未达到热门阈值

      // 验证设计帖子的数据（已编辑）
      const designPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', designPostId] }),
        undefined,
        ['*']
      )

      expect(designPostData.title).toBe('UI设计趋势 2024 - 更新版')
      expect(designPostData.content).toContain('[已更新内容]')
      expect(designPostData.likeCount).toBe(1)         // 只有 Bob
      expect(designPostData.viewCount).toBe(1)         // 只有 David
      expect(designPostData.updatedAt).toBeDefined()

      // 验证已发布的草稿
      const publishedDraftData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', draftPostResult.data.id] }),
        undefined,
        ['*']
      )

      expect(publishedDraftData.status).toBe('published')
      expect(publishedDraftData.publishedAt).toBeDefined()

      // 验证标签数据
      const jsTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', jsTag.id] }),
        undefined,
        ['*']
      )

      expect(jsTagData.postCount).toBe(1) // 只有技术帖子使用

      const designTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', designTag.id] }),
        undefined,
        ['*']
      )

      expect(designTagData.postCount).toBe(1) // 设计帖子使用

      // 验证分类数据
      const techCategoryData = await system.storage.findOne(
        'Category',
        BoolExp.atom({ key: 'id', value: ['=', techCategory.id] }),
        undefined,
        ['*']
      )

      expect(techCategoryData.postCount).toBe(1)        // 技术帖子
      expect(techCategoryData.activePostCount).toBe(1)  // 已发布

      const designCategoryData = await system.storage.findOne(
        'Category',
        BoolExp.atom({ key: 'id', value: ['=', designCategory.id] }),
        undefined,
        ['*']
      )

      expect(designCategoryData.postCount).toBe(1)        // 设计帖子
      expect(designCategoryData.activePostCount).toBe(1)  // 已发布

      // 验证关系数据
      const acceptedFriendships = await system.storage.findRelationByName(
        'User_friends_friends_User',
        BoolExp.atom({ key: 'relationData.status', value: ['=', 'accepted'] }),
        undefined,
        ['*']
      )
      expect(acceptedFriendships.length).toBe(1) // Alice-Bob

      const follows = await system.storage.findRelationByName(
        'User_following_followers_User',
        undefined,
        undefined,
        ['*']
      )
      expect(follows.length).toBe(3) // Alice->Carol, Alice->David, David->Alice

      const totalLikes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        undefined,
        undefined,
        ['*']
      )
      expect(totalLikes.length).toBe(3) // Bob喜欢2个, Carol喜欢1个

      const totalViews = await system.storage.findRelationByName(
        'User_viewedPosts_viewers_Post',
        undefined,
        undefined,
        ['*']
      )
      expect(totalViews.length).toBe(3) // Carol看1个, David看2个
    })
  })

  describe('内容发现和推荐场景', () => {
    test('基于标签和互动的内容推荐逻辑', async () => {
      // 场景：系统根据用户的互动行为推荐相关内容

      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const categories = await createTestCategories(system)
      const [alice, bob, carol, david] = users
      const [jsTag, reactTag, designTag, techTag] = tags
      const [techCategory, designCategory] = categories

      // 1. 创建不同主题的帖子
      const createPostInteraction = interactions.find(i => i.name === 'CreatePost')

      // Alice 创建前端开发相关帖子
      const frontendPost1 = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'React性能优化技巧',
            content: 'React应用性能优化的几个重要技巧...',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id, reactTag.id]
          }
        }
      )

      const frontendPost2 = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'JavaScript ES2024 新特性',
            content: 'ES2024带来的新特性详解...',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id, techTag.id]
          }
        }
      )

      // Bob 创建设计相关帖子
      const designPost1 = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            title: '用户体验设计原则',
            content: 'UX设计的核心原则和实践...',
            authorId: bob.id,
            status: 'published',
            categoryId: designCategory.id,
            tags: [designTag.id]
          }
        }
      )

      // Carol 创建技术+设计交叉帖子
      const crossPost = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: {
            title: '前端开发与设计师的协作',
            content: '如何更好地进行前端开发与设计师的协作...',
            authorId: carol.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id, designTag.id, techTag.id]
          }
        }
      )

      // 2. David 表现出对前端开发的兴趣
      const likePostInteraction = interactions.find(i => i.name === 'LikePost')
      const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')

      // David 深度浏览和点赞前端相关帖子
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: frontendPost1.data.id, duration: 180, source: 'search' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: frontendPost1.data.id, type: 'love' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: frontendPost2.data.id, duration: 150, source: 'recommendation' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: frontendPost2.data.id, type: 'like' }
        }
      )

      // David 对交叉主题帖子也有兴趣
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: crossPost.data.id, duration: 120, source: 'timeline' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: crossPost.data.id, type: 'wow' }
        }
      )

      // 但对纯设计帖子兴趣较低
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: designPost1.data.id, duration: 30, source: 'timeline' }
        }
      )

      // 3. 验证基于David的行为，相关标签的受欢迎程度
      
      // JavaScript 标签应该有最高的受欢迎程度
      const jsTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', jsTag.id] }),
        undefined,
        ['*']
      )

      // jsTag被3个帖子使用，获得3个点赞(love=2, like=1, wow=1.5)，4个浏览
      // popularityScore = 每个帖子的 (likeCount * 2 + viewCount * 0.1)
      expect(jsTagData.postCount).toBe(3)
      expect(jsTagData.popularityScore).toBeGreaterThan(0)

      // React 标签的受欢迎程度
      const reactTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', reactTag.id] }),
        undefined,
        ['*']
      )

      expect(reactTagData.postCount).toBe(1) // 只有frontendPost1使用
      expect(reactTagData.popularityScore).toBeGreaterThan(0)

      // 设计标签相对较低的受欢迎程度
      const designTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', designTag.id] }),
        undefined,
        ['*']
      )

      expect(designTagData.postCount).toBe(2) // designPost1 和 crossPost
      expect(designTagData.popularityScore).toBeGreaterThan(0)

      // 4. 验证帖子的互动质量排名
      
      const frontendPost1Data = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', frontendPost1.data.id] }),
        undefined,
        ['*']
      )

      const frontendPost2Data = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', frontendPost2.data.id] }),
        undefined,
        ['*']
      )

      const crossPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', crossPost.data.id] }),
        undefined,
        ['*']
      )

      const designPost1Data = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', designPost1.data.id] }),
        undefined,
        ['*']
      )

      // 前端帖子应该有更高的互动分数
      expect(frontendPost1Data.engagementScore).toBe(2)     // love = 2分
      expect(frontendPost2Data.engagementScore).toBe(1)     // like = 1分  
      expect(crossPostData.engagementScore).toBe(1.5)       // wow = 1.5分
      expect(designPost1Data.engagementScore).toBe(0)       // 没有点赞

      // 验证浏览时长反映用户兴趣
      expect(frontendPost1Data.viewCount).toBe(1)
      expect(frontendPost2Data.viewCount).toBe(1)
      expect(crossPostData.viewCount).toBe(1)
      expect(designPost1Data.viewCount).toBe(1)

      // 5. 模拟推荐算法：基于标签受欢迎程度和用户兴趣
      // （这里我们通过查询验证推荐逻辑的数据基础）

      // 查找David感兴趣的标签（基于他的点赞和浏览行为）
      const davidLikes = await system.storage.findRelationByName(
        'User_likedPosts_likers_Post',
        BoolExp.atom({ key: 'source.id', value: ['=', david.id] }),
        undefined,
        ['*', ['target', { attributeQuery: ['*'] }]]
      )

      expect(davidLikes.length).toBe(3) // David点赞了3个帖子

      // 查找David浏览的帖子对应的标签
      const davidViews = await system.storage.findRelationByName(
        'User_viewedPosts_viewers_Post',
        BoolExp.atom({ key: 'source.id', value: ['=', david.id] }),
        undefined,
        ['*', ['target', { attributeQuery: ['*'] }]]
      )

      expect(davidViews.length).toBe(4) // David浏览了4个帖子

      // 基于这些数据，推荐系统应该：
      // 1. 向David推荐更多JavaScript相关内容
      // 2. 向David推荐React相关内容  
      // 3. 降低纯设计内容的推荐权重
      // 4. 提高交叉领域内容的推荐权重
    })
  })

  describe('社区管理场景', () => {
    test('内容质量管理和用户行为分析', async () => {
      // 场景：分析用户行为模式，识别高质量内容和活跃用户

      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const categories = await createTestCategories(system)
      const [alice, bob, carol, david] = users
      const [jsTag, reactTag, designTag, techTag] = tags
      const [techCategory, designCategory] = categories

      // 1. 创建不同质量的内容
      const createPostInteraction = interactions.find(i => i.name === 'CreatePost')

      // Alice - 高质量技术内容创作者
      const alicePost1 = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'TypeScript高级类型实战',
            content: '本文深入讲解TypeScript的高级类型系统，包括条件类型、映射类型等...(详细内容3000字)',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id, techTag.id]
          }
        }
      )

      const alicePost2 = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: 'React 18并发特性详解',
            content: 'React 18引入的并发特性让我们能够构建更流畅的用户界面...(详细内容2500字)',
            authorId: alice.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [reactTag.id, jsTag.id]
          }
        }
      )

      // Bob - 中等质量内容
      const bobPost = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: {
            title: '我的编程学习心得',
            content: '分享一下我学习编程的经验...(中等长度内容)',
            authorId: bob.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [techTag.id]
          }
        }
      )

      // Carol - 设计相关内容
      const carolPost = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: {
            title: 'Figma设计技巧分享',
            content: 'Figma的一些实用设计技巧...',
            authorId: carol.id,
            status: 'published',
            categoryId: designCategory.id,
            tags: [designTag.id]
          }
        }
      )

      // David - 低质量内容
      const davidPost = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: {
            title: '今天学了点JS',
            content: '今天学了JavaScript，感觉还不错。',
            authorId: david.id,
            status: 'published',
            categoryId: techCategory.id,
            tags: [jsTag.id]
          }
        }
      )

      // 2. 模拟真实的用户互动模式
      const likePostInteraction = interactions.find(i => i.name === 'LikePost')
      const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')

      // Alice的高质量内容获得更多深度互动
      // Post 1: TypeScript文章
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: alicePost1.data.id, duration: 300, source: 'search' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: alicePost1.data.id, type: 'love' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId: alicePost1.data.id, duration: 250, source: 'recommendation' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId: alicePost1.data.id, type: 'wow' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: alicePost1.data.id, duration: 180, source: 'timeline' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: alicePost1.data.id, type: 'like' }
        }
      )

      // Post 2: React文章
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: alicePost2.data.id, duration: 280, source: 'direct' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: alicePost2.data.id, type: 'love' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId: alicePost2.data.id, duration: 200, source: 'timeline' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { userId: carol.id, postId: alicePost2.data.id, type: 'like' }
        }
      )

      // Bob的中等质量内容获得中等互动
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { userId: alice.id, postId: bobPost.data.id, duration: 120, source: 'timeline' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { userId: alice.id, postId: bobPost.data.id, type: 'like' }
        }
      )

      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { userId: david.id, postId: bobPost.data.id, duration: 90, source: 'search' }
        }
      )

      // Carol的设计内容获得特定用户群的互动
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { userId: alice.id, postId: carolPost.data.id, duration: 100, source: 'recommendation' }
        }
      )

      await controller.callInteraction(
        likePostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { userId: alice.id, postId: carolPost.data.id, type: 'like' }
        }
      )

      // David的低质量内容获得很少互动
      await controller.callInteraction(
        viewPostInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { userId: bob.id, postId: davidPost.data.id, duration: 15, source: 'timeline' }
        }
      )

      // 3. 建立用户之间的关注关系以分析网络效应
      const followUserInteraction = interactions.find(i => i.name === 'FollowUser')

      // Bob和Carol关注Alice（高质量内容创作者）
      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...bob, roles: ['user'] },
          payload: { followerId: bob.id, followeeId: alice.id }
        }
      )

      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...carol, roles: ['user'] },
          payload: { followerId: carol.id, followeeId: alice.id }
        }
      )

      // Alice互相关注Bob和Carol
      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { followerId: alice.id, followeeId: bob.id }
        }
      )

      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: { followerId: alice.id, followeeId: carol.id }
        }
      )

      // David只关注Alice
      await controller.callInteraction(
        followUserInteraction!.uuid,
        {
          user: { ...david, roles: ['user'] },
          payload: { followerId: david.id, followeeId: alice.id }
        }
      )

      // === 分析验证 ===

      // 4. 验证内容质量指标
      const alicePost1Data = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', alicePost1.data.id] }),
        undefined,
        ['*']
      )

      const alicePost2Data = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', alicePost2.data.id] }),
        undefined,
        ['*']
      )

      const bobPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', bobPost.data.id] }),
        undefined,
        ['*']
      )

      const carolPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', carolPost.data.id] }),
        undefined,
        ['*']
      )

      const davidPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', davidPost.data.id] }),
        undefined,
        ['*']
      )

      // Alice的内容应该有最高的互动质量
      expect(alicePost1Data.likeCount).toBe(3)        // 3个点赞
      expect(alicePost1Data.viewCount).toBe(3)        // 3个浏览
      expect(alicePost1Data.engagementScore).toBe(4.5) // love(2) + wow(1.5) + like(1) = 4.5

      expect(alicePost2Data.likeCount).toBe(2)        // 2个点赞
      expect(alicePost2Data.viewCount).toBe(2)        // 2个浏览
      expect(alicePost2Data.engagementScore).toBe(3)  // love(2) + like(1) = 3

      // Bob的内容中等互动
      expect(bobPostData.likeCount).toBe(1)           // 1个点赞
      expect(bobPostData.viewCount).toBe(2)           // 2个浏览
      expect(bobPostData.engagementScore).toBe(1)     // like(1) = 1

      // Carol的内容特定领域互动
      expect(carolPostData.likeCount).toBe(1)         // 1个点赞
      expect(carolPostData.viewCount).toBe(1)         // 1个浏览
      expect(carolPostData.engagementScore).toBe(1)   // like(1) = 1

      // David的内容最低互动
      expect(davidPostData.likeCount).toBe(0)         // 0个点赞
      expect(davidPostData.viewCount).toBe(1)         // 1个浏览
      expect(davidPostData.engagementScore).toBe(0)   // 0分

      // 5. 验证用户活跃度和影响力
      const aliceData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', alice.id] }),
        undefined,
        ['*']
      )

      const bobData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', bob.id] }),
        undefined,
        ['*']
      )

      const carolData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', carol.id] }),
        undefined,
        ['*']
      )

      const davidData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', david.id] }),
        undefined,
        ['*']
      )

      // Alice应该有最高的活跃度分数（高质量内容+多粉丝）
      expect(aliceData.postCount).toBe(2)             // 2篇帖子
      expect(aliceData.followerCount).toBe(3)         // 3个粉丝
      expect(aliceData.followingCount).toBe(2)        // 关注2人
      expect(aliceData.activityScore).toBeGreaterThan(35) // 高活跃度

      // Bob和Carol有中等活跃度
      expect(bobData.postCount).toBe(1)               // 1篇帖子
      expect(bobData.followerCount).toBe(1)           // 1个粉丝(Alice)
      expect(bobData.followingCount).toBe(1)          // 关注1人(Alice)

      expect(carolData.postCount).toBe(1)             // 1篇帖子
      expect(carolData.followerCount).toBe(1)         // 1个粉丝(Alice)
      expect(carolData.followingCount).toBe(1)        // 关注1人(Alice)

      // David活跃度最低
      expect(davidData.postCount).toBe(1)             // 1篇帖子
      expect(davidData.followerCount).toBe(0)         // 0个粉丝
      expect(davidData.followingCount).toBe(1)        // 关注1人(Alice)
      expect(davidData.activityScore).toBeLessThan(aliceData.activityScore)

      // 6. 验证标签质量分析
      const jsTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', jsTag.id] }),
        undefined,
        ['*']
      )

      const reactTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', reactTag.id] }),
        undefined,
        ['*']
      )

      const designTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', designTag.id] }),
        undefined,
        ['*']
      )

      // JavaScript标签应该有最高的受欢迎程度（被高质量内容使用）
      expect(jsTagData.postCount).toBe(3)             // 3篇帖子使用
      expect(jsTagData.popularityScore).toBeGreaterThan(reactTagData.popularityScore)

      // React标签有高质量的互动
      expect(reactTagData.postCount).toBe(1)          // 1篇高质量帖子
      expect(reactTagData.popularityScore).toBeGreaterThan(designTagData.popularityScore)

      // 7. 基于这些分析，系统可以：
      // - 识别Alice为高质量内容创作者
      // - 向新用户推荐Alice的内容
      // - 提高JavaScript和React相关内容的权重
      // - 建议David提高内容质量
      // - 为Bob和Carol提供内容创作指导
    })
  })

  describe('系统性能和扩展性', () => {
    test('大量数据下的响应式计算性能', async () => {
      // 场景：测试系统在大量数据下的性能表现

      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const [alice, bob, carol, david] = users
      const [jsTag, reactTag] = tags

      // 1. Alice创建一个帖子
      const createPostInteraction = interactions.find(i => i.name === 'CreatePost')
      const postResult = await controller.callInteraction(
        createPostInteraction!.uuid,
        {
          user: { ...alice, roles: ['user'] },
          payload: {
            title: '性能测试帖子',
            content: '这是一个用于性能测试的帖子',
            authorId: alice.id,
            status: 'published',
            tags: [jsTag.id, reactTag.id]
          }
        }
      )

      const postId = postResult.data.id

      // 2. 模拟大量用户互动
      const likePostInteraction = interactions.find(i => i.name === 'LikePost')
      const viewPostInteraction = interactions.find(i => i.name === 'ViewPost')

      const startTime = Date.now()

      // 批量创建点赞（模拟50个用户点赞）
      const likePromises = []
      for (let i = 0; i < 50; i++) {
        // 为了测试，我们重复使用现有用户
        const userId = users[i % users.length].id
        const likeType = ['like', 'love', 'laugh', 'wow'][i % 4]
        
        likePromises.push(
          controller.callInteraction(
            likePostInteraction!.uuid,
            {
              user: { ...users[i % users.length], roles: ['user'] },
              payload: { userId, postId, type: likeType }
            }
          )
        )
      }

      // 批量创建浏览记录（模拟100个浏览）
      const viewPromises = []
      for (let i = 0; i < 100; i++) {
        const userId = users[i % users.length].id
        const duration = Math.floor(Math.random() * 300) + 30 // 30-330秒
        const source = ['timeline', 'search', 'direct', 'recommendation'][i % 4]
        
        viewPromises.push(
          controller.callInteraction(
            viewPostInteraction!.uuid,
            {
              user: { ...users[i % users.length], roles: ['user'] },
              payload: { userId, postId, duration, source }
            }
          )
        )
      }

      // 3. 并发执行所有互动
      await Promise.all([...likePromises, ...viewPromises])

      const endTime = Date.now()
      const executionTime = endTime - startTime

      console.log(`大量互动执行时间: ${executionTime}ms`)

      // 4. 验证数据一致性
      const finalPostData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', postId] }),
        undefined,
        ['*']
      )

      // 验证计数的准确性
      expect(finalPostData.likeCount).toBe(50)   // 50个点赞
      expect(finalPostData.viewCount).toBe(100)  // 100个浏览
      expect(finalPostData.engagementScore).toBeGreaterThan(0)

      // 5. 验证标签的受欢迎程度更新
      const jsTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', jsTag.id] }),
        undefined,
        ['*']
      )

      const reactTagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', reactTag.id] }),
        undefined,
        ['*']
      )

      expect(jsTagData.popularityScore).toBeGreaterThan(100)   // 高受欢迎程度
      expect(reactTagData.popularityScore).toBeGreaterThan(100)

      // 6. 验证用户活跃度更新
      const aliceData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', alice.id] }),
        undefined,
        ['*']
      )

      expect(aliceData.postCount).toBe(1)
      expect(aliceData.activityScore).toBeGreaterThan(10)

      // 7. 性能断言
      expect(executionTime).toBeLessThan(10000) // 应该在10秒内完成

      console.log('性能测试完成:', {
        总互动数: 150,
        执行时间: `${executionTime}ms`,
        平均每个操作: `${(executionTime / 150).toFixed(2)}ms`,
        最终点赞数: finalPostData.likeCount,
        最终浏览数: finalPostData.viewCount,
        互动分数: finalPostData.engagementScore
      })
    })
  })
})