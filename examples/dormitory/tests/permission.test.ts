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

  describe('Phase 3: User-Specific Permissions', () => {
    describe('P002: UpdateUser - Users can update own profile, admins can update any', () => {
      test('Admin can update any user profile', async () => {
        const result = await controller.callInteraction('updateUser', {
          user: { id: 'admin1', role: 'admin' },
          payload: { userId: 'user123', name: 'Updated Name' }
        })
        expect(result.error).toBeUndefined()
        expect(result.effects).toBeDefined()
      })

      test('User can update own profile', async () => {
        const result = await controller.callInteraction('updateUser', {
          user: { id: 'user123', role: 'user' },
          payload: { userId: 'user123', name: 'Updated Name' }
        })
        expect(result.error).toBeUndefined()
        expect(result.effects).toBeDefined()
      })

      test('User cannot update other user profile', async () => {
        const result = await controller.callInteraction('updateUser', {
          user: { id: 'user123', role: 'user' },
          payload: { userId: 'user456', name: 'Updated Name' }
        })
        expect(result.error).toBeDefined()
        expect((result.error as any).type).toBe('condition check failed')
      })
    })

    describe('P017: SubmitRemovalRequest - Only dormitory leaders can submit requests', () => {
      test('Dormitory leader can submit removal request', async () => {
        const result = await controller.callInteraction('submitRemovalRequest', {
          user: { id: 'leader1', role: 'dormitoryLeader' },
          payload: { targetUserId: 'user123', reason: 'Repeated violations' }
        })
        // May fail due to business logic but permission should pass
        if (result.error) {
          expect((result.error as any).type).not.toBe('condition check failed')
        } else {
          expect(result.effects).toBeDefined()
        }
      })

      test('Regular user cannot submit removal request', async () => {
        const result = await controller.callInteraction('submitRemovalRequest', {
          user: { id: 'user1', role: 'user' },
          payload: { targetUserId: 'user123', reason: 'Repeated violations' }
        })
        expect(result.error).toBeDefined()
        expect((result.error as any).type).toBe('condition check failed')
      })

      test('Admin cannot submit removal request (not a leader)', async () => {
        const result = await controller.callInteraction('submitRemovalRequest', {
          user: { id: 'admin1', role: 'admin' },
          payload: { targetUserId: 'user123', reason: 'Repeated violations' }
        })
        expect(result.error).toBeDefined()
        expect((result.error as any).type).toBe('condition check failed')
      })
    })

    describe('BR012: AssignUserToBed - User can only be assigned to one bed at a time', () => {
      test('Can assign unassigned user to vacant bed', async () => {
        /**
         * Test Plan for: BR012
         * Dependencies: User entity, Bed entity, Dormitory entity, UserBedAssignmentRelation
         * Steps: 1) Create admin user 2) Create dormitory 3) Create bed 4) Create user 5) Assign user to bed
         * Business Logic: User not currently assigned to any bed can be assigned to a vacant bed
         */
        
        // Create admin user
        const adminResult = await controller.callInteraction('createUser', {
          user: { id: 'admin1', role: 'admin' },
          payload: {
            name: 'Admin User',
            email: 'admin@university.edu',
            studentId: 'ADMIN001',
            role: 'admin'
          }
        })
        expect(adminResult.error).toBeUndefined()

        // Create dormitory
        const dormitoryResult = await controller.callInteraction('createDormitory', {
          user: { id: 'admin1', role: 'admin' },
          payload: {
            name: 'Test Dormitory',
            location: 'Building A',
            capacity: 4
          }
        })
        
        expect(dormitoryResult.error).toBeUndefined()
        
        // Wait for async computations to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if the Dormitory was created via Transform computation
        const allDormitories = await system.storage.find(
          'Dormitory',
          undefined,
          undefined,
          ['id', 'name', 'location', 'capacity']
        )
        
        expect(allDormitories.length).toBeGreaterThan(0)
        const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory')
        expect(createdDormitory).toBeDefined()
        const dormitoryId = createdDormitory.id

        // Create bed
        const bedResult = await controller.callInteraction('createBed', {
          user: { id: 'admin1', role: 'admin' },
          payload: {
            number: 'A101',
            dormitoryId: dormitoryId
          }
        })
        expect(bedResult.error).toBeUndefined()
        
        // Wait for bed creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created bed
        const allBeds = await system.storage.find(
          'Bed',
          undefined,
          undefined,
          ['id', 'number']
        )
        
        const createdBed = allBeds.find(b => b.number === 'A101')
        expect(createdBed).toBeDefined()
        const bedId = createdBed.id

        // Create regular user
        const userResult = await controller.callInteraction('createUser', {
          user: { id: 'admin1', role: 'admin' },
          payload: {
            name: 'Test User',
            email: 'user@university.edu',
            studentId: '2024001',
            role: 'user'
          }
        })
        expect(userResult.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser = allUsers.find(u => u.email === 'user@university.edu')
        expect(createdUser).toBeDefined()
        const userId = createdUser.id

        // Assign user to bed - should succeed
        const assignResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin1', role: 'admin' },
          payload: {
            userId: userId,
            bedId: bedId
          }
        })
        expect(assignResult.error).toBeUndefined()
        expect(assignResult.effects).toBeDefined()
      })

      test('Cannot assign user who already has a bed assignment', async () => {
        /**
         * Test Plan for: BR012 violation
         * Dependencies: User entity, Bed entity, Dormitory entity, UserBedAssignmentRelation
         * Steps: 1) Create admin user 2) Create dormitory 3) Create two beds 4) Create user 5) Assign user to first bed 6) Try to assign to second bed
         * Business Logic: User already assigned to a bed cannot be assigned to another bed
         */
        
        // Create admin user
        const adminResult = await controller.callInteraction('createUser', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            name: 'Admin User 2',
            email: 'admin2@university.edu',
            studentId: 'ADMIN002',
            role: 'admin'
          }
        })
        expect(adminResult.error).toBeUndefined()

        // Create dormitory
        const dormitoryResult = await controller.callInteraction('createDormitory', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            name: 'Test Dormitory 2',
            location: 'Building B',
            capacity: 4
          }
        })
        expect(dormitoryResult.error).toBeUndefined()
        
        // Wait for async computations to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if the Dormitory was created via Transform computation
        const allDormitories = await system.storage.find(
          'Dormitory',
          undefined,
          undefined,
          ['id', 'name', 'location', 'capacity']
        )
        
        expect(allDormitories.length).toBeGreaterThan(0)
        const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 2')
        expect(createdDormitory).toBeDefined()
        const dormitoryId = createdDormitory.id

        // Create first bed
        const bed1Result = await controller.callInteraction('createBed', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            number: 'B101',
            dormitoryId: dormitoryId
          }
        })
        expect(bed1Result.error).toBeUndefined()
        
        // Wait for bed creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created bed
        const allBeds1 = await system.storage.find(
          'Bed',
          undefined,
          undefined,
          ['id', 'number']
        )
        
        const createdBed1 = allBeds1.find(b => b.number === 'B101')
        expect(createdBed1).toBeDefined()
        const bed1Id = createdBed1.id

        // Create second bed
        const bed2Result = await controller.callInteraction('createBed', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            number: 'B102',
            dormitoryId: dormitoryId
          }
        })
        expect(bed2Result.error).toBeUndefined()
        
        // Wait for bed creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created bed
        const allBeds2 = await system.storage.find(
          'Bed',
          undefined,
          undefined,
          ['id', 'number']
        )
        
        const createdBed2 = allBeds2.find(b => b.number === 'B102')
        expect(createdBed2).toBeDefined()
        const bed2Id = createdBed2.id

        // Create regular user
        const userResult = await controller.callInteraction('createUser', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            name: 'Test User 2',
            email: 'user2@university.edu',
            studentId: '2024002',
            role: 'user'
          }
        })
        expect(userResult.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers2 = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser2 = allUsers2.find(u => u.email === 'user2@university.edu')
        expect(createdUser2).toBeDefined()
        const userId = createdUser2.id

        // Assign user to first bed - should succeed
        const firstAssignResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            userId: userId,
            bedId: bed1Id
          }
        })
        expect(firstAssignResult.error).toBeUndefined()
        expect(firstAssignResult.effects).toBeDefined()

        // Try to assign same user to second bed - should fail with condition check failed
        const secondAssignResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin2', role: 'admin' },
          payload: {
            userId: userId,
            bedId: bed2Id
          }
        })
        expect(secondAssignResult.error).toBeDefined()
        expect((secondAssignResult.error as any).type).toBe('condition check failed')
      })
    })

    describe('BR013: AssignUserToBed - Bed can only accommodate one user', () => {
      test('Can assign user to vacant bed', async () => {
        /**
         * Test Plan for: BR013
         * Dependencies: User entity, Bed entity, Dormitory entity, UserBedAssignmentRelation
         * Steps: 1) Create admin user 2) Create dormitory 3) Create bed 4) Create user 5) Assign user to vacant bed
         * Business Logic: User can be assigned to a bed that has no existing occupant
         */
        
        // Create admin user
        const adminResult = await controller.callInteraction('createUser', {
          user: { id: 'admin3', role: 'admin' },
          payload: {
            name: 'Admin User 3',
            email: 'admin3@university.edu',
            studentId: 'ADMIN003',
            role: 'admin'
          }
        })
        expect(adminResult.error).toBeUndefined()

        // Create dormitory
        const dormitoryResult = await controller.callInteraction('createDormitory', {
          user: { id: 'admin3', role: 'admin' },
          payload: {
            name: 'Test Dormitory 3',
            location: 'Building C',
            capacity: 4
          }
        })
        expect(dormitoryResult.error).toBeUndefined()
        
        // Wait for async computations to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if the Dormitory was created via Transform computation
        const allDormitories = await system.storage.find(
          'Dormitory',
          undefined,
          undefined,
          ['id', 'name', 'location', 'capacity']
        )
        
        expect(allDormitories.length).toBeGreaterThan(0)
        const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 3')
        expect(createdDormitory).toBeDefined()
        const dormitoryId = createdDormitory.id

        // Create bed
        const bedResult = await controller.callInteraction('createBed', {
          user: { id: 'admin3', role: 'admin' },
          payload: {
            number: 'C101',
            dormitoryId: dormitoryId
          }
        })
        expect(bedResult.error).toBeUndefined()
        
        // Wait for bed creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created bed
        const allBeds = await system.storage.find(
          'Bed',
          undefined,
          undefined,
          ['id', 'number']
        )
        
        const createdBed = allBeds.find(b => b.number === 'C101')
        expect(createdBed).toBeDefined()
        const bedId = createdBed.id

        // Create regular user
        const userResult = await controller.callInteraction('createUser', {
          user: { id: 'admin3', role: 'admin' },
          payload: {
            name: 'Test User 3',
            email: 'user3@university.edu',
            studentId: '2024003',
            role: 'user'
          }
        })
        expect(userResult.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser = allUsers.find(u => u.email === 'user3@university.edu')
        expect(createdUser).toBeDefined()
        const userId = createdUser.id

        // Assign user to vacant bed - should succeed
        const assignResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin3', role: 'admin' },
          payload: {
            userId: userId,
            bedId: bedId
          }
        })
        expect(assignResult.error).toBeUndefined()
        expect(assignResult.effects).toBeDefined()
      })

      test('Cannot assign user to occupied bed', async () => {
        /**
         * Test Plan for: BR013 violation
         * Dependencies: User entity, Bed entity, Dormitory entity, UserBedAssignmentRelation
         * Steps: 1) Create admin user 2) Create dormitory 3) Create bed 4) Create two users 5) Assign first user to bed 6) Try to assign second user to same bed
         * Business Logic: Bed already occupied by one user cannot accommodate another user
         */
        
        // Create admin user
        const adminResult = await controller.callInteraction('createUser', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            name: 'Admin User 4',
            email: 'admin4@university.edu',
            studentId: 'ADMIN004',
            role: 'admin'
          }
        })
        expect(adminResult.error).toBeUndefined()

        // Create dormitory
        const dormitoryResult = await controller.callInteraction('createDormitory', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            name: 'Test Dormitory 4',
            location: 'Building D',
            capacity: 4
          }
        })
        expect(dormitoryResult.error).toBeUndefined()
        
        // Wait for async computations to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if the Dormitory was created via Transform computation
        const allDormitories = await system.storage.find(
          'Dormitory',
          undefined,
          undefined,
          ['id', 'name', 'location', 'capacity']
        )
        
        expect(allDormitories.length).toBeGreaterThan(0)
        const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 4')
        expect(createdDormitory).toBeDefined()
        const dormitoryId = createdDormitory.id

        // Create bed
        const bedResult = await controller.callInteraction('createBed', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            number: 'D101',
            dormitoryId: dormitoryId
          }
        })
        expect(bedResult.error).toBeUndefined()
        
        // Wait for bed creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created bed
        const allBeds = await system.storage.find(
          'Bed',
          undefined,
          undefined,
          ['id', 'number']
        )
        
        const createdBed = allBeds.find(b => b.number === 'D101')
        expect(createdBed).toBeDefined()
        const bedId = createdBed.id

        // Create first user
        const user1Result = await controller.callInteraction('createUser', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            name: 'Test User 4',
            email: 'user4@university.edu',
            studentId: '2024004',
            role: 'user'
          }
        })
        expect(user1Result.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers1 = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser1 = allUsers1.find(u => u.email === 'user4@university.edu')
        expect(createdUser1).toBeDefined()
        const user1Id = createdUser1.id

        // Create second user
        const user2Result = await controller.callInteraction('createUser', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            name: 'Test User 5',
            email: 'user5@university.edu',
            studentId: '2024005',
            role: 'user'
          }
        })
        expect(user2Result.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers2 = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser2 = allUsers2.find(u => u.email === 'user5@university.edu')
        expect(createdUser2).toBeDefined()
        const user2Id = createdUser2.id

        // Assign first user to bed - should succeed
        const firstAssignResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            userId: user1Id,
            bedId: bedId
          }
        })
        expect(firstAssignResult.error).toBeUndefined()
        expect(firstAssignResult.effects).toBeDefined()

        // Try to assign second user to same bed - should fail with condition check failed
        const secondAssignResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin4', role: 'admin' },
          payload: {
            userId: user2Id,
            bedId: bedId
          }
        })
        expect(secondAssignResult.error).toBeDefined()
        expect((secondAssignResult.error as any).type).toBe('condition check failed')
      })
    })

    describe('BR015: AssignDormitoryLeader - Leader must be a resident of the dormitory', () => {
      test('Can assign leader who is resident of the dormitory', async () => {
        /**
         * Test Plan for: BR015
         * Dependencies: User entity, Bed entity, Dormitory entity, UserBedAssignmentRelation, DormitoryBedRelation
         * Steps: 1) Create admin user 2) Create dormitory 3) Create bed 4) Create user 5) Assign user to bed 6) Assign user as dormitory leader
         * Business Logic: User who is assigned to a bed in the dormitory can be assigned as leader
         */
        
        // Create admin user
        const adminResult = await controller.callInteraction('createUser', {
          user: { id: 'admin5', role: 'admin' },
          payload: {
            name: 'Admin User 5',
            email: 'admin5@university.edu',
            studentId: 'ADMIN005',
            role: 'admin'
          }
        })
        expect(adminResult.error).toBeUndefined()

        // Create dormitory
        const dormitoryResult = await controller.callInteraction('createDormitory', {
          user: { id: 'admin5', role: 'admin' },
          payload: {
            name: 'Test Dormitory 5',
            location: 'Building E',
            capacity: 4
          }
        })
        expect(dormitoryResult.error).toBeUndefined()
        
        // Wait for async computations to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if the Dormitory was created via Transform computation
        const allDormitories = await system.storage.find(
          'Dormitory',
          undefined,
          undefined,
          ['id', 'name', 'location', 'capacity']
        )
        
        expect(allDormitories.length).toBeGreaterThan(0)
        const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 5')
        expect(createdDormitory).toBeDefined()
        const dormitoryId = createdDormitory.id

        // Create bed
        const bedResult = await controller.callInteraction('createBed', {
          user: { id: 'admin5', role: 'admin' },
          payload: {
            number: 'E101',
            dormitoryId: dormitoryId
          }
        })
        expect(bedResult.error).toBeUndefined()
        
        // Wait for bed creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created bed
        const allBeds = await system.storage.find(
          'Bed',
          undefined,
          undefined,
          ['id', 'number']
        )
        
        const createdBed = allBeds.find(b => b.number === 'E101')
        expect(createdBed).toBeDefined()
        const bedId = createdBed.id

        // Create regular user
        const userResult = await controller.callInteraction('createUser', {
          user: { id: 'admin5', role: 'admin' },
          payload: {
            name: 'Test User 6',
            email: 'user6@university.edu',
            studentId: '2024006',
            role: 'user'
          }
        })
        expect(userResult.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser = allUsers.find(u => u.email === 'user6@university.edu')
        expect(createdUser).toBeDefined()
        const userId = createdUser.id

        // Assign user to bed in the dormitory
        const assignBedResult = await controller.callInteraction('assignUserToBed', {
          user: { id: 'admin5', role: 'admin' },
          payload: {
            userId: userId,
            bedId: bedId
          }
        })
        expect(assignBedResult.error).toBeUndefined()
        expect(assignBedResult.effects).toBeDefined()
        
        // Wait for bed assignment to complete
        await new Promise(resolve => setTimeout(resolve, 100))

        // Assign user as dormitory leader - should succeed because user is a resident
        const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
          user: { id: 'admin5', role: 'admin' },
          payload: {
            userId: userId,
            dormitoryId: dormitoryId
          }
        })
        expect(assignLeaderResult.error).toBeUndefined()
        expect(assignLeaderResult.effects).toBeDefined()
      })

      test('Cannot assign leader who is not resident of the dormitory', async () => {
        /**
         * Test Plan for: BR015 violation
         * Dependencies: User entity, Bed entity, Dormitory entity, UserBedAssignmentRelation, DormitoryBedRelation
         * Steps: 1) Create admin user 2) Create dormitory 3) Create user (not assigned to any bed) 4) Try to assign user as dormitory leader
         * Business Logic: User who is not assigned to a bed in the dormitory cannot be assigned as leader
         */
        
        // Create admin user
        const adminResult = await controller.callInteraction('createUser', {
          user: { id: 'admin6', role: 'admin' },
          payload: {
            name: 'Admin User 6',
            email: 'admin6@university.edu',
            studentId: 'ADMIN006',
            role: 'admin'
          }
        })
        expect(adminResult.error).toBeUndefined()

        // Create dormitory
        const dormitoryResult = await controller.callInteraction('createDormitory', {
          user: { id: 'admin6', role: 'admin' },
          payload: {
            name: 'Test Dormitory 6',
            location: 'Building F',
            capacity: 4
          }
        })
        expect(dormitoryResult.error).toBeUndefined()
        
        // Wait for async computations to complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Check if the Dormitory was created via Transform computation
        const allDormitories = await system.storage.find(
          'Dormitory',
          undefined,
          undefined,
          ['id', 'name', 'location', 'capacity']
        )
        
        expect(allDormitories.length).toBeGreaterThan(0)
        const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 6')
        expect(createdDormitory).toBeDefined()
        const dormitoryId = createdDormitory.id

        // Create regular user (but do NOT assign them to any bed in this dormitory)
        const userResult = await controller.callInteraction('createUser', {
          user: { id: 'admin6', role: 'admin' },
          payload: {
            name: 'Test User 7',
            email: 'user7@university.edu',
            studentId: '2024007',
            role: 'user'
          }
        })
        expect(userResult.error).toBeUndefined()
        
        // Wait for user creation
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Find the created user
        const allUsers = await system.storage.find(
          'User',
          undefined,
          undefined,
          ['id', 'email']
        )
        
        const createdUser = allUsers.find(u => u.email === 'user7@university.edu')
        expect(createdUser).toBeDefined()
        const userId = createdUser.id

        // Try to assign user as dormitory leader without them being a resident - should fail
        const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
          user: { id: 'admin6', role: 'admin' },
          payload: {
            userId: userId,
            dormitoryId: dormitoryId
          }
        })
        expect(assignLeaderResult.error).toBeDefined()
        expect((assignLeaderResult.error as any).type).toBe('condition check failed')
      })
    })
  })

  describe('BR009: CreateBed - Cannot exceed dormitory capacity', () => {
    test('Can create bed when under capacity', async () => {
      // First create a dormitory with capacity 4
      const dormitoryResult = await controller.callInteraction('createDormitory', {
        user: { id: 'admin8', role: 'admin' },
        payload: {
          name: 'Test Dormitory 8',
          location: 'Building H',
          capacity: 4
        }
      })
      expect(dormitoryResult.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitory
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name', 'capacity']
      )
      
      const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 8')
      expect(createdDormitory).toBeDefined()
      expect(createdDormitory.capacity).toBe(4)
      const dormitoryId = createdDormitory.id

      // Create first bed - should succeed (1/4)
      const bedResult1 = await controller.callInteraction('createBed', {
        user: { id: 'admin8', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-001'
        }
      })
      expect(bedResult1.error).toBeUndefined()

      // Create second bed - should succeed (2/4)  
      const bedResult2 = await controller.callInteraction('createBed', {
        user: { id: 'admin8', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-002'
        }
      })
      expect(bedResult2.error).toBeUndefined()

      // Create third bed - should succeed (3/4)
      const bedResult3 = await controller.callInteraction('createBed', {
        user: { id: 'admin8', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-003'
        }
      })
      expect(bedResult3.error).toBeUndefined()

      // Create fourth bed - should succeed (4/4)
      const bedResult4 = await controller.callInteraction('createBed', {
        user: { id: 'admin8', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-004'
        }
      })
      expect(bedResult4.error).toBeUndefined()
    })

    test('Cannot create bed when at capacity', async () => {
      // Create a dormitory with capacity 4
      const dormitoryResult = await controller.callInteraction('createDormitory', {
        user: { id: 'admin9', role: 'admin' },
        payload: {
          name: 'Test Dormitory 9',
          location: 'Building I', 
          capacity: 4
        }
      })
      expect(dormitoryResult.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitory
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name', 'capacity']
      )
      
      const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 9')
      expect(createdDormitory).toBeDefined()
      const dormitoryId = createdDormitory.id

      // Create 4 beds to reach capacity
      for (let i = 1; i <= 4; i++) {
        const bedResult = await controller.callInteraction('createBed', {
          user: { id: 'admin9', role: 'admin' },
          payload: {
            dormitoryId: dormitoryId,
            number: `BED-${i.toString().padStart(3, '0')}`
          }
        })
        expect(bedResult.error).toBeUndefined()
      }

      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))

      // Try to create 5th bed - should fail (exceeds capacity)
      const bedResult5 = await controller.callInteraction('createBed', {
        user: { id: 'admin9', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-005'
        }
      })
      expect(bedResult5.error).toBeDefined()
      expect((bedResult5.error as any).type).toBe('condition check failed')
    })
  })

  describe('P016: ApplyPointDeduction - Admins can deduct from any user, leaders only from their dormitory residents', () => {
    test('Admin can deduct points from any user', async () => {
      // Create a deduction rule first
      const ruleResult = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin10', role: 'admin' },
        payload: {
          name: 'Test Rule 16A',
          description: 'Test rule for P016',
          points: 10,
          isActive: true
        }
      })
      expect(ruleResult.error).toBeUndefined()
      
      // Wait for rule creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created rule
      const allRules = await system.storage.find(
        'DeductionRule',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdRule = allRules.find(r => r.name === 'Test Rule 16A')
      expect(createdRule).toBeDefined()
      const ruleId = createdRule.id

      // Create any user
      const userResult = await controller.callInteraction('createUser', {
        user: { id: 'admin10', role: 'admin' },
        payload: {
          name: 'Target User 16A',
          email: 'target16a@university.edu',
          studentId: '2024016A',
          role: 'user'
        }
      })
      expect(userResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created user
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const createdUser = allUsers.find(u => u.email === 'target16a@university.edu')
      expect(createdUser).toBeDefined()
      const targetUserId = createdUser.id

      // Admin can apply point deduction to any user
      const deductionResult = await controller.callInteraction('applyPointDeduction', {
        user: { id: 'admin10', role: 'admin' },
        payload: {
          targetUserId: targetUserId,
          ruleId: ruleId,
          reason: 'Test deduction by admin'
        }
      })
      expect(deductionResult.error).toBeUndefined()
    })

    test('Dormitory leader can deduct from their residents', async () => {
      // Create dormitory
      const dormitoryResult = await controller.callInteraction('createDormitory', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          name: 'Test Dormitory 16B',
          location: 'Building J',
          capacity: 4
        }
      })
      expect(dormitoryResult.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitory
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 16B')
      expect(createdDormitory).toBeDefined()
      const dormitoryId = createdDormitory.id

      // Create bed in dormitory
      const bedResult = await controller.callInteraction('createBed', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-16B'
        }
      })
      expect(bedResult.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created bed
      const allBeds = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const createdBed = allBeds.find(b => b.number === 'BED-16B')
      expect(createdBed).toBeDefined()
      const bedId = createdBed.id

      // Create dormitory leader
      const leaderResult = await controller.callInteraction('createUser', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          name: 'Leader User 16B',
          email: 'leader16b@university.edu',
          studentId: '2024LEADER16B',
          role: 'user'
        }
      })
      expect(leaderResult.error).toBeUndefined()
      
      // Wait for leader creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created leader
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const createdLeader = allUsers.find(u => u.email === 'leader16b@university.edu')
      expect(createdLeader).toBeDefined()
      const leaderId = createdLeader.id

      // Create resident user
      const residentResult = await controller.callInteraction('createUser', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          name: 'Resident User 16B',
          email: 'resident16b@university.edu',
          studentId: '2024RESIDENT16B',
          role: 'user'
        }
      })
      expect(residentResult.error).toBeUndefined()
      
      // Wait for resident creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created resident
      const allUsersAfterResident = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const createdResident = allUsersAfterResident.find(u => u.email === 'resident16b@university.edu')
      expect(createdResident).toBeDefined()
      const residentId = createdResident.id

      // Assign leader to bed in dormitory first (must be resident)
      const assignLeaderToBedResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          userId: leaderId,
          bedId: bedId
        }
      })
      expect(assignLeaderToBedResult.error).toBeUndefined()

      // Assign user as dormitory leader
      const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          userId: leaderId,
          dormitoryId: dormitoryId
        }
      })
      expect(assignLeaderResult.error).toBeUndefined()

      // Wait for assignments
      await new Promise(resolve => setTimeout(resolve, 200))

      // Create another bed for the resident
      const bedResult2 = await controller.callInteraction('createBed', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-16B2'
        }
      })
      expect(bedResult2.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the second bed
      const allBedsAfter = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const createdBed2 = allBedsAfter.find(b => b.number === 'BED-16B2')
      expect(createdBed2).toBeDefined()
      const bedId2 = createdBed2.id

      // Assign resident to bed in same dormitory
      const assignResidentResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          userId: residentId,
          bedId: bedId2
        }
      })
      expect(assignResidentResult.error).toBeUndefined()

      // Wait for resident assignment
      await new Promise(resolve => setTimeout(resolve, 100))

      // Create a deduction rule
      const ruleResult = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin11', role: 'admin' },
        payload: {
          name: 'Test Rule 16B',
          description: 'Test rule for P016 dormitory leader',
          points: 5,
          isActive: true
        }
      })
      expect(ruleResult.error).toBeUndefined()
      
      // Wait for rule creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created rule
      const allRules = await system.storage.find(
        'DeductionRule',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdRule = allRules.find(r => r.name === 'Test Rule 16B')
      expect(createdRule).toBeDefined()
      const ruleId = createdRule.id

      // Dormitory leader can deduct points from their resident
      const deductionResult = await controller.callInteraction('applyPointDeduction', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        payload: {
          targetUserId: residentId,
          ruleId: ruleId,
          reason: 'Test deduction by dormitory leader'
        }
      })
      expect(deductionResult.error).toBeUndefined()
    })

    test('Dormitory leader cannot deduct from other dormitory residents', async () => {
      // Create two dormitories
      const dormitory1Result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          name: 'Test Dormitory 16C1',
          location: 'Building K1',
          capacity: 4
        }
      })
      expect(dormitory1Result.error).toBeUndefined()

      const dormitory2Result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          name: 'Test Dormitory 16C2',
          location: 'Building K2',
          capacity: 4
        }
      })
      expect(dormitory2Result.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitories
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const dormitory1 = allDormitories.find(d => d.name === 'Test Dormitory 16C1')
      const dormitory2 = allDormitories.find(d => d.name === 'Test Dormitory 16C2')
      expect(dormitory1).toBeDefined()
      expect(dormitory2).toBeDefined()
      const dormitory1Id = dormitory1.id
      const dormitory2Id = dormitory2.id

      // Create beds in both dormitories
      const bed1Result = await controller.callInteraction('createBed', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          dormitoryId: dormitory1Id,
          number: 'BED-16C1'
        }
      })
      expect(bed1Result.error).toBeUndefined()

      const bed2Result = await controller.callInteraction('createBed', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          dormitoryId: dormitory2Id,
          number: 'BED-16C2'
        }
      })
      expect(bed2Result.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created beds
      const allBeds = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const bed1 = allBeds.find(b => b.number === 'BED-16C1')
      const bed2 = allBeds.find(b => b.number === 'BED-16C2')
      expect(bed1).toBeDefined()
      expect(bed2).toBeDefined()
      const bed1Id = bed1.id
      const bed2Id = bed2.id

      // Create leader and resident users
      const leaderResult = await controller.callInteraction('createUser', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          name: 'Leader User 16C',
          email: 'leader16c@university.edu',
          studentId: '2024LEADER16C',
          role: 'user'
        }
      })
      expect(leaderResult.error).toBeUndefined()

      const residentResult = await controller.callInteraction('createUser', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          name: 'Resident User 16C',
          email: 'resident16c@university.edu',
          studentId: '2024RESIDENT16C',
          role: 'user'
        }
      })
      expect(residentResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const leader = allUsers.find(u => u.email === 'leader16c@university.edu')
      const resident = allUsers.find(u => u.email === 'resident16c@university.edu')
      expect(leader).toBeDefined()
      expect(resident).toBeDefined()
      const leaderId = leader.id
      const residentId = resident.id

      // Assign leader to dormitory 1
      const assignLeaderToBedResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          userId: leaderId,
          bedId: bed1Id
        }
      })
      expect(assignLeaderToBedResult.error).toBeUndefined()

      const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          userId: leaderId,
          dormitoryId: dormitory1Id
        }
      })
      expect(assignLeaderResult.error).toBeUndefined()

      // Assign resident to dormitory 2 (different from leader's dormitory)
      const assignResidentResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          userId: residentId,
          bedId: bed2Id
        }
      })
      expect(assignResidentResult.error).toBeUndefined()

      // Wait for assignments
      await new Promise(resolve => setTimeout(resolve, 200))

      // Create a deduction rule
      const ruleResult = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin12', role: 'admin' },
        payload: {
          name: 'Test Rule 16C',
          description: 'Test rule for P016 cross-dormitory test',
          points: 5,
          isActive: true
        }
      })
      expect(ruleResult.error).toBeUndefined()
      
      // Wait for rule creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created rule
      const allRules = await system.storage.find(
        'DeductionRule',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdRule = allRules.find(r => r.name === 'Test Rule 16C')
      expect(createdRule).toBeDefined()
      const ruleId = createdRule.id

      // Dormitory leader cannot deduct points from resident of different dormitory
      const deductionResult = await controller.callInteraction('applyPointDeduction', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        payload: {
          targetUserId: residentId,
          ruleId: ruleId,
          reason: 'Test deduction attempt - should fail'
        }
      })
      expect(deductionResult.error).toBeDefined()
      expect((deductionResult.error as any).type).toBe('condition check failed')
    })

    test('Regular user cannot deduct points', async () => {
      // Create a deduction rule first
      const ruleResult = await controller.callInteraction('createDeductionRule', {
        user: { id: 'admin13', role: 'admin' },
        payload: {
          name: 'Test Rule 16D',
          description: 'Test rule for P016 regular user test',
          points: 10,
          isActive: true
        }
      })
      expect(ruleResult.error).toBeUndefined()
      
      // Wait for rule creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created rule
      const allRules = await system.storage.find(
        'DeductionRule',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdRule = allRules.find(r => r.name === 'Test Rule 16D')
      expect(createdRule).toBeDefined()
      const ruleId = createdRule.id

      // Create regular users
      const user1Result = await controller.callInteraction('createUser', {
        user: { id: 'admin13', role: 'admin' },
        payload: {
          name: 'User 16D1',
          email: 'user16d1@university.edu',
          studentId: '2024USER16D1',
          role: 'user'
        }
      })
      expect(user1Result.error).toBeUndefined()

      const user2Result = await controller.callInteraction('createUser', {
        user: { id: 'admin13', role: 'admin' },
        payload: {
          name: 'User 16D2',
          email: 'user16d2@university.edu',
          studentId: '2024USER16D2',
          role: 'user'
        }
      })
      expect(user2Result.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const user1 = allUsers.find(u => u.email === 'user16d1@university.edu')
      const user2 = allUsers.find(u => u.email === 'user16d2@university.edu')
      expect(user1).toBeDefined()
      expect(user2).toBeDefined()
      const user1Id = user1.id
      const user2Id = user2.id

      // Regular user cannot deduct points from any user
      const deductionResult = await controller.callInteraction('applyPointDeduction', {
        user: { id: user1Id, role: 'user' },
        payload: {
          targetUserId: user2Id,
          ruleId: ruleId,
          reason: 'Test deduction attempt - should fail'
        }
      })
      expect(deductionResult.error).toBeDefined()
      expect((deductionResult.error as any).type).toBe('condition check failed')
    })
  })

  describe('P019: GetUserProfile - Users see own profile, leaders see residents, admins see all', () => {
    test('Admin can view any user profile', async () => {
      // Create any user
      const userResult = await controller.callInteraction('createUser', {
        user: { id: 'admin19', role: 'admin' },
        payload: {
          name: 'Target User 19A',
          email: 'target19a@university.edu',
          studentId: '2024019A',
          role: 'user'
        }
      })
      expect(userResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created user
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const createdUser = allUsers.find(u => u.email === 'target19a@university.edu')
      expect(createdUser).toBeDefined()
      const targetUserId = createdUser.id

      // Admin can view any user profile
      const profileResult = await controller.callInteraction('getUserProfile', {
        user: { id: 'admin19', role: 'admin' },
        query: {
          match: MatchExp.atom({ key: 'id', value: ['=', targetUserId] })
        }
      })
      expect(profileResult.error).toBeUndefined()
      expect(profileResult.data).toBeDefined()
      expect(Array.isArray(profileResult.data)).toBe(true)
      expect((profileResult.data as any[]).length).toBeGreaterThan(0)
      expect((profileResult.data as any[])[0].id).toBe(targetUserId)
    })

    test('User can view own profile', async () => {
      // Create a user
      const userResult = await controller.callInteraction('createUser', {
        user: { id: 'admin19b', role: 'admin' },
        payload: {
          name: 'Self User 19B',
          email: 'self19b@university.edu',
          studentId: '2024019B',
          role: 'user'
        }
      })
      expect(userResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created user
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const createdUser = allUsers.find(u => u.email === 'self19b@university.edu')
      expect(createdUser).toBeDefined()
      const userId = createdUser.id

      // User can view their own profile
      const profileResult = await controller.callInteraction('getUserProfile', {
        user: { id: userId, role: 'user' },
        query: {
          match: MatchExp.atom({ key: 'id', value: ['=', userId] })
        }
      })
      expect(profileResult.error).toBeUndefined()
      expect(profileResult.data).toBeDefined()
      expect(Array.isArray(profileResult.data)).toBe(true)
      expect((profileResult.data as any[]).length).toBeGreaterThan(0)
      expect((profileResult.data as any[])[0].id).toBe(userId)
    })

    test('User cannot view other user profile', async () => {
      // Create two users
      const user1Result = await controller.callInteraction('createUser', {
        user: { id: 'admin19c', role: 'admin' },
        payload: {
          name: 'User 19C1',
          email: 'user19c1@university.edu',
          studentId: '2024019C1',
          role: 'user'
        }
      })
      expect(user1Result.error).toBeUndefined()

      const user2Result = await controller.callInteraction('createUser', {
        user: { id: 'admin19c', role: 'admin' },
        payload: {
          name: 'User 19C2',
          email: 'user19c2@university.edu',
          studentId: '2024019C2',
          role: 'user'
        }
      })
      expect(user2Result.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const user1 = allUsers.find(u => u.email === 'user19c1@university.edu')
      const user2 = allUsers.find(u => u.email === 'user19c2@university.edu')
      expect(user1).toBeDefined()
      expect(user2).toBeDefined()
      const user1Id = user1.id
      const user2Id = user2.id

      // User 1 cannot view User 2's profile
      const profileResult = await controller.callInteraction('getUserProfile', {
        user: { id: user1Id, role: 'user' },
        query: {
          match: MatchExp.atom({ key: 'id', value: ['=', user2Id] })
        }
      })
      expect(profileResult.error).toBeDefined()
      expect((profileResult.error as any).type).toBe('condition check failed')
    })

    test('Dormitory leader can view resident profiles', async () => {
      // Create dormitory
      const dormitoryResult = await controller.callInteraction('createDormitory', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          name: 'Test Dormitory 19D',
          location: 'Building L',
          capacity: 4
        }
      })
      expect(dormitoryResult.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitory
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 19D')
      expect(createdDormitory).toBeDefined()
      const dormitoryId = createdDormitory.id

      // Create beds in dormitory
      const bed1Result = await controller.callInteraction('createBed', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-19D1'
        }
      })
      expect(bed1Result.error).toBeUndefined()

      const bed2Result = await controller.callInteraction('createBed', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-19D2'
        }
      })
      expect(bed2Result.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created beds
      const allBeds = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const bed1 = allBeds.find(b => b.number === 'BED-19D1')
      const bed2 = allBeds.find(b => b.number === 'BED-19D2')
      expect(bed1).toBeDefined()
      expect(bed2).toBeDefined()
      const bed1Id = bed1.id
      const bed2Id = bed2.id

      // Create leader and resident users
      const leaderResult = await controller.callInteraction('createUser', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          name: 'Leader User 19D',
          email: 'leader19d@university.edu',
          studentId: '2024LEADER19D',
          role: 'user'
        }
      })
      expect(leaderResult.error).toBeUndefined()

      const residentResult = await controller.callInteraction('createUser', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          name: 'Resident User 19D',
          email: 'resident19d@university.edu',
          studentId: '2024RESIDENT19D',
          role: 'user'
        }
      })
      expect(residentResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const leader = allUsers.find(u => u.email === 'leader19d@university.edu')
      const resident = allUsers.find(u => u.email === 'resident19d@university.edu')
      expect(leader).toBeDefined()
      expect(resident).toBeDefined()
      const leaderId = leader.id
      const residentId = resident.id

      // Assign leader to bed (must be resident first)
      const assignLeaderToBedResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          userId: leaderId,
          bedId: bed1Id
        }
      })
      expect(assignLeaderToBedResult.error).toBeUndefined()

      // Assign user as dormitory leader
      const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          userId: leaderId,
          dormitoryId: dormitoryId
        }
      })
      expect(assignLeaderResult.error).toBeUndefined()

      // Assign resident to bed in same dormitory
      const assignResidentResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin19d', role: 'admin' },
        payload: {
          userId: residentId,
          bedId: bed2Id
        }
      })
      expect(assignResidentResult.error).toBeUndefined()

      // Wait for assignments
      await new Promise(resolve => setTimeout(resolve, 200))

      // Dormitory leader can view resident profile
      const profileResult = await controller.callInteraction('getUserProfile', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        query: {
          match: MatchExp.atom({ key: 'id', value: ['=', residentId] })
        }
      })
      expect(profileResult.error).toBeUndefined()
      expect(profileResult.data).toBeDefined()
      expect(Array.isArray(profileResult.data)).toBe(true)
      expect((profileResult.data as any[]).length).toBeGreaterThan(0)
      expect((profileResult.data as any[])[0].id).toBe(residentId)
    })

    test('Dormitory leader cannot view non-resident profiles', async () => {
      // Create two dormitories
      const dormitory1Result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          name: 'Test Dormitory 19E1',
          location: 'Building M1',
          capacity: 4
        }
      })
      expect(dormitory1Result.error).toBeUndefined()

      const dormitory2Result = await controller.callInteraction('createDormitory', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          name: 'Test Dormitory 19E2',
          location: 'Building M2',
          capacity: 4
        }
      })
      expect(dormitory2Result.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitories
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const dormitory1 = allDormitories.find(d => d.name === 'Test Dormitory 19E1')
      const dormitory2 = allDormitories.find(d => d.name === 'Test Dormitory 19E2')
      expect(dormitory1).toBeDefined()
      expect(dormitory2).toBeDefined()
      const dormitory1Id = dormitory1.id
      const dormitory2Id = dormitory2.id

      // Create beds in both dormitories
      const bed1Result = await controller.callInteraction('createBed', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          dormitoryId: dormitory1Id,
          number: 'BED-19E1'
        }
      })
      expect(bed1Result.error).toBeUndefined()

      const bed2Result = await controller.callInteraction('createBed', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          dormitoryId: dormitory2Id,
          number: 'BED-19E2'
        }
      })
      expect(bed2Result.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created beds
      const allBeds = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const bed1 = allBeds.find(b => b.number === 'BED-19E1')
      const bed2 = allBeds.find(b => b.number === 'BED-19E2')
      expect(bed1).toBeDefined()
      expect(bed2).toBeDefined()
      const bed1Id = bed1.id
      const bed2Id = bed2.id

      // Create leader and resident users
      const leaderResult = await controller.callInteraction('createUser', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          name: 'Leader User 19E',
          email: 'leader19e@university.edu',
          studentId: '2024LEADER19E',
          role: 'user'
        }
      })
      expect(leaderResult.error).toBeUndefined()

      const residentResult = await controller.callInteraction('createUser', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          name: 'Resident User 19E',
          email: 'resident19e@university.edu',
          studentId: '2024RESIDENT19E',
          role: 'user'
        }
      })
      expect(residentResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const leader = allUsers.find(u => u.email === 'leader19e@university.edu')
      const resident = allUsers.find(u => u.email === 'resident19e@university.edu')
      expect(leader).toBeDefined()
      expect(resident).toBeDefined()
      const leaderId = leader.id
      const residentId = resident.id

      // Assign leader to dormitory 1
      const assignLeaderToBedResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          userId: leaderId,
          bedId: bed1Id
        }
      })
      expect(assignLeaderToBedResult.error).toBeUndefined()

      const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          userId: leaderId,
          dormitoryId: dormitory1Id
        }
      })
      expect(assignLeaderResult.error).toBeUndefined()

      // Assign resident to dormitory 2 (different from leader's dormitory)
      const assignResidentResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin19e', role: 'admin' },
        payload: {
          userId: residentId,
          bedId: bed2Id
        }
      })
      expect(assignResidentResult.error).toBeUndefined()

      // Wait for assignments
      await new Promise(resolve => setTimeout(resolve, 200))

      // Dormitory leader cannot view resident from different dormitory
      const profileResult = await controller.callInteraction('getUserProfile', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        query: {
          match: MatchExp.atom({ key: 'id', value: ['=', residentId] })
        }
      })
      expect(profileResult.error).toBeDefined()
      expect((profileResult.error as any).type).toBe('condition check failed')
    })
  })

  describe('BR022: SubmitRemovalRequest - Cannot submit multiple pending requests for same user', () => {
    test('Can submit first removal request for user', async () => {
      // Create dormitory and bed
      const dormitoryResult = await controller.callInteraction('createDormitory', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          name: 'Test Dormitory 22A',
          location: 'Building N',
          capacity: 4
        }
      })
      expect(dormitoryResult.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitory
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 22A')
      expect(createdDormitory).toBeDefined()
      const dormitoryId = createdDormitory.id

      // Create bed in dormitory
      const bedResult = await controller.callInteraction('createBed', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-22A'
        }
      })
      expect(bedResult.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created bed
      const allBeds = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const createdBed = allBeds.find(b => b.number === 'BED-22A')
      expect(createdBed).toBeDefined()
      const bedId = createdBed.id

      // Create leader and target users
      const leaderResult = await controller.callInteraction('createUser', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          name: 'Leader User 22A',
          email: 'leader22a@university.edu',
          studentId: '2024LEADER22A',
          role: 'user'
        }
      })
      expect(leaderResult.error).toBeUndefined()

      const targetResult = await controller.callInteraction('createUser', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          name: 'Target User 22A',
          email: 'target22a@university.edu',
          studentId: '2024TARGET22A',
          role: 'user'
        }
      })
      expect(targetResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const leader = allUsers.find(u => u.email === 'leader22a@university.edu')
      const target = allUsers.find(u => u.email === 'target22a@university.edu')
      expect(leader).toBeDefined()
      expect(target).toBeDefined()
      const leaderId = leader.id
      const targetId = target.id

      // Assign leader to bed (must be resident first)
      const assignLeaderToBedResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          userId: leaderId,
          bedId: bedId
        }
      })
      expect(assignLeaderToBedResult.error).toBeUndefined()

      // Assign user as dormitory leader
      const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          userId: leaderId,
          dormitoryId: dormitoryId
        }
      })
      expect(assignLeaderResult.error).toBeUndefined()

      // Wait for assignments
      await new Promise(resolve => setTimeout(resolve, 200))

      // Create second bed for target user
      const bedResult2 = await controller.callInteraction('createBed', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-22A2'
        }
      })
      expect(bedResult2.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the second bed
      const allBedsAfter = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const createdBed2 = allBedsAfter.find(b => b.number === 'BED-22A2')
      expect(createdBed2).toBeDefined()
      const bedId2 = createdBed2.id

      // Assign target to bed in same dormitory
      const assignTargetResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin22', role: 'admin' },
        payload: {
          userId: targetId,
          bedId: bedId2
        }
      })
      expect(assignTargetResult.error).toBeUndefined()

      // Wait for assignment
      await new Promise(resolve => setTimeout(resolve, 100))

      // Leader can submit first removal request for target user
      const requestResult = await controller.callInteraction('submitRemovalRequest', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        payload: {
          targetUserId: targetId,
          reason: 'First removal request for user 22A'
        }
      })
      expect(requestResult.error).toBeUndefined()
    })

    test('Cannot submit second pending removal request for same user', async () => {
      // Create dormitory and bed
      const dormitoryResult = await controller.callInteraction('createDormitory', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          name: 'Test Dormitory 22B',
          location: 'Building O',
          capacity: 4
        }
      })
      expect(dormitoryResult.error).toBeUndefined()
      
      // Wait for dormitory creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created dormitory
      const allDormitories = await system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name']
      )
      
      const createdDormitory = allDormitories.find(d => d.name === 'Test Dormitory 22B')
      expect(createdDormitory).toBeDefined()
      const dormitoryId = createdDormitory.id

      // Create beds in dormitory
      const bed1Result = await controller.callInteraction('createBed', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-22B1'
        }
      })
      expect(bed1Result.error).toBeUndefined()

      const bed2Result = await controller.callInteraction('createBed', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          dormitoryId: dormitoryId,
          number: 'BED-22B2'
        }
      })
      expect(bed2Result.error).toBeUndefined()
      
      // Wait for bed creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created beds
      const allBeds = await system.storage.find(
        'Bed',
        undefined,
        undefined,
        ['id', 'number']
      )
      
      const bed1 = allBeds.find(b => b.number === 'BED-22B1')
      const bed2 = allBeds.find(b => b.number === 'BED-22B2')
      expect(bed1).toBeDefined()
      expect(bed2).toBeDefined()
      const bed1Id = bed1.id
      const bed2Id = bed2.id

      // Create leader and target users
      const leaderResult = await controller.callInteraction('createUser', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          name: 'Leader User 22B',
          email: 'leader22b@university.edu',
          studentId: '2024LEADER22B',
          role: 'user'
        }
      })
      expect(leaderResult.error).toBeUndefined()

      const targetResult = await controller.callInteraction('createUser', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          name: 'Target User 22B',
          email: 'target22b@university.edu',
          studentId: '2024TARGET22B',
          role: 'user'
        }
      })
      expect(targetResult.error).toBeUndefined()
      
      // Wait for user creation
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Find the created users
      const allUsers = await system.storage.find(
        'User',
        undefined,
        undefined,
        ['id', 'email']
      )
      
      const leader = allUsers.find(u => u.email === 'leader22b@university.edu')
      const target = allUsers.find(u => u.email === 'target22b@university.edu')
      expect(leader).toBeDefined()
      expect(target).toBeDefined()
      const leaderId = leader.id
      const targetId = target.id

      // Assign leader and target to beds
      const assignLeaderToBedResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          userId: leaderId,
          bedId: bed1Id
        }
      })
      expect(assignLeaderToBedResult.error).toBeUndefined()

      const assignLeaderResult = await controller.callInteraction('assignDormitoryLeader', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          userId: leaderId,
          dormitoryId: dormitoryId
        }
      })
      expect(assignLeaderResult.error).toBeUndefined()

      const assignTargetResult = await controller.callInteraction('assignUserToBed', {
        user: { id: 'admin22b', role: 'admin' },
        payload: {
          userId: targetId,
          bedId: bed2Id
        }
      })
      expect(assignTargetResult.error).toBeUndefined()

      // Wait for assignments
      await new Promise(resolve => setTimeout(resolve, 200))

      // Submit first removal request - should succeed
      const request1Result = await controller.callInteraction('submitRemovalRequest', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        payload: {
          targetUserId: targetId,
          reason: 'First removal request for user 22B'
        }
      })
      expect(request1Result.error).toBeUndefined()

      // Wait for first request
      await new Promise(resolve => setTimeout(resolve, 100))

      // Try to submit second removal request for same user - should fail
      const request2Result = await controller.callInteraction('submitRemovalRequest', {
        user: { id: leaderId, role: 'dormitoryLeader' },
        payload: {
          targetUserId: targetId,
          reason: 'Second removal request for same user - should fail'
        }
      })
      expect(request2Result.error).toBeDefined()
      expect((request2Result.error as any).type).toBe('condition check failed')
    })
  })
})