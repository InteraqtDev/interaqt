// Debug query structure
import { createDormitoryManagementSystem } from './backend/index.ts'
import { MatchExp } from 'interaqt'

async function debugQuery() {
  console.log('Creating system...')
  const { system, controller } = await createDormitoryManagementSystem()
  
  console.log('\n=== Create User ===')
  const userData = {
    name: '张三',
    email: 'zhangsan@example.com',
    phone: '13800138000',
    role: 'student'
  }
  
  const result = await controller.callInteraction('CreateUser', {
    user: { id: 'system' },
    payload: userData
  })
  
  console.log('Interaction result error:', result.error)
  
  console.log('\n=== Query with exact test parameters ===')
  const users = await system.storage.find('User',
    MatchExp.atom({ key: 'email', value: ['=', userData.email] }),
    undefined,
    ['id', 'name', 'email', 'phone', 'role', 'status', 'createdAt']
  )
  
  console.log('users.length:', users.length)
  console.log('users:', JSON.stringify(users, null, 2))
  
  if (users.length > 0) {
    const user = users[0]
    console.log('\n=== User properties validation ===')
    console.log('user.name:', user.name, '=== userData.name:', userData.name)
    console.log('user.email:', user.email, '=== userData.email:', userData.email)
    console.log('user.phone:', user.phone, '=== userData.phone:', userData.phone)
    console.log('user.role:', user.role, '=== userData.role:', userData.role)
    console.log('user.status:', user.status, '(should be "active")')
    console.log('user.createdAt:', user.createdAt, '(should be > 0)')
  }
}

debugQuery().catch(console.error)