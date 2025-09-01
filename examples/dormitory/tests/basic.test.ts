import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

describe('Basic Functionality', () => {
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
      dict: dicts,
      ignorePermission: true,
      forceThtrowInteractionError: true // 使用 throw 的方式来处理 interaction 的 error
    })

    await controller.setup(true)
  })

  test('User entity creation via CreateUser interaction', async () => {
    // Execute CreateUser interaction
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'admin' }, // user context
      payload: {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        role: 'student'
      }
    })

    // Verify the interaction was successful
    expect(result).toBeDefined()
    expect(result.error).toBeUndefined()
    
    // Query the created user with specific attributes
    const users = await controller.callInteraction('ViewUserList', {
      user: { id: 'admin' },
      query: {
        attributeQuery: ['id', 'username', 'email', 'fullName', 'role', 'isActive', 'createdAt', 'currentScore']
      }
    })

    expect(users.data).toHaveLength(1)
    
    const user = users.data[0]
    expect(user.username).toBe('testuser')
    expect(user.email).toBe('test@example.com')
    expect(user.fullName).toBe('Test User')
    expect(user.role).toBe('student')
    expect(user.isActive).toBe(true)
    expect(user.createdAt).toBeGreaterThan(0)
    expect(user.currentScore).toBe(100) // Default value
  })

  test('Dormitory entity creation via CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation
     * Dependencies: Dormitory entity, CreateDormitory interaction
     * Steps: 1) Execute CreateDormitory interaction 2) Verify dormitory is created with correct properties
     * Business Logic: Transform computation creates Dormitory from CreateDormitory interaction
     */
    
    // Execute CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin' }, // user context
      payload: {
        name: 'Building A Room 101',
        bedCount: 4,
        building: 'A',
        floor: 1
      }
    })

    // Verify the interaction was successful
    expect(result).toBeDefined()
    expect(result.error).toBeUndefined()
    
    // Query the created dormitory with specific attributes
    const dormitories = await controller.callInteraction('ViewDormitoryList', {
      user: { id: 'admin' },
      query: {
        attributeQuery: ['id', 'name', 'bedCount', 'building', 'floor', 'occupiedBeds', 'availableBeds']
      }
    })

    expect(dormitories.data).toHaveLength(1)
    
    const dormitory = dormitories.data[0]
    expect(dormitory.name).toBe('Building A Room 101')
    expect(dormitory.bedCount).toBe(4)
    expect(dormitory.building).toBe('A')
    expect(dormitory.floor).toBe(1)
    expect(dormitory.occupiedBeds).toBe(0) // Default value
    expect(dormitory.id).toBeDefined()
  })
}) 