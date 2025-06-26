import { describe, test, beforeEach, afterEach, expect } from 'vitest'
import { DBSetup, EntityToTableMap, EntityQueryHandle, MatchExp, AttributeQueryData } from "@storage"
import { PGLiteDB, SQLiteDB } from '@runtime'
import TestLogger from "./testLogger.js"
import { Entity, Property, Relation } from '@'

// Define entities directly in test file
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string'
    }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'student' // student, admin
    }),
    Property.create({ 
      name: 'email', 
      type: 'string'
    }),
    Property.create({ 
      name: 'studentId', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string'
    })
  ]
});

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string'
    }),
    Property.create({ 
      name: 'building', 
      type: 'string'
    }),
    Property.create({ 
      name: 'roomNumber', 
      type: 'string'
    }),
    Property.create({ 
      name: 'capacity', 
      type: 'number'
    }),
    Property.create({ 
      name: 'description', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string'
    })
  ]
});

const DormitoryMember = Entity.create({
  name: 'DormitoryMember',
  properties: [
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'member' // leader, member
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'joinedAt', 
      type: 'string'
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active' // active, kicked
    }),
    Property.create({ 
      name: 'bedNumber', 
      type: 'number'
    })
  ]
});

const KickRequest = Entity.create({
  name: 'KickRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string'
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending' // pending, approved, rejected
    }),
    Property.create({ 
      name: 'adminComment', 
      type: 'string'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string'
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'string'
    })
  ]
});

// Define relations directly in test file
const UserDormitoryMember = Relation.create({
  source: DormitoryMember,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'dormitoryMemberships',
  type: 'n:1'
});

const DormitoryDormitoryMember = Relation.create({
  source: DormitoryMember,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'members',
  type: 'n:1'
});

const DormitoryMemberKickRequest = Relation.create({
  source: KickRequest,
  sourceProperty: 'targetMember',
  target: DormitoryMember,
  targetProperty: 'kickRequests',
  type: 'n:1'
});

const UserKickRequest = Relation.create({
  source: KickRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'initiatedKickRequests',
  type: 'n:1'
});

const UserProcessedKickRequest = Relation.create({
  source: KickRequest,
  sourceProperty: 'processor',
  target: User,
  targetProperty: 'processedKickRequests',
  type: 'n:1'
});

