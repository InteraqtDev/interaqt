import { Entity, Property, Relation, Interaction, Action, Payload, PayloadItem, Transform, StateMachine, StateNode, StateTransfer, Count, InteractionEventEntity, Attributive, BoolExp, boolExpToAttributives, MatchExp } from 'interaqt';

// === State Definitions for State Machines ===
const studentRoleState = StateNode.create({ name: 'student' });
const dormLeaderRoleState = StateNode.create({ name: 'dorm_leader' });
const adminRoleState = StateNode.create({ name: 'admin' });

const activeDormAssignmentState = StateNode.create({ name: 'active' });
const removedDormAssignmentState = StateNode.create({ name: 'removed' });

const pendingEvictionState = StateNode.create({ name: 'pending' });
const approvedEvictionState = StateNode.create({ name: 'approved' });
const rejectedEvictionState = StateNode.create({ name: 'rejected' });

// State nodes with computeValue for property updates
const scoreUpdatedState = StateNode.create({ 
  name: 'scoreUpdated',
  computeValue: (event) => {
    // For DeductPoints, we need to get the current score and subtract points
    if (event.interactionName === 'DeductPoints') {
      return event.payload.points; // This will be handled by the interaction itself
    }
    return 0;
  }
});

const roleUpdatedState = StateNode.create({ 
  name: 'roleUpdated',
  computeValue: (event) => {
    if (event.interactionName === 'AssignDormLeader') {
      return 'dorm_leader';
    }
    return 'student';
  }
});

const dormIdUpdatedState = StateNode.create({ 
  name: 'dormIdUpdated',
  computeValue: (event) => {
    if (event.interactionName === 'RemoveUserFromDorm') {
      return ''; // Empty when removed
    }
    return '';
  }
});

const bedNumberUpdatedState = StateNode.create({ 
  name: 'bedNumberUpdated',
  computeValue: (event) => {
    if (event.interactionName === 'RemoveUserFromDorm') {
      return 0; // Reset when removed
    }
    return 0;
  }
});

const leaderUpdatedState = StateNode.create({ 
  name: 'leaderUpdated',
  computeValue: (event) => {
    if (event.interactionName === 'AssignDormLeader') {
      return event.payload.userId.id || event.payload.userId;
    }
    return '';
  }
});

// === Attributives ===

// Admin role attributive
export const AdminAttributive = Attributive.create({
  name: 'Admin',
  content: function Admin(targetUser, eventArgs) {
    return eventArgs.user.role === 'admin'
  }
})

// Dorm leader role attributive
export const DormLeaderAttributive = Attributive.create({
  name: 'DormLeader',
  content: function DormLeader(targetUser, eventArgs) {
    return eventArgs.user.role === 'dorm_leader'
  }
})

// Student role attributive
export const StudentAttributive = Attributive.create({
  name: 'Student',
  content: function Student(targetUser, eventArgs) {
    return eventArgs.user.role === 'student'
  }
})

// Dorm leader of specific dorm attributive
export const DormLeaderOfDormAttributive = Attributive.create({
  name: 'DormLeaderOfDorm',
  content: async function DormLeaderOfDorm(targetDorm, eventArgs) {
    const { MatchExp } = this.globals
    const dormId = targetDorm.id || targetDorm
    const dorm = await this.system.storage.findOne('Dorm',
      MatchExp.atom({ key: 'id', value: ['=', dormId] }),
      undefined,
      ['leaderId']
    )
    return dorm && dorm.leaderId === eventArgs.user.id
  }
})

// Target user in same dorm as dorm leader attributive
export const TargetInSameDormAttributive = Attributive.create({
  name: 'TargetInSameDorm',
  content: async function TargetInSameDorm(targetUser, eventArgs) {
    const { MatchExp } = this.globals
    
    // targetUser is the payload item value (User object)
    const targetUserId = targetUser.id || targetUser
    
    // Find current user's dorm (the dorm leader)
    const userAssignment = await this.system.storage.findOne('ActiveDormAssignment',
      MatchExp.atom({ key: 'userId', value: ['=', eventArgs.user.id] }),
      undefined,
      ['dormId']
    )
    
    if (!userAssignment) return false
    
    // Find target user's dorm
    const targetAssignment = await this.system.storage.findOne('ActiveDormAssignment',
      MatchExp.atom({ key: 'userId', value: ['=', targetUserId] }),
      undefined,
      ['dormId']
    )
    
    return targetAssignment && userAssignment.dormId === targetAssignment.dormId
  }
})

// === Entity Definitions ===

