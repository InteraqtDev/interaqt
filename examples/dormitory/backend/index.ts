import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Controller,
  Count,
  Summation,
  StateMachine,
  StateNode,
  StateTransfer,
  Transform,
  Condition,
  Conditions,
  BoolExp,
  MatchExp,
  InteractionEventEntity,
  GetAction
} from 'interaqt';

// ============ Entity Definitions ============

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'phone', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }), // Will add default value in computation phase
    Property.create({ name: 'status', type: 'string' }), // Will add default value in computation phase
    Property.create({ name: 'totalPoints', type: 'number' }), // Will add computation
    Property.create({ name: 'isRemovable', type: 'boolean' }), // Will add computation
    Property.create({ name: 'isDormHead', type: 'boolean' }), // Will add computation
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'updatedAt', type: 'number' }) // No defaultValue - managed by computation
  ]
});

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'floor', type: 'number' }),
    Property.create({ name: 'building', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // Will add default value in computation phase
    Property.create({ name: 'occupancy', type: 'number' }), // Will add computation
    Property.create({ name: 'availableBeds', type: 'number' }), // Will add computation
    Property.create({ name: 'hasDormHead', type: 'boolean' }), // Will add computation
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'updatedAt', type: 'number' }) // No defaultValue - managed by computation
  ]
});

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'bedNumber', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // Will add computation
    Property.create({ name: 'isAvailable', type: 'boolean' }), // Will add computation
    Property.create({ name: 'assignedAt', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'updatedAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) })
  ]
});

const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'category', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // Will add default value in computation phase
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'evidence', type: 'string' }),
    Property.create({ name: 'deductedAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) })
  ]
});

const RemovalRequest = Entity.create({
  name: 'RemovalRequest',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'totalPoints', type: 'number' }), // Will add computation
    Property.create({ name: 'status', type: 'string' }), // Will add default value in computation phase
    Property.create({ name: 'adminComment', type: 'string', defaultValue: null }),
    Property.create({ name: 'processedAt', type: 'number' }), // Will add computation
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    Property.create({ name: 'updatedAt', type: 'number' }) // Will add computation - removed defaultValue
  ]
});

// ============ Relation Definitions ============

const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1'
});

const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1'
});

const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
});

const DormitoryDormHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: 'n:1'
});

const UserPointDeductionRelation = Relation.create({
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n'
});

const DeductionIssuerRelation = Relation.create({
  source: PointDeduction,
  sourceProperty: 'issuedBy',
  target: User,
  targetProperty: 'issuedDeductions',
  type: 'n:1'
});

const RemovalRequestTargetRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'removalRequests',
  type: 'n:1'
});

const RemovalRequestInitiatorRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'requestedBy',
  target: User,
  targetProperty: 'initiatedRemovalRequests',
  type: 'n:1'
});

const RemovalRequestAdminRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'processedBy',
  target: User,
  targetProperty: 'processedRemovalRequests',
  type: 'n:1'
});

// ============ Export definitions ============

export const entities = [
  User,
  Dormitory,
  Bed,
  PointDeduction,
  RemovalRequest
];

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserPointDeductionRelation,
  DeductionIssuerRelation,
  RemovalRequestTargetRelation,
  RemovalRequestInitiatorRelation,
  RemovalRequestAdminRelation
];

// ============ Interaction Definitions ============

// User Management

const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'phone', required: false }),
      PayloadItem.create({ name: 'role', required: true })
    ]
  })
});

const RegisterUser = Interaction.create({
  name: 'RegisterUser',
  action: Action.create({ name: 'register' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'phone', required: false })
    ]
  })
});

const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'name', required: false }),
      PayloadItem.create({ name: 'phone', required: false })
    ]
  })
});

// Dormitory Management

const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true }),
      PayloadItem.create({ name: 'floor', required: false }),
      PayloadItem.create({ name: 'building', required: false })
    ]
  })
});

const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name', required: false }),
      PayloadItem.create({ name: 'floor', required: false }),
      PayloadItem.create({ name: 'building', required: false })
    ]
  })
});

const DeactivateDormitory = Interaction.create({
  name: 'DeactivateDormitory',
  action: Action.create({ name: 'deactivate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

// Assignment Management

const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'remove' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedId', required: false })
    ]
  })
});

const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'remove' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

// Point Deduction System

const IssuePointDeduction = Interaction.create({
  name: 'IssuePointDeduction',
  action: Action.create({ name: 'issue' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'category', required: true }),
      PayloadItem.create({ name: 'description', required: false }),
      PayloadItem.create({ name: 'evidence', required: false })
    ]
  })
});

