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
      expect(result.error.type).toBe('condition check failed')
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
      expect(result.error.type).toBe('condition check failed')
    })
  })
})