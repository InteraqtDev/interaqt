import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { MonoSystem, Controller, removeAllInstance } from '@/index.js'
import { createSocialNetworkSystem } from '../src/index.js'

// 测试基础设置
export async function setupTest() {
  // 清理所有单例实例
  removeAllInstance()
  
  // 获取系统配置
  const { entities, relations, interactions, dicts, activities } = createSocialNetworkSystem()
  
  // 创建系统
  const system = new MonoSystem()
  
  // 创建控制器
  const controller = new Controller(
    system,
    entities,
    relations, 
    activities,
    interactions,
    dicts,
    []  // 外部同步器
  )
  
  // 设置数据库（重建表结构）
  await controller.setup(true)
  
  return { system, controller }
}

// 测试清理
export async function teardownTest(system: MonoSystem) {
  await system.destroy()
}

// 创建测试用户
export async function createTestUsers(system: MonoSystem) {
  const users = []
  
  // 创建用户 Alice
  const alice = await system.storage.create('User', {
    username: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice Cooper',
    bio: 'I love sharing interesting content!',
    avatar: 'https://example.com/avatar/alice.jpg'
  })
  users.push(alice)
  
  // 创建用户 Bob
  const bob = await system.storage.create('User', {
    username: 'bob',
    email: 'bob@example.com', 
    displayName: 'Bob Smith',
    bio: 'Tech enthusiast and blogger',
    avatar: 'https://example.com/avatar/bob.jpg'
  })
  users.push(bob)
  
  // 创建用户 Carol
  const carol = await system.storage.create('User', {
    username: 'carol',
    email: 'carol@example.com',
    displayName: 'Carol Johnson', 
    bio: 'Designer and photographer',
    avatar: 'https://example.com/avatar/carol.jpg'
  })
  users.push(carol)
  
  // 创建用户 David
  const david = await system.storage.create('User', {
    username: 'david',
    email: 'david@example.com',
    displayName: 'David Lee',
    bio: 'Software developer',
    avatar: 'https://example.com/avatar/david.jpg'
  })
  users.push(david)
  
  return users
}

// 创建测试标签
export async function createTestTags(system: MonoSystem) {
  const tags = []
  
  const jsTag = await system.storage.create('Tag', {
    name: 'javascript',
    description: 'JavaScript programming language',
    color: '#f7df1e'
  })
  tags.push(jsTag)
  
  const reactTag = await system.storage.create('Tag', {
    name: 'react',
    description: 'React library for building UIs',
    color: '#61dafb'
  })
  tags.push(reactTag)
  
  const designTag = await system.storage.create('Tag', {
    name: 'design',
    description: 'UI/UX Design',
    color: '#ff6b6b'
  })
  tags.push(designTag)
  
  const techTag = await system.storage.create('Tag', {
    name: 'technology',
    description: 'Technology and innovation',
    color: '#4ecdc4'
  })
  tags.push(techTag)
  
  return tags
}

// 创建测试分类
export async function createTestCategories(system: MonoSystem) {
  const categories = []
  
  const techCategory = await system.storage.create('Category', {
    name: 'Technology',
    description: 'Technology related posts',
    order: 1
  })
  categories.push(techCategory)
  
  const designCategory = await system.storage.create('Category', {
    name: 'Design',
    description: 'Design and creative posts',
    order: 2
  })
  categories.push(designCategory)
  
  const lifestyleCategory = await system.storage.create('Category', {
    name: 'Lifestyle',
    description: 'Lifestyle and personal posts',
    order: 3
  })
  categories.push(lifestyleCategory)
  
  return categories
}

// 辅助函数：查找用户
export async function findUserByUsername(system: MonoSystem, username: string) {
  const users = await system.storage.find('User', {
    username: { $eq: username }
  })
  return users.length > 0 ? users[0] : null
}

// 辅助函数：查找标签
export async function findTagByName(system: MonoSystem, name: string) {
  const tags = await system.storage.find('Tag', {
    name: { $eq: name }
  })
  return tags.length > 0 ? tags[0] : null
}

// 辅助函数：查找分类
export async function findCategoryByName(system: MonoSystem, name: string) {
  const categories = await system.storage.find('Category', {
    name: { $eq: name }
  })
  return categories.length > 0 ? categories[0] : null
}