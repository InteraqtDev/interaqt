import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Controller, MonoSystem, PGLiteDB,
  Condition, Conditions, BoolExp, Dictionary
} from 'interaqt'

// State nodes for User role
const studentState = StateNode.create({ name: 'student' })
const dormHeadState = StateNode.create({ name: 'dormHead' })
const adminState = StateNode.create({ name: 'admin' })

// Entities
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'evictedAt', type: 'number' }),
    Property.create({
      name: 'isEligibleForEviction',
      type: 'boolean',
      computed: function(user) {
        return user.points < 60
      }
    })
  ]
})

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'floor', type: 'number' }),
    Property.create({ name: 'building', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'number' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'createDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          floor: event.payload.floor,
          building: event.payload.building,
          status: 'active',
          createdAt: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
})

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'number', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'assignedAt', type: 'number' })
  ],
  computation: Transform.create({
    record: Dormitory,
    attributeQuery: ['id', 'capacity'],
    callback: (dormitory) => {
      // Create beds for each dormitory based on capacity
      const beds = []
      for (let i = 1; i <= dormitory.capacity; i++) {
        beds.push({
          number: `${dormitory.id}-${i.toString().padStart(2, '0')}`,
          status: 'vacant',
          assignedAt: 0
        })
      }
      return beds
    }
  })
})

const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'category', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'number' }),
    Property.create({ name: 'recordedBy', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: (event) => {
      if (event.interactionName === 'recordViolation') {
        return {
          description: event.payload.description,
          points: event.payload.points,
          category: event.payload.category,
          createdAt: Math.floor(Date.now() / 1000),
          recordedBy: event.user.id
        }
      }
      return null
    }
  })
})

const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }),
    Property.create({ name: 'requestedAt', type: 'number' }),
    Property.create({ name: 'decidedAt', type: 'number' }),
    Property.create({ name: 'adminNotes', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: (event) => {
      if (event.interactionName === 'submitEvictionRequest') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          requestedAt: Math.floor(Date.now() / 1000),
          decidedAt: 0,
          adminNotes: ''
        }
      }
      return null
    }
  })
})

const AssignUserToDormitory = Interaction.create({
  name: 'assignUserToDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedId', required: true })
    ]
  })
})

const ReviewEvictionRequest = Interaction.create({
  name: 'reviewEvictionRequest',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true }),
      PayloadItem.create({ name: 'adminNotes', required: false })
    ]
  })
})

// Relations
const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number' }),
    Property.create({ name: 'assignedBy', type: 'string' })
  ],
  computation: StateMachine.create({
    states: [
      StateNode.create({ name: 'exists', computeValue: () => ({}) }),
      StateNode.create({ name: 'deleted', computeValue: () => null })
    ],
    defaultState: StateNode.create({ name: 'deleted', computeValue: () => null }),
    transfers: [
      // Create relation when user is assigned to dormitory
      StateTransfer.create({
        trigger: AssignUserToDormitory,
        current: StateNode.create({ name: 'deleted', computeValue: () => null }),
        next: StateNode.create({ name: 'exists', computeValue: () => ({}) }),
        computeTarget: (event) => ({
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          assignedAt: Math.floor(Date.now() / 1000),
          assignedBy: event.user.id
        })
      }),
      // Delete relation when eviction is approved
      StateTransfer.create({
        trigger: ReviewEvictionRequest,
        current: StateNode.create({ name: 'exists', computeValue: () => ({}) }),
        next: StateNode.create({ name: 'deleted', computeValue: () => null }),
        computeTarget: (event) => {
          if (event.payload.decision === 'approved') {
            // Return the relation to delete (need to find it first)
            // This is a limitation - we don't have direct access in computeTarget
            // For now, we'll use the userId to identify the relation
            return {
              source: { id: event.payload.userId },
              target: null // Will be resolved by the framework
            }
          }
          return null
        }
      })
    ]
  })
})

const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1'
})

const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
})

const DormitoryDormHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({ name: 'appointedAt', type: 'number' }),
    Property.create({ name: 'appointedBy', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: (event) => {
      if (event.interactionName === 'appointDormHead') {
        return {
          source: { id: event.payload.dormitoryId },
          target: { id: event.payload.userId },
          appointedAt: Math.floor(Date.now() / 1000),
          appointedBy: event.user.id
        }
      }
      return null
    }
  })
})