// Removal Request System

const InitiateRemovalRequest = Interaction.create({
  name: 'InitiateRemovalRequest',
  action: Action.create({ name: 'initiate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

const ProcessRemovalRequest = Interaction.create({
  name: 'ProcessRemovalRequest',
  action: Action.create({ name: 'process' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true }),
      PayloadItem.create({ name: 'adminComment', required: false })
    ]
  })
});

const CancelRemovalRequest = Interaction.create({
  name: 'CancelRemovalRequest',
  action: Action.create({ name: 'cancel' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  })
});

// View/Query Interactions

const ViewSystemStats = Interaction.create({
  name: 'ViewSystemStats',
  action: GetAction,
  data: User
});

const ViewDormitoryStats = Interaction.create({
  name: 'ViewDormitoryStats',
  action: GetAction,
  data: Dormitory
});

const ViewUserDeductions = Interaction.create({
  name: 'ViewUserDeductions',
  action: GetAction,
  data: PointDeduction
});

const ViewMyDormitory = Interaction.create({
  name: 'ViewMyDormitory',
  action: GetAction,
  data: Dormitory
});

const ViewMyDeductions = Interaction.create({
  name: 'ViewMyDeductions',
  action: GetAction,
  data: PointDeduction
});

const ViewMyBed = Interaction.create({
  name: 'ViewMyBed',
  action: GetAction,
  data: Bed
});

export const interactions = [
  CreateUser,
  RegisterUser,
  UpdateUserProfile,
  CreateDormitory,
  UpdateDormitory,
  DeactivateDormitory,
  AssignDormHead,
  RemoveDormHead,
  AssignUserToDormitory,
  RemoveUserFromDormitory,
  IssuePointDeduction,
  InitiateRemovalRequest,
  ProcessRemovalRequest,
  CancelRemovalRequest,
  ViewSystemStats,
  ViewDormitoryStats,
  ViewUserDeductions,
  ViewMyDormitory,
  ViewMyDeductions,
  ViewMyBed
];

export const activities = [];

export const dicts = [];

// ============ Computations will be added progressively below this line ============

// Phase 1: Entity Transform Computations

// User entity Transform computation - handles user creation from interactions
User.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'id',
    'interactionName',
    'payload',
    'user'  // user is a simple object, not an entity reference
  ],
  callback: function(event) {
    // Handle CreateUser interaction (admin creates user)
    if (event.interactionName === 'CreateUser') {
      return {
        name: event.payload.name,
        email: event.payload.email,
        phone: event.payload.phone || null,
        role: event.payload.role,
        status: 'active',  // Default status when created
        createdAt: Math.floor(Date.now()/1000),
        updatedAt: Math.floor(Date.now()/1000)
      };
    }
    
    // Handle RegisterUser interaction (self-registration)
    if (event.interactionName === 'RegisterUser') {
      return {
        name: event.payload.name,
        email: event.payload.email,
        phone: event.payload.phone || null,
        role: 'student',  // Default role for self-registration
        status: 'active',  // Default status when registered
        createdAt: Math.floor(Date.now()/1000),
        updatedAt: Math.floor(Date.now()/1000)
      };
    }
    
    return null; // Return null for other interactions
  }
});

// Dormitory entity Transform computation - handles dormitory creation from interactions
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'id',
    'interactionName',
    'payload',
    'user'
  ],
  callback: function(event) {
    // Handle CreateDormitory interaction (admin creates dormitory)
    if (event.interactionName === 'CreateDormitory') {
      return {
        name: event.payload.name,
        capacity: event.payload.capacity,
        floor: event.payload.floor || null,
        building: event.payload.building || null,
        status: 'active',  // Default status when created
        createdAt: Math.floor(Date.now()/1000),
        updatedAt: Math.floor(Date.now()/1000)
      };
    }
    
    return null; // Return null for other interactions
  }
});

// Transform computation for Bed entity - creates beds from Dormitory
// This uses the Dormitory as source, which allows us to access the dormitory ID
Bed.computation = Transform.create({
  record: Dormitory,
  attributeQuery: [
    'id',
    'capacity',
    'name'
  ],
  callback: function(dormitory) {
    // Create beds for each dormitory
    const beds = [];
    for (let i = 1; i <= dormitory.capacity; i++) {
      beds.push({
        bedNumber: `${i}`,
        status: 'available',
        dormitory: { id: dormitory.id },  // Reference to the dormitory (creates relation automatically)
        createdAt: Math.floor(Date.now()/1000),
        updatedAt: Math.floor(Date.now()/1000)
      });
    }
    // Return array to create multiple beds
    return beds;
  }
});

