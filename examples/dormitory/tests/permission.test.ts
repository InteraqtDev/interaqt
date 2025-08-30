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
  })
})