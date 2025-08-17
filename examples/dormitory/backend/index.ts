import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Condition,
  Conditions,
  StateMachine,
  StateNode,
  StateTransfer,
  Count,
  Summation,
  Transform,
  Activity,
  InteractionEventEntity,
  Controller,
  MatchExp,
  BoolExp
} from 'interaqt'

// ================== ENTITIES ==================

// User entity - system users with different roles
const User = Entity.create({
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
      type: 'string',
      defaultValue: () => ''
    }),
    Property.create({
      name: 'role',
      type: 'string'
      // Managed by StateMachine computation
    }),
    Property.create({
      name: 'status',
      type: 'string'
      // Managed by StateMachine computation
    }),
    Property.create({
      name: 'points',
      type: 'number'
      // Managed by StateMachine computation - defaults to 100
    }),
    Property.create({
      name: 'joinedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'totalDeductions',
      type: 'number'
      // will have Summation computation later
    }),
    Property.create({
      name: 'deductionCount',
      type: 'number'
      // will have Count computation later
    })
  ]
})

// Dormitory entity - dormitory rooms that can house multiple students
const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({
      name: 'name',
      type: 'string'
    }),
    Property.create({
      name: 'capacity',
      type: 'number'
    }),
    Property.create({
      name: 'floor',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'building',
      type: 'string',
      defaultValue: () => ''
    }),
    Property.create({
      name: 'status',
      type: 'string',
      computed: function(record) {
        // computed function receives the record as parameter
        const capacity = record.capacity || 0
        const occupancy = record.occupancy || 0
        
        // Check if dormitory is full
        if (capacity > 0 && occupancy >= capacity) {
          return 'full'
        }
        return 'available'
      }
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'occupancy',
      type: 'number'
      // will have Count computation later
    }),
    Property.create({
      name: 'availableBeds',
      type: 'number',
      computed: function(record) {
        // computed function receives the record as parameter
        const capacity = record.capacity || 0
        const occupancy = record.occupancy || 0
        return Math.max(0, capacity - occupancy)
      }
    })
  ]
})

// Bed entity - individual bed within a dormitory
const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({
      name: 'bedNumber',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string'
      // Managed by StateMachine computation (no defaultValue)
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// PointDeduction entity - record of points deducted from a user
const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'points',
      type: 'number'
    }),
    Property.create({
      name: 'category',
      type: 'string'
    }),
    Property.create({
      name: 'occurredAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'recordedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// EvictionRequest entity - request to evict a user from dormitory
const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'totalPoints',
      type: 'number'
    }),
    Property.create({
      name: 'status',
      type: 'string'
      // Managed by StateMachine computation (no defaultValue)
    }),
    Property.create({
      name: 'requestedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'processedAt',
      type: 'string'
      // Managed by StateMachine computation (no defaultValue)
    }),
    Property.create({
      name: 'adminComment',
      type: 'string'
      // Will be set when ApproveEviction or RejectEviction is executed
    })
  ]
})

// ================== RELATIONS ==================

