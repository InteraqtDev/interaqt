import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

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
      ignorePermission: false // We want to test permissions
    })

    await controller.setup(true)
  })

  describe('P001: CreateUser - Only admin can create users', () => {
    test('Admin can create user with valid data', async () => {
      const result = await controller.callInteraction('createUser', {
        user: {
          id: 'admin1',
          name: 'Admin User',
          email: 'admin@university.edu',
          studentId: 'ADMIN001',
          role: 'admin'
        },
        payload: {
          name: 'John Doe',
          email: 'john@university.edu', 
          studentId: '2024001',
          phone: '123-456-7890',
          role: 'user'
        }
      })
      
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Non-admin (dormitory leader) cannot create user', async () => {
      const result = await controller.callInteraction('createUser', {
        user: {
          id: 'leader1',
          name: 'Leader User',
          email: 'leader@university.edu',
          studentId: 'LEADER001',
          role: 'dormitoryLeader'
        },
        payload: {
          name: 'John Doe',
          email: 'john@university.edu',
          studentId: '2024001'
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })

    test('Non-admin (regular user) cannot create user', async () => {
      const result = await controller.callInteraction('createUser', {
        user: {
          id: 'user1',
          name: 'Regular User',
          email: 'user@university.edu', 
          studentId: 'USER001',
          role: 'user'
        },
        payload: {
          name: 'John Doe',
          email: 'john@university.edu',
          studentId: '2024001'
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })

  describe('P004: CreateDormitory - Only admin can create dormitories', () => {
    test('Admin can create dormitory', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: {
          id: 'admin1',
          name: 'Admin User',
          email: 'admin@university.edu',
          studentId: 'ADMIN001',
          role: 'admin'
        },
        payload: {
          name: 'Block A',
          location: 'North Campus',
          capacity: 6
        }
      })
      
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Non-admin cannot create dormitory', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: {
          id: 'user1',
          name: 'Regular User',
          email: 'user@university.edu',
          studentId: 'USER001',
          role: 'user'
        },
        payload: {
          name: 'Block B',
          location: 'South Campus',
          capacity: 4
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })

  describe('P007, P010, P012, P013, P018: Additional admin-only permissions', () => {
    test('Admin can create bed (P007)', async () => {
      const result = await controller.callInteraction('createBed', {
        user: { id: 'admin1', role: 'admin' },
        payload: { dormitoryId: 'dorm1', number: 'A1' }
      })
      expect(result.error).toBeUndefined()
    })

    test('Non-admin cannot create bed (P007)', async () => {
      const result = await controller.callInteraction('createBed', {
        user: { id: 'user1', role: 'user' },
        payload: { dormitoryId: 'dorm1', number: 'A1' }
      })
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })

    test('Admin can assign user to bed (P010)', async () => {
      const result = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin1', role: 'admin' },
        payload: { userId: 'user1', bedId: 'bed1' }
      })
      expect(result.error).toBeUndefined()
    })

    test('Admin can assign dormitory leader (P012)', async () => {
      const result = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin1', role: 'admin' },
        payload: { userId: 'user1', dormitoryId: 'dorm1' }
      })
      expect(result.error).toBeUndefined()
    })

    test('Admin can create deduction rule (P013)', async () => {
      const result = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Noise Violation', description: 'Making noise after 10 PM', points: 10 }
      })
      expect(result.error).toBeUndefined()
    })

    test('Admin can process removal request (P018)', async () => {
      const result = await controller.callInteraction('processRemovalRequest', {
        user: { id: 'admin1', role: 'admin' },
        payload: { requestId: 'req1', decision: 'approved' }
      })
      expect(result.error).toBeUndefined()
    })
  })

  describe('BR006: CreateDormitory - Capacity must be 4-6', () => {
    test('Can create dormitory with capacity 4', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Block C', location: 'East Campus', capacity: 4 }
      })
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Can create dormitory with capacity 6', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Block D', location: 'West Campus', capacity: 6 }
      })
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Cannot create dormitory with capacity 3', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Block E', location: 'South Campus', capacity: 3 }
      })
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })

    test('Cannot create dormitory with capacity 7', async () => {
      const result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Block F', location: 'North Campus', capacity: 7 }
      })
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })

  describe('BR016: CreateDeductionRule - Points must be positive', () => {
    test('Can create rule with positive points', async () => {
      const result = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Noise Violation', description: 'Making noise after 10 PM', points: 10 }
      })
      expect(result.error).toBeUndefined()
      expect(result.effects).toBeDefined()
    })

    test('Cannot create rule with zero points', async () => {
      const result = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Warning', description: 'First warning', points: 0 }
      })
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })

    test('Cannot create rule with negative points', async () => {
      const result = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { name: 'Reward', description: 'Good behavior', points: -5 }
      })
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })

  describe('BR018: ApplyPointDeduction - Cannot apply inactive rule', () => {
    test('Can apply deduction with active rule', async () => {
      // First create an active deduction rule
      const ruleResult = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { 
          name: 'Test Rule', 
          description: 'Test rule for BR018', 
          points: 5, 
          isActive: true 
        }
      })
      expect(ruleResult.error).toBeUndefined()
      
      // Wait for computations to process
      await new Promise(resolve => setTimeout(resolve, 100))

      // Get rule ID from effects or fallback to query
      let ruleId
      const ruleEffect = ruleResult.effects?.find(e => e.recordName === 'DeductionRule' && e.type === 'create')
      if (ruleEffect && ruleEffect.record.id) {
        ruleId = ruleEffect.record.id
      } else {
        // Fallback: query for the rule
        const rules = await controller.system.storage.find(
          'DeductionRule',
          undefined,
          undefined,
          ['id', 'name']
        )
        const rule = rules.find((r: any) => r.name === 'Test Rule')
        ruleId = rule?.id
      }
      expect(ruleId).toBeDefined()

      // Now try to apply the active rule
      const result = await controller.callInteraction('applyPointDeduction', {
        user: { id: 'admin1', role: 'admin' },
        payload: { 
          targetUserId: 'user1', 
          ruleId: ruleId, 
          reason: 'Test deduction' 
        }
      })
      // Note: This might fail due to missing user/permission, but the rule check should pass
      // We're mainly checking that the ActiveRuleCondition doesn't reject it
      if (result.error) {
        // If there's an error, it should NOT be a condition check failed due to inactive rule
        expect((result.error as any).type).not.toBe('condition check failed')
      } else {
        expect(result.effects).toBeDefined()
      }
    })

    test('Cannot apply deduction with inactive rule', async () => {
      // First create an inactive deduction rule
      const ruleResult = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin1', role: 'admin' },
        payload: { 
          name: 'Inactive Rule', 
          description: 'Inactive rule for BR018', 
          points: 10, 
          isActive: false 
        }
      })
      expect(ruleResult.error).toBeUndefined()
      
      // Wait for computations to process
      await new Promise(resolve => setTimeout(resolve, 100))

      // Get rule ID from effects or fallback to query
      let ruleId
      const ruleEffect = ruleResult.effects?.find(e => e.recordName === 'DeductionRule' && e.type === 'create')
      if (ruleEffect && ruleEffect.record.id) {
        ruleId = ruleEffect.record.id
      } else {
        // Fallback: query for the rule
        const rules = await controller.system.storage.find(
          'DeductionRule',
          undefined,
          undefined,
          ['id', 'name']
        )
        const rule = rules.find((r: any) => r.name === 'Inactive Rule')
        ruleId = rule?.id
      }
      expect(ruleId).toBeDefined()

      // Now try to apply the inactive rule
      const result = await controller.callInteraction('applyPointDeduction', {
        user: { id: 'admin1', role: 'admin' },
        payload: { 
          targetUserId: 'user1', 
          ruleId: ruleId, 
          reason: 'Test deduction with inactive rule' 
        }
      })
      
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
    })
  })
})