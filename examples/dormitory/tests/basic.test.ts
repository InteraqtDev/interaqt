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

  test('User entity Transform computation - CreateUser interaction', async () => {
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: None (entity creation)
     * Steps: 1) Call CreateUser interaction 2) Verify User entity is created with correct data
     * Business Logic: User is created through CreateUser interaction with admin role
     */
    
    // Create admin user first (for permission)
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'admin',
        password: 'admin123',
        email: 'admin@example.com',
        name: 'System Admin',
        role: 'admin'
      }
    })
    
    console.log('adminResult:', adminResult)
    // Skip checking adminResult.data since Transform doesn't return data
    // expect(adminResult.data).toBeDefined()
    
    // Query the created user to verify it was created by the Transform computation
    const foundAdmin = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'admin'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'role', 'points', 'createdAt', 'isDeleted']
    )
    
    expect(foundAdmin).toBeDefined()
    expect(foundAdmin.username).toBe('admin')
    expect(foundAdmin.password).toBe('admin123')
    expect(foundAdmin.email).toBe('admin@example.com')
    expect(foundAdmin.name).toBe('System Admin')
    expect(foundAdmin.role).toBe('admin')
    expect(foundAdmin.points).toBe(100)
    expect(foundAdmin.createdAt).toBeGreaterThan(0)
    expect(foundAdmin.isDeleted).toBe(false)
  })

  test('User entity Transform computation - Registration interaction', async () => {
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: None (entity creation)
     * Steps: 1) Call Registration interaction 2) Verify User entity is created with correct data
     * Business Logic: User is created through Registration interaction with resident role
     */
    
    const result = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        name: 'Test User'
      }
    })
    
    // Skip checking result.data since Transform doesn't return data
    // expect(result.data).toBeDefined()
    
    // Query the created user to verify it was created by the Transform computation
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'testuser'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'role', 'points', 'createdAt', 'isDeleted']
    )
    
    expect(foundUser).toBeDefined()
    expect(foundUser.username).toBe('testuser')
    expect(foundUser.password).toBe('password123')
    expect(foundUser.email).toBe('test@example.com')
    expect(foundUser.name).toBe('Test User')
    expect(foundUser.role).toBe('resident') // Registration always creates resident role
    expect(foundUser.points).toBe(100)
    expect(foundUser.createdAt).toBeGreaterThan(0)
    expect(foundUser.isDeleted).toBe(false)
  })
  
})
