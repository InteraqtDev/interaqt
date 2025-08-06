// Simple debug script to test basic functionality
import { createDormitoryManagementSystem } from './backend/index.ts'

async function testBasicFunctionality() {
  console.log('Creating system...')
  const { system, controller } = await createDormitoryManagementSystem()
  
  console.log('Calling CreateUser interaction...')
  const result = await controller.callInteraction('CreateUser', {
    user: { id: 'system' },
    payload: {
      name: '测试用户',
      email: 'test@example.com',
      phone: '13800138000',
      role: 'student'
    }
  })
  
  console.log('Interaction result:', result)
  
  console.log('Querying users...')
  const users = await system.storage.find('User')
  console.log('Found users:', users.length)
  console.log('Users:', users)
  
  // Try different query
  const usersByEmail = await system.storage.find('User', undefined, undefined, ['name', 'email', 'role'])
  console.log('Users by email query:', usersByEmail)
}

testBasicFunctionality().catch(console.error)