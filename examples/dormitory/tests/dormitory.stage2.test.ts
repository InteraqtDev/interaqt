import { describe, test, expect, beforeEach, beforeAll } from 'vitest'
import { MonoSystem, Controller, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend/index.js'

describe('Dormitory Management System - Stage 2: Permissions and Business Rules', () => {
  let system: MonoSystem
  let controller: Controller
  
  beforeEach(async () => {
    system = new MonoSystem()
    controller = new Controller({
      system,
      entities,
      relations,
      activities: [],
      interactions,
      dict: []
    })
    await controller.setup(true)
  })
  
  describe('Permission Tests', () => {
    test('TC011: Non-admin Create Dormitory Fails', async () => {
      // Create a student user
      const student = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@example.com',
        role: 'student'
      })
      
      // Try to create dormitory as student
      const result = await controller.callInteraction('CreateDormitory', {
        user: student, // Pass full user object instead of { id: student.id }
        payload: {
          name: '西区2栋101',
          capacity: 4
        }
      })
      
      expect(result.error).toBeDefined()
      // The framework returns errors as objects, check the type field
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      
      // Verify no dormitory was created
      const dormitories = await system.storage.find('Dormitory')
      expect(dormitories).toHaveLength(0)
    })
    
    test('TC014: Dorm Head Can Only Deduct Points from Same Dormitory', async () => {
      // Create two dormitories
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      const dorm1Result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '东区3栋201', capacity: 4 }
      })
      
      // Check if dormitory creation succeeded
      if (dorm1Result.error) {
        throw new Error(`Failed to create dorm1: ${JSON.stringify(dorm1Result.error)}`)
      }
      
      // Get the created dormitory from storage
      const dorm1 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '东区3栋201'] }),
        undefined,
        ['id']
      )
      
      const dorm2Result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '西区2栋101', capacity: 4 }
      })
      
      // Check if dormitory creation succeeded
      if (dorm2Result.error) {
        throw new Error(`Failed to create dorm2: ${JSON.stringify(dorm2Result.error)}`)
      }
      
      // Get the created dormitory from storage
      const dorm2 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '西区2栋101'] }),
        undefined,
        ['id']
      )
      
      // Create dorm head for dorm1
      const dormHead1 = await system.storage.create('User', {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'dormHead'
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: dormHead1.id,
          dormitoryId: dorm1.id
        }
      })
      
      // Create student in dorm2
      const student2 = await system.storage.create('User', {
        name: '赵六',
        email: 'zhaoliu@example.com',
        role: 'student'
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student2.id,
          dormitoryId: dorm2.id
        }
      })
      
      // Create deduction rule
      const ruleResult = await controller.callInteraction('CreateDeductionRule', {
        user: admin,
        payload: {
          name: '晚归',
          description: '晚上11点后回宿舍',
          points: 5
        }
      })
      
      // Get the created rule from storage
      const rule = await system.storage.findOne(
        'DeductionRule',
        MatchExp.atom({ key: 'name', value: ['=', '晚归'] }),
        undefined,
        ['id']
      )
      
      // Try to deduct points from student in different dormitory
      const result = await controller.callInteraction('DeductPoints', {
        user: dormHead1,
        payload: {
          userId: student2.id,
          ruleId: rule.id,
          reason: '晚归'
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })
  
  describe('Business Rule Tests', () => {
    test('TC012: Create Dormitory with Invalid Capacity Fails', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      // Try to create dormitory with capacity > 6
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: '北区1栋301',
          capacity: 8
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      
      // Verify no dormitory was created
      const dormitories = await system.storage.find('Dormitory')
      expect(dormitories).toHaveLength(0)
    })
    
    test('TC013: Duplicate User Assignment to Dormitory Fails', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      // Create two dormitories
      const dorm1Result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '东区3栋201', capacity: 4 }
      })
      
      const dorm1 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '东区3栋201'] }),
        undefined,
        ['id']
      )
      
      const dorm2Result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '西区2栋101', capacity: 4 }
      })
      
      const dorm2 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '西区2栋101'] }),
        undefined,
        ['id']
      )
      
      // Create and assign user to first dormitory
      const student = await system.storage.create('User', {
        name: '王五',
        email: 'wangwu@example.com',
        role: 'student'
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dorm1.id
        }
      })
      
      // Try to assign same user to second dormitory
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dorm2.id
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
    
    test('TC015: Deduct Points Cannot Result in Negative Score', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      const dormResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '东区3栋201', capacity: 4 }
      })
      
      const dorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '东区3栋201'] }),
        undefined,
        ['id']
      )
      
      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'dormHead'
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: dormHead.id,
          dormitoryId: dorm.id
        }
      })
      
      // Create student with low score
      const student = await system.storage.create('User', {
        name: '李四',
        email: 'lisi@example.com',
        role: 'student'
        // Score will be 100 by default
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dorm.id
        }
      })
      
      // First, create a rule for regular deductions to bring score down
      const regularRuleResult = await controller.callInteraction('CreateDeductionRule', {
        user: admin,
        payload: {
          name: '日常违规',
          description: '一般违规行为',
          points: 19
        }
      })
      
      const regularRule = await system.storage.findOne(
        'DeductionRule',
        MatchExp.atom({ key: 'name', value: ['=', '日常违规'] }),
        undefined,
        ['id']
      )
      
      // Deduct points 5 times (19 * 5 = 95) to bring score to 5
      for (let i = 0; i < 5; i++) {
        await controller.callInteraction('DeductPoints', {
          user: dormHead,
          payload: {
            userId: student.id,
            ruleId: regularRule.id,
            reason: `违规行为${i + 1}`
          }
        })
      }
      
      // Create high-point deduction rule
      const ruleResult = await controller.callInteraction('CreateDeductionRule', {
        user: admin,
        payload: {
          name: '严重违规',
          description: '严重违反宿舍规定',
          points: 10
        }
      })
      
      const rule = await system.storage.findOne(
        'DeductionRule',
        MatchExp.atom({ key: 'name', value: ['=', '严重违规'] }),
        undefined,
        ['id']
      )
      
      // Deduct points that would result in negative
      const result = await controller.callInteraction('DeductPoints', {
        user: dormHead,
        payload: {
          userId: student.id,
          ruleId: rule.id,
          reason: '严重违规行为'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Check that score is 0, not negative
      const updatedStudent = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['id', 'score', ['deductionRecords', { attributeQuery: ['points'] }]]
      )
      
      expect(updatedStudent.score).toBe(0)
    })
    
    test('TC016: Cannot Request Removal for User with High Score', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      const dormResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '东区3栋201', capacity: 4 }
      })
      
      const dorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '东区3栋201'] }),
        undefined,
        ['id']
      )
      
      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'dormHead'
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: dormHead.id,
          dormitoryId: dorm.id
        }
      })
      
      // Create student with high score
      const student = await system.storage.create('User', {
        name: '王五',
        email: 'wangwu@example.com',
        role: 'student',
        score: 75 // Above 60
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dorm.id
        }
      })
      
      // Try to request removal
      const result = await controller.callInteraction('RequestUserRemoval', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '想踢出'
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
    
    test('TC017: Cannot Assign User to Full Dormitory', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      // Create small dormitory
      const dormResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '东区3栋201', capacity: 4 }
      })
      
      const dorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '东区3栋201'] }),
        undefined,
        ['id']
      )
      
      // Fill the dormitory
      for (let i = 1; i <= 4; i++) {
        const student = await system.storage.create('User', {
          name: `学生${i}`,
          email: `student${i}@example.com`,
          role: 'student'
        })
        
        await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: student.id,
            dormitoryId: dorm.id
          }
        })
      }
      
      // Try to add one more student
      const extraStudent = await system.storage.create('User', {
        name: '钱七',
        email: 'qianqi@example.com',
        role: 'student'
      })
      
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: extraStudent.id,
          dormitoryId: dorm.id
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
    
    test('TC018: Cannot Process Already Processed Removal Request', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })
      
      const dormResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: '东区3栋201', capacity: 4 }
      })
      
      const dorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '东区3栋201'] }),
        undefined,
        ['id']
      )
      
      // Create dorm head and student
      const dormHead = await system.storage.create('User', {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'dormHead'
      })
      
      const student = await system.storage.create('User', {
        name: '李四',
        email: 'lisi@example.com',
        role: 'student'
        // Score will be 100 by default
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: dormHead.id,
          dormitoryId: dorm.id
        }
      })
      
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dorm.id
        }
      })
      
      // Create a deduction rule and deduct 50 points to bring score to 50
      const ruleResult = await controller.callInteraction('CreateDeductionRule', {
        user: admin,
        payload: {
          name: '违规',
          description: '违反宿舍规定',
          points: 50
        }
      })
      
      const rule = await system.storage.findOne(
        'DeductionRule',
        MatchExp.atom({ key: 'name', value: ['=', '违规'] }),
        undefined,
        ['id']
      )
      
      await controller.callInteraction('DeductPoints', {
        user: dormHead,
        payload: {
          userId: student.id,
          ruleId: rule.id,
          reason: '违规扣分'
        }
      })
      
      // Create removal request
      const requestResult = await controller.callInteraction('RequestUserRemoval', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '积分过低'
        }
      })
      
      // Get the created request from storage
      const request = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', '积分过低'] }),
        undefined,
        ['id']
      )
      
      // First approval should succeed
      await controller.callInteraction('ApproveRemovalRequest', {
        user: admin,
        payload: {
          requestId: { id: request.id }
        }
      })
      
      // Second approval should fail
      const result = await controller.callInteraction('ApproveRemovalRequest', {
        user: admin,
        payload: {
          requestId: { id: request.id }
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })
}) 