// UserDormitoryRelation - assigns users to their dormitory (n:1)
const UserDormitoryRelation = Relation.create({
  name: 'UserDormitoryRelation',
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1',
  properties: [
    Property.create({
      name: 'assignedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// UserBedRelation - assigns users to their specific bed (1:1)
const UserBedRelation = Relation.create({
  name: 'UserBedRelation',
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1',
  properties: [
    Property.create({
      name: 'occupiedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// DormitoryBedRelation - links dormitories to their beds (1:n)
const DormitoryBedRelation = Relation.create({
  name: 'DormitoryBedRelation',
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  properties: []
})

// DormitoryDormHeadRelation - designates the head of a dormitory (1:1)
const DormitoryDormHeadRelation = Relation.create({
  name: 'DormitoryDormHeadRelation',
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({
      name: 'appointedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// UserPointDeductionRelation - links users to their point deduction records (1:n)
const UserPointDeductionRelation = Relation.create({
  name: 'UserPointDeductionRelation',
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n',
  properties: []
})

// PointDeductionRecorderRelation - links point deductions to the user who recorded them (n:1)
const PointDeductionRecorderRelation = Relation.create({
  name: 'PointDeductionRecorderRelation',
  source: PointDeduction,
  sourceProperty: 'recorder',
  target: User,
  targetProperty: 'recordedDeductions',
  type: 'n:1',
  properties: []
})

// EvictionRequestTargetUserRelation - links eviction requests to the target user (n:1)
const EvictionRequestTargetUserRelation = Relation.create({
  name: 'EvictionRequestTargetUserRelation',
  source: EvictionRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'evictionRequests',
  type: 'n:1',
  properties: []
})

// EvictionRequestRequesterRelation - links eviction requests to the requester (n:1)
const EvictionRequestRequesterRelation = Relation.create({
  name: 'EvictionRequestRequesterRelation',
  source: EvictionRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'submittedEvictionRequests',
  type: 'n:1',
  properties: []
})

// EvictionRequestApproverRelation - links eviction requests to the admin who approved/rejected them (n:1)
const EvictionRequestApproverRelation = Relation.create({
  name: 'EvictionRequestApproverRelation',
  source: EvictionRequest,
  sourceProperty: 'approver',
  target: User,
  targetProperty: 'processedEvictionRequests',
  type: 'n:1',
  properties: [
    Property.create({
      name: 'approvedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})


// ================== INTERACTIONS ==================

// CreateDormitory - Admin creates a new dormitory with beds
const CreateDormitory = Interaction.create({
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
      }),
      PayloadItem.create({
        name: 'floor',
        required: false
      }),
      PayloadItem.create({
        name: 'building',
        required: false
      })
    ]
  }),
})

// AssignUserToDormitory - Admin assigns a student to a dormitory bed
const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'bedId',
        required: true
      })
    ]
  }),
  
})

// AppointDormHead - Admin appoints a user as dormitory head
const AppointDormHead = Interaction.create({
  name: 'AppointDormHead',
  action: Action.create({ name: 'appoint' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      })
    ]
  }),
  
})

// RecordPointDeduction - Record a point deduction for violations
const RecordPointDeduction = Interaction.create({
  name: 'RecordPointDeduction',
  action: Action.create({ name: 'deduct' }),
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
      }),
      PayloadItem.create({
        name: 'category',
        required: true
      }),
      PayloadItem.create({
        name: 'occurredAt',
        required: false
      })
    ]
  }),
  
})

// RequestEviction - DormHead requests to evict a problematic resident
const RequestEviction = Interaction.create({
  name: 'RequestEviction',
  action: Action.create({ name: 'request' }),
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
  }),
  
})

// ApproveEviction - Admin approves an eviction request
const ApproveEviction = Interaction.create({
  name: 'ApproveEviction',
  action: Action.create({ name: 'approve' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        required: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        required: false
      })
    ]
  }),
  
})

// RejectEviction - Admin rejects an eviction request
const RejectEviction = Interaction.create({
  name: 'RejectEviction',
  action: Action.create({ name: 'reject' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        required: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        required: false
      })
    ]
  }),
  
})

// Query interactions - read-only operations

// ViewMyDormitory - View current user's dormitory information
const ViewMyDormitory = Interaction.create({
  name: 'ViewMyDormitory',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  query: async function(this: Controller, event: any) {
    // Get user's dormitory information
    const user = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
      undefined,
      ['id', 'name', ['dormitory', { 
        attributeQuery: ['id', 'name', 'capacity', 'occupancy']
      }]]
    )
    
    if (!user || !user.dormitory) {
      return null
    }
    
    // Get dormitory members
    const members = await this.system.storage.find(
      'User',
      undefined,
      undefined,
      ['id', 'name', 'role', 'points', ['dormitory', {
        attributeQuery: ['id']
      }]]
    )
    
    const dormMembers = members.filter(m => m.dormitory?.id === user.dormitory.id)
    
    return {
      dormitory: user.dormitory,
      members: dormMembers
    }
  }
})

// ViewMyPoints - View current user's points and deduction history
const ViewMyPoints = Interaction.create({
  name: 'ViewMyPoints',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  query: async function(this: Controller, event: any) {
    // Get user's points
    const user = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
      undefined,
      ['id', 'name', 'points']
    )
    
    if (!user) {
      return null
    }
    
    // Get user's point deduction history
    const allDeductions = await this.system.storage.find(
      'PointDeduction',
      undefined,
      undefined,
      ['id', 'points', 'reason', 'category', 'recordedAt', ['user', {
        attributeQuery: ['id']
      }]]
    )
    
    const userDeductions = allDeductions
      .filter(d => d.user?.id === event.user.id)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    
    return {
      currentPoints: user.points,
      deductionHistory: userDeductions
    }
  }
})

