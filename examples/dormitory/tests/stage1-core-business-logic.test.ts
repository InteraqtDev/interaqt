/**
 * Stage 1: Core Business Logic Tests
 * 
 * 测试核心业务逻辑，不包含权限和业务规则验证
 * 使用正确的角色和有效数据，确保基本功能正常工作
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, MatchExp, PGLiteDB } from 'interaqt'
import { entities, relations, interactions, computations } from '../backend'

describe('Stage 1: Core Business Logic Tests', () => {
  let controller: Controller
  let system: MonoSystem

  beforeEach(async () => {
    // 使用PGlite作为测试数据库
    const db = new PGLiteDB()
    system = new MonoSystem(db)
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      computations
    })
    await controller.setup()
  })

  describe('TC001: 创建宿舍', () => {
    it('应该成功创建宿舍并自动生成床位', async () => {
      // 创建管理员用户
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      // 调用CreateDormitory交互
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'A栋301',
          capacity: 4
        }
      })

      // 验证交互成功
      expect(result.error).toBeUndefined()

      // 查询创建的宿舍
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'A栋301'] }),
        undefined,
        ['id', 'name', 'capacity', 'status']
      )

      expect(dormitory).toBeDefined()
      expect(dormitory.name).toBe('A栋301')
      expect(dormitory.capacity).toBe(4)
      expect(dormitory.status).toBe('active')

      // 查询自动创建的床位
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'number', 'status']
      )

      expect(beds).toHaveLength(4)
      beds.forEach((bed, index) => {
        expect(bed.number).toBe(index + 1)
        expect(bed.status).toBe('available')
      })
    })
  })

  describe('TC002: 分配用户到宿舍', () => {
    it('应该成功分配用户到宿舍并占用床位', async () => {
      // 创建测试数据
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生1',
        email: 'student1@test.com',
        role: 'student',
        status: 'active'
      })

      // 创建宿舍
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'A栋301',
          capacity: 4
        }
      })

      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'A栋301'] }),
        undefined,
        ['id']
      )

      // 分配用户到宿舍
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dormitory.id
        }
      })

      expect(result.error).toBeUndefined()

      // 验证用户与宿舍的关系
      const userDormRelation = await system.storage.findOne(
        'UserDormitory',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['source', 'target', 'assignedAt', 'assignedBy']
      )

      expect(userDormRelation).toBeDefined()
      expect(userDormRelation.target.id).toBe(dormitory.id)
      expect(userDormRelation.assignedBy).toBe(admin.id)

      // 验证用户与床位的关系
      const userBedRelation = await system.storage.findOne(
        'UserBed',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['source', 'target']
      )

      expect(userBedRelation).toBeDefined()

      // 验证床位状态更新
      const bed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', userBedRelation.target.id] }),
        undefined,
        ['number', 'status']
      )

      expect(bed.number).toBe(1) // 第一个可用床位
      expect(bed.status).toBe('occupied')

      // 验证宿舍的计算属性
      const updatedDorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['occupiedBeds', 'availableBeds', 'occupancyRate']
      )

      expect(updatedDorm.occupiedBeds).toBe(1)
      expect(updatedDorm.availableBeds).toBe(3)
      expect(updatedDorm.occupancyRate).toBe(25)
    })
  })

  describe('TC003: 指定宿舍长', () => {
    it('应该成功指定宿舍长', async () => {
      // 创建测试数据
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生1',
        email: 'student1@test.com',
        role: 'student',
        status: 'active'
      })

      // 创建宿舍并分配用户
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'A栋301',
          capacity: 4
        }
      })

      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'A栋301'] }),
        undefined,
        ['id']
      )

      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dormitory.id
        }
      })

      // 指定宿舍长
      const result = await controller.callInteraction('AssignDormHead', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dormitory.id
        }
      })

      expect(result.error).toBeUndefined()

      // 验证用户角色更新
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['role']
      )

      expect(updatedUser.role).toBe('dormHead')

      // 验证宿舍与宿舍长的关系
      const dormHeadRelation = await system.storage.findOne(
        'DormitoryDormHead',
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        ['source', 'target', 'appointedAt']
      )

      expect(dormHeadRelation).toBeDefined()
      expect(dormHeadRelation.target.id).toBe(student.id)
    })
  })

  describe('TC004: 记录违规', () => {
    it('应该成功记录违规并更新用户违规分数', async () => {
      // 创建测试数据
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长',
        email: 'dormhead@test.com',
        role: 'dormHead',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生2',
        email: 'student2@test.com',
        role: 'student',
        status: 'active'
      })

      // 记录违规
      const result = await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '晚归',
          score: 5
        }
      })

      expect(result.error).toBeUndefined()

      // 查询违规记录
      const violation = await system.storage.findOne(
        'ViolationRecord',
        MatchExp.atom({ key: 'user.id', value: ['=', student.id] }),
        undefined,
        ['reason', 'score', 'user', 'recordedBy']
      )

      expect(violation).toBeDefined()
      expect(violation.reason).toBe('晚归')
      expect(violation.score).toBe(5)
      expect(violation.recordedBy.id).toBe(dormHead.id)

      // 验证用户的违规分数更新
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['violationScore', 'violationCount']
      )

      expect(updatedUser.violationScore).toBe(5)
      expect(updatedUser.violationCount).toBe(1)
    })
  })

  describe('TC005: 多次违规累计', () => {
    it('应该正确累计多次违规分数', async () => {
      const dormHead = await system.storage.create('User', {
        name: '宿舍长',
        email: 'dormhead@test.com',
        role: 'dormHead',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生2',
        email: 'student2@test.com',
        role: 'student',
        status: 'active',
        violationScore: 5 // 已有5分违规
      })

      // 第一次违规已存在（5分）
      // 记录第二次违规
      await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '违规使用电器',
          score: 10
        }
      })

      // 记录第三次违规
      await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '打架斗殴',
          score: 10
        }
      })

      // 记录第四次违规
      await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '破坏公物',
          score: 8
        }
      })

      // 验证累计违规分数
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['violationScore', 'violationCount', 'canBeEvicted']
      )

      expect(updatedUser.violationScore).toBe(33) // 5+10+10+8
      expect(updatedUser.violationCount).toBe(3) // 新增3条记录
      expect(updatedUser.canBeEvicted).toBe(true) // 分数≥30
    })
  })

  describe('TC006: 申请踢出用户', () => {
    it('应该成功创建踢出申请', async () => {
      const dormHead = await system.storage.create('User', {
        name: '宿舍长',
        email: 'dormhead@test.com',
        role: 'dormHead',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生2',
        email: 'student2@test.com',
        role: 'student',
        status: 'active',
        violationScore: 33
      })

      // 申请踢出
      const result = await controller.callInteraction('RequestEviction', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '多次严重违规，累计扣分超过30分'
        }
      })

      expect(result.error).toBeUndefined()

      // 查询踢出申请
      const request = await system.storage.findOne(
        'EvictionRequest',
        MatchExp.atom({ key: 'targetUser.id', value: ['=', student.id] }),
        undefined,
        ['reason', 'status', 'targetUser', 'requestedBy']
      )

      expect(request).toBeDefined()
      expect(request.reason).toBe('多次严重违规，累计扣分超过30分')
      expect(request.status).toBe('pending')
      expect(request.requestedBy.id).toBe(dormHead.id)
    })
  })

  describe('TC007: 批准踢出申请', () => {
    it('应该成功批准踢出申请并更新相关状态', async () => {
      // 创建完整的测试数据
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长',
        email: 'dormhead@test.com',
        role: 'dormHead',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生2',
        email: 'student2@test.com',
        role: 'student',
        status: 'active',
        violationScore: 33
      })

      // 创建宿舍并分配用户
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'A栋301',
          capacity: 4
        }
      })

      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'A栋301'] }),
        undefined,
        ['id']
      )

      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: {
          userId: student.id,
          dormitoryId: dormitory.id
        }
      })

      // 获取分配的床位
      const userBedBefore = await system.storage.findOne(
        'UserBed',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['target']
      )
      const bedId = userBedBefore.target.id

      // 创建踢出申请
      await controller.callInteraction('RequestEviction', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '多次严重违规'
        }
      })

      const request = await system.storage.findOne(
        'EvictionRequest',
        MatchExp.atom({ key: 'targetUser.id', value: ['=', student.id] }),
        undefined,
        ['id']
      )

      // 批准踢出申请
      const result = await controller.callInteraction('ApproveEviction', {
        user: admin,
        payload: {
          requestId: request.id,
          comment: '情况属实，批准踢出'
        }
      })

      expect(result.error).toBeUndefined()

      // 验证申请状态更新
      const updatedRequest = await system.storage.findOne(
        'EvictionRequest',
        MatchExp.atom({ key: 'id', value: ['=', request.id] }),
        undefined,
        ['status', 'processedAt', 'adminComment', 'processedBy']
      )

      expect(updatedRequest.status).toBe('approved')
      expect(updatedRequest.adminComment).toBe('情况属实，批准踢出')
      expect(updatedRequest.processedBy.id).toBe(admin.id)

      // 验证用户状态更新
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['status']
      )

      expect(updatedUser.status).toBe('evicted')

      // 验证用户与宿舍的关系已解除
      const userDormRelation = await system.storage.findOne(
        'UserDormitory',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['id']
      )

      expect(userDormRelation).toBeNull()

      // 验证用户与床位的关系已解除
      const userBedRelation = await system.storage.findOne(
        'UserBed',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['id']
      )

      expect(userBedRelation).toBeNull()

      // 验证床位状态恢复为available
      const bed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', bedId] }),
        undefined,
        ['status']
      )

      expect(bed.status).toBe('available')
    })
  })

  describe('TC008: 拒绝踢出申请', () => {
    it('应该成功拒绝踢出申请，用户状态保持不变', async () => {
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      const dormHead = await system.storage.create('User', {
        name: '宿舍长',
        email: 'dormhead@test.com',
        role: 'dormHead',
        status: 'active'
      })

      const student = await system.storage.create('User', {
        name: '学生3',
        email: 'student3@test.com',
        role: 'student',
        status: 'active',
        violationScore: 35
      })

      // 创建踢出申请
      await controller.callInteraction('RequestEviction', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: '违规行为'
        }
      })

      const request = await system.storage.findOne(
        'EvictionRequest',
        MatchExp.atom({ key: 'targetUser.id', value: ['=', student.id] }),
        undefined,
        ['id']
      )

      // 拒绝踢出申请
      const result = await controller.callInteraction('RejectEviction', {
        user: admin,
        payload: {
          requestId: request.id,
          comment: '初犯，给予警告即可'
        }
      })

      expect(result.error).toBeUndefined()

      // 验证申请状态更新
      const updatedRequest = await system.storage.findOne(
        'EvictionRequest',
        MatchExp.atom({ key: 'id', value: ['=', request.id] }),
        undefined,
        ['status', 'adminComment', 'processedBy']
      )

      expect(updatedRequest.status).toBe('rejected')
      expect(updatedRequest.adminComment).toBe('初犯，给予警告即可')
      expect(updatedRequest.processedBy.id).toBe(admin.id)

      // 验证用户状态保持不变
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', student.id] }),
        undefined,
        ['status']
      )

      expect(updatedUser.status).toBe('active')
    })
  })

  describe('TC009: 满员宿舍测试', () => {
    it('应该正确处理宿舍满员情况', async () => {
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      // 创建4个学生
      const students = []
      for (let i = 1; i <= 4; i++) {
        const student = await system.storage.create('User', {
          name: `学生${i}`,
          email: `student${i}@test.com`,
          role: 'student',
          status: 'active'
        })
        students.push(student)
      }

      // 创建容量为4的宿舍
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'B栋201',
          capacity: 4
        }
      })

      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'B栋201'] }),
        undefined,
        ['id']
      )

      // 分配4个学生
      for (const student of students) {
        await controller.callInteraction('AssignUserToDormitory', {
          user: admin,
          payload: {
            userId: student.id,
            dormitoryId: dormitory.id
          }
        })
      }

      // 验证所有床位都被占用
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['status']
      )

      expect(beds).toHaveLength(4)
      beds.forEach(bed => {
        expect(bed.status).toBe('occupied')
      })

      // 验证宿舍计算属性
      const fullDorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['occupiedBeds', 'availableBeds', 'occupancyRate']
      )

      expect(fullDorm.occupiedBeds).toBe(4)
      expect(fullDorm.availableBeds).toBe(0)
      expect(fullDorm.occupancyRate).toBe(100)
    })
  })

  describe('TC010: 宿舍容量边界测试', () => {
    it('应该支持创建容量为4、5、6的宿舍', async () => {
      const admin = await system.storage.create('User', {
        name: '系统管理员',
        email: 'admin@test.com',
        role: 'admin',
        status: 'active'
      })

      // 测试容量4（最小值）
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'C栋101',
          capacity: 4
        }
      })

      const dorm4 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'C栋101'] }),
        undefined,
        ['capacity']
      )

      const beds4 = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dorm4.id] }),
        undefined,
        ['number']
      )

      expect(dorm4.capacity).toBe(4)
      expect(beds4).toHaveLength(4)
      expect(beds4.map(b => b.number).sort()).toEqual([1, 2, 3, 4])

      // 测试容量5（中间值）
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'C栋102',
          capacity: 5
        }
      })

      const dorm5 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'C栋102'] }),
        undefined,
        ['capacity']
      )

      const beds5 = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dorm5.id] }),
        undefined,
        ['number']
      )

      expect(dorm5.capacity).toBe(5)
      expect(beds5).toHaveLength(5)
      expect(beds5.map(b => b.number).sort()).toEqual([1, 2, 3, 4, 5])

      // 测试容量6（最大值）
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'C栋103',
          capacity: 6
        }
      })

      const dorm6 = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'C栋103'] }),
        undefined,
        ['capacity']
      )

      const beds6 = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dorm6.id] }),
        undefined,
        ['number']
      )

      expect(dorm6.capacity).toBe(6)
      expect(beds6).toHaveLength(6)
      expect(beds6.map(b => b.number).sort()).toEqual([1, 2, 3, 4, 5, 6])
    })
  })
})
