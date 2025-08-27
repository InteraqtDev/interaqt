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

  test('Bed entity creation through Dormitory Transform (_parent:[Dormitory])', async () => {
    /**
     * Test Plan for: _parent:[Dormitory]
     * This tests the Dormitory's Transform computation that creates Beds
     * Dependencies: Dormitory entity creation
     * Steps: 1) Create admin user 2) Trigger CreateDormitory interaction 3) Verify Beds are created through DormitoryBedsRelation
     * Business Logic: Dormitory's Transform creates related Bed entities equal to capacity
     */
    
    // First create an admin user who can create dormitories
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'admin',
        password: 'admin123',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin'
      }
    })
    
    // Verify the interaction executed successfully
    expect(adminResult).toBeDefined()
    expect(adminResult.error).toBeUndefined()
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'admin'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Create dormitory with capacity 4
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building 1'
      }
    })
    
    // Verify the interaction executed successfully
    expect(dormResult).toBeDefined()
    expect(dormResult.error).toBeUndefined()
    
    // Get the created dormitory
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
      undefined,
      ['id', 'name', 'capacity']
    )
    
    const dormId = dormitory.id
    
    // Verify Beds were created through the relation
    const beds = await system.storage.find(
      'Bed',
      undefined,
      undefined,
      ['id', 'bedNumber', 'isOccupied', 'createdAt']
    )
    
    expect(beds.length).toBe(4)
    expect(beds[0].bedNumber).toBe('1')
    expect(beds[1].bedNumber).toBe('2')
    expect(beds[2].bedNumber).toBe('3')
    expect(beds[3].bedNumber).toBe('4')
    
    // Verify all beds are initially not occupied
    beds.forEach(bed => {
      expect(bed.isOccupied).toBe(false)
      expect(bed.createdAt).toBeGreaterThan(0)
    })
    
    // Verify DormitoryBedsRelation was created
    const dormBedRelations = await system.storage.find(
      'DormitoryBedsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', dormId] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'bedNumber'] }]
      ]
    )
    
    expect(dormBedRelations.length).toBe(4)
    dormBedRelations.forEach(rel => {
      expect(rel.source.id).toBe(dormId)
      expect(rel.source.name).toBe('Dorm A')
    })
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

  test('Dormitory entity creation via CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation
     * Dependencies: None (entity creation is independent)
     * Steps: 1) Trigger CreateDormitory interaction 2) Verify Dormitory entity is created with correct properties
     * Business Logic: Dormitories are created via CreateDormitory interaction with initial occupiedBeds = 0
     */
    
    // Create dormitory via CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-user', role: 'admin' },  // Admin user context
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 3,
        building: 'Building 1'
      }
    })
    
    // Verify the interaction executed successfully (no error)
    expect(result).toBeDefined()
    expect(result.error).toBeUndefined()
    
    // Query the created dormitory to verify properties
    const createdDormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
      undefined,
      ['id', 'name', 'capacity', 'floor', 'building', 'createdAt', 'isDeleted', 'occupiedBeds']
    )
    
    expect(createdDormitory).toBeDefined()
    expect(createdDormitory.name).toBe('Dorm A')
    expect(createdDormitory.capacity).toBe(4)
    expect(createdDormitory.floor).toBe(3)
    expect(createdDormitory.building).toBe('Building 1')
    expect(createdDormitory.createdAt).toBeGreaterThan(0)
    expect(createdDormitory.isDeleted).toBe(false)
    expect(createdDormitory.occupiedBeds).toBe(0)  // Initial occupiedBeds
  })

})