// ViewDormitoryMembers - View members of a dormitory
const ViewDormitoryMembers = Interaction.create({
  name: 'ViewDormitoryMembers',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: false
      })
    ]
  }),
  
})

// ViewAllDormitories - View all dormitories in the system
const ViewAllDormitories = Interaction.create({
  name: 'ViewAllDormitories',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
})

// ================== EXPORTS ==================

export const entities = [
  User,
  Dormitory,
  Bed,
  PointDeduction,
  EvictionRequest
]

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserPointDeductionRelation,
  PointDeductionRecorderRelation,
  EvictionRequestTargetUserRelation,
  EvictionRequestRequesterRelation,
  EvictionRequestApproverRelation
]

export const interactions = [
  CreateDormitory,
  AssignUserToDormitory,
  AppointDormHead,
  RecordPointDeduction,
  RequestEviction,
  ApproveEviction,
  RejectEviction,
  ViewMyDormitory,
  ViewMyPoints,
  ViewDormitoryMembers,
  ViewAllDormitories
]

export const activities: Activity[] = []

export const dicts = []  // Global dictionaries - none needed for this system

// ================== COMPUTATIONS ==================
// Will be added using assignment pattern after exports

// === User.role StateMachine ===
// State nodes for user role transitions
const userRoleState = StateNode.create({ name: 'user' })
const dormHeadRoleState = StateNode.create({ name: 'dormHead' })

const UserRoleStateMachine = StateMachine.create({
  states: [userRoleState, dormHeadRoleState],
  defaultState: userRoleState,
  transfers: [
    StateTransfer.create({
      current: userRoleState,
      next: dormHeadRoleState,
      trigger: AppointDormHead,
      computeTarget: (event) => ({ id: event.payload.userId })
    })
    // Note: No transfer back to 'user' state - once appointed, they remain dormHead
  ]
})

// Apply computation to User.role property
User.properties.find(p => p.name === 'role').computation = UserRoleStateMachine

// === User.status StateMachine ===
// State nodes for user status transitions
const activeUserState = StateNode.create({ name: 'active' })
const inactiveUserState = StateNode.create({ name: 'inactive' })

const UserStatusStateMachine = StateMachine.create({
  states: [activeUserState, inactiveUserState],
  defaultState: activeUserState,
  transfers: [
    StateTransfer.create({
      current: activeUserState,
      next: inactiveUserState,
      trigger: ApproveEviction,
      computeTarget: async function(this: Controller, event) {
        // Get the eviction request details
        const request = await this.system.storage.findOne(
          'EvictionRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          [['targetUser', { attributeQuery: ['id'] }]]
        )
        // Return the target user who is being evicted
        return request?.targetUser ? { id: request.targetUser.id } : null
      }
    })
    // Note: No transfer back to 'active' state - once evicted, they remain inactive
  ]
})

// Apply computation to User.status property  
User.properties.find(p => p.name === 'status').computation = UserStatusStateMachine

// === User.points StateMachine ===
// This uses a single-state machine with self-transition to track point deductions
// IMPORTANT: Points always initialize to 100. To set different initial points, 
// use RecordPointDeduction after user creation.
const userPointsState = StateNode.create({
  name: 'tracking',
  computeValue: (lastValue, event) => {
    // Initialize to 100 if no previous value
    if (lastValue === undefined || lastValue === null) {
      return 100
    }
    // Deduct points if this is a RecordPointDeduction event
    if (event?.interactionName === 'RecordPointDeduction') {
      const deduction = event.payload?.points || 0
      const newPoints = Math.max(0, lastValue - deduction) // Ensure points don't go below 0
      return newPoints
    }
    // Keep current value for other events
    return lastValue
  }
})

const UserPointsStateMachine = StateMachine.create({
  states: [userPointsState],
  defaultState: userPointsState,
  transfers: [
    StateTransfer.create({
      current: userPointsState,
      next: userPointsState, // Self-transition
      trigger: RecordPointDeduction,
      computeTarget: (event) => ({ id: event.payload.targetUserId })
    })
  ]
})

// Apply computation to User.points property
User.properties.find(p => p.name === 'points').computation = UserPointsStateMachine

// === PointDeduction Transform ===
// Creates PointDeduction entities from RecordPointDeduction interactions
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'RecordPointDeduction') {
      return {
        reason: event.payload.reason,
        points: event.payload.points,
        category: event.payload.category,
        occurredAt: event.payload.occurredAt || new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        // Relations will be created separately
        user: { id: event.payload.targetUserId },
        recorder: { id: event.user.id }
      }
    }
    return null
  }
})

