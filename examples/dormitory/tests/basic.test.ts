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
     * Test Plan for: User entity Transform
     * Dependencies: None (entity creation)
     * Steps: 1) Call CreateUser interaction 2) Verify User entity is created with correct properties
     * Business Logic: User created through CreateUser interaction with specified role
     */
    
    // Call CreateUser interaction
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'admin-user', role: 'admin' },
      payload: {
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'admin'
      }
    })
    
    // Verify no errors
    expect(result.error).toBeUndefined()
    
    // Find created user
    const users = await system.storage.find('User', 
      MatchExp.atom({ key: 'username', value: ['=', 'testuser'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'role', 'points', 'createdAt', 'isDeleted']
    )
    
    expect(users.length).toBe(1)
    const user = users[0]
    
    // Verify user properties
    expect(user.username).toBe('testuser')
    expect(user.password).toBe('password123')
    expect(user.email).toBe('test@example.com')
    expect(user.name).toBe('Test User')
    expect(user.role).toBe('admin')
    expect(user.points).toBe(100)
    expect(user.isDeleted).toBe(false)
    expect(user.createdAt).toBeGreaterThan(0)
  })

  test('User entity Transform computation - Registration interaction', async () => {
    /**
     * Test Plan for: User entity Transform
     * Dependencies: None (entity creation)
     * Steps: 1) Call Registration interaction 2) Verify User entity is created with correct properties
     * Business Logic: User created through Registration interaction with resident role
     */
    
    // Call Registration interaction
    const result = await controller.callInteraction('Registration', {
      user: { id: 'system' },
      payload: {
        username: 'newresident',
        password: 'secret456',
        email: 'resident@example.com',
        name: 'New Resident'
      }
    })
    
    // Verify no errors
    expect(result.error).toBeUndefined()
    
    // Find created user
    const users = await system.storage.find('User', 
      MatchExp.atom({ key: 'username', value: ['=', 'newresident'] }),
      undefined,
      ['id', 'username', 'password', 'email', 'name', 'role', 'points', 'createdAt', 'isDeleted']
    )
    
    expect(users.length).toBe(1)
    const user = users[0]
    
    // Verify user properties - Registration always creates residents
    expect(user.username).toBe('newresident')
    expect(user.password).toBe('secret456')
    expect(user.email).toBe('resident@example.com')
    expect(user.name).toBe('New Resident')
    expect(user.role).toBe('resident') // Always resident for Registration
    expect(user.points).toBe(100)
    expect(user.isDeleted).toBe(false)
    expect(user.createdAt).toBeGreaterThan(0)
  })

  test('User entity Transform computation - default role handling', async () => {
    /**
     * Test Plan for: User entity Transform
     * Dependencies: None (entity creation)
     * Steps: 1) Call CreateUser without role 2) Verify default role is applied
     * Business Logic: User created with default resident role when not specified
     */
    
    // Call CreateUser interaction without role
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'admin-user', role: 'admin' },
      payload: {
        username: 'defaultuser',
        password: 'pass789',
        email: 'default@example.com',
        name: 'Default User'
        // No role specified
      }
    })
    
    // Verify no errors
    expect(result.error).toBeUndefined()
    
    // Find created user
    const users = await system.storage.find('User', 
      MatchExp.atom({ key: 'username', value: ['=', 'defaultuser'] }),
      undefined,
      ['id', 'role']
    )
    
    expect(users.length).toBe(1)
    expect(users[0].role).toBe('resident') // Default role
  })

  test('Dormitory entity Transform computation - CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform
     * Dependencies: None (entity creation)
     * Steps: 1) Call CreateDormitory interaction 2) Verify Dormitory entity is created with correct properties
     * Business Logic: Dormitory created through CreateDormitory interaction with specified properties
     */
    
    // Call CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-user', role: 'admin' },
      payload: {
        name: 'Building A - Room 101',
        capacity: 4,
        floor: 1,
        building: 'A'
      }
    })
    
    // Verify no errors
    expect(result.error).toBeUndefined()
    
    // Find created dormitory
    const dormitories = await system.storage.find('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', 'Building A - Room 101'] }),
      undefined,
      ['id', 'name', 'capacity', 'floor', 'building', 'occupiedBeds', 'createdAt', 'isDeleted']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    
    // Verify dormitory properties
    expect(dormitory.name).toBe('Building A - Room 101')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.floor).toBe(1)
    expect(dormitory.building).toBe('A')
    expect(dormitory.occupiedBeds).toBe(0)
    expect(dormitory.isDeleted).toBe(false)
    expect(dormitory.createdAt).toBeGreaterThan(0)
  })

  test('Bed creation through Dormitory Transform (_parent:[Dormitory])', async () => {
    /**
     * Test Plan for: _parent:[Dormitory]
     * This tests that Bed entities are created when a Dormitory is created
     * Dependencies: Dormitory entity
     * Steps: 1) Create a Dormitory via CreateDormitory 2) Verify Bed entities are created 3) Verify DormitoryBedsRelation is created
     * Business Logic: When a dormitory is created, beds equal to its capacity are automatically created
     */
    
    // Create a dormitory with capacity 4
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-user', role: 'admin' },
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 2,
        building: 'B'
      }
    })
    
    // Verify dormitory was created
    const dormitories = await system.storage.find(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id', 'name', 'capacity']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    expect(dormitory.capacity).toBe(4)
    
    // Verify beds were created
    // Wait a bit for beds to be created
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const beds = await system.storage.find(
      'Bed',
      MatchExp.atom({ key: 'createdAt', value: ['>', 0] }), // Get all beds
      undefined,
      ['id', 'bedNumber', 'isOccupied', 'createdAt']
    )
    
    expect(beds.length).toBe(4) // Should have 4 beds for capacity 4
    
    // Verify bed numbers are correct
    const bedNumbers = beds.map(b => b.bedNumber).sort()
    expect(bedNumbers).toEqual(['1', '2', '3', '4'])
    
    // Verify all beds are initially unoccupied
    beds.forEach(bed => {
      expect(bed.isOccupied).toBe(false)
      expect(bed.createdAt).toBeGreaterThan(0)
    })
    
    // Verify DormitoryBedsRelation was created
    // Find the DormitoryBedsRelation from the relations array
    const DormitoryBedsRelation = relations.find(r => r.name === 'DormitoryBedsRelation')
    
    const dormitoryBedRelations = await system.storage.find(
      DormitoryBedsRelation!.name,
      MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'bedNumber'] }]
      ]
    )
    
    expect(dormitoryBedRelations.length).toBe(4) // Should have 4 relations
    
    // Verify each relation connects the dormitory to a bed
    dormitoryBedRelations.forEach(relation => {
      expect(relation.source.id).toBe(dormitory.id)
      expect(relation.target).toBeDefined()
      expect(relation.target.bedNumber).toBeDefined()
    })
  })
  
})
