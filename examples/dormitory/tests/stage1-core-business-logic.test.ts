import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  Controller,
  MatchExp,
  MonoSystem,
  PGLiteDB
} from 'interaqt';
import { interactions, entities, relations } from '../backend/index.js';

describe('Stage 1: Core Business Logic Tests', () => {
  let controller: Controller;
  let system: MonoSystem;

  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB());
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    });

    await controller.setup(true);
  });

  afterEach(async () => {
    await system.destroy();
  });

  // TC001: 创建宿舍 (通过 CreateDormitory 交互)
  test('TC001: Create Dormitory - Success', async () => {
    // Create admin user first (using proper role from the start for future compatibility)
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Call CreateDormitory interaction
    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify dormitory was created
    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    expect(dormitory).toBeTruthy();
    expect(dormitory.name).toBe('1号楼101');
    expect(dormitory.capacity).toBe(4);
    expect(dormitory.occupiedCount).toBe(0);
    expect(dormitory.availableCount).toBe(4);

    // Verify 4 beds were created automatically
    const beds = await system.storage.find(
      'Bed',
      MatchExp.atom({
        key: 'dormitory.id',
        value: ['=', dormitory.id]
      }),
      undefined,
      ['*']
    );

    expect(beds).toHaveLength(4);
    expect(beds[0].bedNumber).toBe(1);
    expect(beds[1].bedNumber).toBe(2);
    expect(beds[2].bedNumber).toBe(3);
    expect(beds[3].bedNumber).toBe(4);
    
    // All beds should be available
    beds.forEach(bed => {
      expect(bed.status).toBe('available');
    });
  });

  // TC003: 创建用户 (通过 CreateUser 交互)
  test('TC003: Create User - Success', async () => {
    // Create admin user to perform the operation
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Call CreateUser interaction
    const result = await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify user was created
    const user = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    expect(user).toBeTruthy();
    expect(user.name).toBe('张三');
    expect(user.email).toBe('zhangsan@example.com');
    expect(user.role).toBe('student');
    expect(user.score).toBe(100);
    expect(user.status).toBe('active');
    expect(user.createdAt).toBeCloseTo(Math.floor(Date.now()/1000), -1);
  });

  // TC004: 分配用户到宿舍 (通过 AssignUserToDormitory 交互)
  test('TC004: Assign User to Dormitory - Success', async () => {
    // Setup: Create admin, dormitory, and student
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create student
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    // Call AssignUserToDormitory interaction
    const result = await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify user-dormitory relation created
    const userDormRelation = await system.storage.findOne(
      'UserDormitoryRelation',
      MatchExp.atom({
        key: 'source.id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(userDormRelation).toBeTruthy();
    expect(userDormRelation.target.id).toBe(dormitory.id);

    // Verify user-bed relation created
    const userBedRelation = await system.storage.findOne(
      'UserBedRelation',
      MatchExp.atom({
        key: 'source.id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(userBedRelation).toBeTruthy();

    // Verify bed status changed to occupied
    const bed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({
        key: 'bedNumber',
        value: ['=', 1]
      }),
      undefined,
      ['*']
    );

    expect(bed.status).toBe('occupied');

    // Verify dormitory counts updated
    const updatedDormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'id',
        value: ['=', dormitory.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedDormitory.occupiedCount).toBe(1);
    expect(updatedDormitory.availableCount).toBe(3);
  });

  // TC005: 指定宿舍长 (通过 AssignDormitoryHead 交互)
  test('TC005: Assign Dormitory Head - Success', async () => {
    // Setup: Create admin, dormitory, and student, then assign student to dormitory
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create student
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    // Assign student to dormitory first
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    // Call AssignDormitoryHead interaction
    const result = await controller.callInteraction('AssignDormitoryHead', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify user role updated to dormHead
    const updatedStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedStudent.role).toBe('dormHead');

    // Verify dormitory head relation created
    const dormHeadRelation = await system.storage.findOne(
      'DormitoryHeadRelation',
      MatchExp.atom({
        key: 'source.id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(dormHeadRelation).toBeTruthy();
    expect(dormHeadRelation.target.id).toBe(dormitory.id);
  });

  // TC006: 用户扣分 (通过 DeductUserScore 交互)
  test('TC006: Deduct User Score - Success', async () => {
    // Setup: Create admin, dormitory, students, assign dorm head
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create dormitory head
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '宿舍长',
        email: 'dormhead@example.com',
        role: 'student'
      }
    });

    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'dormhead@example.com']
      }),
      undefined,
      ['*']
    );

    // Create target student
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    // Assign both to dormitory
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    });

    // Assign dormitory head
    await controller.callInteraction('AssignDormitoryHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    });

    // Get updated dormHead (now has role 'dormHead')
    const updatedDormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', dormHead.id]
      }),
      undefined,
      ['*']
    );

    // Call DeductUserScore interaction
    const result = await controller.callInteraction('DeductUserScore', {
      user: updatedDormHead,
      payload: {
        targetUserId: student.id,
        reason: '晚归',
        points: 5
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify score record created
    const scoreRecord = await system.storage.findOne(
      'ScoreRecord',
      MatchExp.atom({
        key: 'reason',
        value: ['=', '晚归']
      }),
      undefined,
      ['*']
    );

    expect(scoreRecord).toBeTruthy();
    expect(scoreRecord.reason).toBe('晚归');
    expect(scoreRecord.points).toBe(5);

    // Verify user score updated (should be 100 - 5 = 95)
    const updatedStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedStudent.score).toBe(95);
  });

  // TC007: 提交踢人申请 (通过 SubmitExpelRequest 交互)
  test('TC007: Submit Expel Request - Success', async () => {
    // Setup: Create admin, dormitory, students, assign dorm head, deduct points to make student eligible
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create dormitory head
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '宿舍长',
        email: 'dormhead@example.com',
        role: 'student'
      }
    });

    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'dormhead@example.com']
      }),
      undefined,
      ['*']
    );

    // Create target student
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    // Setup complete dormitory assignment and dorm head
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    });

    await controller.callInteraction('AssignDormitoryHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    });

    // Get updated dormHead
    const updatedDormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', dormHead.id]
      }),
      undefined,
      ['*']
    );

    // Deduct enough points to make student score < 60
    await controller.callInteraction('DeductUserScore', {
      user: updatedDormHead,
      payload: {
        targetUserId: student.id,
        reason: '多次违规',
        points: 45
      }
    });

    // Call SubmitExpelRequest interaction
    const result = await controller.callInteraction('SubmitExpelRequest', {
      user: updatedDormHead,
      payload: {
        targetUserId: student.id,
        reason: '多次违反宿舍规定'
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify expel request created
    const expelRequest = await system.storage.findOne(
      'ExpelRequest',
      MatchExp.atom({
        key: 'reason',
        value: ['=', '多次违反宿舍规定']
      }),
      undefined,
      ['*']
    );

    expect(expelRequest).toBeTruthy();
    expect(expelRequest.reason).toBe('多次违反宿舍规定');
    expect(expelRequest.status).toBe('pending');
    expect(expelRequest.createdAt).toBeCloseTo(Math.floor(Date.now()/1000), -1);
  });

  // TC008: 处理踢人申请 - 批准 (通过 ProcessExpelRequest 交互)
  test('TC008: Process Expel Request - Approved', async () => {
    // Setup: Create complete scenario with expel request
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create users and set up dormitory
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '宿舍长',
        email: 'dormhead@example.com',
        role: 'student'
      }
    });

    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'dormhead@example.com']
      }),
      undefined,
      ['*']
    );

    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    // Setup complete assignments
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    });

    await controller.callInteraction('AssignDormitoryHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    });

    const updatedDormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', dormHead.id]
      }),
      undefined,
      ['*']
    );

    // Deduct points and submit expel request
    await controller.callInteraction('DeductUserScore', {
      user: updatedDormHead,
      payload: {
        targetUserId: student.id,
        reason: '多次违规',
        points: 45
      }
    });

    await controller.callInteraction('SubmitExpelRequest', {
      user: updatedDormHead,
      payload: {
        targetUserId: student.id,
        reason: '多次违反宿舍规定'
      }
    });

    const expelRequest = await system.storage.findOne(
      'ExpelRequest',
      MatchExp.atom({
        key: 'reason',
        value: ['=', '多次违反宿舍规定']
      }),
      undefined,
      ['*']
    );

    // Call ProcessExpelRequest interaction - APPROVED
    const result = await controller.callInteraction('ProcessExpelRequest', {
      user: admin,
      payload: {
        requestId: expelRequest.id,
        decision: 'approved',
        comment: '同意踢出'
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify request status updated
    const updatedRequest = await system.storage.findOne(
      'ExpelRequest',
      MatchExp.atom({
        key: 'id',
        value: ['=', expelRequest.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedRequest.status).toBe('approved');

    // Verify target user status updated to expelled
    const updatedStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedStudent.status).toBe('expelled');

    // Verify bed status returned to available
    const bed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({
        key: 'bedNumber',
        value: ['=', 2]
      }),
      undefined,
      ['*']
    );

    expect(bed.status).toBe('available');

    // Verify dormitory counts updated
    const updatedDormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'id',
        value: ['=', dormitory.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedDormitory.occupiedCount).toBe(1); // Only dorm head remains
    expect(updatedDormitory.availableCount).toBe(3);
  });

  // TC009: 处理踢人申请 - 拒绝 (通过 ProcessExpelRequest 交互)
  test('TC009: Process Expel Request - Rejected', async () => {
    // Setup: Reuse same setup as TC008 but with rejection
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create users and set up dormitory (abbreviated setup)
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '宿舍长',
        email: 'dormhead@example.com',
        role: 'student'
      }
    });

    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    const dormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'dormhead@example.com']
      }),
      undefined,
      ['*']
    );

    const student = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    // Complete setup and submit request
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    });

    await controller.callInteraction('AssignDormitoryHead', {
      user: admin,
      payload: {
        userId: dormHead.id,
        dormitoryId: dormitory.id
      }
    });

    const updatedDormHead = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', dormHead.id]
      }),
      undefined,
      ['*']
    );

    await controller.callInteraction('SubmitExpelRequest', {
      user: updatedDormHead,
      payload: {
        targetUserId: student.id,
        reason: '申请踢出'
      }
    });

    const expelRequest = await system.storage.findOne(
      'ExpelRequest',
      MatchExp.atom({
        key: 'reason',
        value: ['=', '申请踢出']
      }),
      undefined,
      ['*']
    );

    // Call ProcessExpelRequest interaction - REJECTED
    const result = await controller.callInteraction('ProcessExpelRequest', {
      user: admin,
      payload: {
        requestId: expelRequest.id,
        decision: 'rejected',
        comment: '证据不足'
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // Verify request status updated to rejected
    const updatedRequest = await system.storage.findOne(
      'ExpelRequest',
      MatchExp.atom({
        key: 'id',
        value: ['=', expelRequest.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedRequest.status).toBe('rejected');

    // Verify target user status remains active
    const updatedStudent = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'id',
        value: ['=', student.id]
      }),
      undefined,
      ['*']
    );

    expect(updatedStudent.status).toBe('active');

    // Verify user still occupies the bed
    const bed = await system.storage.findOne(
      'Bed',
      MatchExp.atom({
        key: 'bedNumber',
        value: ['=', 2]
      }),
      undefined,
      ['*']
    );

    expect(bed.status).toBe('occupied');
  });

  // TC010: 查看宿舍成员 (通过 ViewDormitoryMembers 交互)
  test('TC010: View Dormitory Members - Success', async () => {
    // Setup: Create dormitory with multiple members
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      score: 100,
      status: 'active',
      createdAt: Math.floor(Date.now()/1000)
    });

    // Create dormitory
    await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '1号楼101',
        capacity: 4
      }
    });

    const dormitory = await system.storage.findOne(
      'Dormitory',
      MatchExp.atom({
        key: 'name',
        value: ['=', '1号楼101']
      }),
      undefined,
      ['*']
    );

    // Create multiple students
    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '张三',
        email: 'zhangsan@example.com',
        role: 'student'
      }
    });

    await controller.callInteraction('CreateUser', {
      user: admin,
      payload: {
        name: '李四',
        email: 'lisi@example.com',
        role: 'student'
      }
    });

    const student1 = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'zhangsan@example.com']
      }),
      undefined,
      ['*']
    );

    const student2 = await system.storage.findOne(
      'User',
      MatchExp.atom({
        key: 'email',
        value: ['=', 'lisi@example.com']
      }),
      undefined,
      ['*']
    );

    // Assign both students to dormitory
    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student1.id,
        dormitoryId: dormitory.id,
        bedNumber: 1
      }
    });

    await controller.callInteraction('AssignUserToDormitory', {
      user: admin,
      payload: {
        userId: student2.id,
        dormitoryId: dormitory.id,
        bedNumber: 2
      }
    });

    // Call ViewDormitoryMembers interaction
    const result = await controller.callInteraction('ViewDormitoryMembers', {
      user: admin,
      payload: {
        dormitoryId: dormitory.id
      }
    });

    // Verify no error
    expect(result.error).toBeUndefined();

    // For now, just verify the interaction doesn't fail
    // The actual data structure returned would depend on the implementation
    // which focuses on display/query operations rather than data modification
  });
});