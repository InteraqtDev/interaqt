import { 
    Entity, 
    Property, 
    Relation, 
    Interaction, 
    Action, 
    Payload, 
    PayloadItem,
    StateMachine,
    StateNode,
    StateTransfer,
    Transform,
    Count,
    Summation,
    Custom,
    Dictionary,
    InteractionEventEntity,
    MatchExp
} from 'interaqt'

// ============================================================================
// STATE NODES (Must be declared before StateMachine)
// ============================================================================

const studentState = StateNode.create({ name: 'student' })
const dormHeadState = StateNode.create({ name: 'dormHead' })
const adminState = StateNode.create({ name: 'admin' })

const pendingState = StateNode.create({ name: 'pending' })
const approvedState = StateNode.create({ name: 'approved' })
const rejectedState = StateNode.create({ name: 'rejected' })

const vacantState = StateNode.create({ name: 'vacant' })
const occupiedState = StateNode.create({ name: 'occupied' })

const activeState = StateNode.create({ name: 'active' })
const evictedState = StateNode.create({ name: 'evicted' })

// ============================================================================
// FORWARD DECLARATIONS (for StateMachine triggers)
// ============================================================================

export const AppointDormHeadInteraction = Interaction.create({
    name: 'appointDormHead',
    action: Action.create({ name: 'appoint' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'userId', required: true }),
            PayloadItem.create({ name: 'dormitoryId', required: true })
        ]
    })
})

export const ReviewEvictionRequestInteraction = Interaction.create({
    name: 'reviewEvictionRequest',
    action: Action.create({ name: 'review' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'requestId', required: true }),
            PayloadItem.create({ name: 'decision', required: true }),
            PayloadItem.create({ name: 'adminNotes', required: false }),
            PayloadItem.create({ name: 'targetUserId', required: true })
        ]
    })
})

export const AssignUserToDormitoryInteraction = Interaction.create({
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

// ============================================================================
// TRIGGER DICTIONARIES (for property computations)
// ============================================================================

// Global trigger dictionary for user points calculation
const pointsTrigger = Dictionary.create({
    name: 'pointsTrigger',
    type: 'object',
    collection: false,
    defaultValue: () => ({ trigger: true })
})

// ============================================================================
// ENTITIES (Step 3.1.2 - No computations yet)
// ============================================================================

export const User = Entity.create({
    name: 'User',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'email', type: 'string' }),
        Property.create({ 
            name: 'role', 
            type: 'string',
            computation: StateMachine.create({
                states: [studentState, dormHeadState, adminState],
                transfers: [
                    StateTransfer.create({
                        trigger: AppointDormHeadInteraction,
                        current: studentState,
                        next: dormHeadState,
                        computeTarget: (event) => {
                            return { id: event.payload.userId }
                        }
                    })
                ],
                defaultState: studentState
            })
        }), // StateMachine for role transitions
        Property.create({ name: 'points', type: 'number' }), // Custom computation will be added below  
        Property.create({ name: 'status', type: 'string' }), // StateMachine will be added below
        Property.create({ name: 'evictedAt', type: 'number' }) // No computation yet - optional field
    ]
})

// Add User.status StateMachine using assignment pattern
User.properties[4] = Property.create({
    name: 'status',
    type: 'string',
    computation: StateMachine.create({
        states: [activeState, evictedState],
        transfers: [
            StateTransfer.create({
                trigger: ReviewEvictionRequestInteraction,
                current: activeState,
                next: evictedState,
                computeTarget: (event) => {
                    // Only evict if the decision is approved
                    if (event.payload.decision === 'approved') {
                        return { id: event.payload.targetUserId }
                    }
                    return null
                }
            })
        ],
        defaultState: activeState
    })
})

// User.points Custom computation deferred - Property-level Custom computations have complex triggering requirements
// The framework requires specific conditions for property computations to be triggered that haven't been achieved
// This is documented in errors/round-5-custom-computation-trigger-issue.md

// User.evictedAt computation deferred - Transform not supported on properties

export const Dormitory = Entity.create({
    name: 'Dormitory',
    properties: [
        Property.create({ name: 'name', type: 'string' }),
        Property.create({ name: 'capacity', type: 'number' }),
        Property.create({ name: 'floor', type: 'number' }),
        Property.create({ name: 'building', type: 'string' }),
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
            name: 'occupancy', 
            type: 'number'
        }), // Count computation will be added below
        Property.create({ 
            name: 'availableBeds', 
            type: 'number'
        }), // Custom computation will be added below
        Property.create({ 
            name: 'occupancyRate', 
            type: 'number'
        }) // Custom computation will be added below
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['*'],
        callback: (event) => {
            if (event.interactionName === 'createDormitory') {
                return {
                    name: event.payload.name,
                    capacity: event.payload.capacity,
                    floor: event.payload.floor,
                    building: event.payload.building
                }
            }
            return null
        }
    })
})

