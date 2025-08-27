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

  test('PointDeduction entity creation via DeductPoints interaction', async () => {
    /**
     * Test Plan for: PointDeduction entity Transform computation
     * Dependencies: User entity
     * Steps: 1) Create test user 2) Create admin user 3) Trigger DeductPoints interaction 4) Verify PointDeduction entity is created with correct properties 5) Verify UserPointDeductionsRelation is created
     * Business Logic: PointDeduction entities are created via DeductPoints or DeductResidentPoints interactions
     */
    
    // First create a test user to deduct points from
    const userResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'testuser',
        password: 'password123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'resident'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    
    const testUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'testuser'] }),
      undefined,
      ['id', 'username', 'points']
    )
    
    // Create admin user who will perform the deduction
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
    
    expect(adminResult.error).toBeUndefined()
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'admin'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Perform point deduction
    const deductResult = await controller.callInteraction('DeductPoints', {
      user: adminUser,
      payload: {
        userId: testUser.id,
        points: 10,
        reason: 'Late return',
        description: 'Returned to dormitory after curfew'
      }
    })
    
    expect(deductResult.error).toBeUndefined()
    
    // Query the created PointDeduction entity
    const pointDeductions = await system.storage.find(
      'PointDeduction',
      undefined,
      undefined,
      ['id', 'reason', 'points', 'description', 'createdAt', 'createdBy']
    )
    
    expect(pointDeductions.length).toBe(1)
    const deduction = pointDeductions[0]
    
    expect(deduction.reason).toBe('Late return')
    expect(deduction.points).toBe(10)
    expect(deduction.description).toBe('Returned to dormitory after curfew')
    expect(deduction.createdAt).toBeGreaterThan(0)
    expect(deduction.createdBy).toBe(adminUser.id)
    
    // Verify UserPointDeductionsRelation was created
    const relations = await system.storage.find(
      'UserPointDeductionsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', testUser.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason', 'points'] }]
      ]
    )
    
    expect(relations.length).toBe(1)
    expect(relations[0].source.id).toBe(testUser.id)
    expect(relations[0].target.id).toBe(deduction.id)
    expect(relations[0].target.reason).toBe('Late return')
    expect(relations[0].target.points).toBe(10)
  })

  test('PointDeduction entity creation via DeductResidentPoints interaction', async () => {
    /**
     * Test Plan for: PointDeduction entity Transform computation via DeductResidentPoints
     * Dependencies: User entity
     * Steps: 1) Create test user 2) Create dormitory leader 3) Trigger DeductResidentPoints interaction 4) Verify PointDeduction entity is created
     * Business Logic: DeductResidentPoints also creates PointDeduction entities
     */
    
    // Create a test user to deduct points from
    const userResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@example.com',
        name: 'Resident User',
        role: 'resident'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    
    const testUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'resident2'] }),
      undefined,
      ['id', 'username']
    )
    
    // Create dormitory leader
    const leaderResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'leader',
        password: 'leader123', 
        email: 'leader@example.com',
        name: 'Dorm Leader',
        role: 'dormitory_leader'
      }
    })
    
    expect(leaderResult.error).toBeUndefined()
    
    const leaderUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'leader'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Perform point deduction via DeductResidentPoints
    const deductResult = await controller.callInteraction('DeductResidentPoints', {
      user: leaderUser,
      payload: {
        userId: testUser.id,
        points: 5,
        reason: 'Noise violation',
        description: 'Making loud noise after 10 PM'
      }
    })
    
    expect(deductResult.error).toBeUndefined()
    
    // Query the created PointDeduction entity
    const pointDeductions = await system.storage.find(
      'PointDeduction',
      MatchExp.atom({ key: 'reason', value: ['=', 'Noise violation'] }),
      undefined,
      ['id', 'reason', 'points', 'description', 'createdAt', 'createdBy']
    )
    
    expect(pointDeductions.length).toBe(1)
    const deduction = pointDeductions[0]
    
    expect(deduction.reason).toBe('Noise violation')
    expect(deduction.points).toBe(5)
    expect(deduction.description).toBe('Making loud noise after 10 PM')
    expect(deduction.createdAt).toBeGreaterThan(0)
    expect(deduction.createdBy).toBe(leaderUser.id)
  })

  test('RemovalRequest entity creation via SubmitRemovalRequest interaction', async () => {
    /**
     * Test Plan for: RemovalRequest entity Transform computation
     * Dependencies: User entities
     * Steps: 1) Create target user (resident) 2) Create dormitory leader 3) Trigger SubmitRemovalRequest interaction 4) Verify RemovalRequest entity is created with correct properties 5) Verify UserRemovalRequestsRelation and DormitoryLeaderRemovalRequestsRelation are created
     * Business Logic: RemovalRequest entities are created via SubmitRemovalRequest interaction with initial status 'pending'
     */
    
    // Create a resident user who will be the target of the removal request
    const residentResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'problemresident',
        password: 'password123',
        email: 'problem@example.com',
        name: 'Problem Resident',
        role: 'resident'
      }
    })
    
    expect(residentResult.error).toBeUndefined()
    
    const problemResident = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'problemresident'] }),
      undefined,
      ['id', 'username']
    )
    
    // Create dormitory leader who will submit the request
    const leaderResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'dormleader',
        password: 'leader123',
        email: 'dormleader@example.com',
        name: 'Dormitory Leader',
        role: 'dormitory_leader'
      }
    })
    
    expect(leaderResult.error).toBeUndefined()
    
    const dormLeader = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'dormleader'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Submit removal request
    const requestResult = await controller.callInteraction('SubmitRemovalRequest', {
      user: dormLeader,
      payload: {
        userId: problemResident.id,
        reason: 'Multiple violations of dormitory rules'
      }
    })
    
    expect(requestResult.error).toBeUndefined()
    
    // Query the created RemovalRequest entity
    const removalRequests = await system.storage.find(
      'RemovalRequest',
      undefined,
      undefined,
      ['id', 'reason', 'status', 'createdAt', 'processedAt', 'adminComment']
    )
    
    expect(removalRequests.length).toBe(1)
    const request = removalRequests[0]
    
    expect(request.reason).toBe('Multiple violations of dormitory rules')
    expect(request.status).toBe('pending')
    expect(request.createdAt).toBeGreaterThan(0)
    expect(request.processedAt).toBeUndefined()
    expect(request.adminComment).toBeUndefined()
    
    // Verify UserRemovalRequestsRelation was created (target user)
    const userRelations = await system.storage.find(
      'UserRemovalRequestsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', problemResident.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )
    
    expect(userRelations.length).toBe(1)
    expect(userRelations[0].source.id).toBe(problemResident.id)
    expect(userRelations[0].target.id).toBe(request.id)
    expect(userRelations[0].target.reason).toBe('Multiple violations of dormitory rules')
    expect(userRelations[0].target.status).toBe('pending')
    
    // Verify DormitoryLeaderRemovalRequestsRelation was created (requesting leader)
    const leaderRelations = await system.storage.find(
      'DormitoryLeaderRemovalRequestsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', dormLeader.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )
    
    expect(leaderRelations.length).toBe(1)
    expect(leaderRelations[0].source.id).toBe(dormLeader.id)
    expect(leaderRelations[0].target.id).toBe(request.id)
    expect(leaderRelations[0].target.reason).toBe('Multiple violations of dormitory rules')
    expect(leaderRelations[0].target.status).toBe('pending')
  })

})
