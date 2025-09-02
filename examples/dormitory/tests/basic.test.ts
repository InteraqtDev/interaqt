import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts, UserBedAssignment, DormitoryLeadership } from '../backend'

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

  test('User entity Transform computation creates users from interaction events', async () => {
    /**
     * Test Plan for: User entity Transform computation
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Call user creation interaction 2) Verify user entity is created 3) Verify properties are set correctly
     * Business Logic: User entities are created through Transform computation from InteractionEventEntity when user creation interactions occur
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // First create a CreateUser interaction to test with
    const CreateUserInteraction = Interaction.create({
      name: 'CreateUser',
      action: Action.create({ name: 'create' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'name', required: true }),
          PayloadItem.create({ name: 'email', required: true }),
          PayloadItem.create({ name: 'role', required: false }),
          PayloadItem.create({ name: 'phoneNumber', required: false })
        ]
      })
    })
    
    // Add this interaction to the controller
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions: [...interactions, CreateUserInteraction],
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Call the user creation interaction
    const result = await testController.callInteraction('CreateUser', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'John Doe',
        email: 'john.doe@example.com',
        role: 'student',
        phoneNumber: '+1-234-567-8900'
      }
    })
    
    // Verify user was created via Transform computation
    const users = await testSystem.storage.find('User', 
      undefined,
      undefined,
      ['id', 'name', 'email', 'role', 'status', 'phoneNumber']
    )
    
    expect(users.length).toBe(1)
    const user = users[0]
    
    // Verify all properties are set correctly from the payload
    expect(user.name).toBe('John Doe')
    expect(user.email).toBe('john.doe@example.com')
    expect(user.role).toBe('student')
    expect(user.status).toBe('active')  // Default value from Transform
    expect(user.phoneNumber).toBe('+1-234-567-8900')
    expect(user.id).toBeDefined()  // System generated
  })

  test('User entity Transform handles multiple interaction name formats', async () => {
    /**
     * Test Plan for: User entity Transform computation - alternative interaction names
     * Dependencies: User entity, InteractionEventEntity  
     * Steps: 1) Test different interaction name formats 2) Verify all create users 3) Verify default values
     * Business Logic: Transform should handle various user creation interaction naming conventions
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // Create interactions with different naming formats
    const createUserInteraction = Interaction.create({
      name: 'createUser',
      action: Action.create({ name: 'create' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'name', required: true }),
          PayloadItem.create({ name: 'email', required: true }),
          PayloadItem.create({ name: 'role', required: false })
        ]
      })
    })
    
    const registerUserInteraction = Interaction.create({
      name: 'registerUser',
      action: Action.create({ name: 'register' }),
      payload: Payload.create({
        items: [
          PayloadItem.create({ name: 'name', required: true }),
          PayloadItem.create({ name: 'email', required: true }),
          PayloadItem.create({ name: 'role', required: false })
        ]
      })
    })
    
    // Add these interactions to the controller
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions: [...interactions, createUserInteraction, registerUserInteraction],
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Test createUser format
    await testController.callInteraction('createUser', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Alice Smith',
        email: 'alice@example.com'
      }
    })
    
    // Test registerUser format  
    await testController.callInteraction('registerUser', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        role: 'administrator'
      }
    })
    
    // Verify both users were created
    const users = await testSystem.storage.find('User', 
      undefined,
      undefined,
      ['id', 'name', 'email', 'role', 'status', 'phoneNumber']
    )
    
    expect(users.length).toBe(2)
    
    // Verify Alice (with defaults)
    const alice = users.find(u => u.name === 'Alice Smith')
    expect(alice).toBeDefined()
    expect(alice.email).toBe('alice@example.com')
    expect(alice.role).toBe('student')  // Default when not provided
    expect(alice.status).toBe('active')
    expect(alice.phoneNumber).toBeUndefined()  // Not provided
    
    // Verify Bob (with custom role)
    const bob = users.find(u => u.name === 'Bob Johnson')
    expect(bob).toBeDefined()
    expect(bob.email).toBe('bob@example.com')
    expect(bob.role).toBe('administrator')  // Custom role from payload
    expect(bob.status).toBe('active')
  })
  
  test('User entity Transform ignores non-user creation interactions', async () => {
    /**
     * Test Plan for: User entity Transform computation - selective processing
     * Dependencies: User entity, InteractionEventEntity
     * Steps: 1) Call non-user creation interactions 2) Verify no users are created 3) Verify Transform returns null for irrelevant events
     * Business Logic: Transform should only create users for specific user creation interactions
     */
    
    // Call the existing CreateDormitory interaction (which should not create users)
    await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Building A',
        location: 'Campus North',
        bedCount: 4
      }
    })
    
    // Call another existing interaction (modifyBehaviorScore)
    await controller.callInteraction('modifyBehaviorScore', {
      user: { id: 'admin-user-1' },
      payload: {
        userId: 'user123',
        newScore: 85,
        reason: 'Test reason'
      }
    })
    
    // Verify no users were created by these non-user creation interactions
    const users = await system.storage.find('User', 
      undefined,
      undefined,
      ['id', 'name', 'email']
    )
    
    expect(users.length).toBe(0)
  })

  test('Dormitory entity Transform computation creates dormitories from createDormitory interaction', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Call createDormitory interaction (I101) 2) Verify dormitory entity is created 3) Verify properties are set correctly from payload
     * Business Logic: Dormitory entities are created through Transform computation from InteractionEventEntity when createDormitory interaction occurs
     */
    
    // Call the createDormitory interaction (I101)
    const result = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Building A',
        location: 'Campus North',
        bedCount: 4
      }
    })
    
    // Verify dormitory was created via Transform computation
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    
    // Verify all properties are set correctly from the payload
    expect(dormitory.name).toBe('Building A')
    expect(dormitory.location).toBe('Campus North')
    expect(dormitory.maxBeds).toBe(4)  // bedCount mapped to maxBeds
    expect(dormitory.status).toBe('active')  // Default value from Transform
    expect(dormitory.id).toBeDefined()  // System generated
  })

  test('Dormitory entity Transform ignores non-createDormitory interactions', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation - selective processing
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Call non-dormitory creation interactions 2) Verify no dormitories are created 3) Verify Transform returns null for irrelevant events
     * Business Logic: Transform should only create dormitories for the createDormitory interaction
     */
    
    // Call non-dormitory creation interactions
    await controller.callInteraction('modifyBehaviorScore', {
      user: { id: 'admin-user-1' },
      payload: {
        userId: 'user123',
        newScore: 85,
        reason: 'Test reason'
      }
    })
    
    await controller.callInteraction('assignUserToBed', {
      user: { id: 'admin-user-1' },
      payload: {
        userId: 'user123',
        bedId: 'bed456'
      }
    })
    
    // Verify no dormitories were created by these non-dormitory creation interactions
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name']
    )
    
    expect(dormitories.length).toBe(0)
  })

  test('Dormitory entity Transform handles multiple dormitory creations', async () => {
    /**
     * Test Plan for: Dormitory entity Transform computation - multiple creations
     * Dependencies: Dormitory entity, InteractionEventEntity
     * Steps: 1) Create multiple dormitories with different payloads 2) Verify all are created 3) Verify each has correct properties
     * Business Logic: Transform should handle multiple separate dormitory creation events
     */
    
    // Create first dormitory
    await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Building A',
        location: 'Campus North',
        bedCount: 4
      }
    })
    
    // Create second dormitory  
    await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-2' },
      payload: {
        name: 'Building B',
        location: 'Campus South',
        bedCount: 6
      }
    })
    
    // Verify both dormitories were created
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(2)
    
    // Verify first dormitory
    const buildingA = dormitories.find(d => d.name === 'Building A')
    expect(buildingA).toBeDefined()
    expect(buildingA.location).toBe('Campus North')
    expect(buildingA.maxBeds).toBe(4)
    expect(buildingA.status).toBe('active')
    
    // Verify second dormitory
    const buildingB = dormitories.find(d => d.name === 'Building B')
    expect(buildingB).toBeDefined()
    expect(buildingB.location).toBe('Campus South')
    expect(buildingB.maxBeds).toBe(6)
    expect(buildingB.status).toBe('active')
  })

  test('Bed entities created through Dormitory Transform computation (_parent:Dormitory)', async () => {
    /**
     * Test Plan for: _parent:Dormitory
     * This tests the Dormitory's Transform computation that creates Bed entities
     * Dependencies: Dormitory entity, Bed entity, BedDormitory relation, createDormitory interaction (I101)
     * Steps: 1) Trigger createDormitory interaction with bedCount 2) Verify dormitory is created 3) Verify beds are created 4) Verify bed properties and relations
     * Business Logic: When a dormitory is created with bedCount=N, exactly N beds should be created and linked to that dormitory
     */
    
    // Call the createDormitory interaction (I101) with specific bedCount
    const result = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user-1' },
      payload: {
        name: 'Test Building',
        location: 'Test Campus',
        bedCount: 5
      }
    })
    
    // Verify dormitory was created
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    expect(dormitory.name).toBe('Test Building')
    expect(dormitory.maxBeds).toBe(5)
    
    // Verify beds were created via the parent Dormitory's Transform computation
    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status']
    )
    
    expect(beds.length).toBe(5)
    
    // Verify bed properties - should be numbered 1, 2, 3, 4, 5
    const bedNumbers = beds.map(b => b.number).sort()
    expect(bedNumbers).toEqual(['1', '2', '3', '4', '5'])
    
    // Verify all beds have active status
    beds.forEach(bed => {
      expect(bed.status).toBe('active')
      expect(bed.id).toBeDefined()
    })
    
    // Import the relation to test the link between beds and dormitory
    const { BedDormitory } = await import('../backend')
    
    // Verify BedDormitory relations were created linking beds to dormitory
    const bedDormitoryRelations = await system.storage.find(BedDormitory.name,
      undefined,
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'number'] }],
        ['target', { attributeQuery: ['id', 'name'] }]
      ]
    )
    
    expect(bedDormitoryRelations.length).toBe(5)
    
    // Verify each relation links a bed to the dormitory
    bedDormitoryRelations.forEach(relation => {
      expect(relation.source).toBeDefined()
      expect(relation.target).toBeDefined()
      expect(relation.target.id).toBe(dormitory.id)
      expect(relation.target.name).toBe('Test Building')
      expect(['1', '2', '3', '4', '5']).toContain(relation.source.number)
    })
  })

  test('BehaviorViolation Transform computation creates violations from interaction events', async () => {
    /**
     * Test Plan for: BehaviorViolation Transform computation
     * Dependencies: User entity (for violator and reporter relations), BehaviorViolation entity, UserViolationRelation, ViolationReporterRelation, ViolationRules dictionary
     * Steps: 1) Create test users 2) Trigger recordBehaviorViolation interaction 3) Verify BehaviorViolation entity is created 4) Verify scoreDeduction lookup from ViolationRules 5) Verify timestamp is set 6) Verify UserViolationRelation 7) Verify ViolationReporterRelation
     * Business Logic: Transform creates BehaviorViolation entity when recording violation, with scoreDeduction from ViolationRules dictionary
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // Use the existing interactions from backend (including RecordBehaviorViolation)
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions,  // Use existing interactions
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // First create test users (violator and reporter)
    const violatorUser = await testSystem.storage.create('User', {
      name: 'John Violator',
      email: 'violator@example.com',
      role: 'student',
      status: 'active'
    })
    
    const reporterUser = await testSystem.storage.create('User', {
      name: 'Jane Reporter',
      email: 'reporter@example.com',
      role: 'dormitory_leader',
      status: 'active'
    })
    
    // Call the recordBehaviorViolation interaction
    const result = await testController.callInteraction('recordBehaviorViolation', {
      user: reporterUser,
      payload: {
        userId: violatorUser.id,
        violationType: 'noiseViolation',
        description: 'Playing loud music after quiet hours',
        evidenceUrl: 'https://example.com/evidence/noise1.mp4'
      }
    })
    
    // Verify BehaviorViolation entity was created
    const violations = await testSystem.storage.find('BehaviorViolation', 
      undefined,
      undefined,
      ['id', 'violationType', 'description', 'scoreDeduction', 'timestamp', 'evidenceUrl', 'status']
    )
    
    expect(violations.length).toBe(1)
    const violation = violations[0]
    
    // Verify all properties are set correctly
    expect(violation.violationType).toBe('noiseViolation')
    expect(violation.description).toBe('Playing loud music after quiet hours')
    expect(violation.scoreDeduction).toBe(10)  // From ViolationRules dictionary
    expect(violation.evidenceUrl).toBe('https://example.com/evidence/noise1.mp4')
    expect(violation.status).toBe('active')
    expect(violation.id).toBeDefined()
    
    // Verify timestamp is recent (within last minute)
    const now = Math.floor(Date.now() / 1000)
    expect(violation.timestamp).toBeGreaterThan(now - 60)
    expect(violation.timestamp).toBeLessThanOrEqual(now)
    
    // Import UserViolationRelation to get its name
    const { UserViolationRelation, ViolationReporterRelation } = await import('../backend')
    
    // Verify UserViolationRelation was created (violator relation)
    const violatorRelations = await testSystem.storage.find(UserViolationRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', violatorUser.id] })
        .and({ key: 'target.id', value: ['=', violation.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'violationType'] }]
      ]
    )
    
    expect(violatorRelations.length).toBe(1)
    const violatorRelation = violatorRelations[0]
    expect(violatorRelation.source.id).toBe(violatorUser.id)
    expect(violatorRelation.target.id).toBe(violation.id)
    
    // Verify ViolationReporterRelation was created (reporter relation)
    const reporterRelations = await testSystem.storage.find(ViolationReporterRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', reporterUser.id] })
        .and({ key: 'target.id', value: ['=', violation.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'violationType'] }]
      ]
    )
    
    expect(reporterRelations.length).toBe(1)
    const reporterRelation = reporterRelations[0]
    expect(reporterRelation.source.id).toBe(reporterUser.id)
    expect(reporterRelation.target.id).toBe(violation.id)
  })

  test('BehaviorViolation Transform looks up different violation types correctly', async () => {
    /**
     * Test Plan for: BehaviorViolation scoreDeduction lookup from ViolationRules
     * Dependencies: ViolationRules dictionary with different violation types and scores
     * Steps: 1) Create users 2) Record violations of different types 3) Verify scoreDeduction matches ViolationRules 4) Test unknown violation type defaults to 0
     * Business Logic: scoreDeduction should be looked up from ViolationRules dictionary based on violationType
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // Use the existing interactions from backend (including RecordBehaviorViolation)
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions,  // Use existing interactions
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Create test users
    const violatorUser = await testSystem.storage.create('User', {
      name: 'Test Violator',
      email: 'violator@example.com',
      role: 'student',
      status: 'active'
    })
    
    const reporterUser = await testSystem.storage.create('User', {
      name: 'Test Reporter',
      email: 'reporter@example.com',
      role: 'dormitory_leader',
      status: 'active'
    })
    
    // Test different violation types from ViolationRules
    
    // 1. Test noiseViolation (score: 10)
    await testController.callInteraction('recordBehaviorViolation', {
      user: reporterUser,
      payload: {
        userId: violatorUser.id,
        violationType: 'noiseViolation',
        description: 'Noise violation test'
      }
    })
    
    // 2. Test cleanlinessViolation (score: 15)
    await testController.callInteraction('recordBehaviorViolation', {
      user: reporterUser,
      payload: {
        userId: violatorUser.id,
        violationType: 'cleanlinessViolation',
        description: 'Cleanliness violation test'
      }
    })
    
    // 3. Test guestPolicyViolation (score: 20)
    await testController.callInteraction('recordBehaviorViolation', {
      user: reporterUser,
      payload: {
        userId: violatorUser.id,
        violationType: 'guestPolicyViolation',
        description: 'Guest policy violation test'
      }
    })
    
    // 4. Test unknown violation type (should default to 0)
    await testController.callInteraction('recordBehaviorViolation', {
      user: reporterUser,
      payload: {
        userId: violatorUser.id,
        violationType: 'unknownViolationType',
        description: 'Unknown violation type test'
      }
    })
    
    // Verify all violations were created with correct scoreDeduction
    const violations = await testSystem.storage.find('BehaviorViolation', 
      undefined,
      undefined,  // Remove orderBy to avoid SQL column issues
      ['id', 'violationType', 'scoreDeduction', 'description']
    )
    
    expect(violations.length).toBe(4)
    
    // Verify scores match ViolationRules dictionary - find each violation type
    const noiseViolation = violations.find(v => v.violationType === 'noiseViolation')
    expect(noiseViolation).toBeDefined()
    expect(noiseViolation.scoreDeduction).toBe(10)
    
    const cleanlinessViolation = violations.find(v => v.violationType === 'cleanlinessViolation')
    expect(cleanlinessViolation).toBeDefined()
    expect(cleanlinessViolation.scoreDeduction).toBe(15)
    
    const guestPolicyViolation = violations.find(v => v.violationType === 'guestPolicyViolation')
    expect(guestPolicyViolation).toBeDefined()
    expect(guestPolicyViolation.scoreDeduction).toBe(20)
    
    const unknownViolation = violations.find(v => v.violationType === 'unknownViolationType')
    expect(unknownViolation).toBeDefined()
    expect(unknownViolation.scoreDeduction).toBe(0)  // Default for unknown types
  })

  test('EvictionRequest entity Transform computation creates eviction requests from interaction events', async () => {
    /**
     * Test Plan for: EvictionRequest entity Transform computation
     * Dependencies: EvictionRequest entity, EvictionTargetRelation, EvictionRequesterRelation, User entity
     * Steps: 1) Create test users 2) Call submitEvictionRequest interaction 3) Verify EvictionRequest entity is created 4) Verify EvictionTargetRelation and EvictionRequesterRelation are created 5) Verify all _owner properties are set correctly
     * Business Logic: EvictionRequest entities are created through Transform computation from InteractionEventEntity when submitEvictionRequest interaction occurs, creating relations to target user and requester
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // Use the existing interactions from backend (including SubmitEvictionRequest)
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions,  // Use existing interactions
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Create test users
    const targetUser = await testSystem.storage.create('User', {
      name: 'Target User',
      email: 'target@example.com',
      role: 'student',
      status: 'active',
      behaviorScore: 30  // Low score to justify eviction
    })
    
    const requesterUser = await testSystem.storage.create('User', {
      name: 'Requester User',
      email: 'requester@example.com',
      role: 'dormitory_leader',
      status: 'active'
    })
    
    // Record the timestamp before the interaction to verify requestDate
    const beforeTimestamp = Math.floor(Date.now() / 1000)
    
    // Call submitEvictionRequest interaction
    const result = await testController.callInteraction('submitEvictionRequest', {
      user: requesterUser,
      payload: {
        targetUserId: targetUser.id,
        reason: 'Poor behavior score and multiple violations',
        supportingEvidence: 'Evidence document URL'
      }
    })
    
    // Verify no errors occurred
    expect(result.error).toBeUndefined()
    
    // Record timestamp after interaction
    const afterTimestamp = Math.floor(Date.now() / 1000)
    
    // Verify EvictionRequest entity was created
    const evictionRequests = await testSystem.storage.find('EvictionRequest', 
      undefined,
      undefined,
      ['id', 'reason', 'status', 'requestDate', 'supportingEvidence']
    )
    
    expect(evictionRequests.length).toBe(1)
    const evictionRequest = evictionRequests[0]
    
    // Verify _owner properties are set correctly
    expect(evictionRequest.reason).toBe('Poor behavior score and multiple violations')
    expect(evictionRequest.status).toBe('pending')  // Default initial status
    expect(evictionRequest.requestDate).toBeGreaterThanOrEqual(beforeTimestamp)
    expect(evictionRequest.requestDate).toBeLessThanOrEqual(afterTimestamp)
    expect(evictionRequest.supportingEvidence).toBe('Evidence document URL')
    
    // Import relation instances for correct naming
    const { EvictionTargetRelation, EvictionRequesterRelation } = await import('../backend')
    
    // Verify EvictionTargetRelation was created (targetUser relation)
    const targetRelations = await testSystem.storage.find(EvictionTargetRelation.name,
      MatchExp.atom({ key: 'target.id', value: ['=', evictionRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )
    
    expect(targetRelations.length).toBe(1)
    const targetRelation = targetRelations[0]
    expect(targetRelation.source.id).toBe(targetUser.id)
    expect(targetRelation.source.name).toBe('Target User')
    expect(targetRelation.target.id).toBe(evictionRequest.id)
    expect(targetRelation.target.reason).toBe('Poor behavior score and multiple violations')
    
    // Verify EvictionRequesterRelation was created (requester relation)
    const requesterRelations = await testSystem.storage.find(EvictionRequesterRelation.name,
      MatchExp.atom({ key: 'target.id', value: ['=', evictionRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'reason'] }]
      ]
    )
    
    expect(requesterRelations.length).toBe(1)
    const requesterRelation = requesterRelations[0]
    expect(requesterRelation.source.id).toBe(requesterUser.id)
    expect(requesterRelation.source.name).toBe('Requester User')
    expect(requesterRelation.target.id).toBe(evictionRequest.id)
    expect(requesterRelation.target.reason).toBe('Poor behavior score and multiple violations')
    
    // Test case with optional supportingEvidence not provided
    const result2 = await testController.callInteraction('submitEvictionRequest', {
      user: requesterUser,
      payload: {
        targetUserId: targetUser.id,
        reason: 'Another eviction request'
        // No supportingEvidence provided
      }
    })
    
    expect(result2.error).toBeUndefined()
    
    // Verify second EvictionRequest was created without supportingEvidence
    const allEvictionRequests = await testSystem.storage.find('EvictionRequest', 
      undefined,
      undefined,
      ['id', 'reason', 'supportingEvidence']
    )
    
    expect(allEvictionRequests.length).toBe(2)
    const secondRequest = allEvictionRequests.find(r => r.reason === 'Another eviction request')
    expect(secondRequest).toBeDefined()
    expect(secondRequest.supportingEvidence).toBeUndefined()  // Optional field not provided
  })

  test('UserBedAssignment relation StateMachine computation', async () => {
    /**
     * Test Plan for: UserBedAssignment relation StateMachine
     * Dependencies: User entity, Bed entity
     * Steps: 1) Create user and bed 2) Verify no initial assignment 3) Trigger assignUserToBed to create relation 4) Verify relation created 5) Trigger removeUserFromDormitory to delete relation 6) Verify relation deleted
     * Business Logic: StateMachine manages UserBedAssignment relation lifecycle - creation via AssignUserToBed and deletion via RemoveUserFromDormitory
     */
    
    // Create test user and bed first via createDormitory (which creates beds)
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user' },
      payload: {
        name: 'Test Dormitory',
        location: 'Test Building',
        bedCount: 2
      }
    })
    
    // Get the created beds
    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status']
    )
    expect(beds.length).toBe(2)
    const testBed = beds[0]
    
    // Create test user directly via storage since createUser interaction doesn't exist
    const testUser = await system.storage.create('User', {
      name: 'Test User',
      email: 'test@example.com',
      role: 'student',
      status: 'active'
    })
    expect(testUser).toBeDefined()
    
    // Initial state: No UserBedAssignment relation should exist
    const initialRelations = await system.storage.find(UserBedAssignment.name,
      undefined,
      undefined,
      ['id']
    )
    expect(initialRelations.length).toBe(0)
    
    // Test assignUserToBed interaction - notAssigned → assigned state transition
    const assignResult = await controller.callInteraction('assignUserToBed', {
      user: { id: 'admin-user' },
      payload: {
        userId: testUser.id,
        bedId: testBed.id
      }
    })
    
    expect(assignResult.error).toBeUndefined()
    
    // Verify UserBedAssignment relation was created
    const assignments = await system.storage.find(UserBedAssignment.name,
      MatchExp.atom({ key: 'source.id', value: ['=', testUser.id] }),
      undefined,
      [
        'id',
        'assignmentDate',
        'status', 
        'assignedBy',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'number'] }]
      ]
    )
    
    expect(assignments.length).toBe(1)
    const assignment = assignments[0]
    expect(assignment.status).toBe('active')
    expect(assignment.assignedBy).toBe('admin-user')
    expect(assignment.assignmentDate).toBeTypeOf('number')
    expect(assignment.source.id).toBe(testUser.id)
    expect(assignment.target.id).toBe(testBed.id)
    
    // Test removeUserFromDormitory interaction - assigned → notAssigned state transition  
    const removeResult = await controller.callInteraction('removeUserFromDormitory', {
      user: { id: 'admin-user' },
      payload: {
        userId: testUser.id,
        reason: 'Test removal'
      }
    })
    
    expect(removeResult.error).toBeUndefined()
    
    // Verify UserBedAssignment relation was deleted
    const assignmentsAfterRemoval = await system.storage.find(UserBedAssignment.name,
      MatchExp.atom({ key: 'source.id', value: ['=', testUser.id] }),
      undefined,
      ['id']
    )
    
    expect(assignmentsAfterRemoval.length).toBe(0)
  })

  test('DormitoryLeadership relation StateMachine computation', async () => {
    /**
     * Test Plan for: DormitoryLeadership relation StateMachine
     * Dependencies: User entity, Dormitory entity
     * Steps: 1) Create user and dormitory 2) Verify no initial leadership 3) Trigger assignDormitoryLeader to create relation 4) Verify relation created 5) Trigger removeDormitoryLeader to delete relation 6) Verify relation deleted
     * Business Logic: StateMachine manages DormitoryLeadership relation lifecycle - creation via AssignDormitoryLeader and deletion via RemoveDormitoryLeader
     */
    
    // Create test dormitory first via createDormitory interaction
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user' },
      payload: {
        name: 'Test Dormitory',
        location: 'Test Building',
        bedCount: 2
      }
    })
    
    // Get the created dormitory
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'location', 'status']
    )
    expect(dormitories.length).toBe(1)
    const testDormitory = dormitories[0]
    
    // Create test user directly via storage since createUser interaction doesn't exist
    const testUser = await system.storage.create('User', {
      name: 'Test Leader',
      email: 'leader@example.com',
      role: 'student',
      status: 'active'
    })
    expect(testUser).toBeDefined()
    
    // Initial state: No DormitoryLeadership relation should exist
    const initialRelations = await system.storage.find(DormitoryLeadership.name,
      undefined,
      undefined,
      ['id']
    )
    expect(initialRelations.length).toBe(0)
    
    // Test assignDormitoryLeader interaction - leaderNotAssigned → leaderAssigned state transition
    const assignResult = await controller.callInteraction('assignDormitoryLeader', {
      user: { id: 'admin-user' },
      payload: {
        userId: testUser.id,
        dormitoryId: testDormitory.id
      }
    })
    
    expect(assignResult.error).toBeUndefined()
    
    // Verify DormitoryLeadership relation was created
    const leaderships = await system.storage.find(DormitoryLeadership.name,
      MatchExp.atom({ key: 'source.id', value: ['=', testUser.id] }),
      undefined,
      [
        'id',
        'assignmentDate',
        'status', 
        'assignedBy',
        ['source', { attributeQuery: ['id', 'name'] }],
        ['target', { attributeQuery: ['id', 'name'] }]
      ]
    )
    
    expect(leaderships.length).toBe(1)
    const leadership = leaderships[0]
    expect(leadership.status).toBe('active')
    expect(leadership.assignedBy).toBe('admin-user')
    expect(leadership.assignmentDate).toBeTypeOf('number')
    expect(leadership.source.id).toBe(testUser.id)
    expect(leadership.target.id).toBe(testDormitory.id)
    
    // Test removeDormitoryLeader interaction - leaderAssigned → leaderNotAssigned state transition  
    const removeResult = await controller.callInteraction('removeDormitoryLeader', {
      user: { id: 'admin-user' },
      payload: {
        userId: testUser.id,
        reason: 'Test removal'
      }
    })
    
    expect(removeResult.error).toBeUndefined()
    
    // Verify DormitoryLeadership relation was deleted
    const leadershipsAfterRemoval = await system.storage.find(DormitoryLeadership.name,
      MatchExp.atom({ key: 'source.id', value: ['=', testUser.id] }),
      undefined,
      ['id']
    )
    
    expect(leadershipsAfterRemoval.length).toBe(0)
  })

  test('BedDormitory relation created via parent Bed entity (_parent:Bed pattern)', async () => {
    /**
     * Test Plan for: BedDormitory relation (_parent:Bed computation)
     * Dependencies: Bed entity, Dormitory entity, BedDormitory relation
     * Steps: 1) Create dormitory via createDormitory interaction 2) Verify Bed entities are created 3) Verify BedDormitory relations are created automatically 4) Verify relation properties are correct
     * Business Logic: BedDormitory relations are created when Bed entities are created via Dormitory's Transform computation, establishing the parent-child relationship
     */
    
    // Create dormitory which should create beds and BedDormitory relations
    const dormitoryResult = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user' },
      payload: {
        name: 'Test Dormitory for Bed Relations',
        location: 'Building A',
        bedCount: 3
      }
    })
    
    expect(dormitoryResult.error).toBeUndefined()
    
    // Verify Dormitory was created
    const dormitories = await system.storage.find('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory for Bed Relations'] }),
      undefined,
      ['id', 'name', 'location', 'maxBeds', 'status']
    )
    
    expect(dormitories.length).toBe(1)
    const dormitory = dormitories[0]
    expect(dormitory.name).toBe('Test Dormitory for Bed Relations')
    expect(dormitory.location).toBe('Building A')
    expect(dormitory.maxBeds).toBe(3)  // Should be mapped from bedCount
    expect(dormitory.status).toBe('active')
    
    // Verify Bed entities were created (via 'beds' relation property)
    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status']
    )
    
    expect(beds.length).toBe(3)
    
    // Verify beds have correct properties
    const bedNumbers = beds.map(b => b.number).sort()
    expect(bedNumbers).toEqual(['1', '2', '3'])  // Sequential numbering
    beds.forEach(bed => {
      expect(bed.status).toBe('active')  // Default status
      expect(bed.id).toBeDefined()
    })
    
    // Import BedDormitory relation to get its name
    const { BedDormitory } = await import('../backend')
    
    // Verify BedDormitory relations were created (_parent:Bed pattern)
    const bedDormitoryRelations = await system.storage.find(BedDormitory.name,
      undefined,
      undefined,
      [
        'id',
        'createdDate',
        ['source', { attributeQuery: ['id', 'number', 'status'] }],  // Bed (source)
        ['target', { attributeQuery: ['id', 'name', 'location'] }]   // Dormitory (target)
      ]
    )
    
    expect(bedDormitoryRelations.length).toBe(3)  // One relation per bed
    
    // Verify each BedDormitory relation links to the correct dormitory
    bedDormitoryRelations.forEach(relation => {
      expect(relation.target.id).toBe(dormitory.id)
      expect(relation.target.name).toBe('Test Dormitory for Bed Relations')
      expect(relation.target.location).toBe('Building A')
      expect(relation.createdDate).toBeTypeOf('number')  // Timestamp should be set
      
      // Verify source bed exists and has correct properties
      expect(relation.source).toBeDefined()
      expect(relation.source.id).toBeDefined()
      expect(relation.source.status).toBe('active')
      expect(['1', '2', '3']).toContain(relation.source.number)
    })
    
    // Verify that each bed is linked to exactly one dormitory
    const bedIds = beds.map(b => b.id)
    const relationBedIds = bedDormitoryRelations.map(r => r.source.id)
    
    bedIds.forEach(bedId => {
      const relationsForBed = bedDormitoryRelations.filter(r => r.source.id === bedId)
      expect(relationsForBed.length).toBe(1)  // Each bed should have exactly one dormitory relation
    })
    
    // Test edge case: Create another dormitory to verify relations are separate
    const dormitory2Result = await controller.callInteraction('createDormitory', {
      user: { id: 'admin-user' },
      payload: {
        name: 'Second Dormitory',
        location: 'Building B',
        bedCount: 2
      }
    })
    
    expect(dormitory2Result.error).toBeUndefined()
    
    // Verify total beds and relations increased correctly
    const allBeds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id']
    )
    expect(allBeds.length).toBe(5)  // 3 + 2 = 5 total beds
    
    const allBedDormitoryRelations = await system.storage.find(BedDormitory.name,
      undefined,
      undefined,
      ['id']
    )
    expect(allBedDormitoryRelations.length).toBe(5)  // 3 + 2 = 5 total relations
  })

  test('EvictionDeciderRelation Transform computation creates relations from processEvictionRequest interaction', async () => {
    /**
     * Test Plan for: EvictionDeciderRelation Transform computation
     * Dependencies: EvictionDeciderRelation, EvictionRequest entity, User entity, ProcessEvictionRequest interaction
     * Steps: 1) Create users and eviction request 2) Call processEvictionRequest interaction 3) Verify EvictionDeciderRelation is created 4) Verify relation links correct entities
     * Business Logic: EvictionDeciderRelation is created when an admin processes an eviction request, linking the deciding admin to the request
     */
    
    // Create a dedicated system for this test
    const testSystem = new MonoSystem(new PGLiteDB())
    
    // Use the existing interactions from backend (including ProcessEvictionRequest)
    const testController = new Controller({
      system: testSystem,
      entities,
      relations,
      interactions,  // Use existing interactions
      activities,
      dict: dicts,
      ignorePermission: true
    })
    await testController.setup(true)
    
    // Create test users
    const targetUser = await testSystem.storage.create('User', {
      name: 'Target User',
      email: 'target@example.com',
      role: 'student',
      status: 'active'
    })
    
    const requesterUser = await testSystem.storage.create('User', {
      name: 'Requester User',
      email: 'requester@example.com',
      role: 'dormitory_leader',
      status: 'active'
    })
    
    const adminUser = await testSystem.storage.create('User', {
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'administrator',
      status: 'active'
    })
    
    // First create an eviction request via SubmitEvictionRequest interaction
    const submitResult = await testController.callInteraction('submitEvictionRequest', {
      user: requesterUser,
      payload: {
        targetUserId: targetUser.id,
        reason: 'Behavior issues requiring immediate action',
        supportingEvidence: 'Multiple violation reports'
      }
    })
    
    expect(submitResult.error).toBeUndefined()
    
    // Get the created EvictionRequest
    const evictionRequests = await testSystem.storage.find('EvictionRequest', 
      undefined,
      undefined,
      ['id', 'reason', 'status']
    )
    
    expect(evictionRequests.length).toBe(1)
    const evictionRequest = evictionRequests[0]
    expect(evictionRequest.status).toBe('pending')
    
    // Import EvictionDeciderRelation to get its name
    const { EvictionDeciderRelation } = await import('../backend')
    
    // Verify no EvictionDeciderRelation exists yet
    const initialDeciderRelations = await testSystem.storage.find(EvictionDeciderRelation.name,
      undefined,
      undefined,
      ['id']
    )
    expect(initialDeciderRelations.length).toBe(0)
    
    // Now process the eviction request (this should create EvictionDeciderRelation)
    const processResult = await testController.callInteraction('processEvictionRequest', {
      user: adminUser,
      payload: {
        requestId: evictionRequest.id,
        decision: 'approved',
        adminNotes: 'Approved due to documented behavior violations'
      }
    })
    
    expect(processResult.error).toBeUndefined()
    
    // Verify EvictionDeciderRelation was created
    const deciderRelations = await testSystem.storage.find(EvictionDeciderRelation.name,
      MatchExp.atom({ key: 'target.id', value: ['=', evictionRequest.id] }),
      undefined,
      [
        'id',
        ['source', { attributeQuery: ['id', 'name', 'role'] }],
        ['target', { attributeQuery: ['id', 'reason', 'status'] }]
      ]
    )
    
    expect(deciderRelations.length).toBe(1)
    const deciderRelation = deciderRelations[0]
    
    // Verify the relation links the correct entities
    expect(deciderRelation.source.id).toBe(adminUser.id)
    expect(deciderRelation.source.name).toBe('Admin User')
    expect(deciderRelation.source.role).toBe('administrator')
    expect(deciderRelation.target.id).toBe(evictionRequest.id)
    expect(deciderRelation.target.reason).toBe('Behavior issues requiring immediate action')
    
    // Test edge case: Process another eviction request with same admin
    const submitResult2 = await testController.callInteraction('submitEvictionRequest', {
      user: requesterUser,
      payload: {
        targetUserId: targetUser.id,
        reason: 'Second eviction request',
        supportingEvidence: 'Additional violations'
      }
    })
    
    expect(submitResult2.error).toBeUndefined()
    
    const allEvictionRequests = await testSystem.storage.find('EvictionRequest', 
      undefined,
      undefined,
      ['id', 'reason']
    )
    expect(allEvictionRequests.length).toBe(2)
    
    const secondRequest = allEvictionRequests.find(r => r.reason === 'Second eviction request')
    expect(secondRequest).toBeDefined()
    
    // Process the second request
    await testController.callInteraction('processEvictionRequest', {
      user: adminUser,
      payload: {
        requestId: secondRequest.id,
        decision: 'rejected',
        adminNotes: 'Insufficient evidence for eviction'
      }
    })
    
    // Verify we now have two EvictionDeciderRelations
    const allDeciderRelations = await testSystem.storage.find(EvictionDeciderRelation.name,
      MatchExp.atom({ key: 'source.id', value: ['=', adminUser.id] }),
      undefined,
      ['id', ['target', { attributeQuery: ['id', 'reason'] }]]
    )
    
    expect(allDeciderRelations.length).toBe(2)
    
    // Verify both relations link to different eviction requests
    const linkedRequestReasons = allDeciderRelations.map(r => r.target.reason).sort()
    expect(linkedRequestReasons).toEqual([
      'Behavior issues requiring immediate action',
      'Second eviction request'
    ])
    
    // Test edge case: Try to process non-existent eviction request
    const invalidProcessResult = await testController.callInteraction('processEvictionRequest', {
      user: adminUser,
      payload: {
        requestId: 'non-existent-id',
        decision: 'approved',
        adminNotes: 'This should not create a relation'
      }
    })
    
    // The interaction should still succeed (no error), but no relation should be created
    expect(invalidProcessResult.error).toBeUndefined()
    
    // Verify relation count hasn't changed
    const finalDeciderRelations = await testSystem.storage.find(EvictionDeciderRelation.name,
      undefined,
      undefined,
      ['id']
    )
    expect(finalDeciderRelations.length).toBe(2)  // Still only 2 relations
  })
}) 