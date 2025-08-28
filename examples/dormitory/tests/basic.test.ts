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

  test('User.id set by owner computation (_owner)', async () => {
    /**
     * Test Plan for: _owner
     * This tests that id is properly auto-generated when User is created
     * Dependencies: None (User is independently created)
     * Steps: 1) Trigger CreateUser interaction 2) Verify id is auto-generated and unique
     * Business Logic: User's id is auto-generated at creation by the system
     */
    
    // Create first user
    const result1 = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'user1',
        password: 'password123',
        email: 'user1@example.com',
        name: 'User One',
        role: 'resident'
      }
    })
    
    // Verify the interaction executed successfully
    expect(result1).toBeDefined()
    expect(result1.error).toBeUndefined()
    
    // Retrieve the created user
    const user1 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'user1'] }),
      undefined,
      ['id', 'username', 'email', 'name']
    )
    
    // Verify id was auto-generated
    expect(user1).toBeDefined()
    expect(user1.id).toBeDefined()
    expect(typeof user1.id).toBe('string')
    expect(user1.id.length).toBeGreaterThan(0)
    
    // Create second user to verify unique ids
    const result2 = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'user2',
        password: 'password456',
        email: 'user2@example.com',
        name: 'User Two'
      }
    })
    
    // Verify the interaction executed successfully
    expect(result2).toBeDefined()
    expect(result2.error).toBeUndefined()
    
    // Retrieve the second user
    const user2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'user2'] }),
      undefined,
      ['id', 'username', 'email', 'name']
    )
    
    // Verify second user has different id
    expect(user2).toBeDefined()
    expect(user2.id).toBeDefined()
    expect(typeof user2.id).toBe('string')
    expect(user2.id.length).toBeGreaterThan(0)
    expect(user2.id).not.toBe(user1.id) // Verify uniqueness
    
    // Verify we can query by id
    const userById = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user1.id] }),
      undefined,
      ['id', 'username']
    )
    
    expect(userById).toBeDefined()
    expect(userById.id).toBe(user1.id)
    expect(userById.username).toBe('user1')
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

  test('UserDormitoryLeaderRelation computation (StateMachine)', async () => {
    /**
     * Test Plan for: UserDormitoryLeaderRelation
     * Dependencies: User entity, Dormitory entity
     * Steps: 1) Create admin user 2) Create dormitory 3) Create user to be leader 4) Assign leader via AssignDormitoryLeader 5) Verify relation created 6) Remove leader via RemoveDormitoryLeader 7) Verify relation removed
     * Business Logic: UserDormitoryLeaderRelation is created/deleted through StateMachine triggered by AssignDormitoryLeader and RemoveDormitoryLeader interactions
     */
    
    // Create admin user
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
    
    // Create dormitory
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Leader Test Dorm',
        capacity: 4,
        floor: 2,
        building: 'Building A'
      }
    })
    expect(dormResult.error).toBeUndefined()
    
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Leader Test Dorm'] }),
      undefined,
      ['id', 'name']
    )
    
    // Create a user to be the leader
    const leaderResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'futureleader',
        password: 'leader123',
        email: 'futureleader@example.com',
        name: 'Future Leader',
        role: 'resident'  // Will be promoted when assigned
      }
    })
    expect(leaderResult.error).toBeUndefined()
    
    const futureLeader = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'futureleader'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Assign dormitory leader
    const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
      user: adminUser,
      payload: {
        userId: futureLeader.id,
        dormitoryId: dormitory.id
      }
    })
    expect(assignResult.error).toBeUndefined()
    
    // Verify UserDormitoryLeaderRelation was created
    const relationAfterAssign = await system.storage.findOne(
      'UserDormitoryLeaderRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', futureLeader.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'name'] }],
        'assignedAt'
      ]
    )
    
    expect(relationAfterAssign).toBeDefined()
    expect(relationAfterAssign.source.id).toBe(futureLeader.id)
    expect(relationAfterAssign.target.id).toBe(dormitory.id)
    expect(relationAfterAssign.assignedAt).toBeGreaterThan(0)
    
    // Remove dormitory leader
    const removeResult = await controller.callInteraction('RemoveDormitoryLeader', {
      user: adminUser,
      payload: {
        userId: futureLeader.id
      }
    })
    expect(removeResult.error).toBeUndefined()
    
    // Verify UserDormitoryLeaderRelation was removed
    const relationAfterRemove = await system.storage.findOne(
      'UserDormitoryLeaderRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', futureLeader.id] }),
      undefined,
      ['id']
    )
    
    expect(relationAfterRemove).toBeUndefined()
  })

  test('UserBedRelation computation (StateMachine)', async () => {
    /**
     * Test Plan for: UserBedRelation
     * Dependencies: User entity, Bed entity (created through Dormitory)
     * Steps: 1) Create admin and regular user 2) Create dormitory (which creates beds) 3) Assign user to bed via AssignUserToBed 4) Verify relation created 5) Remove user from bed via RemoveUserFromBed 6) Verify relation removed
     * Business Logic: UserBedRelation is created/deleted through StateMachine triggered by AssignUserToBed and RemoveUserFromBed interactions
     */
    
    // Create admin user
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'admin_bed_test',
        password: 'admin123',
        email: 'admin_bed@example.com',
        name: 'Admin User',
        role: 'admin'
      }
    })
    
    expect(adminResult.error).toBeUndefined()
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'admin_bed_test'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Create regular user to assign to bed
    const userResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'bed_resident',
        password: 'password123',
        email: 'bed_resident@example.com',
        name: 'Bed Resident',
        role: 'resident'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    
    const regularUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'bed_resident'] }),
      undefined,
      ['id', 'username']
    )
    
    // Create dormitory (which creates beds)
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Dorm for Bed Test',
        capacity: 4,
        floor: 2,
        building: 'Building B'
      }
    })
    
    expect(dormResult.error).toBeUndefined()
    
    // Get the first bed from the created dormitory
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm for Bed Test'] }),
      undefined,
      ['id']
    )
    
    const beds = await system.storage.find(
      'Bed',
      undefined,
      undefined,
      ['id', 'bedNumber']
    )
    
    const targetBed = beds.find(b => b.bedNumber === '1')
    expect(targetBed).toBeDefined()
    
    // Assign user to bed
    const assignResult = await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: regularUser.id,
        bedId: targetBed.id
      }
    })
    
    expect(assignResult.error).toBeUndefined()
    
    // Verify UserBedRelation was created with correct properties
    const relationAfterAssign = await system.storage.findOne(
      'UserBedRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', regularUser.id] }),
      undefined,
      [
        'id',
        'assignedAt',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'bedNumber'] }]
      ]
    )
    
    expect(relationAfterAssign).toBeDefined()
    expect(relationAfterAssign.source.id).toBe(regularUser.id)
    expect(relationAfterAssign.source.username).toBe('bed_resident')
    expect(relationAfterAssign.target.id).toBe(targetBed.id)
    expect(relationAfterAssign.target.bedNumber).toBe('1')
    expect(relationAfterAssign.assignedAt).toBeGreaterThan(0)
    
    // Remove user from bed
    const removeResult = await controller.callInteraction('RemoveUserFromBed', {
      user: adminUser,
      payload: {
        userId: regularUser.id
      }
    })
    
    expect(removeResult.error).toBeUndefined()
    
    // Verify UserBedRelation was deleted
    const relationAfterRemove = await system.storage.findOne(
      'UserBedRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', regularUser.id] }),
      undefined,
      ['id']
    )
    
    expect(relationAfterRemove).toBeUndefined()
  })

  test('UserPointDeductionsRelation creation through PointDeduction Transform (_parent:[PointDeduction])', async () => {
    /**
     * Test Plan for: _parent:[PointDeduction]
     * This tests the PointDeduction's Transform computation that creates UserPointDeductionsRelation
     * Dependencies: User entity, PointDeduction entity creation
     * Steps: 1) Create admin user 2) Create target user 3) Trigger DeductPoints interaction 4) Verify UserPointDeductionsRelation is created
     * Business Logic: PointDeduction's Transform creates UserPointDeductionsRelation when PointDeduction is created
     */
    
    // Create admin user who can deduct points
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'deduct_admin',
        password: 'admin123',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin'
      }
    })
    
    expect(adminResult.error).toBeUndefined()
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'deduct_admin'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Create a regular user to deduct points from
    const userResult = await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        username: 'target_user',
        password: 'user123',
        email: 'user@example.com',
        name: 'Target User',
        role: 'resident'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'target_user'] }),
      undefined,
      ['id', 'username', 'points']
    )
    
    expect(targetUser.points).toBe(100) // Initial points
    
    // Deduct points from the user
    const deductResult = await controller.callInteraction('DeductPoints', {
      user: adminUser,
      payload: {
        userId: targetUser.id,
        reason: 'Violation of dormitory rules',
        points: 10,
        description: 'Left trash in common area'
      }
    })
    
    expect(deductResult.error).toBeUndefined()
    
    // Verify PointDeduction was created
    const pointDeduction = await system.storage.findOne(
      'PointDeduction',
      MatchExp.atom({ key: 'reason', value: ['=', 'Violation of dormitory rules'] }),
      undefined,
      ['id', 'reason', 'points', 'description', 'createdBy', 'createdAt']
    )
    
    expect(pointDeduction).toBeDefined()
    expect(pointDeduction.points).toBe(10)
    expect(pointDeduction.description).toBe('Left trash in common area')
    expect(pointDeduction.createdBy).toBe(adminUser.id)
    expect(pointDeduction.createdAt).toBeGreaterThan(0)
    
    // Verify UserPointDeductionsRelation was created
    const relation = await system.storage.findOne(
      'UserPointDeductionsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', targetUser.id] })
        .and({ key: 'target.id', value: ['=', pointDeduction.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason', 'points'] }]
      ]
    )
    
    expect(relation).toBeDefined()
    expect(relation.source.id).toBe(targetUser.id)
    expect(relation.source.username).toBe('target_user')
    expect(relation.target.id).toBe(pointDeduction.id)
    expect(relation.target.reason).toBe('Violation of dormitory rules')
    expect(relation.target.points).toBe(10)
    
    // Create another point deduction to verify multiple relations
    const deductResult2 = await controller.callInteraction('DeductResidentPoints', {
      user: adminUser,
      payload: {
        userId: targetUser.id,
        reason: 'Late return',
        points: 5,
        description: 'Returned after curfew'
      }
    })
    
    expect(deductResult2.error).toBeUndefined()
    
    // Verify both UserPointDeductionsRelations exist
    const relations = await system.storage.find(
      'UserPointDeductionsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', targetUser.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'points'] }]
      ]
    )
    
    expect(relations.length).toBe(2)
    const totalPoints = relations.reduce((sum, rel) => sum + rel.target.points, 0)
    expect(totalPoints).toBe(15) // 10 + 5
  })

  test('UserRemovalRequestsRelation creation through RemovalRequest Transform (_parent:[RemovalRequest])', async () => {
    /**
     * Test Plan for: _parent:[RemovalRequest]
     * This tests the RemovalRequest's Transform computation that creates UserRemovalRequestsRelation
     * Dependencies: User entity, RemovalRequest entity creation
     * Steps: 1) Create admin user 2) Create dormitory leader 3) Create target user 4) Assign leader to dormitory 5) Trigger SubmitRemovalRequest interaction 6) Verify UserRemovalRequestsRelation is created
     * Business Logic: RemovalRequest's Transform creates UserRemovalRequestsRelation when RemovalRequest is created
     */
    
    // Create admin user who can assign dormitory leaders
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'removal_admin',
        password: 'admin123',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin'
      }
    })
    
    expect(adminResult.error).toBeUndefined()
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'removal_admin'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Create a dormitory
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Dorm-Removal-Test',
        capacity: 4,
        floor: 3,
        building: 'Building C'
      }
    })
    
    expect(dormResult.error).toBeUndefined()
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm-Removal-Test'] }),
      undefined,
      ['id', 'name']
    )
    
    // Create a user who will be dormitory leader
    const leaderResult = await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        username: 'dorm_leader_removal',
        password: 'password123',
        email: 'leader@example.com',
        name: 'Dormitory Leader',
        role: 'resident'
      }
    })
    
    expect(leaderResult.error).toBeUndefined()
    const leaderUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'dorm_leader_removal'] }),
      undefined,
      ['id', 'username', 'role']
    )
    
    // Create a target user who will be the subject of removal request
    const targetResult = await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        username: 'removal_target',
        password: 'password123',
        email: 'target@example.com',
        name: 'Target User',
        role: 'resident'
      }
    })
    
    expect(targetResult.error).toBeUndefined()
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'removal_target'] }),
      undefined,
      ['id', 'username']
    )
    
    // Assign the leader to the dormitory
    const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
      user: adminUser,
      payload: {
        userId: leaderUser.id,
        dormitoryId: dormitory.id
      }
    })
    
    expect(assignResult.error).toBeUndefined()
    
    // Now submit a removal request as the dormitory leader
    const removalResult = await controller.callInteraction('SubmitRemovalRequest', {
      user: leaderUser,
      payload: {
        userId: targetUser.id,
        reason: 'Repeated violation of dormitory rules'
      }
    })
    
    expect(removalResult.error).toBeUndefined()
    
    // Verify the RemovalRequest was created
    const removalRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Repeated violation of dormitory rules'] }),
      undefined,
      ['id', 'reason', 'status', 'createdAt']
    )
    
    expect(removalRequest).toBeDefined()
    expect(removalRequest.reason).toBe('Repeated violation of dormitory rules')
    expect(removalRequest.status).toBe('pending')
    expect(removalRequest.createdAt).toBeDefined()
    
    // Verify the UserRemovalRequestsRelation was created
    const relation = await system.storage.findOne(
      'UserRemovalRequestsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', targetUser.id] })
        .and({ key: 'target.id', value: ['=', removalRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )
    
    expect(relation).toBeDefined()
    expect(relation.source.id).toBe(targetUser.id)
    expect(relation.source.username).toBe('removal_target')
    expect(relation.target.id).toBe(removalRequest.id)
    expect(relation.target.reason).toBe('Repeated violation of dormitory rules')
    expect(relation.target.status).toBe('pending')
    
    // Also verify the DormitoryLeaderRemovalRequestsRelation was created
    const leaderRelation = await system.storage.findOne(
      'DormitoryLeaderRemovalRequestsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', leaderUser.id] })
        .and({ key: 'target.id', value: ['=', removalRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )
    
    expect(leaderRelation).toBeDefined()
    expect(leaderRelation.source.id).toBe(leaderUser.id)
    expect(leaderRelation.source.username).toBe('dorm_leader_removal')
    expect(leaderRelation.target.id).toBe(removalRequest.id)
    
    // Create another removal request to verify multiple relations can exist
    const targetResult2 = await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        username: 'removal_target2',
        password: 'password123',
        email: 'target2@example.com',
        name: 'Target User 2',
        role: 'resident'
      }
    })
    
    expect(targetResult2.error).toBeUndefined()
    const targetUser2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'removal_target2'] }),
      undefined,
      ['id', 'username']
    )
    
    const removalResult2 = await controller.callInteraction('SubmitRemovalRequest', {
      user: leaderUser,
      payload: {
        userId: targetUser2.id,
        reason: 'Damage to dormitory property'
      }
    })
    
    expect(removalResult2.error).toBeUndefined()
    
    // Verify both UserRemovalRequestsRelations exist for different users
    const relations = await system.storage.find(
      'UserRemovalRequestsRelation',
      undefined,
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'username'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )
    
    expect(relations.length).toBeGreaterThanOrEqual(2)
    
    // Verify the leader has submitted two removal requests
    const leaderRelations = await system.storage.find(
      'DormitoryLeaderRemovalRequestsRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', leaderUser.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )
    
    expect(leaderRelations.length).toBe(2)
  })

  test('User.username computation', async () => {
    /**
     * Test Plan for: User.username
     * Dependencies: User entity
     * Steps: 1) Create user with initial username 2) Update username 3) Verify changes
     * Business Logic: Username is set at creation and can be updated via UpdateUsername
     */
    
    // Step 1: Create a user with initial username
    const createResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'initialUsername',
        password: 'password123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'resident'
      }
    })
    
    // Find user by username since we know it's unique
    const userAfterCreate = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'initialUsername'] }),
      undefined,
      ['id', 'username']
    )
    expect(userAfterCreate).toBeDefined()
    expect(userAfterCreate?.username).toBe('initialUsername')
    
    const userId = userAfterCreate.id
    
    // Step 2: Update username
    const updateResult = await controller.callInteraction('UpdateUsername', {
      user: { id: userId },
      payload: {
        newUsername: 'updatedUsername'
      }
    })
    
    expect(updateResult.error).toBeUndefined()
    
    // Verify username was updated
    const userAfterUpdate = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'username']
    )
    
    expect(userAfterUpdate.username).toBe('updatedUsername')
    
    // Step 3: Update username again to verify state transition
    const updateResult2 = await controller.callInteraction('UpdateUsername', {
      user: { id: userId },
      payload: {
        newUsername: 'finalUsername'
      }
    })
    
    expect(updateResult2.error).toBeUndefined()
    
    // Verify username was updated again
    const userFinalState = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'username']
    )
    
    expect(userFinalState.username).toBe('finalUsername')
    
    // Step 4: Test Registration also sets username
    const regResult = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'registeredUser',
        password: 'password123',
        email: 'registered@example.com',
        name: 'Registered User'
      }
    })
    
    // Find the registered user by username
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'registeredUser'] }),
      undefined,
      ['id', 'username']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser?.username).toBe('registeredUser')
  })

  test('User.password computation', async () => {
    /**
     * Test Plan for: User.password
     * Dependencies: User entity
     * Steps: 1) Create user with initial password 2) Change password 3) Verify changes
     * Business Logic: Password is set at creation (CreateUser/Registration) and can be updated via ChangePassword
     */
    
    // Step 1: Create a user with initial password
    const createResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'passwordTestUser',
        password: 'initialPassword123',
        email: 'passtest@example.com',
        name: 'Password Test User',
        role: 'resident'
      }
    })
    
    expect(createResult.error).toBeUndefined()
    
    // Find the created user
    const userAfterCreate = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'passwordTestUser'] }),
      undefined,
      ['id', 'username', 'password']
    )
    
    expect(userAfterCreate).toBeDefined()
    expect(userAfterCreate?.password).toBe('initialPassword123') // In production, this should be hashed
    
    const userId = userAfterCreate.id
    
    // Step 2: Change password using ChangePassword interaction
    const changeResult = await controller.callInteraction('ChangePassword', {
      user: { id: userId },
      payload: {
        oldPassword: 'initialPassword123',
        newPassword: 'newPassword456'
      }
    })
    
    expect(changeResult.error).toBeUndefined()
    
    // Verify password was changed
    const userAfterChange = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'password']
    )
    
    expect(userAfterChange.password).toBe('newPassword456')
    
    // Step 3: Change password again to verify state transition
    const changeResult2 = await controller.callInteraction('ChangePassword', {
      user: { id: userId },
      payload: {
        oldPassword: 'newPassword456',
        newPassword: 'finalPassword789'
      }
    })
    
    expect(changeResult2.error).toBeUndefined()
    
    // Verify password was changed again
    const userFinalState = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'password']
    )
    
    expect(userFinalState.password).toBe('finalPassword789')
    
    // Step 4: Test Registration also sets password
    const regResult = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'registeredPassUser',
        password: 'registrationPassword',
        email: 'regpass@example.com',
        name: 'Registered Password User'
      }
    })
    
    expect(regResult.error).toBeUndefined()
    
    // Find the registered user
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'registeredPassUser'] }),
      undefined,
      ['id', 'password']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser?.password).toBe('registrationPassword')
  })

  test('User.email computation', async () => {
    /**
     * Test Plan for: User.email
     * Dependencies: User entity
     * Steps: 1) Create user with initial email 2) Update email via UpdateProfile 3) Verify changes
     * Business Logic: Email is set at creation (CreateUser/Registration) and can be updated via UpdateProfile
     */
    
    // Step 1: Create a user with initial email
    const createResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'emailTestUser',
        password: 'password123',
        email: 'initial@example.com',
        name: 'Email Test User',
        role: 'resident'
      }
    })
    
    expect(createResult.error).toBeUndefined()
    
    // Find the created user
    const userAfterCreate = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'emailTestUser'] }),
      undefined,
      ['id', 'username', 'email', 'name']
    )
    
    expect(userAfterCreate).toBeDefined()
    expect(userAfterCreate?.email).toBe('initial@example.com')
    
    const userId = userAfterCreate.id
    
    // Step 2: Update email using UpdateProfile interaction
    const updateResult = await controller.callInteraction('UpdateProfile', {
      user: { id: userId },
      payload: {
        email: 'updated@example.com',
        name: 'Updated Name' // UpdateProfile can update both email and name
      }
    })
    
    expect(updateResult.error).toBeUndefined()
    
    // Verify email was updated
    const userAfterUpdate = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'email', 'name']
    )
    
    expect(userAfterUpdate.email).toBe('updated@example.com')
    expect(userAfterUpdate.name).toBe('Updated Name')
    
    // Step 3: Update email again to verify state transition
    const updateResult2 = await controller.callInteraction('UpdateProfile', {
      user: { id: userId },
      payload: {
        email: 'final@example.com'
        // Not updating name this time, it should remain the same
      }
    })
    
    expect(updateResult2.error).toBeUndefined()
    
    // Verify email was updated again
    const userFinalState = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'email', 'name']
    )
    
    expect(userFinalState.email).toBe('final@example.com')
    expect(userFinalState.name).toBe('Updated Name') // Name should remain unchanged
    
    // Step 4: Test Registration also sets email
    const regResult = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'registeredEmailUser',
        password: 'password456',
        email: 'registered@example.com',
        name: 'Registered Email User'
      }
    })
    
    expect(regResult.error).toBeUndefined()
    
    // Find the registered user
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'registeredEmailUser'] }),
      undefined,
      ['id', 'email']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser?.email).toBe('registered@example.com')
  })

  test('User.role computation', async () => {
    /**
     * Test Plan for: User.role
     * Dependencies: User entity
     * Steps: 1) Create user with initial role 2) Assign as dormitory leader 3) Remove from dormitory leader 4) Promote to admin
     * Business Logic: Role transitions between resident, dormitoryLeader, and admin based on interactions
     */
    
    // Step 1: Create user with initial role as resident
    const createResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'roleTestUser',
        password: 'password123',
        email: 'roletest@example.com',
        name: 'Role Test User'
        // Not specifying role, should default to 'resident'
      }
    })
    
    expect(createResult.error).toBeUndefined()
    
    // Find the created user
    const initialUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'roleTestUser'] }),
      undefined,
      ['id', 'role']
    )
    
    expect(initialUser).toBeDefined()
    expect(initialUser.role).toBe('resident') // Default role
    const userId = initialUser.id
    
    // Step 2: Create user with explicit admin role via CreateUser
    const adminCreateResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'adminUser',
        password: 'adminpass',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' // Explicitly set admin role
      }
    })
    
    expect(adminCreateResult.error).toBeUndefined()
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'adminUser'] }),
      undefined,
      ['id', 'role']
    )
    
    expect(adminUser).toBeDefined()
    expect(adminUser.role).toBe('admin')
    
    // Step 3: Create a dormitory for dormitory leader assignment
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: null,
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })
    
    expect(dormResult.error).toBeUndefined()
    
    // Find the created dormitory
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id']
    )
    
    // Step 4: Assign user as dormitory leader
    const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
      user: null,
      payload: {
        userId: userId,
        dormitoryId: dormitory.id
      }
    })
    
    expect(assignResult.error).toBeUndefined()
    
    // Verify role changed to dormitoryLeader
    const leaderUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'role']
    )
    
    expect(leaderUser.role).toBe('dormitoryLeader')
    
    // Step 5: Remove user from dormitory leader position
    const removeResult = await controller.callInteraction('RemoveDormitoryLeader', {
      user: null,
      payload: {
        userId: userId
      }
    })
    
    expect(removeResult.error).toBeUndefined()
    
    // Verify role changed back to resident
    const residentUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'role']
    )
    
    expect(residentUser.role).toBe('resident')
    
    // Step 6: Promote user to admin
    const promoteResult = await controller.callInteraction('PromoteToAdmin', {
      user: null,
      payload: {
        userId: userId
      }
    })
    
    expect(promoteResult.error).toBeUndefined()
    
    // Verify role changed to admin
    const promotedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'role']
    )
    
    expect(promotedUser.role).toBe('admin')
    
    // Step 7: Test Registration always creates resident role
    const regResult = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'registeredRoleUser',
        password: 'password456',
        email: 'reguser@example.com',
        name: 'Registered User'
      }
    })
    
    expect(regResult.error).toBeUndefined()
    
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'registeredRoleUser'] }),
      undefined,
      ['id', 'role']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser.role).toBe('resident') // Registration always creates residents
  })

  test('User.points computation', async () => {
    /**
     * Test Plan for: User.points
     * Dependencies: User entity, PointDeduction entity
     * Steps: 1) Create user (initial 100 points) 2) Deduct points via DeductPoints 3) Deduct more points via DeductResidentPoints 4) Test boundary (cannot go below 0)
     * Business Logic: Points start at 100, reduced by DeductPoints/DeductResidentPoints, minimum 0
     */
    
    // Step 1: Create user and verify initial points
    const createResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'pointsTestUser',
        password: 'password123',
        email: 'points@example.com',
        name: 'Points Test User',
        role: 'resident'
      }
    })
    
    expect(createResult.error).toBeUndefined()
    
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'pointsTestUser'] }),
      undefined,
      ['id', 'username', 'points']
    )
    
    expect(user).toBeDefined()
    expect(user.points).toBe(100) // Initial points should be 100
    
    // Create an admin user to perform deductions
    const adminResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'adminForPoints',
        password: 'admin123',
        email: 'adminpoints@example.com',
        name: 'Admin For Points',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'adminForPoints'] }),
      undefined,
      ['id', 'role']
    )
    
    // Step 2: Deduct points using DeductPoints interaction (admin)
    const deductResult1 = await controller.callInteraction('DeductPoints', {
      user: adminUser,
      payload: {
        userId: user.id,
        points: 15,
        reason: 'Late return',
        description: 'Returned to dormitory after curfew'
      }
    })
    
    expect(deductResult1.error).toBeUndefined()
    
    // Check points after first deduction
    const userAfterDeduct1 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points']
    )
    
    expect(userAfterDeduct1.points).toBe(85) // 100 - 15 = 85
    
    // Step 3: Create a dormitory leader for testing DeductResidentPoints
    const leaderResult = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        username: 'leaderForPoints',
        password: 'leader123',
        email: 'leaderpoints@example.com',
        name: 'Leader For Points',
        role: 'dormitoryLeader'
      }
    })
    
    const leaderUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'leaderForPoints'] }),
      undefined,
      ['id', 'role']
    )
    
    // Deduct more points using DeductResidentPoints (dormitory leader)
    const deductResult2 = await controller.callInteraction('DeductResidentPoints', {
      user: leaderUser,
      payload: {
        userId: user.id,
        points: 25,
        reason: 'Noise violation',
        description: 'Playing loud music during quiet hours'
      }
    })
    
    expect(deductResult2.error).toBeUndefined()
    
    // Check points after second deduction
    const userAfterDeduct2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points']
    )
    
    expect(userAfterDeduct2.points).toBe(60) // 85 - 25 = 60
    
    // Step 4: Test boundary condition - try to deduct more points than available
    const deductResult3 = await controller.callInteraction('DeductPoints', {
      user: adminUser,
      payload: {
        userId: user.id,
        points: 100, // Try to deduct 100 points when user only has 60
        reason: 'Major violation',
        description: 'Serious breach of dormitory rules'
      }
    })
    
    expect(deductResult3.error).toBeUndefined()
    
    // Check points cannot go below 0
    const userAfterDeduct3 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'points']
    )
    
    expect(userAfterDeduct3.points).toBe(0) // Should be 0, not negative
    
    // Step 5: Test Registration also starts with 100 points
    const regResult = await controller.callInteraction('Registration', {
      user: null,
      payload: {
        username: 'registeredPointsUser',
        password: 'password456',
        email: 'regpoints@example.com',
        name: 'Registered Points User'
      }
    })
    
    expect(regResult.error).toBeUndefined()
    
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'username', value: ['=', 'registeredPointsUser'] }),
      undefined,
      ['id', 'points']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser.points).toBe(100) // Registration should also start with 100 points
  })

})
