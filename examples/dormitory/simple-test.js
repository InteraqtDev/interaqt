// Simple test to check basic functionality
import { createDormitoryManagementSystem } from './backend/index.ts'
import { MatchExp } from 'interaqt'

async function testUserCreation() {
  console.log('Creating system...')
  const { system, controller } = await createDormitoryManagementSystem()
  
  console.log('\n=== Step 1: Call CreateUser interaction ===')
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
  
  console.log('\n=== Step 2: Query users directly ===')
  
  // Try simple query without match expression
  console.log('Querying all users...')
  const allUsers = await system.storage.find('User')
  console.log('All users found:', allUsers.length)
  if (allUsers.length > 0) {
    console.log('First user:', allUsers[0])
  }
  
  // Try query with match expression
  console.log('\nQuerying users by email...')
  const usersByEmail = await system.storage.find('User', 
    MatchExp.atom({ key: 'email', value: ['=', 'test@example.com'] }),
    undefined,
    ['id', 'name', 'email', 'role']
  )
  console.log('Users by email found:', usersByEmail.length)
  if (usersByEmail.length > 0) {
    console.log('User by email:', usersByEmail[0])
  }
}

testUserCreation().catch(console.error)