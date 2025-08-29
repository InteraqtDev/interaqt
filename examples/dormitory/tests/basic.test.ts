import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts, UserDormitoryLeaderRelation, UserBedAssignmentRelation } from '../backend'

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
    
    // Now submit removal request via interaction
    const result = await controller.callInteraction('submitRemovalRequest', {
      user: { id: 'requester-user' }, // Requester user (dormitory leader)
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
}) 