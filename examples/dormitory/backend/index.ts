import { Entity, Property, Relation, Interaction, Action, Payload, PayloadItem, Condition, Count, Transform, StateMachine, StateNode, StateTransfer, MatchExp, InteractionEventEntity, Summation } from 'interaqt'

// ============= STATE NODES =============

// User role states
const studentState = StateNode.create({ name: 'student' })
const dormHeadState = StateNode.create({ name: 'dormHead' })
const adminState = StateNode.create({ name: 'admin' })

// User status states  
const activeUserState = StateNode.create({ name: 'active' })
const expelledUserState = StateNode.create({ name: 'expelled' })

// Bed status states
const availableBedState = StateNode.create({ name: 'available' })
const occupiedBedState = StateNode.create({ name: 'occupied' })

// ExpelRequest status states
const pendingRequestState = StateNode.create({ name: 'pending' })
const approvedRequestState = StateNode.create({ 
  name: 'approved',
  computeValue: () => new Date().toISOString()
})
const rejectedRequestState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => new Date().toISOString()
})

// ============= STATE MACHINES =============

// User role state machine
const UserRoleStateMachine = StateMachine.create({
  states: [studentState, dormHeadState, adminState],
  defaultState: studentState,
  transfers: [] // Will be populated after interactions are defined
})

// User status state machine
const UserStatusStateMachine = StateMachine.create({
  states: [activeUserState, expelledUserState],
  defaultState: activeUserState,
  transfers: [] // Will be populated after interactions are defined
})

// Bed status state machine
const BedStatusStateMachine = StateMachine.create({
  states: [availableBedState, occupiedBedState],
  defaultState: availableBedState,
  transfers: [] // Will be populated after interactions are defined
})

// ExpelRequest status state machine
const ExpelRequestStatusStateMachine = StateMachine.create({
  states: [pendingRequestState, approvedRequestState, rejectedRequestState],
  defaultState: pendingRequestState,
  transfers: [] // Will be populated after interactions are defined
})

// ============= ENTITIES =============

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string', 
      defaultValue: () => 'student',
      computation: UserRoleStateMachine
    }),
    Property.create({ name: 'score', type: 'number', defaultValue: () => 100 }), // Will be updated with computation after relations are defined
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'active',
      computation: UserStatusStateMachine
    }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
})

export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }), // 4-6个床位
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }), // active, inactive
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ],
  // Transform to create dormitories and their beds from CreateDormitory interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity
        }
      }
      return null
    }
  })
})

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'number', type: 'number' }), // 床位号 1-6
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'available',
      computation: BedStatusStateMachine
    }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ],
  // Transform to create beds when dormitory is created
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDormitory') {
        // Create multiple beds based on capacity
        const beds = []
        for (let i = 1; i <= event.payload.capacity; i++) {
          beds.push({
            number: i
          })
        }
        return beds // Return array to create multiple records
      }
      return null
    }
  })
})

export const DisciplineRecord = Entity.create({
  name: 'DisciplineRecord',
  properties: [
    Property.create({ name: 'reason', type: 'string' }), // 扣分原因
    Property.create({ name: 'points', type: 'number' }), // 扣分数
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }), // active, cancelled
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ],
  // Transform to create discipline records from RecordDiscipline interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordDiscipline') {
        return {
          reason: event.payload.reason,
          points: event.payload.points
        }
      }
      return null
    }
  })
})

export const ExpelRequest = Entity.create({
  name: 'ExpelRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }), // 申请理由
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'pending',
      computation: ExpelRequestStatusStateMachine
    }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'reviewedAt', type: 'string' }) // Will be set by state machine computeValue
  ],
  // Transform to create expel requests from CreateExpelRequest interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateExpelRequest') {
        return {
          reason: event.payload.reason
        }
      }
      return null
    }
  })
})

// ============= RELATIONS =============

// 用户-宿舍关系 (n:1 - 多个用户属于一个宿舍)
export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ],
  // Note: This relation will be handled manually in tests for now
  // In production, we'd need more complex logic to find dormitory from bed
})

// 用户-床位关系 (1:1 - 每个用户最多占用一个床位，每个床位最多被一个用户占用)
export const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'user',
  type: '1:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ],
  // Created from AssignUserToBed interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AssignUserToBed') {
        return {
          source: event.payload.userId,
          target: event.payload.bedId
        }
      }
      return null
    }
  })
})

// 宿舍-床位关系 (1:n - 每个宿舍有多个床位，每个床位属于一个宿舍)
export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
  // Note: This relation will be created manually in tests along with bed creation
})

// 宿舍-宿舍长关系 (1:1 - 每个宿舍有一个宿舍长，每个宿舍长管理一个宿舍)
export const DormitoryHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ],
  // Created from AssignDormHead interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: event.payload.dormitoryId,
          target: event.payload.userId
        }
      }
      return null
    }
  })
})

