import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp, WeightedSummation, Custom
} from 'interaqt'

// Import all definitions from backend
import {
  // State Nodes
  activeUserState, kickedUserState, studentRoleState, dormHeadRoleState,
  activeRuleState, inactiveRuleState,
  activeDeductionState, cancelledDeductionState,
  pendingRequestState, approvedRequestState, rejectedRequestState,
  activeRelationState, inactiveRelationState,

  // Entities
  User, Dormitory, Bed, DeductionRule, DeductionRecord, KickoutRequest,

  // Relations
  UserDormitoryRelation, UserBedRelation, UserDeductionRecordRelation, 
  DeductionRuleRecordRelation, RecorderDeductionRelation, ApplicantKickoutRelation, 
  TargetKickoutRelation, ProcessorKickoutRelation, DormitoryHeadRelation, DormitoryBedRelation,

  // Interactions
  CreateDormitory, AssignUserToDormitory, CreateDeductionRule, RecordDeduction, 
  CreateKickoutRequest, AssignDormHead, RemoveDormHead, ApproveKickoutRequest, 
  RejectKickoutRequest, CancelDeduction, DisableDeductionRule
} from '../backend/index'

describe('Stage 1 - Core Business Logic Tests', () => {
  let system: MonoSystem
  let controller: Controller

  // Collect all definitions
  const entities = [User, Dormitory, Bed, DeductionRule, DeductionRecord, KickoutRequest]
  const relations = [UserDormitoryRelation, UserBedRelation, UserDeductionRecordRelation, 
                    DeductionRuleRecordRelation, RecorderDeductionRelation, ApplicantKickoutRelation, 
                    TargetKickoutRelation, ProcessorKickoutRelation, DormitoryHeadRelation, DormitoryBedRelation]
  const interactions = [CreateDormitory, AssignUserToDormitory, CreateDeductionRule, RecordDeduction, 
                       CreateKickoutRequest, AssignDormHead, RemoveDormHead, ApproveKickoutRequest, 
                       RejectKickoutRequest, CancelDeduction, DisableDeductionRule]

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    })

    await controller.setup(true)
  })

  // TC001: Create Dormitory
  test('TC001: should create dormitory with proper initialization', async () => {
    // Setup: Create admin user with proper role
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    // Act: Create dormitory
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'Building A',
        capacity: 4
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify dormitory was created
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Building A'] }),
      undefined,
      ['id', 'name', 'capacity', 'status', 'createdAt', 'occupiedCount']
    )
    
    expect(dormitory).toBeTruthy()
    expect(dormitory.name).toBe('Building A')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.status).toBe('active')
    expect(dormitory.occupiedCount).toBe(0)
    expect(dormitory.createdAt).toBeGreaterThan(0)
  })

  // TC002: Assign User to Dormitory
  test('TC002: should assign user to dormitory and update occupancy', async () => {
    // Setup: Create admin, dormitory, and student
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'John Student',
      email: 'john@student.edu',
      role: 'student'
    })

    // Create dormitory first
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'Building A',
        capacity: 4
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Building A'] }),
      undefined,
      ['id']
    )

    // Act: Assign user to dormitory
    const result = await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: { id: student.id },
        dormitoryId: { id: dormitory.id }
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify user assignment
    const assignedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'name', ['dormitory', { attributeQuery: ['id', 'name'] }]]
    )
    
    expect(assignedUser.dormitory).toBeTruthy()
    expect(assignedUser.dormitory.id).toBe(dormitory.id)
    expect(assignedUser.dormitory.name).toBe('Building A')

    // Verify dormitory occupancy updated
    const updatedDormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      undefined,
      ['id', 'occupiedCount']
    )
    expect(updatedDormitory.occupiedCount).toBe(1)
  })

  // TC003: Create Deduction Rule
  test('TC003: should create deduction rule with proper initialization', async () => {
    // Setup: Create admin user
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    // Act: Create deduction rule
    const result = await controller.callInteraction('CreateDeductionRule', {
      user: admin,
      payload: {
        title: 'Late Return',
        description: 'Returning to dormitory after 11 PM',
        points: 5,
        category: 'time_violation'
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify deduction rule was created
    const rule = await system.storage.findOne('DeductionRule',
      MatchExp.atom({ key: 'title', value: ['=', 'Late Return'] }),
      undefined,
      ['id', 'title', 'description', 'points', 'category', 'status', 'createdAt', 'usageCount']
    )
    
    expect(rule).toBeTruthy()
    expect(rule.title).toBe('Late Return')
    expect(rule.description).toBe('Returning to dormitory after 11 PM')
    expect(rule.points).toBe(5)
    expect(rule.category).toBe('time_violation')
    expect(rule.status).toBe('active')
    expect(rule.usageCount).toBe(0)
    expect(rule.createdAt).toBeGreaterThan(0)
  })

  // TC004: Record Deduction
  test('TC004: should record deduction and update user total points', async () => {
    // Setup: Create admin, student, and deduction rule
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'John Student',
      email: 'john@student.edu',
      role: 'student'
    })

    // Create deduction rule
    await controller.callInteraction('CreateDeductionRule', {
      user: admin,
      payload: {
        title: 'Late Return',
        description: 'Returning after 11 PM',
        points: 5,
        category: 'time_violation'
      }
    })

    const rule = await system.storage.findOne('DeductionRule',
      MatchExp.atom({ key: 'title', value: ['=', 'Late Return'] }),
      undefined,
      ['id']
    )

    // Act: Record deduction
    const result = await controller.callInteraction('RecordDeduction', {
      user: admin,
      payload: {
        userId: { id: student.id },
        ruleId: { id: rule.id },
        reason: 'Returned at 11:30 PM on 2024-01-15'
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify deduction record was created
    const deductionRecord = await system.storage.findOne('DeductionRecord',
      MatchExp.atom({ key: 'reason', value: ['=', 'Returned at 11:30 PM on 2024-01-15'] }),
      undefined,
      ['id', 'reason', 'points', 'status', 'recordedAt', 
       ['user', { attributeQuery: ['id', 'name'] }],
       ['rule', { attributeQuery: ['id', 'title'] }]]
    )
    
    expect(deductionRecord).toBeTruthy()
    expect(deductionRecord.reason).toBe('Returned at 11:30 PM on 2024-01-15')
    expect(deductionRecord.points).toBe(5)
    expect(deductionRecord.status).toBe('active')
    expect(deductionRecord.user.id).toBe(student.id)
    expect(deductionRecord.rule.id).toBe(rule.id)
    expect(deductionRecord.recordedAt).toBeGreaterThan(0)

    // Verify user's total deduction points updated
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'totalDeductionPoints']
    )
    expect(updatedUser.totalDeductionPoints).toBe(5)

    // Verify rule usage count updated
    const updatedRule = await system.storage.findOne('DeductionRule',
      MatchExp.atom({ key: 'id', value: ['=', rule.id] }),
      undefined,
      ['id', 'usageCount']
    )
    expect(updatedRule.usageCount).toBe(1)
  })

  // TC005: Create Kickout Request
  test('TC005: should create kickout request with proper initialization', async () => {
    // Setup: Create admin and student
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'John Student',
      email: 'john@student.edu',
      role: 'student'
    })

    // Act: Create kickout request
    const result = await controller.callInteraction('CreateKickoutRequest', {
      user: admin,
      payload: {
        userId: { id: student.id },
        reason: 'Accumulated 15 deduction points for repeated violations'
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify kickout request was created
    const kickoutRequest = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Accumulated 15 deduction points for repeated violations'] }),
      undefined,
      ['id', 'reason', 'status', 'createdAt', 
       ['user', { attributeQuery: ['id', 'name'] }]]
    )
    
    expect(kickoutRequest).toBeTruthy()
    expect(kickoutRequest.reason).toBe('Accumulated 15 deduction points for repeated violations')
    expect(kickoutRequest.status).toBe('pending')
    expect(kickoutRequest.user.id).toBe(student.id)
    expect(kickoutRequest.createdAt).toBeGreaterThan(0)
  })

  // TC006: Assign Dorm Head
  test('TC006: should assign user as dorm head', async () => {
    // Setup: Create admin, dormitory, and user
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    const user = await system.storage.create('User', {
      name: 'Jane Leader',
      email: 'jane@student.edu',
      role: 'student'
    })

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: 'Building A', capacity: 4 }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Building A'] }),
      undefined,
      ['id']
    )

    // Act: Assign dorm head
    const result = await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: { id: user.id },
        dormitoryId: { id: dormitory.id }
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify user's role and status updated
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'role', 'status', ['managedDormitory', { attributeQuery: ['id', 'name'] }]]
    )
    
    expect(updatedUser.role).toBe('dormHead')
    expect(updatedUser.status).toBe('dormHeadAssigned')
    expect(updatedUser.managedDormitory).toBeTruthy()
    expect(updatedUser.managedDormitory.id).toBe(dormitory.id)
  })

  // TC007: Approve Kickout Request
  test('TC007: should approve kickout request and update user status', async () => {
    // Setup: Create admin, student, and kickout request
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'John Student',
      email: 'john@student.edu',
      role: 'student'
    })

    // Create kickout request
    await controller.callInteraction('CreateKickoutRequest', {
      user: admin,
      payload: {
        userId: { id: student.id },
        reason: 'Multiple violations'
      }
    })

    const kickoutRequest = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Multiple violations'] }),
      undefined,
      ['id']
    )

    // Act: Approve kickout request
    const result = await controller.callInteraction('ApproveKickoutRequest', {
      user: admin,
      payload: {
        requestId: { id: kickoutRequest.id }
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify kickout request status updated
    const updatedRequest = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'id', value: ['=', kickoutRequest.id] }),
      undefined,
      ['id', 'status', 'processedAt']
    )
    
    expect(updatedRequest.status).toBe('approved')
    expect(updatedRequest.processedAt).toBeGreaterThan(0)

    // Verify user status updated to kicked
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'status']
    )
    expect(updatedUser.status).toBe('kicked')
  })

  // TC008: Cancel Deduction
  test('TC008: should cancel deduction and update user total points', async () => {
    // Setup: Create admin, student, deduction rule, and deduction record
    const admin = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@dormitory.edu',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'John Student',
      email: 'john@student.edu',
      role: 'student'
    })

    // Create deduction rule and record
    await controller.callInteraction('CreateDeductionRule', {
      user: admin,
      payload: {
        title: 'Late Return',
        description: 'After 11 PM',
        points: 5,
        category: 'time_violation'
      }
    })

    const rule = await system.storage.findOne('DeductionRule',
      MatchExp.atom({ key: 'title', value: ['=', 'Late Return'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('RecordDeduction', {
      user: admin,
      payload: {
        userId: { id: student.id },
        ruleId: { id: rule.id },
        reason: 'Late return incident'
      }
    })

    const deductionRecord = await system.storage.findOne('DeductionRecord',
      MatchExp.atom({ key: 'reason', value: ['=', 'Late return incident'] }),
      undefined,
      ['id']
    )

    // Verify initial state (5 points deducted)
    let currentUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'totalDeductionPoints']
    )
    expect(currentUser.totalDeductionPoints).toBe(5)

    // Act: Cancel deduction
    const result = await controller.callInteraction('CancelDeduction', {
      user: admin,
      payload: {
        recordId: { id: deductionRecord.id }
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify deduction record status updated
    const updatedRecord = await system.storage.findOne('DeductionRecord',
      MatchExp.atom({ key: 'id', value: ['=', deductionRecord.id] }),
      undefined,
      ['id', 'status', 'cancelledAt']
    )
    
    expect(updatedRecord.status).toBe('cancelled')
    expect(updatedRecord.cancelledAt).toBeGreaterThan(0)

    // Verify user's total deduction points updated (should be 0 now)
    const updatedUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'totalDeductionPoints']
    )
    expect(updatedUser.totalDeductionPoints).toBe(0)
  })
})