// User entity with article count and other properties
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string', 
      defaultValue: () => 'student'
    }),
    Property.create({ 
      name: 'score', 
      type: 'number', 
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'dormId', 
      type: 'string', 
      defaultValue: () => ''
    }),
    Property.create({ 
      name: 'bedNumber', 
      type: 'number', 
      defaultValue: () => 0
    }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'bigint', defaultValue: () => Date.now() })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateUser') {
        return {
          name: event.payload.name,
          email: event.payload.email,
          role: 'student',
          score: 0,
          dormId: '',
          bedNumber: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
      return null;
    }
  })
});

// Dorm entity
export const Dorm = Entity.create({
  name: 'Dorm',
  properties:[
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ 
      name: 'leaderId', 
      type: 'string', 
      defaultValue: () => ''
    }),
    Property.create({ name: 'currentOccupancy', type: 'number', defaultValue: () => 0 }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'bigint', defaultValue: () => Date.now() })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDorm') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          leaderId: event.payload.leaderId || '',
          currentOccupancy: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
      return null;
    }
  })
});

// DormAssignment entity
export const DormAssignment = Entity.create({
  name: 'DormAssignment',
  properties: [
    Property.create({ name: 'userId', type: 'string' }),
    Property.create({ name: 'dormId', type: 'string' }),
    Property.create({ name: 'bedNumber', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }),
    Property.create({ name: 'assignedAt', type: 'bigint', defaultValue: () => Date.now() }),
    Property.create({ name: 'removedAt', type: 'bigint', defaultValue: () => 0 })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AssignUserToDorm') {
        return {
          userId: event.payload.userId.id || event.payload.userId,
          dormId: event.payload.dormId.id || event.payload.dormId,
          bedNumber: event.payload.bedNumber,
          status: 'active',
          assignedAt: Date.now(),
          removedAt: 0
        };
      }
      if (event.interactionName === 'RemoveUserFromDorm') {
        // Update assignment status
        return {
          userId: event.payload.userId.id || event.payload.userId,
          status: 'removed',
          removedAt: Date.now()
        };
      }
      return null;
    }
  })
});

// ScoreRecord entity
export const ScoreRecord = Entity.create({
  name: 'ScoreRecord',
  properties: [
    Property.create({ name: 'userId', type: 'string' }),
    Property.create({ name: 'deductorId', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'DeductPoints') {
        return {
          userId: event.payload.userId,
          deductorId: event.user.id,
          points: event.payload.points,
          reason: event.payload.reason,
          createdAt: Date.now()
        };
      }
      return null;
    }
  })
});

// EvictionRequest entity
export const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({ name: 'applicantId', type: 'string' }),
    Property.create({ name: 'targetUserId', type: 'string' }),
    Property.create({ name: 'dormId', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'pending' }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() }),
    Property.create({ name: 'resolvedAt', type: 'bigint', defaultValue: () => 0 })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'ApplyForEviction') {
        return {
          applicantId: event.user.id,
          targetUserId: event.payload.targetUserId,
          dormId: '', // Will be set based on user's current dorm
          reason: event.payload.reason,
          status: 'pending',
          createdAt: Date.now(),
          resolvedAt: 0
        };
      }
      return null;
    }
  })
});

// === Relations ===
export const UserDormAssignmentRelation = Relation.create({
  source: User,
  sourceProperty: 'dormAssignments',
  target: DormAssignment,
  targetProperty: 'user',
  type: '1:n'
});

export const DormDormAssignmentRelation = Relation.create({
  source: Dorm,
  sourceProperty: 'dormAssignments',
  target: DormAssignment,
  targetProperty: 'dorm',
  type: '1:n'
});

export const UserScoreRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'scoreRecords',
  target: ScoreRecord,
  targetProperty: 'user',
  type: '1:n'
});

export const DeductorScoreRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'deductedScoreRecords',
  target: ScoreRecord,
  targetProperty: 'deductor',
  type: '1:n'
});

export const UserEvictionRequestApplicantRelation = Relation.create({
  source: User,
  sourceProperty: 'evictionRequestsApplied',
  target: EvictionRequest,
  targetProperty: 'applicant',
  type: '1:n'
});

export const UserEvictionRequestTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'evictionRequestsTargeted',
  target: EvictionRequest,
  targetProperty: 'targetUser',
  type: '1:n'
});

export const DormEvictionRequestRelation = Relation.create({
  source: Dorm,
  sourceProperty: 'evictionRequests',
  target: EvictionRequest,
  targetProperty: 'dorm',
  type: '1:n'
});

// Now add computed properties to entities after relations are defined
User.properties.push(
  Property.create({
    name: 'dormCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserDormAssignmentRelation,
      direction: 'source'
    })
  })
);

Dorm.properties.push(
  Property.create({
    name: 'occupancyCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: DormDormAssignmentRelation,
      direction: 'source'
    })
  })
);