// PointDeduction entity Transform computation - handles point deduction creation from interactions
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'id',
    'interactionName',
    'payload',
    'user'
  ],
  callback: function(event) {
    // Handle IssuePointDeduction interaction
    if (event.interactionName === 'IssuePointDeduction') {
      return {
        reason: event.payload.reason,
        points: event.payload.points,
        category: event.payload.category || 'general',
        status: 'active',  // Default status when created
        description: event.payload.description || null,
        evidence: event.payload.evidence || null,
        deductedAt: Math.floor(Date.now()/1000),
        createdAt: Math.floor(Date.now()/1000),
        // Create relations to both the target user and issuer
        user: { id: event.payload.userId },  // Creates UserPointDeductionRelation
        issuedBy: { id: event.user.id }  // Creates DeductionIssuerRelation
      };
    }
    
    return null; // Return null for other interactions
  }
});

// RemovalRequest entity Transform computation - handles removal request creation from interactions
RemovalRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'id',
    'interactionName',
    'payload',
    'user'
  ],
  callback: function(event) {
    // Handle InitiateRemovalRequest interaction
    if (event.interactionName === 'InitiateRemovalRequest') {
      return {
        reason: event.payload.reason,
        status: 'pending',  // Default status when created
        // adminComment and processedAt are handled by defaultValue in property definition
        createdAt: Math.floor(Date.now()/1000),
        updatedAt: Math.floor(Date.now()/1000),
        // Create relations to both the target user and initiator
        // Note: event.user is a simple object from interaction call, not an entity reference
        // We need to look up the actual user entity by the ID provided
        targetUser: { id: event.payload.userId },  // Creates RemovalRequestTargetRelation
        requestedBy: event.user ? { id: event.user.id } : null  // Creates RemovalRequestInitiatorRelation only if user exists
      };
    }
    
    return null; // Return null for other interactions
  }
});

// Phase 2: Relation and Property Computations

// UserDormitoryRelation StateMachine computation - handles user-dormitory assignment
// Define states for the relation
const userDormNotExistsState = StateNode.create({
  name: 'notExists',
  computeValue: () => null  // Return null means no relation
});

const userDormExistsState = StateNode.create({
  name: 'exists',
  computeValue: () => ({})  // Relation exists
});

UserDormitoryRelation.computation = StateMachine.create({
  states: [userDormNotExistsState, userDormExistsState],
  defaultState: userDormNotExistsState,
  transfers: [
    // Create relation on AssignUserToDormitory
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: userDormNotExistsState,
      next: userDormExistsState,
      computeTarget: (event) => ({
        source: { id: event.payload.userId },
        target: { id: event.payload.dormitoryId }
      })
    }),
    // Delete relation on RemoveUserFromDormitory
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: userDormExistsState,
      next: userDormNotExistsState,
      computeTarget: async function(this: Controller, event) {
        // Find the existing relation to delete
        const relations = await this.system.storage.find(
          UserDormitoryRelation.name,
          BoolExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }),
          undefined,
          ['id']
        );
        return relations[0]; // Return the first (and should be only) relation
      }
    }),
    // Delete relation on ProcessRemovalRequest when approved
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userDormExistsState,
      next: userDormNotExistsState,
      computeTarget: async function(this: Controller, event) {
        // Only process if the request is approved
        if (event.payload.decision !== 'approved') {
          return null;
        }
        
        // Find the removal request to get the target user
        const removalRequest = await this.system.storage.findOne(
          'RemovalRequest',
          BoolExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          [
            'id',
            ['targetUser', { attributeQuery: ['id'] }]
          ]
        );
        
        if (!removalRequest || !removalRequest.targetUser) {
          return null;
        }
        
        // Find the user's dormitory relation to delete
        const relations = await this.system.storage.find(
          UserDormitoryRelation.name,
          BoolExp.atom({
            key: 'source.id',
            value: ['=', removalRequest.targetUser.id]
          }),
          undefined,
          ['id']
        );
        
        return relations[0]; // Return the first (and should be only) relation
      }
    })
  ]
});

// DormitoryDormHeadRelation computation - StateMachine for managing dorm head assignments
// Define states for the DormitoryDormHeadRelation
const dormHeadNotExistsState = StateNode.create({
  name: 'notExists',
  computeValue: () => null  // Relation does not exist
});

const dormHeadExistsState = StateNode.create({
  name: 'exists',
  computeValue: () => ({})  // Relation exists
});

