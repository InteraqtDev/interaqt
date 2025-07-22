import { beforeAll, afterAll, beforeEach, describe, test, expect } from 'vitest'
import { Controller } from 'interaqt'
import { MonoSystem } from '../../../src/runtime/MonoSystem.js'
import { entities, relations, interactions, activities, dicts } from '../backend/index.js'
import { MatchExp } from 'interaqt'

let controller: Controller
let system: MonoSystem

beforeAll(async () => {
  system = new MonoSystem()
  
  controller = new Controller({
    system,
    entities,
    relations, 
    activities,
    interactions,
    dict: dicts,
    recordMutationSideEffects: []
  })

  await controller.setup(true)
})

afterAll(async () => {
  // MonoSystem doesn't have terminate method
  // Cleanup is handled automatically
})

beforeEach(async () => {
  // Clean up data before each test - delete all records
  await system.storage.delete('User', MatchExp.atom({ key: 'id', value: ['!=', null] }))
  await system.storage.delete('Dormitory', MatchExp.atom({ key: 'id', value: ['!=', null] }))
  await system.storage.delete('DormitoryAssignment', MatchExp.atom({ key: 'id', value: ['!=', null] }))
  await system.storage.delete('ViolationRecord', MatchExp.atom({ key: 'id', value: ['!=', null] }))
  await system.storage.delete('KickoutRequest', MatchExp.atom({ key: 'id', value: ['!=', null] }))
})

