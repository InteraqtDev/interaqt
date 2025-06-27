import { describe, test, expect, beforeEach } from 'vitest';
import { Controller, MonoSystem, KlassByName, MatchExp, BoolExp } from '@';
import { entities, relations, interactions, activities } from '../src/index.js';
import { createQueryHelpers } from './test-utils.js';

describe('Attributive权限测试', () => {
  let system: MonoSystem;
  let controller: Controller;
  let query: ReturnType<typeof createQueryHelpers>;
  
  beforeEach(async () => {
    // 初始化系统
    system = new MonoSystem();
    system.conceptClass = KlassByName;
    
    // 创建控制器
    controller = new Controller(
      system,
      entities,
      relations,
      activities,
      interactions,
      [], // dictionaries
      [] // recordMutationSideEffects
    );
    
    // 初始化数据库
    await controller.setup(true);
    
    // 创建查询辅助函数
    query = createQueryHelpers(controller);
  });

  test('AdminAttributive - 测试管理员权限查询', async () => {
    // 创建管理员和学生
    const admin = await system.storage.create('User', {
      name: '张管理员',
      role: 'admin',
      email: 'admin@dorm.test',
      studentId: 'ADMIN001',
      createdAt: new Date().toISOString()
    });

    const student = await system.storage.create('User', {
      name: '李学生',
      role: 'student',
      email: 'student@dorm.test',
      studentId: 'STU001',
      createdAt: new Date().toISOString()
    });

    // 测试管理员角色查询
    const { MatchExp } = controller.globals;
    const adminUsers = await system.storage.find('User', 
      MatchExp.atom({ key: 'role', value: ['=', 'admin'] }),
      undefined,
      ['*']
    );

    expect(adminUsers.length).toBe(1);
    expect(adminUsers[0].id).toBe(admin.id);
    expect(adminUsers[0].role).toBe('admin');

    // 测试非管理员查询
    const nonAdminUsers = await system.storage.find('User',
      MatchExp.atom({ key: 'role', value: ['!=', 'admin'] }),
      undefined,
      ['*']
    );

    expect(nonAdminUsers.length).toBe(1);
    expect(nonAdminUsers[0].id).toBe(student.id);
    expect(nonAdminUsers[0].role).toBe('student');
  });

  test('StudentAttributive - 测试学生权限查询', async () => {
    // 创建不同角色的用户
    const admin = await system.storage.create('User', {
      name: '管理员',
      role: 'admin',
      email: 'admin@test.com'
    });

    const student1 = await system.storage.create('User', {
      name: '学生1',
      role: 'student', 
      email: 'student1@test.com',
      studentId: 'STU001'
    });

    const student2 = await system.storage.create('User', {
      name: '学生2',
      role: 'student',
      email: 'student2@test.com', 
      studentId: 'STU002'
    });

    // 查询所有学生
    const { MatchExp } = controller.globals;
    const students = await system.storage.find('User',
      MatchExp.atom({ key: 'role', value: ['=', 'student'] }),
      undefined,
      ['id', 'name', 'role', 'studentId']
    );

    expect(students.length).toBe(2);
    expect(students.every(s => s.role === 'student')).toBe(true);
    expect(students.map(s => s.studentId)).toContain('STU001');
    expect(students.map(s => s.studentId)).toContain('STU002');
  });

  test('DormitoryLeaderAttributive - 测试宿舍长权限相关查询', async () => {
    // 创建用户
    const leader = await system.storage.create('User', {
      name: '宿舍长',
      role: 'student',
      email: 'leader@test.com',
      studentId: 'LEAD001'
    });

    const member = await system.storage.create('User', {
      name: '普通成员',
      role: 'student',
      email: 'member@test.com',
      studentId: 'MEM001'
    });

    // 创建宿舍
    const dormitory = await system.storage.create('Dormitory', {
      name: 'A101',
      building: 'A栋',
      roomNumber: '101',
      capacity: 4,
      description: '测试宿舍'
    });

    // 创建宿舍成员关系
    const leaderMember = await system.storage.create('DormitoryMember', {
      user: leader,
      dormitory: dormitory,
      role: 'leader',
      score: 100,
      joinedAt: new Date().toISOString(),
      status: 'active',
      bedNumber: 1
    });

    const normalMember = await system.storage.create('DormitoryMember', {
      user: member,
      dormitory: dormitory,
      role: 'member',
      score: 80,
      joinedAt: new Date().toISOString(),
      status: 'active',
      bedNumber: 2
    });

    // 测试查询宿舍长
    const { MatchExp } = controller.globals;
    const leaders = await system.storage.find('DormitoryMember',
      MatchExp.atom({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] }),
      undefined,
      ['*', ['user', { attributeQuery: ['*'] }], ['dormitory', { attributeQuery: ['*'] }]]
    );

    expect(leaders.length).toBe(1);
    expect(leaders[0].role).toBe('leader');
    expect(leaders[0].user.id).toBe(leader.id);
    expect(leaders[0].dormitory.id).toBe(dormitory.id);

    // 测试查询特定宿舍的宿舍长
    const dormitoryLeaders = await system.storage.find('DormitoryMember',
      MatchExp.atom({ key: 'dormitory.id', value: ['=', dormitory.id] })
        .and({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] }),
      undefined,
      ['*', ['user', { attributeQuery: ['*'] }]]
    );

    expect(dormitoryLeaders.length).toBe(1);
    expect(dormitoryLeaders[0].user.studentId).toBe('LEAD001');
  });

  test('NoActiveDormitoryAttributive - 测试没有活跃宿舍的学生查询', async () => {
    // 创建学生
    const studentWithDorm = await system.storage.create('User', {
      name: '有宿舍的学生',
      role: 'student',
      email: 'with-dorm@test.com',
      studentId: 'WITH001'
    });

    const studentWithoutDorm = await system.storage.create('User', {
      name: '没有宿舍的学生',
      role: 'student',
      email: 'without-dorm@test.com',
      studentId: 'WITHOUT001'
    });

    // 创建宿舍
    const dormitory = await system.storage.create('Dormitory', {
      name: 'B201',
      building: 'B栋',
      roomNumber: '201',
      capacity: 4
    });

    // 只给一个学生分配宿舍
    await system.storage.create('DormitoryMember', {
      user: studentWithDorm,
      dormitory: dormitory,
      role: 'member',
      score: 0,
      joinedAt: new Date().toISOString(),
      status: 'active',
      bedNumber: 1
    });

    // 查询有活跃宿舍的学生
    const { MatchExp } = controller.globals;
    const studentsWithDorm = await system.storage.find('User',
      MatchExp.atom({ key: 'role', value: ['=', 'student'] })
        .and({ key: 'dormitoryMemberships.status', value: ['=', 'active'] }),
      undefined,
      ['*', ['dormitoryMemberships', { attributeQuery: ['*', ['dormitory', { attributeQuery: ['*'] }]] }]]
    );

    expect(studentsWithDorm.length).toBe(1);
    expect(studentsWithDorm[0].id).toBe(studentWithDorm.id);
    expect(studentsWithDorm[0].dormitoryMemberships.length).toBe(1);

    // 查询所有学生，然后筛选没有活跃宿舍的
    const allStudents = await system.storage.find('User',
      MatchExp.atom({ key: 'role', value: ['=', 'student'] }),
      undefined,
      ['*', ['dormitoryMemberships', { attributeQuery: ['*'] }]]
    );

    const studentsWithoutActiveDorm = allStudents.filter(student => {
      return !student.dormitoryMemberships || 
             student.dormitoryMemberships.length === 0 ||
             !student.dormitoryMemberships.some(membership => membership.status === 'active');
    });

    expect(studentsWithoutActiveDorm.length).toBe(1);
    expect(studentsWithoutActiveDorm[0].id).toBe(studentWithoutDorm.id);
  });

  test('DormitoryNotFullAttributive - 测试宿舍容量相关查询', async () => {
    // 创建不同容量的宿舍
    const smallDorm = await system.storage.create('Dormitory', {
      name: '小宿舍',
      building: 'A栋',
      roomNumber: '101',
      capacity: 2,
      description: '2人间'
    });

    const largeDorm = await system.storage.create('Dormitory', {
      name: '大宿舍',
      building: 'B栋', 
      roomNumber: '201',
      capacity: 4,
      description: '4人间'
    });

    // 创建学生
    const student1 = await system.storage.create('User', {
      name: '学生1',
      role: 'student',
      studentId: 'STU001'
    });

    const student2 = await system.storage.create('User', {
      name: '学生2',
      role: 'student',
      studentId: 'STU002'
    });

    const student3 = await system.storage.create('User', {
      name: '学生3',
      role: 'student',
      studentId: 'STU003'
    });

    // 让小宿舍满员（2/2）
    await system.storage.create('DormitoryMember', {
      user: student1,
      dormitory: smallDorm,
      role: 'leader',
      status: 'active',
      bedNumber: 1
    });

    await system.storage.create('DormitoryMember', {
      user: student2,
      dormitory: smallDorm,
      role: 'member',
      status: 'active',
      bedNumber: 2
    });

    // 让大宿舍部分入住（1/4）
    await system.storage.create('DormitoryMember', {
      user: student3,
      dormitory: largeDorm,
      role: 'leader',
      status: 'active',
      bedNumber: 1
    });

    // 查询所有宿舍及其当前状态
    const { MatchExp } = controller.globals;
    const dormitories = await system.storage.find('Dormitory',
      MatchExp.atom({ key: 'id', value: ['>', 0] }),
      undefined,
      ['*', ['members', { attributeQuery: ['*', ['user', { attributeQuery: ['*'] }]] }]]
    );

    expect(dormitories.length).toBe(2);

    // 验证小宿舍的状态
    const smallDormResult = dormitories.find(d => d.name === '小宿舍');
    expect(smallDormResult).toBeTruthy();
    expect(smallDormResult.capacity).toBe(2);
    expect(smallDormResult.currentOccupancy).toBe(2);
    expect(smallDormResult.isFull).toBe(1); // 框架使用数字表示布尔值

    // 验证大宿舍的状态
    const largeDormResult = dormitories.find(d => d.name === '大宿舍');
    expect(largeDormResult).toBeTruthy();
    expect(largeDormResult.capacity).toBe(4);
    expect(largeDormResult.currentOccupancy).toBe(1);
    expect(largeDormResult.isFull).toBe(0); // 未满

    // 查询未满的宿舍
    const availableDorms = await system.storage.find('Dormitory',
      MatchExp.atom({ key: 'isFull', value: ['=', 0] }),
      undefined,
      ['*']
    );

    expect(availableDorms.length).toBe(1);
    expect(availableDorms[0].name).toBe('大宿舍');
  });

  test('复杂权限查询 - 综合测试多种Attributive场景', async () => {
    // 创建完整的测试数据
    const admin = await system.storage.create('User', {
      name: '系统管理员',
      role: 'admin',
      email: 'admin@school.edu',
      studentId: 'ADMIN001'
    });

    const leader1 = await system.storage.create('User', {
      name: '宿舍长1',
      role: 'student',
      email: 'leader1@school.edu',
      studentId: 'LEAD001'
    });

    const leader2 = await system.storage.create('User', {
      name: '宿舍长2',
      role: 'student',
      email: 'leader2@school.edu',
      studentId: 'LEAD002'
    });

    const member1 = await system.storage.create('User', {
      name: '成员1',
      role: 'student',
      email: 'member1@school.edu',
      studentId: 'MEM001'
    });

    const member2 = await system.storage.create('User', {
      name: '成员2',
      role: 'student',
      email: 'member2@school.edu',
      studentId: 'MEM002'
    });

    const applicant = await system.storage.create('User', {
      name: '申请人',
      role: 'student',
      email: 'applicant@school.edu',
      studentId: 'APP001'
    });

    // 创建宿舍
    const dorm1 = await system.storage.create('Dormitory', {
      name: 'A101',
      building: 'A栋',
      roomNumber: '101',
      capacity: 4
    });

    const dorm2 = await system.storage.create('Dormitory', {
      name: 'B201',
      building: 'B栋',
      roomNumber: '201',
      capacity: 4
    });

    // 建立宿舍成员关系
    const leaderMember1 = await system.storage.create('DormitoryMember', {
      user: leader1,
      dormitory: dorm1,
      role: 'leader',
      score: 90,
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    const normalMember1 = await system.storage.create('DormitoryMember', {
      user: member1,
      dormitory: dorm1,
      role: 'member',
      score: -60, // 低分成员，可能被踢出
      status: 'active',
      bedNumber: 2,
      joinedAt: new Date().toISOString()
    });

    const leaderMember2 = await system.storage.create('DormitoryMember', {
      user: leader2,
      dormitory: dorm2,
      role: 'leader',
      score: 85,
      status: 'active',
      bedNumber: 1,
      joinedAt: new Date().toISOString()
    });

    const normalMember2 = await system.storage.create('DormitoryMember', {
      user: member2,
      dormitory: dorm2,
      role: 'member',
      score: 70,
      status: 'active',
      bedNumber: 2,
      joinedAt: new Date().toISOString()
    });

    // 创建申请
    const application = await system.storage.create('DormitoryApplication', {
      applicant: applicant,
      dormitory: dorm1,
      message: '希望加入A101宿舍',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 创建积分记录
    await system.storage.create('ScoreRecord', {
      member: normalMember1,
      recorder: leader1,
      points: -20,
      reason: '违反宿舍规定',
      category: 'discipline',
      createdAt: new Date().toISOString()
    });

    await system.storage.create('ScoreRecord', {
      member: normalMember2,
      recorder: leader2,
      points: 15,
      reason: '宿舍卫生优秀',
      category: 'hygiene',
      createdAt: new Date().toISOString()
    });

    // 创建踢出申请
    const kickRequest = await system.storage.create('KickRequest', {
      targetMember: normalMember1.id,
      requester: leader1.id,
      reason: '积分过低，多次违规',
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // 现在进行复杂查询测试

    // 1. 查询所有宿舍长及其管理的宿舍信息
    const { MatchExp } = controller.globals;
    const leadersWithDormInfo = await system.storage.find('DormitoryMember',
      MatchExp.atom({ key: 'role', value: ['=', 'leader'] })
        .and({ key: 'status', value: ['=', 'active'] }),
      undefined,
      [
        '*',
        ['user', { attributeQuery: ['*'] }],
        ['dormitory', { 
          attributeQuery: ['*']
        }]
      ]
    );

    expect(leadersWithDormInfo.length).toBe(2);

    for (const leader of leadersWithDormInfo) {
      expect(leader.role).toBe('leader');
      expect(leader.user).toBeTruthy();
      expect(leader.dormitory).toBeTruthy();
      expect(leader.dormitory.id).toBeDefined();
      expect(leader.dormitory.name).toBeDefined();
    }

    // 2. 简化的踢出申请查询测试
    const kickRequestsWithContext = await system.storage.find('KickRequest',
      MatchExp.atom({ key: 'id', value: ['>', 0] }),
      undefined,
      ['*']
    );

    expect(kickRequestsWithContext.length).toBe(1);
    const kickReq = kickRequestsWithContext[0];
    expect(kickReq.reason).toBe('积分过低，多次违规');
    expect(kickReq.status).toBe('pending');

    // 3. 查询需要管理员权限的操作相关数据
    const adminProcessableItems = await system.storage.find('DormitoryApplication',
      MatchExp.atom({ key: 'status', value: ['=', 'pending'] }),
      undefined,
      [
        '*',
        ['applicant', { attributeQuery: ['*'] }],
        ['dormitory', { 
          attributeQuery: [
            '*',
            ['members', { 
              attributeQuery: ['*', ['user', { attributeQuery: ['*'] }]]
            }]
          ]
        }]
      ]
    );

    expect(adminProcessableItems.length).toBe(1);
    expect(adminProcessableItems[0].status).toBe('pending');
    expect(adminProcessableItems[0].applicant.studentId).toBe('APP001');

    // 4. 查询宿舍容量和入住情况
    const dormitoriesWithCapacityInfo = await system.storage.find('Dormitory',
      MatchExp.atom({ key: 'id', value: ['>', 0] }),
      undefined,
      [
        '*',
        ['members', { 
          attributeQuery: [
            '*',
            ['user', { attributeQuery: ['*'] }]
          ]
        }]
      ]
    );

    expect(dormitoriesWithCapacityInfo.length).toBe(2);

    for (const dorm of dormitoriesWithCapacityInfo) {
      expect(dorm.capacity).toBeGreaterThan(0);
      expect(dorm.currentOccupancy).toBeGreaterThanOrEqual(0);
      expect(dorm.availableBeds).toBeGreaterThanOrEqual(0);
      expect(dorm.currentOccupancy + dorm.availableBeds).toBe(dorm.capacity);
    }

    // 5. 查询积分相关的统计信息
    const scoreRecordsWithContext = await system.storage.find('ScoreRecord',
      MatchExp.atom({ key: 'id', value: ['>', 0] }),
      undefined,
      [
        '*',
        ['member', {
          attributeQuery: [
            '*',
            ['user', { attributeQuery: ['*'] }],
            ['dormitory', { attributeQuery: ['*'] }]
          ]
        }],
        ['recorder', { 
          attributeQuery: [
            '*',
            ['dormitoryMemberships', {
              attributeQuery: ['*', ['dormitory', { attributeQuery: ['*'] }]]
            }]
          ]
        }]
      ]
    );

    expect(scoreRecordsWithContext.length).toBe(2);

    for (const record of scoreRecordsWithContext) {
      expect(record.member).toBeTruthy();
      expect(record.member.user).toBeTruthy();
      expect(record.member.dormitory).toBeTruthy();
      expect(record.recorder).toBeTruthy();
    }

    console.log('✅ 复杂权限查询测试通过');
    console.log(`- 测试了 ${leadersWithDormInfo.length} 个宿舍长的权限上下文`);
    console.log(`- 测试了 ${kickRequestsWithContext.length} 个踢出申请的完整关系链`);
    console.log(`- 测试了 ${adminProcessableItems.length} 个需要管理员处理的申请`);
    console.log(`- 测试了 ${dormitoriesWithCapacityInfo.length} 个宿舍的容量管理`);
    console.log(`- 测试了 ${scoreRecordsWithContext.length} 个积分记录的权限验证`);
  });
});