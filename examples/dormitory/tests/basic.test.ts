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
      ignorePermission: true
    })

    await controller.setup(true)
  })

  test('User entity computation - CreateUser interaction creates user with initial values', async () => {
    // Call CreateUser interaction
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'John Doe',
        email: 'john@example.com',
        role: 'student'
      }
    })

    // Verify interaction succeeded
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects!.length).toBeGreaterThan(0)

    // Find the created user
    const user = await system.storage.findOne('User',
      MatchExp.atom({ key: 'email', value: ['=', 'john@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'role', 'status', 'points', 'createdAt']
    )

    // Verify all initial values are set correctly
    expect(user).toBeDefined()
    expect(user.name).toBe('John Doe')
    expect(user.email).toBe('john@example.com')
    expect(user.role).toBe('student')
    expect(user.status).toBe('active')
    expect(user.points).toBe(100)
    expect(user.createdAt).toBeDefined()
    expect(typeof user.createdAt).toBe('number')
  })

  test('User.status StateMachine - should have correct initial status', async () => {
    // Create a student user
    const createUserResult = await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'student'
      }
    })

    expect(createUserResult.error).toBeUndefined()

    // Find the created user and check initial status
    const user = await system.storage.findOne('User',
      MatchExp.atom({ key: 'email', value: ['=', 'jane@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'role', 'status', 'points', 'createdAt']
    )

    expect(user).toBeDefined()
    expect(user.name).toBe('Jane Smith')
    expect(user.email).toBe('jane@example.com')
    expect(user.role).toBe('student')
    expect(user.status).toBe('active')  // Default state from StateMachine
    expect(user.points).toBe(100)
    expect(user.createdAt).toBeDefined()
  })

  test('User.points Custom computation - should calculate points correctly', async () => {
    // Create a student user
    const createUserResult = await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        role: 'student'
      }
    })

    expect(createUserResult.error).toBeUndefined()

    // Get the created user
    const user = await system.storage.findOne('User',
      MatchExp.atom({ key: 'email', value: ['=', 'bob@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'points']
    )

    expect(user).toBeDefined()
    expect(user.points).toBe(100)  // Initial points

    // Deduct 10 points
    const deductResult = await controller.callInteraction('DeductPoints', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        userId: user.id,
        points: 10,
        reason: 'Late for curfew'
      }
    })

    expect(deductResult.error).toBeUndefined()

    // Check that points were updated
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points']
    )

    expect(updatedUser.points).toBe(90)  // 100 - 10 = 90

    // Deduct another 20 points
    await controller.callInteraction('DeductPoints', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        userId: user.id,
        points: 20,
        reason: 'Noise violation'
      }
    })

    // Check final points
    const finalUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points']
    )

    expect(finalUser.points).toBe(70)  // 100 - 10 - 20 = 70
  })

  test('Dormitory entity computation - CreateDormitory interaction creates dormitory with initial values', async () => {
    // Call CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Dorm A',
        capacity: 4
      }
    })

    // Verify interaction succeeded
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects!.length).toBeGreaterThan(0)

    // Find the created dormitory
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
      undefined,
      ['id', 'name', 'capacity', 'status', 'createdAt']
    )

    // Verify all initial values are set correctly
    expect(dormitory).toBeDefined()
    expect(dormitory.name).toBe('Dorm A')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.status).toBe('active')
    expect(dormitory.createdAt).toBeDefined()
    expect(typeof dormitory.createdAt).toBe('number')
  })

  test('Bed entity computation - automatically creates beds when dormitory is created', async () => {
    // Create a dormitory with capacity 4
    const createResult = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Dorm B',
        capacity: 4
      }
    })

    expect(createResult.error).toBeUndefined()

    // Find the created dormitory
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm B'] }),
      undefined,
      ['id', 'capacity']
    )

    expect(dormitory).toBeDefined()
    expect(dormitory.capacity).toBe(4)

    // Check that beds were created automatically
    const beds = await system.storage.find('Bed',
      undefined, // No filter - get all beds
      undefined, // No sort
      ['id', 'bedNumber', 'status', 'dormitory']
    )

    // Should have 4 beds for this dormitory
    const dormBeds = beds.filter(bed => bed.dormitory.id === dormitory.id)
    expect(dormBeds.length).toBe(4)

    // Check bed numbers are 1-4
    const bedNumbers = dormBeds.map(bed => bed.bedNumber).sort()
    expect(bedNumbers).toEqual([1, 2, 3, 4])

    // All beds should be available initially
    dormBeds.forEach(bed => {
      expect(bed.status).toBe('available')
    })
  })

  test('Bed.status StateMachine - should transition from available to occupied when user assigned', async () => {
    // Create a dormitory
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Dorm C',
        capacity: 2
      }
    })

    expect(dormResult.error).toBeUndefined()

    // Get the created dormitory to find its ID
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm C'] }),
      undefined,
      ['id']
    )

    expect(dormitory).toBeDefined()

    // Get all beds and find one from this dormitory
    const allBeds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', 'dormitory']
    )
    
    // Find beds belonging to this dormitory
    const bed = allBeds.find(b => b.dormitory?.id === dormitory.id)

    expect(bed).toBeDefined()
    expect(bed.status).toBe('available')

    // Create a user
    const userResult = await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Alice Smith',
        email: 'alice@example.com',
        role: 'student'
      }
    })

    expect(userResult.error).toBeUndefined()

    // Get the created user
    const user = await system.storage.findOne('User',
      MatchExp.atom({ key: 'email', value: ['=', 'alice@example.com'] }),
      undefined,
      ['id']
    )

    // Assign user to the bed
    const assignResult = await controller.callInteraction('AssignUserToBed', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        userId: user.id,
        bedId: bed.id
      }
    })

    expect(assignResult.error).toBeUndefined()

    // Check that bed status changed to occupied
    const updatedBed = await system.storage.findOne('Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'status']
    )

    expect(updatedBed.status).toBe('occupied')
  })

  test('EvictionRequest.status StateMachine - should transition from pending to approved when approved', async () => {
    // Create a user
    const userResult = await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        role: 'student'
      }
    })

    expect(userResult.error).toBeUndefined()

    // Get the created user
    const user = await system.storage.findOne('User',
      MatchExp.atom({ key: 'email', value: ['=', 'bob@example.com'] }),
      undefined,
      ['id']
    )

    // Request eviction
    const requestResult = await controller.callInteraction('RequestEviction', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        userId: user.id,
        reason: 'Multiple violations'
      }
    })

    expect(requestResult.error).toBeUndefined()

    // Get the created request
    const request = await system.storage.findOne('EvictionRequest',
      undefined, // Get the first one
      undefined,
      ['id', 'status']
    )

    expect(request).toBeDefined()
    expect(request.status).toBe('pending')

    // Approve the request
    const approveResult = await controller.callInteraction('ApproveEviction', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        requestId: request.id
      }
    })

    expect(approveResult.error).toBeUndefined()

    // Check that status changed to approved
    const updatedRequest = await system.storage.findOne('EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'status']
    )

    expect(updatedRequest.status).toBe('approved')
  })

  test('EvictionRequest.processedAt StateMachine - should set timestamp when request is processed', async () => {
    // Create a user
    const userResult = await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        name: 'Charlie Brown',
        email: 'charlie@example.com',
        role: 'student'
      }
    })

    expect(userResult.error).toBeUndefined()

    // Get the created user
    const user = await system.storage.findOne('User',
      MatchExp.atom({ key: 'email', value: ['=', 'charlie@example.com'] }),
      undefined,
      ['id']
    )

    // Request eviction
    const requestResult = await controller.callInteraction('RequestEviction', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        userId: user.id,
        reason: 'Multiple violations'
      }
    })

    expect(requestResult.error).toBeUndefined()

    // Get the created request
    const request = await system.storage.findOne('EvictionRequest',
      undefined, // Get the first one
      undefined,
      ['id', 'processedAt']
    )

    expect(request).toBeDefined()
    expect(request.processedAt).toBeNull() // Should be null when pending

    // Approve the request
    const approveResult = await controller.callInteraction('ApproveEviction', {
      user: { id: 'admin1', name: 'Admin User', email: 'admin@test.com', role: 'admin' },
      payload: {
        requestId: request.id
      }
    })

    expect(approveResult.error).toBeUndefined()

    // Check that processedAt was set
    const updatedRequest = await system.storage.findOne('EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'processedAt']
    )

    expect(updatedRequest.processedAt).toBeDefined()
    expect(typeof updatedRequest.processedAt).toBe('number')
    expect(updatedRequest.processedAt).toBeGreaterThan(0) // Should be a valid timestamp
  })
}) 

describe('Permission and Business Rules', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      activities,
      dict: dicts,
    })

    await controller.setup(true)
  })

  test('placeholder - will add tests later', async () => {
    // Placeholder test to avoid empty suite error
    expect(true).toBe(true)
  })
})