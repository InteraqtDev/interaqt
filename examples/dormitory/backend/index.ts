import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, Count, MatchExp,
  InteractionEventEntity, Summation, Condition, BoolExp
} from 'interaqt'

// =================== State Nodes ===================
// User states
const studentRoleState = StateNode.create({ name: 'student' })
const dormHeadRoleState = StateNode.create({ name: 'dormHead' })
const adminRoleState = StateNode.create({ name: 'admin' })

const activeUserState = StateNode.create({ name: 'active' })
const kickedOutUserState = StateNode.create({ name: 'kickedOut' })

// Bed states
const availableBedState = StateNode.create({ name: 'available' })
const occupiedBedState = StateNode.create({ name: 'occupied' })

// KickOutApplication states
const pendingApplicationState = StateNode.create({ name: 'pending' })
const approvedApplicationState = StateNode.create({ 
  name: 'approved',
  // No computeValue here since processedTime and processedBy need access to event
})
const rejectedApplicationState = StateNode.create({ 
  name: 'rejected',
  // No computeValue here since processedTime and processedBy need access to event
})

// Processing states for KickOutApplication
const notProcessedTimeState = StateNode.create({ name: 'notProcessed' })
const processedTimeState = StateNode.create({ 
  name: 'processed',
  computeValue: () => new Date().toISOString()
})

const notProcessedByState = StateNode.create({ name: 'notProcessed' })
const processedByState = StateNode.create({ 
  name: 'processed',
  computeValue: function() {
    // The user ID is captured from the interaction context
    const interactionEvent = arguments[1] // The event passed to computeValue
    return interactionEvent?.user?.id || null
  }
})

// Relation states
const relationExistsState = StateNode.create({ name: 'exists' })
const relationDeletedState = StateNode.create({ name: 'deleted' })

// =================== Interaction Definitions (needed for state transfers) ===================
// We need to define these before entities so they can be referenced in StateMachines

// Admin Interactions
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true }),
      PayloadItem.create({ name: 'floor', required: false }),
      PayloadItem.create({ name: 'building', required: false })
    ]
  })
})

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

export const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'removeDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
})

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

export const RemoveUserFromBed = Interaction.create({
  name: 'RemoveUserFromBed',
  action: Action.create({ name: 'removeUserFromBed' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
})

// Dorm Head Interactions
export const RecordPointDeduction = Interaction.create({
  name: 'RecordPointDeduction',
  action: Action.create({ name: 'recordPointDeduction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

export const SubmitKickOutApplication = Interaction.create({
  name: 'SubmitKickOutApplication',
  action: Action.create({ name: 'submitKickOutApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

export const ProcessKickOutApplication = Interaction.create({
  name: 'ProcessKickOutApplication',
  action: Action.create({ name: 'processKickOutApplication' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'applicationId', required: true }),
      PayloadItem.create({ name: 'approved', required: true })
    ]
  })
})

// Query Interactions (we'll define these later after importing QueryItem)

// =================== Base Entities (without relation-dependent properties) ===================
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
      name: 'role',
      type: 'string',
      defaultValue: () => 'student',
      computation: StateMachine.create({
        states: [studentRoleState, dormHeadRoleState, adminRoleState],
        defaultState: studentRoleState,
        transfers: [
          StateTransfer.create({
            current: studentRoleState,
            next: dormHeadRoleState,
            trigger: AssignDormHead,
            computeTarget: (event: any) => {
              // Target the specific user whose role is being changed
              return { id: event.payload.userId }
            }
          }),
          StateTransfer.create({
            current: dormHeadRoleState,
            next: studentRoleState,
            trigger: RemoveDormHead,
            computeTarget: (event: any) => {
              // Target the specific user whose role is being changed
              return { id: event.payload.userId }
            }
          })
        ]
      })
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeUserState, kickedOutUserState],
        defaultState: activeUserState,
        transfers: [
          // User status changes will be handled through a separate mechanism
          // For now, we focus on the application status updates
        ]
      })
    })
    // totalDeductions will be added after relations are defined
  ]
})

