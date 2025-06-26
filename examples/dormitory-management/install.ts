import { startServer } from "./server";
import { Controller, MonoSystem, KlassByName, PGLiteDB } from 'interaqt';
import { entities, relations, interactions, activities } from './src/index.js';

const system = new MonoSystem(new PGLiteDB('pgdata'));
system.conceptClass = KlassByName;

const controller = new Controller(system, entities, relations, activities, interactions, [], []);
await controller.setup(true);

// 创建测试用户
console.log('Creating test users...');

const testUsers = [
  {
    id: 'admin001',
    name: '张管理员',
    role: 'admin',
    email: 'admin@university.edu',
    studentId: 'ADMIN001',
  },
  {
    id: 'student001',
    name: '李四',
    role: 'student', 
    email: 'lisi@student.edu',
    studentId: 'STU20240001',
  },
  {
    id: 'student002',
    name: '王五',
    role: 'student',
    email: 'wangwu@student.edu',
    studentId: 'STU20240002', 
  },
  {
    id: 'student003',
    name: '赵六',
    role: 'student',
    email: 'zhaoliu@student.edu',
    studentId: 'STU20240003',
  },
  {
    id: 'student004',
    name: '孙七',
    role: 'student',
    email: 'sunqi@student.edu',
    studentId: 'STU20240004',
  },
  {
    id: 'student005',
    name: '周八',
    role: 'student',
    email: 'zhouba@student.edu', 
    studentId: 'STU20240005',
  }
];


// 创建测试宿舍数据
const testDormitories = [
  {
    id: 'dorm001',
    name: '梅园1号楼101',
    building: '梅园1号楼',
    roomNumber: '101',
    capacity: 4,
    description: '朝南房间，阳光充足，设施齐全',
  },
  {
    id: 'dorm002', 
    name: '梅园1号楼102',
    building: '梅园1号楼',
    roomNumber: '102',
    capacity: 4,
    description: '安静环境，适合学习',
  },
  {
    id: 'dorm003',
    name: '桂园2号楼201',
    building: '桂园2号楼', 
    roomNumber: '201',
    capacity: 6,
    description: '宽敞明亮，6人间配置',
  }
];

// 先不创建宿舍成员，等关系创建后再通过交互创建
// const testDormitoryMembers = [];

// 申请数据也需要等关系创建后再创建
// const testApplications = [];

// 积分记录也等待成员关系创建后再创建
// const testScoreRecords = [];

// 通过 API 创建完整测试数据
async function createTestData() {
  try {
    console.log('🚀 Starting comprehensive test data creation...');
    
    // 1. 创建用户
    console.log('\n👥 Creating users...');
    for (const user of testUsers) {
      await controller.system.storage.create('User', user);
      console.log(`✅ Created user: ${user.name} (${user.id})`);
    }

    // 2. 创建宿舍
    console.log('\n🏠 Creating dormitories...');
    for (const dormitory of testDormitories) {
      await controller.system.storage.create('Dormitory', dormitory);
      console.log(`✅ Created dormitory: ${dormitory.name}`);
    }

    // 3. 暂时不创建复杂关系数据，等待前端通过交互来创建
    console.log('\n📝 Basic data creation completed!');
    console.log('🚀 Use the frontend to create memberships, applications, and scores through interactions.');

    // 打印完整的测试场景说明
    console.log('\n🎉 Complete test data creation finished!');
    console.log('\n📊 Test Data Summary:');
    console.log(`- Users: ${testUsers.length} (1 admin, ${testUsers.length - 1} students)`);
    console.log(`- Dormitories: ${testDormitories.length}`);
    console.log('- Memberships, applications, and scores: Create via frontend interactions');
    
    console.log('\n📋 Available test users:');
    console.log('- admin001: 张管理员 (管理员)');
    console.log('- student001: 李四 (学生, 梅园1号楼101宿舍长)');
    console.log('- student002: 王五 (学生, 梅园1号楼101成员)');
    console.log('- student003: 赵六 (学生, 有待处理申请)');
    console.log('- student004: 孙七 (学生, 申请已被宿舍长批准)');
    console.log('- student005: 周八 (学生, 无宿舍)');
    
    console.log('\n🏠 Available dormitories:');
    console.log('- dorm001: 梅园1号楼101 (有宿舍长和1个成员)');
    console.log('- dorm002: 梅园1号楼102 (空宿舍, 有待处理申请)');
    console.log('- dorm003: 桂园2号楼201 (空宿舍)');
    
    console.log('\n🔧 Frontend usage:');
    console.log('管理员视图: http://localhost:5173/?userId=admin001');
    console.log('宿舍长视图: http://localhost:5173/?userId=student001');
    console.log('普通成员视图: http://localhost:5173/?userId=student002');
    console.log('有申请的学生: http://localhost:5173/?userId=student003');
    console.log('申请已批准的学生: http://localhost:5173/?userId=student004');
    console.log('无宿舍的学生: http://localhost:5173/?userId=student005');
    
    console.log('\n🚀 Server is running on http://localhost:3000');
    
  } catch (error) {
    console.error('❌ Error creating test data:', error);
    throw error;
  }
}

// 创建数据并启动服务器
createTestData()