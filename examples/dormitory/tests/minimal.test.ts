import { describe, test, expect, beforeEach } from 'vitest'
import { Controller, MonoSystem, PGLiteDB } from 'interaqt'
import { entities, relations, interactions } from '../backend/minimal'

describe('Minimal Test', () => {
  let system: MonoSystem
  let controller: Controller

  beforeEach(async () => {
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
    })

    await controller.setup(true)
  })

  test('should create a user', async () => {
    const result = await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: 'Test User',
        email: 'test@example.com',
        role: 'student'
      }
    })
    
    expect(result.error).toBeUndefined()
    
    // Check if user was created by querying the storage
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    expect(users.length).toBe(1)
    
    const user = users[0]
    expect(user.name).toBe('Test User')
    expect(user.email).toBe('test@example.com')
    expect(user.role).toBe('student')
  })

  test('should create a dormitory', async () => {
    const result = await controller.callInteraction('CreateDormitory', {
      user: null,
      payload: {
        name: 'Dorm A',
        capacity: 4
      }
    })
    
    expect(result.error).toBeUndefined()
    
    // Check if dormitory was created by querying the storage
    const dorms = await system.storage.find('Dormitory', undefined, undefined, ['*'])
    expect(dorms.length).toBe(1)
    
    const dorm = dorms[0]
    expect(dorm.name).toBe('Dorm A')
    expect(dorm.capacity).toBe(4)

    // Check if beds were created automatically
    const beds = await system.storage.find('Bed', undefined, undefined, ['*'])
    expect(beds.length).toBe(4)
    expect(beds[0].bedNumber).toBe('A1')
    expect(beds[1].bedNumber).toBe('A2')
    expect(beds[2].bedNumber).toBe('A3')
    expect(beds[3].bedNumber).toBe('A4')
    expect(beds.every(bed => bed.status === 'available')).toBe(true)
  })

  test('should assign user to dormitory', async () => {
    // First create a user
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: 'Test Student',
        email: 'student@example.com',
        role: 'student'
      }
    })

    // Then create a dormitory  
    await controller.callInteraction('CreateDormitory', {
      user: null,
      payload: {
        name: 'Dorm B',
        capacity: 4
      }
    })

    // Get the created user, dormitory, and beds
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const dorms = await system.storage.find('Dormitory', undefined, undefined, ['*'])
    const beds = await system.storage.find('Bed', undefined, undefined, ['*'])
    
    const user = users[0]
    const dorm = dorms[0]
    const availableBed = beds.find(bed => bed.status === 'available')

    expect(availableBed).toBeDefined()

    // Now assign user to dormitory
    const assignResult = await controller.callInteraction('AssignUserToDormitory', {
      user: null,
      payload: {
        user: { id: user.id },
        dormitory: { id: dorm.id },
        bed: { id: availableBed.id }
      }
    })

    expect(assignResult.error).toBeUndefined()

    // Verify the relationship was created by checking if user has a dormitory assigned
    const updatedUsers = await system.storage.find('User', undefined, undefined, ['*', ['dorm', { attributeQuery: ['*'] }], ['bed', { attributeQuery: ['*'] }]])
    expect(updatedUsers.length).toBe(1)
    
    const updatedUser = updatedUsers[0]
    expect(updatedUser.dorm).toBeDefined()
    expect(updatedUser.dorm.id).toBe(dorm.id)
    expect(updatedUser.bed).toBeDefined()
    expect(updatedUser.bed.id).toBe(availableBed.id)
  })

  test('should record violation', async () => {
    // First create a user
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: 'Violating Student',
        email: 'violator@example.com',
        role: 'student'
      }
    })

    // Get the created user
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const user = users[0]

    // Record a violation
    const violationResult = await controller.callInteraction('RecordViolation', {
      user: null,
      payload: {
        violator: { id: user.id },
        violationType: 'noise_complaint',
        description: 'Playing loud music after quiet hours',
        scoreDeducted: 5
      }
    })

    expect(violationResult.error).toBeUndefined()

    // Check if violation record was created
    const violations = await system.storage.find('ViolationRecord', undefined, undefined, ['*'])
    expect(violations.length).toBe(1)
    
    const violation = violations[0]
    expect(violation.violationType).toBe('noise_complaint')
    expect(violation.description).toBe('Playing loud music after quiet hours')
    expect(violation.scoreDeducted).toBe(5)
    expect(violation.recordedAt).toBeDefined()

    // Verify the connection by checking the violatorId matches the user ID
    expect(violation.violatorId).toBe(user.id)
  })

  test('should create kickout request', async () => {
    // First create a target user (the user to be kicked out)
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: 'Target Student',
        email: 'target@example.com',
        role: 'student'
      }
    })

    // Create a requestor (dormHead or admin)
    await controller.callInteraction('CreateUser', {
      user: null,
      payload: {
        name: 'Dorm Head',
        email: 'dormhead@example.com',
        role: 'dormHead'
      }
    })

    // Get the created users
    const users = await system.storage.find('User', undefined, undefined, ['*'])
    const targetUser = users.find(u => u.email === 'target@example.com')
    const requestor = users.find(u => u.email === 'dormhead@example.com')

    // Create a kickout request
    const requestResult = await controller.callInteraction('CreateKickoutRequest', {
      user: requestor, // Use the requestor as the user
      payload: {
        targetUser: { id: targetUser.id },
        reason: 'Multiple violations and behavioral issues'
      }
    })

    expect(requestResult.error).toBeUndefined()

    // Check if kickout request was created
    const requests = await system.storage.find('KickoutRequest', undefined, undefined, ['*'])
    expect(requests.length).toBe(1)
    
    const request = requests[0]
    expect(request.reason).toBe('Multiple violations and behavioral issues')
    expect(request.status).toBe('pending')
    expect(request.targetUserId).toBe(targetUser.id)
    expect(request.requestorId).toBe(requestor.id)
    expect(request.requestedAt).toBeDefined()
  })

})