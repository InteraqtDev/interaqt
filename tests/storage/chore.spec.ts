import { describe, test, beforeEach, afterEach, expect } from 'vitest'
import { DBSetup, EntityToTableMap, EntityQueryHandle, MatchExp, AttributeQueryData } from "@storage"
import { PGLiteDB, SQLiteDB } from '@runtime'
import TestLogger from "./testLogger.js"
import { Entity, Property, Relation } from 'interaqt'

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

describe('KickRequest Storage Bug Test', () => {
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

    // Create kick request relations
    await handle.addRelationById('KickRequest', 'requester', kickRequest.id, requesterUser.id)
    await handle.addRelationById('KickRequest', 'processor', kickRequest.id, adminUser.id)
    await handle.addRelationById('KickRequest', 'targetMember', kickRequest.id, targetMember.id)

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
            "score",
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
})