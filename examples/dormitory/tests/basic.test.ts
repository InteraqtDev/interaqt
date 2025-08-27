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

  test('User entity Transform computation', async () => {
    /**
     * Test Plan for: User entity Transform
     * Dependencies: None (entity created independently)
     * Steps: 1) CreateUser interaction 2) Verify User created 3) Registration interaction 4) Verify second User created
     * Business Logic: Users created from CreateUser or Registration interactions
     */
    
    // Test CreateUser interaction
    const createUserResult = await controller.callInteraction('CreateUser', {
      user: { id: 'admin' },
      payload: {
        username: 'john_doe',
        password: 'password123',
        email: 'john@example.com',
        name: 'John Doe',
        role: 'admin'
      }
    })
    
    expect(createUserResult.error).toBeUndefined()
    
    // Verify user was created with correct properties
    const createdUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'username', value: ['=', 'john_doe'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'role', 'points', 'createdAt', 'isDeleted']
    )
    
    expect(createdUser).toBeDefined()
    expect(createdUser.username).toBe('john_doe')
    expect(createdUser.password).toBe('password123')
    expect(createdUser.email).toBe('john@example.com')
    expect(createdUser.name).toBe('John Doe')
    expect(createdUser.role).toBe('admin')
    expect(createdUser.points).toBe(100)
    expect(createdUser.createdAt).toBeGreaterThan(0)
    expect(createdUser.isDeleted).toBe(false)
    
    // Test Registration interaction
    const registrationResult = await controller.callInteraction('Registration', {
      user: { id: 'anonymous' },
      payload: {
        username: 'jane_doe',
        password: 'secret456',
        email: 'jane@example.com',
        name: 'Jane Doe'
      }
    })
    
    expect(registrationResult.error).toBeUndefined()
    
    // Verify second user was created with correct properties
    const registeredUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'username', value: ['=', 'jane_doe'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'role', 'points', 'createdAt', 'isDeleted']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser.username).toBe('jane_doe')
    expect(registeredUser.password).toBe('secret456')
    expect(registeredUser.email).toBe('jane@example.com')
    expect(registeredUser.name).toBe('Jane Doe')
    expect(registeredUser.role).toBe('resident') // Default role for Registration
    expect(registeredUser.points).toBe(100)
    expect(registeredUser.createdAt).toBeGreaterThan(0)
    expect(registeredUser.isDeleted).toBe(false)
    
    // Verify we have exactly 2 users
    const allUsers = await system.storage.find('User',
      undefined,
      undefined,
      ['id']
    )
    expect(allUsers).toHaveLength(2)
  })
})
