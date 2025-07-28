import { describe, test, expect, beforeEach } from 'vitest'
import { 
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB, MatchExp
} from 'interaqt'
import {
  entities, relations, interactions, activities, dicts, recordMutationSideEffects
} from '../backend/index.js'

describe('Debug Basic Issues', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      activities,
      dict: dicts,
      recordMutationSideEffects
    })

    await controller.setup(true)
  })

  test('should check actual relation names', async () => {
    // Get all relation names
    console.log('Available relations:', relations.map(r => r.name))
    
    // Try to see what entities are registered
    console.log('Available entities:', entities.map(e => e.name))
  })

  test('should create dormitory through interaction', async () => {
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    console.log('Created admin:', admin)

    const result = await controller.callInteraction('CreateDormitory', {
      user: admin,
      payload: {
        name: 'Test Dorm',
        capacity: 4
      }
    })

    console.log('Interaction result:', result)
    
    if (result.error) {
      console.log('Error details:', result.error)
    }

    // Check if dormitory was created
    const dormitories = await system.storage.find('Dormitory', 
      undefined, 
      undefined, 
      ['*']
    )
    console.log('Dormitories found:', dormitories)

    // Check if beds were created
    const beds = await system.storage.find('Bed', 
      undefined, 
      undefined, 
      ['*']
    )
    console.log('Beds found:', beds)
    
    // Check interaction events
    const interactions = await system.storage.find('_Interaction_', 
      undefined, 
      undefined, 
      ['*']
    )
    console.log('Interaction events:', interactions)
  })

  test('should test direct entity creation', async () => {
    // Test direct entity creation to see if the problem is with Transform or storage
    const directDormitory = await system.storage.create('Dormitory', {
      name: 'Direct Dorm',
      capacity: 6
    })
    
    console.log('Direct dormitory creation:', directDormitory)
    
    const directBed = await system.storage.create('Bed', {
      bedNumber: 1
    })
    
    console.log('Direct bed creation:', directBed)
  })
})