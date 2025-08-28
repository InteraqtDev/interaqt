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

    test('P008: Admin can process removal request (TC005)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'target1',
        password: 'password123',
        email: 'target@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20  // Low points (less than 30)
      })
      
      // Create removal request - this will automatically create the relations
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Violation of dormitory rules',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        targetUser: { id: targetUser.id },
        requestedBy: { id: dormitoryLeader.id }
      })
      
      // Admin should be able to process removal request - approve
      const approveResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: removalRequest.id,
          decision: 'approved',
          adminComment: 'Request approved due to repeated violations'
        }
      })
      
      expect(approveResult.error).toBeUndefined()
      
      // Verify removal request was processed
      const processedRequest = await system.storage.findOne('RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status', 'processedAt', 'adminComment']
      )
      expect(processedRequest.status).toBe('approved')
      expect(processedRequest.processedAt).toBeDefined()
      expect(processedRequest.processedAt).toBeGreaterThan(0)
      expect(processedRequest.adminComment).toBe('Request approved due to repeated violations')
    })

    test('P008: Non-admin cannot process removal request (TC010)', async () => {
      // Create non-admin user (dormitory leader)
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'target1',
        password: 'password123',
        email: 'target@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20  // Low points (less than 30)
      })
      
      // Create removal request - this will automatically create the relations
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Violation of dormitory rules',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        targetUser: { id: targetUser.id },
        requestedBy: { id: dormitoryLeader.id }
      })
      
      // Dormitory leader should not be able to process removal request
      const result = await controller.callInteraction('ProcessRemovalRequest', {
        user: dormitoryLeader,
        payload: {
          requestId: removalRequest.id,
          decision: 'approved',
          adminComment: 'Trying to approve my own request'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify removal request was not processed
      const unprocessedRequest = await system.storage.findOne('RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status', 'processedAt', 'adminComment']
      )
      expect(unprocessedRequest.status).toBe('pending')
      // These fields should be null since the request wasn't processed
      // Note: processedAt and adminComment are handled by StateMachine computation 
      // and default to null when not set
      expect(unprocessedRequest.processedAt).toBeFalsy()  // null or undefined
      expect(unprocessedRequest.adminComment).toBeFalsy()  // null or undefined
    })

    test('P008: Resident cannot process removal request', async () => {
      // Create resident user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'target1',
        password: 'password123',
        email: 'target@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20  // Low points (less than 30)
      })
      
      // Create removal request - this will automatically create the relations
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Violation of dormitory rules',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        targetUser: { id: targetUser.id },
        requestedBy: { id: dormitoryLeader.id }
      })
      
      // Resident should not be able to process removal request
      const result = await controller.callInteraction('ProcessRemovalRequest', {
        user: resident,
        payload: {
          requestId: removalRequest.id,
          decision: 'approved',
          adminComment: 'Resident trying to approve'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify removal request was not processed
      const unprocessedRequest = await system.storage.findOne('RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status', 'processedAt', 'adminComment']
      )
      expect(unprocessedRequest.status).toBe('pending')
      // These fields should be null since the request wasn't processed
      // Note: processedAt and adminComment are handled by StateMachine computation 
      // and default to null when not set
      expect(unprocessedRequest.processedAt).toBeFalsy()  // null or undefined
      expect(unprocessedRequest.adminComment).toBeFalsy()  // null or undefined
    })

    test('P008: Admin can reject removal request', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'target1',
        password: 'password123',
        email: 'target@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20  // Low points (less than 30)
      })
      
      // Create removal request - this will automatically create the relations
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Minor issue',
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        targetUser: { id: targetUser.id },
        requestedBy: { id: dormitoryLeader.id }
      })
      
      // Admin should be able to reject removal request
      const rejectResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: removalRequest.id,
          decision: 'rejected',
          adminComment: 'Not sufficient grounds for removal'
        }
      })
      
      expect(rejectResult.error).toBeUndefined()
      
      // Verify removal request was rejected
      const rejectedRequest = await system.storage.findOne('RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status', 'processedAt', 'adminComment']
      )
      expect(rejectedRequest.status).toBe('rejected')
      expect(rejectedRequest.processedAt).toBeDefined()
      expect(rejectedRequest.processedAt).toBeGreaterThan(0)
      expect(rejectedRequest.adminComment).toBe('Not sufficient grounds for removal')
    })

    test('P009: Admin can deduct points (TC003)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Admin should be able to deduct points
      const result = await controller.callInteraction('DeductPoints', {
        user: admin,
        payload: {
          userId: targetUser.id,
          points: 30,
          reason: 'Violation',
          description: 'Late night noise violation'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify points were deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(70)
      
      // Verify point deduction record was created
      const deductions = await system.storage.find('PointDeduction',
        MatchExp.atom({ key: 'user.id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points', 'reason', 'description', 'createdBy']
      )
      expect(deductions.length).toBe(1)
      expect(deductions[0].points).toBe(30)
      expect(deductions[0].reason).toBe('Violation')
      expect(deductions[0].description).toBe('Late night noise violation')
      expect(deductions[0].createdBy).toBe(admin.id)
    })

    test('P009: Non-admin cannot use DeductPoints interaction', async () => {
      // Create non-admin user (resident)
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create a target user
      const targetUser = await system.storage.create('User', {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@test.com',
        name: 'Target User',
        role: 'resident',
        points: 100
      })
      
      // Resident should not be able to use DeductPoints
      const result = await controller.callInteraction('DeductPoints', {
        user: resident,
        payload: {
          userId: targetUser.id,
          points: 20,
          reason: 'Test',
          description: 'Test deduction'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify points were not deducted
      const unchangedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(unchangedUser.points).toBe(100)
      
      // Verify no deduction record was created
      const deductions = await system.storage.find('PointDeduction',
        MatchExp.atom({ key: 'user.id', value: ['=', targetUser.id] })
      )
      expect(deductions.length).toBe(0)
    })

    test('P009: Dormitory leader cannot use DeductPoints interaction', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create a target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Target User',
        role: 'resident',
        points: 100
      })
      
      // Dormitory leader should not be able to use DeductPoints (they should use DeductResidentPoints instead)
      const result = await controller.callInteraction('DeductPoints', {
        user: dormitoryLeader,
        payload: {
          userId: targetUser.id,
          points: 15,
          reason: 'Test',
          description: 'Test deduction'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify points were not deducted
      const unchangedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(unchangedUser.points).toBe(100)
    })

    test('P010: Admin can create user', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create a new user
      const result = await controller.callInteraction('CreateUser', {
        user: admin,
        payload: {
          username: 'newuser1',
          password: 'newpassword123',
          email: 'newuser1@test.com',
          name: 'New User One',
          role: 'resident'
        }
      })
      
      // Check the interaction succeeded
      expect(result.error).toBeUndefined()
      
      // Verify the user was created with correct data
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser1'] }),
        undefined,
        ['id', 'username', 'email', 'name', 'role', 'points']
      )
      
      expect(createdUser).toBeDefined()
      expect(createdUser.username).toBe('newuser1')
      expect(createdUser.email).toBe('newuser1@test.com')
      expect(createdUser.name).toBe('New User One')
      expect(createdUser.role).toBe('resident')
      expect(createdUser.points).toBe(100) // Default points
    })

    test('P010: Non-admin cannot create user', async () => {
      // Create non-admin user (resident)
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Resident should not be able to create a new user
      const result = await controller.callInteraction('CreateUser', {
        user: resident,
        payload: {
          username: 'newuser2',
          password: 'newpassword123',
          email: 'newuser2@test.com',
          name: 'New User Two',
          role: 'resident'
        }
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify no user was created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser2'] }),
        undefined,
        ['id']
      )
      
      expect(createdUser).toBeUndefined()
    })

    test('P010: Dormitory leader cannot create user', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Dormitory leader should not be able to create a new user
      const result = await controller.callInteraction('CreateUser', {
        user: dormitoryLeader,
        payload: {
          username: 'newuser3',
          password: 'newpassword123',
          email: 'newuser3@test.com',
          name: 'New User Three',
          role: 'resident'
        }
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify no user was created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser3'] }),
        undefined,
        ['id']
      )
      
      expect(createdUser).toBeUndefined()
    })

    test('P011: Admin can delete user', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a user to delete
      const userToDelete = await system.storage.create('User', {
        username: 'deleteMe',
        password: 'password123',
        email: 'deleteme@test.com',
        name: 'User To Delete',
        role: 'resident',
        points: 100,
        isDeleted: false
      })
      
      // Admin should be able to delete the user
      const result = await controller.callInteraction('DeleteUser', {
        user: admin,
        payload: {
          userId: userToDelete.id
        }
      })
      
      // Check the interaction succeeded
      expect(result.error).toBeUndefined()
      
      // Verify the user was marked as deleted (soft delete)
      const deletedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', userToDelete.id] }),
        undefined,
        ['id', 'username', 'isDeleted']
      )
      
      expect(deletedUser).toBeDefined()
      expect(deletedUser.isDeleted).toBe(true)
    })

    test('P011: Non-admin cannot delete user', async () => {
      // Create non-admin user (resident)
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create a user to attempt to delete
      const userToDelete = await system.storage.create('User', {
        username: 'targetUser',
        password: 'password123',
        email: 'target@test.com',
        name: 'Target User',
        role: 'resident',
        points: 100,
        isDeleted: false
      })
      
      // Resident should not be able to delete the user
      const result = await controller.callInteraction('DeleteUser', {
        user: resident,
        payload: {
          userId: userToDelete.id
        }
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify the user was not deleted
      const notDeletedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', userToDelete.id] }),
        undefined,
        ['id', 'username', 'isDeleted']
      )
      
      expect(notDeletedUser).toBeDefined()
      expect(notDeletedUser.isDeleted).toBe(false)
    })

    test('P011: Dormitory leader cannot delete user', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create a user to attempt to delete
      const userToDelete = await system.storage.create('User', {
        username: 'targetUser2',
        password: 'password123',
        email: 'target2@test.com',
        name: 'Target User 2',
        role: 'resident',
        points: 100,
        isDeleted: false
      })
      
      // Dormitory leader should not be able to delete the user
      const result = await controller.callInteraction('DeleteUser', {
        user: dormitoryLeader,
        payload: {
          userId: userToDelete.id
        }
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify the user was not deleted
      const notDeletedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', userToDelete.id] }),
        undefined,
        ['id', 'username', 'isDeleted']
      )
      
      expect(notDeletedUser).toBeDefined()
      expect(notDeletedUser.isDeleted).toBe(false)
    })

    test('P012: Admin can list users', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create some test users
      const user1 = await system.storage.create('User', {
        username: 'user1',
        password: 'password123',
        email: 'user1@test.com',
        name: 'User One',
        role: 'resident',
        points: 100
      })
      
      const user2 = await system.storage.create('User', {
        username: 'user2',
        password: 'password123',
        email: 'user2@test.com',
        name: 'User Two',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Admin should be able to list all users
      const result = await controller.callInteraction('GetUsers', {
        user: admin,
        payload: {}
      })
      
      // Check the interaction succeeded
      expect(result.error).toBeUndefined()
      
      // Note: GetUsers interaction is a query interaction that would need special handling
      // For now, we just verify the permission check passes
      // In a real implementation, result.data would contain the user list
    })

    test('P012: Non-admin cannot list users', async () => {
      // Create non-admin user (resident)
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create some test users
      const user1 = await system.storage.create('User', {
        username: 'user1',
        password: 'password123',
        email: 'user1@test.com',
        name: 'User One',
        role: 'resident',
        points: 100
      })
      
      const user2 = await system.storage.create('User', {
        username: 'user2',
        password: 'password123',
        email: 'user2@test.com',
        name: 'User Two',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Resident should not be able to list users
      const result = await controller.callInteraction('GetUsers', {
        user: resident,
        payload: {}
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
    })

    test('P012: Dormitory leader cannot list users', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create some test users
      const user1 = await system.storage.create('User', {
        username: 'user1',
        password: 'password123',
        email: 'user1@test.com',
        name: 'User One',
        role: 'resident',
        points: 100
      })
      
      const user2 = await system.storage.create('User', {
        username: 'user2',
        password: 'password123',
        email: 'user2@test.com',
        name: 'User Two',
        role: 'resident',
        points: 90
      })
      
      // Dormitory leader should not be able to list users
      const result = await controller.callInteraction('GetUsers', {
        user: dormitoryLeader,
        payload: {}
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
    })

    test('P012: Unauthenticated user cannot list users', async () => {
      // Create some test users in the system
      const user1 = await system.storage.create('User', {
        username: 'user1',
        password: 'password123',
        email: 'user1@test.com',
        name: 'User One',
        role: 'resident',
        points: 100
      })
      
      const user2 = await system.storage.create('User', {
        username: 'user2',
        password: 'password123',
        email: 'user2@test.com',
        name: 'User Two',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Unauthenticated user (null) should not be able to list users
      const result = await controller.callInteraction('GetUsers', {
        user: null,
        payload: {}
      })
      
      // Check that the interaction failed with permission error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
    })

    test('P013: Dormitory leader can submit removal request (TC004)', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create target user (resident with low points)
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 20  // Low points
      })
      
      // Dormitory leader should be able to submit removal request
      const result = await controller.callInteraction('SubmitRemovalRequest', {
        user: dormitoryLeader,
        payload: {
          userId: targetUser.id,
          reason: 'Low points and poor behavior'
        }
      })
      
      // Verify no error
      expect(result.error).toBeUndefined()
      
      // Verify RemovalRequest was created
      const removalRequests = await system.storage.find('RemovalRequest', 
        MatchExp.atom({ key: 'targetUser.id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'reason', 'status', 'targetUser', 'requestedBy']
      )
      expect(removalRequests.length).toBe(1)
      expect(removalRequests[0].reason).toBe('Low points and poor behavior')
      expect(removalRequests[0].status).toBe('pending')
    })

    test('P013: Regular resident cannot submit removal request (TC009)', async () => {
      // Create regular resident user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'resident2',
        password: 'password123',
        email: 'resident2@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20
      })
      
      // Regular resident should not be able to submit removal request
      const result = await controller.callInteraction('SubmitRemovalRequest', {
        user: resident,
        payload: {
          userId: targetUser.id,
          reason: 'Low points'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isDormitoryLeader')
      
      // Verify RemovalRequest was not created
      const removalRequests = await system.storage.find('RemovalRequest', 
        MatchExp.atom({ key: 'targetUser.id', value: ['=', targetUser.id] })
      )
      expect(removalRequests.length).toBe(0)
    })

    test('P013: Admin cannot submit removal request (not a dormitory leader)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20
      })
      
      // Admin should not be able to submit removal request (only dormitory leaders can)
      const result = await controller.callInteraction('SubmitRemovalRequest', {
        user: admin,
        payload: {
          userId: targetUser.id,
          reason: 'Admin trying to submit'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isDormitoryLeader')
      
      // Verify RemovalRequest was not created
      const removalRequests = await system.storage.find('RemovalRequest', 
        MatchExp.atom({ key: 'targetUser.id', value: ['=', targetUser.id] })
      )
      expect(removalRequests.length).toBe(0)
    })

    test('P013: Unauthenticated user cannot submit removal request', async () => {
      // Create target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Target User',
        role: 'resident',
        points: 20
      })
      
      // Unauthenticated user (null) should not be able to submit removal request
      const result = await controller.callInteraction('SubmitRemovalRequest', {
        user: null,
        payload: {
          userId: targetUser.id,
          reason: 'Unauthenticated attempt'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isDormitoryLeader')
      
      // Verify RemovalRequest was not created
      const removalRequests = await system.storage.find('RemovalRequest', 
        MatchExp.atom({ key: 'targetUser.id', value: ['=', targetUser.id] })
      )
      expect(removalRequests.length).toBe(0)
    })
  })

  describe('Phase 2: Simple Business Rules', () => {
    test('BR001: Can create dormitory with capacity 4 (TC001)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create dormitory with capacity 4
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 4',
          capacity: 4,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify dormitory was created with correct capacity
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 4'] }),
        undefined,
        ['id', 'name', 'capacity']
      )
      expect(dormitories.length).toBe(1)
      expect(dormitories[0].capacity).toBe(4)
    })

    test('BR001: Can create dormitory with capacity 6', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create dormitory with capacity 6
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 6',
          capacity: 6,
          floor: 2,
          building: 'Building 2'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify dormitory was created with correct capacity
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 6'] }),
        undefined,
        ['id', 'name', 'capacity']
      )
      expect(dormitories.length).toBe(1)
      expect(dormitories[0].capacity).toBe(6)
    })

    test('BR001: Cannot create dormitory with capacity 3 (TC013)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create dormitory with capacity 3
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 3',
          capacity: 3,
          floor: 3,
          building: 'Building 3'
        }
      })
      
      // Verify error - capacity validation should fail
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validDormitoryCapacity')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 3'] })
      )
      expect(dormitories.length).toBe(0)
    })

    test('BR001: Cannot create dormitory with capacity 7 (TC013)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create dormitory with capacity 7
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 7',
          capacity: 7,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      // Verify error - capacity validation should fail
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validDormitoryCapacity')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 7'] })
      )
      expect(dormitories.length).toBe(0)
    })

    test('BR001: Cannot create dormitory with capacity 10 (TC013)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create dormitory with capacity 10
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 10',
          capacity: 10,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      // Verify error - capacity validation should fail
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validDormitoryCapacity')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 10'] })
      )
      expect(dormitories.length).toBe(0)
    })

    test('BR001: Can create dormitory with capacity 5', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create dormitory with capacity 5 (within range)
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 5',
          capacity: 5,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify dormitory was created with correct capacity
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 5'] }),
        undefined,
        ['id', 'name', 'capacity']
      )
      expect(dormitories.length).toBe(1)
      expect(dormitories[0].capacity).toBe(5)
    })

    test('BR001: Non-admin with valid capacity still cannot create dormitory', async () => {
      // Create non-admin user
      const resident = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Even with valid capacity, non-admin should not be able to create dormitory
      const result = await controller.callInteraction('CreateDormitory', {
        user: resident,
        payload: {
          name: 'Resident Dorm',
          capacity: 5, // Valid capacity
          floor: 1,
          building: 'Building 1'
        }
      })
      
      // Verify error - should fail on admin check first
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Resident Dorm'] })
      )
      expect(dormitories.length).toBe(0)
    })

    test('BR001: Cannot create dormitory with capacity 0', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create dormitory with capacity 0
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity 0',
          capacity: 0,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      // Verify error - capacity validation should fail
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validDormitoryCapacity')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity 0'] })
      )
      expect(dormitories.length).toBe(0)
    })

    test('BR001: Cannot create dormitory with negative capacity', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create dormitory with negative capacity
      const result = await controller.callInteraction('CreateDormitory', {
        user: admin,
        payload: {
          name: 'Dorm Capacity -1',
          capacity: -1,
          floor: 1,
          building: 'Building 1'
        }
      })
      
      // Verify error - capacity validation should fail
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validDormitoryCapacity')
      
      // Verify dormitory was not created
      const dormitories = await system.storage.find('Dormitory', 
        MatchExp.atom({ key: 'name', value: ['=', 'Dorm Capacity -1'] })
      )
      expect(dormitories.length).toBe(0)
    })

    // BR002: Points to deduct must be positive
    test('BR002: Can deduct positive points (TC003)', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Admin should be able to deduct positive points
      const result = await controller.callInteraction('DeductPoints', {
        user: admin,
        payload: {
          userId: targetUser.id,
          points: 30,
          reason: 'Violation',
          description: 'Late night noise violation'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify points were deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(70)
    })

    test('BR002: Cannot deduct 0 points', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Admin should not be able to deduct 0 points
      const result = await controller.callInteraction('DeductPoints', {
        user: admin,
        payload: {
          userId: targetUser.id,
          points: 0,
          reason: 'Violation',
          description: 'Test deduction'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('positivePointsToDeduct')
      
      // Verify points were not deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(100)
    })

    test('BR002: Cannot deduct negative points', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Create a target user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Admin should not be able to deduct negative points
      const result = await controller.callInteraction('DeductPoints', {
        user: admin,
        payload: {
          userId: targetUser.id,
          points: -10,
          reason: 'Violation',
          description: 'Test deduction'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('positivePointsToDeduct')
      
      // Verify points were not deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(100)
    })

    // BR003: Points to deduct must be positive for DeductResidentPoints
    test('BR003: Can deduct positive points (TC016)', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create a target resident user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Dormitory leader should be able to deduct positive points
      const result = await controller.callInteraction('DeductResidentPoints', {
        user: dormitoryLeader,
        payload: {
          userId: targetUser.id,
          points: 20,
          reason: 'Discipline',
          description: 'Cleanliness violation'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify points were deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(80)
    })

    test('BR003: Cannot deduct 0 points with DeductResidentPoints', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create a target resident user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Dormitory leader should not be able to deduct 0 points
      const result = await controller.callInteraction('DeductResidentPoints', {
        user: dormitoryLeader,
        payload: {
          userId: targetUser.id,
          points: 0,
          reason: 'Discipline',
          description: 'Test deduction'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('positiveResidentPointsToDeduct')
      
      // Verify points were not deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(100)
    })

    test('BR003: Cannot deduct negative points with DeductResidentPoints', async () => {
      // Create dormitory leader user
      const dormitoryLeader = await system.storage.create('User', {
        username: 'leader1',
        password: 'password123',
        email: 'leader1@test.com',
        name: 'Dormitory Leader',
        role: 'dormitoryLeader',
        points: 100
      })
      
      // Create a target resident user
      const targetUser = await system.storage.create('User', {
        username: 'resident1',
        password: 'password123',
        email: 'resident1@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Dormitory leader should not be able to deduct negative points
      const result = await controller.callInteraction('DeductResidentPoints', {
        user: dormitoryLeader,
        payload: {
          userId: targetUser.id,
          points: -15,
          reason: 'Discipline',
          description: 'Test deduction'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('positiveResidentPointsToDeduct')
      
      // Verify points were not deducted
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'points']
      )
      expect(updatedUser.points).toBe(100)
    })

    // BR004: New password must meet security requirements (min 8 chars)
    test('BR004: Can change password with 8+ character password', async () => {
      // Create a user
      const user = await system.storage.create('User', {
        username: 'testuser',
        password: 'oldpassword',
        email: 'testuser@test.com',
        name: 'Test User',
        role: 'resident',
        points: 100
      })
      
      // User should be able to change password with 8+ characters
      const result = await controller.callInteraction('ChangePassword', {
        user: user,
        payload: {
          oldPassword: 'oldpassword',
          newPassword: 'newpass8'  // Exactly 8 characters
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify password was changed
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', user.id] }),
        undefined,
        ['id', 'password']
      )
      expect(updatedUser.password).toBe('newpass8')
    })

    test('BR004: Can change password with longer than 8 character password', async () => {
      // Create a user
      const user = await system.storage.create('User', {
        username: 'testuser2',
        password: 'oldpassword',
        email: 'testuser2@test.com',
        name: 'Test User 2',
        role: 'resident',
        points: 100
      })
      
      // User should be able to change password with more than 8 characters
      const result = await controller.callInteraction('ChangePassword', {
        user: user,
        payload: {
          oldPassword: 'oldpassword',
          newPassword: 'verylongnewpassword123'  // Much longer than 8 characters
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify password was changed
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', user.id] }),
        undefined,
        ['id', 'password']
      )
      expect(updatedUser.password).toBe('verylongnewpassword123')
    })

    test('BR004: Cannot change password with 7 character password', async () => {
      // Create a user
      const user = await system.storage.create('User', {
        username: 'testuser3',
        password: 'oldpassword',
        email: 'testuser3@test.com',
        name: 'Test User 3',
        role: 'resident',
        points: 100
      })
      
      // User should not be able to change password with less than 8 characters
      const result = await controller.callInteraction('ChangePassword', {
        user: user,
        payload: {
          oldPassword: 'oldpassword',
          newPassword: 'short7p'  // Only 7 characters
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validPasswordLength')
      
      // Verify password was not changed
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', user.id] }),
        undefined,
        ['id', 'password']
      )
      expect(updatedUser.password).toBe('oldpassword')
    })

    test('BR004: Cannot change password with empty password', async () => {
      // Create a user
      const user = await system.storage.create('User', {
        username: 'testuser4',
        password: 'oldpassword',
        email: 'testuser4@test.com',
        name: 'Test User 4',
        role: 'resident',
        points: 100
      })
      
      // User should not be able to change password with empty string
      const result = await controller.callInteraction('ChangePassword', {
        user: user,
        payload: {
          oldPassword: 'oldpassword',
          newPassword: ''  // Empty password
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('validPasswordLength')
      
      // Verify password was not changed
      const updatedUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'id', value: ['=', user.id] }),
        undefined,
        ['id', 'password']
      )
      expect(updatedUser.password).toBe('oldpassword')
    })

    // BR005: Password must meet security requirements (min 8 chars) for CreateUser
    test('BR005: Can create user with 8+ character password', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create user with 8+ character password
      const result = await controller.callInteraction('CreateUser', {
        user: admin,
        payload: {
          username: 'newuser',
          password: 'password8',  // Exactly 8 characters
          email: 'newuser@test.com',
          name: 'New User',
          role: 'resident'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify user was created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser'] }),
        undefined,
        ['id', 'username', 'password', 'email']
      )
      expect(createdUser).toBeDefined()
      expect(createdUser.username).toBe('newuser')
      expect(createdUser.password).toBe('password8')
    })

    test('BR005: Can create user with longer password', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should be able to create user with longer password
      const result = await controller.callInteraction('CreateUser', {
        user: admin,
        payload: {
          username: 'newuser2',
          password: 'verylongpassword123456',  // Much longer than 8 characters
          email: 'newuser2@test.com',
          name: 'New User 2',
          role: 'resident'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify user was created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser2'] }),
        undefined,
        ['id', 'username', 'password']
      )
      expect(createdUser).toBeDefined()
      expect(createdUser.username).toBe('newuser2')
      expect(createdUser.password).toBe('verylongpassword123456')
    })

    test('BR005: Cannot create user with short password', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create user with short password
      const result = await controller.callInteraction('CreateUser', {
        user: admin,
        payload: {
          username: 'newuser3',
          password: 'short7',  // Only 7 characters
          email: 'newuser3@test.com',
          name: 'New User 3',
          role: 'resident'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('createUserPasswordLength')
      
      // Verify user was not created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser3'] }),
        undefined,
        ['id']
      )
      expect(createdUser).toBeUndefined()
    })

    test('BR005: Cannot create user with empty password', async () => {
      // Create admin user
      const admin = await system.storage.create('User', {
        username: 'admin',
        password: 'password123',
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        points: 100
      })
      
      // Admin should not be able to create user with empty password
      const result = await controller.callInteraction('CreateUser', {
        user: admin,
        payload: {
          username: 'newuser4',
          password: '',  // Empty password
          email: 'newuser4@test.com',
          name: 'New User 4',
          role: 'resident'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('createUserPasswordLength')
      
      // Verify user was not created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser4'] }),
        undefined,
        ['id']
      )
      expect(createdUser).toBeUndefined()
    })

    test('BR005: Non-admin with valid password still cannot create user', async () => {
      // Create non-admin user
      const resident = await system.storage.create('User', {
        username: 'resident',
        password: 'password123',
        email: 'resident@test.com',
        name: 'Resident User',
        role: 'resident',
        points: 100
      })
      
      // Non-admin should not be able to create user even with valid password
      const result = await controller.callInteraction('CreateUser', {
        user: resident,
        payload: {
          username: 'newuser5',
          password: 'validpassword123',  // Valid password
          email: 'newuser5@test.com',
          name: 'New User 5',
          role: 'resident'
        }
      })
      
      // Verify error - should fail on admin check first
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('isAdmin')
      
      // Verify user was not created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser5'] }),
        undefined,
        ['id']
      )
      expect(createdUser).toBeUndefined()
    })

    // BR006: Password must meet security requirements (min 8 chars) for Registration
    test('BR006: Can register with 8+ character password', async () => {
      // Registration should work with 8 character password
      const result = await controller.callInteraction('Registration', {
        user: null, // Registration doesn't require authentication
        payload: {
          username: 'newuser6',
          password: 'password8',
          email: 'newuser6@test.com',
          name: 'New User 6'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify user was created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser6'] }),
        undefined,
        ['id', 'username', 'password', 'email', 'name', 'role']
      )
      expect(createdUser).toBeDefined()
      expect(createdUser.username).toBe('newuser6')
      expect(createdUser.password).toBe('password8')
      expect(createdUser.email).toBe('newuser6@test.com')
      expect(createdUser.name).toBe('New User 6')
      expect(createdUser.role).toBe('resident') // Registration always creates residents
    })

    test('BR006: Can register with longer password', async () => {
      // Registration should work with longer password
      const result = await controller.callInteraction('Registration', {
        user: null, // Registration doesn't require authentication
        payload: {
          username: 'newuser7',
          password: 'verylongpassword123456',
          email: 'newuser7@test.com',
          name: 'New User 7'
        }
      })
      
      expect(result.error).toBeUndefined()
      
      // Verify user was created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser7'] }),
        undefined,
        ['id', 'username', 'password']
      )
      expect(createdUser).toBeDefined()
      expect(createdUser.username).toBe('newuser7')
      expect(createdUser.password).toBe('verylongpassword123456')
    })

    test('BR006: Cannot register with short password', async () => {
      // Registration should fail with 7 character password
      const result = await controller.callInteraction('Registration', {
        user: null, // Registration doesn't require authentication
        payload: {
          username: 'newuser8',
          password: 'pass123', // Only 7 characters
          email: 'newuser8@test.com',
          name: 'New User 8'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('registrationPasswordLength')
      
      // Verify user was not created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser8'] }),
        undefined,
        ['id']
      )
      expect(createdUser).toBeUndefined()
    })

    test('BR006: Cannot register with empty password', async () => {
      // Registration should fail with empty password
      const result = await controller.callInteraction('Registration', {
        user: null, // Registration doesn't require authentication
        payload: {
          username: 'newuser9',
          password: '', // Empty password
          email: 'newuser9@test.com',
          name: 'New User 9'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('registrationPasswordLength')
      
      // Verify user was not created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser9'] }),
        undefined,
        ['id']
      )
      expect(createdUser).toBeUndefined()
    })

    test('BR006: Cannot register with very short password', async () => {
      // Registration should fail with 3 character password
      const result = await controller.callInteraction('Registration', {
        user: null, // Registration doesn't require authentication
        payload: {
          username: 'newuser10',
          password: 'abc', // Only 3 characters
          email: 'newuser10@test.com',
          name: 'New User 10'
        }
      })
      
      // Verify error
      expect(result.error).toBeDefined()
      expect((result.error as any).type).toBe('condition check failed')
      expect((result.error as any).error.data.name).toBe('registrationPasswordLength')
      
      // Verify user was not created
      const createdUser = await system.storage.findOne('User',
        MatchExp.atom({ key: 'username', value: ['=', 'newuser10'] }),
        undefined,
        ['id']
      )
      expect(createdUser).toBeUndefined()
    })
  })
})