export const Bed = Entity.create({
    name: 'Bed',
    properties: [
        Property.create({ name: 'number', type: 'string' }),
        Property.create({ name: 'status', type: 'string' }), // StateMachine will be added below
        Property.create({ name: 'assignedAt', type: 'number' }) // No computation yet - optional field
    ],
    computation: Transform.create({
        record: Dormitory,
        attributeQuery: ['*'],
        callback: (dormitory) => {
            // Create multiple beds based on dormitory capacity
            const beds = []
            for (let i = 0; i < dormitory.capacity; i++) {
                beds.push({
                    number: String.fromCharCode(65 + i), // A, B, C, D, E, F
                    status: 'vacant'
                })
            }
            return beds
        }
    })
})

// Add Bed.status StateMachine using assignment pattern
Bed.properties[1] = Property.create({
    name: 'status',
    type: 'string',
    computation: StateMachine.create({
        states: [vacantState, occupiedState],
        transfers: [
            StateTransfer.create({
                trigger: AssignUserToDormitoryInteraction,
                current: vacantState,
                next: occupiedState,
                computeTarget: (event) => {
                    // Transition bed status to occupied when assigned
                    return { id: event.payload.bedId }
                }
            })
        ],
        defaultState: vacantState
    })
})

// Bed.assignedAt will be handled by a simpler approach - no complex computation needed for this phase

export const ViolationRecord = Entity.create({
    name: 'ViolationRecord',
    properties: [
        Property.create({ name: 'description', type: 'string' }),
        Property.create({ name: 'points', type: 'number' }),
        Property.create({ name: 'category', type: 'string' }),
        Property.create({ 
            name: 'createdAt', 
            type: 'number',
            defaultValue: () => Math.floor(Date.now() / 1000)
        }),
        Property.create({ name: 'recordedBy', type: 'string' }) // Set in Transform
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['*'],
        callback: (event) => {
            if (event.interactionName === 'recordViolation') {
                return {
                    description: event.payload.description,
                    points: event.payload.points,
                    category: event.payload.category,
                    recordedBy: event.user?.name || 'Unknown'
                }
            }
            return null
        }
    })
})

export const EvictionRequest = Entity.create({
    name: 'EvictionRequest',
    properties: [
        Property.create({ name: 'reason', type: 'string' }),
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
        Property.create({ name: 'decidedAt', type: 'number' }),
        Property.create({ name: 'adminNotes', type: 'string' })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['*'],
        callback: (event) => {
            if (event.interactionName === 'submitEvictionRequest') {
                return {
                    reason: event.payload.reason,
                    status: 'pending'
                }
            }
            return null
        }
    })
})

// ============================================================================
// RELATIONS (Step 3.1.2)
// ============================================================================

export const UserDormitoryRelation = Relation.create({
    source: User,
    sourceProperty: 'dormitory',
    target: Dormitory,
    targetProperty: 'residents',
    type: 'n:1',
    properties: [
        Property.create({ 
            name: 'assignedAt', 
            type: 'number',
            defaultValue: () => Math.floor(Date.now() / 1000)
        }),
        Property.create({ name: 'assignedBy', type: 'string' })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['*'],
        callback: (event) => {
            if (event.interactionName === 'assignUserToDormitory') {
                return {
                    source: { id: event.payload.userId },
                    target: { id: event.payload.dormitoryId },
                    assignedBy: event.user?.name || 'Unknown'
                }
            }
            return null
        }
    })
})

export const UserBedRelation = Relation.create({
    source: User,
    sourceProperty: 'bed',
    target: Bed,
    targetProperty: 'occupant',
    type: '1:1',
    computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['*'],
        callback: (event) => {
            if (event.interactionName === 'assignUserToDormitory') {
                return {
                    source: { id: event.payload.userId },
                    target: { id: event.payload.bedId }
                }
            }
            return null
        }
    })
})

export const DormitoryBedRelation = Relation.create({
    source: Dormitory,
    sourceProperty: 'beds',
    target: Bed,
    targetProperty: 'dormitory',
    type: '1:n'
})

