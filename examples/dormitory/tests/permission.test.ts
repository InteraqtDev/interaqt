import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp, SystemLogLevel,
  SystemConsoleLogger
} from 'interaqt'
import { entities, relations, interactions, activities, dicts, DormitoryDormHeadRelation, UserDormitoryRelation, UserPointDeductionRelation } from '../backend'

describe('Permission and Business Rules', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB(), new SystemConsoleLogger(SystemLogLevel.MUTE))
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

  // ========= Phase 1: Basic Permissions - Admin Only =========
  
  describe('P001: CreateDormitory - Only admin can create dormitories', () => {
    test('Admin can create dormitory', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Call CreateDormitory interaction as admin
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Test Dormitory',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Wait a bit for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Query the created dormitory from storage
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
        undefined,
        ['id', 'name', 'capacity', 'status']
      );
      
      expect(dormitories.length).toBe(1);
      const dormitory = dormitories[0];
      expect(dormitory).toBeDefined();
      expect(dormitory.name).toBe('Test Dormitory');
      expect(dormitory.capacity).toBe(4);
      expect(dormitory.status).toBe('active');
    });

    test('Student cannot create dormitory', async () => {
      // Create a student user
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Attempt to call CreateDormitory interaction as student
      const result = await controller.callInteraction('CreateDormitory', {
        user: studentUser,
        payload: {
          name: 'Test Dormitory',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify no dormitory was created
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
        undefined,
        ['id']
      );
      
      expect(dormitories.length).toBe(0);
    });

    test('DormHead cannot create dormitory', async () => {
      // Create a dormHead user
      const dormHeadUser = await system.storage.create('User', {
        name: 'DormHead User',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Attempt to call CreateDormitory interaction as dormHead
      const result = await controller.callInteraction('CreateDormitory', {
        user: dormHeadUser,
        payload: {
          name: 'Test Dormitory',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify no dormitory was created
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
        undefined,
        ['id']
      );
      
      expect(dormitories.length).toBe(0);
    });
  })

  describe('P002: UpdateDormitory - Only admin can update dormitories', () => {
    test('Admin can update dormitory', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // First create a dormitory using storage (since we've already tested CreateDormitory)
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Original Dormitory',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Call UpdateDormitory interaction as admin
      const result = await controller.callInteraction('UpdateDormitory', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          name: 'Updated Dormitory',
          floor: 2
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Query the updated dormitory from storage
      const updatedDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'name', 'floor']
      );
      
      expect(updatedDormitory).toBeDefined();
      expect(updatedDormitory.name).toBe('Updated Dormitory');
      expect(updatedDormitory.floor).toBe(2);
    });

    test('Non-admin cannot update dormitory', async () => {
      // Create a student user
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Original Dormitory',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Attempt to call UpdateDormitory interaction as student
      const result = await controller.callInteraction('UpdateDormitory', {
        user: studentUser,
        payload: {
          dormitoryId: dormitory.id,
          name: 'Updated Dormitory',
          floor: 2
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify dormitory was not updated
      const unchangedDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'name', 'floor']
      );
      
      expect(unchangedDormitory.name).toBe('Original Dormitory');
      expect(unchangedDormitory.floor).toBe(1);
    });
  })

  describe('P003: DeactivateDormitory - Only admin can deactivate dormitories', () => {
    test('Admin can deactivate dormitory', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dormitory',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Call DeactivateDormitory interaction as admin
      const result = await controller.callInteraction('DeactivateDormitory', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      // Note: DeactivateDormitory doesn't return data, it just performs the state change
      
      // Verify dormitory status was updated to inactive
      const updatedDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(updatedDormitory.status).toBe('inactive');
    });

    test('Non-admin cannot deactivate dormitory', async () => {
      // Create a student user
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dormitory',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Attempt to call DeactivateDormitory interaction as student
      const result = await controller.callInteraction('DeactivateDormitory', {
        user: studentUser,
        payload: {
          dormitoryId: dormitory.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify dormitory status was not changed
      const unchangedDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(unchangedDormitory.status).toBe('active');
    });
  })

  describe('P004: CreateUser - Only admin can create users', () => {
    test('Admin can create user', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Call CreateUser interaction as admin
      const result = await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          name: 'New User',
          email: 'newuser@test.com',
          phone: '9876543210',
          role: 'student'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Verify user was created with correct properties
      const createdUsers = await system.storage.find(
        'User',
        MatchExp.atom({ key: 'email', value: ['=', 'newuser@test.com'] }),
        undefined,
        ['id', 'name', 'email', 'phone', 'role', 'status']
      );
      
      expect(createdUsers.length).toBe(1);
      const createdUser = createdUsers[0];
      expect(createdUser).toBeDefined();
      expect(createdUser.name).toBe('New User');
      expect(createdUser.email).toBe('newuser@test.com');
      expect(createdUser.phone).toBe('9876543210');
      expect(createdUser.role).toBe('student');
      expect(createdUser.status).toBe('active'); // Should have default status
    });

    test('Non-admin cannot create user', async () => {
      // Create a student user
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Attempt to call CreateUser interaction as student
      const result = await controller.callInteraction('CreateUser', {
        user: studentUser,
        payload: {
          name: 'New User',
          email: 'newuser@test.com',
          phone: '9876543210',
          role: 'student'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify no user was created
      const users = await system.storage.find(
        'User',
        MatchExp.atom({ key: 'email', value: ['=', 'newuser@test.com'] }),
        undefined,
        ['id', 'email']
      );
      
      expect(users.length).toBe(0);
    });
  })

  describe('P005: AssignDormHead - Only admin can assign dorm heads', () => {
    test('Admin can assign dorm head', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a user to become dorm head
      const futureHead = await system.storage.create('User', {
        name: 'Future DormHead',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'student'  // Will become dormHead after assignment
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Call AssignDormHead interaction as admin
      const result = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          userId: futureHead.id,
          dormitoryId: dormitory.id
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Verify the user's role was updated to dormHead
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', futureHead.id] }),
        undefined,
        ['id', 'role']
      );
      
      expect(updatedUser.role).toBe('dormHead');
      
      // Verify the DormitoryDormHeadRelation was created
      // Import DormitoryDormHeadRelation directly from backend exports
      const DormitoryDormHeadRelation = relations[3]; // DormitoryDormHeadRelation is the 4th relation in the exports
      const headRelations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        [
          'id',
          ['source', { attributeQuery: ['id', 'name'] }],
          ['target', { attributeQuery: ['id', 'name', 'role'] }]
        ]
      );
      
      expect(headRelations.length).toBe(1);
      const relation = headRelations[0];
      expect(relation.source.id).toBe(dormitory.id);
      expect(relation.target.id).toBe(futureHead.id);
      expect(relation.target.role).toBe('dormHead');
    });

    test('Non-admin cannot assign dorm head', async () => {
      // Create a student user
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a user to become dorm head
      const futureHead = await system.storage.create('User', {
        name: 'Future DormHead',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Attempt to call AssignDormHead interaction as student
      const result = await controller.callInteraction('AssignDormHead', {
        user: studentUser,
        payload: {
          userId: futureHead.id,
          dormitoryId: dormitory.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify the user's role was not changed
      const unchangedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', futureHead.id] }),
        undefined,
        ['id', 'role']
      );
      
      expect(unchangedUser.role).toBe('student');
      
      // Verify no DormitoryDormHeadRelation was created
      // Import DormitoryDormHeadRelation directly from backend exports
      const DormitoryDormHeadRelation = relations[3]; // DormitoryDormHeadRelation is the 4th relation in the exports
      const headRelations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        ['id']
      );
      
      expect(headRelations.length).toBe(0);
    });
  })

  describe('P006: RemoveDormHead - Only admin can remove dorm heads', () => {
    test('Admin can remove dorm head', async () => {
      /**
       * Test Plan for: P006 - RemoveDormHead permission
       * Steps: 
       * 1) Create admin user
       * 2) Create a user who is already a dorm head
       * 3) Create a dormitory and assign the dorm head
       * 4) Admin calls RemoveDormHead
       * 5) Verify dorm head was removed and user role changed back to student
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 3,
        building: 'A',
        capacity: 6,
        occupancy: 0,
        status: 'active'
      });

      // Create a user to become dorm head
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'student'  // Start as student, will become dormHead
      });

      // Use AssignDormHead interaction to properly create the relation
      const assignResult = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          userId: dormHead.id
        }
      });
      
      // Verify assignment was successful
      expect(assignResult.error).toBeUndefined();

      // Call RemoveDormHead interaction as admin
      const result = await controller.callInteraction('RemoveDormHead', {
        user: adminUser,
        payload: {
          userId: dormHead.id
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Wait a bit to ensure effects are processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify dorm head relation was removed - query by target user instead
      const relations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'target.id', value: ['=', dormHead.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
      );
      
      expect(relations.length).toBe(0);
      
      // Verify user role changed back to student
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', dormHead.id] }),
        undefined,
        ['id', 'role']
      );
      
      expect(updatedUser.role).toBe('student');
    });

    test('Non-admin cannot remove dorm head', async () => {
      /**
       * Test Plan for: P006 - RemoveDormHead permission failure
       * Steps:
       * 1) Create a student user
       * 2) Create a dorm head and dormitory with relation
       * 3) Student attempts to call RemoveDormHead
       * 4) Verify failure with condition check failed error
       * 5) Verify relation still exists
       */
      
      // Create a student user
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 3,
        building: 'A',
        capacity: 6,
        occupancy: 0,
        status: 'active'
      });

      // Create a user to become dorm head
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'student'  // Start as student
      });

      // Create an admin to assign the dorm head
      const adminForAssignment = await system.storage.create('User', {
        name: 'Admin for Assignment',
        email: 'admin-assign@test.com',
        phone: '1234567890',
        role: 'admin'
      });
      
      // Use AssignDormHead to properly create the relation
      const assignResult = await controller.callInteraction('AssignDormHead', {
        user: adminForAssignment,
        payload: {
          dormitoryId: dormitory.id,
          userId: dormHead.id
        }
      });
      expect(assignResult.error).toBeUndefined();

      // Attempt to call RemoveDormHead interaction as student
      const result = await controller.callInteraction('RemoveDormHead', {
        user: studentUser,
        payload: {
          userId: dormHead.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify dorm head relation still exists
      const relations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
      );
      
      expect(relations.length).toBe(1);
      expect(relations[0].target.id).toBe(dormHead.id);
      
      // Verify user role unchanged
      const unchangedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', dormHead.id] }),
        undefined,
        ['id', 'role']
      );
      
      expect(unchangedUser.role).toBe('dormHead');
    });

    test('DormHead cannot remove other dorm heads', async () => {
      /**
       * Test Plan for: P006 - RemoveDormHead permission failure for dormHead
       * Steps:
       * 1) Create a dormHead user
       * 2) Create another dorm head and dormitory with relation
       * 3) First dormHead attempts to call RemoveDormHead on the other
       * 4) Verify failure with condition check failed error
       * 5) Verify relation still exists
       */
      
      // Create a dorm head user
      const dormHeadUser = await system.storage.create('User', {
        name: 'DormHead User',
        email: 'dormhead1@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 3,
        building: 'A',
        capacity: 6,
        occupancy: 0,
        status: 'active'
      });

      // Create another user to become dorm head
      const anotherDormHead = await system.storage.create('User', {
        name: 'Another Dorm Head',
        email: 'dormhead2@test.com',
        phone: '1234567890',
        role: 'student'  // Start as student
      });

      // Create an admin to assign the dorm head
      const adminForAssignment = await system.storage.create('User', {
        name: 'Admin for Assignment',
        email: 'admin-assign@test.com',
        phone: '1234567890',
        role: 'admin'
      });
      
      // Use AssignDormHead to properly create the relation
      const assignResult = await controller.callInteraction('AssignDormHead', {
        user: adminForAssignment,
        payload: {
          dormitoryId: dormitory.id,
          userId: anotherDormHead.id
        }
      });
      expect(assignResult.error).toBeUndefined();

      // Attempt to call RemoveDormHead interaction as a dormHead
      const result = await controller.callInteraction('RemoveDormHead', {
        user: dormHeadUser,
        payload: {
          userId: anotherDormHead.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify dorm head relation still exists
      const relations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }], ['target', { attributeQuery: ['id'] }]]
      );
      
      expect(relations.length).toBe(1);
      expect(relations[0].target.id).toBe(anotherDormHead.id);
      
      // Verify user role unchanged
      const unchangedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', anotherDormHead.id] }),
        undefined,
        ['id', 'role']
      );
      
      expect(unchangedUser.role).toBe('dormHead');
    });
  })

  describe('P007: AssignUserToDormitory - Only admin can assign users to dormitories', () => {
    test('Admin can assign user to dormitory', async () => {
      /**
       * Test Plan for: P007 - AssignUserToDormitory permission success
       * Steps:
       * 1) Create admin user
       * 2) Create a student user
       * 3) Create a dormitory with beds
       * 4) Admin calls AssignUserToDormitory
       * 5) Verify user was assigned to dormitory and bed
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a student user to assign
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 1,
        building: 'A',
        capacity: 4,
        occupancy: 0,
        status: 'active'
      });

      // Wait for Transform computation to create beds
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find an available bed in the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status']
      );
      
      expect(beds.length).toBe(4); // Should have 4 beds for capacity 4
      const availableBed = beds.find(b => b.status === 'available');
      expect(availableBed).toBeDefined();

      // Call AssignUserToDormitory interaction as admin
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: studentUser.id,
          dormitoryId: dormitory.id,
          bedId: availableBed.id
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Wait for effects to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify UserDormitoryRelation was created
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      const dormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', studentUser.id] }),
        undefined,
        [
          'id',
          ['source', { attributeQuery: ['id', 'name'] }],
          ['target', { attributeQuery: ['id', 'name'] }]
        ]
      );
      
      expect(dormRelations.length).toBe(1);
      expect(dormRelations[0].source.id).toBe(studentUser.id);
      expect(dormRelations[0].target.id).toBe(dormitory.id);
      
      // Verify UserBedRelation was created
      const UserBedRelation = relations[1]; // UserBedRelation is the 2nd relation
      const bedRelations = await system.storage.find(
        UserBedRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', studentUser.id] }),
        undefined,
        [
          'id',
          ['source', { attributeQuery: ['id'] }],
          ['target', { attributeQuery: ['id', 'bedNumber'] }]
        ]
      );
      
      expect(bedRelations.length).toBe(1);
      expect(bedRelations[0].source.id).toBe(studentUser.id);
      expect(bedRelations[0].target.id).toBe(availableBed.id);
      
      // Verify bed status changed to occupied
      const updatedBed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', availableBed.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(updatedBed.status).toBe('occupied');
      
      // Verify dormitory occupancy increased
      const updatedDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy']
      );
      
      expect(updatedDormitory.occupancy).toBe(1);
    });

    test('Non-admin cannot assign user to dormitory', async () => {
      /**
       * Test Plan for: P007 - AssignUserToDormitory permission failure
       * Steps:
       * 1) Create a student user (non-admin)
       * 2) Create another student user to assign
       * 3) Create a dormitory with beds
       * 4) Student attempts to call AssignUserToDormitory
       * 5) Verify failure with condition check failed error
       * 6) Verify no relations were created
       */
      
      // Create a student user (not admin)
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student1@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create another student user to assign
      const targetStudent = await system.storage.create('User', {
        name: 'Target Student',
        email: 'student2@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 1,
        building: 'A',
        capacity: 4,
        occupancy: 0,
        status: 'active'
      });

      // Wait for Transform computation to create beds
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find an available bed in the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status']
      );
      
      const availableBed = beds.find(b => b.status === 'available');
      expect(availableBed).toBeDefined();

      // Attempt to call AssignUserToDormitory interaction as student
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: studentUser,
        payload: {
          userId: targetStudent.id,
          dormitoryId: dormitory.id,
          bedId: availableBed.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();
      
      // Verify no UserDormitoryRelation was created
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      const dormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', targetStudent.id] }),
        undefined,
        ['id']
      );
      
      expect(dormRelations.length).toBe(0);
      
      // Verify no UserBedRelation was created
      const UserBedRelation = relations[1]; // UserBedRelation is the 2nd relation
      const bedRelations = await system.storage.find(
        UserBedRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', targetStudent.id] }),
        undefined,
        ['id']
      );
      
      expect(bedRelations.length).toBe(0);
      
      // Verify bed status remained available
      const unchangedBed = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', availableBed.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(unchangedBed.status).toBe('available');
      
      // Verify dormitory occupancy unchanged
      const unchangedDormitory = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy']
      );
      
      expect(unchangedDormitory.occupancy).toBe(0);
    });
  })

  describe('P008: RemoveUserFromDormitory - Only admin can remove users from dormitories', () => {
    test('Admin can remove user from dormitory', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a student user to be removed
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 1,
        building: 'A',
        capacity: 4,
        occupancy: 0,
        status: 'active'
      });

      // Wait for Transform computation to create beds
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find an available bed in the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status']
      );
      
      const availableBed = beds.find(b => b.status === 'available');
      expect(availableBed).toBeDefined();

      // First assign the user to the dormitory as admin
      const assignResult = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: studentUser.id,
          dormitoryId: dormitory.id,
          bedId: availableBed.id
        }
      });

      expect(assignResult.error).toBeUndefined();

      // Verify user is assigned
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      const dormRelationsBefore = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', studentUser.id] }),
        undefined,
        ['id']
      );
      expect(dormRelationsBefore.length).toBe(1);

      // Now remove the user from dormitory as admin
      const removeResult = await controller.callInteraction('RemoveUserFromDormitory', {
        user: adminUser,
        payload: {
          userId: studentUser.id
        }
      });

      // Verify success
      expect(removeResult.error).toBeUndefined();
      expect(removeResult.effects).toBeDefined();

      // Verify UserDormitoryRelation was removed
      const dormRelationsAfter = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', studentUser.id] }),
        undefined,
        ['id']
      );
      expect(dormRelationsAfter.length).toBe(0);

      // Verify UserBedRelation was removed
      const UserBedRelation = relations[1]; // UserBedRelation is the 2nd relation
      const bedRelationsAfter = await system.storage.find(
        UserBedRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', studentUser.id] }),
        undefined,
        ['id']
      );
      expect(bedRelationsAfter.length).toBe(0);

      // Verify bed status is back to available
      const bedAfter = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', availableBed.id] }),
        undefined,
        ['id', 'status']
      );
      expect(bedAfter.status).toBe('available');

      // Verify dormitory occupancy was decremented
      const dormitoryAfter = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy']
      );
      expect(dormitoryAfter.occupancy).toBe(0);
    });

    test('Non-admin cannot remove user from dormitory', async () => {
      // Create a student user (non-admin)
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create another student to be removed
      const targetStudent = await system.storage.create('User', {
        name: 'Target Student',
        email: 'target@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create an admin to do the initial assignment
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 1,
        building: 'A',
        capacity: 4,
        occupancy: 0,
        status: 'active'
      });

      // Wait for Transform computation to create beds
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find an available bed in the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status']
      );
      
      const availableBed = beds.find(b => b.status === 'available');
      expect(availableBed).toBeDefined();

      // First assign the target student to the dormitory as admin
      const assignResult = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: targetStudent.id,
          dormitoryId: dormitory.id,
          bedId: availableBed.id
        }
      });

      expect(assignResult.error).toBeUndefined();

      // Verify target student is assigned
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      const dormRelationsBefore = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', targetStudent.id] }),
        undefined,
        ['id']
      );
      expect(dormRelationsBefore.length).toBe(1);

      // Now attempt to remove the target student from dormitory as a regular student
      const removeResult = await controller.callInteraction('RemoveUserFromDormitory', {
        user: studentUser,
        payload: {
          userId: targetStudent.id
        }
      });

      // Verify failure
      expect(removeResult.error).toBeDefined();
      expect((removeResult.error as any).type).toBe('condition check failed');
      expect(removeResult.data).toBeUndefined();

      // Verify UserDormitoryRelation still exists
      const dormRelationsAfter = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', targetStudent.id] }),
        undefined,
        ['id']
      );
      expect(dormRelationsAfter.length).toBe(1);

      // Verify UserBedRelation still exists
      const UserBedRelation = relations[1]; // UserBedRelation is the 2nd relation
      const bedRelationsAfter = await system.storage.find(
        UserBedRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', targetStudent.id] }),
        undefined,
        ['id']
      );
      expect(bedRelationsAfter.length).toBe(1);

      // Verify bed status is still occupied
      const bedAfter = await system.storage.findOne(
        'Bed',
        MatchExp.atom({ key: 'id', value: ['=', availableBed.id] }),
        undefined,
        ['id', 'status']
      );
      expect(bedAfter.status).toBe('occupied');

      // Verify dormitory occupancy was not changed
      const dormitoryAfter = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy']
      );
      expect(dormitoryAfter.occupancy).toBe(1);
    });
  })

  describe('P009: ProcessRemovalRequest - Only admin can process removal requests', () => {
    test('Admin can approve removal request', async () => {
      /**
       * Test Plan for: P009 - ProcessRemovalRequest permission success (approve)
       * Steps:
       * 1) Create admin user
       * 2) Create dorm head user 
       * 3) Create student user with 30+ points
       * 4) Create dormitory and assign users
       * 5) Dorm head initiates removal request
       * 6) Admin approves the removal request
       * 7) Verify request is processed and marked as approved
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a dorm head user
      const dormHeadUser = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create a student user to be removed
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        floor: 1,
        building: 'A',
        capacity: 4,
        occupancy: 0,
        status: 'active'
      });

      // Wait for Transform computation to create beds
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find an available bed
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status']
      );
      
      const availableBed = beds[0];

      // Assign dorm head to dormitory
      const DormitoryDormHeadRelation = relations[2]; // DormitoryDormHeadRelation is the 3rd relation
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: { id: dormitory.id },
        target: { id: dormHeadUser.id }
      });

      // Assign student to dormitory
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      await system.storage.create(UserDormitoryRelation.name, {
        source: { id: studentUser.id },
        target: { id: dormitory.id }
      });

      // Issue 30 point deductions to the student
      const UserPointDeductionRelation = relations[4]; // UserPointDeductionRelation is the 5th relation
      for (let i = 0; i < 3; i++) {
        const deduction = await system.storage.create('PointDeduction', {
          reason: `Violation ${i + 1}`,
          points: 10,
          timestamp: Math.floor(Date.now() / 1000)
        });
        await system.storage.create(UserPointDeductionRelation.name, {
          source: { id: studentUser.id },
          target: { id: deduction.id }
        });
      }

      // Wait for computations to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create a removal request (normally done via InitiateRemovalRequest, but we'll create directly for test)
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Multiple violations',
        status: 'pending',
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create relations for the removal request
      const RemovalRequestTargetRelation = relations[6]; // RemovalRequestTargetRelation is the 7th relation
      const RemovalRequestInitiatorRelation = relations[7]; // RemovalRequestInitiatorRelation is the 8th relation
      
      await system.storage.create(RemovalRequestTargetRelation.name, {
        source: { id: removalRequest.id },
        target: { id: studentUser.id }
      });

      await system.storage.create(RemovalRequestInitiatorRelation.name, {
        source: { id: removalRequest.id },
        target: { id: dormHeadUser.id }
      });

      // Admin approves the removal request
      const result = await controller.callInteraction('ProcessRemovalRequest', {
        user: adminUser,
        payload: {
          requestId: removalRequest.id,
          decision: 'approve'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Wait for effects to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the request status was updated to approved
      const updatedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(updatedRequest.status).toBe('approved');
    });

    test('Admin can reject removal request', async () => {
      /**
       * Test Plan for: P009 - ProcessRemovalRequest permission success (reject)
       * Steps:
       * 1) Create admin user
       * 2) Create removal request
       * 3) Admin rejects the removal request
       * 4) Verify request is processed and marked as rejected
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create a student user (target of removal)
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a dorm head user (initiator)
      const dormHeadUser = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create a removal request
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Test rejection',
        status: 'pending',
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create relations for the removal request
      const RemovalRequestTargetRelation = relations[6]; // RemovalRequestTargetRelation is the 7th relation
      const RemovalRequestInitiatorRelation = relations[7]; // RemovalRequestInitiatorRelation is the 8th relation
      
      await system.storage.create(RemovalRequestTargetRelation.name, {
        source: { id: removalRequest.id },
        target: { id: studentUser.id }
      });

      await system.storage.create(RemovalRequestInitiatorRelation.name, {
        source: { id: removalRequest.id },
        target: { id: dormHeadUser.id }
      });

      // Admin rejects the removal request
      const result = await controller.callInteraction('ProcessRemovalRequest', {
        user: adminUser,
        payload: {
          requestId: removalRequest.id,
          decision: 'reject'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Wait for effects to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the request status was updated to rejected
      const updatedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(updatedRequest.status).toBe('rejected');
    });

    test('Non-admin cannot process removal request', async () => {
      /**
       * Test Plan for: P009 - ProcessRemovalRequest permission failure
       * Steps:
       * 1) Create non-admin user (dorm head)
       * 2) Create removal request
       * 3) Non-admin attempts to process the removal request
       * 4) Verify request fails and status remains unchanged
       */
      
      // Create a dorm head user (not admin)
      const dormHeadUser = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create a student user (target of removal)
      const studentUser = await system.storage.create('User', {
        name: 'Student User',
        email: 'student@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create a removal request
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Test unauthorized',
        status: 'pending',
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create relations for the removal request
      const RemovalRequestTargetRelation = relations[6]; // RemovalRequestTargetRelation is the 7th relation
      const RemovalRequestInitiatorRelation = relations[7]; // RemovalRequestInitiatorRelation is the 8th relation
      
      await system.storage.create(RemovalRequestTargetRelation.name, {
        source: { id: removalRequest.id },
        target: { id: studentUser.id }
      });

      await system.storage.create(RemovalRequestInitiatorRelation.name, {
        source: { id: removalRequest.id },
        target: { id: dormHeadUser.id }
      });

      // Dorm head (non-admin) attempts to process the removal request
      const result = await controller.callInteraction('ProcessRemovalRequest', {
        user: dormHeadUser,
        payload: {
          requestId: removalRequest.id,
          decision: 'approve'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();

      // Verify the request status remains unchanged (still pending)
      const unchangedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(unchangedRequest.status).toBe('pending');

      // Try with a regular student as well
      const regularStudent = await system.storage.create('User', {
        name: 'Regular Student',
        email: 'regular@test.com',
        phone: '1234567890',
        role: 'student'
      });

      const studentResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: regularStudent,
        payload: {
          requestId: removalRequest.id,
          decision: 'approve'
        }
      });

      // Verify failure for student as well
      expect(studentResult.error).toBeDefined();
      expect((studentResult.error as any).type).toBe('condition check failed');
      expect(studentResult.data).toBeUndefined();

      // Verify the request status still remains unchanged
      const stillUnchangedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(stillUnchangedRequest.status).toBe('pending');
    });
  });

  // ========= Phase 2: Simple Business Rules - Payload Validation =========
  
  describe('BR001: CreateDormitory - Dormitory capacity must be 4-6', () => {
    test('Can create dormitory with capacity 4', async () => {
      // Create an admin user (permission requirement)
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create dormitory with minimum valid capacity
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Min Capacity Dorm',
          capacity: 4,
          floor: 1,
          building: 'Building A'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      
      // Wait for Transform computation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify dormitory was created with correct capacity
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Min Capacity Dorm'] }),
        undefined,
        ['id', 'name', 'capacity']
      );
      
      expect(dormitories.length).toBe(1);
      expect(dormitories[0].capacity).toBe(4);
    });

    test('Can create dormitory with capacity 6', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create dormitory with maximum valid capacity
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Max Capacity Dorm',
          capacity: 6,
          floor: 2,
          building: 'Building B'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      
      // Wait for Transform computation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify dormitory was created with correct capacity
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Max Capacity Dorm'] }),
        undefined,
        ['id', 'name', 'capacity']
      );
      
      expect(dormitories.length).toBe(1);
      expect(dormitories[0].capacity).toBe(6);
    });

    test('Cannot create dormitory with capacity 3', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Attempt to create dormitory with invalid low capacity
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Invalid Low Capacity',
          capacity: 3,
          floor: 1,
          building: 'Building A'
        }
      });

      // Verify failure due to business rule
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      // When condition fails, effects should be undefined or empty
      if (result.effects !== undefined) {
        expect(result.effects).toEqual([]);
      }
      
      // Verify no dormitory was created
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Invalid Low Capacity'] }),
        undefined,
        ['id']
      );
      
      expect(dormitories.length).toBe(0);
    });

    test('Cannot create dormitory with capacity 7', async () => {
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Attempt to create dormitory with invalid high capacity
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Invalid High Capacity',
          capacity: 7,
          floor: 2,
          building: 'Building B'
        }
      });

      // Verify failure due to business rule
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      // When condition fails, effects should be undefined or empty
      if (result.effects !== undefined) {
        expect(result.effects).toEqual([]);
      }
      
      // Verify no dormitory was created
      const dormitories = await system.storage.find(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', 'Invalid High Capacity'] }),
        undefined,
        ['id']
      );
      
      expect(dormitories.length).toBe(0);
    });
  });

  // BR002: IssuePointDeduction - Points must be between 1 and 10
  describe('BR002: Point deduction range validation', () => {
    test('Can issue 1 point deduction', async () => {
      /**
       * Test Plan for: BR002 (minimum valid points)
       * Business Logic: Points must be between 1 and 10
       * Steps: 1) Create admin user 2) Create target user 3) Issue 1 point deduction 4) Verify success
       */
      
      // Create an admin user (assuming admin can issue points, but BR002 only checks range)
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User',
        email: 'target@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Issue 1 point deduction (minimum valid)
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: adminUser,
        payload: {
          userId: targetUser.id,
          reason: 'Minor violation',
          points: 1,
          category: 'discipline',
          description: 'Test minimum points'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Verify point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'points', value: ['=', 1] }),
        undefined,
        ['id', 'points', 'reason']
      );
      
      expect(deductions.length).toBe(1);
      expect(deductions[0].points).toBe(1);
    });

    test('Can issue 10 point deduction', async () => {
      /**
       * Test Plan for: BR002 (maximum valid points)
       * Business Logic: Points must be between 1 and 10
       * Steps: 1) Create admin user 2) Create target user 3) Issue 10 point deduction 4) Verify success
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin2@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User 2',
        email: 'target2@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Issue 10 point deduction (maximum valid)
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: adminUser,
        payload: {
          userId: targetUser.id,
          reason: 'Serious violation',
          points: 10,
          category: 'discipline',
          description: 'Test maximum points'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Verify point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'points', value: ['=', 10] }),
        undefined,
        ['id', 'points', 'reason']
      );
      
      expect(deductions.length).toBe(1);
      expect(deductions[0].points).toBe(10);
    });

    test('Cannot issue 0 point deduction', async () => {
      /**
       * Test Plan for: BR002 (below minimum)
       * Business Logic: Points must be between 1 and 10
       * Steps: 1) Create admin user 2) Create target user 3) Attempt 0 point deduction 4) Verify failure
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin3@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User 3',
        email: 'target3@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Attempt to issue 0 point deduction (invalid)
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: adminUser,
        payload: {
          userId: targetUser.id,
          reason: 'Invalid points',
          points: 0,
          category: 'discipline',
          description: 'Test zero points'
        }
      });

      // Verify failure due to business rule
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      // When condition fails, effects should be undefined or empty
      if (result.effects !== undefined) {
        expect(result.effects).toEqual([]);
      }
      
      // Verify no point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'points', value: ['=', 0] }),
        undefined,
        ['id']
      );
      
      expect(deductions.length).toBe(0);
    });

    test('Cannot issue 11 point deduction', async () => {
      /**
       * Test Plan for: BR002 (above maximum)
       * Business Logic: Points must be between 1 and 10
       * Steps: 1) Create admin user 2) Create target user 3) Attempt 11 point deduction 4) Verify failure
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin User',
        email: 'admin4@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User 4',
        email: 'target4@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Attempt to issue 11 point deduction (invalid)
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: adminUser,
        payload: {
          userId: targetUser.id,
          reason: 'Invalid high points',
          points: 11,
          category: 'discipline',
          description: 'Test exceeding max points'
        }
      });

      // Verify failure due to business rule
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      // When condition fails, effects should be undefined or empty
      if (result.effects !== undefined) {
        expect(result.effects).toEqual([]);
      }
      
      // Verify no point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'points', value: ['=', 11] }),
        undefined,
        ['id']
      );
      
      expect(deductions.length).toBe(0);
    });
  });

  // P010: IssuePointDeduction - Admin or dorm head of user's dormitory can issue points
  describe('P010: IssuePointDeduction - Admin or dorm head permission', () => {
    test('Admin can issue points to any user', async () => {
      /**
       * Test Plan for: P010
       * Dependencies: User entity, PointDeduction entity, UserPointDeductionRelation
       * Steps: 1) Create admin 2) Create target user 3) Admin issues points 4) Verify success
       * Business Logic: Admin has unrestricted permission to issue points
       */
      
      // Create an admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin Issuer',
        email: 'admin.issuer@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target Student',
        email: 'target.student@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Admin issues points
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: adminUser,
        payload: {
          userId: targetUser.id,
          reason: 'Admin issued deduction',
          points: 5,
          category: 'discipline',
          description: 'Test admin permission'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Verify point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'reason', value: ['=', 'Admin issued deduction'] }),
        undefined,
        ['id', 'points', 'category']
      );
      
      expect(deductions.length).toBe(1);
      expect(deductions[0].points).toBe(5);
    });

    test('DormHead can issue points to users in their dormitory', async () => {
      /**
       * Test Plan for: P010
       * Dependencies: User, Dormitory, UserDormitoryRelation, DormitoryDormHeadRelation
       * Steps: 1) Create dormitory 2) Create dorm head 3) Assign as head 4) Create student 5) Assign to dorm 6) Issue points
       * Business Logic: DormHead can issue points to users in their managed dormitory
       */
      
      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm P010',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Create dorm head user
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head P010',
        email: 'dormhead.p010@test.com',
        phone: '1111111111',
        role: 'dormHead'
      });

      // Assign as dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create student in this dormitory
      const student = await system.storage.create('User', {
        name: 'Student P010',
        email: 'student.p010@test.com',
        phone: '2222222222',
        role: 'student'
      });

      // Assign student to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: student,
        target: dormitory
      });

      // DormHead issues points to student in their dormitory
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: 'DormHead issued deduction',
          points: 3,
          category: 'hygiene',
          description: 'Test dorm head permission'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
      
      // Verify point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'reason', value: ['=', 'DormHead issued deduction'] }),
        undefined,
        ['id', 'points', 'category']
      );
      
      expect(deductions.length).toBe(1);
      expect(deductions[0].points).toBe(3);
    });

    test('DormHead cannot issue points to users in other dormitories', async () => {
      /**
       * Test Plan for: P010
       * Dependencies: User, Dormitory, UserDormitoryRelation, DormitoryDormHeadRelation
       * Steps: 1) Create 2 dorms 2) Create dorm head for dorm1 3) Create student in dorm2 4) Try to issue points
       * Business Logic: DormHead cannot issue points to users outside their managed dormitory
       */
      
      // Create two dormitories
      const dormitory1 = await system.storage.create('Dormitory', {
        name: 'Dorm 1 P010',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      const dormitory2 = await system.storage.create('Dormitory', {
        name: 'Dorm 2 P010',
        capacity: 4,
        floor: 2,
        building: 'Building B',
        status: 'active'
      });

      // Create dorm head for dormitory1
      const dormHead1 = await system.storage.create('User', {
        name: 'Dorm Head 1 P010',
        email: 'dormhead1.p010@test.com',
        phone: '3333333333',
        role: 'dormHead'
      });

      // Assign as dorm head of dormitory1
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory1,
        target: dormHead1
      });

      // Create student in dormitory2
      const student2 = await system.storage.create('User', {
        name: 'Student 2 P010',
        email: 'student2.p010@test.com',
        phone: '4444444444',
        role: 'student'
      });

      // Assign student to dormitory2
      await system.storage.create(UserDormitoryRelation.name, {
        source: student2,
        target: dormitory2
      });

      // DormHead1 tries to issue points to student in dormitory2
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: dormHead1,
        payload: {
          userId: student2.id,
          reason: 'Cross-dorm deduction attempt',
          points: 5,
          category: 'discipline',
          description: 'Should fail'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'reason', value: ['=', 'Cross-dorm deduction attempt'] }),
        undefined,
        ['id']
      );
      
      expect(deductions.length).toBe(0);
    });

    test('Student cannot issue points', async () => {
      /**
       * Test Plan for: P010
       * Dependencies: User entity
       * Steps: 1) Create student users 2) Student tries to issue points 3) Verify failure
       * Business Logic: Students do not have permission to issue points
       */
      
      // Create student users
      const studentIssuer = await system.storage.create('User', {
        name: 'Student Issuer P010',
        email: 'student.issuer.p010@test.com',
        phone: '5555555555',
        role: 'student'
      });

      const targetStudent = await system.storage.create('User', {
        name: 'Target Student P010',
        email: 'target.p010@test.com',
        phone: '6666666666',
        role: 'student'
      });

      // Student tries to issue points
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: studentIssuer,
        payload: {
          userId: targetStudent.id,
          reason: 'Student attempt',
          points: 2,
          category: 'discipline',
          description: 'Should fail'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'reason', value: ['=', 'Student attempt'] }),
        undefined,
        ['id']
      );
      
      expect(deductions.length).toBe(0);
    });

    test('DormHead cannot issue points to unassigned users', async () => {
      /**
       * Test Plan for: P010
       * Dependencies: User, Dormitory, DormitoryDormHeadRelation
       * Steps: 1) Create dorm and head 2) Create unassigned user 3) Try to issue points
       * Business Logic: DormHead cannot issue points to users not in any dormitory
       */
      
      // Create dormitory and dorm head
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm P010 Unassigned',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head Unassigned P010',
        email: 'dormhead.unassigned.p010@test.com',
        phone: '7777777777',
        role: 'dormHead'
      });

      // Assign as dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create unassigned user (no dormitory relation)
      const unassignedUser = await system.storage.create('User', {
        name: 'Unassigned User P010',
        email: 'unassigned.p010@test.com',
        phone: '8888888888',
        role: 'student'
      });

      // DormHead tries to issue points to unassigned user
      const result = await controller.callInteraction('IssuePointDeduction', {
        user: dormHead,
        payload: {
          userId: unassignedUser.id,
          reason: 'Points to unassigned',
          points: 3,
          category: 'discipline',
          description: 'Should fail'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no point deduction was created
      const deductions = await system.storage.find(
        'PointDeduction',
        MatchExp.atom({ key: 'reason', value: ['=', 'Points to unassigned'] }),
        undefined,
        ['id']
      );
      
      expect(deductions.length).toBe(0);
    });
  });

  describe('P011: InitiateRemovalRequest - Only dorm head of user\'s dormitory can initiate removal', () => {
    test('DormHead can initiate removal for users in their dormitory', async () => {
      /**
       * Test Plan for: P011
       * Dependencies: User, Dormitory, UserDormitoryRelation, DormitoryDormHeadRelation
       * Steps: 1) Create dormitory and users 2) Assign dorm head 3) Assign student to dorm 4) Initiate removal
       * Business Logic: DormHead can initiate removal for users in their managed dormitory
       */
      
      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm P011 Test',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      // Create dorm head user
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head P011',
        email: 'dormhead.p011@test.com',
        phone: '1111111111',
        role: 'dormHead'
      });

      // Create student user
      const student = await system.storage.create('User', {
        name: 'Student P011',
        email: 'student.p011@test.com',
        phone: '2222222222',
        role: 'student'
      });

      // Assign dorm head to dormitory
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Assign student to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: student,
        target: dormitory
      });

      // Create point deductions to reach 35 points (meets BR008 requirement of >= 30)
      const deduction1 = await system.storage.create('PointDeduction', {
        reason: 'Violation for P011 test - 1',
        points: 20,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: student,
        target: deduction1
      });

      const deduction2 = await system.storage.create('PointDeduction', {
        reason: 'Violation for P011 test - 2',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: student,
        target: deduction2
      });

      // DormHead initiates removal request
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: student.id,
          reason: 'Disciplinary issues'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      
      // Wait for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify removal request was created
      const removalRequests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'Disciplinary issues'] }),
        undefined,
        ['id', 'reason', 'status']
      );
      
      expect(removalRequests.length).toBe(1);
      expect(removalRequests[0].status).toBe('pending');
    });

    test('DormHead cannot initiate removal for users in other dormitories', async () => {
      /**
       * Test Plan for: P011
       * Dependencies: User, Dormitory, UserDormitoryRelation, DormitoryDormHeadRelation
       * Steps: 1) Create two dormitories 2) Assign different dorm heads 3) Assign student to dorm A 4) DormHead B tries to initiate removal
       * Business Logic: DormHead cannot initiate removal for users not in their managed dormitory
       */
      
      // Create two dormitories
      const dormitoryA = await system.storage.create('Dormitory', {
        name: 'Dorm A P011',
        capacity: 4,
        floor: 1,
        building: 'Building A',
        status: 'active'
      });

      const dormitoryB = await system.storage.create('Dormitory', {
        name: 'Dorm B P011',
        capacity: 4,
        floor: 2,
        building: 'Building B',
        status: 'active'
      });

      // Create dorm heads
      const dormHeadA = await system.storage.create('User', {
        name: 'Dorm Head A P011',
        email: 'dormheadA.p011@test.com',
        phone: '3333333333',
        role: 'dormHead'
      });

      const dormHeadB = await system.storage.create('User', {
        name: 'Dorm Head B P011',
        email: 'dormheadB.p011@test.com',
        phone: '4444444444',
        role: 'dormHead'
      });

      // Create student in dormitory A
      const studentInA = await system.storage.create('User', {
        name: 'Student in A P011',
        email: 'studentA.p011@test.com',
        phone: '5555555555',
        role: 'student',
        totalPoints: 35
      });

      // Assign dorm heads to their respective dormitories
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitoryA,
        target: dormHeadA
      });

      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitoryB,
        target: dormHeadB
      });

      // Assign student to dormitory A
      await system.storage.create(UserDormitoryRelation.name, {
        source: studentInA,
        target: dormitoryA
      });

      // DormHead B tries to initiate removal for student in dormitory A
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHeadB,
        payload: {
          userId: studentInA.id,
          reason: 'Should not be allowed'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no removal request was created
      const removalRequests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'Should not be allowed'] }),
        undefined,
        ['id']
      );
      
      expect(removalRequests.length).toBe(0);
    });

    test('Admin cannot initiate removal requests', async () => {
      /**
       * Test Plan for: P011
       * Dependencies: User
       * Steps: 1) Create admin and student 2) Admin tries to initiate removal 3) Verify failure
       * Business Logic: Only dorm heads can initiate removal requests, not admin
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin P011',
        email: 'admin.p011@test.com',
        phone: '6666666666',
        role: 'admin'
      });

      // Create student user
      const student = await system.storage.create('User', {
        name: 'Student for Admin P011',
        email: 'student.admin.p011@test.com',
        phone: '7777777777',
        role: 'student',
        totalPoints: 40
      });

      // Admin tries to initiate removal request
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: adminUser,
        payload: {
          userId: student.id,
          reason: 'Admin attempt'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no removal request was created
      const removalRequests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'Admin attempt'] }),
        undefined,
        ['id']
      );
      
      expect(removalRequests.length).toBe(0);
    });

    test('Student cannot initiate removal requests', async () => {
      /**
       * Test Plan for: P011
       * Dependencies: User
       * Steps: 1) Create two students 2) Student tries to initiate removal 3) Verify failure
       * Business Logic: Students do not have permission to initiate removal requests
       */
      
      // Create student users
      const studentInitiator = await system.storage.create('User', {
        name: 'Student Initiator P011',
        email: 'student.initiator.p011@test.com',
        phone: '8888888888',
        role: 'student'
      });

      const targetStudent = await system.storage.create('User', {
        name: 'Target Student P011',
        email: 'target.student.p011@test.com',
        phone: '9999999999',
        role: 'student',
        totalPoints: 35
      });

      // Student tries to initiate removal request
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: studentInitiator,
        payload: {
          userId: targetStudent.id,
          reason: 'Student attempt'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no removal request was created
      const removalRequests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'Student attempt'] }),
        undefined,
        ['id']
      );
      
      expect(removalRequests.length).toBe(0);
    });
  });

  describe('P012: CancelRemovalRequest - Only the initiating dorm head can cancel', () => {
    test('Initiator can cancel their own request', async () => {
      /**
       * Test Plan for: P012
       * Dependencies: User, RemovalRequest, RemovalRequestInitiatorRelation
       * Steps: 1) Create dorm head 2) Create removal request with dorm head as initiator 3) Dorm head cancels request 4) Verify success
       * Business Logic: The initiating dorm head can cancel their own pending removal request
       */
      
      // Create dorm head user (the initiator)
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head P012',
        email: 'dormhead.p012@test.com',
        phone: '1111111111',
        role: 'dormHead'
      });

      // Create a target student user
      const student = await system.storage.create('User', {
        name: 'Student P012',
        email: 'student.p012@test.com',
        phone: '2222222222',
        role: 'student'
      });

      // Create a removal request
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Test cancellation',
        status: 'pending',
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create relations for the removal request
      const RemovalRequestTargetRelation = relations[6]; // RemovalRequestTargetRelation is the 7th relation
      const RemovalRequestInitiatorRelation = relations[7]; // RemovalRequestInitiatorRelation is the 8th relation
      
      await system.storage.create(RemovalRequestTargetRelation.name, {
        source: { id: removalRequest.id },
        target: { id: student.id }
      });

      await system.storage.create(RemovalRequestInitiatorRelation.name, {
        source: { id: removalRequest.id },
        target: { id: dormHead.id }  // DormHead is the initiator
      });

      // Initiator cancels their own request
      const result = await controller.callInteraction('CancelRemovalRequest', {
        user: dormHead,
        payload: {
          requestId: removalRequest.id
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Wait for effects to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the request status was updated to cancelled
      const updatedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(updatedRequest.status).toBe('cancelled');
    });

    test('Other dorm heads cannot cancel the request', async () => {
      /**
       * Test Plan for: P012
       * Dependencies: User, RemovalRequest, RemovalRequestInitiatorRelation
       * Steps: 1) Create two dorm heads 2) Create removal request with dormHead1 as initiator 3) DormHead2 tries to cancel 4) Verify failure
       * Business Logic: Only the initiating dorm head can cancel, not other dorm heads
       */
      
      // Create first dorm head user (the initiator)
      const dormHead1 = await system.storage.create('User', {
        name: 'Dorm Head 1 P012',
        email: 'dormhead1.p012@test.com',
        phone: '3333333333',
        role: 'dormHead'
      });

      // Create second dorm head user (not the initiator)
      const dormHead2 = await system.storage.create('User', {
        name: 'Dorm Head 2 P012',
        email: 'dormhead2.p012@test.com',
        phone: '4444444444',
        role: 'dormHead'
      });

      // Create a target student user
      const student = await system.storage.create('User', {
        name: 'Student 2 P012',
        email: 'student2.p012@test.com',
        phone: '5555555555',
        role: 'student'
      });

      // Create a removal request
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Test unauthorized cancel',
        status: 'pending',
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create relations for the removal request
      const RemovalRequestTargetRelation = relations[6]; // RemovalRequestTargetRelation is the 7th relation
      const RemovalRequestInitiatorRelation = relations[7]; // RemovalRequestInitiatorRelation is the 8th relation
      
      await system.storage.create(RemovalRequestTargetRelation.name, {
        source: { id: removalRequest.id },
        target: { id: student.id }
      });

      await system.storage.create(RemovalRequestInitiatorRelation.name, {
        source: { id: removalRequest.id },
        target: { id: dormHead1.id }  // DormHead1 is the initiator
      });

      // DormHead2 (not the initiator) tries to cancel the request
      const result = await controller.callInteraction('CancelRemovalRequest', {
        user: dormHead2,
        payload: {
          requestId: removalRequest.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();

      // Verify the request status remains unchanged (still pending)
      const unchangedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(unchangedRequest.status).toBe('pending');
    });

    test('Admin cannot cancel the request', async () => {
      /**
       * Test Plan for: P012
       * Dependencies: User, RemovalRequest, RemovalRequestInitiatorRelation
       * Steps: 1) Create dorm head and admin 2) Create removal request with dormHead as initiator 3) Admin tries to cancel 4) Verify failure
       * Business Logic: Even admin cannot cancel a removal request initiated by a dorm head
       */
      
      // Create dorm head user (the initiator)
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head 3 P012',
        email: 'dormhead3.p012@test.com',
        phone: '6666666666',
        role: 'dormHead'
      });

      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin P012',
        email: 'admin.p012@test.com',
        phone: '7777777777',
        role: 'admin'
      });

      // Create a target student user
      const student = await system.storage.create('User', {
        name: 'Student 3 P012',
        email: 'student3.p012@test.com',
        phone: '8888888888',
        role: 'student'
      });

      // Create a removal request
      const removalRequest = await system.storage.create('RemovalRequest', {
        reason: 'Test admin cannot cancel',
        status: 'pending',
        timestamp: Math.floor(Date.now() / 1000)
      });

      // Create relations for the removal request
      const RemovalRequestTargetRelation = relations[6]; // RemovalRequestTargetRelation is the 7th relation
      const RemovalRequestInitiatorRelation = relations[7]; // RemovalRequestInitiatorRelation is the 8th relation
      
      await system.storage.create(RemovalRequestTargetRelation.name, {
        source: { id: removalRequest.id },
        target: { id: student.id }
      });

      await system.storage.create(RemovalRequestInitiatorRelation.name, {
        source: { id: removalRequest.id },
        target: { id: dormHead.id }  // DormHead is the initiator
      });

      // Admin tries to cancel the request
      const result = await controller.callInteraction('CancelRemovalRequest', {
        user: adminUser,
        payload: {
          requestId: removalRequest.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();

      // Verify the request status remains unchanged (still pending)
      const unchangedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', removalRequest.id] }),
        undefined,
        ['id', 'status']
      );
      
      expect(unchangedRequest.status).toBe('pending');
    });
  });

  describe('P013: UpdateUserProfile - Admin or self can update profile', () => {
    test('Admin can update any user profile', async () => {
      /**
       * Test Plan for: P013
       * Dependencies: User entity
       * Steps: 1) Create admin and regular user 2) Admin updates regular user's profile 3) Verify success
       * Business Logic: Admin can update any user's profile
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin P013',
        email: 'admin.p013@test.com',
        phone: '1111111111',
        role: 'admin'
      });

      // Create regular user
      const regularUser = await system.storage.create('User', {
        name: 'Regular User P013',
        email: 'regular.p013@test.com',
        phone: '2222222222',
        role: 'student'
      });

      // Admin updates regular user's profile
      const result = await controller.callInteraction('UpdateUserProfile', {
        user: adminUser,
        payload: {
          userId: regularUser.id,
          name: 'Updated Name P013',
          phone: '3333333333'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Wait a bit for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the user was updated
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', regularUser.id] }),
        undefined,
        ['id', 'name', 'phone']
      );

      expect(updatedUser.name).toBe('Updated Name P013');
      expect(updatedUser.phone).toBe('3333333333');
    });

    test('User can update own profile', async () => {
      /**
       * Test Plan for: P013
       * Dependencies: User entity
       * Steps: 1) Create regular user 2) User updates their own profile 3) Verify success
       * Business Logic: User can update their own profile
       */
      
      // Create regular user
      const regularUser = await system.storage.create('User', {
        name: 'Self User P013',
        email: 'self.p013@test.com',
        phone: '4444444444',
        role: 'student'
      });

      // User updates their own profile
      const result = await controller.callInteraction('UpdateUserProfile', {
        user: regularUser,
        payload: {
          userId: regularUser.id,
          name: 'Self Updated P013',
          phone: '5555555555'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Wait a bit for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the user was updated
      const updatedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', regularUser.id] }),
        undefined,
        ['id', 'name', 'phone']
      );

      expect(updatedUser.name).toBe('Self Updated P013');
      expect(updatedUser.phone).toBe('5555555555');
    });

    test('User cannot update other\'s profile', async () => {
      /**
       * Test Plan for: P013
       * Dependencies: User entity
       * Steps: 1) Create two regular users 2) First user tries to update second user's profile 3) Verify failure
       * Business Logic: User cannot update another user's profile
       */
      
      // Create first regular user
      const user1 = await system.storage.create('User', {
        name: 'User1 P013',
        email: 'user1.p013@test.com',
        phone: '6666666666',
        role: 'student'
      });

      // Create second regular user
      const user2 = await system.storage.create('User', {
        name: 'User2 P013',
        email: 'user2.p013@test.com',
        phone: '7777777777',
        role: 'student'
      });

      // User1 tries to update User2's profile
      const result = await controller.callInteraction('UpdateUserProfile', {
        user: user1,
        payload: {
          userId: user2.id,
          name: 'Should Not Update',
          phone: '8888888888'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();

      // Verify User2's profile was not updated
      const unchangedUser = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', user2.id] }),
        undefined,
        ['id', 'name', 'phone']
      );

      expect(unchangedUser.name).toBe('User2 P013');
      expect(unchangedUser.phone).toBe('7777777777');
    });
  });

  // ========= Phase 4: Complex Business Rules - Database Queries =========
  
  describe('BR003: AssignUserToDormitory - User cannot already be assigned to a dormitory', () => {
    test('Can assign unassigned user', async () => {
      /**
       * Test Plan for: BR003
       * Dependencies: User entity, Dormitory entity, UserDormitoryRelation
       * Steps: 1) Create admin user 2) Create unassigned user 3) Create dormitory 4) Assign user to dormitory 5) Verify success
       * Business Logic: User can be assigned if not already assigned to a dormitory
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR003',
        email: 'admin.br003@test.com',
        phone: '1111111111',
        role: 'admin'
      });

      // Create unassigned user
      const unassignedUser = await system.storage.create('User', {
        name: 'Unassigned User BR003',
        email: 'unassigned.br003@test.com',
        phone: '2222222222',
        role: 'student'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm BR003',
        capacity: 4,
        status: 'active'
      });

      // Create beds for the dormitory
      const bed1 = await system.storage.create('Bed', {
        number: 'BR003-1',
        isOccupied: false
      });

      // Create dormitory-bed relation
      const DormitoryBedRelation = relations[2]; // DormitoryBedRelation is the 3rd relation
      await system.storage.create(DormitoryBedRelation.name, {
        source: { id: dormitory.id },
        target: { id: bed1.id }
      });

      // Admin assigns unassigned user to dormitory
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: unassignedUser.id,
          dormitoryId: dormitory.id,
          bedId: bed1.id
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Wait for effects to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify the relation was created
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      const userDormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', unassignedUser.id] }),
        undefined,
        ['id', ['target', { attributeQuery: ['id'] }]]
      );

      expect(userDormRelations.length).toBe(1);
      expect(userDormRelations[0].target.id).toBe(dormitory.id);
    });

    test('Cannot assign already assigned user', async () => {
      /**
       * Test Plan for: BR003
       * Dependencies: User entity, Dormitory entity, UserDormitoryRelation
       * Steps: 1) Create admin user 2) Create user and assign to first dormitory 3) Try to assign to second dormitory 4) Verify failure
       * Business Logic: User cannot be assigned if already assigned to a dormitory
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR003-2',
        email: 'admin.br003.2@test.com',
        phone: '3333333333',
        role: 'admin'
      });

      // Create user to be assigned
      const assignedUser = await system.storage.create('User', {
        name: 'Assigned User BR003',
        email: 'assigned.br003@test.com',
        phone: '4444444444',
        role: 'student'
      });

      // Create first dormitory
      const dormitory1 = await system.storage.create('Dormitory', {
        name: 'First Dorm BR003',
        capacity: 4,
        status: 'active'
      });

      // Create beds for first dormitory
      const bed1 = await system.storage.create('Bed', {
        number: 'BR003-2-1',
        isOccupied: false
      });

      // Create dormitory-bed relation for first dormitory
      const DormitoryBedRelation = relations[2]; // DormitoryBedRelation is the 3rd relation
      await system.storage.create(DormitoryBedRelation.name, {
        source: { id: dormitory1.id },
        target: { id: bed1.id }
      });

      // Manually create UserDormitoryRelation to simulate user already assigned
      const UserDormitoryRelation = relations[0]; // UserDormitoryRelation is the 1st relation
      await system.storage.create(UserDormitoryRelation.name, {
        source: { id: assignedUser.id },
        target: { id: dormitory1.id }
      });

      // Create second dormitory
      const dormitory2 = await system.storage.create('Dormitory', {
        name: 'Second Dorm BR003',
        capacity: 4,
        status: 'active'
      });

      // Create beds for second dormitory
      const bed2 = await system.storage.create('Bed', {
        number: 'BR003-2-2',
        isOccupied: false
      });

      // Create dormitory-bed relation for second dormitory
      await system.storage.create(DormitoryBedRelation.name, {
        source: { id: dormitory2.id },
        target: { id: bed2.id }
      });

      // Admin tries to assign already assigned user to second dormitory
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: assignedUser.id,
          dormitoryId: dormitory2.id,
          bedId: bed2.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();

      // Verify the user is still only assigned to the first dormitory
      const userDormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', assignedUser.id] }),
        undefined,
        ['id', ['target', { attributeQuery: ['id'] }]]
      );

      expect(userDormRelations.length).toBe(1);
      expect(userDormRelations[0].target.id).toBe(dormitory1.id);
    });
  });

  describe('BR004: AssignUserToDormitory - Dormitory must have available capacity', () => {
    test('Can assign to dormitory with space', async () => {
      /**
       * Test Plan for: BR004
       * Dependencies: User entity, Dormitory entity, UserDormitoryRelation
       * Steps: 1) Create admin user 2) Create dormitory with capacity 4 3) Create users and assign to make occupancy=3 4) Assign one more user 5) Verify success
       * Business Logic: User can be assigned if dormitory has space (occupancy < capacity)
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR004',
        email: 'admin.br004@test.com',
        phone: '1111111111',
        role: 'admin'
      });

      // Create a dormitory with capacity 4
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm BR004',
        capacity: 4,
        status: 'active'
      });

      // Create 4 beds for the dormitory
      const beds = [];
      for (let i = 1; i <= 4; i++) {
        const bed = await system.storage.create('Bed', {
          number: `BR004-${i}`,
          isOccupied: false
        });
        beds.push(bed);

        // Create dormitory-bed relation
        const DormitoryBedRelation = relations[2]; // DormitoryBedRelation is the 3rd relation
        await system.storage.create(DormitoryBedRelation.name, {
          source: { id: dormitory.id },
          target: { id: bed.id }
        });
      }

      // Create and assign 3 users to make occupancy = 3
      // Use the interaction to ensure computations are properly triggered
      for (let i = 0; i < 3; i++) {
        const user = await system.storage.create('User', {
          name: `User ${i + 1} BR004`,
          email: `user${i + 1}.br004@test.com`,
          phone: `222222222${i}`,
          role: 'student'
        });

        // Use the actual interaction to assign user (this will trigger occupancy computation)
        await controller.callInteraction('AssignUserToDormitory', {
          user: adminUser,
          payload: {
            userId: user.id,
            dormitoryId: dormitory.id,
            bedId: beds[i].id
          }
        });
      }

      // Verify dormitory occupancy is 3
      const dormitoryBefore = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy', 'capacity']
      );
      expect(dormitoryBefore.occupancy).toBe(3);
      expect(dormitoryBefore.capacity).toBe(4);

      // Create one more user to assign
      const newUser = await system.storage.create('User', {
        name: 'New User BR004',
        email: 'newuser.br004@test.com',
        phone: '3333333333',
        role: 'student'
      });

      // Try to assign the new user (should succeed as there's 1 space left)
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: newUser.id,
          dormitoryId: dormitory.id,
          bedId: beds[3].id // The 4th bed
        }
      });

      // Verify success (AssignUserToDormitory doesn't return data, just check no error)
      expect(result.error).toBeUndefined();

      // Verify dormitory occupancy is now 4
      const dormitoryAfter = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy']
      );
      expect(dormitoryAfter.occupancy).toBe(4);
    });

    test('Cannot assign to full dormitory', async () => {
      /**
       * Test Plan for: BR004
       * Dependencies: User entity, Dormitory entity, UserDormitoryRelation
       * Steps: 1) Create admin user 2) Create dormitory with capacity 4 3) Fill dormitory to capacity 4) Try to assign one more user 5) Verify failure
       * Business Logic: User cannot be assigned if dormitory is full (occupancy >= capacity)
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR004-2',
        email: 'admin.br004.2@test.com',
        phone: '4444444444',
        role: 'admin'
      });

      // Create a dormitory with capacity 4
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Full Dorm BR004',
        capacity: 4,
        status: 'active'
      });

      // Create 4 beds for the dormitory
      const beds = [];
      for (let i = 1; i <= 4; i++) {
        const bed = await system.storage.create('Bed', {
          number: `BR004-2-${i}`,
          isOccupied: false
        });
        beds.push(bed);

        // Create dormitory-bed relation
        const DormitoryBedRelation = relations[2]; // DormitoryBedRelation is the 3rd relation
        await system.storage.create(DormitoryBedRelation.name, {
          source: { id: dormitory.id },
          target: { id: bed.id }
        });
      }

      // Create and assign 4 users to fill the dormitory
      // Use the interaction to ensure computations are properly triggered
      for (let i = 0; i < 4; i++) {
        const user = await system.storage.create('User', {
          name: `Full User ${i + 1} BR004`,
          email: `fulluser${i + 1}.br004@test.com`,
          phone: `555555555${i}`,
          role: 'student'
        });

        // Use the actual interaction to assign user (this will trigger occupancy computation)
        await controller.callInteraction('AssignUserToDormitory', {
          user: adminUser,
          payload: {
            userId: user.id,
            dormitoryId: dormitory.id,
            bedId: beds[i].id
          }
        });
      }

      // Verify dormitory is full
      const dormitoryBefore = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy', 'capacity']
      );
      expect(dormitoryBefore.occupancy).toBe(4);
      expect(dormitoryBefore.capacity).toBe(4);

      // Create one more user to try to assign
      const extraUser = await system.storage.create('User', {
        name: 'Extra User BR004',
        email: 'extrauser.br004@test.com',
        phone: '6666666666',
        role: 'student'
      });

      // Create an extra bed (shouldn't matter, dormitory is at capacity)
      const extraBed = await system.storage.create('Bed', {
        number: 'BR004-2-extra',
        isOccupied: false
      });

      // Try to assign the extra user (should fail as dormitory is full)
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: extraUser.id,
          dormitoryId: dormitory.id,
          bedId: extraBed.id
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.data).toBeUndefined();

      // Verify dormitory occupancy remains 4
      const dormitoryAfter = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy']
      );
      expect(dormitoryAfter.occupancy).toBe(4);

      // Verify the extra user is not assigned
      const userDormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', extraUser.id] }),
        undefined,
        ['id']
      );
      expect(userDormRelations.length).toBe(0);
    });
  });

  describe('BR005: AssignUserToDormitory - Dormitory must be active', () => {
    test('Can assign to active dormitory', async () => {
      /**
       * Test Plan for: BR005
       * Dependencies: User entity, Dormitory entity with active status
       * Steps: 1) Create admin user 2) Create active dormitory 3) Create user to assign 4) Verify assignment succeeds
       * Business Logic: Can only assign users to active dormitories
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR005',
        email: 'admin.br005@test.com',
        phone: '7777777777',
        role: 'admin'
      });

      // Create an active dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Active Dorm BR005',
        capacity: 4,
        status: 'active'
      });

      // Create beds for the dormitory
      const DormitoryBedRelation = relations[2]; // DormitoryBedRelation is the 3rd relation
      const beds = [];
      for (let i = 1; i <= 4; i++) {
        const bed = await system.storage.create('Bed', {
          number: `BR005-${i}`,
          isOccupied: false
        });
        beds.push(bed);
        
        await system.storage.create(DormitoryBedRelation.name, {
          source: { id: dormitory.id },
          target: { id: bed.id }
        });
      }

      // Create a user to assign
      const userToAssign = await system.storage.create('User', {
        name: 'User BR005',
        email: 'user.br005@test.com',
        phone: '8888888888',
        role: 'student'
      });

      // Try to assign user to active dormitory
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: userToAssign.id,
          dormitoryId: dormitory.id,
          bedId: beds[0].id  // Use the first bed
        }
      });

      // Should succeed
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Verify user is assigned
      const userDormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', userToAssign.id] }),
        undefined,
        ['id']
      );
      expect(userDormRelations.length).toBe(1);
    });

    test('Cannot assign to inactive dormitory', async () => {
      /**
       * Test Plan for: BR005
       * Dependencies: User entity, Dormitory entity with inactive status
       * Steps: 1) Create admin user 2) Create inactive dormitory 3) Create user to assign 4) Verify assignment fails
       * Business Logic: Cannot assign users to inactive dormitories
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR005-2',
        email: 'admin.br005.2@test.com',
        phone: '9999999999',
        role: 'admin'
      });

      // Create an active dormitory first (default state)
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Inactive Dorm BR005',
        capacity: 4,
        status: 'active'  // Will be active by default anyway
      });
      
      // Deactivate the dormitory using the DeactivateDormitory interaction
      const deactivateResult = await controller.callInteraction('DeactivateDormitory', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id
        }
      });
      
      // Verify deactivation succeeded
      expect(deactivateResult.error).toBeUndefined();

      // Create beds for the dormitory
      const DormitoryBedRelation = relations[2]; // DormitoryBedRelation is the 3rd relation
      const beds = [];
      for (let i = 1; i <= 4; i++) {
        const bed = await system.storage.create('Bed', {
          number: `BR005-2-${i}`,
          isOccupied: false
        });
        beds.push(bed);
        
        await system.storage.create(DormitoryBedRelation.name, {
          source: { id: dormitory.id },
          target: { id: bed.id }
        });
      }

      // Create a user to assign
      const userToAssign = await system.storage.create('User', {
        name: 'User BR005-2',
        email: 'user.br005.2@test.com',
        phone: '1010101010',
        role: 'student'
      });

      // Try to assign user to inactive dormitory
      const result = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: userToAssign.id,
          dormitoryId: dormitory.id,
          bedId: beds[0].id  // Use the first bed
        }
      });

      // Should fail with condition check error
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBe(0);  // No effects when condition fails

      // Verify user is not assigned
      const userDormRelations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', userToAssign.id] }),
        undefined,
        ['id']
      );
      expect(userDormRelations.length).toBe(0);
    });
  });

  // BR006: AssignDormHead - Dormitory can only have one dorm head
  describe('BR006: AssignDormHead - Dormitory can only have one dorm head', () => {
    test('Can assign dorm head to dormitory without one', async () => {
      /**
       * Test Plan for: BR006
       * Dependencies: User entity, Dormitory entity, DormitoryDormHeadRelation
       * Steps: 1) Create admin user 2) Create dormitory 3) Create user to be dorm head 4) Assign dorm head 5) Verify success
       * Business Logic: Dormitory can only have one dorm head
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR006',
        email: 'admin.br006@test.com',
        phone: '1111111111',
        role: 'admin'
      });

      // Create a dormitory without dorm head
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR006',
        capacity: 4,
        status: 'active'
      });

      // Create a user to be dorm head
      const userToBeDormHead = await system.storage.create('User', {
        name: 'DormHead BR006',
        email: 'dormhead.br006@test.com',
        phone: '2222222222',
        role: 'dormHead'
      });

      // Assign dorm head
      const result = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          userId: userToBeDormHead.id
        }
      });

      // Should succeed
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Verify dorm head is assigned
      const dormHeadRelations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', ['target', { attributeQuery: ['id'] }]]
      );
      expect(dormHeadRelations.length).toBe(1);
      expect(dormHeadRelations[0].target.id).toBe(userToBeDormHead.id);
    });

    test('Cannot assign second dorm head to same dormitory', async () => {
      /**
       * Test Plan for: BR006
       * Dependencies: User entity, Dormitory entity, DormitoryDormHeadRelation
       * Steps: 1) Create admin user 2) Create dormitory 3) Create first dorm head and assign 4) Create second user 5) Try to assign second dorm head 6) Verify failure
       * Business Logic: Dormitory can only have one dorm head
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR006-2',
        email: 'admin.br006.2@test.com',
        phone: '3333333333',
        role: 'admin'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR006-2',
        capacity: 4,
        status: 'active'
      });

      // Create first dorm head
      const firstDormHead = await system.storage.create('User', {
        name: 'First DormHead BR006',
        email: 'first.dormhead.br006@test.com',
        phone: '4444444444',
        role: 'dormHead'
      });

      // Assign first dorm head
      const firstResult = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          userId: firstDormHead.id
        }
      });

      // First assignment should succeed
      expect(firstResult.error).toBeUndefined();

      // Create second user to be dorm head
      const secondDormHead = await system.storage.create('User', {
        name: 'Second DormHead BR006',
        email: 'second.dormhead.br006@test.com',
        phone: '5555555555',
        role: 'dormHead'
      });

      // Try to assign second dorm head to same dormitory
      const secondResult = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          userId: secondDormHead.id
        }
      });

      // Should fail
      expect(secondResult.error).toBeDefined();
      expect((secondResult.error as any).type).toBe('condition check failed');

      // Verify only first dorm head is assigned
      const dormHeadRelations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', ['target', { attributeQuery: ['id'] }]]
      );
      expect(dormHeadRelations.length).toBe(1);
      expect(dormHeadRelations[0].target.id).toBe(firstDormHead.id);
    });
  });

  // BR007: AssignDormHead - User cannot be dorm head of multiple dormitories
  describe('BR007: AssignDormHead - User cannot be dorm head of multiple dormitories', () => {
    test('Can assign user not already a dorm head', async () => {
      /**
       * Test Plan for: BR007
       * Dependencies: User entity, Dormitory entity, DormitoryDormHeadRelation
       * Steps: 1) Create admin user 2) Create dormitory 3) Create user not a dorm head 4) Assign as dorm head 5) Verify success
       * Business Logic: User cannot be dorm head of multiple dormitories
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR007',
        email: 'admin.br007@test.com',
        phone: '6666666666',
        role: 'admin'
      });

      // Create a dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR007',
        capacity: 4,
        status: 'active'
      });

      // Create a user not already a dorm head
      const userNotDormHead = await system.storage.create('User', {
        name: 'User BR007',
        email: 'user.br007@test.com',
        phone: '7777777777',
        role: 'dormHead'
      });

      // Assign as dorm head
      const result = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          userId: userNotDormHead.id
        }
      });

      // Should succeed
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);

      // Verify dorm head is assigned
      const dormHeadRelations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'target.id', value: ['=', userNotDormHead.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }]]
      );
      expect(dormHeadRelations.length).toBe(1);
      expect(dormHeadRelations[0].source.id).toBe(dormitory.id);
    });

    test('Cannot assign user who is already dorm head elsewhere', async () => {
      /**
       * Test Plan for: BR007
       * Dependencies: User entity, Dormitory entity, DormitoryDormHeadRelation
       * Steps: 1) Create admin user 2) Create two dormitories 3) Create user 4) Assign to first dormitory 5) Try to assign to second dormitory 6) Verify failure
       * Business Logic: User cannot be dorm head of multiple dormitories
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR007-2',
        email: 'admin.br007.2@test.com',
        phone: '8888888888',
        role: 'admin'
      });

      // Create first dormitory
      const firstDormitory = await system.storage.create('Dormitory', {
        name: 'First Dorm BR007',
        capacity: 4,
        status: 'active'
      });

      // Create second dormitory
      const secondDormitory = await system.storage.create('Dormitory', {
        name: 'Second Dorm BR007',
        capacity: 4,
        status: 'active'
      });

      // Create a user to be dorm head
      const userDormHead = await system.storage.create('User', {
        name: 'DormHead BR007',
        email: 'dormhead.br007@test.com',
        phone: '9999999999',
        role: 'dormHead'
      });

      // Assign to first dormitory
      const firstResult = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: firstDormitory.id,
          userId: userDormHead.id
        }
      });

      // First assignment should succeed
      expect(firstResult.error).toBeUndefined();

      // Try to assign same user to second dormitory
      const secondResult = await controller.callInteraction('AssignDormHead', {
        user: adminUser,
        payload: {
          dormitoryId: secondDormitory.id,
          userId: userDormHead.id
        }
      });

      // Should fail
      expect(secondResult.error).toBeDefined();
      expect((secondResult.error as any).type).toBe('condition check failed');

      // Verify user is only dorm head of first dormitory
      const dormHeadRelations = await system.storage.find(
        DormitoryDormHeadRelation.name,
        MatchExp.atom({ key: 'target.id', value: ['=', userDormHead.id] }),
        undefined,
        ['id', ['source', { attributeQuery: ['id'] }]]
      );
      expect(dormHeadRelations.length).toBe(1);
      expect(dormHeadRelations[0].source.id).toBe(firstDormitory.id);
    });
  });

  // BR008: Target user must have totalPoints >= 30
  describe('BR008: InitiateRemovalRequest - totalPoints requirement', () => {
    test('Can initiate removal for user with 30 points', async () => {
      /**
       * Test Plan for: BR008 (minimum required points)
       * Business Logic: Target user must have totalPoints >= 30
       * Steps: 1) Create dorm head user 2) Create dormitory 3) Assign dorm head 
       *        4) Create target user with 30 points 5) Assign to dormitory 
       *        6) Initiate removal 7) Verify success
       */
      
      // Create a dorm head user
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        capacity: 4
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User',
        email: 'target@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Assign target user to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions to reach exactly 30 points
      // Note: We need to verify totalPoints computation works correctly
      await system.storage.create('PointDeduction', {
        reason: 'Violation 1',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: (await system.storage.find('PointDeduction', 
          MatchExp.atom({ key: 'reason', value: ['=', 'Violation 1'] }),
          undefined,
          ['id']
        ))[0]
      });

      await system.storage.create('PointDeduction', {
        reason: 'Violation 2',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: (await system.storage.find('PointDeduction', 
          MatchExp.atom({ key: 'reason', value: ['=', 'Violation 2'] }),
          undefined,
          ['id']
        ))[0]
      });

      // Verify user has exactly 30 points
      const userWithPoints = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'totalPoints']
      );
      expect(userWithPoints.totalPoints).toBe(30);

      // Attempt to initiate removal request
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'Excessive violations - 30 points'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
    });

    test('Can initiate removal for user with more than 30 points', async () => {
      /**
       * Test Plan for: BR008 (above minimum required points)
       * Business Logic: Target user must have totalPoints >= 30
       * Steps: 1) Create dorm head user 2) Create dormitory 3) Assign dorm head 
       *        4) Create target user with 45 points 5) Assign to dormitory 
       *        6) Initiate removal 7) Verify success
       */
      
      // Create a dorm head user
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head 2',
        email: 'dormhead2@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm 2',
        capacity: 4
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User 2',
        email: 'target2@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Assign target user to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions to reach 45 points
      for (let i = 0; i < 3; i++) {
        const deduction = await system.storage.create('PointDeduction', {
          reason: `Violation ${i + 1}`,
          points: 15,
          category: 'discipline',
          description: 'Test deduction'
        });
        await system.storage.create(UserPointDeductionRelation.name, {
          source: targetUser,
          target: deduction
        });
      }

      // Verify user has 45 points
      const userWithPoints = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'totalPoints']
      );
      expect(userWithPoints.totalPoints).toBe(45);

      // Attempt to initiate removal request
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'Excessive violations - 45 points'
        }
      });

      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      expect(result.effects.length).toBeGreaterThan(0);
    });

    test('Cannot initiate removal for user with less than 30 points', async () => {
      /**
       * Test Plan for: BR008 (below minimum required points)
       * Business Logic: Target user must have totalPoints >= 30
       * Steps: 1) Create dorm head user 2) Create dormitory 3) Assign dorm head 
       *        4) Create target user with 20 points 5) Assign to dormitory 
       *        6) Attempt removal 7) Verify failure
       */
      
      // Create a dorm head user
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head 3',
        email: 'dormhead3@test.com',
        phone: '1234567890',
        role: 'dormHead'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm 3',
        capacity: 4
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user
      const targetUser = await system.storage.create('User', {
        name: 'Target User 3',
        email: 'target3@test.com',
        phone: '0987654321',
        role: 'student'
      });

      // Assign target user to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions to reach only 20 points
      await system.storage.create('PointDeduction', {
        reason: 'Minor violation',
        points: 10,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: (await system.storage.find('PointDeduction', 
          MatchExp.atom({ key: 'reason', value: ['=', 'Minor violation'] }),
          undefined,
          ['id']
        ))[0]
      });

      await system.storage.create('PointDeduction', {
        reason: 'Another minor violation',
        points: 10,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: (await system.storage.find('PointDeduction', 
          MatchExp.atom({ key: 'reason', value: ['=', 'Another minor violation'] }),
          undefined,
          ['id']
        ))[0]
      });

      // Verify user has only 20 points
      const userWithPoints = await system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', targetUser.id] }),
        undefined,
        ['id', 'totalPoints']
      );
      expect(userWithPoints.totalPoints).toBe(20);

      // Attempt to initiate removal request (should fail)
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'Trying with insufficient points'
        }
      });

      // Verify failure
      expect(result.error).toBeDefined();
      expect((result.error as any).type).toBe('condition check failed');
      
      // Verify no removal request was created
      const requests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'Trying with insufficient points'] }),
        undefined,
        ['id']
      );
      expect(requests.length).toBe(0);
    });
  }); // End BR008 tests

  // BR009: Cannot have existing pending request for same user
  describe('BR009: InitiateRemovalRequest - No duplicate pending requests', () => {
    test('Can initiate removal when no pending request exists', async () => {
      /**
       * Test Plan for: BR009 - First request
       * Dependencies: User, Dormitory, Relations, RemovalRequest, Point Deductions
       * Steps: 
       * 1) Create admin, dorm head, and target user with 30+ points
       * 2) Assign users to dormitory and dorm head role
       * 3) DormHead initiates removal request - should succeed
       * Business Logic: No existing pending request, so should allow creation
       */
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@test.com',
        role: 'admin'
      });
      
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        role: 'dormHead'
      });
      
      const targetUser = await system.storage.create('User', {
        name: 'Target User',
        email: 'target@test.com',
        role: 'student'
      });
      
      // Create dormitory and assign users
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        capacity: 6
      });
      
      // Assign users to dormitory (using direct relation creation like P011 test)
      await system.storage.create(UserDormitoryRelation.name, {
        source: dormHead,
        target: dormitory
      });
      
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });
      
      // Assign dorm head to dormitory
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });
      
      // Create point deductions to reach 30 points (using direct creation like P011 test)
      const deduction1 = await system.storage.create('PointDeduction', {
        reason: 'Violation 1',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction1
      });
      
      const deduction2 = await system.storage.create('PointDeduction', {
        reason: 'Violation 2',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction2
      });
      
      // DormHead initiates removal request - should succeed (no existing request)
      const result = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'First removal request'
        }
      });
      
      // Verify success
      expect(result.error).toBeUndefined();
      expect(result.effects).toBeDefined();
      
      // Wait for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify request was created
      const requests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'First removal request'] }),
        undefined,
        ['id', 'status', 'reason']
      );
      expect(requests.length).toBe(1);
      expect(requests[0].status).toBe('pending');
    });

    test('Cannot initiate removal when pending request exists', async () => {
      /**
       * Test Plan for: BR009 - Duplicate pending request
       * Dependencies: Existing pending removal request
       * Steps: 
       * 1) Create admin, dorm head, and target user with 30+ points
       * 2) Assign users and create first removal request
       * 3) Try to create second removal request - should fail
       * Business Logic: Existing pending request prevents new request creation
       */
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@test.com',
        role: 'admin'
      });
      
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        role: 'dormHead'
      });
      
      const targetUser = await system.storage.create('User', {
        name: 'Target User',
        email: 'target@test.com',
        role: 'student'
      });
      
      // Create dormitory and assign users
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        capacity: 6
      });
      
      // Assign users to dormitory (using direct relation creation like P011 test)
      await system.storage.create(UserDormitoryRelation.name, {
        source: dormHead,
        target: dormitory
      });
      
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });
      
      // Assign dorm head to dormitory
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });
      
      // Create point deductions to reach 30 points (using direct creation like P011 test)
      const deduction1 = await system.storage.create('PointDeduction', {
        reason: 'Violation 1',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction1
      });
      
      const deduction2 = await system.storage.create('PointDeduction', {
        reason: 'Violation 2',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction2
      });
      
      // First removal request - should succeed
      const firstResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'First pending request'
        }
      });
      
      expect(firstResult.error).toBeUndefined();
      
      // Second removal request - should fail due to existing pending request
      const secondResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'Duplicate request attempt'
        }
      });
      
      // Verify failure
      expect(secondResult.error).toBeDefined();
      expect((secondResult.error as any).type).toBe('condition check failed');
      
      // Verify only one request exists
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status', 'reason']
      );
      expect(requests.length).toBe(1);
      expect(requests[0].reason).toBe('First pending request');
    });

    test('Can initiate removal after previous request was processed', async () => {
      /**
       * Test Plan for: BR009 - New request after processed
       * Dependencies: Previously processed removal request
       * Steps: 
       * 1) Create users and first removal request
       * 2) Process (approve) the first request
       * 3) Reassign user to dormitory and accumulate points again
       * 4) Try new removal request - should succeed
       * Business Logic: Processed requests don't block new requests
       */
      const admin = await system.storage.create('User', {
        name: 'Admin',
        email: 'admin@test.com',
        role: 'admin'
      });
      
      const dormHead = await system.storage.create('User', {
        name: 'Dorm Head',
        email: 'dormhead@test.com',
        role: 'dormHead'
      });
      
      const targetUser = await system.storage.create('User', {
        name: 'Target User',
        email: 'target@test.com',
        role: 'student'
      });
      
      // Create dormitory and assign users
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm',
        capacity: 6
      });
      
      // Assign users to dormitory (using direct relation creation like P011 test)
      await system.storage.create(UserDormitoryRelation.name, {
        source: dormHead,
        target: dormitory
      });
      
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });
      
      // Assign dorm head to dormitory
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });
      
      // Create point deductions for first removal (30 points total)
      const firstDeduction1 = await system.storage.create('PointDeduction', {
        reason: 'First violation 1',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: firstDeduction1
      });
      
      const firstDeduction2 = await system.storage.create('PointDeduction', {
        reason: 'First violation 2',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: firstDeduction2
      });
      
      // First removal request
      const firstResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'First removal request'
        }
      });
      
      expect(firstResult.error).toBeUndefined();
      expect(firstResult.effects).toBeDefined();
      
      // Wait for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Find the created request
      const createdRequests = await system.storage.find(
        'RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', 'First removal request'] }),
        undefined,
        ['id', 'status']
      );
      expect(createdRequests.length).toBe(1);
      const requestId = createdRequests[0].id;
      
      // Process (approve) the first request
      await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'approve',  // Use 'approve' not 'approved' to match StateMachine
          adminComment: 'Approved'
        }
      });
      
      // Verify request is no longer pending
      const processedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(processedRequest.status).toBe('approved');
      
      // Reassign user to dormitory (after removal)
      await controller.callInteraction('AssignUserToDormitory', {
        user: admin,
        payload: { userId: targetUser.id, dormitoryId: dormitory.id }
      });
      
      // Create new point deductions after reassignment (30 points total)
      const secondDeduction1 = await system.storage.create('PointDeduction', {
        reason: 'Second violation 1',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: secondDeduction1
      });
      
      const secondDeduction2 = await system.storage.create('PointDeduction', {
        reason: 'Second violation 2',
        points: 15,
        category: 'discipline',
        description: 'Test deduction'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: secondDeduction2
      });
      
      // Second removal request - should succeed (previous was processed)
      const secondResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'Second removal request after processed'
        }
      });
      
      // Verify success
      expect(secondResult.error).toBeUndefined();
      expect(secondResult.effects).toBeDefined();
      
      // Wait for Transform computation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify both requests exist
      const allRequests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status', 'reason']
      );
      expect(allRequests.length).toBe(2);
      
      // Verify statuses
      const approvedRequest = allRequests.find(r => r.reason === 'First removal request');
      const pendingRequest = allRequests.find(r => r.reason === 'Second removal request after processed');
      expect(approvedRequest?.status).toBe('approved');
      expect(pendingRequest?.status).toBe('pending');
    });
  }); // End BR009 tests

  // BR010: ProcessRemovalRequest - Request must be in pending status
  describe('BR010: ProcessRemovalRequest - Request must be in pending status', () => {
    test('Can process pending request', async () => {
      /**
       * Test Plan for: BR010 - Process pending request
       * Dependencies: RemovalRequest entity with pending status
       * Steps: 1) Create request in pending status 2) Process it 3) Verify success
       * Business Logic: Can only process requests in pending status
       */
      
      // Create admin user  
      const admin = await system.storage.create('User', {
        name: 'Admin BR010',
        email: 'admin.br010@test.com',
        phone: '1111111110',
        role: 'admin'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR010',
        capacity: 4,
        status: 'active'
      });

      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: 'DormHead BR010',
        email: 'dormhead.br010@test.com',
        phone: '2222222210',
        role: 'dormHead'
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user with 30+ points
      const targetUser = await system.storage.create('User', {
        name: 'Target User BR010',
        email: 'target.br010@test.com',
        phone: '3333333310',
        role: 'student'
      });

      // Assign to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions (30 points total)
      const deduction1 = await system.storage.create('PointDeduction', {
        reason: 'BR010 Violation 1',
        points: 20,
        category: 'discipline'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction1
      });

      const deduction2 = await system.storage.create('PointDeduction', {
        reason: 'BR010 Violation 2',
        points: 10,
        category: 'hygiene'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction2
      });

      // Initiate removal request (creates in pending status)
      const initiateResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'BR010 test - pending request'
        }
      });

      expect(initiateResult.error).toBeUndefined();

      // Wait for Transform to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the created request
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status']
      );
      expect(requests.length).toBe(1);
      const requestId = requests[0].id;
      expect(requests[0].status).toBe('pending');

      // Process the pending request - should succeed
      const processResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'approve',
          adminComment: 'BR010 - Processing pending request'
        }
      });

      expect(processResult.error).toBeUndefined();

      // Verify request was processed
      const processedRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(processedRequest.status).toBe('approved');
    });

    test('Cannot process already approved request', async () => {
      /**
       * Test Plan for: BR010 - Cannot process approved request
       * Dependencies: RemovalRequest entity with approved status
       * Steps: 1) Create and approve a request 2) Try to process it again 3) Verify failure
       * Business Logic: Cannot process already approved requests
       */
      
      // Create admin user
      const admin = await system.storage.create('User', {
        name: 'Admin BR010-2',
        email: 'admin.br010.2@test.com',
        phone: '4444444410',
        role: 'admin'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR010-2',
        capacity: 4,
        status: 'active'
      });

      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: 'DormHead BR010-2',
        email: 'dormhead.br010.2@test.com',
        phone: '5555555510',
        role: 'dormHead'
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user with 30+ points
      const targetUser = await system.storage.create('User', {
        name: 'Target User BR010-2',
        email: 'target.br010.2@test.com',
        phone: '6666666610',
        role: 'student'
      });

      // Assign to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions
      const deduction = await system.storage.create('PointDeduction', {
        reason: 'BR010-2 Violation',
        points: 30,
        category: 'discipline'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction
      });

      // Initiate removal request
      const initiateResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'BR010-2 test - approved request'
        }
      });

      expect(initiateResult.error).toBeUndefined();

      // Wait for Transform
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the request
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status']
      );
      const requestId = requests[0].id;

      // First approval - should succeed
      const firstProcessResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'approve',
          adminComment: 'First approval'
        }
      });

      expect(firstProcessResult.error).toBeUndefined();

      // Try to process again - should fail
      const secondProcessResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'reject',
          adminComment: 'Trying to change decision'
        }
      });

      expect(secondProcessResult.error).toBeDefined();
      expect((secondProcessResult.error as any).type).toBe('condition check failed');

      // Verify status remains approved
      const finalRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(finalRequest.status).toBe('approved');
    });

    test('Cannot process already rejected request', async () => {
      /**
       * Test Plan for: BR010 - Cannot process rejected request
       * Dependencies: RemovalRequest entity with rejected status
       * Steps: 1) Create and reject a request 2) Try to process it again 3) Verify failure
       * Business Logic: Cannot process already rejected requests
       */
      
      // Create admin user
      const admin = await system.storage.create('User', {
        name: 'Admin BR010-3',
        email: 'admin.br010.3@test.com',
        phone: '7777777710',
        role: 'admin'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR010-3',
        capacity: 4,
        status: 'active'
      });

      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: 'DormHead BR010-3',
        email: 'dormhead.br010.3@test.com',
        phone: '8888888810',
        role: 'dormHead'
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user with 30+ points
      const targetUser = await system.storage.create('User', {
        name: 'Target User BR010-3',
        email: 'target.br010.3@test.com',
        phone: '9999999910',
        role: 'student'
      });

      // Assign to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions
      const deduction = await system.storage.create('PointDeduction', {
        reason: 'BR010-3 Violation',
        points: 30,
        category: 'discipline'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction
      });

      // Initiate removal request
      const initiateResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'BR010-3 test - rejected request'
        }
      });

      expect(initiateResult.error).toBeUndefined();

      // Wait for Transform
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the request
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status']
      );
      const requestId = requests[0].id;

      // First rejection - should succeed
      const firstProcessResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'reject',
          adminComment: 'First rejection'
        }
      });

      expect(firstProcessResult.error).toBeUndefined();

      // Try to process again - should fail
      const secondProcessResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'approve',
          adminComment: 'Trying to approve after rejection'
        }
      });

      expect(secondProcessResult.error).toBeDefined();
      expect((secondProcessResult.error as any).type).toBe('condition check failed');

      // Verify status remains rejected
      const finalRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(finalRequest.status).toBe('rejected');
    });

    test('Cannot process cancelled request', async () => {
      /**
       * Test Plan for: BR010 - Cannot process cancelled request
       * Dependencies: RemovalRequest entity with cancelled status
       * Steps: 1) Create and cancel a request 2) Try to process it 3) Verify failure
       * Business Logic: Cannot process cancelled requests
       */
      
      // Create admin user
      const admin = await system.storage.create('User', {
        name: 'Admin BR010-4',
        email: 'admin.br010.4@test.com',
        phone: '1010101010',
        role: 'admin'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR010-4',
        capacity: 4,
        status: 'active'
      });

      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: 'DormHead BR010-4',
        email: 'dormhead.br010.4@test.com',
        phone: '1111111011',
        role: 'dormHead'
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user with 30+ points
      const targetUser = await system.storage.create('User', {
        name: 'Target User BR010-4',
        email: 'target.br010.4@test.com',
        phone: '1212121210',
        role: 'student'
      });

      // Assign to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions
      const deduction = await system.storage.create('PointDeduction', {
        reason: 'BR010-4 Violation',
        points: 30,
        category: 'discipline'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction
      });

      // Initiate removal request
      const initiateResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'BR010-4 test - cancelled request'
        }
      });

      expect(initiateResult.error).toBeUndefined();

      // Wait for Transform
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the request
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status']
      );
      const requestId = requests[0].id;

      // Cancel the request
      const cancelResult = await controller.callInteraction('CancelRemovalRequest', {
        user: dormHead,
        payload: {
          requestId: requestId
        }
      });

      expect(cancelResult.error).toBeUndefined();

      // Try to process cancelled request - should fail
      const processResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'approve',
          adminComment: 'Trying to approve cancelled request'
        }
      });

      expect(processResult.error).toBeDefined();
      expect((processResult.error as any).type).toBe('condition check failed');

      // Verify status remains cancelled
      const finalRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(finalRequest.status).toBe('cancelled');
    });
  }); // End BR010 tests

  // BR011: CancelRemovalRequest - Request must be in pending status
  describe('BR011: CancelRemovalRequest - Request must be in pending status', () => {
    test('Can cancel pending request', async () => {
      /**
       * Test Plan for: BR011 - Cancel pending request
       * Dependencies: RemovalRequest entity with pending status, RemovalRequestInitiatorRelation
       * Steps: 1) Create request in pending status 2) Cancel it by the initiator 3) Verify success
       * Business Logic: Can only cancel requests in pending status
       */
      
      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR011',
        capacity: 4,
        status: 'active'
      });

      // Create dorm head (who will be the initiator)
      const dormHead = await system.storage.create('User', {
        name: 'DormHead BR011',
        email: 'dormhead.br011@test.com',
        phone: '1111111111',
        role: 'dormHead'
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user with 30+ points
      const targetUser = await system.storage.create('User', {
        name: 'Target User BR011',
        email: 'target.br011@test.com',
        phone: '2222222211',
        role: 'student'
      });

      // Assign to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions (30 points total)
      const deduction = await system.storage.create('PointDeduction', {
        reason: 'BR011 Violation',
        points: 30,
        category: 'discipline'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction
      });

      // Initiate removal request (creates in pending status)
      const initiateResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'BR011 test - pending request'
        }
      });

      expect(initiateResult.error).toBeUndefined();

      // Wait for Transform to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the created request
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status']
      );
      expect(requests.length).toBe(1);
      const requestId = requests[0].id;
      expect(requests[0].status).toBe('pending');

      // Cancel the pending request - should succeed
      const cancelResult = await controller.callInteraction('CancelRemovalRequest', {
        user: dormHead,  // The initiator
        payload: {
          requestId: requestId
        }
      });

      expect(cancelResult.error).toBeUndefined();

      // Verify request was cancelled
      const cancelledRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(cancelledRequest.status).toBe('cancelled');
    });

    test('Cannot cancel already processed request', async () => {
      /**
       * Test Plan for: BR011 - Cannot cancel processed request
       * Dependencies: RemovalRequest entity with processed (approved/rejected) status
       * Steps: 1) Create and process a request 2) Try to cancel it 3) Verify failure
       * Business Logic: Cannot cancel already processed requests
       */
      
      // Create admin user for processing
      const admin = await system.storage.create('User', {
        name: 'Admin BR011-2',
        email: 'admin.br011.2@test.com',
        phone: '3333333311',
        role: 'admin'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Dorm BR011-2',
        capacity: 4,
        status: 'active'
      });

      // Create dorm head
      const dormHead = await system.storage.create('User', {
        name: 'DormHead BR011-2',
        email: 'dormhead.br011.2@test.com',
        phone: '4444444411',
        role: 'dormHead'
      });

      // Assign dorm head
      await system.storage.create(DormitoryDormHeadRelation.name, {
        source: dormitory,
        target: dormHead
      });

      // Create target user with 30+ points
      const targetUser = await system.storage.create('User', {
        name: 'Target User BR011-2',
        email: 'target.br011.2@test.com',
        phone: '5555555511',
        role: 'student'
      });

      // Assign to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: targetUser,
        target: dormitory
      });

      // Create point deductions
      const deduction = await system.storage.create('PointDeduction', {
        reason: 'BR011-2 Violation',
        points: 30,
        category: 'discipline'
      });
      await system.storage.create(UserPointDeductionRelation.name, {
        source: targetUser,
        target: deduction
      });

      // Initiate removal request
      const initiateResult = await controller.callInteraction('InitiateRemovalRequest', {
        user: dormHead,
        payload: {
          userId: targetUser.id,
          reason: 'BR011-2 test - approved request'
        }
      });

      expect(initiateResult.error).toBeUndefined();

      // Wait for Transform
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find the request
      const requests = await system.storage.find(
        'RemovalRequest',
        undefined,
        undefined,
        ['id', 'status']
      );
      const requestId = requests[0].id;

      // Process (approve) the request
      const processResult = await controller.callInteraction('ProcessRemovalRequest', {
        user: admin,
        payload: {
          requestId: requestId,
          decision: 'approve',
          adminComment: 'Approved for BR011 test'
        }
      });

      expect(processResult.error).toBeUndefined();

      // Try to cancel the approved request - should fail
      const cancelResult = await controller.callInteraction('CancelRemovalRequest', {
        user: dormHead,  // The initiator
        payload: {
          requestId: requestId
        }
      });

      expect(cancelResult.error).toBeDefined();
      expect((cancelResult.error as any).type).toBe('condition check failed');

      // Verify status remains approved
      const finalRequest = await system.storage.findOne(
        'RemovalRequest',
        MatchExp.atom({ key: 'id', value: ['=', requestId] }),
        undefined,
        ['id', 'status']
      );
      expect(finalRequest.status).toBe('approved');
    });
  }); // End BR011 tests

  // BR012: DeactivateDormitory - Cannot deactivate if users are assigned
  describe('BR012: DeactivateDormitory - Cannot deactivate if users are assigned', () => {
    test('Can deactivate empty dormitory', async () => {
      /**
       * Test Plan for: BR012 - Deactivate empty dormitory
       * Dependencies: Dormitory entity with zero occupancy
       * Steps: 1) Create dormitory 2) Deactivate it 3) Verify success
       * Business Logic: Can only deactivate dormitories with zero occupancy
       */
      
      // Create admin user
      const admin = await system.storage.create('User', {
        name: 'Admin BR012',
        email: 'admin.br012@test.com',
        phone: '1111111112',
        role: 'admin'
      });

      // Create empty dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Empty Dorm BR012',
        capacity: 4,
        status: 'active'
      });

      // Verify dormitory is empty (occupancy should be 0)
      const dormCheck = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy', 'status']
      );
      expect(dormCheck.occupancy).toBe(0);
      expect(dormCheck.status).toBe('active');

      // Deactivate the empty dormitory - should succeed
      const deactivateResult = await controller.callInteraction('DeactivateDormitory', {
        user: admin,
        payload: {
          dormitoryId: dormitory.id
        }
      });

      expect(deactivateResult.error).toBeUndefined();

      // Verify dormitory was deactivated
      const deactivatedDorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'status']
      );
      expect(deactivatedDorm.status).toBe('inactive');
    });

    test('Cannot deactivate dormitory with users', async () => {
      /**
       * Test Plan for: BR012 - Cannot deactivate occupied dormitory
       * Dependencies: Dormitory entity with users assigned
       * Steps: 1) Create dormitory 2) Assign users 3) Try to deactivate 4) Verify failure
       * Business Logic: Cannot deactivate dormitories with users assigned
       */
      
      // Create admin user
      const admin = await system.storage.create('User', {
        name: 'Admin BR012-2',
        email: 'admin.br012.2@test.com',
        phone: '2222222212',
        role: 'admin'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Occupied Dorm BR012',
        capacity: 4,
        status: 'active'
      });

      // Create and assign a user to the dormitory
      const student = await system.storage.create('User', {
        name: 'Student BR012',
        email: 'student.br012@test.com',
        phone: '3333333312',
        role: 'student'
      });

      // Assign user to dormitory
      await system.storage.create(UserDormitoryRelation.name, {
        source: student,
        target: dormitory
      });

      // Wait for occupancy computation to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify dormitory has occupancy > 0
      const dormCheck = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'occupancy', 'status']
      );
      expect(dormCheck.occupancy).toBe(1);
      expect(dormCheck.status).toBe('active');

      // Try to deactivate the occupied dormitory - should fail
      const deactivateResult = await controller.callInteraction('DeactivateDormitory', {
        user: admin,
        payload: {
          dormitoryId: dormitory.id
        }
      });

      expect(deactivateResult.error).toBeDefined();
      expect((deactivateResult.error as any).type).toBe('condition check failed');

      // Verify dormitory status remains active
      const finalDorm = await system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'status']
      );
      expect(finalDorm.status).toBe('active');
    });
  }); // End BR012 tests

  // BR013: RemoveUserFromDormitory - User must be assigned to a dormitory
  describe('BR013: RemoveUserFromDormitory - User must be assigned to a dormitory', () => {
    test('Can remove assigned user', async () => {
      /**
       * Test Plan for: BR013 - Remove assigned user
       * Dependencies: User entity, Dormitory entity, UserDormitoryRelation
       * Steps: 1) Create admin user 2) Create student and assign to dormitory 3) Remove user 4) Verify success
       * Business Logic: Can remove user who is assigned to a dormitory
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR013',
        email: 'admin.br013@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create student user
      const student = await system.storage.create('User', {
        name: 'Student BR013',
        email: 'student.br013@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Create dormitory
      const dormitory = await system.storage.create('Dormitory', {
        name: 'Test Dorm BR013',
        floor: 1,
        building: 'A',
        capacity: 4,
        occupancy: 0,
        status: 'active'
      });

      // Wait for Transform computation to create beds
      await new Promise(resolve => setTimeout(resolve, 100));

      // Find an available bed in the dormitory
      const beds = await system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] }),
        undefined,
        ['id', 'bedNumber', 'status']
      );
      
      const availableBed = beds.find(b => b.status === 'available');
      expect(availableBed).toBeDefined();

      // First assign user to dormitory (required for testing removal)
      const assignResult = await controller.callInteraction('AssignUserToDormitory', {
        user: adminUser,
        payload: {
          userId: student.id,
          dormitoryId: dormitory.id,
          bedId: availableBed.id
        }
      });
      
      // Verify assignment was successful
      expect(assignResult.error).toBeUndefined();
      
      // Verify relation exists
      const relations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['id']
      );
      expect(relations.length).toBe(1);

      // Now test removal - should succeed because user is assigned
      const removeResult = await controller.callInteraction('RemoveUserFromDormitory', {
        user: adminUser,
        payload: {
          userId: student.id
        }
      });

      // Verify removal success
      expect(removeResult.error).toBeUndefined();
      expect(removeResult.effects).toBeDefined();

      // Verify relation was removed
      const relationsAfter = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', student.id] }),
        undefined,
        ['id']
      );
      expect(relationsAfter.length).toBe(0);
    });

    test('Cannot remove unassigned user', async () => {
      /**
       * Test Plan for: BR013 - Remove unassigned user
       * Dependencies: User entity (not assigned to any dormitory)
       * Steps: 1) Create admin user 2) Create unassigned student 3) Try to remove user 4) Verify failure
       * Business Logic: Cannot remove user who is not assigned to any dormitory
       */
      
      // Create admin user
      const adminUser = await system.storage.create('User', {
        name: 'Admin BR013-2',
        email: 'admin.br013.2@test.com',
        phone: '1234567890',
        role: 'admin'
      });

      // Create student user but DO NOT assign to any dormitory
      const unassignedStudent = await system.storage.create('User', {
        name: 'Unassigned Student BR013',
        email: 'unassigned.br013@test.com',
        phone: '1234567890',
        role: 'student'
      });

      // Verify user is not assigned to any dormitory
      const relations = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', unassignedStudent.id] }),
        undefined,
        ['id']
      );
      expect(relations.length).toBe(0);

      // Attempt to remove unassigned user - should fail
      const removeResult = await controller.callInteraction('RemoveUserFromDormitory', {
        user: adminUser,
        payload: {
          userId: unassignedStudent.id
        }
      });

      // Verify failure
      expect(removeResult.error).toBeDefined();
      expect((removeResult.error as any).type).toBe('condition check failed');
      expect(removeResult.data).toBeUndefined();

      // Verify user still has no dormitory assignments
      const relationsAfter = await system.storage.find(
        UserDormitoryRelation.name,
        MatchExp.atom({ key: 'source.id', value: ['=', unassignedStudent.id] }),
        undefined,
        ['id']
      );
      expect(relationsAfter.length).toBe(0);
    });
  }); // End BR013 tests

  
})
