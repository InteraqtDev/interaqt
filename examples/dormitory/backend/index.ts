import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  Count,
  InteractionEventEntity,
  Dictionary,
  MatchExp
} from 'interaqt';

// ===========================
// ENTITIES
// ===========================

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
      defaultValue: () => 'student'
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 100
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({
      name: 'canBeKickedOut',
      type: 'boolean',
      defaultValue: () => false
    })
  ]
});

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
      name: 'availableBeds',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          createdAt: Math.floor(Date.now()/1000),
          updatedAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const ScoreRule = Entity.create({
  name: 'ScoreRule',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'description', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'scoreDeduction', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      defaultValue: () => true
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateScoreRule') {
        return {
          name: event.payload.name,
          description: event.payload.description,
          scoreDeduction: event.payload.scoreDeduction,
          isActive: true,
          createdAt: Math.floor(Date.now()/1000),
          updatedAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ 
      name: 'description', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'recordedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'scoreDeducted', 
      type: 'number',
      defaultValue: () => 0
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
      if (event.interactionName === 'RecordViolation') {
        return {
          description: event.payload.description,
          recordedAt: Math.floor(Date.now()/1000),
          scoreDeducted: event.payload.scoreDeduction || 0,
          status: 'active',
          user: { id: event.payload.userId },
          rule: { id: event.payload.ruleId }
        };
      }
      return null;
    }
  })
});

export const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'requestedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number'
    }),
    Property.create({ 
      name: 'adminComment', 
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RequestKickout') {
        return {
          reason: event.payload.reason,
          requestedAt: Math.floor(Date.now()/1000),
          status: 'pending',
          requester: event.user,
          targetUser: { id: event.payload.targetUserId }
        };
      }
      return null;
    }
  })
});

// ===========================
// RELATIONS
// ===========================

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
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'bedNumber', 
      type: 'number' 
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
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          assignedAt: Math.floor(Date.now()/1000),
          bedNumber: event.payload.bedNumber,
          status: 'active'
        };
      }
      return null;
    }
  })
});

export const DormitoryHeadRelation = Relation.create({
  source: User,
  sourceProperty: 'managedDormitory',
  target: Dormitory,
  targetProperty: 'dormHead',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      defaultValue: () => true
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          appointedAt: Math.floor(Date.now()/1000),
          isActive: true
        };
      }
      return null;
    }
  })
});

export const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violationRecords',
  target: ViolationRecord,
  targetProperty: 'user',
  type: '1:n'
});

export const ViolationRuleRelation = Relation.create({
  source: ScoreRule,
  sourceProperty: 'violations',
  target: ViolationRecord,
  targetProperty: 'rule',
  type: '1:n'
});

export const KickoutRequesterRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequests',
  target: KickoutRequest,
  targetProperty: 'requester',
  type: '1:n'
});

export const KickoutTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequestsAgainst',
  target: KickoutRequest,
  targetProperty: 'targetUser',
  type: '1:n'
});

export const KickoutProcessorRelation = Relation.create({
  source: User,
  sourceProperty: 'processedKickoutRequests',
  target: KickoutRequest,
  targetProperty: 'processor',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'ProcessKickoutRequest') {
        return {
          source: event.user,
          target: { id: event.payload.requestId }
        };
      }
      return null;
    }
  })
});

// Stage 1: Simple implementation without complex computations
// Count computations will be added in Stage 2

// ===========================
// INTERACTIONS
// ===========================

export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  })
});

export const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'updateDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'capacity' })
    ]
  })
});

export const DeleteDormitory = Interaction.create({
  name: 'DeleteDormitory',
  action: Action.create({ name: 'deleteDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

export const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assignDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

export const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'removeDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedNumber', required: true })
    ]
  })
});

export const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'removeUserFromDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

export const CreateScoreRule = Interaction.create({
  name: 'CreateScoreRule',
  action: Action.create({ name: 'createScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'scoreDeduction', required: true })
    ]
  })
});

export const UpdateScoreRule = Interaction.create({
  name: 'UpdateScoreRule',
  action: Action.create({ name: 'updateScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'scoreDeduction' }),
      PayloadItem.create({ name: 'isActive' })
    ]
  })
});

