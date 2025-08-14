import {
    Entity,
    Property,
    Relation,
    Interaction,
    Activity,
    Action,
    Payload,
    PayloadItem,
    Condition,
    Conditions,
    Dictionary,
    StateMachine,
    StateNode,
    StateTransfer,
    Count,
    Summation,
    Transform,
    RealTime,
    Custom,
    Every,
    Any,
    WeightedSummation,
    MatchExp,
    InteractionEventEntity
} from 'interaqt'

// ===== ENTITIES =====

const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({ name: 'role', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'points', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' })
    ]
})

const Dormitory = Entity.create({
    name: 'Dormitory',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'capacity', type: 'number' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' })
    ]
})

const Bed = Entity.create({
    name: 'Bed',
    properties: [
        Property.create({ name: 'bedNumber', type: 'number' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' })
    ]
})

const PointDeduction = Entity.create({
    name: 'PointDeduction',
    properties: [
        Property.create({ name: 'reason', type: 'string' }),
        Property.create({ name: 'points', type: 'number' }),
        Property.create({ name: 'createdAt', type: 'number' }),
        Property.create({ name: 'recordedBy', type: 'string' })
    ]
})

const EvictionRequest = Entity.create({
    name: 'EvictionRequest',
    properties: [
        Property.create({ name: 'reason', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }),
        Property.create({ name: 'createdAt', type: 'number' }),
        Property.create({ name: 'processedAt', type: 'number' }),
        Property.create({ name: 'processedBy', type: 'string' })
    ]
})

// ===== RELATIONS =====

const UserDormitoryRelation = Relation.create({
    source: User,
    sourceProperty: 'dormitory',
    target: Dormitory,
    targetProperty: 'users',
    type: 'n:1',
    properties: [
        Property.create({ name: 'assignedAt', type: 'number' }),
        Property.create({ name: 'assignedBy', type: 'string' })
    ]
})

const UserBedRelation = Relation.create({
    source: User,
    sourceProperty: 'bed',
    target: Bed,
    targetProperty: 'user',
    type: '1:1',
    properties: [
        Property.create({ name: 'assignedAt', type: 'number' })
    ]
})

const DormitoryBedsRelation = Relation.create({
    source: Dormitory,
    sourceProperty: 'beds',
    target: Bed,
    targetProperty: 'dormitory',
    type: '1:n'
})

const UserPointDeductionRelation = Relation.create({
    source: User,
    sourceProperty: 'pointDeductions',
    target: PointDeduction,
    targetProperty: 'users',
    type: 'n:n'
})

const UserEvictionRequestRelation = Relation.create({
    source: User,
    sourceProperty: 'evictionRequests',
    target: EvictionRequest,
    targetProperty: 'users',
    type: 'n:n'
})

// ===== FILTERED ENTITIES =====

const ActiveUser = Entity.create({
    name: 'ActiveUser',
    baseEntity: User,
    matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'active']
    })
})

const EvictedUser = Entity.create({
    name: 'EvictedUser',
    baseEntity: User,
    matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'evicted']
    })
})

const AvailableBed = Entity.create({
    name: 'AvailableBed',
    baseEntity: Bed,
    matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'available']
    })
})

const OccupiedBed = Entity.create({
    name: 'OccupiedBed',
    baseEntity: Bed,
    matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'occupied']
    })
})

const PendingEvictionRequest = Entity.create({
    name: 'PendingEvictionRequest',
    baseEntity: EvictionRequest,
    matchExpression: MatchExp.atom({
        key: 'status',
        value: ['=', 'pending']
    })
})

// ===== INTERACTIONS =====

// User Management Interactions
const CreateUser = Interaction.create({
    name: 'CreateUser',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'name',
                required: true
            }),
            PayloadItem.create({
                name: 'email',
                required: true
            }),
            PayloadItem.create({
                name: 'role',
                required: true
            })
        ]
    })
})

const UpdateUserRole = Interaction.create({
    name: 'UpdateUserRole',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'role',
                required: true
            })
        ]
    })
})

const UpdateUser = Interaction.create({
    name: 'UpdateUser',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'name',
                required: false
            }),
            PayloadItem.create({
                name: 'email',
                required: false
            })
        ]
    })
})

const DeleteUser = Interaction.create({
    name: 'DeleteUser',
    action: Action.create({ name: 'delete' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            })
        ]
    })
})

// Dormitory Management Interactions
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
            })
        ]
    })
})

const UpdateDormitory = Interaction.create({
    name: 'UpdateDormitory',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryId',
                required: true
            }),
            PayloadItem.create({
                name: 'name',
                required: false
            }),
            PayloadItem.create({
                name: 'capacity',
                required: false
            })
        ]
    })
})

