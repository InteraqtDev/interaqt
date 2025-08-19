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
      forceThtrowInteractionError: true
    })

    await controller.setup(true)
  })

  // ===== Phase 1: Entity Computations =====
  
  test('User entity created from CreateUser interaction', async () => {
    /**
     * Test Plan for: User Entity Transform Computation
     * 
     * Dependencies (from expandedDependencies):
     * - InteractionEventEntity: Triggered when CreateUser interaction is called
     * 
     * Test Steps:
     * 1. Setup: No prerequisites needed for creating first user
     * 2. Test Target: Call CreateUser interaction
     *    - CreateUser interaction: Should trigger Transform computation to create User entity
     * 3. Verification: Check User entity was created with correct data
     *    - User should exist with provided name, email, phone, role
     *    - Default values should be applied (status, timestamps)
     * 4. Side Effects: None expected for first user creation
     * 
     * Business Logic Notes:
     * - Role defaults to 'student' if not provided
     * - Status should default to 'active'
     */
    
    // Call CreateUser interaction
    const result = await controller.callInteraction('CreateUser', {
      user: { id: 'admin-1', role: 'admin' }, // Mock admin user
      payload: {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    // Verify user was created
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    expect(users.length).toBe(1)
    
    const user = users[0]
    expect(user.name).toBe('John Doe')
    expect(user.email).toBe('john@example.com')
    expect(user.phone).toBe('1234567890')
    expect(user.role).toBe('student')
    expect(user.status).toBe('active')
  })

  test('Dormitory entity created from CreateDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory Entity Transform Computation
     * 
     * Dependencies (from expandedDependencies):
     * - InteractionEventEntity: Triggered when CreateDormitory interaction is called
     * 
     * Test Steps:
     * 1. Setup: No prerequisites needed for creating dormitory
     * 2. Test Target: Call CreateDormitory interaction
     *    - CreateDormitory interaction: Should trigger Transform computation to create Dormitory entity
     * 3. Verification: Check Dormitory entity was created with correct data
     *    - Dormitory should exist with provided name, capacity, floor, building
     *    - Default values should be applied (status, timestamps)
     * 4. Side Effects: Beds should be created automatically (tested separately)
     * 
     * Business Logic Notes:
     * - Capacity should be 4-6 (business rule to be implemented later)
     * - Status should default to 'active'
     */
    
    // Call CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Dorm A101',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })
    
    // Verify dormitory was created
    const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['*'])
    expect(dormitories.length).toBe(1)
    
    const dormitory = dormitories[0]
    expect(dormitory.name).toBe('Dorm A101')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.floor).toBe(1)
    expect(dormitory.building).toBe('Building A')
    expect(dormitory.status).toBe('active')
  })

  test('PointDeduction entity created from IssuePointDeduction interaction', async () => {
    /**
     * Test Plan for: PointDeduction Entity Transform Computation
     * 
     * Dependencies (from expandedDependencies):
     * - InteractionEventEntity: Triggered when IssuePointDeduction interaction is called
     * 
     * Test Steps:
     * 1. Setup: Create a user to receive the point deduction
     *    - User: Target for the point deduction
     * 2. Test Target: Call IssuePointDeduction interaction
     *    - IssuePointDeduction interaction: Should trigger Transform computation to create PointDeduction entity
     * 3. Verification: Check PointDeduction entity was created with correct data
     *    - PointDeduction should exist with provided reason, points, category, details, evidence
     *    - Default values should be applied (status, timestamps)
     * 4. Side Effects: User's totalPoints should be updated (tested separately)
     * 
     * Business Logic Notes:
     * - Points should be 1-10 (business rule to be implemented later)
     * - Status should default to 'active'
     */
    
    // First create a user to receive the deduction
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Test Student',
        email: 'student@example.com',
        phone: '9876543210',
        role: 'student'
      }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['id'])
    const targetUserId = users[0].id
    
    // Call IssuePointDeduction interaction
    const result = await controller.callInteraction('IssuePointDeduction', {
      user: { id: 'dormhead-1', role: 'dormHead' },
      payload: {
        targetUserId: targetUserId,
        reason: 'Late return',
        points: 5,
        category: 'curfew',
        details: 'Returned 2 hours after curfew',
        evidence: 'Security log entry'
      }
    })
    
    // Verify point deduction was created
    const deductions = await system.storage.find('PointDeduction', undefined, undefined, ['*'])
    expect(deductions.length).toBe(1)
    
    const deduction = deductions[0]
    expect(deduction.reason).toBe('Late return')
    expect(deduction.points).toBe(5)
    expect(deduction.category).toBe('curfew')
    expect(deduction.details).toBe('Returned 2 hours after curfew')
    expect(deduction.evidence).toBe('Security log entry')
    expect(deduction.status).toBe('active')
  })

  test('RemovalRequest entity created from InitiateRemovalRequest interaction', async () => {
    /**
     * Test Plan for: RemovalRequest Entity Transform Computation
     * 
     * Dependencies (from expandedDependencies):
     * - InteractionEventEntity: Triggered when InitiateRemovalRequest interaction is called
     * 
     * Test Steps:
     * 1. Setup: Create a user to be the target of removal request
     *    - User: Target for the removal request
     * 2. Test Target: Call InitiateRemovalRequest interaction
     *    - InitiateRemovalRequest interaction: Should trigger Transform computation to create RemovalRequest entity
     * 3. Verification: Check RemovalRequest entity was created with correct data
     *    - RemovalRequest should exist with provided reason
     *    - Default values should be applied (status, timestamps)
     * 4. Side Effects: Relations to users should be created (tested separately)
     * 
     * Business Logic Notes:
     * - Status should default to 'pending'
     * - Only users with sufficient deductions can be targeted (business rule to be implemented later)
     */
    
    // First create a user to be targeted for removal
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Problem Student',
        email: 'problem@example.com',
        phone: '1111111111',
        role: 'student'
      }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['id'])
    const targetUserId = users[0].id
    
    // Call InitiateRemovalRequest interaction
    const result = await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: 'dormhead-1', role: 'dormHead' },
      payload: {
        targetUserId: targetUserId,
        reason: 'Multiple disciplinary violations'
      }
    })
    
    // Verify removal request was created
    const requests = await system.storage.find('RemovalRequest', undefined, undefined, ['*'])
    expect(requests.length).toBe(1)
    
    const request = requests[0]
    expect(request.reason).toBe('Multiple disciplinary violations')
    expect(request.status).toBe('pending')
  })

  // ===== Phase 2: Entity and Relation Computations =====

  test('Bed entities created automatically with Dormitory', async () => {
    /**
     * Test Plan for: Bed Entity Automatic Creation
     * 
     * Dependencies (from expandedDependencies):
     * - Dormitory: Parent entity that triggers Bed creation
     * 
     * Test Steps:
     * 1. Setup: No prerequisites needed
     * 2. Test Target: Create a Dormitory with specific capacity
     *    - CreateDormitory interaction: Should trigger Bed creation based on capacity
     * 3. Verification: Check that correct number of Beds were created
     *    - Number of beds should equal dormitory capacity
     *    - Each bed should have a unique code (A, B, C, D, etc.)
     *    - Default values should be applied (status, timestamps)
     * 4. Side Effects: DormitoryBedRelation should be created (tested separately)
     * 
     * Business Logic Notes:
     * - Capacity determines number of beds (4-6 beds)
     * - Bed codes are assigned alphabetically (A, B, C, D, E, F)
     * - All beds start with status 'available'
     */
    
    // Call CreateDormitory interaction with capacity 4
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 2,
        building: 'Building B'
      }
    })
    
    // Verify beds were created
    const beds = await system.storage.find('Bed', undefined, undefined, ['*'])
    expect(beds.length).toBe(4)
    
    // Check bed codes
    const bedCodes = beds.map((b: any) => b.code).sort()
    expect(bedCodes).toEqual(['A', 'B', 'C', 'D'])
    
    // Verify default values
    beds.forEach((bed: any) => {
      expect(bed.status).toBe('available')
      expect(bed.createdAt).toBeDefined()
      expect(bed.updatedAt).toBeDefined()
    })
  })

  test('Bed entities created with capacity 6', async () => {
    /**
     * Test Plan for: Bed Entity Creation with Max Capacity
     * 
     * Dependencies (from expandedDependencies):
     * - Dormitory: Parent entity that triggers Bed creation
     * 
     * Test Steps:
     * 1. Setup: No prerequisites needed
     * 2. Test Target: Create a Dormitory with capacity 6
     *    - CreateDormitory interaction: Should create 6 beds
     * 3. Verification: Check that 6 beds were created
     *    - All 6 bed codes should be present (A-F)
     * 4. Side Effects: None additional
     * 
     * Business Logic Notes:
     * - Maximum capacity is 6 beds
     * - All 6 letter codes should be used (A through F)
     */
    
    // Call CreateDormitory interaction with capacity 6
    const result = await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Large Dorm',
        capacity: 6,
        floor: 3,
        building: 'Building C'
      }
    })
    
    // Verify 6 beds were created
    const beds = await system.storage.find('Bed', undefined, undefined, ['*'])
    expect(beds.length).toBe(6)
    
    // Check all bed codes are present
    const bedCodes = beds.map((b: any) => b.code).sort()
    expect(bedCodes).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  test('UserDormitoryRelation created and deleted via StateMachine', async () => {
    /**
     * Test Plan for: UserDormitoryRelation StateMachine Computation
     * 
     * Dependencies (from expandedDependencies):
     * - User: Source entity for relation
     * - Dormitory: Target entity for relation
     * 
     * Test Steps:
     * 1. Setup: Create a user and a dormitory
     *    - User: Student to be assigned
     *    - Dormitory: Dorm to assign user to
     * 2. Test Target: Assign user to dormitory
     *    - AssignUserToDormitory interaction: Should create UserDormitoryRelation
     * 3. Verification: Check relation was created
     *    - Relation should exist linking user and dormitory
     *    - Relation should have assignedBy property
     * 4. Test Deletion: Remove user from dormitory
     *    - RemoveUserFromDormitory interaction: Should delete the relation
     * 5. Verification: Check relation was deleted
     *    - No relation should exist between user and dormitory
     * 
     * Business Logic Notes:
     * - User can only be in one dormitory at a time (n:1 relation)
     * - Relation is hard-deleted (no status field, actual deletion)
     */
    
    // Step 1: Create a user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Test Student',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      }
    })
    
    // Create a dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Test Dorm',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })
    
    // Get the created entities
    const users = await system.storage.find('User', undefined, undefined, ['id'])
    const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['id'])
    const userId = users[0].id
    const dormitoryId = dormitories[0].id
    
    // Step 2: Assign user to dormitory
    await controller.callInteraction('AssignUserToDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        userId: userId,
        dormitoryId: dormitoryId,
        bedCode: 'A'
      }
    })
    
    // Step 3: Verify relation was created by checking user's dormitory property
    const userWithDorm = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id', 'name'] }]]
    )
    expect(userWithDorm.dormitory).toBeDefined()
    expect(userWithDorm.dormitory.id).toBe(dormitoryId)
    
    // Also verify from dormitory side
    const dormWithUsers = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
      undefined,
      ['id', ['users', { attributeQuery: ['id', 'name'] }]]
    )
    expect(dormWithUsers.users).toBeDefined()
    expect(dormWithUsers.users.length).toBe(1)
    expect(dormWithUsers.users[0].id).toBe(userId)
    
    // Step 4: Remove user from dormitory
    const result = await controller.callInteraction('RemoveUserFromDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        userId: userId,
        reason: 'Test removal'
      }
    })

    expect(result.error).toBeUndefined()
    
    // Step 5: Verify relation was deleted
    const userAfterRemove = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    expect(userAfterRemove.dormitory).toBeNull()
    
    // Also verify from dormitory side
    const dormAfterRemove = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
      undefined,
      ['id', ['users', { attributeQuery: ['id'] }]]
    )
    expect(dormAfterRemove.users).toEqual([])
  })

  test('UserDormitoryRelation deleted when RemovalRequest approved', async () => {
    /**
     * Test Plan for: UserDormitoryRelation Deletion via ProcessRemovalRequest
     * 
     * Dependencies (from expandedDependencies):
     * - User: Source entity for relation
     * - Dormitory: Target entity for relation
     * - RemovalRequest: Entity that triggers deletion when approved
     * - RemovalRequestTargetRelation: Links removal request to target user
     * 
     * Test Steps:
     * 1. Setup: Create user, dormitory, and assign user
     *    - User: Student to be removed
     *    - Dormitory: Assigned dormitory
     *    - UserDormitoryRelation: Existing assignment
     * 2. Create removal request
     *    - InitiateRemovalRequest: Creates RemovalRequest and RemovalRequestTargetRelation
     * 3. Process removal request with approval
     *    - ProcessRemovalRequest with decision='approved': Should delete UserDormitoryRelation
     * 4. Verification: Check relation was deleted
     *    - UserDormitoryRelation should no longer exist
     * 
     * Business Logic Notes:
     * - Approved removal requests should remove user from dormitory
     * - This is an alternative deletion path to direct RemoveUserFromDormitory
     */
    
    // Setup: Create user
    await controller.callInteraction('CreateUser', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Problem Student',
        email: 'problem@test.com',
        phone: '9876543210',
        role: 'student'
      }
    })
    
    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        name: 'Dorm B',
        capacity: 4,
        floor: 2,
        building: 'Building B'
      }
    })
    
    const users = await system.storage.find('User', undefined, undefined, ['id'])
    const dormitories = await system.storage.find('Dormitory', undefined, undefined, ['id'])
    const userId = users[0].id
    const dormitoryId = dormitories[0].id
    
    // Assign user to dormitory
    await controller.callInteraction('AssignUserToDormitory', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        userId: userId,
        dormitoryId: dormitoryId,
        bedCode: 'B'
      }
    })
    
    // Verify relation exists
    const userBeforeRequest = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    expect(userBeforeRequest.dormitory).toBeDefined()
    expect(userBeforeRequest.dormitory.id).toBe(dormitoryId)
    
    // Create removal request
    await controller.callInteraction('InitiateRemovalRequest', {
      user: { id: 'dormhead-1', role: 'dormHead' },
      payload: {
        targetUserId: userId,
        reason: 'Multiple violations'
      }
    })
    
    // Get the removal request
    const requests = await system.storage.find('RemovalRequest', undefined, undefined, ['id'])
    const requestId = requests[0].id
    
    // Process and approve the removal request
    await controller.callInteraction('ProcessRemovalRequest', {
      user: { id: 'admin-1', role: 'admin' },
      payload: {
        requestId: requestId,
        decision: 'approved',
        adminComment: 'Approved for removal'
      }
    })
    
    // Verify UserDormitoryRelation was deleted
    const userAfterApproval = await system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    expect(userAfterApproval.dormitory).toBeNull()
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