export const DeleteScoreRule = Interaction.create({
  name: 'DeleteScoreRule',
  action: Action.create({ name: 'deleteScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true })
    ]
  })
});

export const RecordViolation = Interaction.create({
  name: 'RecordViolation',
  action: Action.create({ name: 'recordViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'description', required: true })
    ]
  })
});

export const RevokeViolation = Interaction.create({
  name: 'RevokeViolation',
  action: Action.create({ name: 'revokeViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'violationId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

export const RequestKickout = Interaction.create({
  name: 'RequestKickout',
  action: Action.create({ name: 'requestKickout' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

export const ProcessKickoutRequest = Interaction.create({
  name: 'ProcessKickoutRequest',
  action: Action.create({ name: 'processKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true }),
      PayloadItem.create({ name: 'adminComment' })
    ]
  })
});

// Query Interactions
export const ViewSystemOverview = Interaction.create({
  name: 'ViewSystemOverview',
  action: Action.create({ name: 'viewSystemOverview' }),
  payload: Payload.create({ items: [] })
});

export const ViewDormitoryList = Interaction.create({
  name: 'ViewDormitoryList',
  action: Action.create({ name: 'viewDormitoryList' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' })
    ]
  })
});

export const ViewDormitoryDetails = Interaction.create({
  name: 'ViewDormitoryDetails',
  action: Action.create({ name: 'viewDormitoryDetails' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

export const ViewUserProfile = Interaction.create({
  name: 'ViewUserProfile',
  action: Action.create({ name: 'viewUserProfile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

export const ViewViolationHistory = Interaction.create({
  name: 'ViewViolationHistory',
  action: Action.create({ name: 'viewViolationHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

export const ViewKickoutRequests = Interaction.create({
  name: 'ViewKickoutRequests',
  action: Action.create({ name: 'viewKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'requesterId' })
    ]
  })
});

export const ViewScoreRules = Interaction.create({
  name: 'ViewScoreRules',
  action: Action.create({ name: 'viewScoreRules' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'isActive' })
    ]
  })
});

// ===========================
// FILTERED ENTITIES
// ===========================

export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

export const ActiveDormitoryAssignments = Entity.create({
  name: 'ActiveDormitoryAssignments',
  sourceEntity: UserDormitoryRelation,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

// ===========================
// GLOBAL DICTIONARIES
// ===========================

export const SystemStats = Dictionary.create({
  name: 'SystemStats',
  type: 'object',
  collection: false,
  defaultValue: () => ({
    totalUsers: 0,
    totalDormitories: 0,
    totalActiveAssignments: 0,
    pendingKickoutRequests: 0
  })
});

// ===========================
// EXPORTS
// ===========================

export const entities = [
  User, 
  Dormitory, 
  ScoreRule, 
  ViolationRecord, 
  KickoutRequest,
  ActiveUser,
  ActiveDormitoryAssignments
];

export const relations = [
  UserDormitoryRelation,
  DormitoryHeadRelation,
  UserViolationRelation,
  ViolationRuleRelation,
  KickoutRequesterRelation,
  KickoutTargetRelation,
  KickoutProcessorRelation
];

export const interactions = [
  // Dormitory Management
  CreateDormitory,
  UpdateDormitory,
  DeleteDormitory,
  
  // User Role Management
  AssignDormHead,
  RemoveDormHead,
  AssignUserToDormitory,
  RemoveUserFromDormitory,
  
  // Score Rule Management
  CreateScoreRule,
  UpdateScoreRule,
  DeleteScoreRule,
  
  // Violation Management
  RecordViolation,
  RevokeViolation,
  
  // Kickout Management
  RequestKickout,
  ProcessKickoutRequest,
  
  // Query Interactions
  ViewSystemOverview,
  ViewDormitoryList,
  ViewDormitoryDetails,
  ViewUserProfile,
  ViewViolationHistory,
  ViewKickoutRequests,
  ViewScoreRules
];

export const activities = [];

export const dicts = [SystemStats];