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

  // Phase 1: Entity Computation Tests
  
  test('User entity Transform computation - CreateUser interaction', async () => {
    /**
     * Test Plan for: User entity Transform
     * Dependencies: None (independent entity creation)
     * Steps: 1) Call CreateUser interaction 2) Verify User entity created with correct properties
     * Business Logic: Creates user with all provided fields and defaults
     */
    const result = await controller.callInteraction('CreateUser', {
      user: { role: 'admin' }, // Admin creating a user
      payload: {
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'resident'
      }
    })
    
    // Transform computations don't return data, they create entities as side effects
    // Check if the user was created
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'testuser'] }),
      undefined,
      ['id', 'username', 'email', 'name', 'role', 'points', 'isDeleted', 'createdAt']
    )
    
    expect(user).toBeDefined()
    expect(user.username).toBe('testuser')
    expect(user.email).toBe('test@example.com')
    expect(user.name).toBe('Test User')
    expect(user.role).toBe('resident')
    expect(user.points).toBe(100)
    expect(user.isDeleted).toBe(false)
    expect(user.createdAt).toBeGreaterThan(0)
  })
  
  test('User entity Transform computation - Registration interaction', async () => {
    /**
     * Test Plan for: User entity Transform via Registration
     * Dependencies: None (independent entity creation)
     * Steps: 1) Call Registration interaction 2) Verify User entity created with resident role
     * Business Logic: Creates user with resident role by default
     */
    await controller.callInteraction('Registration', {
      payload: {
        username: 'newresident',
        password: 'password456',
        email: 'resident@example.com',
        name: 'New Resident'
      }
    })
    
    // Transform computations don't return data, they create entities as side effects
    // Verify user was created with resident role
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'newresident'] }),
      undefined,
      ['id', 'username', 'role', 'points', 'isDeleted']
    )
    
    expect(user).toBeDefined()
    expect(user.username).toBe('newresident')
    expect(user.role).toBe('resident') // Always resident for Registration
    expect(user.points).toBe(100)
    expect(user.isDeleted).toBe(false)
  })
  
  test('Dormitory entity Transform computation - CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform
     * Dependencies: None (independent entity creation)
     * Steps: 1) Call CreateDormitory interaction 2) Verify Dormitory entity created
     * Business Logic: Creates dormitory with provided fields
     */
    await controller.callInteraction('CreateDormitory', {
      user: { role: 'admin' }, // Admin creating a dormitory
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 2,
        building: 'Building 1'
      }
    })
    
    // Transform computations don't return data, they create entities as side effects
    // Verify dormitory was created
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
      undefined,
      ['id', 'name', 'capacity', 'floor', 'building', 'isDeleted', 'occupiedBeds', 'createdAt']
    )
    
    expect(dormitory).toBeDefined()
    expect(dormitory.name).toBe('Dorm A')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.floor).toBe(2)
    expect(dormitory.building).toBe('Building 1')
    expect(dormitory.isDeleted).toBe(false)
    expect(dormitory.occupiedBeds).toBe(0)
    expect(dormitory.createdAt).toBeGreaterThan(0)
  })
  
  test('PointDeduction entity Transform computation - DeductPoints interaction', async () => {
    /**
     * Test Plan for: PointDeduction entity Transform
     * Dependencies: User entity must exist
     * Steps: 1) Create user 2) Call DeductPoints interaction 3) Verify PointDeduction created
     * Business Logic: Creates point deduction record with reason and points
     */
    // First create a user
    await controller.callInteraction('CreateUser', {
      user: { role: 'admin' },
      payload: {
        username: 'pointuser',
        password: 'password',
        email: 'point@example.com',
        name: 'Point User'
      }
    })
    
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'pointuser'] }),
      undefined,
      ['id']
    )
    
    // Deduct points
    await controller.callInteraction('DeductPoints', {
      user: { id: 'admin123', role: 'admin' },
      payload: {
        userId: user.id,
        points: 10,
        reason: 'Late return',
        description: 'Returned to dormitory after curfew'
      }
    })
    
    // Transform computations don't return data, they create entities as side effects
    // Verify point deduction was created
    const deduction = await system.storage.findOne(
      'PointDeduction',
      MatchExp.atom({ key: 'reason', value: ['=', 'Late return'] }),
      undefined,
      ['id', 'reason', 'points', 'description', 'createdBy', 'createdAt']
    )
    
    expect(deduction).toBeDefined()
    expect(deduction.reason).toBe('Late return')
    expect(deduction.points).toBe(10)
    expect(deduction.description).toBe('Returned to dormitory after curfew')
    expect(deduction.createdBy).toBe('admin123')
    expect(deduction.createdAt).toBeGreaterThan(0)
  })
  
  test('RemovalRequest entity Transform computation - SubmitRemovalRequest interaction', async () => {
    /**
     * Test Plan for: RemovalRequest entity Transform
     * Dependencies: User entities must exist (requester and target)
     * Steps: 1) Create users 2) Call SubmitRemovalRequest 3) Verify RemovalRequest created
     * Business Logic: Creates removal request with pending status
     */
    // Create dormitory leader
    await controller.callInteraction('CreateUser', {
      user: { role: 'admin' },
      payload: {
        username: 'dormleader',
        password: 'password',
        email: 'leader@example.com',
        name: 'Dorm Leader',
        role: 'dormitory_leader'
      }
    })
    
    // Create target user
    await controller.callInteraction('CreateUser', {
      user: { role: 'admin' },
      payload: {
        username: 'targetuser',
        password: 'password',
        email: 'target@example.com',
        name: 'Target User'
      }
    })
    
    const leader = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'dormleader'] }),
      undefined,
      ['id']
    )
    
    const target = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'targetuser'] }),
      undefined,
      ['id']
    )
    
    // Submit removal request
    await controller.callInteraction('SubmitRemovalRequest', {
      user: { id: leader.id, role: 'dormitory_leader' },
      payload: {
        userId: target.id,
        reason: 'Repeated violations of dormitory rules'
      }
    })
    
    // Transform computations don't return data, they create entities as side effects
    // Verify removal request was created
    const request = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Repeated violations of dormitory rules'] }),
      undefined,
      ['id', 'reason', 'status', 'createdAt', 'processedAt', 'adminComment']
    )
    
    expect(request).toBeDefined()
    expect(request.reason).toBe('Repeated violations of dormitory rules')
    expect(request.status).toBe('pending')
    expect(request.createdAt).toBeGreaterThan(0)
    expect(request.processedAt).toBeUndefined() // Not set during creation
    expect(request.adminComment).toBeUndefined() // Not set during creation
  })
}) 