DormitoryDormHeadRelation.computation = StateMachine.create({
  states: [dormHeadNotExistsState, dormHeadExistsState],
  defaultState: dormHeadNotExistsState,
  transfers: [
    // Create relation on AssignDormHead
    StateTransfer.create({
      trigger: AssignDormHead,
      current: dormHeadNotExistsState,
      next: dormHeadExistsState,
      computeTarget: async function(this: Controller, event) {
        // Create the relation between dormitory and user (dorm head)
        const dormitory = await this.system.storage.findOne(
          'Dormitory',
          BoolExp.atom({ key: 'id', value: ['=', event.payload.dormitoryId] }),
          undefined,
          ['id']
        );
        
        const user = await this.system.storage.findOne(
          'User',
          BoolExp.atom({ key: 'id', value: ['=', event.payload.userId] }),
          undefined,
          ['id']
        );
        
        if (!dormitory || !user) {
          return null;
        }
        
        return {
          source: dormitory,
          target: user
        };
      }
    }),
    // Delete relation on RemoveDormHead
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: dormHeadExistsState,
      next: dormHeadNotExistsState,
      computeTarget: async function(this: Controller, event) {
        // Find and return the relation to be removed
        const relations = await this.system.storage.find(
          DormitoryDormHeadRelation.name,
          BoolExp.atom({ key: 'target.id', value: ['=', event.payload.userId] }),
          undefined,
          ['id']
        );
        
        return relations[0]; // Return the first (and should be only) relation
      }
    })
  ]
});

// User.name StateMachine computation - handles name updates from UpdateUserProfile
const userNameDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue) => lastValue  // Keep existing value
});

const userNameUpdatedState = StateNode.create({
  name: 'updated',
  computeValue: (lastValue, event) => {
    // Update name from UpdateUserProfile payload
    if (event && event.payload && event.payload.name !== undefined) {
      return event.payload.name;
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [userNameDefaultState, userNameUpdatedState],
  defaultState: userNameDefaultState,
  transfers: [
    // Handle UpdateUserProfile to update name
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userNameDefaultState,
      next: userNameUpdatedState,
      computeTarget: (event) => {
        // Target the user being updated
        return { id: event.payload.userId };
      }
    }),
    // Return to default state after update (for subsequent updates)
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userNameUpdatedState,
      next: userNameUpdatedState,
      computeTarget: (event) => {
        return { id: event.payload.userId };
      }
    })
  ]
});

// User.phone StateMachine computation - handles phone updates from UpdateUserProfile
const userPhoneDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue) => lastValue  // Keep existing value
});

const userPhoneUpdatedState = StateNode.create({
  name: 'updated',
  computeValue: (lastValue, event) => {
    // Update phone from UpdateUserProfile payload
    if (event && event.payload && event.payload.phone !== undefined) {
      return event.payload.phone;
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'phone').computation = StateMachine.create({
  states: [userPhoneDefaultState, userPhoneUpdatedState],
  defaultState: userPhoneDefaultState,
  transfers: [
    // Handle UpdateUserProfile to update phone
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userPhoneDefaultState,
      next: userPhoneUpdatedState,
      computeTarget: (event) => {
        // Target the user being updated
        return { id: event.payload.userId };
      }
    }),
    // Stay in updated state for subsequent updates
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userPhoneUpdatedState,
      next: userPhoneUpdatedState,
      computeTarget: (event) => {
        return { id: event.payload.userId };
      }
    })
  ]
});

// User.role StateMachine computation - handles role changes from interactions
const userRoleState = StateNode.create({
  name: 'roleState',
  computeValue: (lastValue, event) => {
    // Handle CreateUser - use role from payload
    if (event && event.interactionName === 'CreateUser') {
      return event.payload.role;
    }
    
    // Handle RegisterUser - always set to student
    if (event && event.interactionName === 'RegisterUser') {
      return 'student';
    }
    
    // Handle AssignDormHead - change to dormHead
    if (event && event.interactionName === 'AssignDormHead') {
      return 'dormHead';
    }
    
    // Handle RemoveDormHead - change back to student
    if (event && event.interactionName === 'RemoveDormHead') {
      return 'student';
    }
    
    // Keep existing value if no matching interaction
    return lastValue;
  }
});

User.properties.find(p => p.name === 'role').computation = StateMachine.create({
  states: [userRoleState],
  defaultState: userRoleState,
  transfers: [
    // Handle AssignDormHead - change role to dormHead
    StateTransfer.create({
      trigger: AssignDormHead,
      current: userRoleState,
      next: userRoleState,
      computeTarget: (event) => {
        return { id: event.payload.userId };
      }
    }),
    // Handle RemoveDormHead - change role back to student
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: userRoleState,
      next: userRoleState,
      computeTarget: (event) => {
        return { id: event.payload.userId };
      }
    })
  ]
});