const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violations',
  target: ViolationRecord,
  targetProperty: 'user',
  type: '1:n'
})

const UserEvictionRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'evictionRequests',
  target: EvictionRequest,
  targetProperty: 'targetUser',
  type: '1:n'
})

const DormHeadEvictionRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'submittedEvictionRequests',
  target: EvictionRequest,
  targetProperty: 'requestedBy',
  type: '1:n'
})

// Interactions
const CreateDormitory = Interaction.create({
  name: 'createDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true }),
      PayloadItem.create({ name: 'floor', required: true }),
      PayloadItem.create({ name: 'building', required: true })
    ]
  })
})

const AppointDormHead = Interaction.create({
  name: 'appointDormHead',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})



const RecordViolation = Interaction.create({
  name: 'recordViolation',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'category', required: true })
    ]
  })
})

const SubmitEvictionRequest = Interaction.create({
  name: 'submitEvictionRequest',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})



const ViewMyDormitory = Interaction.create({
  name: 'viewMyDormitory',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false })
    ]
  })
})

const ViewMyViolations = Interaction.create({
  name: 'viewMyViolations',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false })
    ]
  })
})

const ViewMyEvictionStatus = Interaction.create({
  name: 'viewMyEvictionStatus',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false })
    ]
  })
})

export const entities = [User, Dormitory, Bed, ViolationRecord, EvictionRequest]
export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserViolationRelation,
  UserEvictionRequestRelation,
  DormHeadEvictionRequestRelation
]
export const activities = []
export const interactions = [
  CreateDormitory,
  AppointDormHead,
  AssignUserToDormitory,
  RecordViolation,
  SubmitEvictionRequest,
  ReviewEvictionRequest,
  ViewMyDormitory,
  ViewMyViolations,
  ViewMyEvictionStatus
]

// Add StateMachine computation to User.role property
User.properties[2].computation = StateMachine.create({
  states: [studentState, dormHeadState, adminState],
  defaultState: studentState,
  transfers: [
    StateTransfer.create({
      trigger: AppointDormHead,
      current: studentState,
      next: dormHeadState,
      computeTarget: (event) => ({ id: event.payload.userId })
    })
  ]
})

// State nodes for User.status
const activeStatusState = StateNode.create({ name: 'active' })
const evictedStatusState = StateNode.create({ name: 'evicted' })

// Add StateMachine computation to User.status property
User.properties[4].computation = StateMachine.create({
  states: [activeStatusState, evictedStatusState],
  defaultState: activeStatusState,
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: activeStatusState,
      next: evictedStatusState,
      computeTarget: (event) => {
        // Only evict if the decision is 'approved'
        if (event.payload.decision === 'approved') {
          // Find the user ID from the eviction request
          return { id: event.payload.userId }
        }
        return null
      }
    })
  ]
})

// Add StateMachine computation to User.evictedAt property
const zeroEvictedAtState = StateNode.create({ 
  name: 'zero',
  computeValue: () => 0
})
const timestampEvictedAtState = StateNode.create({ 
  name: 'timestamp',
  computeValue: () => Math.floor(Date.now() / 1000)
})

User.properties[5].computation = StateMachine.create({
  states: [zeroEvictedAtState, timestampEvictedAtState],
  defaultState: zeroEvictedAtState,
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: zeroEvictedAtState,
      next: timestampEvictedAtState,
      computeTarget: (event) => {
        // Only transition if the decision is 'approved'
        if (event.payload.decision === 'approved') {
          return { id: event.payload.userId }
        }
        return undefined
      }
    })
  ]
})

// State nodes for Bed.status
const vacantStatusState = StateNode.create({ name: 'vacant' })
const occupiedStatusState = StateNode.create({ name: 'occupied' })