// === User.totalDeductions Summation ===
// Sums all point deductions for a user
User.properties.find(p => p.name === 'totalDeductions').computation = Summation.create({
  property: 'pointDeductions',  // Use property name from UserPointDeductionRelation
  attributeQuery: ['points']  // Sum the points field from related PointDeduction entities
})

// === User.deductionCount Count ===
// Counts the number of point deductions for a user
User.properties.find(p => p.name === 'deductionCount').computation = Count.create({
  property: 'pointDeductions'  // Count related PointDeduction entities via UserPointDeductionRelation
})

// === Dormitory Transform ===
// Creates Dormitory entities from CreateDormitory interactions
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'CreateDormitory') {
      // Create Dormitory with initial values
      return {
        name: event.payload.name,
        capacity: event.payload.capacity,
        floor: event.payload.floor || 0,
        building: event.payload.building || ''
        // occupancy will be computed by Count computation
        // status and availableBeds are computed properties
      }
    }
    return null
  }
})

// Dormitory.status and Dormitory.availableBeds are now defined as computed properties directly in the Entity definition

// === Bed Transform ===
// Creates Bed entities when a Dormitory is created
Bed.computation = Transform.create({
  record: Dormitory,
  attributeQuery: ['id', 'capacity'],
  callback: function(dormitory) {
    // Create beds for the dormitory (one bed per capacity unit)
    const beds = []
    for (let i = 1; i <= dormitory.capacity; i++) {
      beds.push({
        bedNumber: i.toString().padStart(3, '0'), // Format as 001, 002, etc.
        dormitory: { id: dormitory.id }
      })
    }
    return beds
  }
})

// === Bed.status StateMachine ===
// State nodes for bed status
const vacantBedState = StateNode.create({ name: 'vacant' })
const occupiedBedState = StateNode.create({ name: 'occupied' })

const BedStatusStateMachine = StateMachine.create({
  states: [vacantBedState, occupiedBedState],
  defaultState: vacantBedState,
  transfers: [
    StateTransfer.create({
      current: vacantBedState,
      next: occupiedBedState,
      trigger: AssignUserToDormitory,
      computeTarget: (event) => ({ id: event.payload.bedId })
    })
    // When a user is evicted, bed status changes would need to be handled separately
    // This would typically be done via a separate interaction or as part of eviction cleanup
  ]
})

// Apply computation to Bed.status property
Bed.properties.find(p => p.name === 'status').computation = BedStatusStateMachine

// === EvictionRequest Transform ===
// Creates EvictionRequest entities from RequestEviction interactions
EvictionRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'RequestEviction') {
      return {
        reason: event.payload.reason,
        totalPoints: event.payload.totalPoints || 0,
        requestedAt: new Date().toISOString(),
        // Relations will be created separately
        targetUser: { id: event.payload.targetUserId },
        requester: { id: event.user.id }
      }
    }
    return null
  }
})

// === EvictionRequest.status StateMachine ===
// State nodes for eviction request status
const pendingState = StateNode.create({ name: 'pending' })
const approvedState = StateNode.create({ name: 'approved' })
const rejectedState = StateNode.create({ name: 'rejected' })

