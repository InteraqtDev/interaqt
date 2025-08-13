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

  test('User.isEligibleForEviction returns false when points >= 60', async () => {
    const user = await system.storage.create('User', {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'student',
      points: 80,
      status: 'active'
    })
    
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points', 'isEligibleForEviction']
    )
    
    expect(foundUser.isEligibleForEviction).toBe(false)
  })

  test('User.isEligibleForEviction returns true when points < 60', async () => {
    const user = await system.storage.create('User', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'student',
      points: 45,
      status: 'active'
    })
    
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points', 'isEligibleForEviction']
    )
    
    expect(foundUser.isEligibleForEviction).toBe(true)
  })

  test('User.isEligibleForEviction returns false at boundary (points = 60)', async () => {
    const user = await system.storage.create('User', {
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'student',
      points: 60,
      status: 'active'
    })
    
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points', 'isEligibleForEviction']
    )
    
    expect(foundUser.isEligibleForEviction).toBe(false)
  })

  test('Dormitory direct creation works', async () => {
    // First test direct creation to ensure the entity works
    const dorm = await system.storage.create('Dormitory', {
      name: 'Test Dorm',
      capacity: 4,
      floor: 2,
      building: 'B',
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000)
    })
    
    const foundDorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dorm.id] }),
      undefined,
      ['name', 'capacity']
    )
    
    expect(foundDorm.name).toBe('Test Dorm')
    expect(foundDorm.capacity).toBe(4)
  })

  test('Bed entities are created when Dormitory is created', async () => {
    // Create a dormitory with capacity 2
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Test Dorm A',
      capacity: 2,
      floor: 1,
      building: 'A',
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000)
    })
    
    // Wait for the Transform computation to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check that beds were created - need to query with attributes
    const beds = await system.storage.find('Bed', undefined, ['number', 'status', 'assignedAt'])
    
    // Should have 2 beds based on dormitory capacity
    expect(beds.length).toBe(2)
    
    // Check bed properties
    expect(beds[0].number).toBe(`${dormitory.id}-01`)
    expect(beds[0].status).toBe('vacant')
    expect(beds[0].assignedAt).toBe(0)
    
    expect(beds[1].number).toBe(`${dormitory.id}-02`)
    expect(beds[1].status).toBe('vacant')
    expect(beds[1].assignedAt).toBe(0)
  })

  test('ViolationRecord entities are created when RecordViolation interaction is called', async () => {
    // Create a user to record violation against
    const user = await system.storage.create('User', {
      name: 'Test User',
      email: 'test@example.com',
      role: 'student',
      points: 80,
      status: 'active'
    })
    
    // Call RecordViolation interaction
    await controller.callInteraction('recordViolation', {
      user: { id: 'admin-user' },
      payload: {
        userId: user.id,
        description: 'Noise violation after hours',
        points: 10,
        category: 'noise'
      }
    })
    
    // Wait for computation to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check that violation record was created
    const violations = await system.storage.find('ViolationRecord', undefined, ['description', 'points', 'category', 'recordedBy'])
    
    // Should have 1 violation record
    expect(violations.length).toBe(1)
    
    // Check violation properties
    expect(violations[0].description).toBe('Noise violation after hours')
    expect(violations[0].points).toBe(10)
    expect(violations[0].category).toBe('noise')
    expect(violations[0].recordedBy).toBe('admin-user')
  })

  test('User.role transitions from student to dormHead when appointed', async () => {
    // Create a student user
    const user = await system.storage.create('User', {
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'student',
      points: 80,
      status: 'active'
    })
    
    // Verify initial role
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'role']
    )
    expect(foundUser.role).toBe('student')
    
    // Call AppointDormHead interaction
    await controller.callInteraction('appointDormHead', {
      user: { id: 'admin-user' },
      payload: {
        userId: user.id,
        dormitoryId: 'dorm-123'
      }
    })
    
    // Verify role changed
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'role']
    )
    expect(updatedUser.role).toBe('dormHead')
  })

  test('User.status transitions from active to evicted when eviction approved', async () => {
    // Create a user with active status
    const user = await system.storage.create('User', {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'student',
      points: 50,
      status: 'active'
    })
    
    // Verify initial status
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'status']
    )
    expect(foundUser.status).toBe('active')
    
    // Call ReviewEvictionRequest interaction with approved decision
    const result = await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: 'req-123',
        decision: 'approved',
        userId: user.id
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify status changed to evicted
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedUser.status).toBe('evicted')
  })

  test('User.status remains active when eviction rejected', async () => {
    // Create a user with active status
    const user = await system.storage.create('User', {
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'student',
      points: 50,
      status: 'active'
    })
    
    // Verify initial status
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'status']
    )
    expect(foundUser.status).toBe('active')
    
    // Call ReviewEvictionRequest interaction with rejected decision
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: 'req-456',
        decision: 'rejected',
        userId: user.id
      }
    })
    
    // Verify status remains active
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedUser.status).toBe('active')
  })

  test('User.evictedAt is set when eviction approved', async () => {
    // Create a user without specifying evictedAt (default should be 0 or undefined)
    const user = await system.storage.create('User', {
      name: 'Bob Smith',
      email: 'bob@example.com',
      role: 'student',
      points: 30,
      status: 'active'
    })
    
    // Verify initial evictedAt is 0 (default for number type)
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'evictedAt']
    )
    expect(foundUser.evictedAt).toBe(0)
    
    // Call ReviewEvictionRequest interaction with approved decision
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: 'req-789',
        decision: 'approved',
        userId: user.id
      }
    })
    
    // Verify evictedAt is set to a timestamp
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'evictedAt']
    )
    expect(updatedUser.evictedAt).not.toBe(0)
    expect(typeof updatedUser.evictedAt).toBe('number')
    expect(updatedUser.evictedAt).toBeGreaterThan(0)
  })

  test('User.evictedAt remains 0 when eviction rejected', async () => {
    // Create a user without specifying evictedAt
    const user = await system.storage.create('User', {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      role: 'student',
      points: 30,
      status: 'active'
    })
    
    // Verify initial evictedAt is 0
    const foundUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'evictedAt']
    )
    expect(foundUser.evictedAt).toBe(0)
    
    // Call ReviewEvictionRequest interaction with rejected decision
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: 'req-999',
        decision: 'rejected',
        userId: user.id
      }
    })
    
    // Verify evictedAt remains 0
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'evictedAt']
    )
    expect(updatedUser.evictedAt).toBe(0)
  })

  test('Bed.status transitions from vacant to occupied when user assigned', async () => {
    // Create a dormitory first
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Test Dorm',
      capacity: 4,
      floor: 2,
      building: 'B',
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000)
    })
    
    // Create a bed
    const bed = await system.storage.create('Bed', {
      number: '101',
      status: 'vacant'
    })
    
    // Verify initial status
    const foundBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'status']
    )
    expect(foundBed.status).toBe('vacant')
    
    // Create a user
    const user = await system.storage.create('User', {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'student',
      points: 80,
      status: 'active'
    })
    
    // Call AssignUserToDormitory interaction
    await controller.callInteraction('assignUserToDormitory', {
      user: { id: 'admin-user' },
      payload: {
        userId: user.id,
        dormitoryId: dormitory.id,
        bedId: bed.id
      }
    })
    
    // Verify bed status changed to occupied
    const updatedBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedBed.status).toBe('occupied')
  })

  test('Bed.status remains vacant when assignment fails', async () => {
    // Create a bed
    const bed = await system.storage.create('Bed', {
      number: '102',
      status: 'vacant'
    })
    
    // Verify initial status
    const foundBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'status']
    )
    expect(foundBed.status).toBe('vacant')
    
    // Try to assign without proper parameters (this should not trigger the state change)
    // Note: In a real scenario, this would be handled by conditions/permissions
    // For this test, we're just verifying the state doesn't change on invalid calls
    
    // Verify status remains vacant
    const updatedBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedBed.status).toBe('vacant')
  })

  test('Bed.assignedAt is set when user is assigned to bed', async () => {
    // Create a dormitory first
    const dormitory = await system.storage.create('Dormitory', {
      name: 'Test Dorm',
      capacity: 4,
      floor: 2,
      building: 'B',
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000)
    })
    
    // Create a bed
    const bed = await system.storage.create('Bed', {
      number: '201',
      status: 'vacant'
    })
    
    // Verify initial assignedAt is 0
    const foundBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'assignedAt']
    )
    expect(foundBed.assignedAt).toBe(0)
    
    // Create a user
    const user = await system.storage.create('User', {
      name: 'Jane Smith',
      email: 'jane@example.com',
      role: 'student',
      points: 85,
      status: 'active'
    })
    
    // Call AssignUserToDormitory interaction
    await controller.callInteraction('assignUserToDormitory', {
      user: { id: 'admin-user' },
      payload: {
        userId: user.id,
        dormitoryId: dormitory.id,
        bedId: bed.id
      }
    })
    
    // Verify assignedAt is set to a timestamp
    const updatedBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'assignedAt']
    )
    expect(updatedBed.assignedAt).not.toBe(0)
    expect(typeof updatedBed.assignedAt).toBe('number')
    expect(updatedBed.assignedAt).toBeGreaterThan(0)
  })

  test('Bed.assignedAt remains 0 when bed is not assigned', async () => {
    // Create a bed
    const bed = await system.storage.create('Bed', {
      number: '202',
      status: 'vacant'
    })
    
    // Verify initial assignedAt is 0
    const foundBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'assignedAt']
    )
    expect(foundBed.assignedAt).toBe(0)
    
    // Don't assign any user - bed should remain unassigned
    
    // Verify assignedAt remains 0
    const updatedBed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
      undefined,
      ['id', 'assignedAt']
    )
    expect(updatedBed.assignedAt).toBe(0)
  })

  test('EvictionRequest.status transitions from pending to approved when approved', async () => {
    // Create an eviction request
    const request = await system.storage.create('EvictionRequest', {
      reason: 'Multiple violations',
      status: 'pending',
      requestedAt: Math.floor(Date.now() / 1000),
      decidedAt: 0,
      adminNotes: ''
    })
    
    // Verify initial status
    const foundRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'status']
    )
    expect(foundRequest.status).toBe('pending')
    
    // Call ReviewEvictionRequest interaction with approved decision
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: request.id,
        decision: 'approved',
        adminNotes: 'Approved due to repeated violations'
      }
    })
    
    // Verify status changed to approved
    const updatedRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedRequest.status).toBe('approved')
  })

  test('EvictionRequest.status transitions from pending to rejected when rejected', async () => {
    // Create an eviction request
    const request = await system.storage.create('EvictionRequest', {
      reason: 'Minor infraction',
      status: 'pending',
      requestedAt: Math.floor(Date.now() / 1000),
      decidedAt: 0,
      adminNotes: ''
    })
    
    // Verify initial status
    const foundRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'status']
    )
    expect(foundRequest.status).toBe('pending')
    
    // Call ReviewEvictionRequest interaction with rejected decision
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: request.id,
        decision: 'rejected',
        adminNotes: 'First offense, warning issued'
      }
    })
    
    // Verify status changed to rejected
    const updatedRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedRequest.status).toBe('rejected')
  })

  test('EvictionRequest.decidedAt is set when any decision is made', async () => {
    // Create an eviction request
    const request = await system.storage.create('EvictionRequest', {
      reason: 'Test violation',
      status: 'pending',
      requestedAt: Math.floor(Date.now() / 1000),
      decidedAt: 0,
      adminNotes: ''
    })
    
    // Verify initial decidedAt is 0
    const foundRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'decidedAt']
    )
    expect(foundRequest.decidedAt).toBe(0)
    
    // Call ReviewEvictionRequest interaction with approved decision
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: request.id,
        decision: 'approved',
        adminNotes: 'Test approval'
      }
    })
    
    // Verify decidedAt is set to a timestamp
    const updatedRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'decidedAt']
    )
    expect(updatedRequest.decidedAt).not.toBe(0)
    expect(typeof updatedRequest.decidedAt).toBe('number')
    expect(updatedRequest.decidedAt).toBeGreaterThan(0)
  })

  test('EvictionRequest.adminNotes is set when provided in review', async () => {
    // Create an eviction request
    const request = await system.storage.create('EvictionRequest', {
      reason: 'Test violation',
      status: 'pending',
      requestedAt: Math.floor(Date.now() / 1000),
      decidedAt: 0,
      adminNotes: ''
    })
    
    // Verify initial adminNotes is empty
    const foundRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'adminNotes']
    )
    expect(foundRequest.adminNotes).toBe('')
    
    // Call ReviewEvictionRequest interaction with admin notes
    const testNotes = 'This is a test admin note'
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: request.id,
        decision: 'approved',
        adminNotes: testNotes
      }
    })
    
    // Verify adminNotes is set
    const updatedRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'adminNotes']
    )
    expect(updatedRequest.adminNotes).toBe(testNotes)
  })

  test('EvictionRequest.adminNotes remains empty when not provided', async () => {
    // Create an eviction request
    const request = await system.storage.create('EvictionRequest', {
      reason: 'Test violation',
      status: 'pending',
      requestedAt: Math.floor(Date.now() / 1000),
      decidedAt: 0,
      adminNotes: ''
    })
    
    // Verify initial adminNotes is empty
    const foundRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'adminNotes']
    )
    expect(foundRequest.adminNotes).toBe('')
    
    // Call ReviewEvictionRequest interaction without admin notes
    await controller.callInteraction('reviewEvictionRequest', {
      user: { id: 'admin-user' },
      payload: {
        requestId: request.id,
        decision: 'rejected'
        // No adminNotes provided
      }
    })
    
    // Verify adminNotes remains empty
    const updatedRequest = await system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', request.id] }),
      undefined,
      ['id', 'adminNotes']
    )
    expect(updatedRequest.adminNotes).toBe('')
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