// 用户-纪律记录关系 (1:n - 每个用户可以有多个纪律记录，每个纪律记录属于一个用户)
export const UserDisciplineRelation = Relation.create({
  source: User,
  sourceProperty: 'disciplineRecords',
  target: DisciplineRecord,
  targetProperty: 'user',
  type: '1:n',
  // Created from RecordDiscipline interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordDiscipline') {
        return {
          source: event.payload.targetUserId,
          target: null // Will be populated by framework with created DisciplineRecord id
        }
      }
      return null
    }
  })
})

// 纪律记录-记录者关系 (n:1 - 多个纪律记录可以由同一个人记录，每个记录有一个记录者)
export const DisciplineRecorderRelation = Relation.create({
  source: DisciplineRecord,
  sourceProperty: 'recorder',
  target: User,
  targetProperty: 'recordedDisciplines',
  type: 'n:1',
  // Created from RecordDiscipline interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordDiscipline') {
        return {
          source: null, // Will be populated by framework with created DisciplineRecord id
          target: event.user // User who recorded the discipline
        }
      }
      return null
    }
  })
})

// 踢出申请-申请者关系 (n:1 - 多个申请可以由同一个宿舍长发起，每个申请有一个申请者)
export const ExpelRequestApplicantRelation = Relation.create({
  source: ExpelRequest,
  sourceProperty: 'applicant',
  target: User,
  targetProperty: 'expelRequests',
  type: 'n:1',
  // Created from CreateExpelRequest interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateExpelRequest') {
        return {
          source: null, // Will be populated by framework with created ExpelRequest id
          target: event.user // User who created the request (applicant)
        }
      }
      return null
    }
  })
})

// 踢出申请-被申请者关系 (n:1 - 多个申请可以针对同一个学生，每个申请有一个目标)
export const ExpelRequestTargetRelation = Relation.create({
  source: ExpelRequest,
  sourceProperty: 'target',
  target: User,
  targetProperty: 'expelRequestsAgainst',
  type: 'n:1',
  // Created from CreateExpelRequest interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateExpelRequest') {
        return {
          source: null, // Will be populated by framework with created ExpelRequest id
          target: event.payload.targetUserId // User being requested for expulsion
        }
      }
      return null
    }
  })
})

// 踢出申请-审核者关系 (n:1 - 多个申请可以由同一个管理员审核，每个申请有一个审核者)
export const ExpelRequestReviewerRelation = Relation.create({
  source: ExpelRequest,
  sourceProperty: 'reviewer',
  target: User,
  targetProperty: 'reviewedExpelRequests',
  type: 'n:1',
  // Created from ReviewExpelRequest interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'ReviewExpelRequest') {
        return {
          source: event.payload.requestId, // ExpelRequest being reviewed
          target: event.user // User who reviewed (admin)
        }
      }
      return null
    }
  })
})

// ============= COMPUTED PROPERTIES (Added after relations are defined) =============

// Add computed currentOccupancy property to Dormitory (count of assigned users)
Dormitory.properties.push(
  Property.create({
    name: 'currentOccupancy',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserDormitoryRelation,
      direction: 'target'
    })
  })
)

// Note: User.score computation will be handled manually in tests for now
// Complex score calculation based on discipline records requires more advanced computation

// ============= BASIC INTERACTIONS (Stage 1: Core Logic Only) =============

// 创建宿舍
export const CreateDormitoryInteraction = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        required: true
      }),
      PayloadItem.create({
        name: 'capacity',
        required: true
      })
    ]
  })
})

// 指定宿舍长
export const AssignDormHeadInteraction = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  })
})

// 分配学生到床位
export const AssignUserToBedInteraction = Interaction.create({
  name: 'AssignUserToBed',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'bedId',
        required: true
      })
    ]
  })
})

// 记录纪律扣分
export const RecordDisciplineInteraction = Interaction.create({
  name: 'RecordDiscipline',
  action: Action.create({ name: 'record' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      }),
      PayloadItem.create({
        name: 'points',
        required: true
      })
    ]
  })
})

// 发起踢出申请
export const CreateExpelRequestInteraction = Interaction.create({
  name: 'CreateExpelRequest',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      })
    ]
  })
})

// 审核踢出申请
export const ReviewExpelRequestInteraction = Interaction.create({
  name: 'ReviewExpelRequest',
  action: Action.create({ name: 'review' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        required: true
      }),
      PayloadItem.create({
        name: 'decision',
        required: true
      }) // approved, rejected
    ]
  })
})

// 查询宿舍信息
export const GetDormitoryInfoInteraction = Interaction.create({
  name: 'GetDormitoryInfo',
  action: Action.create({ name: 'get' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      })
    ]
  })
})

// ============= EXPORTS =============

export const entities = [User, Dormitory, Bed, DisciplineRecord, ExpelRequest]

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryHeadRelation,
  UserDisciplineRelation,
  DisciplineRecorderRelation,
  ExpelRequestApplicantRelation,
  ExpelRequestTargetRelation,
  ExpelRequestReviewerRelation
]

export const activities = []

export const interactions = [
  CreateDormitoryInteraction,
  AssignDormHeadInteraction,
  AssignUserToBedInteraction,
  RecordDisciplineInteraction,
  CreateExpelRequestInteraction,
  ReviewExpelRequestInteraction,
  GetDormitoryInfoInteraction
]

export const dicts = []