const EvictionRequestStatusStateMachine = StateMachine.create({
  states: [pendingState, approvedState, rejectedState],
  defaultState: pendingState,
  transfers: [
    StateTransfer.create({
      current: pendingState,
      next: approvedState,
      trigger: ApproveEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      current: pendingState,
      next: rejectedState,
      trigger: RejectEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  ]
})

// Apply computation to EvictionRequest.status property
EvictionRequest.properties.find(p => p.name === 'status').computation = EvictionRequestStatusStateMachine

// === EvictionRequest.processedAt StateMachine ===
// Using a single-node StateMachine to record processing timestamp
const evictionProcessingState = StateNode.create({
  name: 'processedAt',
  computeValue: (lastValue, event) => {
    // Set timestamp when approved or rejected
    if (event?.interactionName === 'ApproveEviction' || 
        event?.interactionName === 'RejectEviction') {
      return new Date().toISOString()
    }
    return lastValue
  }
})

const EvictionRequestProcessedAtStateMachine = StateMachine.create({
  states: [evictionProcessingState],
  defaultState: evictionProcessingState,
  transfers: [
    StateTransfer.create({
      current: evictionProcessingState,
      next: evictionProcessingState,
      trigger: ApproveEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      current: evictionProcessingState,
      next: evictionProcessingState,
      trigger: RejectEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  ]
})

// Apply computation to EvictionRequest.processedAt property
EvictionRequest.properties.find(p => p.name === 'processedAt').computation = EvictionRequestProcessedAtStateMachine

// === UserBedRelation Transform ===
// Creates UserBedRelation when user is assigned to a bed
UserBedRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: function(event) {
    if (event.interactionName === 'AssignUserToDormitory') {
      return {
        source: { id: event.payload.userId },
        target: { id: event.payload.bedId }
      }
    }
    return null
  }
})

// === UserDormitoryRelation Transform ===
// Creates UserDormitoryRelation when user is assigned to a dormitory
UserDormitoryRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: function(event) {
    if (event.interactionName === 'AssignUserToDormitory') {
      return {
        source: { id: event.payload.userId },
        target: { id: event.payload.dormitoryId }
      }
    }
    return null
  }
})

// === Dormitory.occupancy Count ===
// Counts the number of users assigned to the dormitory
Dormitory.properties.find(p => p.name === 'occupancy').computation = Count.create({
  property: 'residents'  // Count residents via UserDormitoryRelation (targetProperty)
})

// === EvictionRequest.adminComment StateMachine ===
// Tracks admin comments on eviction requests
const adminCommentState = StateNode.create({
  name: 'comment',
  computeValue: (lastValue, event) => {
    // Set admin comment when approved or rejected
    if (event?.interactionName === 'ApproveEviction' || 
        event?.interactionName === 'RejectEviction') {
      return event.payload?.adminComment || null
    }
    return lastValue
  }
})

const EvictionRequestAdminCommentStateMachine = StateMachine.create({
  states: [adminCommentState],
  defaultState: adminCommentState,
  transfers: [
    StateTransfer.create({
      current: adminCommentState,
      next: adminCommentState,
      trigger: ApproveEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      current: adminCommentState,
      next: adminCommentState,
      trigger: RejectEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  ]
})

// Apply computation to EvictionRequest.adminComment property
EvictionRequest.properties.find(p => p.name === 'adminComment').computation = EvictionRequestAdminCommentStateMachine

// === DormitoryDormHeadRelation Transform ===
// Creates DormitoryDormHeadRelation when a user is appointed as dormitory head
DormitoryDormHeadRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: function(event) {
    if (event.interactionName === 'AppointDormHead') {
      return {
        source: { id: event.payload.dormitoryId },
        target: { id: event.payload.userId }
      }
    }
    return null
  }
})

// === EvictionRequestApproverRelation Transform ===
// Creates relation between eviction request and approver (admin who approved/rejected)
EvictionRequestApproverRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'ApproveEviction' || 
        event.interactionName === 'RejectEviction') {
      return {
        evictionRequest: { id: event.payload.requestId },
        approver: { id: event.user.id }
      }
    }
    return null
  }
})

// ================== PERMISSIONS AND BUSINESS RULES ==================
// All conditions are added via assignment pattern below

// === Phase 1: Basic Role-Based Permissions ===

// P001: Only admin can create dormitories
const isAdminForCreateDormitory = Condition.create({
  name: 'isAdminForCreateDormitory',
  content: function(this: Controller, event: any) {
    return event.user.role === 'admin'
  }
})
CreateDormitory.conditions = isAdminForCreateDormitory

// P002: Only admin can assign users to dormitories
const isAdminForAssignUser = Condition.create({
  name: 'isAdminForAssignUser',
  content: function(this: Controller, event: any) {
    return event.user.role === 'admin'
  }
})
AssignUserToDormitory.conditions = isAdminForAssignUser

// P003: Only admin can appoint dormitory heads
const isAdminForAppointDormHead = Condition.create({
  name: 'isAdminForAppointDormHead',
  content: function(this: Controller, event: any) {
    return event.user.role === 'admin'
  }
})
AppointDormHead.conditions = isAdminForAppointDormHead

// P004: Only dormHead can request evictions
const isDormHeadForRequestEviction = Condition.create({
  name: 'isDormHeadForRequestEviction',
  content: function(this: Controller, event: any) {
    return event.user.role === 'dormHead'
  }
})
RequestEviction.conditions = isDormHeadForRequestEviction

