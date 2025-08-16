import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Dictionary,
  StateMachine,
  StateNode,
  StateTransfer,
  Transform,
  Count,
  Summation,
  WeightedSummation,
  Every,
  Any,
  Custom,
  RealTime,
  MatchExp,
  BoolExp,
  Condition,
  Conditions,
  InteractionEventEntity,
  Controller
} from 'interaqt';

// ========================
// Entities (without computations initially)
// ========================

const User = Entity.create({
  name: 'User',
  properties: [
    // ID is auto-generated, not defined here
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }), // admin/dormHead/student - will add StateMachine later
    Property.create({ name: 'status', type: 'string' }), // active/evicted - will add StateMachine later
    Property.create({ name: 'points', type: 'number' }), // will add StateMachine with computeValue later
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now() / 1000) })
  ]
});

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }), // 4-6 beds
    Property.create({ name: 'status', type: 'string' }), // active/full - will add computed later
    Property.create({ name: 'occupancy', type: 'number' }), // will add Count computation later
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now() / 1000) })
  ]
});

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'bedNumber', type: 'number' }), // 1-6 within dormitory
    Property.create({ name: 'status', type: 'string' }) // available/occupied - will add computed later
  ]
});

const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now() / 1000) })
  ]
});

const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // pending/approved/rejected - will add StateMachine later
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now() / 1000) }),
    Property.create({ name: 'processedAt', type: 'number' }) // will add StateMachine with computeValue later
  ]
});

// ========================
// Relations
// ========================

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
});

const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'user',
  type: '1:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number' })
  ]
});

const DormitoryBedsRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  properties: []
});

const PointDeductionUserRelation = Relation.create({
  source: PointDeduction,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'pointDeductions',
  type: 'n:1',
  properties: []
});

const PointDeductionRecorderRelation = Relation.create({
  source: PointDeduction,
  sourceProperty: 'recordedBy',
  target: User,
  targetProperty: 'recordedDeductions',
  type: 'n:1',
  properties: []
});

const EvictionRequestUserRelation = Relation.create({
  source: EvictionRequest,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'evictionRequests',
  type: 'n:1',
  properties: []
});

const EvictionRequestRequesterRelation = Relation.create({
  source: EvictionRequest,
  sourceProperty: 'requestedBy',
  target: User,
  targetProperty: 'requestedEvictions',
  type: 'n:1',
  properties: []
});

const EvictionRequestProcessorRelation = Relation.create({
  source: EvictionRequest,
  sourceProperty: 'processedBy',
  target: User,
  targetProperty: 'processedEvictions',
  type: 'n:1',
  properties: []
});

// ========================
// Interactions (to be implemented in Task 3.1.3)
// ========================

// Placeholder interactions - will be fully implemented in next task
const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'role', required: true })
    ]
  })
});

const UpdateUser = Interaction.create({
  name: 'UpdateUser',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'name', required: false })
    ]
  })
});

const UpdateUserRole = Interaction.create({
  name: 'UpdateUserRole',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'role', required: true })
    ]
  })
});

const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  })
});

const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name', required: false })
    ]
  })
});

const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

const AssignUserToBed = Interaction.create({
  name: 'AssignUserToBed',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'bedId', required: true })
    ]
  })
});

const DeductPoints = Interaction.create({
  name: 'DeductPoints',
  action: Action.create({ name: 'deduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

const RequestEviction = Interaction.create({
  name: 'RequestEviction',
  action: Action.create({ name: 'request' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

const ApproveEviction = Interaction.create({
  name: 'ApproveEviction',
  action: Action.create({ name: 'approve' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  })
});

const RejectEviction = Interaction.create({
  name: 'RejectEviction',
  action: Action.create({ name: 'reject' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  })
});

// Query interactions (read-only)
const ViewUser = Interaction.create({
  name: 'ViewUser',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false })
    ]
  })
});

const ViewDormitory = Interaction.create({
  name: 'ViewDormitory',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: false })
    ]
  })
});

const ViewPoints = Interaction.create({
  name: 'ViewPoints',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

const ViewEvictionRequests = Interaction.create({
  name: 'ViewEvictionRequests',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status', required: false })
    ]
  })
});

// ========================
// Export definitions
// ========================

export const entities = [User, Dormitory, Bed, PointDeduction, EvictionRequest];
export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedsRelation,
  PointDeductionUserRelation,
  PointDeductionRecorderRelation,
  EvictionRequestUserRelation,
  EvictionRequestRequesterRelation,
  EvictionRequestProcessorRelation
];
export const interactions = [
  CreateUser,
  UpdateUser,
  UpdateUserRole,
  CreateDormitory,
  UpdateDormitory,
  AssignUserToDormitory,
  AssignUserToBed,
  DeductPoints,
  RequestEviction,
  ApproveEviction,
  RejectEviction,
  ViewUser,
  ViewDormitory,
  ViewPoints,
  ViewEvictionRequests
];

// Empty arrays for now - will be populated as needed
export const activities = [];
export const dicts = [];

// ========================
// Computations (added using assignment pattern)
// ========================

// Phase 1: Entity Computations

// 1. User entity creation via CreateUser interaction
User.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'interactionName',
    'payload'
  ],
  callback: function(event) {
    if (event.interactionName === 'CreateUser') {
      return {
        name: event.payload.name,
        email: event.payload.email,
        role: event.payload.role,  // Set initial role from payload
        status: 'active',  // Initial status
        points: 100  // Initial points
      };
    }
    return null;
  }
});

// 2. Dormitory entity creation via CreateDormitory interaction
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'interactionName',
    'payload'
  ],
  callback: function(event) {
    if (event.interactionName === 'CreateDormitory') {
      return {
        name: event.payload.name,
        capacity: event.payload.capacity,
        status: 'active',  // Initial status
        occupancy: 0  // Initial occupancy
      };
    }
    return null;
  }
});

// 3. Bed entity creation via CreateDormitory interaction (creates multiple beds)
// Note: Beds will be created and linked via the DormitoryBedsRelation
// For now, we'll create beds without the dormitory reference, which will be added via Transform on the relation
Bed.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'interactionName',
    'payload'
  ],
  callback: function(event) {
    if (event.interactionName === 'CreateDormitory') {
      // Create beds equal to dormitory capacity
      const capacity = event.payload.capacity;
      const beds = [];
      
      for (let i = 1; i <= capacity; i++) {
        beds.push({
          bedNumber: i,
          status: 'available'
        });
      }
      
      return beds;
    }
    return null;
  }
});

// 4. PointDeduction entity creation via DeductPoints interaction
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'interactionName',
    'payload',
    'user'
  ],
  callback: function(event) {
    if (event.interactionName === 'DeductPoints') {
      return {
        points: event.payload.points,
        reason: event.payload.reason,
        user: { id: event.payload.userId },  // Reference to the user
        recordedBy: { id: event.user.id }  // Reference to the recorder
      };
    }
    return null;
  }
});

// 5. EvictionRequest entity creation via RequestEviction interaction
EvictionRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'interactionName',
    'payload',
    'user'
  ],
  callback: function(event) {
    if (event.interactionName === 'RequestEviction') {
      return {
        reason: event.payload.reason,
        status: 'pending',  // Initial status
        user: { id: event.payload.userId },  // Reference to the user being evicted
        requestedBy: { id: event.user.id },  // Reference to the requester
        processedAt: null  // Not processed yet
      };
    }
    return null;
  }
});

// Phase 1: Property Computations

// 6. User.role - For now, we'll set it in Transform and handle updates separately
// TODO: Implement proper StateMachine for role management later