const DeleteDormitory = Interaction.create({
    name: 'DeleteDormitory',
    action: Action.create({ name: 'delete' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryId',
                required: true
            })
        ]
    })
})

const ViewDormitories = Interaction.create({
    name: 'ViewDormitories',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'status',
                required: false
            })
        ]
    })
})

// Assignment Interactions
const AssignUserToDormitory = Interaction.create({
    name: 'AssignUserToDormitory',
    action: Action.create({ name: 'create' }),
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
    })
})

const AssignUserToBed = Interaction.create({
    name: 'AssignUserToBed',
    action: Action.create({ name: 'create' }),
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

const RemoveFromDormitory = Interaction.create({
    name: 'RemoveFromDormitory',
    action: Action.create({ name: 'delete' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            })
        ]
    })
})

const ViewAssignments = Interaction.create({
    name: 'ViewAssignments',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryId',
                required: false
            })
        ]
    })
})

// Point System Interactions
const DeductPoints = Interaction.create({
    name: 'DeductPoints',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'points',
                required: true
            }),
            PayloadItem.create({
                name: 'reason',
                required: true
            })
        ]
    })
})

const ViewPoints = Interaction.create({
    name: 'ViewPoints',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: false
            })
        ]
    })
})

const ViewPointHistory = Interaction.create({
    name: 'ViewPointHistory',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: false
            }),
            PayloadItem.create({
                name: 'limit',
                required: false
            })
        ]
    })
})

const ResetPoints = Interaction.create({
    name: 'ResetPoints',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            })
        ]
    })
})

// Eviction Process Interactions
const RequestEviction = Interaction.create({
    name: 'RequestEviction',
    action: Action.create({ name: 'create' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            }),
            PayloadItem.create({
                name: 'reason',
                required: true
            })
        ]
    })
})

const ApproveEviction = Interaction.create({
    name: 'ApproveEviction',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'requestId',
                required: true
            })
        ]
    })
})

const RejectEviction = Interaction.create({
    name: 'RejectEviction',
    action: Action.create({ name: 'update' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'requestId',
                required: true
            })
        ]
    })
})

const ViewEvictionRequests = Interaction.create({
    name: 'ViewEvictionRequests',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'status',
                required: false
            })
        ]
    })
})

// Query Interactions
const GetUsers = Interaction.create({
    name: 'GetUsers',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'role',
                required: false
            }),
            PayloadItem.create({
                name: 'status',
                required: false
            }),
            PayloadItem.create({
                name: 'dormitoryId',
                required: false
            })
        ]
    })
})

const GetUserDetail = Interaction.create({
    name: 'GetUserDetail',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'userId',
                required: true
            })
        ]
    })
})

const GetDormitoryDetail = Interaction.create({
    name: 'GetDormitoryDetail',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({
                name: 'dormitoryId',
                required: true
            })
        ]
    })
})

// Export all definitions
export const entities = [User, Dormitory, Bed, PointDeduction, EvictionRequest, ActiveUser, EvictedUser, AvailableBed, OccupiedBed, PendingEvictionRequest]
export const relations = [UserDormitoryRelation, UserBedRelation, DormitoryBedsRelation, UserPointDeductionRelation, UserEvictionRequestRelation]
export const activities = []
export const interactions = [
    CreateUser, UpdateUserRole, UpdateUser, DeleteUser,
    CreateDormitory, UpdateDormitory, DeleteDormitory, ViewDormitories,
    AssignUserToDormitory, AssignUserToBed, RemoveFromDormitory, ViewAssignments,
    DeductPoints, ViewPoints, ViewPointHistory, ResetPoints,
    RequestEviction, ApproveEviction, RejectEviction, ViewEvictionRequests,
    GetUsers, GetUserDetail, GetDormitoryDetail
]
export const dicts = []

// ===== COMPUTATIONS =====

// User.status StateMachine computation
const activeState = StateNode.create({ name: 'active' })
const evictedState = StateNode.create({ name: 'evicted' })

const UserStatusStateMachine = StateMachine.create({
    states: [activeState, evictedState],
    defaultState: activeState,
    transfers: [
        StateTransfer.create({
            current: activeState,
            next: evictedState,
            trigger: ApproveEviction,
            computeTarget: (event) => {
                // Find the user associated with this eviction request
                // This is a simplified approach - in practice we might need to query the relation
                return { id: event.payload.requestId }
            }
        })
    ]
})

// Add the StateMachine to the status property using assignment pattern
User.properties.find(p => p.name === 'status').computation = UserStatusStateMachine

