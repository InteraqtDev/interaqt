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

  test('User entity Transform computation creates users from interaction events', async () => {
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Call user creation interaction 2) Verify user entity is created 3) Verify properties are set correctly
     * Business Logic: User entities are created through Transform computation from InteractionEventEntity when user creation interactions occur
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // First create a CreateUser interaction to test with
    const CreateUserInteraction = Interaction.create({
      name: 'CreateUser',
      action: Action.create({ name: 'create' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'name', required: true }),
          PayloadItem.create({ name: 'email', required: true }),
          PayloadItem.create({ name: 'role', required: false }),
          PayloadItem.create({ name: 'phoneNumber', required: false })
        ]
      })
    })
    
    // Add this interaction to the controller
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions: [...interactions, CreateUserInteraction],
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Call the user creation interaction
    const result = await testController.callInteraction('CreateUser', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        role: 'student',
        phoneNumber: '+1-234-567-8900'
      }
    })
    
    // Verify user was created via Transform computation
    const users = await testSystem.storage.find('User', 
      undefined,
      undefined,
      ['id', 'name', 'email', 'role', 'status', 'phoneNumber']
    )
    
    expect(users.length).toBe(1)
    const user = users[0]
    
    // Verify all properties are set correctly from the payload
    expect(user.name).toBe('John Doe')
    expect(user.email).toBe('john.doe@example.com')
    expect(user.role).toBe('student')
    expect(user.status).toBe('active')  // Default value from Transform
    expect(user.phoneNumber).toBe('+1-234-567-8900')
    expect(user.id).toBeDefined()  // System generated
  })

  test('User entity Transform handles multiple interaction name formats', async () => {
    /**
     * Test Plan for: User entity Transform computation - alternative interaction names
     * Dependencies: User entity, InteractionEventEntity  
     * Steps: 1) Test different interaction name formats 2) Verify all create users 3) Verify default values
     * Business Logic: Transform should handle various user creation interaction naming conventions
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // Create interactions with different naming formats
    const createUserInteraction = Interaction.create({
      name: 'createUser',
      action: Action.create({ name: 'create' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'name', required: true }),
          PayloadItem.create({ name: 'email', required: true }),
          PayloadItem.create({ name: 'role', required: false })
        ]
      })
    })
    
    const registerUserInteraction = Interaction.create({
      name: 'registerUser',
      action: Action.create({ name: 'register' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'name', required: true }),
          PayloadItem.create({ name: 'email', required: true }),
          PayloadItem.create({ name: 'role', required: false })
        ]
      })
    })
    
    // Add these interactions to the controller
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions: [...interactions, createUserInteraction, registerUserInteraction],
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Test createUser format
    await testController.callInteraction('createUser', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Alice Smith',
        email: 'alice@example.com'
      }
    })
    
    // Test registerUser format  
    await testController.callInteraction('registerUser', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        role: 'administrator'
      }
    })
    
    // Verify both users were created
    const users = await testSystem.storage.find('User', 
      undefined,
      undefined,
      ['id', 'name', 'email', 'role', 'status', 'phoneNumber']
    )
    
    expect(users.length).toBe(2)
    
    // Verify Alice (with defaults)
    const alice = users.find(u => u.name === 'Alice Smith')
    expect(alice).toBeDefined()
    expect(alice.email).toBe('alice@example.com')
    expect(alice.role).toBe('student')  // Default when not provided
    expect(alice.status).toBe('active')
    expect(alice.phoneNumber).toBeUndefined()  // Not provided
    
    // Verify Bob (with custom role)
    const bob = users.find(u => u.name === 'Bob Johnson')
    expect(bob).toBeDefined()
    expect(bob.email).toBe('bob@example.com')
    expect(bob.role).toBe('administrator')  // Custom role from payload
    expect(bob.status).toBe('active')
  })
  
  test('User entity Transform ignores non-user creation interactions', async () => {
    /**
     * Test Plan for: User entity Transform computation - selective processing
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Call non-user creation interactions 2) Verify no users are created 3) Verify Transform returns null for irrelevant events
     * Business Logic: Transform should only create users for specific user creation interactions
     */
    
    // Call the existing CreateDormitory interaction (which should not create users)
    await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Building A',
        location: 'Campus North',
        bedCount: 4
      }
    })
    
    // Call another existing interaction (modifyBehaviorScore)
    await controller.callInteraction('modifyBehaviorScore', {
      user: { id: 'admin-user-1' },
      payload: {
        userId: 'user123',
        newScore: 85,
        reason: 'Test reason'
      }
    })
    
    // Verify no users were created by these non-user creation interactions
    const users = await system.storage.find('User', 
      undefined,
      undefined,
      ['id', 'name', 'email']
    )
    
    expect(users.length).toBe(0)
  })
}) 