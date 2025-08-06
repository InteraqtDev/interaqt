import {
  Entity, Property, Relation, 
  Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, 
  Count, Summation,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Activity, Transfer,
  MatchExp,
  BoolExp
} from 'interaqt'

// ====================
// 1. ENTITIES
// ====================

// User Entity
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'email', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'phone', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'student'
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({
      name: 'totalPenaltyPoints',
      type: 'number',
      defaultValue: () => 0
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateUser') {
        return {
          name: event.payload.name,
          email: event.payload.email,
          phone: event.payload.phone,
          role: event.payload.role,
          status: 'active',
          createdAt: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
})

// Dormitory Entity  
export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'bedCount', 
      type: 'number' 
    }),
    Property.create({
      name: 'availableBedCount',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          bedCount: event.payload.bedCount,
          createdAt: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
})

// Bed Entity
export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'bedNumber', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'available'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        const beds = []
        for (let i = 1; i <= event.payload.bedCount; i++) {
          beds.push({
            bedNumber: `床位${i}`,
            status: 'available',
            createdAt: Math.floor(Date.now() / 1000)
          })
        }
        return beds // Return array to create multiple beds
      }
      return null
    }
  })
})

// UserBedAssignment Entity
export const UserBedAssignment = Entity.create({
  name: 'UserBedAssignment',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToBed') {
        return {
          assignedAt: Math.floor(Date.now() / 1000),
          status: 'active'
        }
      }
      return null
    }
  })
})

// BehaviorRecord Entity
export const BehaviorRecord = Entity.create({
  name: 'BehaviorRecord',
  properties: [
    Property.create({ 
      name: 'behaviorType', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'description', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'penaltyPoints', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'recordedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordBehavior') {
        return {
          behaviorType: event.payload.behaviorType,
          description: event.payload.description,
          penaltyPoints: event.payload.penaltyPoints,
          recordedAt: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
})

// ExpulsionRequest Entity
export const ExpulsionRequest = Entity.create({
  name: 'ExpulsionRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({ 
      name: 'requestedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number'
    }),
    Property.create({ 
      name: 'adminNotes', 
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateExpulsionRequest') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          requestedAt: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
})

// ====================
// 2. RELATIONS  
// ====================

// User-Dormitory Head Relation
export const UserDormitoryHeadRelation = Relation.create({
  source: User,
  sourceProperty: 'managedDormitory',
  target: Dormitory,
  targetProperty: 'dormHead',
  type: 'n:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// Dormitory-Bed Relation
export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
})

// UserBedAssignment-User Relation
export const UserBedAssignmentUserRelation = Relation.create({
  source: UserBedAssignment,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'bedAssignments',
  type: 'n:1'
})

// UserBedAssignment-Bed Relation  
export const UserBedAssignmentBedRelation = Relation.create({
  source: UserBedAssignment,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'assignments',
  type: 'n:1'
})

// User-BehaviorRecord Relation
export const UserBehaviorRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'behaviorRecords',
  target: BehaviorRecord,
  targetProperty: 'user',
  type: '1:n'
})

// BehaviorRecord-Recorder Relation
export const BehaviorRecordRecorderRelation = Relation.create({
  source: BehaviorRecord,
  sourceProperty: 'recorder',
  target: User,
  targetProperty: 'recordedBehaviors',
  type: 'n:1'
})

// ExpulsionRequest-Requester Relation
export const ExpulsionRequestRequesterRelation = Relation.create({
  source: ExpulsionRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'expulsionRequests',
  type: 'n:1'
})

// ExpulsionRequest-Target Relation
export const ExpulsionRequestTargetRelation = Relation.create({
  source: ExpulsionRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'expulsionRequestsAgainst',
  type: 'n:1'
})

// ====================
// 3. INTERACTIONS
// ====================

// CreateUser Interaction
export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'phone', required: true }),
      PayloadItem.create({ name: 'role', required: true })
    ]
  })
})

// AssignDormHead Interaction
export const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assignDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

// CreateDormitory Interaction
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'bedCount', required: true })
    ]
  })
})

// AssignUserToBed Interaction
export const AssignUserToBed = Interaction.create({
  name: 'AssignUserToBed',
  action: Action.create({ name: 'assignUserToBed' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'bedId', required: true })
    ]
  })
})

// RecordBehavior Interaction
export const RecordBehavior = Interaction.create({
  name: 'RecordBehavior',
  action: Action.create({ name: 'recordBehavior' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'behaviorType', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'penaltyPoints', required: true })
    ]
  })
})

// CreateExpulsionRequest Interaction
export const CreateExpulsionRequest = Interaction.create({
  name: 'CreateExpulsionRequest',
  action: Action.create({ name: 'createExpulsionRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

// ProcessExpulsionRequest Interaction
export const ProcessExpulsionRequest = Interaction.create({
  name: 'ProcessExpulsionRequest',
  action: Action.create({ name: 'processExpulsionRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true }),
      PayloadItem.create({ name: 'adminNotes' })
    ]
  })
})

// ====================
// 4. ACTIVITIES
// ====================

export const DormitoryManagementActivity = Activity.create({
  name: 'DormitoryManagement',
  interactions: [
    CreateUser,
    AssignDormHead,
    CreateDormitory,
    AssignUserToBed,
    RecordBehavior,
    CreateExpulsionRequest,
    ProcessExpulsionRequest
  ]
})

// ====================
// 5. SYSTEM SETUP
// ====================

export const entities = [
  User,
  Dormitory,
  Bed,
  UserBedAssignment,
  BehaviorRecord,
  ExpulsionRequest
]

export const relations = [
  UserDormitoryHeadRelation,
  DormitoryBedRelation,
  UserBedAssignmentUserRelation,
  UserBedAssignmentBedRelation,
  UserBehaviorRecordRelation,
  BehaviorRecordRecorderRelation,
  ExpulsionRequestRequesterRelation,
  ExpulsionRequestTargetRelation
]

export const interactions = [
  CreateUser,
  AssignDormHead,
  CreateDormitory,
  AssignUserToBed,
  RecordBehavior,
  CreateExpulsionRequest,
  ProcessExpulsionRequest
]

export const activities = [] // No activities for now - focusing on basic interactions

export const dicts = []

export async function createDormitoryManagementSystem() {
  const system = new MonoSystem(new PGLiteDB())
  
  const controller = new Controller({
    system,
    entities,
    relations,
    activities,
    interactions,
    dict: dicts
  })

  await controller.setup(true)

  return { system, controller }
}