import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { MonoSystem, Controller, removeAllInstance, BoolExp } from '@/index.js'
import { entities } from '../src/entities.js'
import { relations } from '../src/relations.js'

describe('Minimal Test', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // 清理所有单例实例
    removeAllInstance()
    
    // 创建系统
    system = new MonoSystem()
    
    // 创建控制器 - 最小配置
    controller = new Controller(
      system,
      entities,
      relations, 
      [], // activities
      [], // interactions 
      [], // dicts
      []  // 外部同步器
    )
    
    // 设置数据库
    await controller.setup(true)
  })

  afterEach(async () => {
    await system.destroy()
  })

  test('应该能创建基本用户', async () => {
    const user = await system.storage.create('User', {
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User'
    })
    
    expect(user).toBeDefined()
    expect(user.username).toBe('testuser')
    expect(user.email).toBe('test@example.com')
    console.log('Created user (basic):', user)
    
    // Query the user with all attributes
    const fullUser = await system.storage.findOne(
      'User',
      BoolExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['*']
    )
    
    console.log('Full user with all attributes:', fullUser)
    expect(fullUser.isActive).toBeDefined()
    expect(fullUser.friendCount).toBeDefined()
    expect(fullUser.followerCount).toBeDefined()
  })
})