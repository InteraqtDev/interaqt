import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { MonoSystem, Controller, BoolExp } from '@/index.js'
import { setupTest, teardownTest, createTestUsers, createTestTags, createTestCategories } from './setup.js'

describe('Social Network - Entities', () => {
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

  describe('User Entity', () => {
    test('应该能创建用户', async () => {
      const user = await system.storage.create('User', {
        username: 'testuser',
        email: 'test@example.com',
        displayName: 'Test User',
        bio: 'This is a test user'
      })

      expect(user.id).toBeDefined()
      expect(user.username).toBe('testuser')
      expect(user.email).toBe('test@example.com')
      expect(user.displayName).toBe('Test User')
      expect(user.bio).toBe('This is a test user')
      expect(user.isActive).toBe(true)
      expect(user.createdAt).toBeDefined()
      expect(user.lastActiveAt).toBeDefined()
    })

    test('应该能查询用户', async () => {
      await createTestUsers(system)

      const alice = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'username', value: ['=', 'alice'] }),
        undefined,
        ['*']
      )

      expect(alice).toBeDefined()
      expect(alice.username).toBe('alice')
      expect(alice.email).toBe('alice@example.com')
      expect(alice.displayName).toBe('Alice Cooper')
    })

    test('用户名应该唯一', async () => {
      await system.storage.create('User', {
        username: 'uniqueuser',
        email: 'user1@example.com',
        displayName: 'User 1'
      })

      // 尝试创建相同用户名的用户应该失败
      await expect(async () => {
        await system.storage.create('User', {
          username: 'uniqueuser',
          email: 'user2@example.com',
          displayName: 'User 2'
        })
      }).rejects.toThrow()
    })

    test('邮箱应该唯一', async () => {
      await system.storage.create('User', {
        username: 'user1',
        email: 'unique@example.com',
        displayName: 'User 1'
      })

      // 尝试创建相同邮箱的用户应该失败
      await expect(async () => {
        await system.storage.create('User', {
          username: 'user2',
          email: 'unique@example.com',
          displayName: 'User 2'
        })
      }).rejects.toThrow()
    })

    test('用户初始计数应该为0', async () => {
      const user = await system.storage.create('User', {
        username: 'newuser',
        email: 'new@example.com',
        displayName: 'New User'
      })

      const userData = await system.storage.findOne(
        'User',
        BoolExp.atom({ key: 'id', value: ['=', user.id] }),
        undefined,
        ['*']
      )

      expect(userData.friendCount).toBe(0)
      expect(userData.followerCount).toBe(0)
      expect(userData.followingCount).toBe(0)
      expect(userData.postCount).toBe(0)
      expect(userData.activityScore).toBeDefined()
    })
  })

  describe('Post Entity', () => {
    test('应该能创建帖子', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      const post = await system.storage.create('Post', {
        title: 'My First Post',
        content: 'This is the content of my first post. It contains some interesting information.',
        status: 'draft',
        author: alice
      })

      expect(post.id).toBeDefined()
      expect(post.title).toBe('My First Post')
      expect(post.content).toBe('This is the content of my first post. It contains some interesting information.')
      expect(post.status).toBe('draft')
      expect(post.createdAt).toBeDefined()
      expect(post.updatedAt).toBeDefined()
      expect(post.summary).toBeDefined()
    })

    test('应该自动生成摘要', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      // 创建一个长内容的帖子
      const longContent = 'a'.repeat(300)
      const post = await system.storage.create('Post', {
        title: 'Long Post',
        content: longContent,
        author: alice
      })

      const postData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )

      expect(postData.summary).toBeDefined()
      expect(postData.summary.length).toBeLessThanOrEqual(203) // 200 + '...'
      expect(postData.summary.endsWith('...')).toBe(true)
    })

    test('短内容不应该截断摘要', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      const shortContent = 'This is a short post.'
      const post = await system.storage.create('Post', {
        title: 'Short Post',
        content: shortContent,
        author: alice
      })

      const postData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )

      expect(postData.summary).toBe(shortContent)
      expect(postData.summary.endsWith('...')).toBe(false)
    })

    test('初始计数应该为0', async () => {
      const users = await createTestUsers(system)
      const alice = users[0]

      const post = await system.storage.create('Post', {
        title: 'Test Post',
        content: 'Test content',
        author: alice
      })

      const postData = await system.storage.findOne(
        'Post',
        BoolExp.atom({ key: 'id', value: ['=', post.id] }),
        undefined,
        ['*']
      )

      expect(postData.likeCount).toBe(0)
      expect(postData.viewCount).toBe(0)
      expect(postData.engagementScore).toBe(0)
      expect(postData.isPopular).toBe(false)
    })
  })

  describe('Tag Entity', () => {
    test('应该能创建标签', async () => {
      const tag = await system.storage.create('Tag', {
        name: 'testtag',
        description: 'This is a test tag',
        color: '#ff0000'
      })

      expect(tag.id).toBeDefined()
      expect(tag.name).toBe('testtag')
      expect(tag.description).toBe('This is a test tag')
      expect(tag.color).toBe('#ff0000')
      expect(tag.createdAt).toBeDefined()
    })

    test('标签名应该唯一', async () => {
      await system.storage.create('Tag', {
        name: 'uniquetag',
        description: 'First tag'
      })

      await expect(async () => {
        await system.storage.create('Tag', {
          name: 'uniquetag',
          description: 'Second tag'
        })
      }).rejects.toThrow()
    })

    test('初始计数应该为0', async () => {
      const tag = await system.storage.create('Tag', {
        name: 'newtag',
        description: 'New tag'
      })

      const tagData = await system.storage.findOne(
        'Tag',
        BoolExp.atom({ key: 'id', value: ['=', tag.id] }),
        undefined,
        ['*']
      )

      expect(tagData.postCount).toBe(0)
      expect(tagData.popularityScore).toBe(0)
    })
  })

  describe('Category Entity', () => {
    test('应该能创建分类', async () => {
      const category = await system.storage.create('Category', {
        name: 'Test Category',
        description: 'This is a test category',
        order: 1
      })

      expect(category.id).toBeDefined()
      expect(category.name).toBe('Test Category')
      expect(category.description).toBe('This is a test category')
      expect(category.order).toBe(1)
      expect(category.isActive).toBe(true)
    })

    test('分类名应该唯一', async () => {
      await system.storage.create('Category', {
        name: 'Unique Category',
        description: 'First category'
      })

      await expect(async () => {
        await system.storage.create('Category', {
          name: 'Unique Category',
          description: 'Second category'
        })
      }).rejects.toThrow()
    })

    test('支持层级分类', async () => {
      const parentCategory = await system.storage.create('Category', {
        name: 'Parent Category',
        description: 'Parent category'
      })

      const childCategory = await system.storage.create('Category', {
        name: 'Child Category',
        description: 'Child category',
        parentId: parentCategory.id
      })

      expect(childCategory.parentId).toBe(parentCategory.id)
    })

    test('初始计数应该为0', async () => {
      const category = await system.storage.create('Category', {
        name: 'New Category',
        description: 'New category'
      })

      const categoryData = await system.storage.findOne(
        'Category',
        BoolExp.atom({ key: 'id', value: ['=', category.id] }),
        undefined,
        ['*']
      )

      expect(categoryData.postCount).toBe(0)
      expect(categoryData.activePostCount).toBe(0)
    })
  })

  describe('综合测试', () => {
    test('应该能创建完整的测试数据', async () => {
      const users = await createTestUsers(system)
      const tags = await createTestTags(system)
      const categories = await createTestCategories(system)

      expect(users.length).toBe(4)
      expect(tags.length).toBe(4)
      expect(categories.length).toBe(3)

      // 验证用户
      const usernames = users.map(u => u.username)
      expect(usernames).toContain('alice')
      expect(usernames).toContain('bob')
      expect(usernames).toContain('carol')
      expect(usernames).toContain('david')

      // 验证标签
      const tagNames = tags.map(t => t.name)
      expect(tagNames).toContain('javascript')
      expect(tagNames).toContain('react')
      expect(tagNames).toContain('design')
      expect(tagNames).toContain('technology')

      // 验证分类
      const categoryNames = categories.map(c => c.name)
      expect(categoryNames).toContain('Technology')
      expect(categoryNames).toContain('Design')
      expect(categoryNames).toContain('Lifestyle')
    })
  })
})