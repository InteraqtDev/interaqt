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

  test('User entity Transform computation creates user via CreateUser interaction', async () => {
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: User entity, CreateUser interaction
     * Steps: 1) Trigger CreateUser interaction 2) Verify User entity is created 3) Verify properties are correct
     * Business Logic: Transform computation creates User entity when CreateUser interaction occurs
     */
    
    // Create user via interaction
    const result = await controller.callInteraction('createUser', {
      user: { id: 'admin' }, // Admin user triggering the creation
      payload: {
        name: 'John Doe',
        email: 'john@example.com',
        studentId: 'STU001',
        phone: '123-456-7890',
        role: 'user'
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any User records were created by querying the database
    const allUsers = await system.storage.find(
      'User',
      undefined,
      undefined,
      ['id', 'name', 'email', 'studentId', 'phone', 'points', 'role', 'createdAt', 'updatedAt', 'isDeleted']
    )

    // Get the created user ID from effects OR from database query
    let userCreateEffect = result.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    let createdUser
    
    if (userCreateEffect) {
      expect(userCreateEffect.record.id).toBeDefined()
      createdUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', userCreateEffect.record.id] }),
        undefined,
        ['id', 'name', 'email', 'studentId', 'phone', 'points', 'role', 'createdAt', 'updatedAt', 'isDeleted']
      )
    } else {
      // If no effect, try to find the created user by email (should be unique)
      createdUser = allUsers.find(user => user.email === 'john@example.com')
      expect(createdUser).toBeDefined()
    }

    expect(createdUser).toBeDefined()
    expect(createdUser.name).toBe('John Doe')
    expect(createdUser.email).toBe('john@example.com')
    expect(createdUser.studentId).toBe('STU001')
    expect(createdUser.phone).toBe('123-456-7890')
    expect(createdUser.points).toBe(100)
    expect(createdUser.role).toBe('user')
    expect(createdUser.isDeleted).toBe(false)
    expect(createdUser.createdAt).toBeDefined()
    expect(createdUser.updatedAt).toBeDefined()
  })

  test('User entity Transform computation handles optional phone and role', async () => {
    /**
     * Test Plan for: User entity Transform computation with optional fields
     * Dependencies: User entity, CreateUser interaction
     * Steps: 1) Trigger CreateUser without optional fields 2) Verify defaults are applied
     * Business Logic: Transform computation handles optional phone and role fields
     */
    
    // Create user without optional fields
    const result = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        studentId: 'STU002'
        // phone and role omitted
      }
    })

    expect(result.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any User records were created by querying the database
    const allUsers = await system.storage.find(
      'User',
      undefined,
      undefined,
      ['id', 'name', 'email', 'studentId', 'phone', 'role']
    )

    // Find the created user by email (should be unique)
    const createdUser = allUsers.find(user => user.email === 'jane@example.com')
    expect(createdUser).toBeDefined()

    expect(createdUser.name).toBe('Jane Smith')
    expect(createdUser.email).toBe('jane@example.com')
    expect(createdUser.studentId).toBe('STU002')
    expect(createdUser.phone).toBe('') // Default empty string
    expect(createdUser.role).toBe('user') // Default role
  })

  test('Dormitory entity Transform computation creates dormitory via CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation
     * Dependencies: Dormitory entity, CreateDormitory interaction
     * Steps: 1) Trigger CreateDormitory interaction 2) Verify Dormitory entity is created 3) Verify properties are correct
     * Business Logic: Transform computation creates Dormitory entity when CreateDormitory interaction occurs
     */
    
    // Create dormitory via interaction
    const result = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' }, // Admin user triggering the creation
      payload: {
        name: 'Building A Room 101',
        location: 'North Campus Building A',
        capacity: 4
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any Dormitory records were created by querying the database
    const allDormitories = await system.storage.find(
      'Dormitory',
      undefined,
      undefined,
      ['id', 'name', 'location', 'capacity', 'currentOccupancy', 'createdAt', 'updatedAt', 'isDeleted']
    )

    // Get the created dormitory ID from effects OR from database query
    let dormitoryCreateEffect = result.effects.find(effect => effect.recordName === 'Dormitory' && effect.type === 'create')
    let createdDormitory
    
    if (dormitoryCreateEffect) {
      expect(dormitoryCreateEffect.record.id).toBeDefined()
      createdDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitoryCreateEffect.record.id] }),
        undefined,
        ['id', 'name', 'location', 'capacity', 'currentOccupancy', 'createdAt', 'updatedAt', 'isDeleted']
      )
    } else {
      // If no effect, try to find the created dormitory by name (should be unique)
      createdDormitory = allDormitories.find(dorm => dorm.name === 'Building A Room 101')
      expect(createdDormitory).toBeDefined()
    }

    expect(createdDormitory).toBeDefined()
    expect(createdDormitory.name).toBe('Building A Room 101')
    expect(createdDormitory.location).toBe('North Campus Building A')
    expect(createdDormitory.capacity).toBe(4)
    expect(createdDormitory.currentOccupancy).toBe(0) // Initial occupancy should be 0
    expect(createdDormitory.isDeleted).toBe(false)
    expect(createdDormitory.createdAt).toBeDefined()
    expect(createdDormitory.updatedAt).toBeDefined()
  })

  test('Bed entity Transform computation creates bed via CreateBed interaction', async () => {
    /**
     * Test Plan for: Bed entity Transform computation
     * Dependencies: Bed entity, CreateBed interaction, Dormitory entity
     * Steps: 1) Create a dormitory first 2) Trigger CreateBed interaction 3) Verify Bed entity is created 4) Verify properties are correct
     * Business Logic: Transform computation creates Bed entity when CreateBed interaction occurs
     */
    
    // First create a dormitory (needed for dormitoryId reference)
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Building A',
        location: 'Test Campus',
        capacity: 4
      }
    })
    
    expect(dormitoryResult.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the created dormitory ID - check effects OR find in database
    let dormitoryId
    const dormitoryCreateEffect = dormitoryResult.effects.find(effect => effect.recordName === 'Dormitory' && effect.type === 'create')
    
    if (dormitoryCreateEffect && dormitoryCreateEffect.record.id) {
      dormitoryId = dormitoryCreateEffect.record.id
    } else {
      // If no effect, query the database to find the created dormitory
      const dormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      const createdDormitory = dormitories.find(dorm => dorm.name === 'Test Building A')
      expect(createdDormitory).toBeDefined()
      dormitoryId = createdDormitory.id
    }
    
    expect(dormitoryId).toBeDefined()
    
    // Now create bed via interaction
    const result = await controller.callInteraction('createBed', {
      user: { id: 'admin' }, // Admin user triggering the creation
      payload: {
        dormitoryId: dormitoryId,
        number: 'B001'
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any Bed records were created by querying the database
    const allBeds = await system.storage.find(
      'Bed',
      undefined,
      undefined,
      ['id', 'number', 'status', 'createdAt', 'updatedAt', 'isDeleted']
    )

    // Get the created bed ID from effects OR from database query
    let bedCreateEffect = result.effects.find(effect => effect.recordName === 'Bed' && effect.type === 'create')
    let createdBed
    
    if (bedCreateEffect) {
      expect(bedCreateEffect.record.id).toBeDefined()
      createdBed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', bedCreateEffect.record.id] }),
        undefined,
        ['id', 'number', 'status', 'createdAt', 'updatedAt', 'isDeleted']
      )
    } else {
      // If no effect, try to find the created bed by number (should be unique in this test)
      createdBed = allBeds.find(bed => bed.number === 'B001')
      expect(createdBed).toBeDefined()
    }

    expect(createdBed).toBeDefined()
    expect(createdBed.number).toBe('B001')
    expect(createdBed.status).toBe('vacant') // Initial status should be vacant
    expect(createdBed.isDeleted).toBe(false)
    expect(createdBed.createdAt).toBeDefined()
    expect(createdBed.updatedAt).toBeDefined()
  })
}) 