import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB, MatchExp } from 'interaqt'
import { entities, relations, interactions } from '../backend'

describe('Debug Basic Tests', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      activities: [],
      interactions,
      dict: [],
      recordMutationSideEffects: []
    })

    await controller.setup(true)
  })

  test('should create user via storage', async () => {
    const user = await system.storage.create('User', {
      name: 'Test User',
      email: 'test@example.com',
      role: 'admin'
    })

    expect(user).toBeTruthy()
    expect(user.name).toBe('Test User')
    expect(user.role).toBe('admin')
    console.log('Created user:', user)
  })

  test('should create dormitory via interaction', async () => {
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    console.log('Created admin:', admin)

    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: '测试宿舍',
        capacity: 4
      }
    })

    console.log('Interaction result:', result)
    expect(result.error).toBeUndefined()

    // Check if dormitory was created
    const dormitories = await system.storage.find('Dormitory', 
      MatchExp.atom({ key: 'name', value: ['=', '测试宿舍'] }),
      undefined,
      ['*']
    )
    
    console.log('Found dormitories:', dormitories)
    expect(dormitories).toHaveLength(1)

    // Check if beds were created  
    const beds = await system.storage.find('Bed', 
      MatchExp.atom({ key: 'number', value: ['>', 0] }),
      undefined,
      ['*']
    )
    
    console.log('Found beds:', beds)
    console.log('Expected 4 beds, got:', beds.length)
  })
})