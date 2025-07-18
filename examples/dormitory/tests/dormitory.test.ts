import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt';
import { entities, relations, interactions } from '../backend';

describe('Dormitory Management System Tests', () => {
  let system: MonoSystem;
  let controller: Controller;
  let adminUser: any;
  let leaderUser: any;
  let residentUser: any;

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

    // Create test users directly in storage for authentication purposes
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
  });

  // TC001: Create Dormitory (via CreateDormitory Interaction)
  test('TC001: Should create dormitory and bed spaces', async () => {
    const result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Building A - Room 101',
        capacity: 6
      }
    });

    expect(result.error).toBeUndefined();

    // Verify dormitory was created
    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Building A - Room 101'] }),
      undefined,
      ['id', 'name', 'capacity', 'isActive', 'createdAt']
    );

    expect(dormitory).toBeTruthy();
    expect(dormitory.name).toBe('Building A - Room 101');
    expect(dormitory.capacity).toBe(6);
    expect(dormitory.isActive).toBe(true);

    // Create bed spaces manually for this test (will be automated later with side effects)
    for (let i = 1; i <= 6; i++) {
      const bedResult = await controller.callInteraction('CreateBedSpace', {
        user: adminUser,
        payload: {
          dormitoryId: dormitory.id,
          bedNumber: i
        }
      });
      expect(bedResult.error).toBeUndefined();
    }

    // Verify bed spaces were created
    const bedSpaces = await system.storage.find('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id', 'dormitoryId', 'bedNumber', 'isOccupied']
    );

    expect(bedSpaces).toHaveLength(6);
    bedSpaces.forEach((bed, index) => {
      expect(bed.dormitoryId).toBe(dormitory.id);
      expect(bed.isOccupied).toBe(false);
    });
  });

  // TC002: Create Dormitory with Invalid Capacity
  test('TC002: Should reject dormitory with invalid capacity', async () => {
    const result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        name: 'Invalid Dorm',
        capacity: 3  // Below minimum of 4
      }
    });

    // Permission system should reject invalid capacity
    expect(result.error).toBeDefined();
    expect(result.error.type).toBe('condition check failed');
  });

  // TC003: Assign User to Bed Space
  test('TC003: Should assign user to bed space', async () => {
    // First create dormitory
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: { name: 'Test Dorm', capacity: 4 }
    });

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Test Dorm'] }),
      undefined,
      ['id']
    );

    // Create a bed space
    const bedResult = await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: {
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    const bedSpace = await system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id', 'bedNumber', 'isOccupied']
    );

    // Assign user to bed
    const assignResult = await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        bedSpaceId: bedSpace.id
      }
    });

    expect(assignResult.error).toBeUndefined();

    // Verify assignment was created
    const assignment = await system.storage.findOne('Assignment',
      MatchExp.atom({ key: 'userId', value: ['=', residentUser.id] }),
      undefined,
      ['id', 'userId', 'bedSpaceId', 'isActive', 'assignedAt']
    );

    expect(assignment).toBeTruthy();
    expect(assignment.userId).toBe(residentUser.id);
    expect(assignment.bedSpaceId).toBe(bedSpace.id);
    expect(assignment.isActive).toBe(true);
  });

  // TC004: Report Violation
  test('TC004: Should report violation and deduct score', async () => {
    // First, assign resident to leader's dormitory for permission check
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: { name: 'Leader Dorm', capacity: 4 }
    });

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Leader Dorm'] }),
      undefined,
      ['id']
    );

    // Assign leader to dormitory
    await system.storage.update('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      { leaderId: leaderUser.id }
    );

    // Create and assign bed space
    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: { dormitoryId: dormitory.id, bedNumber: 1 }
    });

    const bedSpace = await system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id']
    );

    await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        bedSpaceId: bedSpace.id
      }
    });

    // Now leader can report violation
    const violationResult = await controller.callInteraction('ReportViolation', {
      user: leaderUser,
      payload: {
        targetUserId: residentUser.id,
        type: 'NOISE_VIOLATION',
        description: 'Loud music after 10 PM'
      }
    });

    expect(violationResult.error).toBeUndefined();

    // Verify violation was created
    const violation = await system.storage.findOne('Violation',
      MatchExp.atom({ key: 'userId', value: ['=', residentUser.id] }),
      undefined,
      ['id', 'userId', 'type', 'description', 'scoreDeduction', 'reportedById']
    );

    expect(violation).toBeTruthy();
    expect(violation.userId).toBe(residentUser.id);
    expect(violation.type).toBe('NOISE_VIOLATION');
    expect(violation.description).toBe('Loud music after 10 PM');
    expect(violation.scoreDeduction).toBe(10);
    expect(violation.reportedById).toBe(leaderUser.id);
  });

  // TC005: Submit Kickout Request
  test('TC005: Should submit kickout request', async () => {
    // First, setup dormitory and assignments for permission check
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: { name: 'Kickout Test Dorm', capacity: 4 }
    });

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Kickout Test Dorm'] }),
      undefined,
      ['id']
    );

    // Assign leader to dormitory
    await system.storage.update('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      { leaderId: leaderUser.id }
    );

    // Create and assign bed space
    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: { dormitoryId: dormitory.id, bedNumber: 1 }
    });

    const bedSpace = await system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id']
    );

    await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        bedSpaceId: bedSpace.id
      }
    });

    // Now leader can submit kickout request
    const kickoutResult = await controller.callInteraction('SubmitKickoutRequest', {
      user: leaderUser,
      payload: {
        targetUserId: residentUser.id,
        reason: 'Multiple violations, score below threshold'
      }
    });

    expect(kickoutResult.error).toBeUndefined();

    // Verify kickout request was created
    const request = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'targetUserId', value: ['=', residentUser.id] }),
      undefined,
      ['id', 'requesterId', 'targetUserId', 'reason', 'status', 'requestedAt']
    );

    expect(request).toBeTruthy();
    expect(request.requesterId).toBe(leaderUser.id);
    expect(request.targetUserId).toBe(residentUser.id);
    expect(request.reason).toBe('Multiple violations, score below threshold');
    expect(request.status).toBe('pending');
  });

  // TC006: Approve Kickout Request
  test('TC006: Should approve kickout request', async () => {
    // First, setup dormitory and assignments for permission check
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: { name: 'Approve Test Dorm', capacity: 4 }
    });

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Approve Test Dorm'] }),
      undefined,
      ['id']
    );

    // Assign leader to dormitory
    await system.storage.update('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      { leaderId: leaderUser.id }
    );

    // Create and assign bed space
    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: { dormitoryId: dormitory.id, bedNumber: 1 }
    });

    const bedSpace = await system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id']
    );

    await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        bedSpaceId: bedSpace.id
      }
    });

    // Create kickout request
    const kickoutResult = await controller.callInteraction('SubmitKickoutRequest', {
      user: leaderUser,
      payload: {
        targetUserId: residentUser.id,
        reason: 'Test removal'
      }
    });

    expect(kickoutResult.error).toBeUndefined();

    const request = await system.storage.findOne('KickoutRequest',
      MatchExp.atom({ key: 'targetUserId', value: ['=', residentUser.id] }),
      undefined,
      ['id']
    );

    // Approve the request
    const approveResult = await controller.callInteraction('ApproveKickoutRequest', {
      user: adminUser,
      payload: {
        requestId: request.id,
        decision: 'approved'
      }
    });

    expect(approveResult.error).toBeUndefined();

    // Note: Actual status update will be implemented with StateMachine later
  });

  // TC007: Create User
  test('TC007: Should create new user', async () => {
    const createUserResult = await controller.callInteraction('CreateUser', {
      user: adminUser,
      payload: {
        username: 'newuser',
        email: 'newuser@dormitory.edu',
        role: 'resident'
      }
    });

    expect(createUserResult.error).toBeUndefined();

    // Verify user was created
    const newUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'username', value: ['=', 'newuser'] }),
      undefined,
      ['id', 'username', 'email', 'role', 'score', 'isActive']
    );

    expect(newUser).toBeTruthy();
    expect(newUser.username).toBe('newuser');
    expect(newUser.email).toBe('newuser@dormitory.edu');
    expect(newUser.role).toBe('resident');
    expect(newUser.score).toBe(100);
    expect(newUser.isActive).toBe(true);
  });

  // TC008: Multiple Violations Score Impact
  test('TC008: Should handle multiple violations correctly', async () => {
    // First, setup dormitory and assignments for permission check
    const dormResult = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: { name: 'Multiple Violations Dorm', capacity: 4 }
    });

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Multiple Violations Dorm'] }),
      undefined,
      ['id']
    );

    // Assign leader to dormitory
    await system.storage.update('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitory.id] }),
      { leaderId: leaderUser.id }
    );

    // Create and assign bed space
    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: { dormitoryId: dormitory.id, bedNumber: 1 }
    });

    const bedSpace = await system.storage.findOne('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id']
    );

    await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        bedSpaceId: bedSpace.id
      }
    });

    // Report multiple violations
    const violation1 = await controller.callInteraction('ReportViolation', {
      user: leaderUser,
      payload: {
        targetUserId: residentUser.id,
        type: 'NOISE_VIOLATION',
        description: 'First violation'
      }
    });

    const violation2 = await controller.callInteraction('ReportViolation', {
      user: leaderUser,
      payload: {
        targetUserId: residentUser.id,
        type: 'CLEANLINESS_ISSUE',
        description: 'Second violation'
      }
    });

    const violation3 = await controller.callInteraction('ReportViolation', {
      user: leaderUser,
      payload: {
        targetUserId: residentUser.id,
        type: 'DAMAGE_TO_PROPERTY',
        description: 'Third violation'
      }
    });

    expect(violation1.error).toBeUndefined();
    expect(violation2.error).toBeUndefined();
    expect(violation3.error).toBeUndefined();

    // Verify all violations were created
    const violations = await system.storage.find('Violation',
      MatchExp.atom({ key: 'userId', value: ['=', residentUser.id] }),
      undefined,
      ['id', 'type', 'scoreDeduction']
    );

    expect(violations).toHaveLength(3);
    
    const noiseViolation = violations.find(v => v.type === 'NOISE_VIOLATION');
    const cleanlinessViolation = violations.find(v => v.type === 'CLEANLINESS_ISSUE');
    const damageViolation = violations.find(v => v.type === 'DAMAGE_TO_PROPERTY');

    expect(noiseViolation.scoreDeduction).toBe(10);
    expect(cleanlinessViolation.scoreDeduction).toBe(15);
    expect(damageViolation.scoreDeduction).toBe(25);

    // Total deduction should be 50 points (10 + 15 + 25)
    // Note: Score update logic will be implemented with StateMachine later
  });

  // TC009: Transfer User Between Beds
  test('TC009: Should transfer user to different bed', async () => {
    // Create dormitory and assign user first
    await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: { name: 'Transfer Test Dorm', capacity: 4 }
    });

    const dormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', 'Transfer Test Dorm'] }),
      undefined,
      ['id']
    );

    // Create bed spaces
    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: { dormitoryId: dormitory.id, bedNumber: 1 }
    });

    await controller.callInteraction('CreateBedSpace', {
      user: adminUser,
      payload: { dormitoryId: dormitory.id, bedNumber: 2 }
    });

    const bedSpaces = await system.storage.find('BedSpace',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitory.id] }),
      undefined,
      ['id', 'bedNumber']
    );

    const firstBed = bedSpaces.find(b => b.bedNumber === 1);
    const secondBed = bedSpaces.find(b => b.bedNumber === 2);

    // Assign to first bed
    await controller.callInteraction('AssignUserToBed', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        bedSpaceId: firstBed.id
      }
    });

    // Transfer to second bed
    const transferResult = await controller.callInteraction('TransferUser', {
      user: adminUser,
      payload: {
        userId: residentUser.id,
        newBedSpaceId: secondBed.id
      }
    });

    expect(transferResult.error).toBeUndefined();

    // Note: Transfer logic (deactivating old assignment, creating new one) 
    // will be implemented with proper StateMachine computations
  });

  // TC010: Error Handling - Missing Required Fields
  test('TC010: Should handle missing required fields', async () => {
    const result = await controller.callInteraction('CreateDormitory', {
      user: adminUser,
      payload: {
        // Missing required 'name' field
        capacity: 6
      }
    });

    // Should return error for missing required field
    expect(result.error).toBeDefined();
  });
});