// RemovalRequestAdminRelation Transform computation - handles admin processing removal requests
RemovalRequestAdminRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: [
    'id',
    'interactionName',
    'payload',
    'user'
  ],
  callback: function(event) {
    // Handle ProcessRemovalRequest interaction - creates relation when admin processes a request
    if (event.interactionName === 'ProcessRemovalRequest') {
      // Only create relation if there's a user (admin) processing the request
      if (!event.user || !event.user.id) {
        return null;
      }
      
      return {
        source: { id: event.payload.requestId },  // RemovalRequest
        target: { id: event.user.id }  // Admin User who processed it
      };
    }
    
    return null; // Return null for other interactions
  }
});

// User.status StateMachine computation - handles status transitions from interactions
const userStatusActiveState = StateNode.create({
  name: 'active',
  computeValue: () => 'active'
});

const userStatusSuspendedState = StateNode.create({
  name: 'suspended',
  computeValue: () => 'suspended'
});

const userStatusRemovedState = StateNode.create({
  name: 'removed',
  computeValue: () => 'removed'
});

User.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [userStatusActiveState, userStatusSuspendedState, userStatusRemovedState],
  defaultState: userStatusActiveState,
  transfers: [
    // RemoveUserFromDormitory can set status to suspended
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: userStatusActiveState,
      next: userStatusSuspendedState,
      computeTarget: (event) => {
        return { id: event.payload.userId };
      }
    }),
    // ProcessRemovalRequest with approved status sets user to removed
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userStatusActiveState,
      next: userStatusRemovedState,
      computeTarget: async function(this: Controller, event) {
        // Only proceed if decision is approve
        if (event.payload.decision !== 'approve') {
          return null;
        }
        
        // Get the removal request to find the target user
        const request = await this.system.storage.findOne(
          'RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          ['id', ['targetUser', { attributeQuery: ['id'] }]]
        );
        if (request && request.targetUser) {
          return { id: request.targetUser.id };
        }
        return null;
      }
    }),
    // ProcessRemovalRequest with approved status can also transition from suspended to removed
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userStatusSuspendedState,
      next: userStatusRemovedState,
      computeTarget: async function(this: Controller, event) {
        // Only proceed if decision is approve
        if (event.payload.decision !== 'approve') {
          return null;
        }
        
        // Get the removal request to find the target user
        const request = await this.system.storage.findOne(
          'RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          ['id', ['targetUser', { attributeQuery: ['id'] }]]
        );
        if (request && request.targetUser) {
          return { id: request.targetUser.id };
        }
        return null;
      }
    })
  ]
});

// User.updatedAt computation - updates timestamp on modifications
const userUpdatedAtInitialState = StateNode.create({
  name: 'initial',
  computeValue: () => null
});

const userUpdatedAtUpdatedState = StateNode.create({
  name: 'updated',
  computeValue: () => Math.floor(Date.now()/1000) // Unix timestamp in seconds
});

User.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [userUpdatedAtInitialState, userUpdatedAtUpdatedState],
  defaultState: userUpdatedAtInitialState,
  transfers: [
    // UpdateUserProfile updates timestamp
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userUpdatedAtInitialState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        return { id: event.payload.userId };
      }
    }),
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userUpdatedAtUpdatedState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        return { id: event.payload.userId };
      }
    }),
    // AssignDormHead updates timestamp
    StateTransfer.create({
      trigger: AssignDormHead,
      current: userUpdatedAtInitialState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        return { id: event.payload.userId };
      }
    }),
    StateTransfer.create({
      trigger: AssignDormHead,
      current: userUpdatedAtUpdatedState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        return { id: event.payload.userId };
      }
    }),
    // RemoveDormHead updates timestamp
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: userUpdatedAtInitialState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        return { id: event.payload.userId };
      }
    }),
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: userUpdatedAtUpdatedState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        return { id: event.payload.userId };
      }
    }),
    // ProcessRemovalRequest updates timestamp when user is removed
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userUpdatedAtInitialState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        // Only update if decision is approve
        if (event.payload.decision !== 'approve') {
          return null;
        }
        
        // Get the removal request to find the target user
        const request = await this.system.storage.findOne(
          'RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          ['id', ['targetUser', { attributeQuery: ['id'] }]]
        );
        if (request && request.targetUser) {
          return { id: request.targetUser.id };
        }
        return null;
      }
    }),
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userUpdatedAtUpdatedState,
      next: userUpdatedAtUpdatedState,
      computeTarget: async function(this: Controller, event) {
        // Only update if decision is approve
        if (event.payload.decision !== 'approve') {
          return null;
        }
        
        // Get the removal request to find the target user
        const request = await this.system.storage.findOne(
          'RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          ['id', ['targetUser', { attributeQuery: ['id'] }]]
        );
        if (request && request.targetUser) {
          return { id: request.targetUser.id };
        }
        return null;
      }
    })
  ]
});

