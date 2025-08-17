import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

describe('Complete Functional Tests', () => {
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
      activities,
      dict: dicts
    })

    await controller.setup(true)
  })

  describe('Phase 1: Core Business Logic Tests', () => {
    test('TC001: Create Dormitory (via CreateDormitory Interaction)', async () => {
      // Preconditions: Admin user logged in
      const admin = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@dorm.com',
        role: 'admin',
        password: 'admin123',
        department: 'Management',
        status: 'active',
        points: 100
      })

      // Input data
      const dormitoryData = {
        name: 'A栋101',
        capacity: 4,
        floor: 1,
        building: 'A栋'
      }

      // Execute interaction
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: dormitoryData
      })

      // Log result for debugging
      console.log('CreateDormitory result:', result)

      // Verify interaction succeeded
      expect(result.error).toBeUndefined()
      expect(result.data).toBeDefined()
      
      // Expected Result 1: Create new dormitory record
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', result.data.id] }),
        undefined,
        ['id', 'name', 'capacity', 'floor', 'building', 'status']
      )
      expect(dormitory).toBeDefined()
      expect(dormitory.name).toBe('A栋101')
      expect(dormitory.capacity).toBe(4)
      expect(dormitory.floor).toBe(1)
      expect(dormitory.building).toBe('A栋')
      
      // Expected Result 2: Dormitory status is 'available'
      expect(dormitory.status).toBe('available')
      
      // Expected Result 3 & 4: Automatically create 4 bed records with status 'vacant'
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status', 'dormitoryId']
      )
      expect(beds.length).toBe(4)
      
      // Expected Result 5: Bed numbers are "1号床", "2号床", "3号床", "4号床"
      const bedNumbers = beds.map(b => b.bedNumber).sort()
      expect(bedNumbers).toEqual(['1号床', '2号床', '3号床', '4号床'])
      
      // All beds should be vacant
      beds.forEach(bed => {
        expect(bed.status).toBe('vacant')
      })

      // Post validation: Dormitory appears in dormitory list
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      const dormitoryIds = allDormitories.map(d => d.id)
      expect(dormitoryIds).toContain(dormitory.id)
    })
  })
}) 