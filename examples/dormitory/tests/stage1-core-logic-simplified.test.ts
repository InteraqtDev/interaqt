import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend/minimal'

describe('Stage 1: Core Business Logic Tests (Simplified)', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    })

    await controller.setup(true)
  })

  // TC001 和 TC002 已经通过，直接复制
  test('TC001: Create Dormitory', async () => {
    // 首先创建管理员用户
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin'
      }
    })
    
    expect(adminResult.error).toBeUndefined()
    
    // 获取创建的管理员
    const admins = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = admins.find(u => u.email === 'admin@example.com')
    expect(admin).toBeDefined()
    
    // 创建宿舍
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    })
    
    expect(dormResult.error).toBeUndefined()
    
    // 获取创建的宿舍
    const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['*'])
    const dormitory = dormitories.find(d => d.name === '1号楼101')
    expect(dormitory).toBeDefined()
    expect(dormitory.name).toBe('1号楼101')
    expect(dormitory.capacity).toBe(4)
    
    // 验证床位自动创建
    const beds = await system.storage.find('Bed', undefined, undefined, ['*'])
    expect(beds.length).toBe(4)
    expect(beds[0].bedNumber).toBe('A1')
    expect(beds[1].bedNumber).toBe('A2')
    expect(beds[2].bedNumber).toBe('A3')
    expect(beds[3].bedNumber).toBe('A4')
    expect(beds.every(bed => bed.status === 'available')).toBe(true)
  })

  test('TC002: Create User', async () => {
    const result = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    })
    
    expect(result.error).toBeUndefined()
    
    // 从存储查询创建的用户
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const user = users.find(u => u.email === 'zhangsan@example.com')
    expect(user).toBeDefined()
    expect(user.name).toBe('张三')
    expect(user.email).toBe('zhangsan@example.com')
    expect(user.role).toBe('student')
  })

  test('TC003: Assign User to Dormitory', async () => {
    // 准备数据
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = users.find(u => u.email === 'admin@example.com')
    
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: '1号楼101', capacity: 4 }
    })
    
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: { name: '张三', email: 'zhangsan@example.com', role: 'student' }
    })
    
    const allUsers = await system.storage.find('User', undefined, undefined, ['*'])
    const student = allUsers.find(u => u.email === 'zhangsan@example.com')
    const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['*'])
    const dormitory = dormitories.find(d => d.name === '1号楼101')
    const beds = await system.storage.find('Bed', undefined, undefined, ['*'])
    const targetBed = beds[0]

    // 执行交互
    const result = await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        user: { id: student.id },
        dormitory: { id: dormitory.id },
        bed: { id: targetBed.id }
      }
    })
    
    expect(result.error).toBeUndefined()
    console.log('TC003: AssignUserToDormitory completed successfully')
  })

  test('TC004: Appoint Dorm Head', async () => {
    // 准备数据
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = users.find(u => u.email === 'admin@example.com')
    
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: '1号楼101', capacity: 4 }
    })
    
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: { name: '张三', email: 'zhangsan@example.com', role: 'student' }
    })
    
    const allUsers = await system.storage.find('User', undefined, undefined, ['*'])
    const student = allUsers.find(u => u.email === 'zhangsan@example.com')
    const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['*'])
    const dormitory = dormitories.find(d => d.name === '1号楼101')

    // 执行交互
    const result = await controller.callInteraction('AppointDormHead', {
      user: admin,
      payload: {
        user: { id: student.id },
        dormitory: { id: dormitory.id }
      }
    })
    
    expect(result.error).toBeUndefined()
    console.log('TC004: AppointDormHead completed successfully')
  })

  test('TC005: Record Violation', async () => {
    // 准备数据
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '张三', email: 'zhangsan@example.com', role: 'student' }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = users.find(u => u.email === 'admin@example.com')
    const student = users.find(u => u.email === 'zhangsan@example.com')

    // 执行交互
    const result = await controller.callInteraction('RecordViolation', {
      user: admin,
      payload: {
        violator: { id: student.id },
        violationType: '晚归',
        description: '23:30后归宿',
        scoreDeducted: 2
      }
    })
    
    expect(result.error).toBeUndefined()
    console.log('TC005: RecordViolation completed successfully')
  })

  test('TC006: Create Kickout Request', async () => {
    // 准备数据
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '张三', email: 'zhangsan@example.com', role: 'student' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '李四', email: 'lisi@example.com', role: 'student' }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = users.find(u => u.email === 'admin@example.com')
    const dormHead = users.find(u => u.email === 'zhangsan@example.com')
    const student = users.find(u => u.email === 'lisi@example.com')

    // 执行交互
    const result = await controller.callInteraction('CreateKickoutRequest', {
      user: dormHead,
      payload: {
        targetUser: { id: student.id },
        reason: '多次违规，累计扣分超标'
      }
    })
    
    expect(result.error).toBeUndefined()
    console.log('TC006: CreateKickoutRequest completed successfully')
  })

  test('TC007: Process Kickout Request - Approved', async () => {
    // 准备数据
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '张三', email: 'zhangsan@example.com', role: 'student' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '李四', email: 'lisi@example.com', role: 'student' }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = users.find(u => u.email === 'admin@example.com')
    const dormHead = users.find(u => u.email === 'zhangsan@example.com')
    const student = users.find(u => u.email === 'lisi@example.com')

    // 先创建踢出申请
    await controller.callInteraction('CreateKickoutRequest', {
      user: dormHead,
      payload: {
        targetUser: { id: student.id },
        reason: '多次违规，累计扣分超标'
      }
    })
    
    // 获取创建的申请
    const requests = await system.storage.find('KickoutRequest', undefined, undefined, ['*'])
    const request = requests[0]

    // 执行交互
    const result = await controller.callInteraction('ProcessKickoutRequest', {
      user: admin,
      payload: {
        request: { id: request.id },
        decision: 'approved'
      }
    })
    
    expect(result.error).toBeUndefined()
    console.log('TC007: ProcessKickoutRequest (approved) completed successfully')
  })

  test('TC008: Process Kickout Request - Rejected', async () => {
    // 准备数据
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: 'Admin', email: 'admin@example.com', role: 'admin' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '张三', email: 'zhangsan@example.com', role: 'student' }
    })
    
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: { name: '李四', email: 'lisi@example.com', role: 'student' }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const admin = users.find(u => u.email === 'admin@example.com')
    const dormHead = users.find(u => u.email === 'zhangsan@example.com')
    const student = users.find(u => u.email === 'lisi@example.com')

    // 先创建踢出申请
    await controller.callInteraction('CreateKickoutRequest', {
      user: dormHead,
      payload: {
        targetUser: { id: student.id },
        reason: '多次违规，累计扣分超标'
      }
    })
    
    // 获取创建的申请
    const requests = await system.storage.find('KickoutRequest', undefined, undefined, ['*'])
    const request = requests[0]

    // 执行交互
    const result = await controller.callInteraction('ProcessKickoutRequest', {
      user: admin,
      payload: {
        request: { id: request.id },
        decision: 'rejected'
      }
    })
    
    expect(result.error).toBeUndefined()
    console.log('TC008: ProcessKickoutRequest (rejected) completed successfully')
  })
})