// Dormitory.name computation - StateMachine (handles updates only, creation handled by Transform)
const dormitoryNameDefaultState = StateNode.create({
  name: 'dormitoryNameDefault',
  computeValue: function(lastValue: any) {
    // Keep the existing value (set by Transform during creation)
    return lastValue;
  }
});

const dormitoryNameUpdatedState = StateNode.create({
  name: 'dormitoryNameUpdated',
  computeValue: function(_: {}, event: any) {
    return event.payload.name;
  }
});

Dormitory.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [dormitoryNameDefaultState, dormitoryNameUpdatedState],
  defaultState: dormitoryNameDefaultState,
  transfers: [
    // UpdateDormitory updates the name
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryNameDefaultState,
      next: dormitoryNameUpdatedState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    }),
    // Allow subsequent updates
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryNameUpdatedState,
      next: dormitoryNameUpdatedState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    })
  ]
});

// Dormitory.floor computation - StateMachine (handles setting and updating floor)
const dormitoryFloorDefaultState = StateNode.create({
  name: 'dormitoryFloorDefault',
  computeValue: function(lastValue: any) {
    // Keep the existing value (set by Transform during creation or null if not set)
    return lastValue;
  }
});

const dormitoryFloorUpdatedState = StateNode.create({
  name: 'dormitoryFloorUpdated',
  computeValue: function(_: {}, event: any) {
    // UpdateDormitory can update the floor
    if (event.payload.floor !== undefined) {
      return event.payload.floor;
    }
    return _;
  }
});

Dormitory.properties.find(p => p.name === 'floor').computation = StateMachine.create({
  states: [dormitoryFloorDefaultState, dormitoryFloorUpdatedState],
  defaultState: dormitoryFloorDefaultState,
  transfers: [
    // UpdateDormitory updates the floor
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryFloorDefaultState,
      next: dormitoryFloorUpdatedState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    }),
    // Allow subsequent updates
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryFloorUpdatedState,
      next: dormitoryFloorUpdatedState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    })
  ]
});

// Dormitory.building computation - StateMachine (handles setting and updating building)
const dormitoryBuildingDefaultState = StateNode.create({
  name: 'dormitoryBuildingDefault',
  computeValue: function(lastValue: any) {
    // Keep the existing value (set by Transform during creation or null if not set)
    return lastValue;
  }
});

const dormitoryBuildingUpdatedState = StateNode.create({
  name: 'dormitoryBuildingUpdated',
  computeValue: function(_: {}, event: any) {
    // UpdateDormitory can update the building
    if (event.payload.building !== undefined) {
      return event.payload.building;
    }
    return _;
  }
});

Dormitory.properties.find(p => p.name === 'building').computation = StateMachine.create({
  states: [dormitoryBuildingDefaultState, dormitoryBuildingUpdatedState],
  defaultState: dormitoryBuildingDefaultState,
  transfers: [
    // UpdateDormitory updates the building
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryBuildingDefaultState,
      next: dormitoryBuildingUpdatedState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    }),
    // Allow subsequent updates
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryBuildingUpdatedState,
      next: dormitoryBuildingUpdatedState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    })
  ]
});

// Dormitory.status computation - StateMachine (manages status transitions)
const dormitoryStatusActiveState = StateNode.create({
  name: 'dormitoryStatusActive',
  computeValue: function() {
    return 'active';
  }
});

const dormitoryStatusInactiveState = StateNode.create({
  name: 'dormitoryStatusInactive',
  computeValue: function() {
    return 'inactive';
  }
});

Dormitory.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [dormitoryStatusActiveState, dormitoryStatusInactiveState],
  defaultState: dormitoryStatusActiveState,
  transfers: [
    // DeactivateDormitory changes status from active to inactive
    StateTransfer.create({
      trigger: DeactivateDormitory,
      current: dormitoryStatusActiveState,
      next: dormitoryStatusInactiveState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    })
  ]
});