export const Dormitory = Entity.create({
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
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
    // occupiedBeds will be added after relations are defined
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event: any) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          createdAt: new Date().toISOString()
        }
      }
      return null
    }
  })
})

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({
      name: 'bedNumber',
      type: 'number'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'available',
      computation: StateMachine.create({
        states: [availableBedState, occupiedBedState],
        defaultState: availableBedState,
        transfers: [
          StateTransfer.create({
            current: availableBedState,
            next: occupiedBedState,
            trigger: AssignUserToBed,
            computeTarget: (event: any) => {
              // Target the specific bed being assigned
              return { id: event.payload.bedId }
            }
          }),
          // RemoveUserFromBed functionality would require complex relation queries
          // For Stage 1, we'll handle this in a simplified way
        ]
      })
    })
  ],
  computation: Transform.create({
    record: Dormitory,
    callback: (dormitory: any) => {
      // Create beds when dormitory is created
      const beds = []
      for (let i = 1; i <= dormitory.capacity; i++) {
        beds.push({
          bedNumber: i,
          status: 'available',
          dormitory: { id: dormitory.id }
        })
      }
      return beds
    }
  })
})

export const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({
      name: 'points',
      type: 'number'
    }),
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'recordedBy',
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event: any) => {
      if (event.interactionName === 'RecordPointDeduction') {
        return {
          reason: event.payload.reason,
          points: event.payload.points,
          createdAt: new Date().toISOString(),
          recordedBy: event.user.id,
          user: { id: event.payload.userId }
        }
      }
      return null
    }
  })
})

export const KickOutApplication = Entity.create({
  name: 'KickOutApplication',
  properties: [
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'pending',
      computation: StateMachine.create({
        states: [pendingApplicationState, approvedApplicationState, rejectedApplicationState],
        defaultState: pendingApplicationState,
        transfers: [
          StateTransfer.create({
            current: pendingApplicationState,
            next: approvedApplicationState,
            trigger: ProcessKickOutApplication,
            computeTarget: (event: any) => {
              // Only transition if approved is true
              if (event.payload.approved !== true) return undefined
              // Target the application being processed
              return { id: event.payload.applicationId }
            }
          }),
          StateTransfer.create({
            current: pendingApplicationState,
            next: rejectedApplicationState,
            trigger: ProcessKickOutApplication,
            computeTarget: (event: any) => {
              // Only transition if approved is false
              if (event.payload.approved !== false) return undefined
              // Target the application being processed
              return { id: event.payload.applicationId }
            }
          })
        ]
      })
    }),
    Property.create({
      name: 'processedTime',
      type: 'string',
      defaultValue: () => null,
      computation: StateMachine.create({
        states: [notProcessedTimeState, processedTimeState],
        defaultState: notProcessedTimeState,
        transfers: [
          StateTransfer.create({
            current: notProcessedTimeState,
            next: processedTimeState,
            trigger: ProcessKickOutApplication,
            computeTarget: (event: any) => {
              // Target the application being processed
              return { id: event.payload.applicationId }
            }
          })
        ]
      })
    }),
    Property.create({
      name: 'processedBy',
      type: 'string',
      defaultValue: () => null,
      computation: StateMachine.create({
        states: [notProcessedByState, processedByState],
        defaultState: notProcessedByState,
        transfers: [
          StateTransfer.create({
            current: notProcessedByState,
            next: processedByState,
            trigger: ProcessKickOutApplication,
            computeTarget: (event: any) => {
              // Target the application being processed
              return { id: event.payload.applicationId }
            }
          })
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event: any) => {
      if (event.interactionName === 'SubmitKickOutApplication') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          createdAt: new Date().toISOString(),
          targetUser: { id: event.payload.targetUserId },
          applicant: event.user
        }
      }
      return null
    }
  })
})

