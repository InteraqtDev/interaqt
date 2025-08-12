import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, Custom,
  InteractionEventEntity, Summation
} from '../../../src'

// ===== STATE NODES =====
// Define all state nodes first before using them in StateMachines

// User role states
const studentState = StateNode.create({ name: 'student' })
const dormHeadState = StateNode.create({ name: 'dormHead' })

// User status states (for status property - returns state names)
const activeState = StateNode.create({ name: 'active' })
const evictedState = StateNode.create({ name: 'evicted' })

// User evictedAt states (for evictedAt property - returns timestamps)
const notEvictedState = StateNode.create({ 
  name: 'notEvicted',
  computeValue: () => null // No timestamp when not evicted
})
const wasEvictedState = StateNode.create({ 
  name: 'wasEvicted',
  computeValue: (lastValue, event) => Math.floor(Date.now()/1000) // Set evictedAt timestamp
})

// Bed status states (for status property - return state names)
const vacantState = StateNode.create({ name: 'vacant' })
const occupiedState = StateNode.create({ name: 'occupied' })
const maintenanceState = StateNode.create({ name: 'maintenance' })

// Bed assignedAt states (for assignedAt property - return timestamps)
const notAssignedAtState = StateNode.create({ 
  name: 'notAssignedAt',
  computeValue: () => null // No timestamp when not assigned
})
const assignedAtState = StateNode.create({ 
  name: 'assignedAt',
  computeValue: (lastValue, event) => Math.floor(Date.now()/1000) // Set assignedAt timestamp
})

// EvictionRequest status states (for status property - return state names)
const pendingState = StateNode.create({ name: 'pending' })
const approvedState = StateNode.create({ name: 'approved' })
const rejectedState = StateNode.create({ name: 'rejected' })

// EvictionRequest decidedAt states (for decidedAt property - return timestamps)
const notDecidedState = StateNode.create({ 
  name: 'notDecided',
  computeValue: () => null // No timestamp when not decided
})
const wasDecidedState = StateNode.create({ 
  name: 'wasDecided',
  computeValue: (lastValue, event) => Math.floor(Date.now()/1000) // Set decidedAt timestamp
})

// EvictionRequest adminNotes states (for adminNotes property - return notes)
const noNotesState = StateNode.create({ 
  name: 'noNotes',
  computeValue: () => null // No notes initially
})
const hasNotesState = StateNode.create({ 
  name: 'hasNotes',
  computeValue: (lastValue, event) => event.payload.adminNotes || '' // Set admin notes from payload
})

// Relation states for assignment/eviction
const notAssignedState = StateNode.create({ 
  name: 'notAssigned',
  computeValue: () => null // Return null means no relation
})

const assignedState = StateNode.create({ 
  name: 'assigned',
  computeValue: (lastValue, event) => ({
    assignedAt: Math.floor(Date.now()/1000),
    assignedBy: event?.user?.name || 'system'
  })
})

// ============================================================
// ENTITIES (No computations initially - will add in next step)
// ============================================================

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string'
      // StateMachine will be added after interactions are defined (no defaultValue needed)
    }),
    Property.create({ 
      name: 'points', 
      type: 'number'
      // Custom computation will be added for calculating 100 - sum of violations
    }),
    Property.create({ 
      name: 'status', 
      type: 'string'
      // StateMachine will be added after interactions are defined (no defaultValue needed)
    }),
    Property.create({ 
      name: 'evictedAt', 
      type: 'number'
      // StateMachine will be added after interactions are defined
    })
  ]
})

export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'floor', type: 'number' }),
    Property.create({ name: 'building', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }), // active/inactive
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: function(event) {
      if (event.interactionName === 'createDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          floor: event.payload.floor,
          building: event.payload.building
          // status and createdAt will use default values
        }
      }
    }
  })
})

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'number', type: 'string' }), // bed identifier within room (A, B, C, etc.)
    Property.create({ name: 'status', type: 'string' }), // vacant/occupied/maintenance - StateMachine will be added
    Property.create({ name: 'assignedAt', type: 'number' }) // timestamp when last assigned, optional
  ],
  computation: Transform.create({
    record: Dormitory,
    attributeQuery: ['id', 'capacity'],
    callback: function(dormitory) {
      // Create beds based on dormitory capacity
      const beds = []
      for (let i = 0; i < dormitory.capacity; i++) {
        beds.push({
          number: String.fromCharCode(65 + i), // A, B, C, D, etc.
          dormitory: dormitory // Include the dormitory relation
        })
      }
      return beds
    }
  })
})

