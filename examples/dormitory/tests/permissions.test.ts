import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

describe('Advanced Permission and Business Rules Tests', () => {
  let system: MonoSystem
  let controller: Controller
  
  // Common test users
  let adminUser: any
  let dormHeadUser: any
  let regularUser: any
  let unauthenticatedUser: null = null
  
  // Test entities
  let testDormitory: any
  let testBed: any
  let anotherDormitory: any

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
    
    // Setup common test users
    adminUser = await system.storage.create('User', {
      name: 'Admin User',
      email: 'admin@test.com',
      role: 'admin'
    })
    
    dormHeadUser = await system.storage.create('User', {
      name: 'Dorm Head',
      email: 'dormhead@test.com',
      role: 'dormHead'
    })
    
    regularUser = await system.storage.create('User', {
      name: 'Regular User',
      email: 'regular@test.com',
      role: 'user'
    })
    
    // Create test dormitories
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Test Dorm',
        capacity: 4
      }
    })
    
    const dormitories = await system.storage.find('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id', 'name', 'capacity']
    )
    testDormitory = dormitories[0]
    
    // Get beds for the test dormitory
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'bedNumber', ['dormitory', { attributeQuery: ['id'] }]]
    )
    testBed = beds.find(b => b.dormitory?.id === testDormitory.id)
    
    // Create another dormitory
    await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Another Dorm',
        capacity: 4
      }
    })
    
    const anotherDorms = await system.storage.find('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Another Dorm'] }),
      undefined,
      ['id']
    )
    anotherDormitory = anotherDorms[0]
    
    // Assign dormHead to testDormitory
    await controller.callInteraction('AppointDormHead', {
      user: adminUser,
      payload: {
        userId: dormHeadUser.id,
        dormitoryId: testDormitory.id
      }
    })
    
    // Assign regularUser to testDormitory
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: regularUser.id,
        dormitoryId: testDormitory.id,
        bedId: testBed.id
      }
    })
  })

  test('ApproveEviction/RejectEviction - only admin can process eviction requests', async () => {
    // First create an eviction request
    // Deduct points from regular user first
    await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'Major violation',
        points: 70,
        category: 'damage'
      }
    })
    
    // Request eviction
    const requestResult = await controller.callInteraction('RequestEviction', {
      user: dormHeadUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'Multiple violations'
      }
    })
    expect(requestResult.error).toBeUndefined()
    
    // Get the request
    const requests = await system.storage.find('EvictionRequest',
      undefined,
      undefined,
      ['id']
    )
    const requestId = requests[0].id
    
    // Admin can approve (allowed)
    const adminApproveResult = await controller.callInteraction('ApproveEviction', {
      user: adminUser,
      payload: {
        requestId: requestId,
        adminComment: 'Approved by admin'
      }
    })
    expect(adminApproveResult.error).toBeUndefined()
    
    // Create another request for rejection test
    const anotherUser = await system.storage.create('User', {
      name: 'Another User',
      email: 'another@evict.com'
    })
    
    // Assign to dormitory
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const availableBed = beds.find(b => b.dormitory?.id === testDormitory.id && b.status === 'vacant')
    
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: anotherUser.id,
        dormitoryId: testDormitory.id,
        bedId: availableBed.id
      }
    })
    
    // Deduct points
    await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: anotherUser.id,
        reason: 'Test violation',
        points: 60,
        category: 'test'
      }
    })
    
    // Request eviction
    await controller.callInteraction('RequestEviction', {
      user: dormHeadUser,
      payload: {
        targetUserId: anotherUser.id,
        reason: 'Test eviction'
      }
    })
    
    const requests2 = await system.storage.find('EvictionRequest',
      MatchExp.atom({ key: 'status', value: ['=', 'pending'] }),
      undefined,
      ['id']
    )
    const request2Id = requests2[0].id
    
    // DormHead cannot approve (denied)
    const dormHeadApproveResult = await controller.callInteraction('ApproveEviction', {
      user: dormHeadUser,
      payload: {
        requestId: request2Id,
        adminComment: 'Invalid approval'
      }
    })
    expect(dormHeadApproveResult.error).toBeDefined()
    expect(dormHeadApproveResult.error.type).toBe('condition check failed')
    
    // Regular user cannot reject (denied)
    const regularRejectResult = await controller.callInteraction('RejectEviction', {
      user: regularUser,
      payload: {
        requestId: request2Id,
        adminComment: 'Invalid rejection'
      }
    })
    expect(regularRejectResult.error).toBeDefined()
    expect(regularRejectResult.error.type).toBe('condition check failed')
    
    // Admin can reject (allowed)
    const adminRejectResult = await controller.callInteraction('RejectEviction', {
      user: adminUser,
      payload: {
        requestId: request2Id,
        adminComment: 'Rejected by admin'
      }
    })
    expect(adminRejectResult.error).toBeUndefined()
  })

  // ==================== Business Rule Tests ====================
  
  test('CreateDormitory - validates capacity between 4 and 6', async () => {
    // Valid capacity 4 (allowed)
    const valid4Result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Capacity 4 Dorm',
        capacity: 4
      }
    })
    expect(valid4Result.error).toBeUndefined()
    
    // Valid capacity 6 (allowed)
    const valid6Result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Capacity 6 Dorm',
        capacity: 6
      }
    })
    expect(valid6Result.error).toBeUndefined()
    
    // Invalid capacity 3 (denied)
    const invalid3Result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Capacity 3 Dorm',
        capacity: 3
      }
    })
    expect(invalid3Result.error).toBeDefined()
    expect(invalid3Result.error.type).toBe('condition check failed')
    
    // Invalid capacity 7 (denied)
    const invalid7Result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Capacity 7 Dorm',
        capacity: 7
      }
    })
    expect(invalid7Result.error).toBeDefined()
    expect(invalid7Result.error.type).toBe('condition check failed')
    
    // Invalid capacity 0 (denied)
    const invalid0Result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Capacity 0 Dorm',
        capacity: 0
      }
    })
    expect(invalid0Result.error).toBeDefined()
    expect(invalid0Result.error.type).toBe('condition check failed')
  })

  test('CreateDormitory - validates unique dormitory name', async () => {
    // First creation with name (allowed)
    const firstResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Unique Name Dorm',
        capacity: 5
      }
    })
    expect(firstResult.error).toBeUndefined()
    
    // Duplicate name (denied)
    const duplicateResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Unique Name Dorm',
        capacity: 4
      }
    })
    expect(duplicateResult.error).toBeDefined()
    expect(duplicateResult.error.type).toBe('condition check failed')
    
    // Different name (allowed)
    const differentResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Different Name Dorm',
        capacity: 4
      }
    })
    expect(differentResult.error).toBeUndefined()
  })

  test('AssignUserToDormitory - validates user not already assigned', async () => {
    // Regular user is already assigned to testDormitory
    // Try to assign to another bed in same dormitory (denied)
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const anotherBed = beds.find(b => b.dormitory?.id === testDormitory.id && b.status === 'vacant')
    
    const sameUserResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: regularUser.id,
        dormitoryId: testDormitory.id,
        bedId: anotherBed.id
      }
    })
    expect(sameUserResult.error).toBeDefined()
    expect(sameUserResult.error.type).toBe('condition check failed')
    
    // Try to assign to another dormitory (also denied - user already has a dormitory)
    const anotherDormBeds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const anotherDormBed = anotherDormBeds.find(b => b.dormitory?.id === anotherDormitory.id && b.status === 'vacant')
    
    const differentDormResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: regularUser.id,
        dormitoryId: anotherDormitory.id,
        bedId: anotherDormBed.id
      }
    })
    expect(differentDormResult.error).toBeDefined()
    expect(differentDormResult.error.type).toBe('condition check failed')
  })

  test('AssignUserToDormitory - validates bed is vacant', async () => {
    // testBed is already occupied by regularUser
    const newUser = await system.storage.create('User', {
      name: 'New User for Bed',
      email: 'newforbed@test.com'
    })
    
    // Try to assign new user to occupied bed (denied)
    const occupiedResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: newUser.id,
        dormitoryId: testDormitory.id,
        bedId: testBed.id
      }
    })
    expect(occupiedResult.error).toBeDefined()
    expect(occupiedResult.error.type).toBe('condition check failed')
    
    // Find a vacant bed
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const vacantBed = beds.find(b => b.dormitory?.id === testDormitory.id && b.status === 'vacant')
    
    // Assign to vacant bed (allowed)
    const vacantResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: newUser.id,
        dormitoryId: testDormitory.id,
        bedId: vacantBed.id
      }
    })
    expect(vacantResult.error).toBeUndefined()
  })

  test('AssignUserToDormitory - validates bed belongs to dormitory', async () => {
    // Get a bed from anotherDormitory
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const wrongBed = beds.find(b => b.dormitory?.id === anotherDormitory.id)
    
    const newUser = await system.storage.create('User', {
      name: 'User for Wrong Bed',
      email: 'wrongbed@test.com'
    })
    
    // Try to assign user to testDormitory with bed from anotherDormitory (denied)
    const wrongBedResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: newUser.id,
        dormitoryId: testDormitory.id,
        bedId: wrongBed.id
      }
    })
    expect(wrongBedResult.error).toBeDefined()
    expect(wrongBedResult.error.type).toBe('condition check failed')
  })

  test('RecordPointDeduction - validates positive points', async () => {
    // Positive points (allowed)
    const positiveResult = await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'Positive deduction',
        points: 10,
        category: 'test'
      }
    })
    expect(positiveResult.error).toBeUndefined()
    
    // Zero points (denied)
    const zeroResult = await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'Zero deduction',
        points: 0,
        category: 'test'
      }
    })
    expect(zeroResult.error).toBeDefined()
    expect(zeroResult.error.type).toBe('condition check failed')
    
    // Negative points (denied)
    const negativeResult = await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'Negative deduction',
        points: -10,
        category: 'test'
      }
    })
    expect(negativeResult.error).toBeDefined()
    expect(negativeResult.error.type).toBe('condition check failed')
  })

  test('RecordPointDeduction - dormHead can only deduct from same dormitory', async () => {
    // Create a user in another dormitory
    const otherUser = await system.storage.create('User', {
      name: 'Other Dorm User',
      email: 'otherdorm@test.com'
    })
    
    // Assign to anotherDormitory
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const otherBed = beds.find(b => b.dormitory?.id === anotherDormitory.id && b.status === 'vacant')
    
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: otherUser.id,
        dormitoryId: anotherDormitory.id,
        bedId: otherBed.id
      }
    })
    
    // DormHead of testDormitory cannot deduct from user in anotherDormitory (denied)
    const crossDormResult = await controller.callInteraction('RecordPointDeduction', {
      user: dormHeadUser,
      payload: {
        targetUserId: otherUser.id,
        reason: 'Cross-dorm deduction',
        points: 10,
        category: 'test'
      }
    })
    expect(crossDormResult.error).toBeDefined()
    expect(crossDormResult.error.type).toBe('condition check failed')
    
    // DormHead can deduct from user in same dormitory (allowed)
    const sameDormResult = await controller.callInteraction('RecordPointDeduction', {
      user: dormHeadUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'Same-dorm deduction',
        points: 10,
        category: 'test'
      }
    })
    expect(sameDormResult.error).toBeUndefined()
  })

  test('RequestEviction - validates target user has low points', async () => {
    // User with 100 points cannot be evicted (denied)
    const highPointsUser = await system.storage.create('User', {
      name: 'High Points User',
      email: 'highpoints@test.com'
    })
    
    // Assign to dormitory
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const bed = beds.find(b => b.dormitory?.id === testDormitory.id && b.status === 'vacant')
    
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: highPointsUser.id,
        dormitoryId: testDormitory.id,
        bedId: bed.id
      }
    })
    
    // Try to request eviction for user with 100 points (denied)
    const highPointsResult = await controller.callInteraction('RequestEviction', {
      user: dormHeadUser,
      payload: {
        targetUserId: highPointsUser.id,
        reason: 'Invalid eviction'
      }
    })
    expect(highPointsResult.error).toBeDefined()
    expect(highPointsResult.error.type).toBe('condition check failed')
    
    // Deduct points to make user eligible
    await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: highPointsUser.id,
        reason: 'Major violation',
        points: 75,
        category: 'damage'
      }
    })
    
    // Now eviction request should work (allowed)
    const lowPointsResult = await controller.callInteraction('RequestEviction', {
      user: dormHeadUser,
      payload: {
        targetUserId: highPointsUser.id,
        reason: 'Valid eviction'
      }
    })
    expect(lowPointsResult.error).toBeUndefined()
  })

  test('RequestEviction - validates no pending eviction request exists', async () => {
    // Create a user with low points
    const lowPointsUser = await system.storage.create('User', {
      name: 'Low Points User',
      email: 'lowpoints@test.com'
    })
    
    // Assign to dormitory
    const beds = await system.storage.find('Bed',
      undefined,
      undefined,
      ['id', 'status', ['dormitory', { attributeQuery: ['id'] }]]
    )
    const bed = beds.find(b => b.dormitory?.id === testDormitory.id && b.status === 'vacant')
    
    await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: lowPointsUser.id,
        dormitoryId: testDormitory.id,
        bedId: bed.id
      }
    })
    
    // Deduct points
    await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: lowPointsUser.id,
        reason: 'Violation',
        points: 60,
        category: 'test'
      }
    })
    
    // First eviction request (allowed)
    const firstResult = await controller.callInteraction('RequestEviction', {
      user: dormHeadUser,
      payload: {
        targetUserId: lowPointsUser.id,
        reason: 'First request'
      }
    })
    expect(firstResult.error).toBeUndefined()
    
    // Second eviction request while first is pending (denied)
    const secondResult = await controller.callInteraction('RequestEviction', {
      user: dormHeadUser,
      payload: {
        targetUserId: lowPointsUser.id,
        reason: 'Duplicate request'
      }
    })
    expect(secondResult.error).toBeDefined()
    expect(secondResult.error.type).toBe('condition check failed')
  })

  // ==================== Query Permission Tests ====================
  
  test('ViewMyDormitory - requires authentication and dormitory assignment', async () => {
    // Regular user has dormitory (allowed)
    const regularResult = await controller.callInteraction('ViewMyDormitory', {
      user: regularUser,
      payload: {}
    })
    expect(regularResult.error).toBeUndefined()
    
    // Create user without dormitory
    const noDormUser = await system.storage.create('User', {
      name: 'No Dorm User',
      email: 'nodorm@test.com'
    })
    
    // User without dormitory (denied)
    const noDormResult = await controller.callInteraction('ViewMyDormitory', {
      user: noDormUser,
      payload: {}
    })
    expect(noDormResult.error).toBeDefined()
    expect(noDormResult.error.type).toBe('condition check failed')
    
    // Unauthenticated user (denied)
    const unauthResult = await controller.callInteraction('ViewMyDormitory', {
      user: unauthenticatedUser,
      payload: {}
    })
    expect(unauthResult.error).toBeDefined()
    expect(unauthResult.error.type).toBe('condition check failed')
  })

  test('ViewMyPoints - requires authentication only', async () => {
    // Any authenticated user can view their points (allowed)
    const regularResult = await controller.callInteraction('ViewMyPoints', {
      user: regularUser,
      payload: {}
    })
    expect(regularResult.error).toBeUndefined()
    
    const adminResult = await controller.callInteraction('ViewMyPoints', {
      user: adminUser,
      payload: {}
    })
    expect(adminResult.error).toBeUndefined()
    
    const dormHeadResult = await controller.callInteraction('ViewMyPoints', {
      user: dormHeadUser,
      payload: {}
    })
    expect(dormHeadResult.error).toBeUndefined()
    
    // Unauthenticated user (denied)
    const unauthResult = await controller.callInteraction('ViewMyPoints', {
      user: unauthenticatedUser,
      payload: {}
    })
    expect(unauthResult.error).toBeDefined()
    expect(unauthResult.error.type).toBe('condition check failed')
  })

  test('ViewAllDormitories - only admin can view all', async () => {
    // Admin can view all (allowed)
    const adminResult = await controller.callInteraction('ViewAllDormitories', {
      user: adminUser,
      payload: {}
    })
    expect(adminResult.error).toBeUndefined()
    
    // DormHead cannot view all (denied)
    const dormHeadResult = await controller.callInteraction('ViewAllDormitories', {
      user: dormHeadUser,
      payload: {}
    })
    expect(dormHeadResult.error).toBeDefined()
    expect(dormHeadResult.error.type).toBe('condition check failed')
    
    // Regular user cannot view all (denied)
    const regularResult = await controller.callInteraction('ViewAllDormitories', {
      user: regularUser,
      payload: {}
    })
    expect(regularResult.error).toBeDefined()
    expect(regularResult.error.type).toBe('condition check failed')
    
    // Unauthenticated cannot view all (denied)
    const unauthResult = await controller.callInteraction('ViewAllDormitories', {
      user: unauthenticatedUser,
      payload: {}
    })
    expect(unauthResult.error).toBeDefined()
    expect(unauthResult.error.type).toBe('condition check failed')
  })

  // ==================== Edge Cases and Complex Scenarios ====================
  
  test('Edge case - interaction with missing payload data', async () => {
    // CreateDormitory without name
    const noNameResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        capacity: 5
      }
    })
    expect(noNameResult.error).toBeDefined()
    
    // AssignUserToDormitory without userId
    const noUserIdResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        dormitoryId: testDormitory.id,
        bedId: testBed.id
      }
    })
    expect(noUserIdResult.error).toBeDefined()
    
    // RecordPointDeduction without points
    const noPointsResult = await controller.callInteraction('RecordPointDeduction', {
      user: adminUser,
      payload: {
        targetUserId: regularUser.id,
        reason: 'No points',
        category: 'test'
      }
    })
    expect(noPointsResult.error).toBeDefined()
  })

  test('Edge case - interaction with non-existent entity references', async () => {
    // Assign non-existent user
    const nonExistentUserResult = await controller.callInteraction('AssignUserToDormitory', {
      user: adminUser,
      payload: {
        userId: 'non-existent-user-id',
        dormitoryId: testDormitory.id,
        bedId: testBed.id
      }
    })
    expect(nonExistentUserResult.error).toBeDefined()
    
    // Approve non-existent eviction request
    const nonExistentRequestResult = await controller.callInteraction('ApproveEviction', {
      user: adminUser,
      payload: {
        requestId: 'non-existent-request-id',
        adminComment: 'Invalid'
      }
    })
    expect(nonExistentRequestResult.error).toBeDefined()
    expect(nonExistentRequestResult.error.type).toBe('condition check failed')
  })
})
