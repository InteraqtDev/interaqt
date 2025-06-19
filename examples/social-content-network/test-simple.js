import { MonoSystem, Controller, removeAllInstance } from '@/index.js'
import { User, Post, Tag, Category } from './src/entities.js'
import { relations } from './src/relations.js'

async function testSimple() {
  console.log('Starting simple test...')
  
  // 清理所有单例实例
  removeAllInstance()
  
  const entities = [User, Post, Tag, Category]
  
  // 创建系统
  const system = new MonoSystem()
  
  // 创建控制器 - 只传入基本参数
  const controller = new Controller(
    system,
    entities,
    relations, 
    [], // activities
    [], // interactions 
    [], // dicts
    []  // 外部同步器
  )
  
  try {
    // 设置数据库
    await controller.setup(true)
    console.log('Setup successful!')
    
    // 创建一个简单的用户
    const user = await system.storage.create('User', {
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User'
    })
    
    console.log('Created user:', user)
    console.log('User properties:', Object.keys(user))
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await system.destroy()
  }
}

testSimple().catch(console.error)