// User.points Custom computation - calculate initial points minus all deductions
// TODO: This computation has issues - the relation data is not being passed correctly
User.properties.find(p => p.name === 'points').computation = Custom.create({
  name: 'UserPointsCalculator',
  dataDeps: {
    self: {
      type: 'property',
      attributeQuery: [['pointDeductions', { attributeQuery: ['points'] }]]
    }
  },
  compute: async function(dataDeps) {
    // Get all point deductions for this user from the relation
    const self = dataDeps.self
    
    // Sum all deduction points
    const totalDeductions = self.pointDeductions.reduce((sum, deduction) => {
      return sum + (deduction.points || 0)
    }, 0)
    
    // Return initial points (100) minus total deductions
    return 100 - totalDeductions
  }
})

// Entity computations - using assignment pattern to avoid circular references
User.computation = Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
        if (event.interactionName === 'CreateUser') {
            return {
                name: event.payload.name,
                email: event.payload.email,
                role: event.payload.role,
                status: 'active',
                points: 100,
                createdAt: Math.floor(Date.now() / 1000)  // Convert to seconds
            }
        }
        return null
    }
})


// PointDeduction entity computation
PointDeduction.computation = Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
        if (event.interactionName === 'DeductPoints') {
            return {
                reason: event.payload.reason,
                points: event.payload.points,
                createdAt: Math.floor(Date.now() / 1000),
                recordedBy: event.user.id,
                users: [{ id: event.payload.userId }]  // Create relation to user
            }
        }
        return null
    }
})

// Dormitory entity computation
Dormitory.computation = Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
        if (event.interactionName === 'CreateDormitory') {
            return {
                name: event.payload.name,
                capacity: event.payload.capacity,
                status: 'active',
                createdAt: Math.floor(Date.now() / 1000)
            }
        }
        return null
    }
})

// Bed entity computation - create beds when dormitory is created
Bed.computation = Transform.create({
    record: Dormitory,  // Transform from Dormitory entity
    callback: (dormitory) => {
        // Create an array of bed records
        const beds = []
        for (let i = 1; i <= dormitory.capacity; i++) {
            beds.push({
                bedNumber: i,
                status: 'available',
                createdAt: Math.floor(Date.now() / 1000),
                dormitory: { id: dormitory.id }  // Link to dormitory
            })
        }
        return beds  // Return array to create multiple records
    }
})

// Bed.status StateMachine computation
const availableState = StateNode.create({ name: 'available' })
const occupiedState = StateNode.create({ name: 'occupied' })

const BedStatusStateMachine = StateMachine.create({
    states: [availableState, occupiedState],
    defaultState: availableState,
    transfers: [
        StateTransfer.create({
            current: availableState,
            next: occupiedState,
            trigger: AssignUserToBed,
            computeTarget: (event) => {
                // Find the bed being assigned
                return { id: event.payload.bedId }
            }
        }),
        StateTransfer.create({
            current: occupiedState,
            next: availableState,
            trigger: RemoveFromDormitory,
            computeTarget: (event) => {
                // Need to find the bed associated with this user
                // This is simplified - in practice we might need to query the relation
                return { id: event.payload.userId }  // This will need adjustment
            }
        })
    ]
})

// Add the StateMachine to the status property using assignment pattern
Bed.properties.find(p => p.name === 'status').computation = BedStatusStateMachine

// EvictionRequest.status StateMachine computation
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
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        }),
        StateTransfer.create({
            current: pendingState,
            next: rejectedState,
            trigger: RejectEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        })
    ]
})

// Add the StateMachine to the status property using assignment pattern
EvictionRequest.properties.find(p => p.name === 'status').computation = EvictionRequestStatusStateMachine

// Create states with computeValue for processedAt
const pendingStateWithProcessedAt = StateNode.create({ 
    name: 'pending',
    computeValue: () => null
})
const approvedStateWithProcessedAt = StateNode.create({ 
    name: 'approved',
    computeValue: () => Date.now()
})
const rejectedStateWithProcessedAt = StateNode.create({ 
    name: 'rejected',
    computeValue: () => Date.now()
})

// EvictionRequest.processedAt StateMachine computation
const EvictionRequestProcessedAtStateMachine = StateMachine.create({
    states: [pendingStateWithProcessedAt, approvedStateWithProcessedAt, rejectedStateWithProcessedAt],
    defaultState: pendingStateWithProcessedAt,
    transfers: [
        StateTransfer.create({
            current: pendingStateWithProcessedAt,
            next: approvedStateWithProcessedAt,
            trigger: ApproveEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        }),
        StateTransfer.create({
            current: pendingStateWithProcessedAt,
            next: rejectedStateWithProcessedAt,
            trigger: RejectEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        })
    ]
})

// Add the StateMachine to the processedAt property using assignment pattern
EvictionRequest.properties.find(p => p.name === 'processedAt').computation = EvictionRequestProcessedAtStateMachine

