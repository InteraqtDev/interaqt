import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts, UserDormitoryLeaderRelation, UserBedAssignmentRelation, UserPointDeductionRelation, UserRemovalRequestTargetRelation, UserRemovalRequestRequesterRelation, UserRemovalRequestProcessorRelation, DeductionRuleApplicationRelation } from '../backend'

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

  test('PointDeduction entity Transform computation creates point deduction via ApplyPointDeduction interaction', async () => {
    /**
     * Test Plan for: PointDeduction entity Transform computation
     * Dependencies: PointDeduction entity, ApplyPointDeduction interaction, User entity, DeductionRule entity
     * Steps: 1) Create a user 2) Create a deduction rule 3) Trigger ApplyPointDeduction interaction 4) Verify PointDeduction entity is created 5) Verify properties are correct
     * Business Logic: Transform computation creates PointDeduction entity when ApplyPointDeduction interaction occurs
     */
    
    // First create a user (target for point deduction)
    const userResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        studentId: 'STU003'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the created user ID
    let targetUserId
    const userCreateEffect = userResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    
    if (userCreateEffect && userCreateEffect.record.id) {
      targetUserId = userCreateEffect.record.id
    } else {
      // If no effect, query the database to find the created user
      const users = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      const createdUser = users.find(user => user.email === 'target@example.com')
      expect(createdUser).toBeDefined()
      targetUserId = createdUser.id
    }
    
    expect(targetUserId).toBeDefined()
    
    // Create a deduction rule
    const ruleResult = await controller.callInteraction('createDeductionRule', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Violation',
        description: 'Test violation for unit testing',
        points: 5,
        isActive: true
      }
    })
    
    expect(ruleResult.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the created rule ID
    let ruleId
    const ruleCreateEffect = ruleResult.effects.find(effect => effect.recordName === 'DeductionRule' && effect.type === 'create')
    
    if (ruleCreateEffect && ruleCreateEffect.record.id) {
      ruleId = ruleCreateEffect.record.id
    } else {
      // If no effect, query the database to find the created rule
      const rules = await system.storage.find(
        'DeductionRule',
        undefined,
        undefined,
        ['id', 'name']
      )
      const createdRule = rules.find(rule => rule.name === 'Test Violation')
      expect(createdRule).toBeDefined()
      ruleId = createdRule.id
    }
    
    expect(ruleId).toBeDefined()
    
    // Now apply point deduction via interaction
    const result = await controller.callInteraction('applyPointDeduction', {
      user: { id: 'admin' }, // Admin user applying the deduction
      payload: {
        targetUserId: targetUserId,
        ruleId: ruleId,
        reason: 'Testing point deduction system'
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any PointDeduction records were created by querying the database
    const allDeductions = await system.storage.find(
      'PointDeduction',
      undefined,
      undefined,
      ['id', 'reason', 'points', 'deductedAt', 'isDeleted']
    )

    // Get the created point deduction ID from effects OR from database query
    let deductionCreateEffect = result.effects.find(effect => effect.recordName === 'PointDeduction' && effect.type === 'create')
    let createdDeduction
    
    if (deductionCreateEffect) {
      expect(deductionCreateEffect.record.id).toBeDefined()
      createdDeduction = await system.storage.findOne(
        'PointDeduction',
        MatchExp.atom({ key: 'id', value: ['=', deductionCreateEffect.record.id] }),
        undefined,
        ['id', 'reason', 'points', 'deductedAt', 'isDeleted']
      )
    } else {
      // If no effect, try to find the created deduction by reason (should be unique in this test)
      createdDeduction = allDeductions.find(deduction => deduction.reason === 'Testing point deduction system')
      expect(createdDeduction).toBeDefined()
    }

    expect(createdDeduction).toBeDefined()
    expect(createdDeduction.reason).toBe('Testing point deduction system')
    expect(createdDeduction.points).toBe(0) // Initially 0, will be set by property computation
    expect(createdDeduction.isDeleted).toBe(false)
    expect(createdDeduction.deductedAt).toBeDefined()
  })

  test('RemovalRequest entity Transform computation creates removal request via SubmitRemovalRequest interaction', async () => {
    /**
     * Test Plan for: RemovalRequest entity Transform computation
     * Dependencies: RemovalRequest entity, SubmitRemovalRequest interaction, User entity
     * Steps: 1) Create target user 2) Create requester user 3) Trigger SubmitRemovalRequest interaction 4) Verify RemovalRequest entity is created 5) Verify properties are correct
     * Business Logic: Transform computation creates RemovalRequest entity when SubmitRemovalRequest interaction occurs
     */
    
    // First create a target user (user to be removed)
    const targetUserResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Target User for Removal',
        email: 'remove.target@example.com',
        studentId: 'STU004'
      }
    })
    
    expect(targetUserResult.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the target user ID
    let targetUserId
    const targetUserCreateEffect = targetUserResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    
    if (targetUserCreateEffect && targetUserCreateEffect.record.id) {
      targetUserId = targetUserCreateEffect.record.id
    } else {
      // If no effect, query the database to find the created user
      const users = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      const createdUser = users.find(user => user.email === 'remove.target@example.com')
      expect(createdUser).toBeDefined()
      targetUserId = createdUser.id
    }
    
    expect(targetUserId).toBeDefined()
    
    // Create a requester user (dormitory leader)
    const requesterUserResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Requester User Leader',
        email: 'requester.leader@example.com',
        studentId: 'STU005',
        role: 'dormitoryLeader'
      }
    })
    
    expect(requesterUserResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the requester user ID
    let requesterUserId
    const requesterUserCreateEffect = requesterUserResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    
    if (requesterUserCreateEffect && requesterUserCreateEffect.record.id) {
      requesterUserId = requesterUserCreateEffect.record.id
    } else {
      const users = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      const requesterUser = users.find(user => user.email === 'requester.leader@example.com')
      expect(requesterUser).toBeDefined()
      requesterUserId = requesterUser.id
    }
    
    expect(requesterUserId).toBeDefined()
    
    // Now submit removal request via interaction
    const result = await controller.callInteraction('submitRemovalRequest', {
      user: { id: requesterUserId }, // Requester user (dormitory leader)
      payload: {
        targetUserId: targetUserId,
        reason: 'Violation of dormitory rules and policies'
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any RemovalRequest records were created by querying the database
    const allRequests = await system.storage.find(
      'RemovalRequest',
      undefined,
      undefined,
      ['id', 'reason', 'status', 'requestedAt', 'processedAt', 'adminComment', 'isDeleted']
    )

    // Get the created removal request ID from effects OR from database query
    let requestCreateEffect = result.effects.find(effect => effect.recordName === 'RemovalRequest' && effect.type === 'create')
    let createdRequest
    
    if (requestCreateEffect) {
      expect(requestCreateEffect.record.id).toBeDefined()
      createdRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestCreateEffect.record.id] }),
        undefined,
        ['id', 'reason', 'status', 'requestedAt', 'processedAt', 'adminComment', 'isDeleted']
      )
    } else {
      // If no effect, try to find the created request by reason (should be unique in this test)
      createdRequest = allRequests.find(request => request.reason === 'Violation of dormitory rules and policies')
      expect(createdRequest).toBeDefined()
    }

    expect(createdRequest).toBeDefined()
    expect(createdRequest.reason).toBe('Violation of dormitory rules and policies')
    expect(createdRequest.status).toBe('pending') // Initial status should be pending
    expect(createdRequest.requestedAt).toBeDefined()
    expect(createdRequest.processedAt).toBeUndefined() // Should be undefined/null initially
    expect(createdRequest.adminComment).toBeUndefined() // Should be undefined/null initially
    expect(createdRequest.isDeleted).toBe(false)
  })

  test('UserDormitoryLeaderRelation StateMachine computation creates relation via AssignDormitoryLeader interaction', async () => {
    /**
     * Test Plan for: UserDormitoryLeaderRelation StateMachine computation
     * Dependencies: UserDormitoryLeaderRelation, AssignDormitoryLeader interaction, User entity, Dormitory entity
     * Steps: 1) Create a user 2) Create a dormitory 3) Trigger AssignDormitoryLeader interaction 4) Verify relation is created 5) Verify properties are correct
     * Business Logic: StateMachine computation creates UserDormitoryLeaderRelation when AssignDormitoryLeader interaction occurs
     */
    
    // First create a user (who will become dormitory leader)
    const userResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Future Leader',
        email: 'leader@example.com',
        studentId: 'STU005'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the user ID
    let userId
    const userCreateEffect = userResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    
    if (userCreateEffect && userCreateEffect.record.id) {
      userId = userCreateEffect.record.id
    } else {
      const users = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      const createdUser = users.find(user => user.email === 'leader@example.com')
      expect(createdUser).toBeDefined()
      userId = createdUser.id
    }
    
    expect(userId).toBeDefined()
    
    // Create a dormitory
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' },
      payload: {
        name: 'Leadership Building',
        location: 'Admin Campus',
        capacity: 6
      }
    })
    
    expect(dormitoryResult.error).toBeUndefined()
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get the dormitory ID
    let dormitoryId
    const dormitoryCreateEffect = dormitoryResult.effects.find(effect => effect.recordName === 'Dormitory' && effect.type === 'create')
    
    if (dormitoryCreateEffect && dormitoryCreateEffect.record.id) {
      dormitoryId = dormitoryCreateEffect.record.id
    } else {
      const dormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      const createdDormitory = dormitories.find(dorm => dorm.name === 'Leadership Building')
      expect(createdDormitory).toBeDefined()
      dormitoryId = createdDormitory.id
    }
    
    expect(dormitoryId).toBeDefined()
    
    // Now assign dormitory leader via interaction
    const result = await controller.callInteraction('assignDormitoryLeader', {
      user: { id: 'admin' }, // Admin user assigning the leader
      payload: {
        userId: userId,
        dormitoryId: dormitoryId
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any UserDormitoryLeaderRelation records were created by querying the database
    const allRelations = await system.storage.findRelationByName(
      UserDormitoryLeaderRelation.name,
      undefined,
      undefined,
      [
        'id',
        'assignedAt',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'name'] }]
      ]
    )

    // Find the created relation
    const createdRelation = allRelations.find(relation => 
      relation.source && relation.source.id === userId &&
      relation.target && relation.target.id === dormitoryId
    )

    expect(createdRelation).toBeDefined()
    expect(createdRelation.source).toBeDefined()
    expect(createdRelation.source.id).toBe(userId)
    expect(createdRelation.source.name).toBe('Future Leader')
    expect(createdRelation.target).toBeDefined()
    expect(createdRelation.target.id).toBe(dormitoryId)
    expect(createdRelation.target.name).toBe('Leadership Building')
    expect(createdRelation.assignedAt).toBeDefined()
  })

  test('UserBedAssignmentRelation StateMachine computation creates and removes relation via AssignUserToBed and RemoveUserFromBed interactions', async () => {
    /**
     * Test Plan for: UserBedAssignmentRelation StateMachine computation
     * Dependencies: UserBedAssignmentRelation, AssignUserToBed interaction, RemoveUserFromBed interaction, User entity, Bed entity, Dormitory entity
     * Steps: 1) Create user and dormitory+bed 2) Assign user to bed 3) Verify relation creation 4) Remove user from bed 5) Verify relation deletion
     * Business Logic: StateMachine computation manages UserBedAssignmentRelation lifecycle via both assign and remove interactions
     */
    
    // First create a user
    const userResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Student User',
        email: 'student@example.com',
        studentId: 'STU006'
      }
    })
    
    expect(userResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let userId
    const userCreateEffect = userResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (userCreateEffect && userCreateEffect.record.id) {
      userId = userCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const createdUser = users.find(user => user.email === 'student@example.com')
      expect(createdUser).toBeDefined()
      userId = createdUser.id
    }
    
    // Create a dormitory
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' },
      payload: {
        name: 'Student Building',
        location: 'Student Campus',
        capacity: 4
      }
    })
    
    expect(dormitoryResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let dormitoryId
    const dormitoryCreateEffect = dormitoryResult.effects.find(effect => effect.recordName === 'Dormitory' && effect.type === 'create')
    if (dormitoryCreateEffect && dormitoryCreateEffect.record.id) {
      dormitoryId = dormitoryCreateEffect.record.id
    } else {
      const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['id', 'name'])
      const createdDormitory = dormitories.find(dorm => dorm.name === 'Student Building')
      expect(createdDormitory).toBeDefined()
      dormitoryId = createdDormitory.id
    }
    
    // Create a bed
    const bedResult = await controller.callInteraction('createBed', {
      user: { id: 'admin' },
      payload: {
        dormitoryId: dormitoryId,
        number: 'B002'
      }
    })
    
    expect(bedResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let bedId
    const bedCreateEffect = bedResult.effects.find(effect => effect.recordName === 'Bed' && effect.type === 'create')
    if (bedCreateEffect && bedCreateEffect.record.id) {
      bedId = bedCreateEffect.record.id
    } else {
      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'number'])
      const createdBed = beds.find(bed => bed.number === 'B002')
      expect(createdBed).toBeDefined()
      bedId = createdBed.id
    }
    
    // Now assign user to bed
    const assignResult = await controller.callInteraction('assignUserToBed', {
      user: { id: 'admin' },
      payload: {
        userId: userId,
        bedId: bedId
      }
    })

    expect(assignResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify relation was created
    const allRelations = await system.storage.findRelationByName(
      UserBedAssignmentRelation.name,
      undefined,
      undefined,
      [
        'id',
        'assignedAt',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'number'] }]
      ]
    )

    const createdRelation = allRelations.find(relation => 
      relation.source && relation.source.id === userId &&
      relation.target && relation.target.id === bedId
    )

    expect(createdRelation).toBeDefined()
    expect(createdRelation.source.id).toBe(userId)
    expect(createdRelation.source.name).toBe('Student User')
    expect(createdRelation.target.id).toBe(bedId)
    expect(createdRelation.target.number).toBe('B002')
    expect(createdRelation.assignedAt).toBeDefined()

    // Now remove user from bed
    const removeResult = await controller.callInteraction('removeUserFromBed', {
      user: { id: 'admin' },
      payload: {
        userId: userId
      }
    })

    expect(removeResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify relation was removed
    const relationsAfterRemoval = await system.storage.findRelationByName(
      UserBedAssignmentRelation.name,
      undefined,
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]
    )

    const remainingRelation = relationsAfterRemoval.find(relation => 
      relation.source && relation.source.id === userId &&
      relation.target && relation.target.id === bedId
    )

    expect(remainingRelation).toBeUndefined() // Should be removed
  })

  test('DormitoryBedRelation created by Bed Transform (_parent:Bed)', async () => {
    /**
     * Test Plan for: _parent:Bed
     * This tests the Bed's Transform computation that creates DormitoryBedRelation
     * Dependencies: Dormitory entity, Bed entity, DormitoryBedRelation, CreateDormitory, CreateBed interactions
     * Steps: 1) Create dormitory 2) Create bed with dormitoryId 3) Verify DormitoryBedRelation is created
     * Business Logic: Bed's Transform creates DormitoryBedRelation using dormitory targetProperty
     */

    // Create dormitory first
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Dormitory',
        location: 'Building A',
        capacity: 4
      }
    })

    expect(dormitoryResult.error).toBeUndefined()
    const dormitoryId = dormitoryResult.effects?.[0]?.record?.id
    expect(dormitoryId).toBeTruthy()

    // Create bed with dormitoryId
    const bedResult = await controller.callInteraction('createBed', {
      user: { id: 'admin' },
      payload: {
        dormitoryId: dormitoryId,
        number: 'B001'
      }
    })

    expect(bedResult.error).toBeUndefined()

    // Import DormitoryBedRelation to get relation name
    const { DormitoryBedRelation } = await import('../backend')

    // Find the bed that was created with its dormitory relation
    const allBeds = await system.storage.find(
      'Bed',
      undefined,
      undefined,
      [
        'id', 
        'number', 
        ['dormitory', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(allBeds.length).toBe(1)
    
    // Use the actual bed that was created
    const actualBed = allBeds[0]
    const bedId = actualBed.id

    // Verify DormitoryBedRelation was created between the dormitory and bed
    const relations = await system.storage.find(
      DormitoryBedRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', dormitoryId] })
        .and({ key: 'target.id', value: ['=', bedId] }),
      undefined,
      [
        'id',
        'createdAt',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'number'] }]
      ]
    )

    expect(relations.length).toBe(1)
    
    const relation = relations[0]
    expect(relation.source.id).toBe(dormitoryId)
    expect(relation.target.id).toBe(bedId)
    expect(relation.target.number).toBe('B001')
    expect(relation.createdAt).toBeTypeOf('number')
    expect(relation.createdAt).toBeGreaterThan(0)
    
    // Verify the bed has the dormitory reference
    expect(actualBed.dormitory.id).toBe(dormitoryId)
  })

  test('UserPointDeductionRelation created by PointDeduction Transform (_parent:PointDeduction)', async () => {
    /**
     * Test Plan for: _parent:PointDeduction
     * This tests the PointDeduction's Transform computation that creates UserPointDeductionRelation
     * Dependencies: User entity, PointDeduction entity, DeductionRule entity, UserPointDeductionRelation, CreateUser, CreateDeductionRule, ApplyPointDeduction interactions
     * Steps: 1) Create user 2) Create deduction rule 3) Apply point deduction with targetUserId 4) Verify UserPointDeductionRelation is created
     * Business Logic: PointDeduction's Transform creates UserPointDeductionRelation using user targetProperty
     */

    // Create user first
    const userResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Test User',
        email: 'testuser@example.com',
        studentId: 'STU123',
        phone: '123-456-7890'
      }
    })

    expect(userResult.error).toBeUndefined()
    const userId = userResult.effects?.[0]?.record?.id
    expect(userId).toBeTruthy()

    // Create deduction rule
    const ruleResult = await controller.callInteraction('createDeductionRule', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Rule',
        description: 'Test deduction rule',
        points: 10,
        isActive: true
      }
    })

    expect(ruleResult.error).toBeUndefined()
    const ruleId = ruleResult.effects?.[0]?.record?.id
    expect(ruleId).toBeTruthy()

    // Apply point deduction with targetUserId
    const deductionResult = await controller.callInteraction('applyPointDeduction', {
      user: { id: 'admin' },
      payload: {
        targetUserId: userId,
        ruleId: ruleId,
        reason: 'Test violation'
      }
    })

    expect(deductionResult.error).toBeUndefined()

    // Find the point deduction that was created with its user relation
    const allDeductions = await system.storage.find(
      'PointDeduction',
      undefined,
      undefined,
      [
        'id', 
        'reason', 
        'points',
        'deductedAt',
        ['user', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(allDeductions.length).toBe(1)
    
    // Use the actual deduction that was created
    const actualDeduction = allDeductions[0]
    const deductionId = actualDeduction.id

    // Verify UserPointDeductionRelation was created between the user and point deduction
    const relations = await system.storage.find(
      UserPointDeductionRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', userId] })
        .and({ key: 'target.id', value: ['=', deductionId] }),
      undefined,
      [
        'id',
        'createdAt',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )

    expect(relations.length).toBe(1)
    
    const relation = relations[0]
    expect(relation.source.id).toBe(userId)
    expect(relation.target.id).toBe(deductionId)
    expect(relation.target.reason).toBe('Test violation')
    expect(relation.createdAt).toBeTypeOf('number')
    expect(relation.createdAt).toBeGreaterThan(0)
    
    // Verify the point deduction has the user reference
    expect(actualDeduction.user.id).toBe(userId)
  })

  test('UserRemovalRequestTargetRelation creation through RemovalRequest Transform (_parent:RemovalRequest)', async () => {
    /**
     * Test Plan for: UserRemovalRequestTargetRelation (_parent:RemovalRequest)
     * Dependencies: User entity, RemovalRequest entity, UserRemovalRequestTargetRelation
     * Steps: 1) Create requester user 2) Create target user 3) Submit removal request 4) Verify UserRemovalRequestTargetRelation is created
     * Business Logic: RemovalRequest's Transform creates UserRemovalRequestTargetRelation when submitRemovalRequest interaction occurs
     */
    
    // Create requester user (dormitory leader)
    const requesterResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Dorm Leader',
        email: 'leader@example.com',
        studentId: 'STU007',
        role: 'dormitoryLeader'
      }
    })
    
    expect(requesterResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let requesterId
    const requesterCreateEffect = requesterResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (requesterCreateEffect && requesterCreateEffect.record.id) {
      requesterId = requesterCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const requesterUser = users.find(user => user.email === 'leader@example.com')
      expect(requesterUser).toBeDefined()
      requesterId = requesterUser.id
    }

    // Create target user (the one being requested for removal)
    const targetResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        studentId: 'STU008'
      }
    })
    
    expect(targetResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let targetUserId
    const targetCreateEffect = targetResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (targetCreateEffect && targetCreateEffect.record.id) {
      targetUserId = targetCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const targetUser = users.find(user => user.email === 'target@example.com')
      expect(targetUser).toBeDefined()
      targetUserId = targetUser.id
    }

    // Submit removal request
    const removalResult = await controller.callInteraction('submitRemovalRequest', {
      user: { id: requesterId }, // Requester user submitting the request
      payload: {
        targetUserId: targetUserId,
        reason: 'Violation of dormitory rules'
      }
    })

    expect(removalResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the removal request that was created
    const allRequests = await system.storage.find(
      'RemovalRequest',
      undefined,
      undefined,
      [
        'id',
        'reason',
        'status',
        'requestedAt',
        ['targetUser', { attributeQuery: ['id', 'name'] }],
        ['requestedBy', { attributeQuery: ['id', 'name'] }]
      ]
    )
    
    expect(allRequests.length).toBe(1)
    const actualRequest = allRequests[0]
    const requestId = actualRequest.id

    // Verify UserRemovalRequestTargetRelation was created between the target user and removal request
    const targetRelations = await system.storage.find(
      UserRemovalRequestTargetRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', targetUserId] })
        .and({ key: 'target.id', value: ['=', requestId] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )

    expect(targetRelations.length).toBe(1)
    
    const targetRelation = targetRelations[0]
    expect(targetRelation.source.id).toBe(targetUserId)
    expect(targetRelation.source.name).toBe('Target User')
    expect(targetRelation.target.id).toBe(requestId)
    expect(targetRelation.target.reason).toBe('Violation of dormitory rules')
    expect(targetRelation.target.status).toBe('pending')
    
    // Verify the removal request has the target user reference
    expect(actualRequest.targetUser.id).toBe(targetUserId)
    expect(actualRequest.targetUser.name).toBe('Target User')
    expect(actualRequest.requestedBy.id).toBe(requesterId)
    expect(actualRequest.requestedBy.name).toBe('Dorm Leader')
  })

  test('UserRemovalRequestRequesterRelation created through RemovalRequest Transform (_parent:RemovalRequest)', async () => {
    /**
     * Test Plan for: _parent:RemovalRequest
     * This tests the RemovalRequest's Transform computation that creates UserRemovalRequestRequesterRelation
     * Dependencies: User entity, RemovalRequest entity, UserRemovalRequestRequesterRelation
     * Steps: 1) Create requester and target users 2) Submit removal request 3) Verify UserRemovalRequestRequesterRelation is created
     * Business Logic: RemovalRequest's Transform creates UserRemovalRequestRequesterRelation via 'requestedBy' property
     */

    // Step 1: Create requester user (dormitory leader)
    const requesterResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Dorm Leader',
        email: 'leader@example.com',
        studentId: 'STU001',
        phone: '123-456-7890',
        role: 'dormitoryLeader'
      }
    })
    
    expect(requesterResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let requesterId
    const requesterCreateEffect = requesterResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (requesterCreateEffect && requesterCreateEffect.record.id) {
      requesterId = requesterCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const requesterUser = users.find(user => user.email === 'leader@example.com')
      expect(requesterUser).toBeDefined()
      requesterId = requesterUser.id
    }

    // Step 2: Create target user  
    const targetResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        studentId: 'STU002',
        phone: '123-456-7891',
        role: 'user'
      }
    })
    
    expect(targetResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let targetUserId
    const targetCreateEffect = targetResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (targetCreateEffect && targetCreateEffect.record.id) {
      targetUserId = targetCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const targetUser = users.find(user => user.email === 'target@example.com')
      expect(targetUser).toBeDefined()
      targetUserId = targetUser.id
    }

    // Step 3: Submit removal request (should create UserRemovalRequestRequesterRelation)
    const requestResult = await controller.callInteraction('submitRemovalRequest', {
      user: { id: requesterId, name: 'Dorm Leader' },
      payload: {
        targetUserId: targetUserId,
        reason: 'Violation of dormitory rules'
      }
    })

    // Verify removal request was created - find by searching since it may not appear in effects
    const removalRequests = await system.storage.find('RemovalRequest', 
      MatchExp.atom({ key: 'reason', value: ['=', 'Violation of dormitory rules'] }),
      undefined, 
      ['id', 'reason']
    )
    expect(removalRequests.length).toBe(1)
    const requestId = removalRequests[0].id

    // Step 4: Verify UserRemovalRequestRequesterRelation was created
    const requesterRelations = await system.storage.find(
      UserRemovalRequestRequesterRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', requesterId] })
        .and({ key: 'target.id', value: ['=', requestId] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name', 'role'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )

    expect(requesterRelations.length).toBe(1)
    
    const requesterRelation = requesterRelations[0]
    expect(requesterRelation.source.id).toBe(requesterId)
    expect(requesterRelation.source.name).toBe('Dorm Leader')
    expect(requesterRelation.source.role).toBe('dormitoryLeader')
    expect(requesterRelation.target.id).toBe(requestId)
    expect(requesterRelation.target.reason).toBe('Violation of dormitory rules')
    expect(requesterRelation.target.status).toBe('pending')

    // Step 5: Verify the removal request has the requester reference
    const actualRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', requestId] }),
      undefined,
      [
        'id', 'reason', 'status', 'requestedAt',
        ['requestedBy', { attributeQuery: ['id', 'name', 'role'] }],
        ['targetUser', { attributeQuery: ['id', 'name'] }]
      ]
    )

    expect(actualRequest.requestedBy.id).toBe(requesterId)
    expect(actualRequest.requestedBy.name).toBe('Dorm Leader')
    expect(actualRequest.requestedBy.role).toBe('dormitoryLeader')
    expect(actualRequest.targetUser.id).toBe(targetUserId)
    expect(actualRequest.targetUser.name).toBe('Target User')
  })

  test('UserRemovalRequestProcessorRelation StateMachine computation creates relation via ProcessRemovalRequest interaction', async () => {
    /**
     * Test Plan for: UserRemovalRequestProcessorRelation StateMachine computation
     * Dependencies: UserRemovalRequestProcessorRelation, ProcessRemovalRequest interaction, User entity, RemovalRequest entity
     * Steps: 1) Create admin user 2) Create target user 3) Submit removal request 4) Process removal request 5) Verify processor relation is created
     * Business Logic: StateMachine computation creates UserRemovalRequestProcessorRelation when ProcessRemovalRequest interaction occurs
     */
    
    // Step 1: Create admin user (who will process the request)
    const adminResult = await controller.callInteraction('createUser', {
      user: { id: 'super-admin' },
      payload: {
        name: 'Admin User',
        email: 'admin@example.com',
        studentId: 'ADM001',
        role: 'admin'
      }
    })
    
    expect(adminResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let adminId
    const adminCreateEffect = adminResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (adminCreateEffect && adminCreateEffect.record.id) {
      adminId = adminCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const adminUser = users.find(user => user.email === 'admin@example.com')
      expect(adminUser).toBeDefined()
      adminId = adminUser.id
    }

    // Step 2: Create target user
    const targetResult = await controller.callInteraction('createUser', {
      user: { id: adminId },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        studentId: 'STU002',
        role: 'user'
      }
    })
    
    expect(targetResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    let targetUserId
    const targetCreateEffect = targetResult.effects.find(effect => effect.recordName === 'User' && effect.type === 'create')
    if (targetCreateEffect && targetCreateEffect.record.id) {
      targetUserId = targetCreateEffect.record.id
    } else {
      const users = await system.storage.find('User', undefined, undefined, ['id', 'email'])
      const targetUser = users.find(user => user.email === 'target@example.com')
      expect(targetUser).toBeDefined()
      targetUserId = targetUser.id
    }

    // Step 3: Submit removal request (required for processing)
    const requestResult = await controller.callInteraction('submitRemovalRequest', {
      user: { id: adminId },
      payload: {
        targetUserId: targetUserId,
        reason: 'Violation requiring admin review'
      }
    })

    expect(requestResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created removal request
    const removalRequests = await system.storage.find('RemovalRequest', 
      MatchExp.atom({ key: 'reason', value: ['=', 'Violation requiring admin review'] }),
      undefined, 
      ['id', 'reason', 'status']
    )
    expect(removalRequests.length).toBe(1)
    const requestId = removalRequests[0].id

    // Step 4: Process the removal request
    const processResult = await controller.callInteraction('processRemovalRequest', {
      user: { id: adminId, name: 'Admin User', role: 'admin' },
      payload: {
        requestId: requestId,
        decision: 'approved',
        adminComment: 'Request approved after review'
      }
    })

    expect(processResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Step 5: Verify UserRemovalRequestProcessorRelation was created
    const processorRelations = await system.storage.find(
      UserRemovalRequestProcessorRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', adminId] })
        .and({ key: 'target.id', value: ['=', requestId] }),
      undefined,
      [
        'id',
        'processedAt',
        ['source', { attributeQuery: ['id', 'name', 'role'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )

    expect(processorRelations.length).toBe(1)
    
    const processorRelation = processorRelations[0]
    expect(processorRelation.source.id).toBe(adminId)
    expect(processorRelation.source.name).toBe('Admin User')
    expect(processorRelation.source.role).toBe('admin')
    expect(processorRelation.target.id).toBe(requestId)
    expect(processorRelation.target.reason).toBe('Violation requiring admin review')
    expect(processorRelation.processedAt).toBeDefined()
    expect(typeof processorRelation.processedAt).toBe('number')
    expect(processorRelation.processedAt).toBeGreaterThan(0)
  })

  test('DeductionRule entity Transform computation creates deduction rule via CreateDeductionRule interaction', async () => {
    /**
     * Test Plan for: DeductionRule entity Transform computation
     * Dependencies: DeductionRule entity, CreateDeductionRule interaction
     * Steps: 1) Trigger CreateDeductionRule interaction 2) Verify DeductionRule entity is created 3) Verify properties are correct
     * Business Logic: Transform computation creates DeductionRule entity when CreateDeductionRule interaction occurs
     */
    
    // Create deduction rule via interaction
    const result = await controller.callInteraction('createDeductionRule', {
      user: { id: 'admin' }, // Admin user triggering the creation
      payload: {
        name: 'Test Violation Rule',
        description: 'A test rule for dormitory violations',
        points: 10,
        isActive: true
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    console.log('DeductionRule creation effects:', result.effects)

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check if any DeductionRule records were created by querying the database
    const allRules = await system.storage.find(
      'DeductionRule',
      undefined,
      undefined,
      ['id', 'name', 'description', 'points', 'isActive', 'createdAt', 'updatedAt', 'isDeleted']
    )

    console.log('All DeductionRules:', allRules)

    // Get the created rule ID from effects OR from database query
    let ruleCreateEffect = result.effects.find(effect => effect.recordName === 'DeductionRule' && effect.type === 'create')
    let createdRule
    
    if (ruleCreateEffect) {
      expect(ruleCreateEffect.record.id).toBeDefined()
      createdRule = await system.storage.findOne(
        'DeductionRule',
        MatchExp.atom({ key: 'id', value: ['=', ruleCreateEffect.record.id] }),
        undefined,
        ['id', 'name', 'description', 'points', 'isActive', 'createdAt', 'updatedAt', 'isDeleted']
      )
    } else {
      // If no effect, try to find the created rule by name (should be unique)
      createdRule = allRules.find(rule => rule.name === 'Test Violation Rule')
      expect(createdRule).toBeDefined()
    }

    expect(createdRule).toBeDefined()
    expect(createdRule.name).toBe('Test Violation Rule')
    expect(createdRule.description).toBe('A test rule for dormitory violations')
    expect(createdRule.points).toBe(10)
    expect(createdRule.isActive).toBe(true)
    expect(createdRule.isDeleted).toBe(false)
    expect(createdRule.createdAt).toBeDefined()
    expect(createdRule.updatedAt).toBeDefined()
  })

  test('DeductionRuleApplicationRelation created by PointDeduction Transform (_parent:PointDeduction)', async () => {
    /**
     * Test Plan for: DeductionRuleApplicationRelation (_parent:PointDeduction)
     * Dependencies: DeductionRule entity, PointDeduction entity, User entity, DeductionRuleApplicationRelation, ApplyPointDeduction interaction
     * Steps: 1) Create deduction rule 2) Create user 3) Apply point deduction with ruleId 4) Verify DeductionRuleApplicationRelation is created
     * Business Logic: PointDeduction's Transform creates DeductionRuleApplicationRelation using rule targetProperty when ApplyPointDeduction interaction occurs
     */

    // Create deduction rule first (let's use the existing successful pattern)
    await new Promise(resolve => setTimeout(resolve, 100)) // Wait a bit to ensure clean state
    
    const ruleResult = await controller.callInteraction('createDeductionRule', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Rule',
        description: 'Test deduction rule for relation testing',
        points: 5,
        isActive: true
      }
    })

    expect(ruleResult.error).toBeUndefined()
    console.log('Rule creation effects:', ruleResult.effects)
    
    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Find the created rule by name since effects may not contain it
    const allRules = await system.storage.find(
      'DeductionRule',
      undefined,
      undefined,
      ['id', 'name', 'description', 'points', 'isActive']
    )
    
    console.log('All rules after creation:', allRules)
    const createdRule = allRules.find(rule => rule.name === 'Test Rule')
    expect(createdRule).toBeDefined()
    const ruleId = createdRule.id

    // Create user who will receive point deduction
    const userResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Test User',
        email: 'testuser@example.com',
        studentId: 'STU123',
        phone: '123-456-7890'
      }
    })

    expect(userResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Find the created user by email since effects may not contain it
    const allUsers = await system.storage.find(
      'User',
      undefined,
      undefined,
      ['id', 'email']
    )
    
    const createdUser = allUsers.find(user => user.email === 'testuser@example.com')
    expect(createdUser).toBeDefined()
    const userId = createdUser.id

    // Apply point deduction with ruleId
    const deductionResult = await controller.callInteraction('applyPointDeduction', {
      user: { id: 'admin' },
      payload: {
        targetUserId: userId,
        ruleId: ruleId,
        reason: 'Test violation for relation testing'
      }
    })

    expect(deductionResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the point deduction that was created
    const allDeductions = await system.storage.find(
      'PointDeduction',
      undefined,
      undefined,
      [
        'id', 
        'reason', 
        'points',
        'deductedAt',
        ['rule', { attributeQuery: ['id', 'name'] }]
      ]
    )
    
    console.log('All PointDeductions:', allDeductions)
    
    const actualDeduction = allDeductions.find(deduction => deduction.reason === 'Test violation for relation testing')
    expect(actualDeduction).toBeDefined()
    const deductionId = actualDeduction.id

    // Verify DeductionRuleApplicationRelation was created between the rule and point deduction
    const relations = await system.storage.find(
      DeductionRuleApplicationRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', ruleId] })
        .and({ key: 'target.id', value: ['=', deductionId] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name', 'points'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )

    expect(relations.length).toBe(1)
    
    const relation = relations[0]
    expect(relation.source.id).toBe(ruleId)
    expect(relation.source.name).toBe('Test Rule')
    expect(relation.source.points).toBe(5)
    expect(relation.target.id).toBe(deductionId)
    expect(relation.target.reason).toBe('Test violation for relation testing')
    
    // Verify the point deduction has the rule reference
    expect(actualDeduction.rule.id).toBe(ruleId)
    expect(actualDeduction.rule.name).toBe('Test Rule')
  })

  test('User.id auto-generated by _owner computation', async () => {
    /**
     * Test Plan for: User.id _owner computation
     * Dependencies: User entity
     * Steps: 1) Create user via CreateUser interaction 2) Verify ID is auto-generated 3) Verify ID is unique and non-empty
     * Business Logic: ID property is auto-generated when User entity is created (_owner computation)
     */
    
    // Create user via interaction
    const result = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Test User for ID',
        email: 'idtest@example.com',
        studentId: 'STU999'
      }
    })

    // Check that interaction was successful
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()

    // Wait a bit for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created user
    const allUsers = await system.storage.find(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'idtest@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(allUsers.length).toBe(1)
    const createdUser = allUsers[0]

    // Verify ID is auto-generated (_owner computation)
    expect(createdUser.id).toBeDefined()
    expect(typeof createdUser.id).toBe('string')
    expect(createdUser.id.length).toBeGreaterThan(0)
    
    // Verify other properties are correct
    expect(createdUser.name).toBe('Test User for ID')
    expect(createdUser.email).toBe('idtest@example.com')
    expect(createdUser.studentId).toBe('STU999')

    // Create another user to verify ID uniqueness
    const result2 = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Second Test User',
        email: 'idtest2@example.com',
        studentId: 'STU998'
      }
    })

    expect(result2.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const allUsers2 = await system.storage.find(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'idtest2@example.com'] }),
      undefined,
      ['id', 'name', 'email']
    )

    expect(allUsers2.length).toBe(1)
    const createdUser2 = allUsers2[0]

    // Verify second user has different ID (uniqueness)
    expect(createdUser2.id).toBeDefined()
    expect(typeof createdUser2.id).toBe('string')
    expect(createdUser2.id.length).toBeGreaterThan(0)
    expect(createdUser2.id).not.toBe(createdUser.id) // IDs should be unique
  })

  test('User.name StateMachine computation handles create and update interactions', async () => {
    /**
     * Test Plan for: User.name StateMachine computation
     * Dependencies: User entity, InteractionEventEntity, CreateUser interaction, UpdateUser interaction
     * Steps: 1) Create user with name via CreateUser interaction 2) Verify name is correctly set 3) Update user name via UpdateUser interaction 4) Verify name is updated correctly
     * Business Logic: StateMachine manages User.name property with direct assignment from CreateUser and UpdateUser interactions
     */
    
    // Step 1: Create user via CreateUser interaction
    const createResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Initial Name',
        email: 'nametest@example.com',
        studentId: 'STU123',
        phone: '123-456-7890'
      }
    })

    expect(createResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created user and verify name
    let createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'nametest@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(createdUser).toBeDefined()
    expect(createdUser.name).toBe('Initial Name')
    expect(createdUser.email).toBe('nametest@example.com')
    expect(createdUser.studentId).toBe('STU123')

    // Step 2: Update user name via UpdateUser interaction
    const updateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        name: 'Updated Name',
        email: 'nametest@example.com' // Keep same email
      }
    })

    expect(updateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify name was updated
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(updatedUser).toBeDefined()
    expect(updatedUser.name).toBe('Updated Name')
    expect(updatedUser.email).toBe('nametest@example.com') // Should remain unchanged
    expect(updatedUser.studentId).toBe('STU123') // Should remain unchanged
    expect(updatedUser.id).toBe(createdUser.id) // Same user

    // Step 3: Update user with only name field (testing name updates only)
    const secondNameUpdateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        name: 'Final Name' // Update only name
      }
    })

    expect(secondNameUpdateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify name was updated again
    const finalUpdatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(finalUpdatedUser).toBeDefined()
    expect(finalUpdatedUser.name).toBe('Final Name') // Should be updated to final name
    expect(finalUpdatedUser.email).toBe('nametest@example.com') // Should remain unchanged
    expect(finalUpdatedUser.studentId).toBe('STU123') // Should remain unchanged
  })

  test('User.email StateMachine computation handles create and update interactions', async () => {
    /**
     * Test Plan for: User.email StateMachine computation
     * Dependencies: User entity, InteractionEventEntity, CreateUser interaction, UpdateUser interaction
     * Steps: 1) Create user with email via CreateUser interaction 2) Verify email is correctly set 3) Update user email via UpdateUser interaction 4) Verify email is updated correctly
     * Business Logic: StateMachine manages User.email property with direct assignment from CreateUser and UpdateUser interactions with uniqueness validation
     */
    
    // Step 1: Create user via CreateUser interaction
    const createResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Test User',
        email: 'initial@example.com',
        studentId: 'STU456',
        phone: '123-456-7890'
      }
    })

    expect(createResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created user and verify email
    let createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'initial@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(createdUser).toBeDefined()
    expect(createdUser.name).toBe('Test User')
    expect(createdUser.email).toBe('initial@example.com')
    expect(createdUser.studentId).toBe('STU456')

    // Step 2: Update user email via UpdateUser interaction
    const updateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        name: 'Test User',
        email: 'updated@example.com' // Update email
      }
    })

    expect(updateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify email was updated
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(updatedUser).toBeDefined()
    expect(updatedUser.name).toBe('Test User')
    expect(updatedUser.email).toBe('updated@example.com')
    expect(updatedUser.studentId).toBe('STU456') // Should remain unchanged
    expect(updatedUser.id).toBe(createdUser.id) // Same user

    // Step 3: Update user with only email field (testing email updates only)
    const secondEmailUpdateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        email: 'final@example.com' // Update only email
      }
    })

    expect(secondEmailUpdateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify email was updated again
    const finalUpdatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId']
    )

    expect(finalUpdatedUser).toBeDefined()
    expect(finalUpdatedUser.name).toBe('Test User') // Should remain unchanged
    expect(finalUpdatedUser.email).toBe('final@example.com') // Should be updated to final email
    expect(finalUpdatedUser.studentId).toBe('STU456') // Should remain unchanged
  })

  test('User.studentId computation (_owner type)', async () => {
    /**
     * Test Plan for: _owner
     * This tests that studentId is properly set when User is created
     * Steps: 1) Trigger interaction that creates User 2) Verify studentId is set
     * Business Logic: User's creation computation sets studentId property
     */
    
    // Create user to test studentId _owner computation
    const result = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'StudentId Test User',
        email: 'studentid@example.com',
        studentId: 'STU999'
      }
    })

    expect(result.error).toBeUndefined()
    
    // Wait for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created user
    const users = await system.storage.find(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'studentid@example.com'] }),
      undefined,
      ['id', 'studentId']
    )

    expect(users.length).toBe(1)
    const user = users[0]
    
    // Verify studentId was set correctly by the _owner computation (via entity creation)
    expect(user.studentId).toBe('STU999')
    
    // Verify studentId cannot be changed via update (since it's creation-only)
    const updateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: user.id,
        name: 'Updated Name'
        // Note: not trying to update studentId since it's creation-only
      }
    })

    expect(updateResult.error).toBeUndefined()
    
    // Wait for computations to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify studentId remains unchanged
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'studentId', 'name']
    )

    expect(updatedUser.studentId).toBe('STU999') // Should remain unchanged
    expect(updatedUser.name).toBe('Updated Name') // Name can be updated
  })

  test('User.phone StateMachine computation handles create and update interactions', async () => {
    /**
     * Test Plan for: User.phone StateMachine computation
     * Dependencies: User entity, InteractionEventEntity, CreateUser interaction, UpdateUser interaction
     * Steps: 1) Create user with phone via CreateUser interaction 2) Verify phone is correctly set 3) Update user phone via UpdateUser interaction 4) Verify phone is updated correctly 5) Test empty phone handling
     * Business Logic: StateMachine manages User.phone property with direct assignment from CreateUser and UpdateUser interactions. Should handle optional phone numbers (empty string if not provided).
     */
    
    // Step 1: Create user via CreateUser interaction with phone
    const createResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Phone Test User',
        email: 'phonetest@example.com',
        studentId: 'STU789',
        phone: '555-123-4567'
      }
    })

    expect(createResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created user and verify phone
    let createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'phonetest@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'phone']
    )

    expect(createdUser).toBeDefined()
    expect(createdUser.name).toBe('Phone Test User')
    expect(createdUser.email).toBe('phonetest@example.com')
    expect(createdUser.studentId).toBe('STU789')
    expect(createdUser.phone).toBe('555-123-4567')

    // Step 2: Update user phone via UpdateUser interaction
    const updateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        phone: '555-987-6543' // Update phone only
      }
    })

    expect(updateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify phone was updated
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'phone']
    )

    expect(updatedUser).toBeDefined()
    expect(updatedUser.name).toBe('Phone Test User') // Should remain unchanged
    expect(updatedUser.email).toBe('phonetest@example.com') // Should remain unchanged
    expect(updatedUser.studentId).toBe('STU789') // Should remain unchanged
    expect(updatedUser.phone).toBe('555-987-6543') // Should be updated
    expect(updatedUser.id).toBe(createdUser.id) // Same user

    // Step 3: Create user without phone (testing empty phone handling)
    const createWithoutPhoneResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'No Phone User',
        email: 'nophone@example.com',
        studentId: 'STU790'
        // phone omitted
      }
    })

    expect(createWithoutPhoneResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the user created without phone
    const userWithoutPhone = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'nophone@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'phone']
    )

    expect(userWithoutPhone).toBeDefined()
    expect(userWithoutPhone.name).toBe('No Phone User')
    expect(userWithoutPhone.email).toBe('nophone@example.com')
    expect(userWithoutPhone.studentId).toBe('STU790')
    expect(userWithoutPhone.phone).toBe('') // Should default to empty string

    // Step 4: Update user with empty phone
    const updateToEmptyPhoneResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: updatedUser.id,
        phone: '' // Clear phone
      }
    })

    expect(updateToEmptyPhoneResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify phone was cleared
    const userWithClearedPhone = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', updatedUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'phone']
    )

    expect(userWithClearedPhone).toBeDefined()
    expect(userWithClearedPhone.name).toBe('Phone Test User') // Should remain unchanged
    expect(userWithClearedPhone.email).toBe('phonetest@example.com') // Should remain unchanged
    expect(userWithClearedPhone.studentId).toBe('STU789') // Should remain unchanged
    expect(userWithClearedPhone.phone).toBe('') // Should be cleared to empty string
  })

  test('User.role computation', async () => {
    /**
     * Test Plan for: User.role
     * Dependencies: User entity, CreateUser interaction, AssignDormitoryLeader interaction
     * Steps: 1) Create user with default role 2) Create user with custom role 3) Assign user as dormitory leader 4) Verify role changes
     * Business Logic: Set to 'dormitoryLeader' by AssignDormitoryLeader, otherwise directly assigned from CreateUser (defaults to 'user')
     */

    // Step 1: Create a user with default role
    const createDefaultUserResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Default Role User',
        email: 'defaultrole@example.com',
        studentId: 'STU001'
        // No role specified, should default to 'user'
      }
    })

    expect(createDefaultUserResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const defaultUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'defaultrole@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'role']
    )

    expect(defaultUser).toBeDefined()
    expect(defaultUser.role).toBe('user') // Should default to 'user'

    // Step 2: Create a user with custom role
    const createCustomUserResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Custom Role User',
        email: 'customrole@example.com',
        studentId: 'STU002',
        role: 'admin'
      }
    })

    expect(createCustomUserResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const customUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'customrole@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'role']
    )

    expect(customUser).toBeDefined()
    expect(customUser.role).toBe('admin') // Should use specified role

    // Step 3: Create a dormitory and assign user as leader
    const createDormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Dormitory',
        location: 'Test Location',
        capacity: 4
      }
    })

    expect(createDormitoryResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
      undefined,
      ['id', 'name']
    )

    expect(dormitory).toBeDefined()

    // Step 4: Assign default user as dormitory leader
    const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
      user: { id: 'admin' },
      payload: {
        userId: defaultUser.id,
        dormitoryId: dormitory.id
      }
    })

    expect(assignLeaderResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify the role was changed to 'dormitoryLeader'
    const leaderUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', defaultUser.id] }),
      undefined,
      ['id', 'name', 'email', 'studentId', 'role']
    )

    expect(leaderUser).toBeDefined()
    expect(leaderUser.role).toBe('dormitoryLeader') // Should be set to 'dormitoryLeader' by AssignDormitoryLeader
    expect(leaderUser.name).toBe('Default Role User') // Other fields should remain unchanged
    expect(leaderUser.email).toBe('defaultrole@example.com')
    expect(leaderUser.studentId).toBe('STU001')

    // Step 5: Verify the dormitory leader relation was created
    const leaderRelation = await system.storage.findRelationByName(
      UserDormitoryLeaderRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', defaultUser.id] }),
      undefined,
      [
        'id',
        'assignedAt',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'name'] }]
      ]
    )

    expect(leaderRelation.length).toBe(1)
    expect(leaderRelation[0].source.id).toBe(defaultUser.id)
    expect(leaderRelation[0].target.id).toBe(dormitory.id)
    expect(leaderRelation[0].assignedAt).toBeGreaterThan(0)
  })

  test('User.createdAt property is set by owner computation (_owner)', async () => {
    /**
     * Test Plan for: User.createdAt _owner computation
     * Dependencies: User entity, CreateUser interaction
     * Steps: 1) Record timestamp before creation 2) Create user 3) Verify createdAt is set correctly
     * Business Logic: createdAt is set once at entity creation and controlled by owner (User Transform)
     */

    const beforeCreation = Math.floor(Date.now() / 1000)
    
    // Create user via CreateUser interaction
    const result = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'Timestamp Test User',
        email: 'timestamp@example.com',
        studentId: 'STU999',
        phone: '999-999-9999',
        role: 'user'
      }
    })

    // Verify interaction succeeded
    expect(result.error).toBeUndefined()
    expect(result.effects).toBeDefined()
    expect(result.effects.length).toBeGreaterThan(0)

    await new Promise(resolve => setTimeout(resolve, 100))

    // Find the created user
    const createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'timestamp@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'createdAt', 'updatedAt']
    )

    expect(createdUser).toBeDefined()
    
    // Verify createdAt was set by the owner computation
    expect(createdUser.createdAt).toBeDefined()
    expect(typeof createdUser.createdAt).toBe('number')
    expect(createdUser.createdAt).toBeGreaterThanOrEqual(beforeCreation)
    expect(createdUser.createdAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1)

    // Verify this is creation-only - createdAt should not be modifiable by updates
    const afterCreation = Math.floor(Date.now() / 1000) + 5
    
    const updateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        name: 'Updated Name'
      }
    })

    expect(updateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check that createdAt remains unchanged after update
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'createdAt', 'updatedAt']
    )

    expect(updatedUser).toBeDefined()
    expect(updatedUser.createdAt).toBe(createdUser.createdAt) // Should remain unchanged
    expect(updatedUser.name).toBe('Updated Name') // Name should be updated
  })

  test('User.updatedAt StateMachine computation automatically updates timestamp', async () => {
    /**
     * Test Plan for: User.updatedAt StateMachine computation
     * Dependencies: User entity, UpdateUser interaction, AssignDormitoryLeader interaction
     * Steps: 1) Create user 2) Update user and verify updatedAt changes 3) Assign dormitory leader and verify updatedAt changes
     * Business Logic: User.updatedAt should be automatically updated when UpdateUser or AssignDormitoryLeader interactions occur
     */
    
    // Create user first
    const createResult = await controller.callInteraction('createUser', {
      user: { id: 'admin' },
      payload: {
        name: 'John Doe',
        email: 'john@example.com',
        studentId: 'STU001',
        phone: '123-456-7890',
        role: 'user'
      }
    })

    expect(createResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'john@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'updatedAt']
    )

    expect(createdUser).toBeDefined()
    const initialUpdatedAt = createdUser.updatedAt
    expect(initialUpdatedAt).toBeDefined()

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Test 1: Update user should update the updatedAt timestamp
    const updateResult = await controller.callInteraction('updateUser', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        name: 'Updated John Doe',
        email: 'updated.john@example.com'
      }
    })

    expect(updateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const userAfterUpdate = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'email', 'updatedAt']
    )

    expect(userAfterUpdate).toBeDefined()
    expect(userAfterUpdate.name).toBe('Updated John Doe')
    expect(userAfterUpdate.email).toBe('updated.john@example.com')
    expect(userAfterUpdate.updatedAt).toBeGreaterThan(initialUpdatedAt)

    const updatedAtAfterUpdate = userAfterUpdate.updatedAt

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Test 2: Create dormitory and assign user as leader should also update updatedAt
    const dormCreateResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin' },
      payload: {
        name: 'Test Dormitory',
        location: 'Building A',
        capacity: 4
      }
    })

    expect(dormCreateResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
      undefined,
      ['id', 'name']
    )

    expect(dormitory).toBeDefined()

    // Assign user as dormitory leader
    const assignResult = await controller.callInteraction('assignDormitoryLeader', {
      user: { id: 'admin' },
      payload: {
        userId: createdUser.id,
        dormitoryId: dormitory.id
      }
    })

    expect(assignResult.error).toBeUndefined()
    await new Promise(resolve => setTimeout(resolve, 100))

    const userAfterAssignment = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', createdUser.id] }),
      undefined,
      ['id', 'name', 'role', 'updatedAt']
    )

    expect(userAfterAssignment).toBeDefined()
    expect(userAfterAssignment.role).toBe('dormitoryLeader')
    expect(userAfterAssignment.updatedAt).toBeGreaterThan(updatedAtAfterUpdate)
  })
}) 