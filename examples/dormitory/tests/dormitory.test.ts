import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB
} from 'interaqt'
import {
  User, Dorm, DormAssignment, ScoreRecord, EvictionRequest,
  ActiveDormAssignment, PendingEvictionRequest, ActiveUser,
  CreateUser, CreateDorm, AssignDormLeader, AssignUserToDorm,
  RemoveUserFromDorm, DeductPoints, ApplyForEviction,
  ProcessEvictionRequest, ViewDormMembers, ViewMyDorm, ViewMyScore
} from '../backend/index.js'

describe('Dormitory Management System Tests', () => {
  let system: MonoSystem
  let controller: Controller
  let adminUser: any
  let dormLeaderUser: any
  let studentUser: any

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB())
    
    // Define all entities and relations
    const entities = [
      User, Dorm, DormAssignment, ScoreRecord, EvictionRequest,
      ActiveDormAssignment, PendingEvictionRequest, ActiveUser
    ]

    const relations = [
      // User-DormAssignment relations
      Relation.create({
        source: User,
        sourceProperty: 'dormAssignments',
        target: DormAssignment,
        targetProperty: 'user',
        type: '1:n'
      }),
      Relation.create({
        source: Dorm,
        sourceProperty: 'dormAssignments',
        target: DormAssignment,
        targetProperty: 'dorm',
        type: '1:n'
      }),
      Relation.create({
        source: User,
        sourceProperty: 'scoreRecords',
        target: ScoreRecord,
        targetProperty: 'user',
        type: '1:n'
      }),
      Relation.create({
        source: User,
        sourceProperty: 'deductedScoreRecords',
        target: ScoreRecord,
        targetProperty: 'deductor',
        type: '1:n'
      }),
      Relation.create({
        source: User,
        sourceProperty: 'evictionRequestsApplied',
        target: EvictionRequest,
        targetProperty: 'applicant',
        type: '1:n'
      }),
      Relation.create({
        source: User,
        sourceProperty: 'evictionRequestsTargeted',
        target: EvictionRequest,
        targetProperty: 'targetUser',
        type: '1:n'
      }),
      Relation.create({
        source: Dorm,
        sourceProperty: 'evictionRequests',
        target: EvictionRequest,
        targetProperty: 'dorm',
        type: '1:n'
      })
    ]

    controller = new Controller({
      system,
      entities,
      relations,
      interactions: [
        CreateUser, CreateDorm, AssignDormLeader, AssignUserToDorm,
        RemoveUserFromDorm, DeductPoints, ApplyForEviction,
        ProcessEvictionRequest, ViewDormMembers, ViewMyDorm, ViewMyScore
      ]
    })

    await controller.setup(true)

    // Create test users
    adminUser = await system.storage.create('User', {
      name: '管理员',
      email: 'admin@example.com',
      role: 'admin'
    })

    dormLeaderUser = await system.storage.create('User', {
      name: '宿舍长',
      email: 'leader@example.com',
      role: 'dorm_leader'
    })

    studentUser = await system.storage.create('User', {
      name: '学生',
      email: 'student@example.com',
      role: 'student'
    })

    // Create a dorm and assign dorm leader to it for permission tests
    const testDorm = await system.storage.create('Dorm', {
      name: '测试宿舍',
      capacity: 4,
      leaderId: dormLeaderUser.id
    })

    // Assign dorm leader to the dorm
    await system.storage.create('DormAssignment', {
      userId: dormLeaderUser.id,
      dormId: testDorm.id,
      bedNumber: 1,
      status: 'active'
    })
  })

  describe('TC001: Create User', () => {
    test('should create a new user successfully', async () => {
      const result = await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          name: '张三',
          email: 'zhangsan@example.com'
        }
      })

      expect(result.error).toBeUndefined()

      const user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'email', value: ['=', 'zhangsan@example.com'] }),
        undefined,
        ['name', 'email', 'role', 'score', 'dormId', 'bedNumber']
      )

      expect(user).toBeTruthy()
      expect(user.name).toBe('张三')
      expect(user.email).toBe('zhangsan@example.com')
      expect(user.role).toBe('student')
      expect(user.score).toBe(0)
      expect(user.dormId).toBe('')
      expect(user.bedNumber).toBe(0)
    })
  })

  describe('TC002: Create Dorm', () => {
    test('should create a new dorm successfully', async () => {
      const result = await controller.callInteraction('CreateDorm', {
        user: adminUser,
        payload: {
          name: 'A栋101',
          capacity: 6
        }
      })

      expect(result.error).toBeUndefined()

      const dorm = await system.storage.findOne('Dorm',
        MatchExp.atom({ key: 'name', value: ['=', 'A栋101'] }),
        undefined,
        ['name', 'capacity', 'leaderId', 'currentOccupancy']
      )

      expect(dorm).toBeTruthy()
      expect(dorm.name).toBe('A栋101')
      expect(dorm.capacity).toBe(6)
      expect(dorm.leaderId).toBe('')
      expect(dorm.currentOccupancy).toBe(0)
    })
  })

  describe('TC003: Assign User to Dorm', () => {
    test('should assign user to dorm successfully', async () => {
      const student = await system.storage.create('User', {
        name: '李四',
        email: 'lisi@example.com',
        role: 'student'
      })

      const dorm = await system.storage.create('Dorm', {
        name: 'B栋202',
        capacity: 4,
        currentOccupancy: 0
      })

      const result = await controller.callInteraction('AssignUserToDorm', {
        user: adminUser,
        payload: {
          userId: { id: student.id },
          dormId: { id: dorm.id },
          bedNumber: 1
        }
      })

      expect(result.error).toBeUndefined()

      const assignment = await system.storage.findOne('DormAssignment',
        MatchExp.atom({ key: 'userId', value: ['=', student.id] }),
        undefined,
        ['userId', 'dormId', 'bedNumber', 'status']
      )

      expect(assignment).toBeTruthy()
      expect(assignment.dormId).toBe(dorm.id)
      expect(assignment.bedNumber).toBe(1)
      expect(assignment.status).toBe('active')
    })
  })

  describe('TC004: Assign Dorm Leader', () => {
    test('should assign dorm leader successfully', async () => {
      const student = await system.storage.create('User', {
        name: '宿舍长候选人',
        email: 'candidate@example.com',
        role: 'student'
      })

      const dorm = await system.storage.create('Dorm', {
        name: 'C栋303',
        capacity: 4,
        currentOccupancy: 0
      })

      const result = await controller.callInteraction('AssignDormLeader', {
        user: adminUser,
        payload: {
          dormId: { id: dorm.id },
          userId: { id: student.id }
        }
      })

      expect(result.error).toBeUndefined()

      const updatedDorm = await system.storage.findOne('Dorm',
        MatchExp.atom({ key: 'id', value: ['=', dorm.id] }),
        undefined,
        ['leaderId']
      )
      expect(updatedDorm.leaderId).toBe(student.id)

      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['role']
      )
      expect(updatedUser.role).toBe('dorm_leader')
    })
  })

  describe('TC005: Deduct Points', () => {
    test('should deduct points from user successfully', async () => {
      const student = await system.storage.create('User', {
        name: '测试学生',
        email: 'test@example.com',
        role: 'student',
        score: 100
      })

      const result = await controller.callInteraction('DeductPoints', {
        user: adminUser,
        payload: {
          userId: { id: student.id },
          points: 5,
          reason: '未按时打扫卫生'
        }
      })

      expect(result.error).toBeUndefined()

      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['score']
      )
      expect(updatedUser.score).toBe(95)

      const scoreRecord = await system.storage.findOne('ScoreRecord',
        MatchExp.atom({ key: 'userId', value: ['=', student.id] }),
        undefined,
        ['points', 'reason', 'deductorId']
      )
      expect(scoreRecord).toBeTruthy()
      expect(scoreRecord.points).toBe(5)
      expect(scoreRecord.reason).toBe('未按时打扫卫生')
      expect(scoreRecord.deductorId).toBe(dormLeaderUser.id)
    })
  })

  describe('TC006: Apply for Eviction', () => {
    test('should apply for eviction successfully', async () => {
      const targetUser = await system.storage.create('User', {
        name: '问题学生',
        email: 'problem@example.com',
        role: 'student',
        score: 50
      })

      const dorm = await system.storage.create('Dorm', {
        name: 'D栋404',
        capacity: 4,
        leaderId: dormLeaderUser.id
      })

      // Assign dorm leader to dorm
      await system.storage.create('DormAssignment', {
        userId: dormLeaderUser.id,
        dormId: dorm.id,
        bedNumber: 1,
        status: 'active'
      })

      // Assign target user to same dorm
      await system.storage.create('DormAssignment', {
        userId: targetUser.id,
        dormId: dorm.id,
        bedNumber: 2,
        status: 'active'
      })

      const result = await controller.callInteraction('ApplyForEviction', {
        user: dormLeaderUser,
        payload: {
          targetUserId: { id: targetUser.id },
          reason: '多次违反宿舍规定，积分过低'
        }
      })

      expect(result.error).toBeUndefined()

      const evictionRequest = await system.storage.findOne('EvictionRequest',
        MatchExp.atom({ key: 'targetUserId', value: ['=', targetUser.id] }),
        undefined,
        ['applicantId', 'targetUserId', 'reason', 'status']
      )

      expect(evictionRequest).toBeTruthy()
      expect(evictionRequest.applicantId).toBe(dormLeaderUser.id)
      expect(evictionRequest.targetUserId).toBe(targetUser.id)
      expect(evictionRequest.reason).toBe('多次违反宿舍规定，积分过低')
      expect(evictionRequest.status).toBe('pending')
    })
  })

  describe('TC007: Process Eviction Request', () => {
    test('should approve eviction request successfully', async () => {
      const targetUser = await system.storage.create('User', {
        name: '问题学生',
        email: 'problem@example.com',
        role: 'student',
        score: 30
      })

      const dorm = await system.storage.create('Dorm', {
        name: 'E栋505',
        capacity: 4,
        leaderId: dormLeaderUser.id
      })

      // Create eviction request
      const evictionRequest = await system.storage.create('EvictionRequest', {
        applicantId: dormLeaderUser.id,
        targetUserId: targetUser.id,
        dormId: dorm.id,
        reason: '积分过低，多次警告无效',
        status: 'pending'
      })

      const result = await controller.callInteraction('ProcessEvictionRequest', {
        user: adminUser,
        payload: {
          requestId: evictionRequest.id,
          action: 'approve'
        }
      })

      expect(result.error).toBeUndefined()

      const updatedRequest = await system.storage.findOne('EvictionRequest',
        MatchExp.atom({ key: 'id', value: ['=', evictionRequest.id] }),
        undefined,
        ['status']
      )
      expect(updatedRequest.status).toBe('approved')
    })
  })

  describe('TC008: Remove User from Dorm', () => {
    test('should remove user from dorm successfully', async () => {
      const student = await system.storage.create('User', {
        name: '要离开的学生',
        email: 'leaving@example.com',
        role: 'student',
        dormId: 'dorm123',
        bedNumber: 3
      })

      const dorm = await system.storage.create('Dorm', {
        name: 'F栋606',
        capacity: 4,
        currentOccupancy: 1
      })

      // Create assignment
      await system.storage.create('DormAssignment', {
        userId: student.id,
        dormId: dorm.id,
        bedNumber: 3,
        status: 'active'
      })

      const result = await controller.callInteraction('RemoveUserFromDorm', {
        user: adminUser,
        payload: {
          userId: { id: student.id }
        }
      })

      expect(result.error).toBeUndefined()

      const assignment = await system.storage.findOne('DormAssignment',
        MatchExp.atom({ key: 'userId', value: ['=', student.id] }),
        undefined,
        ['status']
      )
      expect(assignment.status).toBe('removed')

      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['dormId', 'bedNumber', 'role']
      )
      expect(updatedUser.dormId).toBe('')
      expect(updatedUser.bedNumber).toBe(0)
    })
  })

  describe('TC009: View Dorm Members', () => {
    test('should view dorm members successfully', async () => {
      const dorm = await system.storage.create('Dorm', {
        name: 'G栋707',
        capacity: 4,
        currentOccupancy: 2
      })

      const student1 = await system.storage.create('User', {
        name: '学生1',
        email: 'student1@example.com',
        role: 'student',
        dormId: dorm.id,
        bedNumber: 1
      })

      const student2 = await system.storage.create('User', {
        name: '学生2',
        email: 'student2@example.com',
        role: 'student',
        dormId: dorm.id,
        bedNumber: 2
      })

      const result = await controller.callInteraction('ViewDormMembers', {
        user: adminUser,
        payload: {
          dormId: { id: dorm.id }
        }
      })

      expect(result.error).toBeUndefined()
    })
  })

  describe('TC010: View My Dorm', () => {
    test('should view my dorm successfully', async () => {
      const dorm = await system.storage.create('Dorm', {
        name: 'H栋808',
        capacity: 4
      })

      const student = await system.storage.create('User', {
        name: '学生',
        email: 'student@example.com',
        role: 'student',
        dormId: dorm.id,
        bedNumber: 1
      })

      const result = await controller.callInteraction('ViewMyDorm', {
        user: student,
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })
  })

  describe('TC011: View My Score', () => {
    test('should view my score successfully', async () => {
      const student = await system.storage.create('User', {
        name: '学生',
        email: 'student@example.com',
        role: 'student',
        score: 85
      })

      const result = await controller.callInteraction('ViewMyScore', {
        user: student,
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })
  })

  describe('Permission Tests', () => {
    test('should deny regular users from creating dorms', async () => {
      const regularUser = await system.storage.create('User', {
        name: '普通用户',
        email: 'regular@example.com',
        role: 'student'
      })

      const result = await controller.callInteraction('CreateDorm', {
        user: regularUser,
        payload: {
          name: '非法宿舍',
          capacity: 4
        }
      })

      expect(result.error).toBeTruthy()
      expect((result.error as any).type).toBe('check user failed')
    })

    test('should deny students from assigning dorm leaders', async () => {
      const student = await system.storage.create('User', {
        name: '学生',
        email: 'student@example.com',
        role: 'student'
      })

      const dorm = await system.storage.create('Dorm', {
        name: '测试宿舍',
        capacity: 4
      })

      const result = await controller.callInteraction('AssignDormLeader', {
        user: student,
        payload: {
          dormId: { id: dorm.id },
          userId: { id: student.id }
        }
      })

      expect(result.error).toBeTruthy()
      expect((result.error as any).type).toBe('check user failed')
    })

    test('should deny students from deducting points', async () => {
      const student = await system.storage.create('User', {
        name: '学生',
        email: 'student@example.com',
        role: 'student'
      })

      const targetUser = await system.storage.create('User', {
        name: '目标学生',
        email: 'target@example.com',
        role: 'student'
      })

      const result = await controller.callInteraction('DeductPoints', {
        user: student,
        payload: {
          userId: { id: targetUser.id },
          points: 5,
          reason: '非法扣分'
        }
      })

      expect(result.error).toBeTruthy()
      expect((result.error as any).type).toBe('check user failed')
    })

    test('should allow dorm leader to apply for eviction', async () => {
      const dorm = await system.storage.create('Dorm', {
        name: '测试宿舍',
        capacity: 4,
        leaderId: dormLeaderUser.id
      })

      const targetUser = await system.storage.create('User', {
        name: '问题学生',
        email: 'problem@example.com',
        role: 'student',
        score: -150
      })

      await system.storage.create('DormAssignment', {
        userId: targetUser.id,
        dormId: dorm.id,
        bedNumber: 2,
        status: 'active'
      })

      const result = await controller.callInteraction('ApplyForEviction', {
        user: dormLeaderUser,
        payload: {
          targetUserId: { id: targetUser.id },
          reason: '积分过低'
        }
      })

      expect(result.error).toBeUndefined()
    })

    test('should deny student from applying for eviction', async () => {
      const targetUser = await system.storage.create('User', {
        name: '目标学生',
        email: 'target@example.com',
        role: 'student'
      })

      const result = await controller.callInteraction('ApplyForEviction', {
        user: studentUser,
        payload: {
          targetUserId: { id: targetUser.id },
          reason: '非法申请'
        }
      })

      expect(result.error).toBeTruthy()
      expect((result.error as any).type).toBe('check user failed')
    })

    test('should deny applying for eviction of users in different dorms', async () => {
      const dorm1 = await system.storage.create('Dorm', {
        name: '宿舍1',
        capacity: 4,
        leaderId: dormLeaderUser.id
      })

      const dorm2 = await system.storage.create('Dorm', {
        name: '宿舍2',
        capacity: 4
      })

      const targetUser = await system.storage.create('User', {
        name: '其他宿舍学生',
        email: 'other@example.com',
        role: 'student'
      })

      // Assign dorm leader to dorm1
      await system.storage.create('DormAssignment', {
        userId: dormLeaderUser.id,
        dormId: dorm1.id,
        bedNumber: 1,
        status: 'active'
      })

      // Assign target user to dorm2 (different from dormLeaderUser's dorm)
      await system.storage.create('DormAssignment', {
        userId: targetUser.id,
        dormId: dorm2.id,
        bedNumber: 1,
        status: 'active'
      })

      const result = await controller.callInteraction('ApplyForEviction', {
        user: dormLeaderUser,
        payload: {
          targetUserId: { id: targetUser.id },
          reason: '不同宿舍'
        }
      })

      expect(result.error).toBeTruthy()
      expect((result.error as any).type).toBe('targetUserId not match attributive')
    })

    test('should allow admin to process eviction requests', async () => {
      const dorm = await system.storage.create('Dorm', {
        name: '测试宿舍',
        capacity: 4,
        leaderId: dormLeaderUser.id
      })

      const targetUser = await system.storage.create('User', {
        name: '目标学生',
        email: 'target@example.com',
        role: 'student'
      })

      const evictionRequest = await system.storage.create('EvictionRequest', {
        applicantId: dormLeaderUser.id,
        targetUserId: targetUser.id,
        dormId: dorm.id,
        reason: '测试申请',
        status: 'pending'
      })

      const result = await controller.callInteraction('ProcessEvictionRequest', {
        user: adminUser,
        payload: {
          requestId: evictionRequest.id,
          action: 'approve'
        }
      })

      expect(result.error).toBeUndefined()
    })

    test('should deny dorm leader from processing eviction requests', async () => {
      const evictionRequest = await system.storage.create('EvictionRequest', {
        applicantId: dormLeaderUser.id,
        targetUserId: studentUser.id,
        dormId: 'dorm1',
        reason: '测试申请',
        status: 'pending'
      })

      const result = await controller.callInteraction('ProcessEvictionRequest', {
        user: dormLeaderUser,
        payload: {
          requestId: evictionRequest.id,
          action: 'approve'
        }
      })

      expect(result.error).toBeTruthy()
      expect((result.error as any).type).toBe('check user failed')
    })

    test('should allow all users to view their own dorm', async () => {
      const dorm = await system.storage.create('Dorm', {
        name: '测试宿舍',
        capacity: 4
      })

      const user = await system.storage.create('User', {
        name: '测试用户',
        email: 'test@example.com',
        role: 'student',
        dormId: dorm.id
      })

      const result = await controller.callInteraction('ViewMyDorm', {
        user: user,
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })

    test('should allow all users to view their own score', async () => {
      const user = await system.storage.create('User', {
        name: '测试用户',
        email: 'test@example.com',
        role: 'student',
        score: 85
      })

      const result = await controller.callInteraction('ViewMyScore', {
        user: user,
        payload: {}
      })

      expect(result.error).toBeUndefined()
    })
  })

  describe('Integration Tests', () => {
    test('should complete full dormitory lifecycle', async () => {
      // Create dorm
      await controller.callInteraction('CreateDorm', {
        user: adminUser,
        payload: {
          name: '测试宿舍',
          capacity: 4
        }
      })

      const dorm = await system.storage.findOne('Dorm',
        MatchExp.atom({ key: 'name', value: ['=', '测试宿舍'] })
      )

      // Create student
      await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          name: '测试学生',
          email: 'teststudent@example.com'
        }
      })

      const student = await system.storage.findOne('User',
        MatchExp.atom({ key: 'email', value: ['=', 'teststudent@example.com'] })
      )

      // Assign student to dorm
      await controller.callInteraction('AssignUserToDorm', {
        user: adminUser,
        payload: {
          userId: { id: student.id },
          dormId: { id: dorm.id },
          bedNumber: 1
        }
      })

      // Assign dorm leader
      await controller.callInteraction('AssignDormLeader', {
        user: adminUser,
        payload: {
          dormId: { id: dorm.id },
          userId: { id: student.id }
        }
      })

      // Create another student
      await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          name: '问题学生',
          email: 'problem@example.com'
        }
      })

      const problemStudent = await system.storage.findOne('User',
        MatchExp.atom({ key: 'email', value: ['=', 'problem@example.com'] })
      )

      // Assign problem student to dorm
      await controller.callInteraction('AssignUserToDorm', {
        user: adminUser,
        payload: {
          userId: { id: problemStudent.id },
          dormId: { id: dorm.id },
          bedNumber: 2
        }
      })

      // Update dorm leader role
      await system.storage.update('User', 
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        { role: 'dorm_leader' }
      )

      // Deduct points to reach -100
      await controller.callInteraction('DeductPoints', {
        user: adminUser,
        payload: {
          userId: { id: problemStudent.id },
          points: 110,
          reason: '多次违规'
        }
      })

      // Apply for eviction
      await controller.callInteraction('ApplyForEviction', {
        user: { id: student.id, role: 'dorm_leader' },
        payload: {
          targetUserId: { id: problemStudent.id },
          reason: '积分过低，多次违规'
        }
      })

      // Process eviction
      const evictionRequest = await system.storage.findOne('EvictionRequest',
        MatchExp.atom({ key: 'targetUserId', value: ['=', problemStudent.id] })
      )

      await controller.callInteraction('ProcessEvictionRequest', {
        user: adminUser,
        payload: {
          requestId: evictionRequest.id,
          action: 'approve'
        }
      })

      // Verify final state
      const updatedProblemStudent = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', problemStudent.id] }),
        undefined,
        ['dormId', 'bedNumber', 'score']
      )

      expect(updatedProblemStudent.dormId).toBe('')
      expect(updatedProblemStudent.bedNumber).toBe(0)
      expect(updatedProblemStudent.score).toBe(-110)
    })
  })
})