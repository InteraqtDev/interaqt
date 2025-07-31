import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Controller, MonoSystem, PGLiteDB, MatchExp
} from 'interaqt'
import { 
  entities, relations, interactions, dicts
} from '../backend/index'

describe('Stage 1: Core Business Logic Tests', () => {
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
      dicts
    })

    await controller.setup(true)
  })

  // ============================================================================
  // TC001: Create Dormitory (via CreateDormitory Interaction)
  // ============================================================================
  test('TC001: Create dormitory with valid data', async () => {
    // Setup: Create admin user (proper role even in Stage 1)
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    // Act: Create dormitory
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify dormitory was created
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['name', 'capacity', 'currentOccupancy', 'status', 'id']
    )
    
    expect(dormitory).toBeTruthy()
    expect(dormitory.name).toBe('A栋101')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.currentOccupancy).toBe(0)
    expect(dormitory.status).toBe('active')
  })

  // ============================================================================
  // TC002: Assign User to Dormitory (via AssignUserToDormitory Interaction)
  // ============================================================================
  test('TC002: Assign user to dormitory', async () => {
    // Setup: Create admin, dormitory, and student
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: '李四',
      email: 'li4@student.com',
      role: 'student'
    })

    // Create dormitory first
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['id']
    )

    // Act: Assign user to dormitory
    const result = await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify user-dormitory relation was created
    const relation = await system.storage.findOneRelationByName('UserDormitoryRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
      undefined,
      ['bedNumber', 'status', 'source', 'target']
    )
    
    expect(relation).toBeTruthy()
    expect(relation.bedNumber).toBe(1)
    expect(relation.status).toBe('active')
    expect(relation.source.id).toBe(student.id)
    expect(relation.target.id).toBe(dormitory.id)

    // Verify dormitory occupancy updated
    const updatedDormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      undefined,
      ['currentOccupancy']
    )
    expect(updatedDormitory.currentOccupancy).toBe(1)
  })

  // ============================================================================
  // TC003: Assign Dorm Head (via AssignDormHead Interaction)
  // ============================================================================
  test('TC003: Assign dorm head', async () => {
    // Setup: Create users and dormitory
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: '张三',
      email: 'zhang3@student.com',
      role: 'student'
    })

    // Create dormitory and assign user first
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['id']
    )

    // Assign user to dormitory first
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    // Act: Assign dorm head
    const result = await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify dorm head relation was created
    const relation = await system.storage.findOneRelationByName('DormHeadDormitoryRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
      undefined,
      ['status', 'source', 'target']
    )
    
    expect(relation).toBeTruthy()
    expect(relation.status).toBe('active')
    expect(relation.source.id).toBe(student.id)
    expect(relation.target.id).toBe(dormitory.id)
  })

  // ============================================================================
  // TC004: Create Score Rule (via CreateScoreRule Interaction)
  // ============================================================================
  test('TC004: Create score rule', async () => {
    // Setup: Create admin user
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    // Act: Create score rule
    const result = await controller.callInteraction('CreateScoreRule', {
      user: admin,
      payload: {
        name: '晚归',
        description: '超过23:00回宿舍',
        scoreDeduction: 10
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify score rule was created
    const scoreRule = await system.storage.findOne('ScoreRule',
      MatchExp.atom({ key: 'name', value: ['=', '晚归'] }),
      undefined,
      ['name', 'description', 'scoreDeduction', 'isActive']
    )
    
    expect(scoreRule).toBeTruthy()
    expect(scoreRule.name).toBe('晚归')
    expect(scoreRule.description).toBe('超过23:00回宿舍')
    expect(scoreRule.scoreDeduction).toBe(10)
    expect(scoreRule.isActive).toBe(true)
  })

  // ============================================================================
  // TC005: Deduct User Score (via DeductUserScore Interaction)
  // ============================================================================
  test('TC005: Deduct user score', async () => {
    // Setup: Create admin, dorm head, student, dormitory, and score rule
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: '张三',
      email: 'zhang3@student.com',
      role: 'student'  // Initial role, will become dormHead
    })

    const student = await system.storage.create('User', {
      name: '李四',
      email: 'li4@student.com',
      role: 'student'
    })

    // Create dormitory and score rule
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    await controller.callInteraction('CreateScoreRule', {
      user: admin,
      payload: {
        name: '晚归',
        description: '超过23:00回宿舍',
        scoreDeduction: 10
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['id']
    )

    const scoreRule = await system.storage.findOne('ScoreRule',
      MatchExp.atom({ key: 'name', value: ['=', '晚归'] }),
      undefined,
      ['id']
    )

    // Assign users to dormitory and set dorm head
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    })

    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    })

    // Act: Deduct score (dorm head deducting student's score)
    const result = await controller.callInteraction('DeductUserScore', {
      user: dormHead,
      payload: {
        userId: student.id,
        ruleId: scoreRule.id,
        reason: '23:30回宿舍',
        operatorNotes: '宿舍管理记录'
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify score record was created
    const scoreRecord = await system.storage.findOne('ScoreRecord',
      MatchExp.atom({ key: 'reason', value: ['=', '23:30回宿舍'] }),
      undefined,
      ['reason', 'score', 'operatorNotes']
    )
    
    expect(scoreRecord).toBeTruthy()
    expect(scoreRecord.reason).toBe('23:30回宿舍')
    expect(scoreRecord.score).toBe(10)  // Placeholder value from Stage 1
    expect(scoreRecord.operatorNotes).toBe('宿舍管理记录')

    // Note: In Stage 1, totalScore computation may not work perfectly yet
    // We'll verify this more thoroughly in Stage 2 tests
  })

  // ============================================================================
  // TC006: Request Kick User (via RequestKickUser Interaction)
  // ============================================================================
  test('TC006: Request kick user', async () => {
    // Setup: Create users and dormitory (similar to previous test)
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: '张三',
      email: 'zhang3@student.com',
      role: 'student'
    })

    const student = await system.storage.create('User', {
      name: '李四',
      email: 'li4@student.com',
      role: 'student'
    })

    // Create dormitory and setup relationships
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    })

    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    })

    // Act: Request kick user
    const result = await controller.callInteraction('RequestKickUser', {
      user: dormHead,
      payload: {
        userId: student.id,
        reason: '多次违规，分数过低'
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify kick request was created
    const kickRequest = await system.storage.findOne('KickRequest',
      MatchExp.atom({ key: 'reason', value: ['=', '多次违规，分数过低'] }),
      undefined,
      ['reason', 'status']
    )
    
    expect(kickRequest).toBeTruthy()
    expect(kickRequest.reason).toBe('多次违规，分数过低')
    expect(kickRequest.status).toBe('pending')
  })

  // ============================================================================
  // TC007: Approve Kick Request (via ApproveKickRequest Interaction)
  // ============================================================================
  test('TC007: Approve kick request', async () => {
    // Setup: Create kick request (reuse previous setup)
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: '张三',
      email: 'zhang3@student.com',
      role: 'student'
    })

    const student = await system.storage.create('User', {
      name: '李四',
      email: 'li4@student.com',
      role: 'student'
    })

    // Setup dormitory and relationships
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    })

    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    })

    // Create kick request
    await controller.callInteraction('RequestKickUser', {
      user: dormHead,
      payload: {
        userId: student.id,
        reason: '多次违规，分数过低'
      }
    })

    const kickRequest = await system.storage.findOne('KickRequest',
      MatchExp.atom({ key: 'reason', value: ['=', '多次违规，分数过低'] }),
      undefined,
      ['id']
    )

    // Act: Approve kick request
    const result = await controller.callInteraction('ApproveKickRequest', {
      user: admin,
      payload: {
        requestId: kickRequest.id,
        adminNotes: '同意踢出，违规情况属实'
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Note: In Stage 1, we only verify the interaction succeeds
    // In Stage 2, we'll verify that user status changes to 'kicked' and
    // dormitory relation status changes to 'inactive'
  })

  // ============================================================================
  // TC008: Get Dormitory Info (via GetDormitoryInfo Interaction)
  // ============================================================================
  test('TC008: Get dormitory info', async () => {
    // Setup: Create dormitory with some residents
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: '李四',
      email: 'li4@student.com',
      role: 'student'
    })

    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'A栋101',
        capacity: 4
      }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    // Act: Get dormitory info
    const result = await controller.callInteraction('GetDormitoryInfo', {
      user: admin,
      payload: {
        dormitoryId: dormitory.id
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Note: In Stage 1, we just verify the interaction works
    // In Stage 2, we'll implement proper data retrieval and verification
  })

  // ============================================================================
  // TC009: Get User Score Records (via GetUserScoreRecords Interaction)
  // ============================================================================
  test('TC009: Get user score records', async () => {
    // Setup: Create user with score records
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: '李四',
      email: 'li4@student.com',
      role: 'student'
    })

    // Act: Get user score records
    const result = await controller.callInteraction('GetUserScoreRecords', {
      user: admin,
      payload: {
        userId: student.id,
        limit: 10,
        offset: 0
      }
    })

    // Assert: Check interaction succeeded
    expect(result.error).toBeUndefined()

    // Note: In Stage 1, we just verify the interaction works
    // In Stage 2, we'll implement proper data retrieval and verification
  })

  // ============================================================================
  // TC010: Multiple dormitories and users integration test
  // ============================================================================
  test('TC010: Multiple dormitories and users integration', async () => {
    // Setup: Create admin
    const admin = await system.storage.create('User', {
      name: 'System Admin',
      email: 'admin@dormitory.com',
      role: 'admin'
    })

    // Create multiple users
    const users = []
    for (let i = 1; i <= 6; i++) {
      const user = await system.storage.create('User', {
        name: `学生${i}`,
        email: `student${i}@dormitory.com`,
        role: 'student'
      })
      users.push(user)
    }

    // Create multiple dormitories
    const dormNames = ['A栋101', 'A栋102', 'B栋201']
    const dormitories = []
    
    for (const name of dormNames) {
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: name,
          capacity: 4
        }
      })

      const dormitory = await system.storage.findOne('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', name] }),
        undefined,
        ['id', 'name']
      )
      dormitories.push(dormitory)
    }

    // Assign users to dormitories
    let dormIndex = 0
    let bedNumber = 1
    
    for (let i = 0; i < users.length; i++) {
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: users[i].id,
          dormitoryId: dormitories[dormIndex].id,
          bedNumber: bedNumber
        }
      })

      expect(result.error).toBeUndefined()

      bedNumber++
      if (bedNumber > 4) {  // Capacity is 4
        dormIndex++
        bedNumber = 1
      }
    }

    // Verify occupancy counts
    for (let i = 0; i < dormitories.length; i++) {
      const updated = await system.storage.findOne('Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitories[i].id] }),
        undefined,
        ['currentOccupancy', 'name']
      )

      if (i < 2) {
        // First two dorms should have 2 students each (6 students / 3 dorms = 2 each with 1 dorm having more)
        expect(updated.currentOccupancy).toBeGreaterThan(0)
      }
    }

    // Verify system stats
    const stats = await system.storage.get('SystemStats')
    expect(stats).toBeTruthy()
    expect(stats.totalUsers).toBe(7)  // 6 students + 1 admin
    expect(stats.totalDormitories).toBe(3)
  })
})