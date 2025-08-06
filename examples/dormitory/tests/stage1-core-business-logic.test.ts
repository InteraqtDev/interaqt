import { describe, test, expect, beforeEach } from 'vitest'
import { MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import {
  createDormitoryManagementSystem,
  entities,
  relations,
  interactions,
  activities
} from '../backend/index'

describe('Stage 1: Core Business Logic Tests', () => {
  let system: MonoSystem
  let controller: any

  beforeEach(async () => {
    // Create fresh system for each test
    const result = await createDormitoryManagementSystem()
    system = result.system
    controller = result.controller
  })

  describe('TC001: Create User', () => {
    test('should create user with valid data', async () => {
      // Arrange
      const userData = {
        name: '张三',
        email: 'zhangsan@example.com',
        phone: '13800138000',
        role: 'student'
      }

      // Act
      const result = await controller.callInteraction('CreateUser', {
        user: { id: 'system' }, // System user for creation
        payload: userData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Verify user was created
      const users = await system.storage.find('User',
        MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
        undefined,
        ['id', 'name', 'email', 'phone', 'role', 'status', 'createdAt']
      )
      
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

  describe('TC002: Create Dormitory', () => {
    test('should create dormitory with specified bed count', async () => {
      // Arrange
      const dormData = {
        name: 'A栋101',
        bedCount: 4
      }

      // Act
      const result = await controller.callInteraction('CreateDormitory', {
        user: { id: 'admin', role: 'admin' }, // Use admin user
        payload: dormData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Verify dormitory was created
      const dormitories = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', dormData.name] }),
        undefined,
        ['id', 'name', 'bedCount', 'availableBedCount', 'createdAt']
      )
      
      expect(dormitories.length).toBe(1)
      const dormitory = dormitories[0]
      expect(dormitory.name).toBe(dormData.name)
      expect(dormitory.bedCount).toBe(dormData.bedCount)
      expect(dormitory.createdAt).toBeGreaterThan(0)
      
      // Verify beds were created
      const beds = await system.storage.find('Bed',
        undefined,
        undefined,
        ['id', 'bedNumber', 'status', 'dormitory']
      )
      
      expect(beds.length).toBe(dormData.bedCount)
      
      // Check each bed
      for (let i = 1; i <= dormData.bedCount; i++) {
        const bed = beds.find(b => b.bedNumber === `床位${i}`)
        expect(bed).toBeTruthy()
        expect(bed.status).toBe('available')
      }
    })
  })

  describe('TC003: Record User Behavior', () => {
    test('should record behavior and update penalty points', async () => {
      // Arrange - Create user first
      const userData = {
        name: '李四',
        email: 'lisi@example.com', 
        phone: '13800138001',
        role: 'student'
      }
      
      await controller.callInteraction('CreateUser', {
        user: { id: 'system' },
        payload: userData
      })
      
      const users = await system.storage.find('User',
        MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
        undefined,
        ['id']
      )
      const userId = users[0].id

      const behaviorData = {
        userId: userId,
        behaviorType: 'noise_violation',
        description: '深夜大声喧哗',
        penaltyPoints: 20
      }

      // Act
      const result = await controller.callInteraction('RecordBehavior', {
        user: { id: 'dormhead', role: 'dormHead' }, // Use dorm head user
        payload: behaviorData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Verify behavior record was created
      const behaviorRecords = await system.storage.find('BehaviorRecord',
        MatchExp.atom({ key: 'behaviorType', value: ['=', behaviorData.behaviorType] }),
        undefined,
        ['id', 'behaviorType', 'description', 'penaltyPoints', 'recordedAt']
      )
      
      expect(behaviorRecords.length).toBe(1)
      const record = behaviorRecords[0]
      expect(record.behaviorType).toBe(behaviorData.behaviorType)
      expect(record.description).toBe(behaviorData.description) 
      expect(record.penaltyPoints).toBe(behaviorData.penaltyPoints)
      expect(record.recordedAt).toBeGreaterThan(0)
      
      // Note: totalPenaltyPoints computation will be tested in later integration
    })
  })

  describe('TC004: Create Expulsion Request', () => {
    test('should create expulsion request', async () => {
      // Arrange - Create target user
      const userData = {
        name: '王五',
        email: 'wangwu@example.com',
        phone: '13800138002', 
        role: 'student'
      }
      
      await controller.callInteraction('CreateUser', {
        user: { id: 'system' },
        payload: userData
      })
      
      const users = await system.storage.find('User',
        MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
        undefined,
        ['id']
      )
      const targetUserId = users[0].id

      const requestData = {
        targetUserId: targetUserId,
        reason: '累计违规扣分过多'
      }

      // Act
      const result = await controller.callInteraction('CreateExpulsionRequest', {
        user: { id: 'dormhead', role: 'dormHead' }, // Use dorm head user
        payload: requestData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Verify expulsion request was created
      const requests = await system.storage.find('ExpulsionRequest',
        MatchExp.atom({ key: 'reason', value: ['=', requestData.reason] }),
        undefined,
        ['id', 'reason', 'status', 'requestedAt']
      )
      
      expect(requests.length).toBe(1)
      const request = requests[0]
      expect(request.reason).toBe(requestData.reason)
      expect(request.status).toBe('pending')
      expect(request.requestedAt).toBeGreaterThan(0)
    })
  })

  describe('TC005: Process Expulsion Request - Approve', () => {
    test('should approve expulsion request', async () => {
      // Arrange - Create expulsion request first
      const userData = {
        name: '赵六',
        email: 'zhaoliu@example.com',
        phone: '13800138003',
        role: 'student'
      }
      
      await controller.callInteraction('CreateUser', {
        user: { id: 'system' },
        payload: userData
      })
      
      const users = await system.storage.find('User',
        MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
        undefined,
        ['id']
      )
      const targetUserId = users[0].id

      await controller.callInteraction('CreateExpulsionRequest', {
        user: { id: 'dormhead', role: 'dormHead' },
        payload: {
          targetUserId: targetUserId,
          reason: '严重违规'
        }
      })
      
      const requests = await system.storage.find('ExpulsionRequest',
        MatchExp.atom({ key: 'reason', value: ['=', '严重违规'] }),
        undefined,
        ['id']
      )
      const requestId = requests[0].id

      const processData = {
        requestId: requestId,
        decision: 'approved',
        adminNotes: '违规严重，同意踢出'
      }

      // Act
      const result = await controller.callInteraction('ProcessExpulsionRequest', {
        user: { id: 'admin', role: 'admin' }, // Use admin user
        payload: processData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Note: Status update and user expulsion will be handled by StateMachine in Stage 2
      // For now, just verify the interaction executes successfully
    })
  })

  describe('TC006: Assign User to Bed', () => {
    test('should create bed assignment', async () => {
      // Arrange - Create user and dormitory with bed
      const userData = {
        name: '孙七',
        email: 'sunqi@example.com',
        phone: '13800138004',
        role: 'student'
      }
      
      await controller.callInteraction('CreateUser', {
        user: { id: 'system' },
        payload: userData
      })
      
      await controller.callInteraction('CreateDormitory', {
        user: { id: 'admin', role: 'admin' },
        payload: {
          name: 'B栋201',
          bedCount: 4
        }
      })
      
      const users = await system.storage.find('User',
        MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
        undefined,
        ['id']
      )
      const userId = users[0].id
      
      const beds = await system.storage.find('Bed',
        MatchExp.atom({ key: 'status', value: ['=', 'available'] }),
        undefined,
        ['id']
      )
      const bedId = beds[0].id

      const assignmentData = {
        userId: userId,
        bedId: bedId
      }

      // Act
      const result = await controller.callInteraction('AssignUserToBed', {
        user: { id: 'admin', role: 'admin' }, // Use admin user
        payload: assignmentData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Verify assignment was created
      const assignments = await system.storage.find('UserBedAssignment',
        undefined,
        undefined,
        ['id', 'assignedAt', 'status']
      )
      
      expect(assignments.length).toBe(1)
      const assignment = assignments[0]
      expect(assignment.status).toBe('active')
      expect(assignment.assignedAt).toBeGreaterThan(0)
    })
  })

  describe('TC007: Assign Dorm Head', () => {
    test('should assign user as dorm head', async () => {
      // Arrange - Create user and dormitory
      const userData = {
        name: '周八',
        email: 'zhouba@example.com',
        phone: '13800138005',
        role: 'student'
      }
      
      await controller.callInteraction('CreateUser', {
        user: { id: 'system' },
        payload: userData
      })
      
      await controller.callInteraction('CreateDormitory', {
        user: { id: 'admin', role: 'admin' },
        payload: {
          name: 'C栋301',
          bedCount: 6
        }
      })
      
      const users = await system.storage.find('User',
        MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
        undefined,
        ['id']
      )
      const userId = users[0].id
      
      const dormitories = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'C栋301'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitories[0].id

      const assignmentData = {
        userId: userId,
        dormitoryId: dormitoryId
      }

      // Act
      const result = await controller.callInteraction('AssignDormHead', {
        user: { id: 'admin', role: 'admin' }, // Use admin user
        payload: assignmentData
      })

      // Assert
      expect(result.error).toBeUndefined()
      
      // Note: Role update and relation creation will be handled by StateMachine in Stage 2
      // For now, just verify the interaction executes successfully
    })
  })
})