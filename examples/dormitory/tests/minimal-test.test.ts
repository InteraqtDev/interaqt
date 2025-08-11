/**
 * 测试最小化后端
 */

import { describe, it, expect } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions, computations } from '../backend/minimal'

describe('Minimal Backend Test', () => {
  it('应该能成功setup和创建宿舍', async () => {
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
    
    // 创建用户
    const admin = await system.storage.create('User', {
      name: '管理员',
      email: 'admin@test.com',
      role: 'admin'
    })
    
    // 创建宿舍
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋301',
        capacity: 4
      }
    })
    
    expect(result.error).toBeUndefined()
    
    // 查询宿舍
    const dorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋301'] }),
      undefined,
      ['name', 'capacity', 'status']
    )
    
    expect(dorm).toBeDefined()
    expect(dorm.name).toBe('A栋301')
    expect(dorm.capacity).toBe(4)
    expect(dorm.status).toBe('active')
  })
})
