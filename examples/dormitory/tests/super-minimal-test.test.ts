/**
 * 测试超级最小化后端
 */

import { describe, it, expect } from 'vitest'
import { Controller, MonoSystem, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, computations } from '../backend/super-minimal'

describe('Super Minimal Backend Test', () => {
  it('应该能成功setup', async () => {
    const db = new PGLiteDB()
    const system = new MonoSystem(db)
    
    const controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      computations
    })
    
    // Setup应该成功
    await controller.setup()
    console.log('Setup成功!')
    
    // 手动创建数据
    const user = await system.storage.create('User', {
      name: '管理员',
      email: 'admin@test.com',
      role: 'admin'
    })
    
    const dorm = await system.storage.create('Dormitory', {
      name: 'A栋301',
      capacity: 4
    })
    
    expect(user).toBeDefined()
    expect(user.role).toBe('admin')
    expect(dorm).toBeDefined()
    expect(dorm.capacity).toBe(4)
  })
})
