import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt';
import { entities, relations, interactions } from '../backend';

describe('Dormitory Management Permission Tests', () => {
  let system: MonoSystem;
  let controller: Controller;
  let adminUser: any;
  let leaderUser: any;
  let residentUser: any;
  let inactiveUser: any;
  let dormitory: any;
  let bedSpace: any;

  beforeEach(async () => {
    // Create fresh system for each test
    system = new MonoSystem(new PGLiteDB());
    
    controller = new Controller({
      system,
      entities,
      relations,
      activities: [],
      interactions,
      dict: [],
      recordMutationSideEffects: []
    });

    await controller.setup(true);

    // Create test users with different roles
    adminUser = await system.storage.create('User', {
      username: 'admin1',
      email: 'admin@dormitory.edu',
      role: 'admin',
      score: 100,
      isActive: true
    });

    leaderUser = await system.storage.create('User', {
      username: 'leader1',
      email: 'leader@dormitory.edu',
      role: 'leader',
      score: 100,
      isActive: true
    });

    residentUser = await system.storage.create('User', {
      username: 'resident1',
      email: 'resident@dormitory.edu',
      role: 'resident',
      score: 100,
      isActive: true
    });

    inactiveUser = await system.storage.create('User', {
      username: 'inactive1',
      email: 'inactive@dormitory.edu',
      role: 'resident',
      score: 100,
      isActive: false
    });

    // Create a dormitory for testing
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Test Dormitory',
        capacity: 4
      }
    });

    dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dormitory'] }),
      undefined,
      ['id', 'name', 'capacity']
    );

    // Create a bed space
    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: {
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    bedSpace = await system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id', 'dormitoryId', 'bedNumber']
    );

    // Assign leader to dormitory
    await system.storage.update('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      { leaderId: leaderUser.id }
    );
  });

  describe('Role-based permissions', () => {
    test('admin can create dormitories', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Admin Dormitory',
          capacity: 6
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('leader cannot create dormitories', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: leaderUser,
        payload: {
          name: 'Leader Dormitory',
          capacity: 6
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('resident cannot create dormitories', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: residentUser,
        payload: {
          name: 'Resident Dormitory',
          capacity: 6
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('admin can assign users to beds', async () => {
      const result = await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('leader cannot assign users to beds', async () => {
      const result = await controller.callInteraction('AssignUserToBed', {
        user: leaderUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('admin can create users', async () => {
      const result = await controller.callInteraction('CreateUser', {
        user: adminUser,
        payload: {
          username: 'newuser',
          email: 'newuser@dormitory.edu',
          role: 'resident'
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('leader cannot create users', async () => {
      const result = await controller.callInteraction('CreateUser', {
        user: leaderUser,
        payload: {
          username: 'newuser',
          email: 'newuser@dormitory.edu',
          role: 'resident'
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });
  });

  describe('Dormitory capacity validation', () => {
    test('admin cannot create dormitory with invalid capacity (too low)', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Invalid Dormitory',
          capacity: 3  // Below minimum 4
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('admin cannot create dormitory with invalid capacity (too high)', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Invalid Dormitory',
          capacity: 7  // Above maximum 6
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('admin can create dormitory with valid capacity', async () => {
      const result4 = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Valid Dormitory 4',
          capacity: 4
        }
      });

      const result6 = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          name: 'Valid Dormitory 6',
          capacity: 6
        }
      });

      expect(result4.error).toBeUndefined();
      expect(result6.error).toBeUndefined();
    });
  });

  describe('Violation reporting permissions', () => {
    test('admin can report violations', async () => {
      // First assign resident to dormitory
      await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      const result = await controller.callInteraction('ReportViolation', {
        user: adminUser,
        payload: {
          targetUserId: residentUser.id,
          type: 'NOISE_VIOLATION',
          description: 'Admin reported violation'
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('leader can report violations for their dormitory residents', async () => {
      // First assign resident to dormitory  
      await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      const result = await controller.callInteraction('ReportViolation', {
        user: leaderUser,
        payload: {
          targetUserId: residentUser.id,
          type: 'CLEANLINESS_ISSUE',
          description: 'Leader reported violation'
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('resident cannot report violations', async () => {
      const result = await controller.callInteraction('ReportViolation', {
        user: residentUser,
        payload: {
          targetUserId: leaderUser.id,
          type: 'NOISE_VIOLATION',
          description: 'Resident trying to report'
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('cannot report violation with invalid type', async () => {
      const result = await controller.callInteraction('ReportViolation', {
        user: adminUser,
        payload: {
          targetUserId: residentUser.id,
          type: 'INVALID_TYPE',
          description: 'Invalid violation type'
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });
  });

  describe('Kickout request permissions', () => {
    test('admin can submit kickout requests', async () => {
      // First assign resident to dormitory
      await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      const result = await controller.callInteraction('SubmitKickoutRequest', {
        user: adminUser,
        payload: {
          targetUserId: residentUser.id,
          reason: 'Admin kickout request'
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('leader can submit kickout requests for their dormitory residents', async () => {
      // First assign resident to dormitory
      await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      const result = await controller.callInteraction('SubmitKickoutRequest', {
        user: leaderUser,
        payload: {
          targetUserId: residentUser.id,
          reason: 'Leader kickout request'
        }
      });

      expect(result.error).toBeUndefined();
    });

    test('resident cannot submit kickout requests', async () => {
      const result = await controller.callInteraction('SubmitKickoutRequest', {
        user: residentUser,
        payload: {
          targetUserId: leaderUser.id,
          reason: 'Resident trying to kickout'
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('only admin can approve kickout requests', async () => {
      // First create a kickout request
      await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      const submitResult = await controller.callInteraction('SubmitKickoutRequest', {
        user: leaderUser,
        payload: {
          targetUserId: residentUser.id,
          reason: 'Test request'
        }
      });

      const request = await system.storage.findOne('KickoutRequest',
        MatchExp.atom({ key: 'targetUserId', value: ['=', residentUser.id] }),
        undefined,
        ['id']
      );

      // Admin can approve
      const adminApprove = await controller.callInteraction('ApproveKickoutRequest', {
        user: adminUser,
        payload: {
          requestId: request.id,
          decision: 'approved'
        }
      });

      expect(adminApprove.error).toBeUndefined();
    });

    test('leader cannot approve kickout requests', async () => {
      // Create a mock request (since we can't easily create one due to permission complexity)
      const mockRequest = await system.storage.create('KickoutRequest', {
        requesterId: leaderUser.id,
        targetUserId: residentUser.id,
        reason: 'Test',
        status: 'pending'
      });

      const result = await controller.callInteraction('ApproveKickoutRequest', {
        user: leaderUser,
        payload: {
          requestId: mockRequest.id,
          decision: 'approved'
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });
  });

  describe('Active user permissions', () => {
    test('inactive user cannot perform actions', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: inactiveUser,
        payload: {
          name: 'Inactive User Dormitory',
          capacity: 4
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('active user can perform authorized actions', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,  // Active admin
        payload: {
          name: 'Active Admin Dormitory',
          capacity: 4
        }
      });

      expect(result.error).toBeUndefined();
    });
  });

  describe('User existence and bed availability checks', () => {
    test('cannot assign non-existent user to bed', async () => {
      const result = await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: 'non-existent-user-id',
          bedSpaceId: bedSpace.id
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('cannot assign user to non-existent bed', async () => {
      const result = await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: 'non-existent-bed-id'
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('cannot assign user to occupied bed', async () => {
      // First assign one user
      await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: residentUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      // Update bed space as occupied manually (since we don't have StateMachine yet)
      await system.storage.update('BedSpace',
        MatchExp.atom({ key: 'id', value: ['=', bedSpace.id] }),
        { isOccupied: true }
      );

      // Create another user
      const anotherUser = await system.storage.create('User', {
        username: 'another',
        email: 'another@dormitory.edu',
        role: 'resident',
        isActive: true
      });

      // Try to assign to same bed
      const result = await controller.callInteraction('AssignUserToBed', {
        user: adminUser,
        payload: {
          userId: anotherUser.id,
          bedSpaceId: bedSpace.id
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });
  });

  describe('Missing/invalid user scenarios', () => {
    test('missing user results in permission denied', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: null,
        payload: {
          name: 'No User Dormitory',
          capacity: 4
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });

    test('user without role fails permission check', async () => {
      const userNoRole = await system.storage.create('User', {
        username: 'norole',
        email: 'norole@dormitory.edu',
        isActive: true
        // role is undefined
      });

      const result = await controller.callInteraction('CreateDormitory', {
        user: userNoRole,
        payload: {
          name: 'No Role Dormitory',
          capacity: 4
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });
  });

  describe('Payload validation', () => {
    test('missing required fields are caught', async () => {
      const result = await controller.callInteraction('CreateDormitory', {
        user: adminUser,
        payload: {
          // Missing required 'name' field
          capacity: 4
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('payload name missing');
    });

    test('invalid kickout decision is rejected', async () => {
      // Create mock request
      const mockRequest = await system.storage.create('KickoutRequest', {
        requesterId: adminUser.id,
        targetUserId: residentUser.id,
        reason: 'Test',
        status: 'pending'
      });

      const result = await controller.callInteraction('ApproveKickoutRequest', {
        user: adminUser,
        payload: {
          requestId: mockRequest.id,
          decision: 'maybe'  // Invalid decision
        }
      });

      expect(result.error).toBeDefined();
      expect(result.error.type).toBe('condition check failed');
    });
  });
});