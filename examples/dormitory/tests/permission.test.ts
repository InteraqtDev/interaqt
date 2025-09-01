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
      dict: dicts
    })

    await controller.setup(true)
  })

  // ==================== PHASE 1: Basic Role-Based Permissions ====================
  
  describe('P001: Only admin can create users', () => {
    test('Admin can create user', async () => {
      // Admin user context
      const adminUser = { id: 'admin1', role: 'administrator' }
      
      const result = await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          username: 'testuser',
          email: 'test@example.com', 
          password: 'password123',
          fullName: 'Test User',
          role: 'regular_user'
        }
      })
      
      // Should succeed - no error
      expect(result.error).toBeUndefined()
    })
    
    test('Non-admin cannot create user', async () => {
      // Non-admin user context  
      const regularUser = { id: 'user1', role: 'regular_user' }
      
      const result = await controller.callInteraction('CreateUser', {
        user: regularUser,
        payload: {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123', 
          fullName: 'Test User',
          role: 'regular_user'
        }
      })
      
      // Should fail with condition check failed error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdministrator')
    })
  })
})