// Test that matches our debug test to confirm the issue
import { describe, test, expect, beforeEach } from 'vitest'
import { createDormitoryManagementSystem } from './backend/index.ts'
import { MatchExp } from 'interaqt'

describe('Simple Test', () => {
  test('should create user successfully', async () => {
    const { system, controller } = await createDormitoryManagementSystem()
    
    const userData = {
      name: '张三',
      email: 'zhangsan@example.com',
      phone: '13800138000',
      role: 'student'
    }
    
    // Call interaction
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'system' },
      payload: userData
    })
    
    expect(result.error).toBeUndefined()
    
    // Query users
    const users = await system.storage.find('User',
      MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
      undefined,
      ['id', 'name', 'email', 'phone', 'role', 'status', 'createdAt']
    )
    
    console.log('users.length:', users.length)
    console.log('users:', users)
    
    expect(users.length).toBe(1)
    
    const user = users[0]
    expect(user.name).toBe(userData.name)
    expect(user.email).toBe(userData.email)
    expect(user.phone).toBe(userData.phone)
    expect(user.role).toBe(userData.role)
    expect(user.status).toBe('active')
    expect(user.createdAt).toBeGreaterThan(0)
  })
})