// Add StateMachine computation to Bed.status property
Bed.properties[1].computation = StateMachine.create({
  states: [vacantStatusState, occupiedStatusState],
  defaultState: vacantStatusState,
  transfers: [
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: vacantStatusState,
      next: occupiedStatusState,
      computeTarget: (event) => {
        // Find the bed ID from the assignment payload
        return { id: event.payload.bedId }
      }
    }),
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: occupiedStatusState,
      next: vacantStatusState,
      computeTarget: (event) => {
        // Only make bed vacant if eviction is approved
        if (event.payload.decision === 'approved') {
          // Need to find the bed ID for this user
          // This is a limitation - we don't have direct access to user's bed
          // For now, we'll assume the bed ID is passed or can be derived
          return { id: event.payload.bedId } // This would need to be provided
        }
        return null
      }
    })
  ]
})

// State nodes for Bed.assignedAt
const zeroAssignedAtState = StateNode.create({ 
  name: 'zero',
  computeValue: () => 0
})
const timestampAssignedAtState = StateNode.create({ 
  name: 'timestamp',
  computeValue: () => Math.floor(Date.now() / 1000)
})

// Add StateMachine computation to Bed.assignedAt property
Bed.properties[2].computation = StateMachine.create({
  states: [zeroAssignedAtState, timestampAssignedAtState],
  defaultState: zeroAssignedAtState,
  transfers: [
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: zeroAssignedAtState,
      next: timestampAssignedAtState,
      computeTarget: (event) => {
        // Set timestamp when bed is assigned
        return { id: event.payload.bedId }
      }
    }),
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: timestampAssignedAtState,
      next: zeroAssignedAtState,
      computeTarget: (event) => {
        // Reset to zero when eviction is approved and bed is vacated
        if (event.payload.decision === 'approved') {
          return { id: event.payload.bedId }
        }
        return undefined
      }
    })
  ]
})

// State nodes for EvictionRequest.status
const pendingStatusState = StateNode.create({ name: 'pending' })
const approvedStatusState = StateNode.create({ name: 'approved' })
const rejectedStatusState = StateNode.create({ name: 'rejected' })

// Add StateMachine computation to EvictionRequest.status property
EvictionRequest.properties[1].computation = StateMachine.create({
  states: [pendingStatusState, approvedStatusState, rejectedStatusState],
  defaultState: pendingStatusState,
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: pendingStatusState,
      next: approvedStatusState,
      computeTarget: (event) => {
        // Only transition if decision is 'approved'
        if (event.payload.decision === 'approved') {
          return { id: event.payload.requestId }
        }
        return null
      }
    }),
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: pendingStatusState,
      next: rejectedStatusState,
      computeTarget: (event) => {
        // Only transition if decision is 'rejected'
        if (event.payload.decision === 'rejected') {
          return { id: event.payload.requestId }
        }
        return null
      }
    })
  ]
})

// State nodes for EvictionRequest.decidedAt
const zeroDecidedAtState = StateNode.create({ 
  name: 'zero',
  computeValue: () => 0
})
const timestampDecidedAtState = StateNode.create({ 
  name: 'timestamp',
  computeValue: () => Math.floor(Date.now() / 1000)
})

// Add StateMachine computation to EvictionRequest.decidedAt property
EvictionRequest.properties[3].computation = StateMachine.create({
  states: [zeroDecidedAtState, timestampDecidedAtState],
  defaultState: zeroDecidedAtState,
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: zeroDecidedAtState,
      next: timestampDecidedAtState,
      computeTarget: (event) => {
        // Set timestamp when any decision is made (approved or rejected)
        if (event.payload.decision === 'approved' || event.payload.decision === 'rejected') {
          return { id: event.payload.requestId }
        }
        return null
      }
    })
  ]
})

// Add StateMachine computation to EvictionRequest.adminNotes property
EvictionRequest.properties[4].computation = StateMachine.create({
  states: [
    StateNode.create({ name: 'empty', computeValue: () => '' }),
    StateNode.create({ name: 'hasNotes', computeValue: (event) => event.payload.adminNotes || '' })
  ],
  defaultState: StateNode.create({ name: 'empty', computeValue: () => '' }),
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: StateNode.create({ name: 'empty', computeValue: () => '' }),
      next: StateNode.create({ name: 'hasNotes', computeValue: (event) => event.payload.adminNotes || '' }),
      computeTarget: (event) => {
        // Set notes when review happens
        if (event.payload.adminNotes) {
          return { id: event.payload.requestId }
        }
        return null
      }
    })
  ]
})

export const dicts = []