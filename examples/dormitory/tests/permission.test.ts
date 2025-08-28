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
      dict: dicts
    })

    await controller.setup(true)
  })

  describe('Phase 1: Basic Role-Based Permissions', () => {
    test('P001: Admin can create dormitory (TC001)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm A',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify dormitory was created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
        undefined,
        ['id', 'name', 'capacity', 'floor', 'building']
      )
      expect(dormitories.length).toBe(1)
      expect(dormitories[0].name).toBe('Dorm A')
      expect(dormitories[0].capacity).toBe(4)
      expect(dormitories[0].floor).toBe(1)
      expect(dormitories[0].building).toBe('Building 1')
    })

    test('P001: Non-admin cannot create dormitory (TC007)', async () => {
      // Create non-admin user (resident)
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Resident should not be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: resident,
        payload: {
          name: 'Dorm B',
          capacity: 4,
          floor: 2,
          building: 'Building 1'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', MatchExp.atom({ key: 'name', value: ['=', 'Dorm B'] }))
      expect(dormitories.length).toBe(0)
    })

    test('P001: Dormitory leader cannot create dormitory', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Dormitory leader should not be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: dormitoryLeader,
        payload: {
          name: 'Dorm C',
          capacity: 6,
          floor: 3,
          building: 'Building 2'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', MatchExp.atom({ key: 'name', value: ['=', 'Dorm C'] }))
      expect(dormitories.length).toBe(0)
    })

    test('P001: Unauthenticated user cannot create dormitory', async () => {
      // Try to create dormitory without user
      const result = await controller.callInteraction('CreateDormitory', {
        user: null,
        payload: {
          name: 'Dorm D',
          capacity: 5,
          floor: 4,
          building: 'Building 3'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', MatchExp.atom({ key: 'name', value: ['=', 'Dorm D'] }))
      expect(dormitories.length).toBe(0)
    })

    test('P002: Admin can update dormitory', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // First create a dormitory as admin
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Original Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Original Dorm'] }),
        undefined,
        ['id', 'name', 'floor', 'building']
      )
      expect(dormitories.length).toBe(1)
      const dormitoryId = dormitories[0].id
      
      // Admin should be able to update dormitory
      const updateResult = await controller.callInteraction('UpdateDormitory', {
        user: admin,
        payload: {
          dormitoryId: dormitoryId,
          name: 'Updated Dorm',
          floor: 2,
          building: 'Building B'
        }
      })
      
      expect(updateResult.error).toBeUndefined()
      
      // Verify dormitory was updated
      const updatedDorms = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
        undefined,
        ['id', 'name', 'floor', 'building', 'capacity']
      )
      expect(updatedDorms.length).toBe(1)
      expect(updatedDorms[0].name).toBe('Updated Dorm')
      expect(updatedDorms[0].floor).toBe(2)
      expect(updatedDorms[0].building).toBe('Building B')
      expect(updatedDorms[0].capacity).toBe(4) // Capacity should not change
    })

    test('P002: Non-admin cannot update dormitory', async () => {
      // Create admin to create dormitory
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create resident user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create dormitory as admin
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitories = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitories[0].id
      
      // Resident should not be able to update dormitory
      const updateResult = await controller.callInteraction('UpdateDormitory', {
        user: resident,
        payload: {
          dormitoryId: dormitoryId,
          name: 'Hacked Dorm'
        }
      })
      
      // Verify error
      expect(updateResult.error).toBeDefined()
      expect((updateResult.error as any).type).toBe('condition check failed')
      expect((updateResult.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not updated
      const unchangedDorms = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
        undefined,
        ['name']
      )
      expect(unchangedDorms[0].name).toBe('Test Dorm') // Name should not change
    })

    test('P003: Admin can delete dormitory', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // First create a dormitory as admin
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm to Delete', 
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm to Delete'] }),
        undefined,
        ['id', 'name', 'isDeleted']
      )
      expect(dormitories.length).toBe(1)
      const dormitoryId = dormitories[0].id
      expect(dormitories[0].isDeleted).toBe(false)
      
      // Admin should be able to delete dormitory
      const deleteResult = await controller.callInteraction('DeleteDormitory', {
        user: admin,
        payload: {
          dormitoryId: dormitoryId
        }
      })
      
      // Verify no error
      expect(deleteResult.error).toBeUndefined()
      
      // Verify dormitory is marked as deleted
      const deletedDorms = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
        undefined,
        ['id', 'name', 'isDeleted']
      )
      expect(deletedDorms.length).toBe(1)
      expect(deletedDorms[0].isDeleted).toBe(true)
    })

    test('P003: Non-admin cannot delete dormitory', async () => {
      // Create admin to create dormitory
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create resident user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create dormitory as admin
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm to Keep',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitories = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm to Keep'] }),
        undefined,
        ['id', 'isDeleted']
      )
      const dormitoryId = dormitories[0].id
      expect(dormitories[0].isDeleted).toBe(false)
      
      // Resident should NOT be able to delete dormitory
      const deleteResult = await controller.callInteraction('DeleteDormitory', {
        user: resident,
        payload: {
          dormitoryId: dormitoryId
        }
      })
      
      // Verify error
      expect(deleteResult.error).toBeDefined()
      expect((deleteResult.error as any).type).toBe('condition check failed')
      expect((deleteResult.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not deleted
      const unchangedDorms = await system.storage.find('Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
        undefined,
        ['isDeleted']
      )
      expect(unchangedDorms[0].isDeleted).toBe(false) // Should still not be deleted
    })

    test('P004: Admin can assign dormitory leader (TC006)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a dormitory
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitory.id
      
      // Dormitory creation automatically creates beds, so let's get them
      const beds = await system.storage.find('Bed',
        undefined,
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBeGreaterThan(0)
      
      // Create a user to be assigned as dormitory leader
      const residentUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Assign resident to a bed in the dormitory using AssignUserToBed interaction
      const assignBedResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: residentUser.id,
          bedId: beds[0].id
        }
      })
      expect(assignBedResult.error).toBeUndefined()
      
      // Admin should be able to assign dormitory leader
      const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
        user: admin,
        payload: {
          userId: residentUser.id,
          dormitoryId: dormitoryId
        }
      })
      
      expect(assignResult.error).toBeUndefined()
      
      // Verify the user role was updated to dormitoryLeader
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', residentUser.id] }),
        undefined,
        ['role']
      )
      expect(updatedUser.role).toBe('dormitoryLeader')
      
      // Verify the dormitory leader relation was created
      const leaderRelations = await system.storage.find(
        'UserDormitoryLeaderRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', residentUser.id] }),
        undefined,
        ['source', 'target']
      )
      expect(leaderRelations.length).toBe(1)
      expect(leaderRelations[0].target.id).toBe(dormitoryId)
    })

    test('P004: Non-admin cannot assign dormitory leader', async () => {
      // Create admin user to set up data
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a dormitory
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitory.id
      
      // Dormitory creation automatically creates beds, so let's get them
      const beds = await system.storage.find('Bed',
        undefined,
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBeGreaterThan(0)
      
      // Create a non-admin user (resident)
      const residentUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create another user to be assigned as dormitory leader
      const targetUser = await system.storage.create('User', {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@test.com',
        name: 'Target User',
        role: 'resident',
        points: 100
      })
      
      // Assign target user to a bed in the dormitory using AssignUserToBed interaction
      const assignBedResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: targetUser.id,
          bedId: beds[0].id
        }
      })
      expect(assignBedResult.error).toBeUndefined()
      
      // Non-admin should not be able to assign dormitory leader
      const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
        user: residentUser,
        payload: {
          userId: targetUser.id,
          dormitoryId: dormitoryId
        }
      })
      
      // Verify error
      expect(assignResult.error).toBeDefined()
      expect((assignResult.error as any).type).toBe('condition check failed')
      expect((assignResult.error as any).error.data.name).toBe('isAdmin')
      
      // Verify the user role was not updated
      const unchangedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['role']
      )
      expect(unchangedUser.role).toBe('resident') // Should still be resident
      
      // Verify no dormitory leader relation was created
      const leaderRelations = await system.storage.find(
        'UserDormitoryLeaderRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', targetUser.id] })
      )
      expect(leaderRelations.length).toBe(0)
    })

    test('P005: Admin can remove dormitory leader', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a dormitory
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitory.id
      
      // Get beds created with the dormitory
      const beds = await system.storage.find('Bed',
        undefined,
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBeGreaterThan(0)
      
      // Create a user to be assigned as dormitory leader
      const residentUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // First assign resident to a bed in the dormitory
      const assignBedResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: residentUser.id,
          bedId: beds[0].id
        }
      })
      expect(assignBedResult.error).toBeUndefined()
      
      // Assign as dormitory leader
      const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
        user: admin,
        payload: {
          userId: residentUser.id,
          dormitoryId: dormitoryId
        }
      })
      expect(assignResult.error).toBeUndefined()
      
      // Verify the user is now a dormitory leader
      let user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', residentUser.id] }),
        undefined,
        ['role']
      )
      expect(user.role).toBe('dormitoryLeader')
      
      // Verify the dormitory leader relation exists
      let leaderRelations = await system.storage.find(
        'UserDormitoryLeaderRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', residentUser.id] }),
        undefined,
        ['source', 'target']
      )
      expect(leaderRelations.length).toBe(1)
      
      // Admin should be able to remove dormitory leader
      const removeResult = await controller.callInteraction('RemoveDormitoryLeader', {
        user: admin,
        payload: {
          userId: residentUser.id
        }
      })
      
      expect(removeResult.error).toBeUndefined()
      
      // Verify the user role was changed back to resident
      user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', residentUser.id] }),
        undefined,
        ['role']
      )
      expect(user.role).toBe('resident')
      
      // Verify the dormitory leader relation was removed
      leaderRelations = await system.storage.find(
        'UserDormitoryLeaderRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', residentUser.id] })
      )
      expect(leaderRelations.length).toBe(0)
    })

    test('P005: Non-admin cannot remove dormitory leader', async () => {
      // Create admin user to set up data
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a dormitory
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitory.id
      
      // Get beds created with the dormitory
      const beds = await system.storage.find('Bed',
        undefined,
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBeGreaterThan(0)
      
      // Create a user to be assigned as dormitory leader
      const leaderUser = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Leader User',
        role: 'resident',
        points: 100
      })
      
      // Create another non-admin user (resident)
      const residentUser = await system.storage.create('User', {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // First assign leader to a bed in the dormitory
      const assignBedResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: leaderUser.id,
          bedId: beds[0].id
        }
      })
      expect(assignBedResult.error).toBeUndefined()
      
      // Assign as dormitory leader
      const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
        user: admin,
        payload: {
          userId: leaderUser.id,
          dormitoryId: dormitoryId
        }
      })
      expect(assignResult.error).toBeUndefined()
      
      // Verify the user is now a dormitory leader
      let user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', leaderUser.id] }),
        undefined,
        ['role']
      )
      expect(user.role).toBe('dormitoryLeader')
      
      // Non-admin (resident) should NOT be able to remove dormitory leader
      const removeResult = await controller.callInteraction('RemoveDormitoryLeader', {
        user: residentUser,
        payload: {
          userId: leaderUser.id
        }
      })
      
      // Verify error
      expect(removeResult.error).toBeDefined()
      expect((removeResult.error as any).type).toBe('condition check failed')
      expect((removeResult.error as any).error.data.name).toBe('isAdmin')
      
      // Verify the user role was not changed
      user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', leaderUser.id] }),
        undefined,
        ['role']
      )
      expect(user.role).toBe('dormitoryLeader') // Should still be dormitory leader
      
      // Verify the dormitory leader relation still exists
      const leaderRelations = await system.storage.find(
        'UserDormitoryLeaderRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', leaderUser.id] })
      )
      expect(leaderRelations.length).toBe(1) // Relation should still exist
    })

    test('P005: Dormitory leader cannot remove themselves', async () => {
      // Create admin user to set up data
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a dormitory
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Test Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      })
      expect(createResult.error).toBeUndefined()
      
      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
        undefined,
        ['id']
      )
      const dormitoryId = dormitory.id
      
      // Get beds created with the dormitory
      const beds = await system.storage.find('Bed',
        undefined,
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBeGreaterThan(0)
      
      // Create a user to be assigned as dormitory leader
      const leaderUser = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Leader User',
        role: 'resident',
        points: 100
      })
      
      // First assign leader to a bed in the dormitory
      const assignBedResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: leaderUser.id,
          bedId: beds[0].id
        }
      })
      expect(assignBedResult.error).toBeUndefined()
      
      // Assign as dormitory leader
      const assignResult = await controller.callInteraction('AssignDormitoryLeader', {
        user: admin,
        payload: {
          userId: leaderUser.id,
          dormitoryId: dormitoryId
        }
      })
      expect(assignResult.error).toBeUndefined()
      
      // Verify the user is now a dormitory leader
      let user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', leaderUser.id] }),
        undefined,
        ['role']
      )
      expect(user.role).toBe('dormitoryLeader')
      
      // Dormitory leader should NOT be able to remove themselves
      const removeResult = await controller.callInteraction('RemoveDormitoryLeader', {
        user: leaderUser,
        payload: {
          userId: leaderUser.id
        }
      })
      
      // Verify error
      expect(removeResult.error).toBeDefined()
      expect((removeResult.error as any).type).toBe('condition check failed')
      expect((removeResult.error as any).error.data.name).toBe('isAdmin')
      
      // Verify the user role was not changed
      user = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', leaderUser.id] }),
        undefined,
        ['role']
      )
      expect(user.role).toBe('dormitoryLeader') // Should still be dormitory leader
      
      // Verify the dormitory leader relation still exists
      const leaderRelations = await system.storage.find(
        'UserDormitoryLeaderRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', leaderUser.id] })
      )
      expect(leaderRelations.length).toBe(1) // Relation should still exist
    })

    test('P006: Admin can assign user to bed (TC002)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })

      // Create a resident user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })

      // Create a dormitory using interaction to trigger bed creation
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm A',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      expect(createResult.error).toBeUndefined()

      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
        undefined,
        ['id']
      )

      // Get the beds created for the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'isOccupied']
      )
      expect(beds.length).toBe(4) // Should have 4 beds as capacity is 4

      // Admin should be able to assign user to bed
      const result = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: resident.id,
          bedId: beds[0].id
        }
      })

      expect(result.error).toBeUndefined()

      // Verify the user-bed relation was created
      const userBedRelations = await system.storage.find(
        'UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', resident.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
      )
      expect(userBedRelations.length).toBe(1)
      expect(userBedRelations[0].target.id).toBe(beds[0].id)

      // Verify the bed has an occupant via the relation
      const bedWithOccupant = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', beds[0].id] }),
        undefined,
        ['id', ['occupant', { attributeQuery: ['id'] }]]
      )
      expect(bedWithOccupant.occupant).toBeDefined()
      expect(bedWithOccupant.occupant.id).toBe(resident.id)
    })

    test('P006: Non-admin cannot assign user to bed', async () => {
      // Create admin user to set up data
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })

      // Create a non-admin user (resident)
      const resident1 = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User 1',
        role: 'resident',
        points: 100
      })

      // Create another resident user to be assigned
      const resident2 = await system.storage.create('User', {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@test.com',
        name: 'Resident User 2',
        role: 'resident',
        points: 100
      })

      // Create a dormitory using interaction to trigger bed creation
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm A',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      expect(createResult.error).toBeUndefined()

      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
        undefined,
        ['id']
      )

      // Get the beds created for the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBe(4)

      // Non-admin should not be able to assign user to bed
      const result = await controller.callInteraction('AssignUserToBed', {
        user: resident1,
        payload: {
          userId: resident2.id,
          bedId: beds[0].id
        }
      })

      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')

      // Verify no user-bed relation was created
      const userBedRelations = await system.storage.find(
        'UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', resident2.id] })
      )
      expect(userBedRelations.length).toBe(0)

      // Verify the bed has no occupant
      const bed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', beds[0].id] }),
        undefined,
        ['id', ['occupant', { attributeQuery: ['id'] }]]
      )
      expect(bed.occupant).toBeUndefined()
    })

    test('P006: Dormitory leader cannot assign user to bed', async () => {
      // Create admin user to set up data
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })

      // Create a dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Leader User',
        role: 'dormitoryLeader',
        points: 100
      })

      // Create a resident user to be assigned
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })

      // Create a dormitory using interaction to trigger bed creation
      const createResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm A',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      expect(createResult.error).toBeUndefined()

      // Get the created dormitory
      const dormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
        undefined,
        ['id']
      )

      // Get the beds created for the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber']
      )
      expect(beds.length).toBe(4)

      // Dormitory leader should not be able to assign user to bed
      const result = await controller.callInteraction('AssignUserToBed', {
        user: dormitoryLeader,
        payload: {
          userId: resident.id,
          bedId: beds[0].id
        }
      })

      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')

      // Verify no user-bed relation was created
      const userBedRelations = await system.storage.find(
        'UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', resident.id] })
      )
      expect(userBedRelations.length).toBe(0)

      // Verify the bed has no occupant
      const bed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', beds[0].id] }),
        undefined,
        ['id', ['occupant', { attributeQuery: ['id'] }]]
      )
      expect(bed.occupant).toBeUndefined()
    })

    test('P007: Admin can remove user from bed', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })

      // Create resident user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })

      // Create a dormitory first (with beds)
      const createDormResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm A',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      // Get the dormitory and its beds
      const dormitory = await system.storage.findOne('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm A'] }),
        undefined,
        ['id', 'name', ['beds', { attributeQuery: ['id', 'bedNumber', 'isOccupied'] }]]
      )
      const bedId = dormitory.beds[0].id

      // Assign resident to bed first
      const assignResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: resident.id,
          bedId: bedId
        }
      })
      expect(assignResult.error).toBeUndefined()

      // Verify user is assigned to bed
      const assignedRelation = await system.storage.findOne('UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', resident.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
      )
      expect(assignedRelation).toBeDefined()

      // Admin should be able to remove user from bed
      const removeResult = await controller.callInteraction('RemoveUserFromBed', {
        user: admin,
        payload: {
          userId: resident.id
        }
      })
      
      expect(removeResult.error).toBeUndefined()

      // Verify user is no longer assigned to bed
      const removedRelation = await system.storage.findOne('UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', resident.id] }),
        undefined,
        ['id']
      )
      expect(removedRelation).toBeUndefined()
    })

    test('P007: Non-admin cannot remove user from bed', async () => {
      // Create admin and resident users
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })

      const resident1 = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User 1',
        role: 'resident',
        points: 100
      })

      const resident2 = await system.storage.create('User', {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@test.com',
        name: 'Resident User 2',
        role: 'resident',
        points: 100
      })

      // Create a dormitory first (with beds)
      const createDormResult = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm B',
          capacity: 4,
          floor: 2,
          building: 'Building 1'
        }
      })

      // Get the dormitory and its beds
      const dormitory = await system.storage.findOne('Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm B'] }),
        undefined,
        ['id', 'name', ['beds', { attributeQuery: ['id', 'bedNumber'] }]]
      )
      const bedId = dormitory.beds[0].id

      // Admin assigns resident1 to bed
      const assignResult = await controller.callInteraction('AssignUserToBed', {
        user: admin,
        payload: {
          userId: resident1.id,
          bedId: bedId
        }
      })
      expect(assignResult.error).toBeUndefined()

      // Resident2 (non-admin) should not be able to remove resident1 from bed
      const removeResult = await controller.callInteraction('RemoveUserFromBed', {
        user: resident2,
        payload: {
          userId: resident1.id
        }
      })

      // Verify error
      expect(removeResult.error).toBeDefined()
      expect((removeResult.error as any).type).toBe('condition check failed')
      expect((removeResult.error as any).error.data.name).toBe('isAdmin')

      // Verify user is still assigned to bed
      const stillAssignedRelation = await system.storage.findOne('UserBedRelation',
        MatchExp.atom({ key: 'source.id', value: ['=', resident1.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }]]
      )
      expect(stillAssignedRelation).toBeDefined()
    })
  })
})