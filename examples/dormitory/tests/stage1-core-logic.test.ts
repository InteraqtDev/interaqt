import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB } from 'interaqt'
import { entities, relations, interactions } from '../backend/index.js'

describe('Stage 1: Core Business Logic Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    })
    await controller.setup(true)
  })

  describe('TC001: Create Dormitory', () => {
    test('should create dormitory with beds', async () => {
      // Create admin user with proper role
      const admin = await system.storage.create('User', {
        name: 'System Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      // Create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      expect(result.error).toBeUndefined()

      // Verify dormitory created
      const dormitories = await system.storage.find('Dormitory', undefined, undefined, 
        ['name', 'capacity', 'status', 'occupancyCount', 'id'])
      expect(dormitories).toHaveLength(1)
      expect(dormitories[0].name).toBe('Building A')
      expect(dormitories[0].capacity).toBe(4)
      expect(dormitories[0].status).toBe('active')
      expect(dormitories[0].occupancyCount).toBe(0)

      // Verify beds created
      const beds = await system.storage.find('Bed', undefined, undefined,
        ['number', 'status', 'dormitory'])
      expect(beds).toHaveLength(4)
      beds.forEach((bed, index) => {
        expect(bed.number).toBe(`Building A-${index + 1}`)
        expect(bed.status).toBe('vacant')
      })
    })
  })

  describe('TC002: Create Dormitory with Maximum Capacity', () => {
    test('should create dormitory with 6 beds', async () => {
      const admin = await system.storage.create('User', {
        name: 'System Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building B', capacity: 6 }
      })

      expect(result.error).toBeUndefined()

      const dormitories = await system.storage.find('Dormitory', undefined, undefined,
        ['capacity'])
      expect(dormitories[0].capacity).toBe(6)

      const beds = await system.storage.find('Bed', undefined, undefined,
        ['id'])
      expect(beds).toHaveLength(6)
    })
  })

  describe('TC003: Assign User to Bed', () => {
    test('should assign student to vacant bed', async () => {
      // Setup
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const student = await system.storage.create('User', {
        name: 'Alice Smith',
        email: 'alice@dorm.com',
        phone: '9876543210',
        role: 'student'
      })

      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'status', 'dormitory'])
      const bed1 = beds[0]

      // Assign user to bed
      const result = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: { userId: student.id, bedId: bed1.id }
      })

      expect(result.error).toBeUndefined()

      // Verify assignment
      const updatedBed = await system.storage.get('Bed', bed1.id, ['status', 'number'])
      expect(updatedBed.status).toBe('occupied')
      
      // Check relation exists
      const relations = await system.storage.find('UserBedRelation')
      expect(relations).toHaveLength(1)
      expect(relations[0].source.id).toBe(student.id)
      expect(relations[0].target.id).toBe(bed1.id)

      // Verify occupancy count
      const dormitory = await system.storage.get('Dormitory', beds[0].dormitory.id, ['occupancyCount'])
      expect(dormitory.occupancyCount).toBe(1)
    })
  })

  describe('TC004: Assign Dorm Head', () => {
    test('should assign user as dorm head', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const user = await system.storage.create('User', {
        name: 'John Doe',
        email: 'john@dorm.com',
        phone: '5555555555',
        role: 'student'
      })

      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      const dormitory = (await system.storage.find('Dormitory', undefined, undefined, ['id']))[0]

      const result = await controller.callInteraction('AssignDormHead', {
        user: admin,
        payload: { userId: user.id, dormitoryId: dormitory.id }
      })

      expect(result.error).toBeUndefined()

      // Verify role change
      const updatedUser = await system.storage.get('User', user.id, ['role', 'name'])
      expect(updatedUser.role).toBe('dormHead')
      
      // Note: In this simplified Stage 1 implementation, we don't track the dormitory-dormHead relation
      // This will be added in Stage 2
    })
  })

  describe('TC005: Record Violation', () => {
    test('should record violation and update score', async () => {
      // Setup
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'head@dorm.com',
        phone: '1111111111',
        role: 'student'
      })

      const student = await system.storage.create('User', {
        name: 'Student',
        email: 'student@dorm.com',
        phone: '2222222222',
        role: 'student'
      })

      // Create dormitory and assign users
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      const dormitory = (await system.storage.find('Dormitory', undefined, undefined, ['id']))[0]
      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'status', 'dormitory'])

      await controller.callInteraction('AssignDormHead', {
        user: admin,
        payload: { userId: dormHead.id, dormitoryId: dormitory.id }
      })

      await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: { userId: student.id, bedId: beds[0].id }
      })

      // Create violation rule
      await controller.callInteraction('CreateViolationRule', {
        user: admin,
        payload: {
          name: 'Noise Violation',
          description: 'Making excessive noise',
          points: 10,
          category: 'discipline'
        }
      })

      const rule = (await system.storage.find('ViolationRule', undefined, undefined, ['id', 'points']))[0]

      // Record violation
      const result = await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          violationRuleId: rule.id,
          description: 'Loud music after 10 PM'
        }
      })

      expect(result.error).toBeUndefined()

      // Verify violation record
      const violations = await system.storage.find('ViolationRecord', undefined, undefined,
        ['description', 'points', 'status'])
      expect(violations).toHaveLength(1)
      expect(violations[0].description).toBe('Loud music after 10 PM')
      expect(violations[0].points).toBe(10)
      expect(violations[0].status).toBe('active')

      // Verify user violation score
      const updatedStudent = await system.storage.get('User', student.id, ['violationScore'])
      expect(updatedStudent.violationScore).toBe(10)
    })
  })

  describe('TC006: Request Kickout', () => {
    test('should create kickout request', async () => {
      // Setup similar to TC005
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'head@dorm.com',
        phone: '1111111111',
        role: 'student'
      })

      const student = await system.storage.create('User', {
        name: 'Student',
        email: 'student@dorm.com',
        phone: '2222222222',
        role: 'student'
      })

      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      const dormitory = (await system.storage.find('Dormitory', undefined, undefined, ['id']))[0]
      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'status', 'dormitory'])

      await controller.callInteraction('AssignDormHead', {
        user: admin,
        payload: { userId: dormHead.id, dormitoryId: dormitory.id }
      })

      await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: { userId: student.id, bedId: beds[0].id }
      })

      // Request kickout
      const result = await controller.callInteraction('RequestKickout', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          reason: 'Multiple violations, total 120 points'
        }
      })

      expect(result.error).toBeUndefined()

      // Verify request created
      const requests = await system.storage.find('KickoutRequest', undefined, undefined,
        ['reason', 'status'])
      expect(requests).toHaveLength(1)
      expect(requests[0].reason).toBe('Multiple violations, total 120 points')
      expect(requests[0].status).toBe('pending')
    })
  })

  describe('TC007: Approve Kickout Request', () => {
    test('should approve request and remove user from bed', async () => {
      // Setup similar to TC006
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'head@dorm.com',
        phone: '1111111111',
        role: 'student'
      })

      const student = await system.storage.create('User', {
        name: 'Student',
        email: 'student@dorm.com',
        phone: '2222222222',
        role: 'student'
      })

      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      const dormitory = (await system.storage.find('Dormitory', undefined, undefined, ['id']))[0]
      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'status', 'dormitory'])
      const bed = beds[0]

      await controller.callInteraction('AssignDormHead', {
        user: admin,
        payload: { userId: dormHead.id, dormitoryId: dormitory.id }
      })

      await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: { userId: student.id, bedId: bed.id }
      })

      await controller.callInteraction('RequestKickout', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          reason: 'Multiple violations'
        }
      })

      const request = (await system.storage.find('KickoutRequest', undefined, undefined, ['id']))[0]

      // Approve request
      const result = await controller.callInteraction('ApproveKickoutRequest', {
        user: admin,
        payload: {
          requestId: request.id,
          comments: 'Approved due to repeated violations'
        }
      })

      expect(result.error).toBeUndefined()

      // Verify request status
      const updatedRequest = await system.storage.get('KickoutRequest', request.id,
        ['status', 'adminComments'])
      expect(updatedRequest.status).toBe('approved')
      expect(updatedRequest.adminComments).toBe('Approved due to repeated violations')

      // Verify user status
      const updatedStudent = await system.storage.get('User', student.id, ['status'])
      expect(updatedStudent.status).toBe('kickedOut')
      
      // Verify bed is vacant
      const updatedBed = await system.storage.get('Bed', bed.id, ['status'])
      expect(updatedBed.status).toBe('vacant')
      
      // Verify relation is deleted
      const relations = await system.storage.find('UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }))
      expect(relations).toHaveLength(0)

      // Verify occupancy count
      const updatedDorm = await system.storage.get('Dormitory', dormitory.id, ['occupancyCount'])
      expect(updatedDorm.occupancyCount).toBe(0)
    })
  })

  describe('TC008: Transfer User Between Beds', () => {
    test('should transfer user from one bed to another', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const student = await system.storage.create('User', {
        name: 'Student',
        email: 'student@dorm.com',
        phone: '2222222222',
        role: 'student'
      })

      // Create two dormitories
      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building B', capacity: 4 }
      })

      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'number', 'status', 'dormitory'])
      const bed1 = beds.find(b => b.number === 'Building A-1')!
      const bed2 = beds.find(b => b.number === 'Building B-1')!

      // Assign to first bed
      await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: { userId: student.id, bedId: bed1.id }
      })

      // Transfer to second bed
      const result = await controller.callInteraction('TransferUser', {
        user: admin,
        payload: { userId: student.id, newBedId: bed2.id }
      })

      expect(result.error).toBeUndefined()

      // Verify old bed is vacant
      const updatedBed1 = await system.storage.get('Bed', bed1.id, ['status'])
      expect(updatedBed1.status).toBe('vacant')
      
      // Verify new bed is occupied
      const updatedBed2 = await system.storage.get('Bed', bed2.id, ['status'])
      expect(updatedBed2.status).toBe('occupied')
      
      // Verify relation is updated
      const relations = await system.storage.find('UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }))
      expect(relations).toHaveLength(1)
      expect(relations[0].target.id).toBe(bed2.id)

      // Verify occupancy counts
      const dorms = await system.storage.find('Dormitory', undefined, undefined,
        ['name', 'occupancyCount'])
      const dormA = dorms.find(d => d.name === 'Building A')!
      const dormB = dorms.find(d => d.name === 'Building B')!
      expect(dormA.occupancyCount).toBe(0)
      expect(dormB.occupancyCount).toBe(1)
    })
  })

  describe('TC009: Multiple Violation Accumulation', () => {
    test('should accumulate violation points correctly', async () => {
      // Setup
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'head@dorm.com',
        phone: '1111111111',
        role: 'student'
      })

      const student = await system.storage.create('User', {
        name: 'Student',
        email: 'student@dorm.com',
        phone: '2222222222',
        role: 'student'
      })

      await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: { name: 'Building A', capacity: 4 }
      })

      const dormitory = (await system.storage.find('Dormitory', undefined, undefined, ['id']))[0]
      const beds = await system.storage.find('Bed', undefined, undefined, ['id', 'status', 'dormitory'])

      await controller.callInteraction('AssignDormHead', {
        user: admin,
        payload: { userId: dormHead.id, dormitoryId: dormitory.id }
      })

      await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: { userId: student.id, bedId: beds[0].id }
      })

      // Create violation rules
      await controller.callInteraction('CreateViolationRule', {
        user: admin,
        payload: {
          name: 'Noise Violation',
          description: 'Making excessive noise',
          points: 10,
          category: 'discipline'
        }
      })

      await controller.callInteraction('CreateViolationRule', {
        user: admin,
        payload: {
          name: 'Hygiene Violation',
          description: 'Poor hygiene standards',
          points: 15,
          category: 'hygiene'
        }
      })

      await controller.callInteraction('CreateViolationRule', {
        user: admin,
        payload: {
          name: 'Safety Violation',
          description: 'Violating safety rules',
          points: 30,
          category: 'safety'
        }
      })

      const rules = await system.storage.find('ViolationRule', undefined, undefined,
        ['id', 'name'])
      const noiseRule = rules.find(r => r.name === 'Noise Violation')!
      const hygieneRule = rules.find(r => r.name === 'Hygiene Violation')!
      const safetyRule = rules.find(r => r.name === 'Safety Violation')!

      // Record multiple violations
      await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          violationRuleId: noiseRule.id,
          description: 'Loud music'
        }
      })

      await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          violationRuleId: hygieneRule.id,
          description: 'Dirty room'
        }
      })

      await controller.callInteraction('RecordViolation', {
        user: dormHead,
        payload: {
          targetUserId: student.id,
          violationRuleId: safetyRule.id,
          description: 'Blocked fire exit'
        }
      })

      // Verify total score
      const updatedStudent = await system.storage.get('User', student.id, ['violationScore'])
      expect(updatedStudent.violationScore).toBe(55) // 10 + 15 + 30

      // Verify all violations recorded
      const violations = await system.storage.find('ViolationRecord', undefined, undefined, ['id'])
      expect(violations).toHaveLength(3)
    })
  })

  describe('TC010: Create Violation Rule', () => {
    test('should create violation rule with all properties', async () => {
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@dorm.com',
        phone: '1234567890',
        role: 'admin'
      })

      const result = await controller.callInteraction('CreateViolationRule', {
        user: admin,
        payload: {
          name: 'Curfew Violation',
          description: 'Returning after 11 PM',
          points: 20,
          category: 'discipline'
        }
      })

      expect(result.error).toBeUndefined()

      const rules = await system.storage.find('ViolationRule', undefined, undefined,
        ['name', 'description', 'points', 'category'])
      expect(rules).toHaveLength(1)
      expect(rules[0].name).toBe('Curfew Violation')
      expect(rules[0].description).toBe('Returning after 11 PM')
      expect(rules[0].points).toBe(20)
      expect(rules[0].category).toBe('discipline')
    })
  })
})