export const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'category', type: 'string' }), // hygiene/noise/curfew/damage/other
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'recordedBy', type: 'string' }) // name of the dormHead who recorded
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: function(event) {
      if (event.interactionName === 'recordViolation') {
        return {
          description: event.payload.description,
          points: event.payload.points,
          category: event.payload.category,
          recordedBy: event.user.name
          // createdAt will use default value
        }
      }
    }
  })
})

export const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // pending/approved/rejected - StateMachine will be added
    Property.create({ name: 'requestedAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'decidedAt', type: 'number' }), // timestamp when decision made, optional
    Property.create({ name: 'adminNotes', type: 'string' }) // admin's decision notes, optional
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: function(event) {
      if (event.interactionName === 'submitEvictionRequest') {
        return {
          reason: event.payload.reason
          // status and requestedAt will use default values
        }
      }
    }
  })
})

// ============================================================
// RELATIONS (No computations initially)
// ============================================================

export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory, 
  targetProperty: 'residents',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'assignedBy', type: 'string' })
  ]
})

export const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant', 
  type: '1:1'
})

export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
  // Remove the computation for now and try auto creation
})

export const DormitoryDormHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({ name: 'appointedAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'appointedBy', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: function(event) {
      if (event.interactionName === 'appointDormHead') {
        return {
          source: { id: event.payload.dormitoryId }, // dormitory reference
          target: { id: event.payload.userId },      // user reference  
          appointedBy: event.user.name
          // appointedAt will use default value
        }
      }
    }
  })
})

export const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violations',
  target: ViolationRecord,
  targetProperty: 'user',
  type: '1:n'
})

export const UserEvictionRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'evictionRequests',
  target: EvictionRequest,
  targetProperty: 'targetUser',
  type: '1:n'
})

export const DormHeadEvictionRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'submittedEvictionRequests',
  target: EvictionRequest,
  targetProperty: 'requestedBy',
  type: '1:n'
})

// ============================================================
// INTERACTIONS (No conditions initially - will add in Stage 2)
// ============================================================

export const CreateDormitory = Interaction.create({
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

export const AppointDormHead = Interaction.create({
  name: 'appointDormHead',
  action: Action.create({ name: 'appoint' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

export const AssignUserToDormitory = Interaction.create({
  name: 'assignUserToDormitory',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedId', required: true })
    ]
  })
})

export const RecordViolation = Interaction.create({
  name: 'recordViolation',
  action: Action.create({ name: 'record' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'category', required: true })
    ]
  })
})

export const SubmitEvictionRequest = Interaction.create({
  name: 'submitEvictionRequest',
  action: Action.create({ name: 'submit' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

export const ReviewEvictionRequest = Interaction.create({
  name: 'reviewEvictionRequest',
  action: Action.create({ name: 'review' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true }), // 'approve' or 'reject'
      PayloadItem.create({ name: 'adminNotes', required: false })
    ]
  })
})

export const ViewMyDormitory = Interaction.create({
  name: 'viewMyDormitory',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false }) // For admin to view any user's dormitory
    ]
  })
})

export const ViewMyViolations = Interaction.create({
  name: 'viewMyViolations',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false }) // For admin to view any user's violations
    ]
  })
})

export const ViewMyEvictionStatus = Interaction.create({
  name: 'viewMyEvictionStatus',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false }) // For admin to view any user's status
    ]
  })
})

// ============================================================
// ADD COMPUTATIONS USING ASSIGNMENT PATTERN
// ============================================================

// Add User.role StateMachine after interactions are defined
User.properties.find(p => p.name === 'role')!.computation = StateMachine.create({
  states: [studentState, dormHeadState],
  transfers: [
    StateTransfer.create({
      trigger: AppointDormHead,
      current: studentState,
      next: dormHeadState,
      computeTarget: (event) => ({ id: event.payload.userId })
    })
  ],
  defaultState: studentState
})