// P005: Only admin can approve evictions
const isAdminForApproveEviction = Condition.create({
  name: 'isAdminForApproveEviction',
  content: function(this: Controller, event: any) {
    return event.user.role === 'admin'
  }
})
ApproveEviction.conditions = isAdminForApproveEviction

// P006: Only admin can reject evictions
const isAdminForRejectEviction = Condition.create({
  name: 'isAdminForRejectEviction',
  content: function(this: Controller, event: any) {
    return event.user.role === 'admin'
  }
})
RejectEviction.conditions = isAdminForRejectEviction

// P007: Only admin can view all dormitories
const isAdminForViewAllDormitories = Condition.create({
  name: 'isAdminForViewAllDormitories',
  content: function(this: Controller, event: any) {
    return event.user.role === 'admin'
  }
})
ViewAllDormitories.conditions = isAdminForViewAllDormitories

// === Phase 2: Simple Payload Validations ===

// BR001: Dormitory capacity must be between 4-6
const hasValidCapacity = Condition.create({
  name: 'hasValidCapacity',
  content: function(this: Controller, event: any) {
    const capacity = event.payload.capacity
    return capacity >= 4 && capacity <= 6
  }
})

// Combine P001 (admin permission) with BR001 (capacity validation) for CreateDormitory
CreateDormitory.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForCreateDormitory).and(hasValidCapacity)
})

// BR002: Points must be positive number
const hasPositivePoints = Condition.create({
  name: 'hasPositivePoints',
  content: function(this: Controller, event: any) {
    return event.payload.points > 0
  }
})

// RecordPointDeduction only has BR002 for now (P008 will be added in Phase 3)
RecordPointDeduction.conditions = hasPositivePoints

// === Phase 3: Complex Permissions with Data Queries ===

// P008: RecordPointDeduction permission
// Admin can deduct from any user, DormHead can only deduct from users in their dormitory
const canDeductPoints = Condition.create({
  name: 'canDeductPoints',
  content: async function(this: Controller, event: any) {
    // Admin can deduct from anyone
    if (event.user.role === 'admin') {
      return true
    }
    
    // DormHead can only deduct from users in their dormitory
    if (event.user.role === 'dormHead') {
      // Find the dormitory managed by this dormHead
      // DormitoryDormHeadRelation is stored in Dormitory entity
      // First, find all dormitories to see their structure
      const allDorms = await this.system.storage.find(
        'Dormitory',
        undefined,
        undefined,
        ['id', 'name', ['dormHead', { attributeQuery: ['id'] }]]
      )
      
      // Find the dormitory where this user is the dormHead
      const managedDormitory = allDorms.find(d => d.dormHead?.id === event.user.id)
      
      if (!managedDormitory) {
        return false // DormHead doesn't manage any dormitory
      }
      
      // Check if target user is in the managed dormitory
      // UserDormitoryRelation is stored in User entity
      const targetUser = await this.system.storage.findOne(
        'User',
        MatchExp.atom({ key: 'id', value: ['=', event.payload.targetUserId] }),
        undefined,
        ['id', ['dormitory', { attributeQuery: ['id'] }]]
      )
      
      return targetUser && targetUser.dormitory?.id === managedDormitory.id
    }
    
    // Regular users cannot deduct points
    return false
  }
})

// Combine BR002 (positive points) with P008 (permission check) for RecordPointDeduction
RecordPointDeduction.conditions = Conditions.create({
  content: BoolExp.atom(hasPositivePoints).and(canDeductPoints)
})

// P009: ViewDormitoryMembers permission
// Users can view their own dormitory, DormHeads their managed dormitory, Admins any
const canViewDormitoryMembers = Condition.create({
  name: 'canViewDormitoryMembers',
  content: async function(this: Controller, event: any) {
    const requestedDormitoryId = event.payload.dormitoryId
    
    // Admin can view any dormitory
    if (event.user.role === 'admin') {
      return true
    }
    
    // Check if user is viewing their own dormitory
    // UserDormitoryRelation is stored in User entity
    const currentUser = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    
    if (currentUser && currentUser.dormitory?.id === requestedDormitoryId) {
      return true // User can view their own dormitory
    }
    
    // Check if user is a dormHead viewing their managed dormitory
    if (event.user.role === 'dormHead') {
      // DormitoryDormHeadRelation is stored in Dormitory entity
      const requestedDorm = await this.system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'id', value: ['=', requestedDormitoryId] }),
        undefined,
        ['id', ['dormHead', { attributeQuery: ['id'] }]]
      )
      
      if (requestedDorm && requestedDorm.dormHead?.id === event.user.id) {
        return true // DormHead can view their managed dormitory
      }
    }
    
    return false // User cannot view this dormitory
  }
})