// Dormitory.updatedAt computation - StateMachine (tracks modification timestamp)
const dormitoryUpdatedAtState = StateNode.create({
  name: 'dormitoryUpdatedAtState',
  computeValue: function(lastValue: any, event: any) {
    // Update timestamp when UpdateDormitory or DeactivateDormitory is triggered
    if (event && (event.interactionName === 'UpdateDormitory' || event.interactionName === 'DeactivateDormitory')) {
      return Math.floor(Date.now() / 1000);
    }
    // Keep existing value if no matching interaction
    return lastValue;
  }
});

Dormitory.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [dormitoryUpdatedAtState],
  defaultState: dormitoryUpdatedAtState,
  transfers: [
    // UpdateDormitory updates the timestamp
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryUpdatedAtState,
      next: dormitoryUpdatedAtState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    }),
    // DeactivateDormitory also updates the timestamp
    StateTransfer.create({
      trigger: DeactivateDormitory,
      current: dormitoryUpdatedAtState,
      next: dormitoryUpdatedAtState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId };
      }
    })
  ]
});

// PointDeduction.status computation - StateMachine (manages status transitions)
const pointDeductionStatusActiveState = StateNode.create({
  name: 'pointDeductionStatusActive',
  computeValue: function() {
    return 'active';
  }
});

const pointDeductionStatusCancelledState = StateNode.create({
  name: 'pointDeductionStatusCancelled',
  computeValue: function() {
    return 'cancelled';
  }
});

PointDeduction.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [pointDeductionStatusActiveState, pointDeductionStatusCancelledState],
  defaultState: pointDeductionStatusActiveState,
  transfers: [
    // Future: Add StateTransfer for CancelPointDeduction interaction when appeal system is implemented
    // StateTransfer.create({
    //   trigger: CancelPointDeduction,
    //   current: pointDeductionStatusActiveState,
    //   next: pointDeductionStatusCancelledState,
    //   computeTarget: function(event: any) {
    //     return { id: event.payload.deductionId };
    //   }
    // })
  ]
});

// RemovalRequest.status computation - StateMachine (manages status transitions)
const removalRequestStatusPendingState = StateNode.create({
  name: 'removalRequestStatusPending',
  computeValue: function() {
    return 'pending';
  }
});

const removalRequestStatusProcessedState = StateNode.create({
  name: 'removalRequestStatusProcessed',
  computeValue: function(_: any, event: any) {
    // Determine status based on the decision in the payload
    if (event && event.payload && event.payload.decision === 'approve') {
      return 'approved';
    } else if (event && event.payload && event.payload.decision === 'reject') {
      return 'rejected';
    }
    // This shouldn't happen, but return rejected as fallback
    return 'rejected';
  }
});

const removalRequestStatusCancelledState = StateNode.create({
  name: 'removalRequestStatusCancelled',
  computeValue: function() {
    return 'cancelled';
  }
});

RemovalRequest.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [
    removalRequestStatusPendingState,
    removalRequestStatusProcessedState,
    removalRequestStatusCancelledState
  ],
  defaultState: removalRequestStatusPendingState,
  transfers: [
    // ProcessRemovalRequest processes the request (can be approved or rejected based on payload)
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestStatusPendingState,
      next: removalRequestStatusProcessedState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    }),
    // CancelRemovalRequest cancels the request
    StateTransfer.create({
      trigger: CancelRemovalRequest,
      current: removalRequestStatusPendingState,
      next: removalRequestStatusCancelledState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    })
  ]
});

// RemovalRequest.adminComment computation - StateMachine (set by ProcessRemovalRequest)
const removalRequestAdminCommentDefaultState = StateNode.create({
  name: 'removalRequestAdminCommentDefault',
  computeValue: function() {
    // Always return null for the default state (adminComment not set yet)
    return null;
  }
});

const removalRequestAdminCommentSetState = StateNode.create({
  name: 'removalRequestAdminCommentSet',
  computeValue: function(_: any, event: any) {
    // Set admin comment from ProcessRemovalRequest payload
    if (event && event.payload && event.payload.adminComment) {
      return event.payload.adminComment;
    }
    return null;
  }
});

RemovalRequest.properties.find(p => p.name === 'adminComment').computation = StateMachine.create({
  states: [removalRequestAdminCommentDefaultState, removalRequestAdminCommentSetState],
  defaultState: removalRequestAdminCommentDefaultState,
  transfers: [
    // ProcessRemovalRequest sets the admin comment
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestAdminCommentDefaultState,
      next: removalRequestAdminCommentSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    })
  ]
});

// RemovalRequest.processedAt computation - StateMachine (set when ProcessRemovalRequest executes)
const removalRequestProcessedAtInitialState = StateNode.create({
  name: 'removalRequestProcessedAtInitial',
  computeValue: function() {
    // Initial state - not processed yet
    return null;
  }
});

