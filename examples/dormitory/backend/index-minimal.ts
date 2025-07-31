import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  MatchExp,
  InteractionEventEntity
} from 'interaqt';

// ============================================================================
// ENTITIES - Minimal version with basic properties only
// ============================================================================

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
      name: 'totalScore',
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
      name: 'currentOccupancy',
      type: 'number',
      defaultValue: () => 0
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
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          currentOccupancy: 0,
          status: 'active',
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

export const ScoreRecord = Entity.create({
  name: 'ScoreRecord',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'score', 
      type: 'number' 
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'operatorNotes', 
      type: 'string' 
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'DeductUserScore') {
        return {
          reason: event.payload.reason,
          score: 10, // Simplified - fixed value for now
          operatorNotes: event.payload.operatorNotes || '',
          createdAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const KickRequest = Entity.create({
  name: 'KickRequest',
  properties: [
    Property.create({ 
      name: 'reason', 
      type: 'string' 
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({
      name: 'processedAt',
      type: 'number'
    }),
    Property.create({
      name: 'adminNotes',
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RequestKickUser') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          createdAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

// ============================================================================
// RELATIONS - Basic relations without complex computations
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
          bedNumber: event.payload.bedNumber,
          status: 'active',
          assignedAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const DormHeadDormitoryRelation = Relation.create({
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
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          status: 'active',
          appointedAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const UserScoreRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'scoreRecords',
  target: ScoreRecord,
  targetProperty: 'user',
  type: '1:n'
});

export const ScoreRuleRecordRelation = Relation.create({
  source: ScoreRule,
  sourceProperty: 'records',
  target: ScoreRecord,
  targetProperty: 'rule',
  type: '1:n'
});

export const RequestorKickRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'kickRequestsInitiated',
  target: KickRequest,
  targetProperty: 'requestor',
  type: '1:n'
});

export const TargetUserKickRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'kickRequestsReceived',
  target: KickRequest,
  targetProperty: 'targetUser',
  type: '1:n'
});

export const DormitoryKickRequestRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'kickRequests',
  target: KickRequest,
  targetProperty: 'dormitory',
  type: '1:n'
});

export const OperatorScoreRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'scoreRecordsOperated',
  target: ScoreRecord,
  targetProperty: 'operator',
  type: '1:n'
});

// ============================================================================
// INTERACTIONS - Stage 1: Core Business Logic Only
// ============================================================================

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

export const DeductUserScore = Interaction.create({
  name: 'DeductUserScore',
  action: Action.create({ name: 'deductUserScore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'operatorNotes' })
    ]
  })
});

export const RequestKickUser = Interaction.create({
  name: 'RequestKickUser',
  action: Action.create({ name: 'requestKickUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

export const ApproveKickRequest = Interaction.create({
  name: 'ApproveKickRequest',
  action: Action.create({ name: 'approveKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'adminNotes' })
    ]
  })
});

export const GetDormitoryInfo = Interaction.create({
  name: 'GetDormitoryInfo',
  action: Action.create({ name: 'getDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

export const GetUserScoreRecords = Interaction.create({
  name: 'GetUserScoreRecords',
  action: Action.create({ name: 'getUserScoreRecords' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

// ============================================================================
// EXPORTS
// ============================================================================

export const entities = [
  User,
  Dormitory,
  ScoreRule,
  ScoreRecord,
  KickRequest
];

export const relations = [
  UserDormitoryRelation,
  DormHeadDormitoryRelation,
  UserScoreRecordRelation,
  ScoreRuleRecordRelation,
  RequestorKickRequestRelation,
  TargetUserKickRequestRelation,
  DormitoryKickRequestRelation,
  OperatorScoreRecordRelation
];

export const interactions = [
  CreateDormitory,
  AssignUserToDormitory,
  AssignDormHead,
  CreateScoreRule,
  DeductUserScore,
  RequestKickUser,
  ApproveKickRequest,
  GetDormitoryInfo,
  GetUserScoreRecords
];

export const dicts = [];

export const activities = [];