describe('Stage 2: Permission and Business Rule Tests', () => {
  
  describe('Permission Tests', () => {
    
    describe('TC101: 非管理员创建宿舍权限测试', () => {
      test('should deny non-admin user from creating dormitory', async () => {
        // Create non-admin user
        const student = await system.storage.create('User', {
          name: 'Student',
          email: 'student@example.com',
          role: 'student'
        })

        // Attempt to create dormitory as student
        const result = await controller.callInteraction('CreateDormitory', {
          user: student,
          payload: { name: '宿舍B', capacity: 4 }
        })

        // Should return permission error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify no dormitory was created
        const dormitories = await system.storage.find('Dormitory', 
          undefined, 
          undefined, 
          ['id', 'name']
        )
        
        expect(dormitories).toHaveLength(0)
      })
    })

    describe('TC102: 非宿舍长记录违规权限测试', () => {
      test('should deny non-dormHead user from recording violations', async () => {
        // Create student user (not dormHead or admin)
        const student = await system.storage.create('User', {
          name: 'Student',
          email: 'student@example.com',
          role: 'student'
        })

        const anotherStudent = await system.storage.create('User', {
          name: 'AnotherStudent',
          email: 'another@example.com',
          role: 'student'
        })

        // Create dormitory first (by admin)
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        const dormitoryResult = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '宿舍A', capacity: 4 }
        })
        const dormitoryId = dormitoryResult.effects?.[0]?.record?.id

        // Attempt to record violation as student
        const result = await controller.callInteraction('RecordViolation', {
          user: student,
          payload: {
            targetUserId: anotherStudent.id,
            dormitoryId: dormitoryId,
            violationType: '晚归',
            scoreDeduction: 5
          }
        })

        // Should return permission error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify no violation record was created
        const violations = await system.storage.find('ViolationRecord',
          undefined,
          undefined,
          ['id']
        )
        
        expect(violations).toHaveLength(0)
      })
    })

    describe('TC103: 非管理员处理踢出申请权限测试', () => {
      test('should deny non-admin user from processing kickout requests', async () => {
        // Setup: Create admin, dormHead, and student
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        const dormHead = await system.storage.create('User', {
          name: 'DormHead',
          email: 'dormhead@example.com',
          role: 'dormHead'
        })

        const student = await system.storage.create('User', {
          name: 'Student',
          email: 'student@example.com',
          role: 'student'
        })

        // Create dormitory and kickout request
        const dormitoryResult = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '宿舍A', capacity: 4 }
        })
        const dormitoryId = dormitoryResult.effects?.[0]?.record?.id

        const requestResult = await controller.callInteraction('RequestKickout', {
          user: dormHead,
          payload: {
            targetUserId: student.id,
            dormitoryId: dormitoryId,
            reason: '多次违规'
          }
        })
        const requestId = requestResult.effects?.[0]?.record?.id

        // Attempt to process request as dormHead (not admin)
        const result = await controller.callInteraction('ProcessKickoutRequest', {
          user: dormHead,
          payload: {
            requestId: requestId,
            decision: 'approved'
          }
        })

        // Should return permission error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify request status remains pending
        const kickoutRequest = await system.storage.findOne('KickoutRequest',
          MatchExp.atom({ key: 'id', value: ['=', requestId] }),
          undefined,
          ['status']
        )
        
        expect(kickoutRequest).toBeDefined()
        expect(kickoutRequest.status).toBe('pending')
      })
    })
  })

  describe('Business Rule Tests', () => {
    
    describe('TC201: 宿舍容量限制测试', () => {
      test('should deny creating dormitory with invalid capacity', async () => {
        // Create admin user
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        // Attempt to create dormitory with capacity > 6
        const result = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '无效宿舍', capacity: 8 }
        })

        // Should return business rule violation error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify no dormitory with this name was created
        const invalidDormitories = await system.storage.find('Dormitory',
          MatchExp.atom({ key: 'name', value: ['=', '无效宿舍'] }),
          undefined,
          ['id', 'capacity']
        )
        
        expect(invalidDormitories).toHaveLength(0)
      })

      test('should deny creating dormitory with capacity < 4', async () => {
        // Create admin user
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        // Attempt to create dormitory with capacity < 4
        const result = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '无效宿舍', capacity: 2 }
        })

        // Should return business rule violation error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify no dormitory with this name was created
        const invalidDormitories = await system.storage.find('Dormitory',
          MatchExp.atom({ key: 'name', value: ['=', '无效宿舍'] }),
          undefined,
          ['id', 'capacity']
        )
        
        expect(invalidDormitories).toHaveLength(0)
      })
    })

    describe('TC202: 重复床位分配测试', () => {
      test('should deny assigning user to occupied bed', async () => {
        // Setup: Create admin, dormitory, and students
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        const dormitoryResult = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '宿舍A', capacity: 4 }
        })
        const dormitoryId = dormitoryResult.effects?.[0]?.record?.id

        const student1 = await system.storage.create('User', {
          name: 'Student1',
          email: 'student1@example.com',
          role: 'student'
        })

        const student2 = await system.storage.create('User', {
          name: 'Student2',
          email: 'student2@example.com',
          role: 'student'
        })

        // Assign first student to bed 1
        const firstAssignResult = await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: student1.id,
            dormitoryId: dormitoryId,
            bedNumber: 1
          }
        })
        
        // Verify first assignment succeeded
        expect(firstAssignResult.error).toBeUndefined()

        // Attempt to assign second student to same bed 1
        const result = await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: student2.id,
            dormitoryId: dormitoryId,
            bedNumber: 1
          }
        })

        // Should return business rule violation error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify only one assignment exists
        const assignments = await system.storage.find('DormitoryAssignment',
          undefined,
          undefined,
          ['id', 'userId', 'bedNumber']
        )
        
        expect(assignments).toHaveLength(1)
        expect(Number(assignments[0].userId)).toBe(Number(student1.id))
        expect(assignments[0].bedNumber).toBe(1)
      })
    })

    describe('TC203: 超出宿舍容量分配测试', () => {
      test('should deny assignment when dormitory is full', async () => {
        // Setup: Create admin and dormitory with capacity 4
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        const dormitoryResult = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '宿舍A', capacity: 4 }
        })
        const dormitoryId = dormitoryResult.effects?.[0]?.record?.id

        // Create 5 students
        const students = []
        for (let i = 1; i <= 5; i++) {
          const student = await system.storage.create('User', {
            name: `Student${i}`,
            email: `student${i}@example.com`,
            role: 'student'
          })
          students.push(student)
        }

        // Assign first 4 students to fill dormitory
        for (let i = 0; i < 4; i++) {
          const assignResult = await controller.callInteraction('AssignUserToDormitory', {
            user: admin,
            payload: {
              userId: students[i].id,
              dormitoryId: dormitoryId,
              bedNumber: i + 1
            }
          })
          expect(assignResult.error).toBeUndefined()
        }

        // Attempt to assign 5th student (should fail - dormitory full)
        const result = await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: students[4].id,
            dormitoryId: dormitoryId,
            bedNumber: 5
          }
        })

        // Should return business rule violation error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify only 4 assignments exist
        const assignments = await system.storage.find('DormitoryAssignment',
          undefined,
          undefined,
          ['id']
        )
        
        expect(assignments).toHaveLength(4)
      })
    })

    describe('TC204: 用户重复分配测试', () => {
      test('should deny assigning user who is already assigned to another dormitory', async () => {
        // Setup: Create admin and two dormitories
        const admin = await system.storage.create('User', {
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin'
        })

        const dormitory1Result = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '宿舍A', capacity: 4 }
        })
        const dormitory1Id = dormitory1Result.effects?.[0]?.record?.id

        const dormitory2Result = await controller.callInteraction('CreateDormitory', {
          user: admin,
          payload: { name: '宿舍B', capacity: 4 }
        })
        const dormitory2Id = dormitory2Result.effects?.[0]?.record?.id

        const student = await system.storage.create('User', {
          name: 'Student',
          email: 'student@example.com',
          role: 'student'
        })

        // Assign student to first dormitory
        await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: student.id,
            dormitoryId: dormitory1Id,
            bedNumber: 1
          }
        })

        // Attempt to assign same student to second dormitory
        const result = await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: student.id,
            dormitoryId: dormitory2Id,
            bedNumber: 1
          }
        })

        // Should return business rule violation error
        expect(result.error).toBeDefined()
        expect(result.error.type).toBe('condition check failed')

        // Verify only one assignment exists
        const assignments = await system.storage.find('DormitoryAssignment',
          undefined,
          undefined,
          ['id', 'dormitoryId']
        )
        
        expect(assignments).toHaveLength(1)
        expect(Number(assignments[0].dormitoryId)).toBe(Number(dormitory1Id))
      })
    })
  })

  describe('Valid Operations Tests', () => {
    test('should allow admin to create dormitory with valid capacity', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '有效宿舍', capacity: 5 }
      })

      expect(result.error).toBeUndefined()
      
      // Find only dormitories with the specific name we just created
      const dormitories = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '有效宿舍'] }),
        undefined,
        ['name', 'capacity']
      )
      
      expect(dormitories).toHaveLength(1)
      expect(dormitories[0].name).toBe('有效宿舍')
      expect(dormitories[0].capacity).toBe(5)
    })

    test('should allow dormHead to record violations', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: 'DormHead',
        email: 'dormhead@example.com',
        role: 'dormHead'
      })

      const student = await system.storage.create('User', {
        name: 'Student',
        email: 'student@example.com',
        role: 'student'
      })

      const dormitoryResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '宿舍A', capacity: 4 }
      })
      const dormitoryId = dormitoryResult.effects?.[0]?.record?.id

      const result = await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          dormitoryId: dormitoryId,
          violationType: '晚归',
          scoreDeduction: 5
        }
      })

      expect(result.error).toBeUndefined()
      
      const violations = await system.storage.find('ViolationRecord',
        undefined,
        undefined,
        ['violationType', 'scoreDeduction']
      )
      
      expect(violations).toHaveLength(1)
      expect(violations[0].violationType).toBe('晚归')
      expect(violations[0].scoreDeduction).toBe(5)
    })
  })
})