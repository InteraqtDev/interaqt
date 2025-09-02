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

  test('Dormitory entity Transform computation creates dormitories from createDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Call createDormitory interaction (I101) 2) Verify dormitory entity is created 3) Verify properties are set correctly from payload
     * Business Logic: Dormitory entities are created through Transform computation from InteractionEventEntity when createDormitory interaction occurs
     */
    
    // Call the createDormitory interaction (I101)
    const result = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Building A',
        location: 'Campus North',
        bedCount: 4
      }
    })
    
    // Verify dormitory was created via Transform computation
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    
    // Verify all properties are set correctly from the payload
    expect(dormitory.name).toBe('Building A')
    expect(dormitory.location).toBe('Campus North')
    expect(dormitory.maxBeds).toBe(4)  // bedCount mapped to maxBeds
    expect(dormitory.status).toBe('active')  // Default value from Transform
    expect(dormitory.id).toBeDefined()  // System generated
  })

  test('Dormitory entity Transform ignores non-createDormitory interactions', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation - selective processing
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Call non-dormitory creation interactions 2) Verify no dormitories are created 3) Verify Transform returns null for irrelevant events
     * Business Logic: Transform should only create dormitories for the createDormitory interaction
     */
    
    // Call non-dormitory creation interactions
    await controller.callInteraction('modifyBehaviorScore', {
      user: { id: 'admin-user-1' },
      payload: {
        userId: 'user123',
        newScore: 85,
        reason: 'Test reason'
      }
    })
    
    await controller.callInteraction('assignUserToBed', {
      user: { id: 'admin-user-1' },
      payload: {
        userId: 'user123',
        bedId: 'bed456'
      }
    })
    
    // Verify no dormitories were created by these non-dormitory creation interactions
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name']
    )
    
    expect(dormitories.length).toBe(0)
  })

  test('Dormitory entity Transform handles multiple dormitory creations', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation - multiple creations
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Create multiple dormitories with different payloads 2) Verify all are created 3) Verify each has correct properties
     * Business Logic: Transform should handle multiple separate dormitory creation events
     */
    
    // Create first dormitory
    await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Building A',
        location: 'Campus North',
        bedCount: 4
      }
    })
    
    // Create second dormitory  
    await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-2' },
      payload: {
        name: 'Building B',
        location: 'Campus South',
        bedCount: 6
      }
    })
    
    // Verify both dormitories were created
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(2)
    
    // Verify first dormitory
    const buildingA = dormitories.find(d => d.name === 'Building A')
    expect(buildingA).toBeDefined()
    expect(buildingA.location).toBe('Campus North')
    expect(buildingA.maxBeds).toBe(4)
    expect(buildingA.status).toBe('active')
    
    // Verify second dormitory
    const buildingB = dormitories.find(d => d.name === 'Building B')
    expect(buildingB).toBeDefined()
    expect(buildingB.location).toBe('Campus South')
    expect(buildingB.maxBeds).toBe(6)
    expect(buildingB.status).toBe('active')
  })

  test('Bed entities created through Dormitory Transform computation (_parent:Dormitory)', async () => {
    /**
     * Test Plan for: _parent:Dormitory
     * This tests the Dormitory's Transform computation that creates Bed entities
     * Dependencies: Dormitory entity, Bed entity, BedDormitory relation, createDormitory interaction (I101)
     * Steps: 1) Trigger createDormitory interaction with bedCount 2) Verify dormitory is created 3) Verify beds are created 4) Verify bed properties and relations
     * Business Logic: When a dormitory is created with bedCount=N, exactly N beds should be created and linked to that dormitory
     */
    
    // Call the createDormitory interaction (I101) with specific bedCount
    const result = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Test Building',
        location: 'Test Campus',
        bedCount: 5
      }
    })
    
    // Verify dormitory was created
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    expect(dormitory.name).toBe('Test Building')
    expect(dormitory.maxBeds).toBe(5)
    
    // Verify beds were created via the parent Dormitory's Transform computation
    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status']
    )
    
    expect(beds.length).toBe(5)
    
    // Verify bed properties - should be numbered 1, 2, 3, 4, 5
    const bedNumbers = beds.map(b => b.number).sort()
    expect(bedNumbers).toEqual(['1', '2', '3', '4', '5'])
    
    // Verify all beds have active status
    beds.forEach(bed => {
      expect(bed.status).toBe('active')
      expect(bed.id).toBeDefined()
    })
    
    // Import the relation to test the link between beds and dormitory
    const { BedDormitory } = await import('../backend')
    
    // Verify BedDormitory relations were created linking beds to dormitory
    const bedDormitoryRelations = await system.storage.find(BedDormitory.name,
      undefined,
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'number'] }],
        ['target', { attributeQuery: ['id', 'name'] }]
      ]
    )
    
    expect(bedDormitoryRelations.length).toBe(5)
    
    // Verify each relation links a bed to the dormitory
    bedDormitoryRelations.forEach(relation => {
      expect(relation.source).toBeDefined()
      expect(relation.target).toBeDefined()
      expect(relation.target.id).toBe(dormitory.id)
      expect(relation.target.name).toBe('Test Building')
      expect(['1', '2', '3', '4', '5']).toContain(relation.source.number)
    })
  })
}) 