export const DormitoryDormHeadRelation = Relation.create({
    source: Dormitory,
    sourceProperty: 'dormHead',
    target: User,
    targetProperty: 'managedDormitory',
    type: '1:1',
    properties: [
        Property.create({ 
            name: 'appointedAt', 
            type: 'number',
            defaultValue: () => Math.floor(Date.now() / 1000)
        }),
        Property.create({ name: 'appointedBy', type: 'string' })
    ],
    computation: Transform.create({
        record: InteractionEventEntity,
        attributeQuery: ['*'],
        callback: (event) => {
            if (event.interactionName === 'appointDormHead') {
                return {
                    source: { id: event.payload.dormitoryId },
                    target: { id: event.payload.userId },
                    appointedBy: event.user?.name || 'Unknown'
                }
            }
            return null
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

// ============================================================================
// EXPORTS
// ============================================================================

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

// ============================================================================
// PHASE 6 - COMPUTED PROPERTIES (after all relations are defined)
// ============================================================================

// Add Dormitory.occupancy Custom computation using assignment pattern  
// For now, count all occupied beds globally - will be fixed when proper dormitory-bed linking is established
Dormitory.properties[6] = Property.create({
    name: 'occupancy',
    type: 'number',
    computation: Custom.create({
        name: 'OccupancyCalculator',
        dataDeps: {
            allBeds: {
                type: 'records',
                source: Bed,
                attributeQuery: ['status']
            }
        },
        compute: async function(dataDeps) {
            const beds = dataDeps.allBeds || []
            const occupiedCount = beds.filter(bed => bed.status === 'occupied').length
            return occupiedCount
        }
    })
})

// Add Dormitory.availableBeds Custom computation using assignment pattern
Dormitory.properties[7] = Property.create({
    name: 'availableBeds',
    type: 'number',
    computation: Custom.create({
        name: 'AvailableBedsCalculator',
        dataDeps: {
            _current: {
                type: 'property',
                attributeQuery: ['capacity', 'occupancy']
            }
        },
        compute: async function(dataDeps) {
            const current = dataDeps._current
            return (current.capacity || 0) - (current.occupancy || 0)
        }
    })
})

// Add Dormitory.occupancyRate Custom computation using assignment pattern
Dormitory.properties[8] = Property.create({
    name: 'occupancyRate',
    type: 'number',
    computation: Custom.create({
        name: 'OccupancyRateCalculator',
        dataDeps: {
            _current: {
                type: 'property',
                attributeQuery: ['capacity', 'occupancy']
            }
        },
        compute: async function(dataDeps) {
            const current = dataDeps._current
            const capacity = current.capacity || 0
            const occupancy = current.occupancy || 0
            
            if (capacity === 0) {
                return 0
            }
            
            return Math.round((occupancy / capacity) * 100)
        }
    })
})

// ============================================================================
// INTERACTIONS (Step 3.1.3 - No conditions yet)
// ============================================================================

export const CreateDormitoryInteraction = Interaction.create({
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

// AppointDormHeadInteraction already declared above for StateMachine
// AssignUserToDormitoryInteraction already declared above for StateMachine

export const RecordViolationInteraction = Interaction.create({
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

export const SubmitEvictionRequestInteraction = Interaction.create({
    name: 'submitEvictionRequest',
    action: Action.create({ name: 'submit' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'userId', required: true }),
            PayloadItem.create({ name: 'reason', required: true })
        ]
    })
})

// ReviewEvictionRequestInteraction already declared above for StateMachine

export const ViewMyDormitoryInteraction = Interaction.create({
    name: 'viewMyDormitory',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'userId', required: false })
        ]
    })
})

export const ViewMyViolationsInteraction = Interaction.create({
    name: 'viewMyViolations',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'userId', required: false })
        ]
    })
})

export const ViewMyEvictionStatusInteraction = Interaction.create({
    name: 'viewMyEvictionStatus',
    action: Action.create({ name: 'view' }),
    payload: Payload.create({
        items: [
            PayloadItem.create({ name: 'userId', required: false })
        ]
    })
})

export const interactions = [
    CreateDormitoryInteraction,
    AppointDormHeadInteraction,
    AssignUserToDormitoryInteraction,
    RecordViolationInteraction,
    SubmitEvictionRequestInteraction,
    ReviewEvictionRequestInteraction,
    ViewMyDormitoryInteraction,
    ViewMyViolationsInteraction,
    ViewMyEvictionStatusInteraction
]
export const dicts = [pointsTrigger]