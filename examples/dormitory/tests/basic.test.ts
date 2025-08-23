import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp, Summation, Any, Every
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

// Import specific relations needed in tests
const DormitoryBedRelation = relations.find(r => r.source.name === 'Dormitory' && r.target.name === 'Bed')

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
      forceThtrowInteractionError: true // Use throw to handle interaction errors
    })

    await controller.setup(true)
  })

  // Tests will be added progressively here as we implement each computation
  
  // Import UserDormitoryRelation for test
  const UserDormitoryRelation = relations.find(r => r.source.name === 'User' && r.target.name === 'Dormitory' && r.targetProperty === 'users')
  const DormitoryDormHeadRelation = relations.find(r => r.source.name === 'Dormitory' && r.target.name === 'User' && r.sourceProperty === 'dormHead')
  
  test('User entity Transform computation - CreateUser interaction', async () => {
    /**
     * Test Plan for: User entity Transform
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Create user via CreateUser interaction 2) Verify user created with correct properties
     * Business Logic: Admin creates user with specified role
     */
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Test User',
        email: 'test@example.com',
        phone: '1234567890',
        role: 'admin'
      }
    })
    
    // Query the created user
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'phone', 'role', 'status']
    )
    
    expect(user).toBeDefined()
    expect(user.name).toBe('Test User')
    expect(user.email).toBe('test@example.com')
    expect(user.phone).toBe('1234567890')
    expect(user.role).toBe('admin')
    expect(user.status).toBe('active')
  })
  
  test('User entity Transform computation - RegisterUser interaction', async () => {
    /**
     * Test Plan for: User entity Transform
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Register user via RegisterUser interaction 2) Verify user created with student role
     * Business Logic: Self-registration defaults to student role
     */
    await controller.callInteraction('RegisterUser', {
      user: null, // Self-registration doesn't need current user
      payload: {
        name: 'Student User',
        email: 'student@example.com',
        phone: '9876543210'
      }
    })
    
    // Query the created user
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'student@example.com'] }),
      undefined,
      ['id', 'name', 'email', 'phone', 'role', 'status']
    )
    
    expect(user).toBeDefined()
    expect(user.name).toBe('Student User')
    expect(user.email).toBe('student@example.com')
    expect(user.phone).toBe('9876543210')
    expect(user.role).toBe('student') // Default role for self-registration
    expect(user.status).toBe('active')
  })
  
  test('Dormitory entity Transform computation - CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform
     * Dependencies: Dormitory entity, InteractionEventEntity, Bed entity, DormitoryBedRelation
     * Steps: 1) Create dormitory via CreateDormitory interaction 2) Verify dormitory created with correct properties 3) Verify beds created
     * Business Logic: Admin creates dormitory with specified capacity, system auto-creates beds
     */
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Building A Room 101',
        capacity: 4,
        floor: 1,
        building: 'A'
      }
    })
    
    // Query the created dormitory
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Building A Room 101'] }),
      undefined,
      ['id', 'name', 'capacity', 'floor', 'building', 'status']
    )
    
    expect(dormitory).toBeDefined()
    expect(dormitory.name).toBe('Building A Room 101')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.floor).toBe(1)
    expect(dormitory.building).toBe('A')
    expect(dormitory.status).toBe('active')
    
    // Verify beds were created
    const beds = await system.storage.find(
      'Bed',
      undefined,
      undefined,
      ['id', 'bedNumber', 'status']
    )
    
    expect(beds.length).toBe(4) // Should create 4 beds for capacity 4
    expect(beds.map(b => b.bedNumber).sort()).toEqual(['1', '2', '3', '4'])
    expect(beds.every(b => b.status === 'available')).toBe(true)
    
    // Verify DormitoryBedRelation was created
    const dormBedRelations = await system.storage.find(
      DormitoryBedRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id', 'bedNumber'] }]
      ]
    )
    
    expect(dormBedRelations.length).toBe(4)
    expect(dormBedRelations.every(r => r.source.id === dormitory.id)).toBe(true)
  })
  
  test('RemovalRequestAdminRelation Transform computation', async () => {
    /**
     * Test Plan for: RemovalRequestAdminRelation
     * Dependencies: RemovalRequest entity, User entity (admin), InteractionEventEntity
     * Steps: 1) Create admin user 2) Create target user 3) Create removal request 4) Process request as admin 5) Verify relation created
     * Business Logic: When admin processes a removal request, a relation is created to track who processed it
     */
    
    // Create an admin user who will process the request
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Admin User',
        email: 'admin@example.com',
        phone: '1111111111',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin@example.com'] }),
      undefined,
      ['id']
    )
    
    // Create a target user for removal
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        phone: '2222222222',
        role: 'student'
      }
    })
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target@example.com'] }),
      undefined,
      ['id']
    )
    
    // Initiate a removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: adminUser,
      payload: {
        userId: targetUser.id,
        reason: 'Test removal reason'
      }
    })
    
    // Get the removal request
    const removalRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test removal reason'] }),
      undefined,
      ['id']
    )
    
    // Process the removal request as admin
    await controller.callInteraction('ProcessRemovalRequest', {
      user: adminUser,
      payload: {
        requestId: removalRequest.id,
        decision: 'approved',
        adminComment: 'Request approved after review'
      }
    })
    
    // Import the RemovalRequestAdminRelation
    const RemovalRequestAdminRelation = relations.find(
      r => r.source.name === 'RemovalRequest' && r.sourceProperty === 'processedBy'
    )
    
    // Verify RemovalRequestAdminRelation was created
    const adminRelation = await system.storage.findOne(
      RemovalRequestAdminRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', removalRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(adminRelation).toBeDefined()
    expect(adminRelation.source.id).toBe(removalRequest.id)
    expect(adminRelation.target.id).toBe(adminUser.id)
  })
  
  test('PointDeduction entity Transform computation - IssuePointDeduction interaction', async () => {
    /**
     * Test Plan for: PointDeduction entity Transform
     * Dependencies: PointDeduction entity, User entity, InteractionEventEntity, UserPointDeductionRelation, DeductionIssuerRelation
     * Steps: 1) Create issuer user 2) Create target user 3) Issue point deduction 4) Verify PointDeduction created with correct properties 5) Verify relations created
     * Business Logic: Admin/dormHead issues point deduction to a user, system creates deduction record and relations
     */
    
    // First create the issuer user (dormHead)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm Head User',
        email: 'dormhead@example.com',
        phone: '5555555555',
        role: 'dormHead'
      }
    })
    
    // Get the created issuer user
    const issuerUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead@example.com'] }),
      undefined,
      ['id']
    )
    
    // Create a target user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    // Get the created target user
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target@example.com'] }),
      undefined,
      ['id']
    )
    
    // Now issue point deduction using the actual issuer user ID
    await controller.callInteraction('IssuePointDeduction', {
      user: { id: issuerUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser.id,
        reason: 'Late return',
        points: 5,
        category: 'discipline',
        description: 'Returned to dormitory after 11 PM',
        evidence: 'Security camera footage'
      }
    })
    
    // Query the created point deduction
    const deduction = await system.storage.findOne(
      'PointDeduction',
      MatchExp.atom({ key: 'reason', value: ['=', 'Late return'] }),
      undefined,
      ['id', 'reason', 'points', 'category', 'status', 'description', 'evidence', 'deductedAt']
    )
    
    expect(deduction).toBeDefined()
    expect(deduction.reason).toBe('Late return')
    expect(deduction.points).toBe(5)
    expect(deduction.category).toBe('discipline')
    expect(deduction.status).toBe('active')
    expect(deduction.description).toBe('Returned to dormitory after 11 PM')
    expect(deduction.evidence).toBe('Security camera footage')
    expect(deduction.deductedAt).toBeDefined()
    
    // Import the relations we need to check
    const UserPointDeductionRelation = relations.find(r => r.source.name === 'User' && r.target.name === 'PointDeduction')
    const DeductionIssuerRelation = relations.find(r => r.source.name === 'PointDeduction' && r.target.name === 'User' && r.targetProperty === 'issuedDeductions')
    
    // Verify UserPointDeductionRelation was created
    const userDeductionRelation = await system.storage.findOne(
      UserPointDeductionRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', targetUser.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(userDeductionRelation).toBeDefined()
    expect(userDeductionRelation.source.id).toBe(targetUser.id)
    expect(userDeductionRelation.target.id).toBe(deduction.id)
    
    // Verify DeductionIssuerRelation was created
    const issuerRelation = await system.storage.findOne(
      DeductionIssuerRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', deduction.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(issuerRelation).toBeDefined()
    expect(issuerRelation.source.id).toBe(deduction.id)
    expect(issuerRelation.target.id).toBe(issuerUser.id)
  })
  
  test('RemovalRequest entity Transform computation - InitiateRemovalRequest interaction', async () => {
    /**
     * Test Plan for: RemovalRequest entity Transform
     * Dependencies: RemovalRequest entity, User entity, InteractionEventEntity, RemovalRequestTargetRelation, RemovalRequestInitiatorRelation
     * Steps: 1) Create initiator user 2) Create target user 3) Initiate removal request 4) Verify RemovalRequest created with correct properties 5) Verify relations created
     * Business Logic: User initiates removal request for another user, system creates request record and relations
     */
    
    // First create the initiator user (dormHead)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Initiator User',
        email: 'initiator@example.com',
        phone: '5555555555',
        role: 'dormHead'
      }
    })
    
    // Get the created initiator user
    const initiatorUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'initiator@example.com'] }),
      undefined,
      ['id']
    )
    
    // Create a target user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Removal Target User',
        email: 'removaltarget@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    // Get the created target user
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'removaltarget@example.com'] }),
      undefined,
      ['id']
    )
    
    // Now initiate removal request using the actual initiator user ID
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser.id,
        reason: 'Multiple violations of dormitory rules'
      }
    })
    
    // Query the created removal request
    const removalRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Multiple violations of dormitory rules'] }),
      undefined,
      ['id', 'reason', 'status', 'adminComment', 'processedAt', 'createdAt', 'updatedAt']
    )
    
    expect(removalRequest).toBeDefined()
    expect(removalRequest.reason).toBe('Multiple violations of dormitory rules')
    expect(removalRequest.status).toBe('pending')
    // These fields should be undefined initially (not set during creation)
    expect(removalRequest.adminComment).toBeUndefined()
    expect(removalRequest.processedAt).toBeUndefined()
    expect(removalRequest.createdAt).toBeDefined()
    expect(removalRequest.updatedAt).toBeUndefined() // Initial value is undefined, will be set by interactions
    
    // Import the relations we need to check
    const RemovalRequestTargetRelation = relations.find(r => r.source.name === 'RemovalRequest' && r.sourceProperty === 'targetUser')
    const RemovalRequestInitiatorRelation = relations.find(r => r.source.name === 'RemovalRequest' && r.sourceProperty === 'requestedBy')
    
    // Verify RemovalRequestTargetRelation was created
    const targetRelation = await system.storage.findOne(
      RemovalRequestTargetRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', removalRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(targetRelation).toBeDefined()
    expect(targetRelation.source.id).toBe(removalRequest.id)
    expect(targetRelation.target.id).toBe(targetUser.id)
    
    // Verify RemovalRequestInitiatorRelation was created
    const initiatorRelation = await system.storage.findOne(
      RemovalRequestInitiatorRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', removalRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id'] }],
        ['target', { attributeQuery: ['id'] }]
      ]
    )
    
    expect(initiatorRelation).toBeDefined()
    expect(initiatorRelation.source.id).toBe(removalRequest.id)
    expect(initiatorRelation.target.id).toBe(initiatorUser.id)
  })
  
  test('UserDormitoryRelation StateMachine computation', async () => {
    /**
     * Test Plan for: UserDormitoryRelation
     * Dependencies: User entity, Dormitory entity, UserDormitoryRelation
     * Steps: 1) Create user and dormitory 2) Assign user to dormitory 3) Verify relation 4) Remove user 5) Verify deletion
     * Business Logic: Manages user-dormitory assignments with create/delete capability
     */
    
    // Create a user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Student User',
        email: 'student@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    // Create a dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 2,
        building: 'Building B'
      }
    })
    
    // Get user and dormitory IDs
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'student@example.com'] }),
      undefined,
      ['id', 'name']
    )
    
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id', 'name']
    )
    
    // Assign user to dormitory
    await controller.callInteraction('AssignUserToDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: user.id,
        dormitoryId: dormitory.id
      }
    })
    
    // Verify relation was created
    const relation = await system.storage.findOne(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'name'] }]
      ]
    )
    
    expect(relation).toBeDefined()
    expect(relation.source.id).toBe(user.id)
    expect(relation.target.id).toBe(dormitory.id)
    
    // Test RemoveUserFromDormitory
    await controller.callInteraction('RemoveUserFromDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: user.id
      }
    })
    
    // Verify relation was deleted
    const deletedRelation = await system.storage.findOne(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
      undefined,
      ['id']
    )
    
    expect(deletedRelation).toBeUndefined() // findOne returns undefined when no record found
    
    // Test ProcessRemovalRequest deletion path
    // First reassign the user
    await controller.callInteraction('AssignUserToDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: user.id,
        dormitoryId: dormitory.id
      }
    })
    
    // Verify relation recreated
    const relation2 = await system.storage.findOne(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
      undefined,
      ['id']
    )
    expect(relation2).toBeDefined()
    
    // Create admin user first for InitiateRemovalRequest
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },  // System admin creates the actual admin user
      payload: {
        name: 'Admin User',
        email: 'admin@example.com',
        phone: '9999999999',
        role: 'admin'
      }
    })
    
    // Get the admin user
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin@example.com'] }),
      undefined,
      ['id']
    )
    
    // Create a removal request with the actual admin user
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },  // Use actual admin user ID
      payload: {
        userId: user.id,
        reason: 'Test removal'
      }
    })
    
    // Get the removal request ID
    const removalRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'targetUser.id', value: ['=', user.id] }),
      undefined,
      ['id']
    )
    
    // Process the removal request (approve)
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },  // Use actual admin user ID
      payload: {
        requestId: removalRequest.id,
        decision: 'approved',
        adminComment: 'Approved for testing'
      }
    })
    
    // Verify relation was deleted by ProcessRemovalRequest
    const deletedRelation2 = await system.storage.findOne(
      UserDormitoryRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
      undefined,
      ['id']
    )
    
    expect(deletedRelation2).toBeUndefined() // findOne returns undefined when no record found
  })

  test('DormitoryDormHeadRelation StateMachine computation', async () => {
    /**
     * Test Plan for: DormitoryDormHeadRelation
     * Dependencies: User entity, Dormitory entity, DormitoryDormHeadRelation
     * Steps: 
     * 1) Create user with dormHead role and dormitory
     * 2) Assign user as dorm head via AssignDormHead interaction
     * 3) Verify relation exists
     * 4) Remove dorm head via RemoveDormHead interaction
     * 5) Verify relation removed
     * Business Logic: User can be assigned as dorm head and removed
     */
    
    // Create a user with dormHead role
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm Head User',
        email: 'dormhead@example.com',
        phone: '9876543210',
        role: 'dormHead'
      }
    })
    
    // Create a dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm Head Test',
        capacity: 6,
        floor: 3,
        building: 'Building C'
      }
    })
    
    // Get user and dormitory IDs
    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead@example.com'] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm Head Test'] }),
      undefined,
      ['id', 'name']
    )
    
    // Assign user as dorm head
    await controller.callInteraction('AssignDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    })
    
    // Verify relation was created
    const relation = await system.storage.findOne(
      DormitoryDormHeadRelation.name,
      MatchExp.atom({ key: 'target.id', value: ['=', dormHead.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'name', 'role'] }]
      ]
    )
    
    expect(relation).toBeDefined()
    expect(relation.source.id).toBe(dormitory.id)
    expect(relation.target.id).toBe(dormHead.id)
    expect(relation.target.role).toBe('dormHead')
    
    // Remove dorm head
    await controller.callInteraction('RemoveDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: dormHead.id
      }
    })
    
    // Verify relation was deleted
    const deletedRelation = await system.storage.findOne(
      DormitoryDormHeadRelation.name,
      MatchExp.atom({ key: 'target.id', value: ['=', dormHead.id] }),
      undefined,
      ['id']
    )
    
    expect(deletedRelation).toBeUndefined() // Relation should be removed
    
    // Test reassignment (should work after removal)
    await controller.callInteraction('AssignDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    })
    
    const reassignedRelation = await system.storage.findOne(
      DormitoryDormHeadRelation.name,
      MatchExp.atom({ key: 'target.id', value: ['=', dormHead.id] }),
      undefined,
      ['id']
    )
    
    expect(reassignedRelation).toBeDefined()
  })
  
  test('User.name StateMachine computation', async () => {
    /**
     * Test Plan for: User.name
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Create user with name 2) Verify name is set 3) Update name via UpdateUserProfile 4) Verify name changed
     * Business Logic: Direct assignment from CreateUser, RegisterUser, UpdateUserProfile interactions
     */
    
    // Test CreateUser sets name
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Initial Name',
        email: 'test@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    let user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] }),
      undefined,
      ['id', 'name', 'email']
    )
    
    expect(user).toBeDefined()
    expect(user.name).toBe('Initial Name')
    
    // Test UpdateUserProfile changes name
    await controller.callInteraction('UpdateUserProfile', {
      user: { id: user.id },
      payload: {
        userId: user.id,
        name: 'Updated Name',
        phone: '9876543210'
      }
    })
    
    user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'name', 'phone']
    )
    
    expect(user.name).toBe('Updated Name')
    expect(user.phone).toBe('9876543210')
    
    // Test RegisterUser sets name for new user
    await controller.callInteraction('RegisterUser', {
      user: null,
      payload: {
        name: 'Registered User',
        email: 'register@example.com',
        phone: '5555555555'
      }
    })
    
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'register@example.com'] }),
      undefined,
      ['id', 'name', 'email']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser.name).toBe('Registered User')
  })
  
  test('User.role StateMachine computation - CreateUser and RegisterUser', async () => {
    /**
     * Test Plan for: User.role
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Create user with admin role 2) Register user (defaults to student) 3) Verify roles
     * Business Logic: Set at creation, defaults to student for self-registration
     */
    
    // Test CreateUser with admin role
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Admin User',
        email: 'admin@example.com',
        phone: '1234567890',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin@example.com'] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    expect(adminUser).toBeDefined()
    expect(adminUser.role).toBe('admin')
    
    // Test CreateUser with student role
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Student User',
        email: 'student@example.com',
        phone: '2345678901',
        role: 'student'
      }
    })
    
    const studentUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'student@example.com'] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    expect(studentUser).toBeDefined()
    expect(studentUser.role).toBe('student')
    
    // Test RegisterUser defaults to student role
    await controller.callInteraction('RegisterUser', {
      user: null,
      payload: {
        name: 'Self Registered',
        email: 'selfregistered@example.com',
        phone: '3456789012'
      }
    })
    
    const registeredUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'selfregistered@example.com'] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    expect(registeredUser).toBeDefined()
    expect(registeredUser.role).toBe('student')
  })
  
  test('User.role StateMachine computation - AssignDormHead and RemoveDormHead', async () => {
    /**
     * Test Plan for: User.role
     * Dependencies: User entity, Dormitory entity, InteractionEventEntity
     * Steps: 1) Create student user 2) Create dormitory 3) Assign as dorm head 4) Remove dorm head 5) Verify role changes
     * Business Logic: Can be changed to/from dormHead by admin interactions
     */
    
    // Create a student user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Test Student',
        email: 'teststudent@example.com',
        phone: '4567890123',
        role: 'student'
      }
    })
    
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'teststudent@example.com'] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    expect(user).toBeDefined()
    expect(user.role).toBe('student')
    
    // Create a dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 1,
        building: 'A'
      }
    })
    
    const dorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id', 'name']
    )
    
    expect(dorm).toBeDefined()
    
    // Assign user as dorm head - should change role to dormHead
    await controller.callInteraction('AssignDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: user.id,
        dormitoryId: dorm.id
      }
    })
    
    const dormHeadUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    expect(dormHeadUser.role).toBe('dormHead')
    
    // Remove dorm head - should change role back to student
    await controller.callInteraction('RemoveDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: user.id
      }
    })
    
    const removedDormHeadUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'name', 'role']
    )
    
    expect(removedDormHeadUser.role).toBe('student')
  })
  
  test('User.status StateMachine computation - status transitions', async () => {
    /**
     * Test Plan for: User.status
     * Dependencies: User entity, InteractionEventEntity, RemovalRequest, RemovalRequestTargetRelation
     * Steps: 1) Create user with active status 2) Test suspension via RemoveUserFromDormitory 3) Test removal via ProcessRemovalRequest
     * Business Logic: Status transitions from active -> suspended -> removed based on admin actions
     */
    // Create an admin user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Admin User',
        email: 'admin@example.com',
        phone: '1234567890',
        role: 'admin'
      }
    })
    
    const admin = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin@example.com'] }),
      undefined,
      ['id', 'role']
    )
    
    // Create a student user
    await controller.callInteraction('RegisterUser', {
      user: null,
      payload: {
        name: 'Test Student',
        email: 'student@example.com',
        phone: '9876543210'
      }
    })
    
    // Verify initial status is active
    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'student@example.com'] }),
      undefined,
      ['id', 'status']
    )
    expect(student.status).toBe('active')
    
    // Create a dormitory and assign the user to it
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })
    
    const dorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dorm.id
      }
    })
    
    // Remove user from dormitory (should set status to suspended)
    await controller.callInteraction('RemoveUserFromDormitory', {
      user: admin,
      payload: {
        userId: student.id
      }
    })
    
    // Verify status changed to suspended
    const suspendedStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'status']
    )
    expect(suspendedStudent.status).toBe('suspended')
    
    // Create another student to test removal request flow
    await controller.callInteraction('RegisterUser', {
      user: null,
      payload: {
        name: 'Student To Remove',
        email: 'remove@example.com',
        phone: '1111111111'
      }
    })
    
    const studentToRemove = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'remove@example.com'] }),
      undefined,
      ['id', 'status']
    )
    expect(studentToRemove.status).toBe('active')
    
    // Create a dorm head to initiate removal request
    await controller.callInteraction('RegisterUser', {
      user: null,
      payload: {
        name: 'Dorm Head',
        email: 'dormhead@example.com',
        phone: '2222222222'
      }
    })
    
    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead@example.com'] }),
      undefined,
      ['id']
    )
    
    // Assign as dorm head
    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        dormitoryId: dorm.id,
        userId: dormHead.id
      }
    })
    
    // Initiate removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: dormHead,
      payload: {
        userId: studentToRemove.id,
        reason: 'Violation of dormitory rules'
      }
    })
    
    // Find the created removal request
    const removalRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Violation of dormitory rules'] }),
      undefined,
      ['id', 'status']
    )
    
    // Process removal request with approval (should set status to removed)
    await controller.callInteraction('ProcessRemovalRequest', {
      user: admin,
      payload: {
        requestId: removalRequest.id,
        decision: 'approve',
        adminComment: 'Request approved'
      }
    })
    
    // Verify status changed to removed
    const removedStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', studentToRemove.id] }),
      undefined,
      ['id', 'status']
    )
    expect(removedStudent.status).toBe('removed')
    
    // Test rejection scenario (status should not change)
    await controller.callInteraction('RegisterUser', {
      user: null,
      payload: {
        name: 'Student Not Removed',
        email: 'notremoved@example.com',
        phone: '3333333333'
      }
    })
    
    const studentNotRemoved = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'notremoved@example.com'] }),
      undefined,
      ['id', 'status']
    )
    expect(studentNotRemoved.status).toBe('active')
    
    // Initiate another removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: dormHead,
      payload: {
        userId: studentNotRemoved.id,
        reason: 'Test rejection'
      }
    })
    
    // Find the created rejection request
    const rejectionRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test rejection'] }),
      undefined,
      ['id', 'status']
    )
    
    // Process removal request with rejection (status should remain active)
    await controller.callInteraction('ProcessRemovalRequest', {
      user: admin,
      payload: {
        requestId: rejectionRequest.id,
        decision: 'reject',
        adminComment: 'Request rejected'
      }
    })
    
    // Verify status remains active
    const stillActiveStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', studentNotRemoved.id] }),
      undefined,
      ['id', 'status']
    )
    expect(stillActiveStudent.status).toBe('active')
  })

  test('User.updatedAt computation - timestamp tracking', async () => {
    /**
     * Test Plan for: User.updatedAt
     * Dependencies: User entity, UpdateUserProfile, AssignDormHead, RemoveDormHead, ProcessRemovalRequest interactions
     * Steps: 
     * 1) Create user - updatedAt should be undefined initially (not set)
     * 2) Update user profile - updatedAt should be set to current timestamp
     * 3) Assign user as dorm head - updatedAt should be updated again
     * 4) Remove user as dorm head - updatedAt should be updated again
     * Business Logic: Timestamp tracking for user modifications
     */
    
    // Step 1: Create a user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Timestamp Test User',
        email: 'timestamp@example.com',
        phone: '11111111',
        role: 'student'
      }
    })
    
    // Get the created user
    const createdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'timestamp@example.com'] }),
      undefined,
      ['id', 'name', 'updatedAt']
    )
    
    expect(createdUser).toBeDefined()
    const userId = createdUser.id
    
    // Check initial updatedAt is undefined (not set yet)
    const initialUser = createdUser
    
    // Initially, updatedAt should be undefined (not set)
    expect(initialUser.updatedAt).toBeUndefined()
    
    // Step 2: Update user profile
    await controller.callInteraction('UpdateUserProfile', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: userId,
        name: 'Updated Name',
        phone: '22222222'
      }
    })
    
    // Check updatedAt is now set
    const updatedUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'name', 'updatedAt']
    )
    
    expect(updatedUser.updatedAt).not.toBeNull()
    expect(updatedUser.name).toBe('Updated Name')
    const firstUpdateTime = updatedUser.updatedAt
    
    // Wait 1 second to ensure timestamps are different (timestamps are in seconds)
    await new Promise(resolve => setTimeout(resolve, 1100))
    
    // Step 3: Create a dormitory and assign user as dorm head
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Test Dorm for Timestamp',
        floor: 3,
        building: 'B',
        capacity: 4
      }
    })
    
    // Get the created dormitory
    const dorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm for Timestamp'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('AssignDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: userId,
        dormitoryId: dorm.id
      }
    })
    
    // Check updatedAt is updated again
    const dormHeadUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'role', 'updatedAt']
    )
    
    expect(dormHeadUser.updatedAt).not.toBeNull()
    expect(dormHeadUser.updatedAt).not.toBe(firstUpdateTime)
    expect(dormHeadUser.role).toBe('dormHead')
    const secondUpdateTime = dormHeadUser.updatedAt
    
    // Wait 1 second to ensure timestamps are different (timestamps are in seconds)
    await new Promise(resolve => setTimeout(resolve, 1100))
    
    // Step 4: Remove user as dorm head
    await controller.callInteraction('RemoveDormHead', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        userId: userId
      }
    })
    
    // Check updatedAt is updated once more
    const finalUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'role', 'updatedAt']
    )
    
    expect(finalUser.updatedAt).not.toBeNull()
    expect(finalUser.updatedAt).not.toBe(secondUpdateTime)
    expect(finalUser.role).toBe('student')
  })

  test('Dormitory.name computation', async () => {
    /**
     * Test Plan for: Dormitory.name
     * Dependencies: Dormitory entity, CreateDormitory interaction, UpdateDormitory interaction
     * Steps: 
     *   1) Create dormitory with initial name
     *   2) Verify name is set correctly
     *   3) Update dormitory name
     *   4) Verify name is updated
     * Business Logic: Name is set at creation and can be updated
     */
    
    // Step 1: Create dormitory with initial name
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Building A - 101',
        capacity: 4,
        floor: 1,
        building: 'A'
      }
    })
    
    // Step 2: Query the created dormitory and verify name is set correctly
    const createdDormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Building A - 101'] }),
      undefined,
      ['id', 'name']
    )
    
    expect(createdDormitory).toBeDefined()
    expect(createdDormitory.name).toBe('Building A - 101')
    
    // Step 3: Update dormitory name
    await controller.callInteraction('UpdateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: createdDormitory.id,
        name: 'Building A - 101 (Renovated)'
      }
    })
    
    // Step 4: Verify name is updated
    const updatedDormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', createdDormitory.id] }),
      undefined,
      ['id', 'name']
    )
    
    expect(updatedDormitory).toBeDefined()
    expect(updatedDormitory.name).toBe('Building A - 101 (Renovated)')
  })

  test('Dormitory.floor computation', async () => {
    /**
     * Test Plan for: Dormitory.floor
     * Dependencies: Dormitory entity, CreateDormitory interaction, UpdateDormitory interaction
     * Steps: 
     *   1) Create dormitory with floor value
     *   2) Verify floor is set correctly
     *   3) Create dormitory without floor value
     *   4) Verify floor is null/undefined
     *   5) Update dormitory floor
     *   6) Verify floor is updated
     * Business Logic: Floor is set at creation and can be updated
     */
    
    // Step 1: Create dormitory with floor value
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm A-101',
        capacity: 4,
        floor: 3,
        building: 'A'
      }
    })
    
    // Step 2: Query the created dormitory and verify floor is set correctly
    const dormWithFloor = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm A-101'] }),
      undefined,
      ['id', 'name', 'floor']
    )
    
    expect(dormWithFloor).toBeDefined()
    expect(dormWithFloor.floor).toBe(3)
    
    // Step 3: Create dormitory without floor value
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm B-201',
        capacity: 6
        // No floor specified
      }
    })
    
    // Step 4: Verify floor is undefined when not provided
    const dormWithoutFloor = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm B-201'] }),
      undefined,
      ['id', 'name', 'floor']
    )
    
    expect(dormWithoutFloor).toBeDefined()
    expect(dormWithoutFloor.floor).toBeUndefined()
    
    // Step 5: Update dormitory floor
    await controller.callInteraction('UpdateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dormWithFloor.id,
        floor: 5
      }
    })
    
    // Step 6: Verify floor is updated
    const updatedDormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormWithFloor.id] }),
      undefined,
      ['id', 'name', 'floor']
    )
    
    expect(updatedDormitory).toBeDefined()
    expect(updatedDormitory.floor).toBe(5)
    
    // Also test updating a dormitory that didn't have floor initially
    await controller.callInteraction('UpdateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dormWithoutFloor.id,
        floor: 2
      }
    })
    
    const updatedDormitory2 = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormWithoutFloor.id] }),
      undefined,
      ['id', 'name', 'floor']
    )
    
    expect(updatedDormitory2).toBeDefined()
    expect(updatedDormitory2.floor).toBe(2)
  })
  
  test('Dormitory.building computation', async () => {
    /**
     * Test Plan for: Dormitory.building
     * Dependencies: Dormitory entity, CreateDormitory interaction, UpdateDormitory interaction
     * Steps: 
     *   1) Create dormitory with building value
     *   2) Verify building is set correctly
     *   3) Create dormitory without building value
     *   4) Verify building is undefined when not set
     *   5) Update dormitory building
     *   6) Verify building is updated
     * Business Logic: Building is set at creation and can be updated
     */
    
    // Step 1: Create dormitory with building value
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm B-201',
        capacity: 4,
        floor: 2,
        building: 'B'
      }
    })
    
    // Step 2: Query the created dormitory and verify building is set correctly
    const dormWithBuilding = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm B-201'] }),
      undefined,
      ['id', 'name', 'building']
    )
    expect(dormWithBuilding).toBeDefined()
    expect(dormWithBuilding.building).toBe('B')
    
    // Step 3: Create dormitory without building value
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Dorm No Building',
        capacity: 6
      }
    })
    
    // Step 4: Verify building is undefined
    const dormWithoutBuilding = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm No Building'] }),
      undefined,
      ['id', 'name', 'building']
    )
    expect(dormWithoutBuilding).toBeDefined()
    expect(dormWithoutBuilding.building).toBeUndefined()
    
    // Step 5: Update dormitory building
    await controller.callInteraction('UpdateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dormWithoutBuilding.id,
        building: 'C'
      }
    })
    
    // Step 6: Verify building is updated
    const updatedDorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormWithoutBuilding.id] }),
      undefined,
      ['id', 'name', 'building']
    )
    expect(updatedDorm).toBeDefined()
    expect(updatedDorm.building).toBe('C')
    
    // Test updating a dormitory that already has a building
    await controller.callInteraction('UpdateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dormWithBuilding.id,
        building: 'D'
      }
    })
    
    const reUpdatedDorm = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormWithBuilding.id] }),
      undefined,
      ['id', 'name', 'building']
    )
    expect(reUpdatedDorm).toBeDefined()
    expect(reUpdatedDorm.building).toBe('D')
  })
  
  test('Dormitory.status computation', async () => {
    /**
     * Test Plan for: Dormitory.status
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Create dormitory 2) Verify status is 'active' 3) Deactivate dormitory 4) Verify status is 'inactive'
     * Business Logic: Set to 'active' at creation, can be set to 'inactive' by DeactivateDormitory
     */
    
    // Step 1: Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Status Test Dorm',
        capacity: 4
      }
    })
    
    // Step 2: Query the created dormitory and verify status is 'active'
    const dorm1 = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Status Test Dorm'] }),
      undefined,
      ['id', 'status']
    )
    
    expect(dorm1).toBeDefined()
    expect(dorm1.status).toBe('active')
    
    // Step 3: Deactivate the dormitory
    await controller.callInteraction('DeactivateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dorm1.id
      }
    })
    
    // Step 4: Verify status changed to inactive
    const dorm2 = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dorm1.id] }),
      undefined,
      ['id', 'status']
    )
    
    expect(dorm2.status).toBe('inactive')
  })

  test('Dormitory.updatedAt computation', async () => {
    /**
     * Test Plan for: Dormitory.updatedAt
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Create dormitory 2) Note initial updatedAt 3) Update dormitory 4) Verify updatedAt changed 5) Deactivate dormitory 6) Verify updatedAt changed again
     * Business Logic: Updated to current timestamp on any modification (UpdateDormitory or DeactivateDormitory)
     */
    
    // Step 1: Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'UpdatedAt Test Dorm',
        capacity: 5,
        floor: 2,
        building: 'Building A'
      }
    })
    
    // Step 2: Query the created dormitory and get initial updatedAt
    const dorm1 = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'UpdatedAt Test Dorm'] }),
      undefined,
      ['id', 'updatedAt', 'name', 'floor']
    )
    
    expect(dorm1).toBeDefined()
    const initialUpdatedAt = dorm1.updatedAt
    expect(initialUpdatedAt).toBeDefined()
    expect(typeof initialUpdatedAt).toBe('number')
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1100))
    
    // Step 3: Update the dormitory
    await controller.callInteraction('UpdateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dorm1.id,
        name: 'Updated Dorm Name',
        floor: 3
      }
    })
    
    // Step 4: Verify updatedAt changed after UpdateDormitory
    const dorm2 = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dorm1.id] }),
      undefined,
      ['id', 'updatedAt', 'name', 'floor']
    )
    
    expect(dorm2.updatedAt).toBeDefined()
    expect(dorm2.updatedAt).toBeGreaterThan(initialUpdatedAt)
    expect(dorm2.name).toBe('Updated Dorm Name')
    expect(dorm2.floor).toBe(3)
    
    const updateAfterModification = dorm2.updatedAt
    
    // Wait a bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1100))
    
    // Step 5: Deactivate the dormitory
    await controller.callInteraction('DeactivateDormitory', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        dormitoryId: dorm1.id
      }
    })
    
    // Step 6: Verify updatedAt changed after DeactivateDormitory
    const dorm3 = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dorm1.id] }),
      undefined,
      ['id', 'updatedAt', 'status']
    )
    
    expect(dorm3.updatedAt).toBeDefined()
    expect(dorm3.updatedAt).toBeGreaterThan(updateAfterModification)
    expect(dorm3.status).toBe('inactive')
  })

  test('PointDeduction.status computation', async () => {
    /**
     * Test Plan for: PointDeduction.status
     * Dependencies: PointDeduction entity, InteractionEventEntity
     * Steps: 1) Create issuer user 2) Create target user 3) Issue point deduction 4) Verify status is 'active'
     * Business Logic: Set to 'active' at creation, can be changed to 'cancelled' by admin (future: appeal system)
     * Note: Currently only testing default 'active' state as CancelPointDeduction interaction not yet implemented
     */
    
    // Step 1: Create issuer user (admin)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Admin Issuer',
        email: 'admin.issuer@example.com',
        phone: '9999999999',
        role: 'admin'
      }
    })
    
    // Get the issuer user's ID
    const issuerUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin.issuer@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 2: Create a user to issue deduction to
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin1', role: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    // Query the target user to get their ID
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 3: Issue point deduction using the actual issuer user ID
    await controller.callInteraction('IssuePointDeduction', {
      user: { id: issuerUser.id, role: 'admin' },
      payload: {
        userId: targetUser.id,
        reason: 'Violation of dormitory rules',
        points: 5,
        category: 'discipline',
        description: 'Late return to dormitory',
        evidence: 'Security camera footage'
      }
    })
    
    // Step 4: Query the created point deduction and verify status
    const deduction = await system.storage.findOne(
      'PointDeduction',
      MatchExp.atom({ key: 'reason', value: ['=', 'Violation of dormitory rules'] }),
      undefined,
      ['id', 'status', 'points', 'category']
    )
    
    expect(deduction).toBeDefined()
    expect(deduction.status).toBe('active')
    expect(deduction.points).toBe(5)
    expect(deduction.category).toBe('discipline')
    
    // Future test case when CancelPointDeduction is implemented:
    // await controller.callInteraction('CancelPointDeduction', {
    //   user: { id: 'admin1', role: 'admin' },
    //   payload: { deductionId: deduction.id }
    // })
    // const cancelledDeduction = await system.storage.findOne(...)
    // expect(cancelledDeduction.status).toBe('cancelled')
  })
  
  test('RemovalRequest.status computation', async () => {
    /**
     * Test Plan for: RemovalRequest.status
     * Dependencies: RemovalRequest entity, User entities, InteractionEventEntity
     * Steps: 
     *   1) Create actual admin user
     *   2) Create target user 
     *   3) Create initiator user
     *   4) Initiate removal request - verify status is 'pending'
     *   5) Process request (approve) - verify status changes to 'approved'
     *   6) Create another removal request
     *   7) Process request (reject) - verify status changes to 'rejected'
     *   8) Create third removal request
     *   9) Cancel request - verify status changes to 'cancelled'
     * Business Logic: Set to 'pending' at creation, changed to 'approved'/'rejected' by ProcessRemovalRequest, or 'cancelled' by CancelRemovalRequest
     */
    
    // Step 1: Create actual admin user for processing requests
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Admin Processor',
        email: 'admin.processor@example.com',
        phone: '1111111111',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin.processor@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 2: Create target user to be removed
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target User',
        email: 'target.remove@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.remove@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 3: Create initiator user (dorm head)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Dorm Head',
        email: 'dormhead@example.com',
        phone: '9876543210',
        role: 'dormHead'
      }
    })
    
    const initiatorUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 4: Initiate removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser.id,
        reason: 'Multiple rule violations'
      }
    })
    
    // Verify status is 'pending'
    const pendingRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Multiple rule violations'] }),
      undefined,
      ['id', 'status', 'reason']
    )
    
    expect(pendingRequest).toBeDefined()
    expect(pendingRequest.status).toBe('pending')
    
    // Step 5: Process request - approve it
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: pendingRequest.id,
        decision: 'approve',
        adminComment: 'Request approved due to serious violations'
      }
    })
    
    // Verify status changed to 'approved'
    const approvedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', pendingRequest.id] }),
      undefined,
      ['id', 'status']
    )
    
    expect(approvedRequest.status).toBe('approved')
    
    // Step 6: Create another removal request to test rejection
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Another User',
        email: 'another@example.com',
        phone: '5555555555',
        role: 'student'
      }
    })
    
    const anotherUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'another@example.com'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: anotherUser.id,
        reason: 'Minor infractions'
      }
    })
    
    const secondRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Minor infractions'] }),
      undefined,
      ['id', 'status']
    )
    
    // Step 7: Process request - reject it
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: secondRequest.id,
        decision: 'reject',
        adminComment: 'Not severe enough for removal'
      }
    })
    
    const rejectedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', secondRequest.id] }),
      undefined,
      ['id', 'status']
    )
    
    expect(rejectedRequest.status).toBe('rejected')
    
    // Step 8: Create third removal request to test cancellation
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Third User',
        email: 'third@example.com',
        phone: '6666666666',
        role: 'student'
      }
    })
    
    const thirdUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'third@example.com'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: thirdUser.id,
        reason: 'Request to be cancelled'
      }
    })
    
    const thirdRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Request to be cancelled'] }),
      undefined,
      ['id', 'status']
    )
    
    // Step 9: Cancel the request
    await controller.callInteraction('CancelRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        requestId: thirdRequest.id
      }
    })
    
    const cancelledRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', thirdRequest.id] }),
      undefined,
      ['id', 'status']
    )
    
    expect(cancelledRequest.status).toBe('cancelled')
  })

  test('RemovalRequest.adminComment computation', async () => {
    /**
     * Test Plan for: RemovalRequest.adminComment
     * Dependencies: RemovalRequest entity, User entities, InteractionEventEntity
     * Steps: 
     *   1) Create admin user
     *   2) Create target user 
     *   3) Create initiator user
     *   4) Initiate removal request - verify adminComment is null initially
     *   5) Process request with admin comment - verify adminComment is set
     *   6) Create another request and process without comment - verify adminComment remains null
     * Business Logic: Set by ProcessRemovalRequest when approving/rejecting
     */
    
    // Step 1: Create admin user for processing requests
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Admin Commenter',
        email: 'admin.commenter@example.com',
        phone: '1111111111',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin.commenter@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 2: Create target user to be removed
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target Comment User',
        email: 'target.comment@example.com',
        phone: '2222222222',
        role: 'student'
      }
    })
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.comment@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 3: Create initiator user (dorm head)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Dorm Head Commenter',
        email: 'dormhead.comment@example.com',
        phone: '3333333333',
        role: 'dormHead'
      }
    })
    
    const initiatorUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead.comment@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 4: Initiate removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser.id,
        reason: 'Test comment on approval'
      }
    })
    
    // Verify adminComment is null initially
    const pendingRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test comment on approval'] }),
      undefined,
      ['id', 'adminComment']
    )
    
    expect(pendingRequest).toBeDefined()
    expect(pendingRequest.adminComment).toBeUndefined() // Initial value is undefined
    
    // Step 5: Process request with admin comment
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: pendingRequest.id,
        decision: 'approve',
        adminComment: 'Approved after reviewing evidence of violations'
      }
    })
    
    // Verify adminComment is set correctly
    const approvedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', pendingRequest.id] }),
      undefined,
      ['id', 'adminComment', 'status']
    )
    
    expect(approvedRequest.adminComment).toBe('Approved after reviewing evidence of violations')
    expect(approvedRequest.status).toBe('approved')
    
    // Step 6: Create another request and process without comment
    // Create another target user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target No Comment',
        email: 'target.nocomment@example.com',
        phone: '4444444444',
        role: 'student'
      }
    })
    
    const targetUser2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.nocomment@example.com'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser2.id,
        reason: 'Test no comment on rejection'
      }
    })
    
    const secondRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test no comment on rejection'] }),
      undefined,
      ['id']
    )
    
    // Process without adminComment
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: secondRequest.id,
        decision: 'reject'
        // No adminComment provided
      }
    })
    
    // Verify adminComment remains null when not provided
    const rejectedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', secondRequest.id] }),
      undefined,
      ['id', 'adminComment', 'status']
    )
    
    expect(rejectedRequest.adminComment).toBeUndefined() // Remains undefined when not provided
    expect(rejectedRequest.status).toBe('rejected')
  })

  test('RemovalRequest.processedAt computation', async () => {
    /**
     * Test Plan for: RemovalRequest.processedAt
     * Dependencies: RemovalRequest entity, User entities, InteractionEventEntity
     * Steps: 
     *   1) Create admin user
     *   2) Create target user 
     *   3) Create initiator user
     *   4) Initiate removal request - verify processedAt is null initially
     *   5) Process request (approve) - verify processedAt is set to current timestamp
     *   6) Create another request and process (reject) - verify processedAt is also set
     * Business Logic: Set to current timestamp when ProcessRemovalRequest executes
     */
    
    // Step 1: Create admin user for processing requests
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Admin Processor',
        email: 'admin.processor@example.com',
        phone: '5555555555',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin.processor@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 2: Create target user to be removed
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target Process User',
        email: 'target.process@example.com',
        phone: '6666666666',
        role: 'student'
      }
    })
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.process@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 3: Create initiator user (dorm head)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Dorm Head Processor',
        email: 'dormhead.process@example.com',
        phone: '7777777777',
        role: 'dormHead'
      }
    })
    
    const initiatorUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead.process@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 4: Initiate removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser.id,
        reason: 'Test processedAt timestamp'
      }
    })
    
    // Verify processedAt is null initially
    const pendingRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test processedAt timestamp'] }),
      undefined,
      ['id', 'processedAt', 'status']
    )
    
    expect(pendingRequest).toBeDefined()
    expect(pendingRequest.processedAt).toBeUndefined() // Initial value is undefined
    expect(pendingRequest.status).toBe('pending')
    
    // Record timestamp before processing
    const beforeTimestamp = Math.floor(Date.now() / 1000)
    
    // Step 5: Process request (approve) - verify processedAt is set
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: pendingRequest.id,
        decision: 'approve',
        adminComment: 'Approved for testing'
      }
    })
    
    // Record timestamp after processing
    const afterTimestamp = Math.floor(Date.now() / 1000)
    
    // Verify processedAt is set correctly
    const approvedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', pendingRequest.id] }),
      undefined,
      ['id', 'processedAt', 'status']
    )
    
    expect(approvedRequest.processedAt).not.toBeNull()
    expect(approvedRequest.processedAt).toBeGreaterThanOrEqual(beforeTimestamp)
    expect(approvedRequest.processedAt).toBeLessThanOrEqual(afterTimestamp)
    expect(approvedRequest.status).toBe('approved')
    
    // Step 6: Create another request and process (reject) - verify processedAt is also set
    // Create another target user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target Process User 2',
        email: 'target.process2@example.com',
        phone: '8888888888',
        role: 'student'
      }
    })
    
    const targetUser2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.process2@example.com'] }),
      undefined,
      ['id']
    )
    
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser2.id,
        reason: 'Test processedAt on rejection'
      }
    })
    
    const secondRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test processedAt on rejection'] }),
      undefined,
      ['id', 'processedAt']
    )
    
    expect(secondRequest.processedAt).toBeUndefined() // Initially undefined
    
    // Record timestamp before processing
    const beforeRejectTimestamp = Math.floor(Date.now() / 1000)
    
    // Process with rejection
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: secondRequest.id,
        decision: 'reject'
      }
    })
    
    // Record timestamp after processing
    const afterRejectTimestamp = Math.floor(Date.now() / 1000)
    
    // Verify processedAt is set for rejection too
    const rejectedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', secondRequest.id] }),
      undefined,
      ['id', 'processedAt', 'status']
    )
    
    expect(rejectedRequest.processedAt).not.toBeNull()
    expect(rejectedRequest.processedAt).toBeGreaterThanOrEqual(beforeRejectTimestamp)
    expect(rejectedRequest.processedAt).toBeLessThanOrEqual(afterRejectTimestamp)
    expect(rejectedRequest.status).toBe('rejected')
  })

  test('RemovalRequest.updatedAt computation', async () => {
    /**
     * Test Plan for: RemovalRequest.updatedAt
     * Dependencies: RemovalRequest entity, User entities, InteractionEventEntity
     * Steps: 
     *   1) Create admin user
     *   2) Create target user 
     *   3) Create initiator user
     *   4) Initiate removal request - verify updatedAt is null initially
     *   5) Process request (approve) - verify updatedAt is set to current timestamp
     *   6) Create another request and cancel it - verify updatedAt is set for cancellation
     * Business Logic: Updated to current timestamp on ProcessRemovalRequest or CancelRemovalRequest
     */
    
    // Step 1: Create admin user for processing requests
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Admin Updater',
        email: 'admin.updater@example.com',
        phone: '9999999999',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin.updater@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 2: Create target user to be removed
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target Update User',
        email: 'target.update@example.com',
        phone: '1010101010',
        role: 'student'
      }
    })
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.update@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 3: Create initiator user (dorm head)
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Dorm Head Updater',
        email: 'dormhead.updater@example.com',
        phone: '1111111111',
        role: 'dormHead'
      }
    })
    
    const initiatorUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead.updater@example.com'] }),
      undefined,
      ['id']
    )
    
    // Step 4: Initiate removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser.id,
        reason: 'Test updatedAt timestamp'
      }
    })
    
    // Verify updatedAt is null initially
    const pendingRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test updatedAt timestamp'] }),
      undefined,
      ['id', 'updatedAt', 'status']
    )
    
    expect(pendingRequest).toBeDefined()
    expect(pendingRequest.updatedAt).toBeUndefined() // Initial value is undefined
    expect(pendingRequest.status).toBe('pending')
    
    // Record timestamp before processing
    const beforeTimestamp = Math.floor(Date.now() / 1000)
    
    // Step 5: Process request (approve) - verify updatedAt is set
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: adminUser.id, role: 'admin' },
      payload: {
        requestId: pendingRequest.id,
        decision: 'approve',
        adminComment: 'Approved for testing updatedAt'
      }
    })
    
    // Record timestamp after processing
    const afterTimestamp = Math.floor(Date.now() / 1000)
    
    // Verify updatedAt is set correctly
    const approvedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', pendingRequest.id] }),
      undefined,
      ['id', 'updatedAt', 'status']
    )
    
    expect(approvedRequest.updatedAt).not.toBeNull()
    expect(approvedRequest.updatedAt).toBeGreaterThanOrEqual(beforeTimestamp)
    expect(approvedRequest.updatedAt).toBeLessThanOrEqual(afterTimestamp)
    expect(approvedRequest.status).toBe('approved')
    
    // Step 6: Create another request and cancel it - verify updatedAt is set for cancellation
    // Create another target user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-system', role: 'admin' },
      payload: {
        name: 'Target Cancel User',
        email: 'target.cancel@example.com',
        phone: '1212121212',
        role: 'student'
      }
    })
    
    const targetUser2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'target.cancel@example.com'] }),
      undefined,
      ['id']
    )
    
    // Create new removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        userId: targetUser2.id,
        reason: 'Test updatedAt on cancellation'
      }
    })
    
    const secondRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test updatedAt on cancellation'] }),
      undefined,
      ['id', 'updatedAt']
    )
    
    expect(secondRequest.updatedAt).toBeUndefined() // Initially undefined
    
    // Record timestamp before cancellation
    const beforeCancelTimestamp = Math.floor(Date.now() / 1000)
    
    // Cancel the request
    await controller.callInteraction('CancelRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        requestId: secondRequest.id
      }
    })
    
    // Record timestamp after cancellation
    const afterCancelTimestamp = Math.floor(Date.now() / 1000)
    
    // Verify updatedAt is set for cancellation
    const cancelledRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', secondRequest.id] }),
      undefined,
      ['id', 'updatedAt', 'status']
    )
    
    expect(cancelledRequest.updatedAt).not.toBeNull()
    expect(cancelledRequest.updatedAt).toBeGreaterThanOrEqual(beforeCancelTimestamp)
    expect(cancelledRequest.updatedAt).toBeLessThanOrEqual(afterCancelTimestamp)
    expect(cancelledRequest.status).toBe('cancelled')
    
    // Test updating timestamp on already updated request
    // Process the cancelled request again (should update timestamp)
    const beforeSecondUpdateTimestamp = Math.floor(Date.now() / 1000)
    
    // Wait a small amount of time to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Cancel again to test state transition from already updated state
    await controller.callInteraction('CancelRemovalRequest', {
      user: { id: initiatorUser.id, role: 'dormHead' },
      payload: {
        requestId: secondRequest.id
      }
    })
    
    const afterSecondUpdateTimestamp = Math.floor(Date.now() / 1000)
    
    const reUpdatedRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'id', value: ['=', secondRequest.id] }),
      undefined,
      ['id', 'updatedAt']
    )
    
    // Should have a newer timestamp
    expect(reUpdatedRequest.updatedAt).toBeGreaterThanOrEqual(beforeSecondUpdateTimestamp)
    expect(reUpdatedRequest.updatedAt).toBeLessThanOrEqual(afterSecondUpdateTimestamp)
  })
  
  test('UserBedRelation computation - StateMachine manages bed assignments', async () => {
    /**
     * Test Plan for: UserBedRelation
     * Dependencies: User entity, Bed entity, UserBedRelation, AssignUserToDormitory, RemoveUserFromDormitory, ProcessRemovalRequest
     * Steps: 1) Create users and dormitory 2) Assign user to dormitory (creates bed relation) 3) Remove user (deletes relation) 4) Test removal request approval
     * Business Logic: Manages 1:1 relationship between users and beds
     */
    
    // Import UserBedRelation for test
    const UserBedRelation = relations.find(r => r.source.name === 'User' && r.target.name === 'Bed')
    
    // Create admin user
    await controller.callInteraction('CreateUser', {
      user: { id: 'super-admin', role: 'admin' },
      payload: {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1111111111',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'admin@test.com'] }),
      undefined,
      ['id', 'role']
    )
    
    // Create test users
    await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        name: 'Test User 1',
        email: 'user1@test.com',
        phone: '2222222222',
        role: 'student'
      }
    })
    
    await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        name: 'Test User 2',
        email: 'user2@test.com',
        phone: '3333333333',
        role: 'student'
      }
    })
    
    const user1 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'user1@test.com'] }),
      undefined,
      ['id']
    )
    
    const user2 = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'user2@test.com'] }),
      undefined,
      ['id']
    )
    
    // Create dormitory with beds
    await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })
    
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
      undefined,
      ['id']
    )
    
    // Get beds for this dormitory
    const beds = await system.storage.find(
      'Bed',
      BoolExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
      undefined,
      ['id', 'bedNumber']
    )
    
    expect(beds.length).toBe(4) // Dormitory should have 4 beds
    
    // Initially no UserBedRelation should exist
    const initialRelations = await system.storage.find(
      UserBedRelation.name,
      undefined,
      undefined,
      ['id']
    )
    expect(initialRelations.length).toBe(0)
    
    // Assign user1 to dormitory with specific bed
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: user1.id,
        dormitoryId: dormitory.id,
        bedId: beds[0].id
      }
    })
    
    // Verify UserBedRelation was created
    const user1BedRelations = await system.storage.find(
      UserBedRelation.name,
      BoolExp.atom({ key: 'source.id', value: ['=', user1.id] }),
      undefined,
      ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id', 'bedNumber'] }]]
    )
    
    expect(user1BedRelations.length).toBe(1)
    expect(user1BedRelations[0].source.id).toBe(user1.id)
    expect(user1BedRelations[0].target.id).toBe(beds[0].id)
    
    // Assign user2 to dormitory with different bed
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: user2.id,
        dormitoryId: dormitory.id,
        bedId: beds[1].id
      }
    })
    
    // Verify both relations exist
    const allBedRelations = await system.storage.find(
      UserBedRelation.name,
      undefined,
      undefined,
      ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
    )
    
    expect(allBedRelations.length).toBe(2)
    
    // Test removing user1 from dormitory
    await controller.callInteraction('RemoveUserFromDormitory', {
      user: adminUser,
      payload: {
        userId: user1.id
      }
    })
    
    // Verify user1's bed relation was deleted
    const user1BedRelationsAfterRemoval = await system.storage.find(
      UserBedRelation.name,
      BoolExp.atom({ key: 'source.id', value: ['=', user1.id] }),
      undefined,
      ['id']
    )
    
    expect(user1BedRelationsAfterRemoval.length).toBe(0)
    
    // Verify user2's relation still exists
    const user2BedRelations = await system.storage.find(
      UserBedRelation.name,
      BoolExp.atom({ key: 'source.id', value: ['=', user2.id] }),
      undefined,
      ['id']
    )
    
    expect(user2BedRelations.length).toBe(1)
    
    // Test removal request approval (should also delete bed relation)
    // First, create a dorm head to initiate removal request
    await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '4444444444',
        role: 'dormHead'
      }
    })
    
    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'dormhead@test.com'] }),
      undefined,
      ['id']
    )
    
    // Assign dorm head to manage the dormitory
    await controller.callInteraction('AssignDormHead', {
      user: adminUser,
      payload: {
        dormitoryId: dormitory.id,
        userId: dormHead.id
      }
    })
    
    // Re-assign user1 to test removal via removal request
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: user1.id,
        dormitoryId: dormitory.id,
        bedId: beds[2].id
      }
    })
    
    // Verify user1 has bed relation again
    const user1ReassignedRelations = await system.storage.find(
      UserBedRelation.name,
      BoolExp.atom({ key: 'source.id', value: ['=', user1.id] }),
      undefined,
      ['id']
    )
    
    expect(user1ReassignedRelations.length).toBe(1)
    
    // Create removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: dormHead,
      payload: {
        userId: user1.id,
        reason: 'Test removal'
      }
    })
    
    const removalRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test removal'] }),
      undefined,
      ['id']
    )
    
    // Process removal request (approve it)
    await controller.callInteraction('ProcessRemovalRequest', {
      user: adminUser,
      payload: {
        requestId: removalRequest.id,
        decision: 'approved',
        adminComment: 'Approved for testing'
      }
    })
    
    // Verify user1's bed relation was deleted by approval
    const user1BedRelationsAfterApproval = await system.storage.find(
      UserBedRelation.name,
      BoolExp.atom({ key: 'source.id', value: ['=', user1.id] }),
      undefined,
      ['id']
    )
    
    expect(user1BedRelationsAfterApproval.length).toBe(0)
    
    // Test rejection (should NOT delete bed relation)
    // First re-assign user2 to a new bed
    await controller.callInteraction('RemoveUserFromDormitory', {
      user: adminUser,
      payload: {
        userId: user2.id
      }
    })
    
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: user2.id,
        dormitoryId: dormitory.id,
        bedId: beds[3].id
      }
    })
    
    // Create another removal request for user2
    await controller.callInteraction('InitiateRemovalRequest', {
      user: dormHead,
      payload: {
        userId: user2.id,
        reason: 'Test rejection'
      }
    })
    
    const rejectionRequest = await system.storage.findOne(
      'RemovalRequest',
      MatchExp.atom({ key: 'reason', value: ['=', 'Test rejection'] }),
      undefined,
      ['id']
    )
    
    // Process removal request (reject it)
    await controller.callInteraction('ProcessRemovalRequest', {
      user: adminUser,
      payload: {
        requestId: rejectionRequest.id,
        decision: 'rejected',
        adminComment: 'Rejected for testing'
      }
    })
    
    // Verify user2's bed relation still exists after rejection
    const user2BedRelationsAfterRejection = await system.storage.find(
      UserBedRelation.name,
      BoolExp.atom({ key: 'source.id', value: ['=', user2.id] }),
      undefined,
      ['id']
    )
    
    expect(user2BedRelationsAfterRejection.length).toBe(1) // Relation should still exist
  })

  test('User.totalPoints computation - Summation of point deductions', async () => {
    /**
     * Test Plan for: User.totalPoints
     * Dependencies: User entity, PointDeduction entity, UserPointDeductionRelation
     * Steps: 
     *   1) Create admin/issuer user
     *   2) Create target user
     *   3) Verify initial totalPoints is 0
     *   4) Issue first point deduction
     *   5) Verify totalPoints is updated
     *   6) Issue second point deduction
     *   7) Verify totalPoints is sum of both deductions
     *   8) Issue third point deduction with different amount
     *   9) Verify totalPoints is sum of all three
     * Business Logic: Sum of all point deductions for the user
     */
    
    // Step 1: Create admin/issuer user
    await controller.callInteraction('CreateUser', {
      user: { id: 'super-admin', role: 'admin' },
      payload: {
        name: 'Points Admin',
        email: 'points.admin@example.com',
        phone: '1111111111',
        role: 'admin'
      }
    })
    
    const adminUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'points.admin@example.com'] }),
      undefined,
      ['id', 'role']
    )
    
    // Step 2: Create target user
    await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        name: 'Points Test User',
        email: 'points.test@example.com',
        phone: '2222222222',
        role: 'student'
      }
    })
    
    const targetUser = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'points.test@example.com'] }),
      undefined,
      ['id', 'totalPoints']
    )
    
    // Step 3: Verify initial totalPoints is 0
    expect(targetUser).toBeDefined()
    expect(targetUser.totalPoints).toBe(0) // Should be 0 with no deductions
    
    // Step 4: Issue first point deduction (5 points)
    await controller.callInteraction('IssuePointDeduction', {
      user: adminUser,
      payload: {
        userId: targetUser.id,
        reason: 'First violation',
        points: 5,
        category: 'discipline',
        description: 'Late return',
        evidence: 'Security log'
      }
    })
    
    // Step 5: Verify totalPoints is updated to 5
    const userAfterFirst = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
      undefined,
      ['id', 'totalPoints']
    )
    
    expect(userAfterFirst.totalPoints).toBe(5)
    
    // Step 6: Issue second point deduction (3 points)
    await controller.callInteraction('IssuePointDeduction', {
      user: adminUser,
      payload: {
        userId: targetUser.id,
        reason: 'Second violation',
        points: 3,
        category: 'cleanliness',
        description: 'Room inspection failed',
        evidence: 'Inspection report'
      }
    })
    
    // Step 7: Verify totalPoints is sum of both deductions (5 + 3 = 8)
    const userAfterSecond = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
      undefined,
      ['id', 'totalPoints']
    )
    
    expect(userAfterSecond.totalPoints).toBe(8)
    
    // Step 8: Issue third point deduction (10 points)
    await controller.callInteraction('IssuePointDeduction', {
      user: adminUser,
      payload: {
        userId: targetUser.id,
        reason: 'Third violation',
        points: 10,
        category: 'discipline',
        description: 'Major rule violation',
        evidence: 'Witness report'
      }
    })
    
    // Step 9: Verify totalPoints is sum of all three (5 + 3 + 10 = 18)
    const userAfterThird = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
      undefined,
      ['id', 'totalPoints']
    )
    
    expect(userAfterThird.totalPoints).toBe(18)
    
    // Additional test: Verify totalPoints for user with no deductions stays 0
    await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        name: 'No Deductions User',
        email: 'no.deductions@example.com',
        phone: '3333333333',
        role: 'student'
      }
    })
    
    const userNoDeductions = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'email', value: ['=', 'no.deductions@example.com'] }),
      undefined,
      ['id', 'totalPoints']
    )
    
    expect(userNoDeductions.totalPoints).toBe(0)
  })
}) 