// === Filtered Entities ===
// Active dorm assignments (not removed)
export const ActiveDormAssignment = Entity.create({
  name: 'ActiveDormAssignment',
  sourceEntity: DormAssignment,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

// Pending eviction requests
export const PendingEvictionRequest = Entity.create({
  name: 'PendingEvictionRequest',
  sourceEntity: EvictionRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});

// Active users (not removed from dorm)
export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'role',
    value: ['!=', 'removed']
  })
});

// === Basic Interactions ===
export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true })
    ]
  })
});

export const CreateDorm = Interaction.create({
  name: 'CreateDorm',
  action: Action.create({ name: 'createDorm' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true }),
      PayloadItem.create({ name: 'leaderId' })
    ]
  })
});

export const AssignDormLeader = Interaction.create({
  name: 'AssignDormLeader',
  action: Action.create({ name: 'assignDormLeader' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormId', base: Dorm, isRef: true, required: true }),
      PayloadItem.create({ name: 'userId', base: User, isRef: true, required: true })
    ]
  }),
  userAttributives: boolExpToAttributives(BoolExp.atom(AdminAttributive))
});

export const AssignUserToDorm = Interaction.create({
  name: 'AssignUserToDorm',
  action: Action.create({ name: 'assignUserToDorm' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true, required: true }),
      PayloadItem.create({ name: 'dormId', base: Dorm, isRef: true, required: true }),
      PayloadItem.create({ name: 'bedNumber', required: true })
    ]
  }),
  userAttributives: boolExpToAttributives(BoolExp.atom(AdminAttributive))
});

export const RemoveUserFromDorm = Interaction.create({
  name: 'RemoveUserFromDorm',
  action: Action.create({ name: 'removeUserFromDorm' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true, required: true })
    ]
  }),
  userAttributives: boolExpToAttributives(BoolExp.atom(AdminAttributive))
});

export const DeductPoints = Interaction.create({
  name: 'DeductPoints',
  action: Action.create({ name: 'deductPoints' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', base: User, isRef: true, required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  }),
  userAttributives: boolExpToAttributives(BoolExp.atom(AdminAttributive))
});

export const ApplyForEviction = Interaction.create({
  name: 'ApplyForEviction',
  action: Action.create({ name: 'applyForEviction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUserId', 
        base: User, 
        isRef: true, 
        required: true,
        attributives: boolExpToAttributives(BoolExp.atom(TargetInSameDormAttributive))
      }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  }),
  userAttributives: boolExpToAttributives(BoolExp.atom(DormLeaderAttributive))
});

export const ProcessEvictionRequest = Interaction.create({
  name: 'ProcessEvictionRequest',
  action: Action.create({ name: 'processEvictionRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'action', required: true }) // 'approve' or 'reject'
    ]
  }),
  userAttributives: boolExpToAttributives(BoolExp.atom(AdminAttributive))
});

export const ViewDormMembers = Interaction.create({
  name: 'ViewDormMembers',
  action: Action.create({ name: 'viewDormMembers' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormId', 
        base: Dorm, 
        isRef: true, 
        required: true,
        attributives: boolExpToAttributives(
          BoolExp.atom(AdminAttributive)
            .or(BoolExp.atom(DormLeaderOfDormAttributive))
        )
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminAttributive)
      .or(BoolExp.atom(DormLeaderAttributive))
  )
});

export const ViewMyDorm = Interaction.create({
  name: 'ViewMyDorm',
  action: Action.create({ name: 'viewMyDorm' }),
  payload: Payload.create({
    items: []
  })
});

export const ViewMyScore = Interaction.create({
  name: 'ViewMyScore',
  action: Action.create({ name: 'viewMyScore' }),
  payload: Payload.create({
    items: []
  })
});




// === Collections ===
export const entities = [
  User,
  Dorm,
  DormAssignment,
  ScoreRecord,
  EvictionRequest,
  ActiveDormAssignment,
  PendingEvictionRequest,
  ActiveUser
];

export const relations = [
  UserDormAssignmentRelation,
  DormDormAssignmentRelation,
  UserScoreRecordRelation,
  DeductorScoreRecordRelation,
  UserEvictionRequestApplicantRelation,
  UserEvictionRequestTargetRelation,
  DormEvictionRequestRelation
];

export const activities = [];



export const interactions = [
  CreateUser,
  CreateDorm,
  AssignDormLeader,
  AssignUserToDorm,
  RemoveUserFromDorm,
  DeductPoints,
  ApplyForEviction,
  ProcessEvictionRequest,
  ViewDormMembers,
  ViewMyDorm,
  ViewMyScore
];
// Add StateMachine computations for property updates
// These are added after all interactions are defined to avoid circular dependencies

// Note: StateMachine is used for state transitions, but for property updates
// we need to use Transform computations in the entities themselves or handle updates
// through the Transform callbacks in existing entities.
// The current implementation handles updates via Transform in DormAssignment and User entities

export const dicts = [];