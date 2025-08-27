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
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: None (entity creation is independent)
     * Steps: 1) Trigger CreateUser interaction 2) Verify User entity is created with correct properties
     * Business Logic: Users are created via CreateUser interaction with initial points of 100
     */
    
    // Create user via CreateUser interaction
    const result = await controller.callInteraction('CreateUser', {
      user: null,  // No user context needed for creation
      payload: {
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin'
      }
    })
    
    // Verify the interaction executed successfully (no error)
    expect(result).toBeDefined()
    expect(result.error).toBeUndefined()
    
    // Query the created user to verify properties
    const createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'testuser'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'points', 'role', 'createdAt', 'isDeleted']
    )
    
    expect(createdUser).toBeDefined()
    expect(createdUser.username).toBe('testuser')
    expect(createdUser.password).toBe('password123')
    expect(createdUser.email).toBe('test@example.com')
    expect(createdUser.name).toBe('Test User')
    expect(createdUser.points).toBe(100)  // Initial points
    expect(createdUser.role).toBe('admin')
    expect(createdUser.createdAt).toBeGreaterThan(0)
    expect(createdUser.isDeleted).toBe(false)
  })

  test('User entity creation via Registration interaction', async () => {
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: None (entity creation is independent)
     * Steps: 1) Trigger Registration interaction 2) Verify User entity is created with correct properties
     * Business Logic: Registration always creates users with 'resident' role
     */
    
    // Create user via Registration interaction
    const result = await controller.callInteraction('Registration', {
      user: null,  // No user context needed for registration
      payload: {
        username: 'newresident',
        password: 'password456',
        email: 'resident@example.com',
        name: 'New Resident'
      }
    })
    
    // Verify the interaction executed successfully (no error)
    expect(result).toBeDefined()
    expect(result.error).toBeUndefined()
    
    // Query the created user to verify properties
    const createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'newresident'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'points', 'role', 'createdAt', 'isDeleted']
    )
    
    expect(createdUser).toBeDefined()
    expect(createdUser.username).toBe('newresident')
    expect(createdUser.password).toBe('password456')
    expect(createdUser.email).toBe('resident@example.com')
    expect(createdUser.name).toBe('New Resident')
    expect(createdUser.points).toBe(100)  // Initial points
    expect(createdUser.role).toBe('resident')  // Registration always creates residents
    expect(createdUser.createdAt).toBeGreaterThan(0)
    expect(createdUser.isDeleted).toBe(false)
  })

})
