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

  describe('P002: Only admin can create dormitories', () => {
    test('Admin can create dormitory', async () => {
      // Admin user context
      const adminUser = { id: 'admin1', role: 'administrator' }
      
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Test Dorm A',
          bedCount: 4,
          building: 'Building A',
          floor: 1
        }
      })
      
      // Should succeed - no error
      expect(result.error).toBeUndefined()
    })
    
    test('Non-admin cannot create dormitory', async () => {
      // Non-admin user context  
      const regularUser = { id: 'user1', role: 'regular_user' }
      
      const result = await controller.callInteraction('CreateDormitory', {
        user: regularUser,
        payload: {
          name: 'Test Dorm A',
          bedCount: 4,
          building: 'Building A',
          floor: 1
        }
      })
      
      // Should fail with condition check failed error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdministrator')
    })
  })

  describe('P003: Only admin can assign leaders', () => {
    test('Admin can assign leader', async () => {
      // Admin user context
      const adminUser = { id: 'admin1', role: 'administrator' }
      
      // First create a user and dormitory to assign
      const createUserResult = await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          username: 'testleader',
          email: 'leader@example.com',
          password: 'password123',
          fullName: 'Test Leader',
          role: 'regular_user'
        }
      })
      expect(createUserResult.error).toBeUndefined()
      
      const createDormResult = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Test Dorm',
          bedCount: 4,
          building: 'Building A',
          floor: 1
        }
      })
      expect(createDormResult.error).toBeUndefined()
      
      // Get the created entities to get their IDs
      const createdUserId = createUserResult.effects?.[0]?.record?.id
      const createdDormId = createDormResult.effects?.[0]?.record?.id
      
      // Now test assigning the leader
      const result = await controller.callInteraction('AssignDormitoryLeader', {
        user: adminUser,
        payload: {
          userId: createdUserId,
          dormitoryId: createdDormId
        }
      })
      
      // Should succeed - no error
      expect(result.error).toBeUndefined()
    })
    
    test('Non-admin cannot assign leader', async () => {
      // Non-admin user context  
      const regularUser = { id: 'user1', role: 'regular_user' }
      
      const result = await controller.callInteraction('AssignDormitoryLeader', {
        user: regularUser,
        payload: {
          userId: 'some-user-id',  // Using string IDs for permission test (before validation)
          dormitoryId: 'some-dorm-id'
        }
      })
      
      // Should fail with condition check failed error (permission denied before validation)
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdministrator')
    })
  })

  describe('P004: Only admin can assign users to beds', () => {
    test('Admin can assign user to bed', async () => {
      // Admin user context
      const adminUser = { id: 'admin1', role: 'administrator' }
      
      // First create a user and dormitory to assign
      const createUserResult = await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          username: 'testbeduser',
          email: 'beduser@example.com',
          password: 'password123',
          fullName: 'Test Bed User',
          role: 'regular_user'
        }
      })
      expect(createUserResult.error).toBeUndefined()
      
      const createDormResult = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Test Dorm for Bed',
          bedCount: 4,
          building: 'Building B',
          floor: 2
        }
      })
      expect(createDormResult.error).toBeUndefined()
      
      // Get the created entities to get their IDs
      const createdUserId = createUserResult.effects?.[0]?.record?.id
      const createdDormId = createDormResult.effects?.[0]?.record?.id
      
      // Now test assigning user to bed
      const result = await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: createdUserId,
          dormitoryId: createdDormId,
          bedNumber: 1
        }
      })
      
      // Should succeed - no error
      expect(result.error).toBeUndefined()
    })
    
    test('Non-admin cannot assign user to bed', async () => {
      // Non-admin user context  
      const regularUser = { id: 'user1', role: 'regular_user' }
      
      const result = await controller.callInteraction('AssignUserToBed', {
        user: regularUser,
        payload: {
          userId: 'some-user-id',  // Using string IDs for permission test (before validation)
          dormitoryId: 'some-dorm-id',
          bedNumber: 1
        }
      })
      
      // Should fail with condition check failed error (permission denied before validation)
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdministrator')
    })
  })
})