import { describe, test, expect, beforeEach } from 'vitest'
import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp
} from 'interaqt'
import { entities, relations, interactions, activities, dicts } from '../backend'

describe('Basic Stage 1 Tests - Core Business Logic', () => {
  let system: MonoSystem
  let controller: Controller
  
  beforeEach(async () => {
    // Create fresh system and controller for each test
    system = new MonoSystem(new PGLiteDB())
    
    controller = new Controller({
      system,
      entities,
      relations,
      interactions,
      activities,
      dict: dicts
    })

    await controller.setup(true)
  })

  test('Test current entity creation - CreateDormitory', async () => {
    // Test if the basic CreateDormitory interaction works
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const result = await controller.callInteraction('createDormitory', {
      user: admin,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })

    expect(result.error).toBeUndefined()
    
    // Verify dormitory was created
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'capacity', 'floor', 'building', 'status']
    )
    
    expect(dormitories).toHaveLength(1)
    expect(dormitories[0].name).toBe('Dorm A')
    expect(dormitories[0].capacity).toBe(4)
    expect(dormitories[0].status).toBe('active')
    
    // Verify beds were created automatically
    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status', ['dormitory', { attributeQuery: ['id', 'name'] }]]
    )
    
    expect(beds).toHaveLength(4)
    expect(beds.map(b => b.number).sort()).toEqual(['A', 'B', 'C', 'D'])
    expect(beds.every(b => b.status === 'vacant')).toBe(true)
    expect(beds.every(b => b.dormitory.id === dormitories[0].id)).toBe(true)
  })

  test('Test User.role StateMachine - AppointDormHead', async () => {
    // Create admin and student users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student',
      email: 'student@example.com',
      role: 'student'
    })

    // Create a dormitory first
    const dormResult = await controller.callInteraction('createDormitory', {
      user: admin,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })

    expect(dormResult.error).toBeUndefined()
    
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name']
    )

    // Verify student's initial role
    const initialStudent = await system.storage.findOne('User', 
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'name', 'role']
    )
    expect(initialStudent.role).toBe('student')

    // Appoint student as dormHead
    const appointResult = await controller.callInteraction('appointDormHead', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitories[0].id
      }
    })

    expect(appointResult.error).toBeUndefined()

    // Verify role changed to dormHead
    const updatedStudent = await system.storage.findOne('User', 
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'name', 'role']
    )
    expect(updatedStudent.role).toBe('dormHead')
  })

  test('Test DormitoryDormHeadRelation Transform - AppointDormHead creates relation', async () => {
    // Create admin and student users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student',
      email: 'student@example.com',
      role: 'student'
    })

    // Create a dormitory
    const dormResult = await controller.callInteraction('createDormitory', {
      user: admin,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })

    expect(dormResult.error).toBeUndefined()
    
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name']
    )

    // Appoint student as dormHead
    const appointResult = await controller.callInteraction('appointDormHead', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitories[0].id
      }
    })

    expect(appointResult.error).toBeUndefined()

    // Verify the relation was created - check dormitory has dormHead
    const dormWithHead = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitories[0].id] }),
      undefined,
      ['id', 'name', ['dormHead', { attributeQuery: ['id', 'name'] }]]
    )

    expect(dormWithHead.dormHead).toBeTruthy()
    expect(dormWithHead.dormHead.id).toBe(student.id)
    expect(dormWithHead.dormHead.name).toBe('Student')

    // Verify the relation was created - check student has managedDormitory
    const studentWithDorm = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'name', ['managedDormitory', { attributeQuery: ['id', 'name'] }]]
    )

    expect(studentWithDorm.managedDormitory).toBeTruthy()
    expect(studentWithDorm.managedDormitory.id).toBe(dormitories[0].id)
    expect(studentWithDorm.managedDormitory.name).toBe('Dorm A')
  })

  test('Test UserDormitoryRelation StateMachine - AssignUserToDormitory creates relation', async () => {
    // Create admin and student users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student',
      email: 'student@example.com',
      role: 'student'
    })

    // Create a dormitory (this also creates beds)
    const dormResult = await controller.callInteraction('createDormitory', {
      user: admin,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })

    expect(dormResult.error).toBeUndefined()
    
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name']
    )

    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', ['dormitory', { attributeQuery: ['id'] }]]
    )

    // Assign student to dormitory and bed
    const assignResult = await controller.callInteraction('assignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitories[0].id,
        bedId: beds[0].id
      }
    })

    expect(assignResult.error).toBeUndefined()

    // Verify the relation was created - check user has dormitory
    const userWithDorm = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', student.id] }),
      undefined,
      ['id', 'name', ['dormitory', { attributeQuery: ['id', 'name'] }]]
    )

    expect(userWithDorm.dormitory).toBeTruthy()
    expect(userWithDorm.dormitory.id).toBe(dormitories[0].id)
    expect(userWithDorm.dormitory.name).toBe('Dorm A')

    // Verify the relation was created - check dormitory has residents
    const dormWithResidents = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitories[0].id] }),
      undefined,
      ['id', 'name', ['residents', { attributeQuery: ['id', 'name'] }]]
    )

    expect(dormWithResidents.residents).toHaveLength(1)
    expect(dormWithResidents.residents[0].id).toBe(student.id)
    expect(dormWithResidents.residents[0].name).toBe('Student')
  })

  test('Test Bed.status StateMachine - AssignUserToDormitory changes bed status', async () => {
    // Create admin and student users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student',
      email: 'student@example.com',
      role: 'student'
    })

    // Create a dormitory (this also creates beds)
    const dormResult = await controller.callInteraction('createDormitory', {
      user: admin,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })

    expect(dormResult.error).toBeUndefined()
    
    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status']
    )

    // Verify initial bed status is 'vacant'
    expect(beds.every(b => b.status === 'vacant')).toBe(true)

    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name']
    )

    // Assign student to dormitory and bed
    const assignResult = await controller.callInteraction('assignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitories[0].id,
        bedId: beds[0].id
      }
    })

    expect(assignResult.error).toBeUndefined()

    // Verify bed status changed to 'occupied'
    const updatedBed = await system.storage.findOne('Bed',
      MatchExp.atom({ key: 'id', value: ['=', beds[0].id] }),
      undefined,
      ['id', 'number', 'status']
    )

    expect(updatedBed.status).toBe('occupied')
  })

  test('Test User.points Custom computation - starts at 100', async () => {
    // Create a user
    const user = await system.storage.create('User', {
      name: 'Student',
      email: 'student@example.com',
      role: 'student'
    })

    // Verify initial points are 100
    const foundUser = await system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', user.id] }),
      undefined,
      ['id', 'name', 'points']
    )

    expect(foundUser.points).toBe(100)
  })

  test('Test Dormitory.occupancy Count computation - counts occupied beds', async () => {
    // Create admin and student users
    const admin = await system.storage.create('User', {
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin'
    })

    const student = await system.storage.create('User', {
      name: 'Student',
      email: 'student@example.com',
      role: 'student'
    })

    // Create a dormitory (this also creates beds)
    const dormResult = await controller.callInteraction('createDormitory', {
      user: admin,
      payload: {
        name: 'Dorm A',
        capacity: 4,
        floor: 1,
        building: 'Building A'
      }
    })

    expect(dormResult.error).toBeUndefined()
    
    const dormitories = await system.storage.find('Dormitory', 
      undefined,
      undefined,
      ['id', 'name', 'capacity', 'occupancy']
    )

    // Verify initial occupancy is 0
    expect(dormitories[0].occupancy).toBe(0)

    const beds = await system.storage.find('Bed', 
      undefined,
      undefined,
      ['id', 'number', 'status']
    )

    // Assign student to dormitory and bed
    const assignResult = await controller.callInteraction('assignUserToDormitory', {
      user: admin,
      payload: {
        userId: student.id,
        dormitoryId: dormitories[0].id,
        bedId: beds[0].id
      }
    })

    expect(assignResult.error).toBeUndefined()

    // Verify occupancy increased to 1
    const updatedDormitory = await system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitories[0].id] }),
      undefined,
      ['id', 'name', 'capacity', 'occupancy']
    )

    expect(updatedDormitory.occupancy).toBe(1)
  })
  
}) 