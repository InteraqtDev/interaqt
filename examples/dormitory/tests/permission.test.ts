import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

describe('Permission and Business Rules', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      activities,
      dict: dicts,
      ignorePermission: false // We want to test permissions
    })

    await controller.setup(true)
  })

  describe('P001: CreateUser - Only admin can create users', () => {
    test('Admin can create user with valid data', async () => {
      const result = await controller.callInteraction('createUser', {
        user: {
          id: 'admin1',
          name: 'Admin User',
          email: 'admin@university.edu',
          studentId: 'ADMIN001',
          role: 'admin'
        },
        payload: {
          name: 'John Doe',
          email: 'john@university.edu', 
          studentId: '2024001',
          phone: '123-456-7890',
          role: 'user'
        }
      })
      
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Non-admin (dormitory leader) cannot create user', async () => {
      const result = await controller.callInteraction('createUser', {
        user: {
          id: 'leader1',
          name: 'Leader User',
          email: 'leader@university.edu',
          studentId: 'LEADER001',
          role: 'dormitoryLeader'
        },
        payload: {
          name: 'John Doe',
          email: 'john@university.edu',
          studentId: '2024001'
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })

    test('Non-admin (regular user) cannot create user', async () => {
      const result = await controller.callInteraction('createUser', {
        user: {
          id: 'user1',
          name: 'Regular User',
          email: 'user@university.edu', 
          studentId: 'USER001',
          role: 'user'
        },
        payload: {
          name: 'John Doe',
          email: 'john@university.edu',
          studentId: '2024001'
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })

  describe('P004: CreateDormitory - Only admin can create dormitories', () => {
    test('Admin can create dormitory', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: {
          id: 'admin1',
          name: 'Admin User',
          email: 'admin@university.edu',
          studentId: 'ADMIN001',
          role: 'admin'
        },
        payload: {
          name: 'Block A',
          location: 'North Campus',
          capacity: 6
        }
      })
      
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Non-admin cannot create dormitory', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: {
          id: 'user1',
          name: 'Regular User',
          email: 'user@university.edu',
          studentId: 'USER001',
          role: 'user'
        },
        payload: {
          name: 'Block B',
          location: 'South Campus',
          capacity: 4
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })

  describe('P007, P010, P012, P013, P018: Additional admin-only permissions', () => {
    test('Admin can create bed (P007)', async () => {
      const result = await controller.callInteraction('createBed', {
        user: { id: 'admin1', role: 'admin' },
        payload: { dormitoryId: 'dorm1', number: 'A1' }
      })
      expect(result.error).toBeUndefined()
    })

    test('Non-admin cannot create bed (P007)', async () => {
      const result = await controller.callInteraction('createBed', {
        user: { id: 'user1', role: 'user' },
        payload: { dormitoryId: 'dorm1', number: 'A1' }
      })
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })

    test('Admin can assign user to bed (P010)', async () => {
      const result = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin1', role: 'admin' },
        payload: { userId: 'user1', bedId: 'bed1' }
      })
      expect(result.error).toBeUndefined()
    })

    test('Admin can assign dormitory leader (P012)', async () => {
      const result = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin1', role: 'admin' },
        payload: { userId: 'user1', dormitoryId: 'dorm1' }
      })
      expect(result.error).toBeUndefined()
    })

    test('Admin can create deduction rule (P013)', async () => {
      const result = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Noise Violation', description: 'Making noise after 10 PM', points: 10 }
      })
      expect(result.error).toBeUndefined()
    })

    test('Admin can process removal request (P018)', async () => {
      const result = await controller.callInteraction('processRemovalRequest', {
        user: { id: 'admin1', role: 'admin' },
        payload: { requestId: 'req1', decision: 'approved' }
      })
      expect(result.error).toBeUndefined()
    })
  })
})