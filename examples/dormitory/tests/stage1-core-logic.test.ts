import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend'

describe('Stage 1: Core Business Logic Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    // Create fresh system for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      activities: [],
      interactions,
      dict: [],
      recordMutationSideEffects: []
    })

    await controller.setup(true)
  })

  // TC001: Create Dormitory (via CreateDormitory Interaction)
  test('TC001: Create dormitory with valid data', async () => {
    // Create admin user for test
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    // Call CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '宿舍A',
        capacity: 4
      }
    })

    // Verify interaction succeeded
    expect(result.error).toBeUndefined()

    // Verify dormitory was created
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['*']
    )

    expect(dormitory).toBeTruthy()
    expect(dormitory.name).toBe('宿舍A')
    expect(dormitory.capacity).toBe(4)
    expect(dormitory.occupiedBeds).toBe(0)
    expect(dormitory.createdAt).toBeTruthy()
    expect(new Date(dormitory.createdAt)).toBeInstanceOf(Date)

    // Verify beds were created automatically
    const beds = await system.storage.find('Bed',
      MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
      undefined,
      ['*']
    )

    expect(beds).toHaveLength(4)
    beds.forEach((bed, index) => {
      expect(bed.number).toBe(index + 1)
      expect(bed.status).toBe('available')
    })
  })

  // TC002: Assign Dorm Head (via AssignDormHead Interaction)
  test('TC002: Assign user as dorm head', async () => {
    // Create admin and student users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student Leader',
      email: 'leader@example.com',
      role: 'student'
    })

    // Create dormitory first
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '宿舍A',
        capacity: 4
      }
    })
    expect(dormResult.error).toBeUndefined()

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['*']
    )

    // Assign dorm head
    const result = await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id
      }
    })

    expect(result.error).toBeUndefined()

    // Verify user role was updated to dormHead
    const updatedStudent = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(updatedStudent.role).toBe('dormHead')

    // Verify DormitoryHeadRelation was created
    const headRelation = await system.storage.findOne('DormitoryHeadRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] })
        .and(MatchExp.atom({ key: 'target.id', value: ['=', dormitory.id] })),
      undefined,
      ['*']
    )
    expect(headRelation).toBeTruthy()
    expect(headRelation.appointedBy).toBe(admin.id)
  })

  // TC003: Assign User to Bed (via AssignUserToBed Interaction)
  test('TC003: Assign student to dormitory bed', async () => {
    // Create users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student001',
      email: 'student001@example.com',
      role: 'student'
    })

    // Create dormitory
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '宿舍A',
        capacity: 4
      }
    })
    expect(dormResult.error).toBeUndefined()

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['*']
    )

    // Assign user to bed
    const result = await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    expect(result.error).toBeUndefined()

    // Verify UserDormitoryRelation was created
    const dormRelation = await system.storage.findOne('UserDormitoryRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] })
        .and(MatchExp.atom({ key: 'target.id', value: ['=', dormitory.id] })),
      undefined,
      ['*']
    )
    expect(dormRelation).toBeTruthy()
    expect(dormRelation.status).toBe('active')

    // Verify UserBedRelation was created
    const bedRelation = await system.storage.findOne('UserBedRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(bedRelation).toBeTruthy()
    expect(bedRelation.target.number).toBe(1)

    // Verify bed status updated to occupied
    const bed = await system.storage.findOne('Bed',
      MatchExp.atom({ key: 'number', value: ['=', 1] }),
      undefined,
      ['*']
    )
    expect(bed.status).toBe('occupied')

    // Verify dormitory occupiedBeds count increased
    const updatedDormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      undefined,
      ['*']
    )
    expect(updatedDormitory.occupiedBeds).toBe(1)
    expect(updatedDormitory.availableBeds).toBe(3)
  })

  // TC004: Record Score (via RecordScore Interaction)
  test('TC004: Record score for student', async () => {
    // Create users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: 'Dorm Head',
      email: 'dormhead@example.com',
      role: 'dormHead'
    })

    const student = await system.storage.create('User', {
      name: 'Student001',
      email: 'student001@example.com',
      role: 'student'
    })

    // Create dormitory and assign users
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '宿舍A',
        capacity: 4
      }
    })
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['id']
    )

    // Assign dormHead
    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    })

    // Assign student to bed
    await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    })

    // Record score
    const result = await controller.callInteraction('RecordScore', {
      user: dormHead,
      payload: {
        targetUserId: student.id,
        reason: '晚归',
        points: 10
      }
    })

    expect(result.error).toBeUndefined()

    // Verify ScoreRecord was created
    const scoreRecord = await system.storage.findOne('ScoreRecord',
      MatchExp.atom({ key: 'reason', value: ['=', '晚归'] }),
      undefined,
      ['*']
    )
    expect(scoreRecord).toBeTruthy()
    expect(scoreRecord.points).toBe(10)
    expect(scoreRecord.createdAt).toBeTruthy()
    expect(new Date(scoreRecord.createdAt)).toBeInstanceOf(Date)

    // Verify UserScoreRelation was created
    const scoreRelation = await system.storage.findOne('UserScoreRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', scoreRecord.id] })
        .and(MatchExp.atom({ key: 'target.id', value: ['=', student.id] })),
      undefined,
      ['*']
    )
    expect(scoreRelation).toBeTruthy()

    // Verify user totalScore was updated
    const updatedStudent = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(updatedStudent.totalScore).toBe(10)
    expect(updatedStudent.canBeKickedOut).toBe(false) // Less than 100
  })

  // TC005: Request Kickout (via RequestKickout Interaction)
  test('TC005: Request kickout for student with high score', async () => {
    // Create users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: 'Dorm Head',
      email: 'dormhead@example.com',
      role: 'dormHead'
    })

    const student = await system.storage.create('User', {
      name: 'Student001',
      email: 'student001@example.com',
      role: 'student'
    })

    // Create dormitory and setup relationships
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: '宿舍A', capacity: 4 }
    })
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: { userId: dormHead.id, dormitoryId: dormitory.id }
    })

    await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: { userId: student.id, dormitoryId: dormitory.id, bedNumber: 1 }
    })

    // Record multiple scores to reach kickout threshold
    for (let i = 0; i < 10; i++) {
      await controller.callInteraction('RecordScore', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          reason: `违规行为${i + 1}`,
          points: 10
        }
      })
    }

    // Verify student can be kicked out
    const studentWithScore = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(studentWithScore.totalScore).toBe(100)
    expect(studentWithScore.canBeKickedOut).toBe(true)

    // Request kickout
    const result = await controller.callInteraction('RequestKickout', {
      user: dormHead,
      payload: {
        targetUserId: student.id,
        reason: '累计扣分达到100分'
      }
    })

    expect(result.error).toBeUndefined()

    // Verify KickoutRequest was created
    const kickoutRequest = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'reason', value: ['=', '累计扣分达到100分'] }),
      undefined,
      ['*']
    )
    expect(kickoutRequest).toBeTruthy()
    expect(kickoutRequest.status).toBe('pending')
    expect(kickoutRequest.requestedAt).toBeTruthy()
    expect(new Date(kickoutRequest.requestedAt)).toBeInstanceOf(Date)

    // Verify relations were created
    const targetRelation = await system.storage.findOne('RequestTargetRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', kickoutRequest.id] })
        .and(MatchExp.atom({ key: 'target.id', value: ['=', student.id] })),
      undefined,
      ['*']
    )
    expect(targetRelation).toBeTruthy()

    const requesterRelation = await system.storage.findOne('RequestRequesterRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', kickoutRequest.id] })
        .and(MatchExp.atom({ key: 'target.id', value: ['=', dormHead.id] })),
      undefined,
      ['*']
    )
    expect(requesterRelation).toBeTruthy()
  })

  // TC006: Process Kickout Request (via ProcessKickoutRequest Interaction) 
  test('TC006: Process kickout request (approved)', async () => {
    // Setup complete scenario
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: 'Dorm Head',
      email: 'dormhead@example.com',
      role: 'dormHead'
    })

    const student = await system.storage.create('User', {
      name: 'Student001',
      email: 'student001@example.com',
      role: 'student'
    })

    // Create dormitory and setup
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: '宿舍A', capacity: 4 }
    })
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: { userId: dormHead.id, dormitoryId: dormitory.id }
    })

    await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: { userId: student.id, dormitoryId: dormitory.id, bedNumber: 1 }
    })

    // Add enough score for kickout
    for (let i = 0; i < 10; i++) {
      await controller.callInteraction('RecordScore', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          reason: `违规${i + 1}`,
          points: 10
        }
      })
    }

    // Create kickout request
    await controller.callInteraction('RequestKickout', {
      user: dormHead,
      payload: {
        targetUserId: student.id,
        reason: '累计扣分达到100分'
      }
    })

    const kickoutRequest = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'status', value: ['=', 'pending'] }),
      undefined,
      ['*']
    )

    // Process kickout request (approve)
    const result = await controller.callInteraction('ProcessKickoutRequest', {
      user: admin,
      payload: {
        requestId: kickoutRequest.id,
        decision: 'approved',
        processNote: '同意踢出申请'
      }
    })

    expect(result.error).toBeUndefined()

    // Verify request status updated
    const updatedRequest = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'id', value: ['=', kickoutRequest.id] }),
      undefined,
      ['*']
    )
    expect(updatedRequest.status).toBe('approved')
    expect(updatedRequest.processedAt).toBeTruthy()

    // Verify processor relation created
    const processorRelation = await system.storage.findOne('RequestProcessorRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', kickoutRequest.id] })
        .and(MatchExp.atom({ key: 'target.id', value: ['=', admin.id] })),
      undefined,
      ['*']
    )
    expect(processorRelation).toBeTruthy()

    // Verify user relations were deleted (hard delete)
    const dormRelation = await system.storage.findOne('UserDormitoryRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(dormRelation).toBeFalsy() // Should be deleted

    const bedRelation = await system.storage.findOne('UserBedRelation',
      MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(bedRelation).toBeFalsy() // Should be deleted

    // Verify bed status returned to available
    const bed = await system.storage.findOne('Bed',
      MatchExp.atom({ key: 'number', value: ['=', 1] }),
      undefined,
      ['*']
    )
    expect(bed.status).toBe('available')

    // Verify dormitory occupiedBeds decreased
    const updatedDormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      undefined,
      ['*']
    )
    expect(updatedDormitory.occupiedBeds).toBe(0)
  })

  // TC007: Get Dormitory Info (via GetDormitoryInfo Interaction)
  test('TC007: Get dormitory information', async () => {
    // Setup dormitory with some occupants
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student1 = await system.storage.create('User', {
      name: 'Student001',
      email: 'student001@example.com',
      role: 'student'
    })

    const student2 = await system.storage.create('User', {
      name: 'Student002',
      email: 'student002@example.com',
      role: 'student'
    })

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: '宿舍A', capacity: 4 }
    })

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['id']
    )

    // Assign students
    await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: { userId: student1.id, dormitoryId: dormitory.id, bedNumber: 1 }
    })

    await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: { userId: student2.id, dormitoryId: dormitory.id, bedNumber: 2 }
    })

    // Get dormitory info
    const result = await controller.callInteraction('GetDormitoryInfo', {
      user: admin,
      payload: {
        dormitoryId: dormitory.id
      }
    })

    expect(result.error).toBeUndefined()

    // Verify dormitory data is accessible
    const dormInfo = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      undefined,
      ['*']
    )

    expect(dormInfo).toBeTruthy()
    expect(dormInfo.name).toBe('宿舍A')
    expect(dormInfo.capacity).toBe(4)
    expect(dormInfo.occupiedBeds).toBe(2)
    expect(dormInfo.availableBeds).toBe(2)
    expect(dormInfo.isFullyOccupied).toBe(false)
  })

  // TC008: Get User Score History (via GetUserScoreHistory Interaction)
  test('TC008: Get user score history', async () => {
    // Setup scenario with score records
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const dormHead = await system.storage.create('User', {
      name: 'Dorm Head',
      email: 'dormhead@example.com',
      role: 'dormHead'
    })

    const student = await system.storage.create('User', {
      name: 'Student001',
      email: 'student001@example.com',
      role: 'student'
    })

    // Setup dormitory and relationships
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: { name: '宿舍A', capacity: 4 }
    })
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
      undefined,
      ['id']
    )

    await controller.callInteraction('AssignDormHead', {
      user: admin,
      payload: { userId: dormHead.id, dormitoryId: dormitory.id }
    })

    await controller.callInteraction('AssignUserToBed', {
      user: admin,
      payload: { userId: student.id, dormitoryId: dormitory.id, bedNumber: 1 }
    })

    // Add multiple score records
    const reasons = ['晚归', '违规用电', '卫生不达标']
    for (let i = 0; i < reasons.length; i++) {
      await controller.callInteraction('RecordScore', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          reason: reasons[i],
          points: (i + 1) * 5
        }
      })
    }

    // Get user score history
    const result = await controller.callInteraction('GetUserScoreHistory', {
      user: admin,
      payload: {
        userId: student.id
      }
    })

    expect(result.error).toBeUndefined()

    // Verify score records exist
    const scoreRecords = await system.storage.find('ScoreRecord',
      MatchExp.atom({ key: 'targetUser.id', value: ['=', student.id] }),
      undefined,
      ['*']
    )

    expect(scoreRecords).toHaveLength(3)
    expect(scoreRecords.map(r => r.reason)).toEqual(expect.arrayContaining(reasons))
    expect(scoreRecords.map(r => r.points)).toEqual(expect.arrayContaining([5, 10, 15]))

    // Verify total score
    const updatedStudent = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['*']
    )
    expect(updatedStudent.totalScore).toBe(30) // 5 + 10 + 15
  })
})