ViewDormitoryMembers.conditions = canViewDormitoryMembers

// === Phase 4: Business Rules with Entity State Checks ===

// BR003: AssignUserToDormitory - User must not already have a dormitory assignment
const userHasNoDormitory = Condition.create({
  name: 'userHasNoDormitory',
  content: async function(this: Controller, event: any) {
    // Check if user already has a dormitory assignment
    const user = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.userId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    
    // Return true if user exists but has no dormitory
    return user && !user.dormitory
  }
})

// BR004: AssignUserToDormitory - Bed must be vacant
const bedIsVacant = Condition.create({
  name: 'bedIsVacant',
  content: async function(this: Controller, event: any) {
    const bed = await this.system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.bedId] }),
      undefined,
      ['id', 'status']
    )
    
    return bed && bed.status === 'vacant'
  }
})

// BR005: AssignUserToDormitory - Bed must belong to specified dormitory
const bedBelongsToDormitory = Condition.create({
  name: 'bedBelongsToDormitory',
  content: async function(this: Controller, event: any) {
    const bed = await this.system.storage.findOne(
      'Bed',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.bedId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    
    return bed && bed.dormitory?.id === event.payload.dormitoryId
  }
})

// Update AssignUserToDormitory conditions to include all business rules
// Combine P002 (admin permission) with BR003, BR004, BR005
AssignUserToDormitory.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForAssignUser)
    .and(userHasNoDormitory)
    .and(bedIsVacant)
    .and(bedBelongsToDormitory)
})

// BR006: AppointDormHead - User must be a member of the target dormitory
const userInTargetDormitory = Condition.create({
  name: 'userInTargetDormitory',
  content: async function(this: Controller, event: any) {
    const user = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.userId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    
    return user && user.dormitory?.id === event.payload.dormitoryId
  }
})

// BR007: AppointDormHead - Dormitory should not already have a head
const dormitoryHasNoHead = Condition.create({
  name: 'dormitoryHasNoHead',
  content: async function(this: Controller, event: any) {
    const dormitory = await this.system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.dormitoryId] }),
      undefined,
      ['id', ['dormHead', { attributeQuery: ['id'] }]]
    )
    
    return dormitory && !dormitory.dormHead
  }
})

// Update AppointDormHead conditions to include business rules
// Combine P003 (admin permission) with BR006, BR007
AppointDormHead.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForAppointDormHead)
    .and(userInTargetDormitory)
    .and(dormitoryHasNoHead)
})

// BR008: RequestEviction - Target user must be in requester's dormitory
const targetUserInRequesterDormitory = Condition.create({
  name: 'targetUserInRequesterDormitory',
  content: async function(this: Controller, event: any) {
    // Find the dormitory managed by the requester (dormHead)
    const allDorms = await this.system.storage.find(
      'Dormitory',
      undefined,
      undefined,
      ['id', ['dormHead', { attributeQuery: ['id'] }]]
    )
    
    const managedDormitory = allDorms.find(d => d.dormHead?.id === event.user.id)
    
    if (!managedDormitory) {
      return false // Requester doesn't manage any dormitory
    }
    
    // Check if target user is in the managed dormitory
    const targetUser = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.targetUserId] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    
    return targetUser && targetUser.dormitory?.id === managedDormitory.id
  }
})

// BR009: RequestEviction - Target user points must be below 30
const targetUserPointsBelow30 = Condition.create({
  name: 'targetUserPointsBelow30',
  content: async function(this: Controller, event: any) {
    const targetUser = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.targetUserId] }),
      undefined,
      ['id', 'points']
    )
    
    return targetUser && targetUser.points < 30
  }
})

// BR010: RequestEviction - No existing pending request for same user
const noPendingEvictionRequest = Condition.create({
  name: 'noPendingEvictionRequest',
  content: async function(this: Controller, event: any) {
    // Find all eviction requests
    const allRequests = await this.system.storage.find(
      'EvictionRequest',
      undefined,
      undefined,
      ['id', 'status', ['targetUser', { attributeQuery: ['id'] }]]
    )
    
    // Check if there's any pending request for the target user
    const hasPendingRequest = allRequests.some(
      req => req.status === 'pending' && req.targetUser?.id === event.payload.targetUserId
    )

    return !hasPendingRequest
  }
})