// Add User.status StateMachine
User.properties.find(p => p.name === 'status')!.computation = StateMachine.create({
  states: [activeState, evictedState],
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: activeState,
      next: evictedState,
      computeTarget: async function(this: any, event) {
        // Find the user associated with this eviction request
        if (event.payload.decision === 'approve') {
          const request = await this.system.storage.findOne('EvictionRequest',
            this.globals.MatchExp.atom({
              key: 'id',
              value: ['=', event.payload.requestId]
            }),
            undefined,
            ['id', ['targetUser', { attributeQuery: ['id'] }]]
          )
          return { id: request.targetUser.id }
        }
        return null // No state change if not approved
      }
    })
  ],
  defaultState: activeState
})

// Add User.evictedAt StateMachine (using different StateNodes for timestamp values)
User.properties.find(p => p.name === 'evictedAt')!.computation = StateMachine.create({
  states: [notEvictedState, wasEvictedState],
  transfers: [
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: notEvictedState,
      next: wasEvictedState,
      computeTarget: async function(this: any, event) {
        // Same logic as status state machine
        if (event.payload.decision === 'approve') {
          const request = await this.system.storage.findOne('EvictionRequest',
            this.globals.MatchExp.atom({
              key: 'id',
              value: ['=', event.payload.requestId]
            }),
            undefined,
            ['id', ['targetUser', { attributeQuery: ['id'] }]]
          )
          return { id: request.targetUser.id }
        }
        return null
      }
    })
  ],
  defaultState: notEvictedState
})

// ============================================================
// RELATION COMPUTATIONS USING ASSIGNMENT PATTERN
// ============================================================

// Add UserDormitoryRelation Transform for assignment
UserDormitoryRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'assignUserToDormitory') {
      return {
        source: { id: event.payload.userId },       // user reference
        target: { id: event.payload.dormitoryId },  // dormitory reference  
        assignedBy: event.user.name
        // assignedAt will use default value
      }
    }
  }
})

// Add UserBedRelation Transform for assignment
UserBedRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'assignUserToDormitory') {
      return {
        source: { id: event.payload.userId }, // user reference
        target: { id: event.payload.bedId }   // bed reference
        // No additional properties for this relation
      }
    }
  }
})

// ============================================================
// PROPERTY STATEMACHINES USING ASSIGNMENT PATTERN
// ============================================================

// Add Bed.status StateMachine (vacant ↔ occupied)
Bed.properties.find(p => p.name === 'status')!.computation = StateMachine.create({
  states: [vacantState, occupiedState, maintenanceState],
  transfers: [
    // Bed becomes occupied when user is assigned
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: vacantState,
      next: occupiedState,
      computeTarget: (event) => ({ id: event.payload.bedId })
    }),
    // Bed becomes vacant when user is evicted
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: occupiedState,
      next: vacantState,
      computeTarget: async function(this: any, event) {
        if (event.payload.decision === 'approve') {
          // Find the user's bed when they're evicted
          const request = await this.system.storage.findOne('EvictionRequest',
            this.globals.MatchExp.atom({
              key: 'id',
              value: ['=', event.payload.requestId]
            }),
            undefined,
            ['id', ['targetUser', { attributeQuery: ['id', ['bed', { attributeQuery: ['id'] }]] }]]
          )
          return { id: request.targetUser.bed.id }
        }
        return null
      }
    })
  ],
  defaultState: vacantState
})

