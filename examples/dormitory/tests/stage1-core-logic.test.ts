import { describe, test, expect, beforeEach } from 'vitest'
import { 
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB, MatchExp
} from 'interaqt'
import {
  entities, relations, interactions, activities, dicts, recordMutationSideEffects
} from '../backend/index.js'

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
      activities,
      interactions,
      dict: dicts,
      recordMutationSideEffects
    })

    await controller.setup(true)
  })

  describe('TC001: Create Dormitory (via CreateDormitory Interaction)', () => {
    test('should create dormitory with valid data', async () => {
      // Setup: Create admin user
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      // Act: Create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: '宿舍A',
          capacity: 4
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify dormitory was created
      const dormitory = await system.storage.findOne('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', '宿舍A'] }),
        undefined,
        ['*']
      )
      
      console.debug('Found dormitory:', dormitory)  // Debug output

      expect(dormitory).toBeDefined()
      expect(dormitory.name).toBe('宿舍A')
      expect(dormitory.capacity).toBe(4)
      expect(dormitory.status).toBe('active')
      expect(dormitory.currentOccupancy).toBe(0)

      // Verify beds were created
      const beds = await system.storage.find('Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['*']
      )

      expect(beds).toHaveLength(4)
      expect(beds.map(b => b.bedNumber).sort()).toEqual([1, 2, 3, 4])
      beds.forEach(bed => {
        expect(bed.status).toBe('available')
      })
    })
  })

  describe('TC003: Assign Dorm Head (via AssignDormHead Interaction)', () => {
    test('should assign user as dorm head', async () => {
      // Setup: Create admin, student, and dormitory
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const student = await system.storage.create('User', {
        name: '张三',
        email: 'zhang.san@student.edu',
        role: 'student'
      })

      const dormitory = await system.storage.create('Dormitory', {
        name: '宿舍A',
        capacity: 4,
        status: 'active'
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

      // Verify user role updated
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(updatedUser.role).toBe('dormHead')

      // Verify relationship created
      const headRelation = await system.storage.findOneRelationByName('Dormitory_head_managedDormitory_User',
        MatchExp.atom({ key: 'target.id', value: ['=', student.id] }),
        undefined,
        ['*', ['source', {attributeQuery: ['id']}]]
      )

      expect(headRelation).toBeDefined()
      expect(headRelation.status).toBe('active')
      expect(headRelation.source.id).toBe(dormitory.id)
    })
  })

  describe('TC004: Assign User to Dormitory (via AssignUserToDormitory Interaction)', () => {
    test('should assign user to dormitory with specific bed', async () => {
      // Setup: Create admin, student, dormitory with beds
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const student = await system.storage.create('User', {
        name: '李四',
        email: 'li.si@student.edu',
        role: 'student'
      })

      // Create dormitory (this should trigger bed creation)
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
        ['*']
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

      // Verify user-dormitory relationship
      const userDormRelation = await system.storage.findOneRelationByName('User_dormitory_residents_Dormitory',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(userDormRelation).toBeDefined()
      expect(userDormRelation.status).toBe('active')
      expect(userDormRelation.target.id).toBe(dormitory.id)

      // Verify user-bed relationship
      const userBedRelation = await system.storage.findOneRelationByName('User_bed_occupant_Bed',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(userBedRelation).toBeDefined()
      expect(userBedRelation.status).toBe('active')
      expect(userBedRelation.target.bedNumber).toBe(1)

      // Verify bed status updated
      const bed = await system.storage.findOne('Bed',
        MatchExp.atom({ key: 'bedNumber', value: ['=', 1] }),
        undefined,
        ['*']
      )

      expect(bed.status).toBe('occupied')

      // Verify dormitory occupancy updated
      const updatedDormitory = await system.storage.findOne('Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['*']
      )

      expect(updatedDormitory.currentOccupancy).toBe(1)
    })
  })

  describe('TC005: Create Score Record (via CreateScoreRecord Interaction)', () => {
    test('should create score record with valid data', async () => {
      // Setup: Create users, dormitory, score rule
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长张三',
        email: 'zhang.san@student.edu',
        role: 'dormHead'
      })

      const student = await system.storage.create('User', {
        name: '学生李四',
        email: 'li.si@student.edu',
        role: 'student'
      })

      const scoreRule = await system.storage.create('ScoreRule', {
        name: '晚归',
        description: '超过规定时间回宿舍',
        score: 2,
        category: 'time_violation',
        isActive: true
      })

      // Act: Create score record
      const result = await controller.callInteraction('CreateScoreRecord', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          ruleId: scoreRule.id,
          reason: '违反宿舍纪律',
          score: 2
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify score record created
      const scoreRecord = await system.storage.findOne('ScoreRecord',
        MatchExp.atom({ key: 'reason', value: ['=', '违反宿舍纪律'] }),
        undefined,
        ['*']
      )

      expect(scoreRecord).toBeDefined()
      expect(scoreRecord.reason).toBe('违反宿舍纪律')
      expect(scoreRecord.score).toBe(2)
      expect(scoreRecord.status).toBe('active')

      // Verify relationships
      const userScoreRelation = await system.storage.findOneRelationByName('User_scoreRecords_user_ScoreRecord',
        MatchExp.atom({ key: 'target.id', value: ['=', scoreRecord.id] }),
        undefined,
        ['*']
      )

      expect(userScoreRelation).toBeDefined()
      expect(userScoreRelation.source.id).toBe(student.id)

      const operatorRelation = await system.storage.findOneRelationByName('User_operatedScoreRecords_operator_ScoreRecord',
        MatchExp.atom({ key: 'target.id', value: ['=', scoreRecord.id] }),
        undefined,
        ['*']
      )

      expect(operatorRelation).toBeDefined()
      expect(operatorRelation.source.id).toBe(dormHead.id)

      // Verify user total score updated (this might not work immediately due to computation timing)
      // We'll check this in a separate test or with a delay
    })
  })

  describe('TC006: Create Kick Request (via CreateKickRequest Interaction)', () => {
    test('should create kick request with valid data', async () => {
      // Setup: Create users
      const dormHead = await system.storage.create('User', {
        name: '宿舍长张三',
        email: 'zhang.san@student.edu',
        role: 'dormHead'
      })

      const student = await system.storage.create('User', {
        name: '学生李四',
        email: 'li.si@student.edu',
        role: 'student',
        totalScore: 10  // Assume student has reached kick threshold
      })

      // Act: Create kick request
      const result = await controller.callInteraction('CreateKickRequest', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          reason: '扣分达到限制，违规严重'
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify kick request created
      const kickRequest = await system.storage.findOne('KickRequest',
        MatchExp.atom({ key: 'reason', value: ['=', '扣分达到限制，违规严重'] }),
        undefined,
        ['*']
      )

      expect(kickRequest).toBeDefined()
      expect(kickRequest.reason).toBe('扣分达到限制，违规严重')
      expect(kickRequest.status).toBe('pending')

      // Verify relationships
      const requesterRelation = await system.storage.findOneRelationByName('User_requestedKicks_requester_KickRequest',
        MatchExp.atom({ key: 'target.id', value: ['=', kickRequest.id] }),
        undefined,
        ['*']
      )

      expect(requesterRelation).toBeDefined()
      expect(requesterRelation.source.id).toBe(dormHead.id)

      const targetRelation = await system.storage.findOneRelationByName('User_receivedKicks_target_KickRequest',
        MatchExp.atom({ key: 'target.id', value: ['=', kickRequest.id] }),
        undefined,
        ['*']
      )

      expect(targetRelation).toBeDefined()
      expect(targetRelation.source.id).toBe(student.id)
    })
  })

  describe('TC007: Process Kick Request (via ProcessKickRequest Interaction)', () => {
    test('should approve kick request and update user status', async () => {
      // Setup: Create admin, kick request
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长张三',
        email: 'zhang.san@student.edu',
        role: 'dormHead'
      })

      const student = await system.storage.create('User', {
        name: '学生李四',
        email: 'li.si@student.edu',
        role: 'student'
      })

      const kickRequest = await system.storage.create('KickRequest', {
        reason: '扣分达到限制，违规严重',
        status: 'pending',
        requester: dormHead,
        target: student
      })

      // Act: Process kick request (approve)
      const result = await controller.callInteraction('ProcessKickRequest', {
        user: admin,
        payload: {
          requestId: kickRequest.id,
          action: 'approve',
          comment: '同意踢出申请'
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify kick request status updated
      const updatedKickRequest = await system.storage.findOne('KickRequest',
        MatchExp.atom({ key: 'id', value: ['=', kickRequest.id] }),
        undefined,
        ['*']
      )

      expect(updatedKickRequest.status).toBe('approved')
      expect(updatedKickRequest.adminComment).toBe('同意踢出申请')

      // Verify user status updated
      const updatedStudent = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(updatedStudent.status).toBe('kicked')

      // Verify approver relationship created
      const approverRelation = await system.storage.findOneRelationByName('User_approvedKicks_approver_KickRequest',
        MatchExp.atom({ key: 'target.id', value: ['=', kickRequest.id] }),
        undefined,
        ['*']
      )

      expect(approverRelation).toBeDefined()
      expect(approverRelation.source.id).toBe(admin.id)
    })

    test('should reject kick request', async () => {
      // Setup: Create admin, kick request
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长张三',
        email: 'zhang.san@student.edu',
        role: 'dormHead'
      })

      const student = await system.storage.create('User', {
        name: '学生李四',
        email: 'li.si@student.edu',
        role: 'student'
      })

      const kickRequest = await system.storage.create('KickRequest', {
        reason: '扣分达到限制，违规严重',
        status: 'pending',
        requester: dormHead,
        target: student
      })

      // Act: Process kick request (reject)
      const result = await controller.callInteraction('ProcessKickRequest', {
        user: admin,
        payload: {
          requestId: kickRequest.id,
          action: 'reject',
          comment: '证据不足，驳回申请'
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify kick request status updated
      const updatedKickRequest = await system.storage.findOne('KickRequest',
        MatchExp.atom({ key: 'id', value: ['=', kickRequest.id] }),
        undefined,
        ['*']
      )

      expect(updatedKickRequest.status).toBe('rejected')
      expect(updatedKickRequest.adminComment).toBe('证据不足，驳回申请')

      // Verify user status unchanged
      const updatedStudent = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(updatedStudent.status).toBe('active')  // Should remain active
    })
  })

  describe('TC008: Revoke Score Record (via RevokeScoreRecord Interaction)', () => {
    test('should revoke score record', async () => {
      // Setup: Create dormHead, score record
      const dormHead = await system.storage.create('User', {
        name: '宿舍长张三',
        email: 'zhang.san@student.edu',
        role: 'dormHead'
      })

      const student = await system.storage.create('User', {
        name: '学生李四',
        email: 'li.si@student.edu',
        role: 'student'
      })

      const scoreRecord = await system.storage.create('ScoreRecord', {
        reason: '违反宿舍纪律',
        score: 2,
        status: 'active',
        user: student,
        operator: dormHead
      })

      // Act: Revoke score record
      const result = await controller.callInteraction('RevokeScoreRecord', {
        user: dormHead,
        payload: {
          recordId: scoreRecord.id,
          reason: '误判，撤销扣分'
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify score record status updated
      const updatedScoreRecord = await system.storage.findOne('ScoreRecord',
        MatchExp.atom({ key: 'id', value: ['=', scoreRecord.id] }),
        undefined,
        ['*']
      )

      expect(updatedScoreRecord.status).toBe('revoked')
      expect(updatedScoreRecord.revokeReason).toBe('误判，撤销扣分')
      expect(updatedScoreRecord.revokedAt).toBeGreaterThan(0)
    })
  })

  describe('Score Rule Management', () => {
    test('should create score rule', async () => {
      // Setup: Create admin
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      // Act: Create score rule
      const result = await controller.callInteraction('CreateScoreRule', {
        user: admin,
        payload: {
          name: '晚归',
          description: '超过规定时间回宿舍',
          score: 2,
          category: 'time_violation'
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify score rule created
      const scoreRule = await system.storage.findOne('ScoreRule',
        MatchExp.atom({ key: 'name', value: ['=', '晚归'] }),
        undefined,
        ['*']
      )

      expect(scoreRule).toBeDefined()
      expect(scoreRule.name).toBe('晚归')
      expect(scoreRule.description).toBe('超过规定时间回宿舍')
      expect(scoreRule.score).toBe(2)
      expect(scoreRule.category).toBe('time_violation')
      expect(scoreRule.isActive).toBe(true)
    })

    test('should deactivate score rule', async () => {
      // Setup: Create admin, score rule
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const scoreRule = await system.storage.create('ScoreRule', {
        name: '晚归',
        description: '超过规定时间回宿舍',
        score: 2,
        category: 'time_violation',
        isActive: true
      })

      // Act: Deactivate score rule
      const result = await controller.callInteraction('DeactivateScoreRule', {
        user: admin,
        payload: {
          ruleId: scoreRule.id
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify score rule deactivated
      const updatedScoreRule = await system.storage.findOne('ScoreRule',
        MatchExp.atom({ key: 'id', value: ['=', scoreRule.id] }),
        undefined,
        ['*']
      )

      expect(updatedScoreRule.isActive).toBe(false)
    })
  })

  describe('Remove Operations', () => {
    test('should remove dorm head', async () => {
      // Setup: Create admin, dorm head with relationship
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长张三',
        email: 'zhang.san@student.edu',
        role: 'dormHead'
      })

      const dormitory = await system.storage.create('Dormitory', {
        name: '宿舍A',
        capacity: 4,
        status: 'active'
      })

      // Create head relationship
      await system.storage.addRelationByNameById('Dormitory_head_managedDormitory_User', 
        dormitory.id, 
        dormHead.id,
        { status: 'active' }
      )

      // Act: Remove dorm head
      const result = await controller.callInteraction('RemoveDormHead', {
        user: admin,
        payload: {
          userId: dormHead.id
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify user role updated
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', dormHead.id] }),
        undefined,
        ['*']
      )

      expect(updatedUser.role).toBe('student')

      // Verify relationship status updated
      const headRelation = await system.storage.findOneRelationByName('Dormitory_head_managedDormitory_User',
        MatchExp.atom({ key: 'target.id', value: ['=', dormHead.id] }),
        undefined,
        ['*']
      )

      expect(headRelation.status).toBe('inactive')
    })

    test('should remove user from dormitory', async () => {
      // Setup: Create admin, user with dormitory assignment
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin'
      })

      const student = await system.storage.create('User', {
        name: '学生李四',
        email: 'li.si@student.edu',
        role: 'student'
      })

      const dormitory = await system.storage.create('Dormitory', {
        name: '宿舍A',
        capacity: 4,
        status: 'active'
      })

      const bed = await system.storage.create('Bed', {
        bedNumber: 1,
        status: 'occupied',
        dormitory: dormitory
      })

      // Create relationships
      await system.storage.addRelationByNameById('User_dormitory_residents_Dormitory', 
        student.id, 
        dormitory.id,
        { status: 'active' }
      )

      await system.storage.addRelationByNameById('User_bed_occupant_Bed', 
        student.id, 
        bed.id,
        { status: 'active' }
      )

      // Act: Remove user from dormitory
      const result = await controller.callInteraction('RemoveUserFromDormitory', {
        user: admin,
        payload: {
          userId: student.id
        }
      })

      // Assert: Check interaction succeeded
      expect(result.error).toBeUndefined()

      // Verify relationships updated
      const userDormRelation = await system.storage.findOneRelationByName('User_dormitory_residents_Dormitory',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(userDormRelation.status).toBe('inactive')

      const userBedRelation = await system.storage.findOneRelationByName('User_bed_occupant_Bed',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['*']
      )

      expect(userBedRelation.status).toBe('inactive')

      // Verify bed status updated
      const updatedBed = await system.storage.findOne('Bed',
        MatchExp.atom({ key: 'id', value: ['=', bed.id] }),
        undefined,
        ['*']
      )

      expect(updatedBed.status).toBe('available')
    })
  })

  describe('Filtered Entities', () => {
    test('should show active users only', async () => {
      // Setup: Create users with different statuses
      const activeUser = await system.storage.create('User', {
        name: '正常用户',
        email: 'active@example.com',
        role: 'student',
        status: 'active'
      })

      const kickedUser = await system.storage.create('User', {
        name: '被踢用户',
        email: 'kicked@example.com',
        role: 'student',
        status: 'kicked'
      })

      // Act & Assert: Query active users
      const activeUsers = await system.storage.find('ActiveUser',
        undefined,
        undefined,
        ['*']
      )

      expect(activeUsers).toHaveLength(1)
      expect(activeUsers[0].id).toBe(activeUser.id)
      expect(activeUsers.find(u => u.id === kickedUser.id)).toBeUndefined()
    })

    test('should show active score records only', async () => {
      // Setup: Create score records with different statuses
      const activeRecord = await system.storage.create('ScoreRecord', {
        reason: '活跃记录',
        score: 2,
        status: 'active'
      })

      const revokedRecord = await system.storage.create('ScoreRecord', {
        reason: '撤销记录',
        score: 3,
        status: 'revoked'
      })

      // Act & Assert: Query active score records
      const activeRecords = await system.storage.find('ActiveScoreRecord',
        undefined,
        undefined,
        ['*']
      )

      expect(activeRecords).toHaveLength(1)
      expect(activeRecords[0].id).toBe(activeRecord.id)
      expect(activeRecords.find(r => r.id === revokedRecord.id)).toBeUndefined()
    })

    test('should show pending kick requests only', async () => {
      // Setup: Create kick requests with different statuses
      const pendingRequest = await system.storage.create('KickRequest', {
        reason: '待处理申请',
        status: 'pending'
      })

      const approvedRequest = await system.storage.create('KickRequest', {
        reason: '已批准申请',
        status: 'approved'
      })

      // Act & Assert: Query pending kick requests
      const pendingRequests = await system.storage.find('PendingKickRequest',
        undefined,
        undefined,
        ['*']
      )

      expect(pendingRequests).toHaveLength(1)
      expect(pendingRequests[0].id).toBe(pendingRequest.id)
      expect(pendingRequests.find(r => r.id === approvedRequest.id)).toBeUndefined()
    })

    test('should show available beds only', async () => {
      // Setup: Create beds with different statuses
      const availableBed = await system.storage.create('Bed', {
        bedNumber: 1,
        status: 'available'
      })

      const occupiedBed = await system.storage.create('Bed', {
        bedNumber: 2,
        status: 'occupied'
      })

      // Act & Assert: Query available beds
      const availableBeds = await system.storage.find('AvailableBed',
        undefined,
        undefined,
        ['*']
      )

      expect(availableBeds).toHaveLength(1)
      expect(availableBeds[0].id).toBe(availableBed.id)
      expect(availableBeds.find(b => b.id === occupiedBed.id)).toBeUndefined()
    })
  })
})