// FIXME 因为 as 标识符有 63 个字符限制，现在有的表长度超出了。
describe.skip('KickRequest Storage Bug Test', () => {
  let db: PGLiteDB
  let handle: EntityQueryHandle
  let setup: DBSetup
  let logger: TestLogger

  const createTestData = () => {
    const entities = [
      User,
      KickRequest, 
      DormitoryMember,
      Dormitory
    ]

    const relations = [
      UserKickRequest,
      UserProcessedKickRequest, 
      DormitoryMemberKickRequest,
      UserDormitoryMember,
      DormitoryDormitoryMember
    ]

    return { entities, relations }
  }

  beforeEach(async () => {
    const { entities, relations } = createTestData()
    logger = new TestLogger('', false)
    
    db = new PGLiteDB()
    await db.open()
    
    setup = new DBSetup(entities, relations, db)
    await setup.createTables()
    
    handle = new EntityQueryHandle(new EntityToTableMap(setup.map), db)
  })

  afterEach(async () => {
    await db.close()
  })

  test('should query KickRequest with all User-related relation data', async () => {
    // Create test users
    const adminUser = await handle.create('User', {
      name: 'Admin User',
      role: 'admin',
      email: 'admin@test.com',
      studentId: 'ADMIN001',
      createdAt: '2024-01-01T00:00:00Z'
    })

    const requesterUser = await handle.create('User', {
      name: 'Requester User', 
      role: 'student',
      email: 'requester@test.com',
      studentId: 'STU001',
      createdAt: '2024-01-01T00:00:00Z'
    })

    const targetUser = await handle.create('User', {
      name: 'Target User',
      role: 'student', 
      email: 'target@test.com',
      studentId: 'STU002',
      createdAt: '2024-01-01T00:00:00Z'
    })

    // Create dormitory
    const dormitory = await handle.create('Dormitory', {
      name: 'Test Dormitory',
      building: 'Building A',
      roomNumber: '101',
      capacity: 4,
      description: 'Test dormitory',
      createdAt: '2024-01-01T00:00:00Z'
    })

    // Create dormitory members
    const requesterMember = await handle.create('DormitoryMember', {
      role: 'leader',
      score: 100,
      joinedAt: '2024-01-01T00:00:00Z',
      status: 'active',
      bedNumber: 1
    })

    const targetMember = await handle.create('DormitoryMember', {
      role: 'member',
      score: -60,
      joinedAt: '2024-01-01T00:00:00Z', 
      status: 'active',
      bedNumber: 2
    })

    // Create relations between users and dormitory members
    await handle.addRelationById('DormitoryMember', 'user', requesterMember.id, requesterUser.id)
    await handle.addRelationById('DormitoryMember', 'user', targetMember.id, targetUser.id)

    // Create relations between dormitory and members
    await handle.addRelationById('DormitoryMember', 'dormitory', requesterMember.id, dormitory.id)
    await handle.addRelationById('DormitoryMember', 'dormitory', targetMember.id, dormitory.id)

    // Create kick request
    const kickRequest = await handle.create('KickRequest', {
      reason: 'Poor behavior and low score',
      status: 'approved',
      adminComment: 'Approved by admin',
      createdAt: '2024-01-02T00:00:00Z',
      processedAt: '2024-01-02T12:00:00Z'
    })

    const k1 = await handle.find('KickRequest', undefined, undefined, ['*'])

    // Create kick request relations
    // await handle.addRelationById('KickRequest', 'requester', kickRequest.id, requesterUser.id)
    // const k2 = await handle.find('KickRequest', undefined, undefined, ['*'])
    // await handle.addRelationById('KickRequest', 'processor', kickRequest.id, adminUser.id)
    // const k3 = await handle.find('KickRequest', undefined, undefined, ['*'])
    await handle.addRelationById('KickRequest', 'targetMember', kickRequest.id, targetMember.id)
    const k4 = await handle.find('KickRequest', undefined, undefined, ['*'])

    // Query KickRequest with all User-related relation data
    // This should trigger the storage bug
    const attributeQuery: AttributeQueryData = [
      "id",
      "reason",
      "status",
      "adminComment",
      "createdAt",
      "processedAt",
      [
        "targetMember",
        {
          attributeQuery: [
            "id",
            [
              "user",
              {
                attributeQuery: [
                  "id",
                  "name",
                  "studentId",
                ],
              },
            ],
            [
              "dormitory",
              {
                attributeQuery: [
                  "id",
                  "name",
                ],
              },
            ],
          ],
        },
      ],
      [
        "requester",
        {
          attributeQuery: [
            "id",
            "name",
          ],
        },
      ],
      [
        "processor",
        {
          attributeQuery: [
            "id",
            "name",
          ],
        },
      ],
    ]

    const results = await handle.find(
      'KickRequest',
      MatchExp.atom({key:'id', value:['=', kickRequest.id.toString()]}),
      {},
      attributeQuery
    )

    const result = results[0]

    

    // Verify the data structure
    expect(result).toBeTruthy()
    expect(result.id).toBe(kickRequest.id)
    expect(result.reason).toBe('Poor behavior and low score')
    expect(result.status).toBe('approved')

    // Verify requester relation
    expect(result.requester).toBeTruthy()
    expect(result.requester.id).toBe(requesterUser.id)
    expect(result.requester.name).toBe('Requester User')

    // Verify processor relation  
    expect(result.processor).toBeTruthy()
    expect(result.processor.id).toBe(adminUser.id)
    expect(result.processor.name).toBe('Admin User')

    // Verify target member relation
    expect(result.targetMember).toBeTruthy()
    expect(result.targetMember.id).toBe(targetMember.id)
    expect(result.targetMember.score).toBe(-60)

    // Verify target member's user relation
    expect(result.targetMember.user).toBeTruthy()
    expect(result.targetMember.user.id).toBe(targetUser.id)
    expect(result.targetMember.user.name).toBe('Target User')

    // Verify target member's dormitory relation
    expect(result.targetMember.dormitory).toBeTruthy()
    expect(result.targetMember.dormitory.id).toBe(dormitory.id)
    expect(result.targetMember.dormitory.name).toBe('Test Dormitory')

    console.log('KickRequest query result:', JSON.stringify(result, null, 2))
  })

  test('should query multiple KickRequests with complex relations', async () => {
    // Create multiple users and complex relationships to stress test the storage system
    const users = []
    const members = []
    const kickRequests = []

    // Create 5 users
    for (let i = 0; i < 5; i++) {
      const user = await handle.create('User', {
        name: `User ${i}`,
        role: i === 0 ? 'admin' : 'student',
        email: `user${i}@test.com`,
        studentId: `STU00${i}`,
        createdAt: '2024-01-01T00:00:00Z'
      })
      users.push(user)
    }

    // Create dormitory
    const dormitory = await handle.create('Dormitory', {
      name: 'Complex Test Dormitory',
      building: 'Building B', 
      roomNumber: '201',
      capacity: 6,
      description: 'Complex test dormitory',
      createdAt: '2024-01-01T00:00:00Z'
    })

    // Create dormitory members for students (users 1-4)
    for (let i = 1; i <= 4; i++) {
      const member = await handle.create('DormitoryMember', {
        role: i === 1 ? 'leader' : 'member',
        score: i === 4 ? -70 : 50,
        joinedAt: '2024-01-01T00:00:00Z',
        status: 'active',
        bedNumber: i
      })
      members.push(member)

      await handle.addRelationById('DormitoryMember', 'user', member.id, users[i].id)
      await handle.addRelationById('DormitoryMember', 'dormitory', member.id, dormitory.id)
    }

    // Create 2 kick requests
    for (let i = 0; i < 2; i++) {
      const kickRequest = await handle.create('KickRequest', {
        reason: `Kick reason ${i}`,
        status: i === 0 ? 'pending' : 'approved',
        adminComment: i === 1 ? 'Admin approved' : '',
        createdAt: `2024-01-0${i + 2}T00:00:00Z`,
        processedAt: i === 1 ? `2024-01-0${i + 2}T12:00:00Z` : ''
      })
      kickRequests.push(kickRequest)

      // Connect to requester (leader - user 1)
      await handle.addRelationById('KickRequest', 'requester', kickRequest.id, users[1].id)
      
      // Connect to target member (member 3 for first request, member 4 for second)
      await handle.addRelationById('KickRequest', 'targetMember', kickRequest.id, members[i + 2].id)

      // Connect to processor (admin - user 0) only for approved request
      if (i === 1) {
        await handle.addRelationById('KickRequest', 'processor', kickRequest.id, users[0].id)
      }
    }

    // Query all KickRequests with complete relation data
    const results = await handle.find(
      'KickRequest', 
      undefined, 
      {},
      [
        'id',
        'reason', 
        'status',
        'adminComment',
        'createdAt',
        'processedAt',
        ['requester', { attributeQuery: ['id', 'name', 'role'] }],
        ['processor', { attributeQuery: ['id', 'name', 'role'] }],
        ['targetMember', { 
          attributeQuery: [
            'id', 
            'role', 
            'score', 
            'status',
            ['user', { attributeQuery: ['id', 'name', 'studentId'] }],
            ['dormitory', { attributeQuery: ['id', 'name', 'building'] }]
          ] 
        }]
      ]
    )

    expect(results).toBeTruthy()
    expect(results.length).toBe(2)

    // Verify each result has complete relation data
    for (const result of results) {
      expect(result.requester).toBeTruthy()
      expect(result.targetMember).toBeTruthy()
      expect(result.targetMember.user).toBeTruthy()
      expect(result.targetMember.dormitory).toBeTruthy()
      
      if (result.status === 'approved') {
        expect(result.processor).toBeTruthy()
      }
    }

    console.log('Multiple KickRequests query results:', JSON.stringify(results, null, 2))
  })

  test('should stress test with deep nested queries that might trigger storage bug', async () => {
    // This test creates a more complex scenario to stress test the storage system
    const users = []
    const dormitories = []
    const members = []
    const kickRequests = []

    // Create multiple admins and students
    for (let i = 0; i < 10; i++) {
      const user = await handle.create('User', {
        name: `User ${i}`,
        role: i < 2 ? 'admin' : 'student',
        email: `user${i}@test.com`,
        studentId: `STU${String(i).padStart(3, '0')}`,
        createdAt: '2024-01-01T00:00:00Z'
      })
      users.push(user)
    }

    // Create multiple dormitories
    for (let i = 0; i < 3; i++) {
      const dormitory = await handle.create('Dormitory', {
        name: `Dormitory ${i}`,
        building: `Building ${String.fromCharCode(65 + i)}`,
        roomNumber: `${i + 1}01`,
        capacity: 4,
        description: `Test dormitory ${i}`,
        createdAt: '2024-01-01T00:00:00Z'
      })
      dormitories.push(dormitory)
    }

    // Create members across dormitories
    let memberIndex = 0
    for (let dormIndex = 0; dormIndex < 3; dormIndex++) {
      for (let bedIndex = 1; bedIndex <= 4; bedIndex++) {
        const userIndex = 2 + memberIndex // Start from user 2 (students)
        if (userIndex >= users.length) break

        const member = await handle.create('DormitoryMember', {
          role: bedIndex === 1 ? 'leader' : 'member',
          score: Math.random() > 0.5 ? 50 : -60, // Some with negative scores
          joinedAt: '2024-01-01T00:00:00Z',
          status: 'active',
          bedNumber: bedIndex
        })
        members.push(member)

        await handle.addRelationById('DormitoryMember', 'user', member.id, users[userIndex].id)
        await handle.addRelationById('DormitoryMember', 'dormitory', member.id, dormitories[dormIndex].id)
        memberIndex++
      }
    }

    // Create multiple kick requests with complex relationships
    const maxRequests = Math.min(6, members.length - 1) // Don't exceed available members
    for (let i = 0; i < maxRequests; i++) {
      const requesterMember = members.find(m => m.role === 'leader') // Find a leader
      const targetMemberIndex = (i + 1) % members.length // Rotate through members, avoid requester
      const targetMember = members[targetMemberIndex] 
      const processorUser = users[i % 2] // Alternate between admin users
      
      // Skip if target is the same as requester
      if (targetMember.id === requesterMember.id) {
        continue
      }

      const kickRequest = await handle.create('KickRequest', {
        reason: `Complex kick reason ${i} - detailed behavioral issues and policy violations`,
        status: i % 3 === 0 ? 'pending' : (i % 3 === 1 ? 'approved' : 'rejected'),
        adminComment: i % 3 !== 0 ? `Admin decision ${i}` : '',
        createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        processedAt: i % 3 !== 0 ? `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z` : ''
      })
      kickRequests.push(kickRequest)

      // Create relations
      const requesterUserId = await handle.find(
        'DormitoryMember',
        MatchExp.atom({ key: 'id', value: ['=', requesterMember.id] }),
        {},
        [['user', { attributeQuery: ['id'] }]]
      )
      
      console.log('Requester member query result:', JSON.stringify(requesterUserId, null, 2))
      
      if (!requesterUserId || requesterUserId.length === 0 || !requesterUserId[0].user) {
        throw new Error(`Failed to find user for requester member ${requesterMember.id}`)
      }
      
      await handle.addRelationById('KickRequest', 'requester', kickRequest.id, requesterUserId[0].user.id)
      await handle.addRelationById('KickRequest', 'targetMember', kickRequest.id, targetMember.id)
      
      if (i % 3 !== 0) { // Only for processed requests
        await handle.addRelationById('KickRequest', 'processor', kickRequest.id, processorUser.id)
      }
    }

    // Now perform the deep nested query that might trigger the bug
    const complexResults = await handle.find(
      'KickRequest',
      undefined,
      {},
      [
        '*', // All KickRequest fields
        ['requester', { 
          attributeQuery: ['*', ['dormitoryMemberships', { 
            attributeQuery: ['*', ['dormitory', { attributeQuery: ['*'] }]] 
          }]]
        }],
        ['processor', { attributeQuery: ['*'] }],
        ['targetMember', {
          attributeQuery: [
            '*',
            ['user', { attributeQuery: ['*'] }],
            ['dormitory', { 
              attributeQuery: ['*', ['members', { 
                attributeQuery: ['*', ['user', { attributeQuery: ['*'] }]]
              }]]
            }]
          ]
        }]
      ]
    )

    // Verify results
    expect(complexResults).toBeTruthy()
    expect(complexResults.length).toBeGreaterThan(0)
    console.log(`Created ${kickRequests.length} kick requests, found ${complexResults.length} in results`)

    // Check for data integrity issues that might indicate storage bugs
    for (const result of complexResults) {
      expect(result.id).toBeDefined()
      expect(result.reason).toBeDefined()
      expect(result.requester).toBeTruthy()
      expect(result.requester.id).toBeDefined()
      expect(result.targetMember).toBeTruthy()
      expect(result.targetMember.user).toBeTruthy()
      expect(result.targetMember.dormitory).toBeTruthy()
      
      // Check for potential data corruption or inconsistencies
      if (result.status !== 'pending') {
        expect(result.processor).toBeTruthy()
        expect(result.processedAt).toBeTruthy()
      }

      // Verify nested data consistency
      expect(result.targetMember.user.id).toBeDefined()
      expect(result.targetMember.dormitory.id).toBeDefined()
      
      // Check dormitory members data
      if (result.targetMember.dormitory.members) {
        for (const member of result.targetMember.dormitory.members) {
          expect(member.user).toBeTruthy()
          expect(member.user.id).toBeDefined()
        }
      }
    }

    console.log('Complex nested query completed successfully')
    console.log(`Found ${complexResults.length} kick requests with deep nested data`)
    
    // Check for potential memory leaks or performance issues
    const memUsage = process.memoryUsage()
    console.log('Memory usage after complex query:', {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
    })
  })
})