const removalRequestProcessedAtSetState = StateNode.create({
  name: 'removalRequestProcessedAtSet',
  computeValue: function() {
    // Set to current timestamp when processed
    return Math.floor(Date.now() / 1000);
  }
});

RemovalRequest.properties.find(p => p.name === 'processedAt').computation = StateMachine.create({
  states: [removalRequestProcessedAtInitialState, removalRequestProcessedAtSetState],
  defaultState: removalRequestProcessedAtInitialState,
  transfers: [
    // ProcessRemovalRequest sets the processedAt timestamp
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestProcessedAtInitialState,
      next: removalRequestProcessedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    })
  ]
});

// RemovalRequest.updatedAt computation - StateMachine (updated on ProcessRemovalRequest or CancelRemovalRequest)
const removalRequestUpdatedAtInitialState = StateNode.create({
  name: 'removalRequestUpdatedAtInitial',
  computeValue: function() {
    // Initial state - not updated yet
    return null;
  }
});

const removalRequestUpdatedAtSetState = StateNode.create({
  name: 'removalRequestUpdatedAtSet',
  computeValue: function() {
    // Set to current timestamp when updated
    return Math.floor(Date.now() / 1000);
  }
});

RemovalRequest.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [removalRequestUpdatedAtInitialState, removalRequestUpdatedAtSetState],
  defaultState: removalRequestUpdatedAtInitialState,
  transfers: [
    // ProcessRemovalRequest updates the timestamp (from initial state)
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestUpdatedAtInitialState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    }),
    // ProcessRemovalRequest updates the timestamp (from already updated state)
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestUpdatedAtSetState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    }),
    // CancelRemovalRequest updates the timestamp (from initial state)
    StateTransfer.create({
      trigger: CancelRemovalRequest,
      current: removalRequestUpdatedAtInitialState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    }),
    // CancelRemovalRequest updates the timestamp (from already updated state)
    StateTransfer.create({
      trigger: CancelRemovalRequest,
      current: removalRequestUpdatedAtSetState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId };
      }
    })
  ]
});

// UserBedRelation computation - StateMachine (created by AssignUserToDormitory, deleted by RemoveUserFromDormitory or approved ProcessRemovalRequest)
// Define states for the relation
const userBedNotExistsState = StateNode.create({
  name: 'notExists',
  computeValue: () => null  // Return null means no relation
});

const userBedExistsState = StateNode.create({
  name: 'exists',
  computeValue: () => ({})  // Relation exists
});

UserBedRelation.computation = StateMachine.create({
  states: [userBedNotExistsState, userBedExistsState],
  defaultState: userBedNotExistsState,
  transfers: [
    // Create relation on AssignUserToDormitory
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: userBedNotExistsState,
      next: userBedExistsState,
      computeTarget: (event) => ({
        source: { id: event.payload.userId },
        target: { id: event.payload.bedId }
      })
    }),
    // Delete relation on RemoveUserFromDormitory
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: userBedExistsState,
      next: userBedNotExistsState,
      computeTarget: async function(this: Controller, event) {
        // Find the existing relation to delete
        const relations = await this.system.storage.find(
          UserBedRelation.name,
          BoolExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }),
          undefined,
          ['id']
        );
        return relations[0]; // Return the first (and should be only) relation
      }
    }),
    // Delete relation on ProcessRemovalRequest when approved
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userBedExistsState,
      next: userBedNotExistsState,
      computeTarget: async function(this: Controller, event) {
        // Only process if the request is approved
        if (event.payload.decision !== 'approved') {
          return null;
        }
        
        // Find the removal request to get the target user
        const removalRequest = await this.system.storage.findOne(
          'RemovalRequest',
          BoolExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          [
            'id',
            ['targetUser', { attributeQuery: ['id'] }]
          ]
        );
        
        if (!removalRequest || !removalRequest.targetUser) {
          return null;
        }
        
        // Find the user's bed relation to delete
        const relations = await this.system.storage.find(
          UserBedRelation.name,
          BoolExp.atom({
            key: 'source.id',
            value: ['=', removalRequest.targetUser.id]
          }),
          undefined,
          ['id']
        );
        
        return relations[0]; // Return the first (and should be only) relation
      }
    })
  ]
});

// User.totalPoints computation - Summation (sum of all point deductions for the user)
User.properties.find(p => p.name === 'totalPoints').computation = Summation.create({
  property: 'pointDeductions',  // Use property name from UserPointDeductionRelation
  attributeQuery: ['points']  // Sum the 'points' field from PointDeduction entities
});