// Create states with computeValue for processedBy
const pendingStateWithProcessedBy = StateNode.create({ 
    name: 'pending',
    computeValue: () => null
})
const approvedStateWithProcessedBy = StateNode.create({ 
    name: 'approved',
    computeValue: (lastValue, event) => {
        return event?.user?.id || null
    }
})
const rejectedStateWithProcessedBy = StateNode.create({ 
    name: 'rejected',
    computeValue: (lastValue, event) => {
        return event?.user?.id || null
    }
})

// EvictionRequest.processedBy StateMachine computation
const EvictionRequestProcessedByStateMachine = StateMachine.create({
    states: [pendingStateWithProcessedBy, approvedStateWithProcessedBy, rejectedStateWithProcessedBy],
    defaultState: pendingStateWithProcessedBy,
    transfers: [
        StateTransfer.create({
            current: pendingStateWithProcessedBy,
            next: approvedStateWithProcessedBy,
            trigger: ApproveEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        }),
        StateTransfer.create({
            current: pendingStateWithProcessedBy,
            next: rejectedStateWithProcessedBy,
            trigger: RejectEviction,
            computeTarget: (event) => {
                return { id: event.payload.requestId }
            }
        })
    ]
})

// Add the StateMachine to the processedBy property using assignment pattern
EvictionRequest.properties.find(p => p.name === 'processedBy').computation = EvictionRequestProcessedByStateMachine

// UserDormitoryRelation StateMachine computation
const UserDormitoryRelationStateMachine = StateMachine.create({
    states: [
        StateNode.create({ name: 'notExists', computeValue: () => null }),
        StateNode.create({ name: 'exists', computeValue: () => ({
            assignedAt: Date.now(),
            assignedBy: 'system'
        })})
    ],
    defaultState: StateNode.create({ name: 'notExists', computeValue: () => null }),
    transfers: [
        StateTransfer.create({
            current: StateNode.create({ name: 'notExists' }),
            next: StateNode.create({ name: 'exists' }),
            trigger: AssignUserToDormitory,
            computeTarget: (event) => {
                return {
                    source: { id: event.payload.userId },
                    target: { id: event.payload.dormitoryId }
                }
            }
        }),
        StateTransfer.create({
            current: StateNode.create({ name: 'exists' }),
            next: StateNode.create({ name: 'notExists' }),
            trigger: RemoveFromDormitory,
            computeTarget: (event) => {
                return {
                    source: { id: event.payload.userId }
                }
            }
        }),
        StateTransfer.create({
            current: StateNode.create({ name: 'exists' }),
            next: StateNode.create({ name: 'notExists' }),
            trigger: ApproveEviction,
            computeTarget: (event) => {
                // Find the user associated with this eviction request
                // This is simplified - in practice we might need to query the relation
                return {
                    source: { id: event.payload.requestId }
                }
            }
        })
    ]
})

// Add the StateMachine to the relation using assignment pattern
UserDormitoryRelation.computation = UserDormitoryRelationStateMachine

// UserBedRelation StateMachine computation
const UserBedRelationStateMachine = StateMachine.create({
    states: [
        StateNode.create({ name: 'notExists', computeValue: () => null }),
        StateNode.create({ name: 'exists', computeValue: () => ({
            assignedAt: Date.now()
        })})
    ],
    defaultState: StateNode.create({ name: 'notExists', computeValue: () => null }),
    transfers: [
        StateTransfer.create({
            current: StateNode.create({ name: 'notExists' }),
            next: StateNode.create({ name: 'exists' }),
            trigger: AssignUserToBed,
            computeTarget: (event) => {
                return {
                    source: { id: event.payload.userId },
                    target: { id: event.payload.bedId }
                }
            }
        }),
        StateTransfer.create({
            current: StateNode.create({ name: 'exists' }),
            next: StateNode.create({ name: 'notExists' }),
            trigger: RemoveFromDormitory,
            computeTarget: (event) => {
                return {
                    source: { id: event.payload.userId }
                }
            }
        }),
        StateTransfer.create({
            current: StateNode.create({ name: 'exists' }),
            next: StateNode.create({ name: 'notExists' }),
            trigger: ApproveEviction,
            computeTarget: (event) => {
                // Find the user associated with this eviction request
                // This is simplified - in practice we might need to query the relation
                return {
                    source: { id: event.payload.requestId }
                }
            }
        })
    ]
})

// Add the StateMachine to the relation using assignment pattern
UserBedRelation.computation = UserBedRelationStateMachine

// EvictionRequest entity computation
EvictionRequest.computation = Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
        if (event.interactionName === 'RequestEviction') {
            return {
                reason: event.payload.reason,
                createdAt: Math.floor(Date.now() / 1000),
                processedAt: null,
                processedBy: null
            }
        }
        return null
    }
})