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
    createdAt: new Date().toISOString()
  },
  {
    id: 'student001',
    name: '李四',
    role: 'student', 
    email: 'lisi@student.edu',
    studentId: 'STU20240001',
    createdAt: new Date().toISOString()
  },
  {
    id: 'student002',
    name: '王五',
    role: 'student',
    email: 'wangwu@student.edu',
    studentId: 'STU20240002', 
    createdAt: new Date().toISOString()
  },
  {
    id: 'student003',
    name: '赵六',
    role: 'student',
    email: 'zhaoliu@student.edu',
    studentId: 'STU20240003',
    createdAt: new Date().toISOString()
  },
  {
    id: 'student004',
    name: '孙七',
    role: 'student',
    email: 'sunqi@student.edu',
    studentId: 'STU20240004',
    createdAt: new Date().toISOString()
  },
  {
    id: 'student005',
    name: '周八',
    role: 'student',
    email: 'zhouba@student.edu', 
    studentId: 'STU20240005',
    createdAt: new Date().toISOString()
  }
];


// 通过 API 创建用户
async function createTestData() {

  try {
    // 创建用户
    for (const user of testUsers) {
        await controller.system.storage.create('User', user);
        console.log(`✅ Inserted user directly: ${user.name} (${user.id})`);

    }

    console.log('\n🎉 Test users creation completed!');
    console.log('\n📋 Available test users:');
    console.log('- admin001: 张管理员 (管理员)');
    console.log('- student001: 李四 (学生)');
    console.log('- student002: 王五 (学生)');
    console.log('- student003: 赵六 (学生)');
    console.log('- student004: 孙七 (学生)');
    console.log('- student005: 周八 (学生)');
    
    console.log('\n🔧 Usage in frontend:');
    console.log('Add ?userId=admin001 to URL for admin access');
    console.log('Add ?userId=student001 to URL for student access');
    console.log('\n🚀 Server is running on http://localhost:3000');
    
  } catch (error) {
    console.error('Error creating test data:', error);
  }
}

createTestData();