// Update RequestEviction conditions to include all business rules
// Combine P004 (dormHead permission) with BR008, BR009, BR010
RequestEviction.conditions = Conditions.create({
  content: BoolExp.atom(isDormHeadForRequestEviction)
    .and(targetUserInRequesterDormitory)
    .and(targetUserPointsBelow30)
    .and(noPendingEvictionRequest)
})

// BR011: ApproveEviction - Request must be in 'pending' status
const evictionRequestIsPending = Condition.create({
  name: 'evictionRequestIsPending',
  content: async function(this: Controller, event: any) {
    const request = await this.system.storage.findOne(
      'EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
      undefined,
      ['id', 'status']
    )
    
    return request && request.status === 'pending'
  }
})

// Update ApproveEviction conditions to include business rule
// Combine P005 (admin permission) with BR011
ApproveEviction.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForApproveEviction)
    .and(evictionRequestIsPending)
})

// BR012: RejectEviction - Request must be in 'pending' status
// Note: BR012 uses the same condition as BR011 (evictionRequestIsPending)

// Update RejectEviction conditions to include business rule
// Combine P006 (admin permission) with BR012
RejectEviction.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForRejectEviction)
    .and(evictionRequestIsPending)
})

// ================== Phase 5: Query Interaction Rules ==================

// P010: ViewMyDormitory - Any logged-in user can view
const userExistsForViewMyDormitory = Condition.create({
  name: 'userExistsForViewMyDormitory',
  content: function(this: Controller, event: any) {
    return event.user && event.user.id
  }
})

// BR013: ViewMyDormitory - User must have dormitory assignment
const userHasDormitoryAssignment = Condition.create({
  name: 'userHasDormitoryAssignment',
  content: async function(this: Controller, event: any) {
    const user = await this.system.storage.findOne(
      'User',
      MatchExp.atom({ key: 'id', value: ['=', event.user.id] }),
      undefined,
      ['id', ['dormitory', { attributeQuery: ['id'] }]]
    )
    
    return user && user.dormitory && user.dormitory.id
  }
})

// Combine P010 and BR013 for ViewMyDormitory
ViewMyDormitory.conditions = Conditions.create({
  content: BoolExp.atom(userExistsForViewMyDormitory)
    .and(userHasDormitoryAssignment)
})

// P011: ViewMyPoints - Any logged-in user can view
const userExistsForViewMyPoints = Condition.create({
  name: 'userExistsForViewMyPoints',
  content: function(this: Controller, event: any) {
    return event.user && event.user.id
  }
})

ViewMyPoints.conditions = userExistsForViewMyPoints

// BR014: CreateDormitory - Dormitory name must be unique
const dormitoryNameIsUnique = Condition.create({
  name: 'dormitoryNameIsUnique',
  content: async function(this: Controller, event: any) {
    const existingDorm = await this.system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', event.payload.name] }),
      undefined,
      ['id']
    )
    
    return !existingDorm // Return true if no existing dormitory with same name
  }
})

// Update CreateDormitory conditions to include BR014
// CreateDormitory already has permission and capacity checks, add name uniqueness
CreateDormitory.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForCreateDormitory)
    .and(hasValidCapacity)
    .and(dormitoryNameIsUnique)
})

// BR015: AssignUserToDormitory - Dormitory must not be full
const dormitoryHasSpace = Condition.create({
  name: 'dormitoryHasSpace',
  content: async function(this: Controller, event: any) {
    const dormitory = await this.system.storage.findOne(
      'Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.dormitoryId] }),
      undefined,
      ['id', 'capacity', 'occupancy']
    )
    
    if (!dormitory) {
      return false // Dormitory doesn't exist
    }
    
    return dormitory.occupancy < dormitory.capacity
  }
})

// Update AssignUserToDormitory conditions to include BR015
// AssignUserToDormitory already has other checks, add capacity check
AssignUserToDormitory.conditions = Conditions.create({
  content: BoolExp.atom(isAdminForAssignUser)
    .and(userHasNoDormitory)
    .and(bedIsVacant)
    .and(bedBelongsToDormitory)
    .and(dormitoryHasSpace)
})