// =================== Relations ===================
export const UserDormHeadRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:n',
  sourceProperty: 'dorms',
  targetProperty: 'heads',
  properties: [
    Property.create({
      name: 'assignedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

export const UserBedRelation = Relation.create({
  source: User,
  target: Bed,
  type: '1:1',
  sourceProperty: 'bed',
  targetProperty: 'occupant',
  properties: [
    Property.create({
      name: 'assignedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  target: Bed,
  type: '1:n',
  sourceProperty: 'beds',
  targetProperty: 'dormitory'
})

export const UserPointDeductionRelation = Relation.create({
  source: User,
  target: PointDeduction,
  type: '1:n',
  sourceProperty: 'pointDeductions',
  targetProperty: 'user'
})

export const KickOutApplicationUserRelation = Relation.create({
  source: KickOutApplication,
  target: User,
  type: 'n:1',
  sourceProperty: 'targetUser',
  targetProperty: 'kickOutApps'
})

export const KickOutApplicationApplicantRelation = Relation.create({
  source: KickOutApplication,
  target: User,
  type: 'n:1',
  sourceProperty: 'applicant',
  targetProperty: 'submittedApps'
})

// =================== Add relation-dependent properties ===================
// Add totalDeductions to User
User.properties.push(
  Property.create({
    name: 'totalDeductions',
    type: 'number',
    defaultValue: () => 0,
    computation: Summation.create({
      record: UserPointDeductionRelation,
      direction: 'source',
      attributeQuery: [['target', { attributeQuery: ['points'] }]]
    })
  })
)

// Add computed properties to User
User.properties.push(
  Property.create({
    name: 'currentPoints',
    type: 'number',
    computed: (user: any) => {
      return 100 - (user.totalDeductions || 0)
    }
  }),
  Property.create({
    name: 'isDormHead',
    type: 'boolean',
    computed: (user: any) => {
      return user.role === 'dormHead'
    }
  })
)

// Add occupiedBeds to Dormitory
Dormitory.properties.push(
  Property.create({
    name: 'occupiedBeds',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: DormitoryBedRelation,
      direction: 'source',
      attributeQuery: ['id', ['target', { attributeQuery: ['id', 'status'] }]],
      callback: (relation: any) => {
        // Count beds that have status 'occupied'
        return relation?.target?.status === 'occupied'
      }
    })
  })
)

// Add computed properties to Dormitory
Dormitory.properties.push(
  Property.create({
    name: 'availableBeds',
    type: 'number',
    computed: (dormitory: any) => {
      return (dormitory.capacity || 0) - (dormitory.occupiedBeds || 0)
    }
  }),
  Property.create({
    name: 'occupancyRate',
    type: 'number',
    computed: (dormitory: any) => {
      if (!dormitory.capacity) return 0
      return ((dormitory.occupiedBeds || 0) / dormitory.capacity) * 100
    }
  })
)

// =================== Filtered Entities ===================
export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
})

export const AvailableBed = Entity.create({
  name: 'AvailableBed',
  sourceEntity: Bed,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'available']
  })
})

export const PendingKickOutApplication = Entity.create({
  name: 'PendingKickOutApplication',
  sourceEntity: KickOutApplication,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
})



// =================== Relation Computations ===================
// Note: Relations are created automatically based on interactions
// The framework handles relation creation when entities reference each other

// =================== Exports ===================
export const entities = [
  User, Dormitory, Bed, PointDeduction, KickOutApplication,
  ActiveUser, AvailableBed, PendingKickOutApplication
]

export const relations = [
  UserDormHeadRelation, UserBedRelation, DormitoryBedRelation,
  UserPointDeductionRelation, KickOutApplicationUserRelation, KickOutApplicationApplicantRelation
]

export const activities = []

export const interactions = [
  // Admin interactions
  CreateDormitory, AssignDormHead, RemoveDormHead, AssignUserToBed, RemoveUserFromBed, ProcessKickOutApplication,
  // Dormitory head interactions
  RecordPointDeduction, SubmitKickOutApplication
]

export const dicts = []
