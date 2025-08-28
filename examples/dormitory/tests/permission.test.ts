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

  describe('Phase 1: Basic Role-Based Permissions', () => {
    test('P001: Admin can create dormitory (TC001)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm A',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify dormitory was created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
        undefined,
        ['id', 'name', 'capacity', 'floor', 'building']
      )
      expect(dormitories.length).toBe(1)
      expect(dormitories[0].name).toBe('Dorm A')
      expect(dormitories[0].capacity).toBe(4)
      expect(dormitories[0].floor).toBe(1)
      expect(dormitories[0].building).toBe('Building 1')
    })

    test('P001: Non-admin cannot create dormitory (TC007)', async () => {
      // Create non-admin user (resident)
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Resident should not be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: resident,
        payload: {
          name: 'Dorm B',
          capacity: 4,
          floor: 2,
          building: 'Building 1'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', MatchExp.atom({ key: 'name', value: ['=', 'Dorm B'] }))
      expect(dormitories.length).toBe(0)
    })

    test('P001: Dormitory leader cannot create dormitory', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Dormitory leader should not be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: dormitoryLeader,
        payload: {
          name: 'Dorm C',
          capacity: 6,
          floor: 3,
          building: 'Building 2'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', MatchExp.atom({ key: 'name', value: ['=', 'Dorm C'] }))
      expect(dormitories.length).toBe(0)
    })

    test('P001: Unauthenticated user cannot create dormitory', async () => {
      // Try to create dormitory without user
      const result = await controller.callInteraction('CreateDormitory', {
        user: null,
        payload: {
          name: 'Dorm D',
          capacity: 5,
          floor: 4,
          building: 'Building 3'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', MatchExp.atom({ key: 'name', value: ['=', 'Dorm D'] }))
      expect(dormitories.length).toBe(0)
    })
  })
})