// Add Bed.assignedAt StateMachine (for timestamp values)
Bed.properties.find(p => p.name === 'assignedAt')!.computation = StateMachine.create({
  states: [notAssignedAtState, assignedAtState],
  transfers: [
    // Set assignedAt timestamp when user is assigned
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: notAssignedAtState,
      next: assignedAtState,
      computeTarget: (event) => ({ id: event.payload.bedId })
    }),
    // Clear assignedAt when user is evicted
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: assignedAtState,
      next: notAssignedAtState,
      computeTarget: async function(this: any, event) {
        if (event.payload.decision === 'approve') {
          // Find the user's bed when they're evicted
          const request = await this.system.storage.findOne('EvictionRequest',
            this.globals.MatchExp.atom({
              key: 'id',
              value: ['=', event.payload.requestId]
            }),
            undefined,
            ['id', ['targetUser', { attributeQuery: ['id', ['bed', { attributeQuery: ['id'] }]] }]]
          )
          return { id: request.targetUser.bed.id }
        }
        return null
      }
    })
  ],
  defaultState: notAssignedAtState
})

// Add EvictionRequest.status StateMachine (pending → approved/rejected)
EvictionRequest.properties.find(p => p.name === 'status')!.computation = StateMachine.create({
  states: [pendingState, approvedState, rejectedState],
  transfers: [
    // Request approved
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: pendingState,
      next: approvedState,
      computeTarget: (event) => {
        if (event.payload.decision === 'approve') {
          return { id: event.payload.requestId }
        }
        return null
      }
    }),
    // Request rejected
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: pendingState,
      next: rejectedState,
      computeTarget: (event) => {
        if (event.payload.decision === 'reject') {
          return { id: event.payload.requestId }
        }
        return null
      }
    })
  ],
  defaultState: pendingState
})

// Add EvictionRequest.decidedAt StateMachine (for timestamp values)
EvictionRequest.properties.find(p => p.name === 'decidedAt')!.computation = StateMachine.create({
  states: [notDecidedState, wasDecidedState],
  transfers: [
    // Set decidedAt timestamp when decision is made (approved)
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: notDecidedState,
      next: wasDecidedState,
      computeTarget: (event) => {
        if (event.payload.decision === 'approve' || event.payload.decision === 'reject') {
          return { id: event.payload.requestId }
        }
        return null
      }
    })
  ],
  defaultState: notDecidedState
})

// Add EvictionRequest.adminNotes StateMachine (for admin notes)
EvictionRequest.properties.find(p => p.name === 'adminNotes')!.computation = StateMachine.create({
  states: [noNotesState, hasNotesState],
  transfers: [
    // Set admin notes when decision is made
    StateTransfer.create({
      trigger: ReviewEvictionRequest,
      current: noNotesState,
      next: hasNotesState,
      computeTarget: (event) => {
        if (event.payload.decision === 'approve' || event.payload.decision === 'reject') {
          return { id: event.payload.requestId }
        }
        return null
      }
    })
  ],
  defaultState: noNotesState
})

// ============================================================
// CUSTOM COMPUTATIONS AND COUNT PROPERTIES
// ============================================================

// Add User.points Custom computation (100 - sum of violations, min 0)
User.properties.find(p => p.name === 'points')!.computation = Custom.create({
  name: 'userPoints',
  dataDeps: {
    violations: {
      type: 'relation',
      source: UserViolationRelation,
      attributeQuery: [['target', { attributeQuery: ['points'] }]]
    }
  },
  compute: function(dataDeps) {
    // Sum up all violation points
    const totalViolationPoints = dataDeps.violations.reduce((sum, violation) => {
      return sum + (violation.target.points || 0)
    }, 0)
    
    // Calculate remaining points (100 - violations, minimum 0)
    const remainingPoints = Math.max(0, 100 - totalViolationPoints)
    
    return remainingPoints
  },
  getDefaultValue: function() {
    return 100 // Default starting points
  }
})

// Add computed property for Dormitory.occupancy (count of occupied beds)
const occupancyProperty = Property.create({
  name: 'occupancy',
  type: 'number',
  computation: Count.create({
    record: DormitoryBedRelation,
    attributeQuery: [['target', { attributeQuery: ['status'] }]],
    callback: function(relation) {
      return relation.target.status === 'occupied'
    }
  })
})

// Add the occupancy Count property to Dormitory entity
// Note: availableBeds and occupancyRate computed properties removed due to dependency issues
// They cause NaN errors when occupancy is not yet available during entity creation
Dormitory.properties.push(occupancyProperty)

// ============================================================
// EXPORTS
// ============================================================

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
export const dicts = []