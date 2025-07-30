import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  InteractionEventEntity
} from 'interaqt';

// ===========================
// ENTITIES - Following CRUD patterns exactly
// ===========================

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string', defaultValue: () => 'student' }),
    Property.create({ name: 'score', type: 'number', defaultValue: () => 100 }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }),
    Property.create({ name: 'createdAt', type: 'number' })
  ]
});

export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'number' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          createdAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const ScoreRule = Entity.create({
  name: 'ScoreRule',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'scoreDeduction', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true }),
    Property.create({ name: 'createdAt', type: 'number' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateScoreRule') {
        return {
          name: event.payload.name,
          description: event.payload.description,
          scoreDeduction: event.payload.scoreDeduction,
          isActive: true,
          createdAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

export const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'recordedAt', type: 'number' }),
    Property.create({ name: 'scoreDeducted', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordViolation') {
        return {
          description: event.payload.description,
          recordedAt: Math.floor(Date.now()/1000),
          scoreDeducted: event.payload.scoreDeduction || 0,
          status: 'active'
        };
      }
      return null;
    }
  })
});

export const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'requestedAt', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'pending' }),
    Property.create({ name: 'processedAt', type: 'number' }),
    Property.create({ name: 'adminComment', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RequestKickout') {
        return {
          reason: event.payload.reason,
          requestedAt: Math.floor(Date.now()/1000),
          status: 'pending'
        };
      }
      return null;
    }
  })
});

// ===========================
// RELATIONS - Following CRUD patterns
// ===========================

// User <-> Dormitory: Students assigned to dormitories
export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number' }),
    Property.create({ name: 'bedNumber', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
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

// User <-> Dormitory: Dorm head assignments (1:1)
export const DormitoryHeadRelation = Relation.create({
  source: User,
  sourceProperty: 'managedDormitory',
  target: Dormitory,
  targetProperty: 'dormHead',
  type: '1:1',
  properties: [
    Property.create({ name: 'appointedAt', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
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

// User <-> ViolationRecord: Users have violation records
export const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violationRecords',
  target: ViolationRecord,
  targetProperty: 'user',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordViolation') {
        return {
          source: { id: event.payload.userId },
          target: null // Will be set by ViolationRecord creation
        };
      }
      return null;
    }
  })
});

// ScoreRule <-> ViolationRecord: Violations reference rules
export const ViolationRuleRelation = Relation.create({
  source: ScoreRule,
  sourceProperty: 'violations',
  target: ViolationRecord,
  targetProperty: 'rule',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RecordViolation') {
        return {
          source: { id: event.payload.ruleId },
          target: null // Will be set by ViolationRecord creation
        };
      }
      return null;
    }
  })
});

// User <-> KickoutRequest: Requester relation
export const KickoutRequesterRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequests',
  target: KickoutRequest,
  targetProperty: 'requester',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RequestKickout') {
        return {
          source: event.user,
          target: null // Will be set by KickoutRequest creation
        };
      }
      return null;
    }
  })
});

// User <-> KickoutRequest: Target user relation
export const KickoutTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequestsAgainst',
  target: KickoutRequest,
  targetProperty: 'targetUser',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'RequestKickout') {
        return {
          source: { id: event.payload.targetUserId },
          target: null // Will be set by KickoutRequest creation
        };
      }
      return null;
    }
  })
});

// ===========================
// INTERACTIONS - Stage 1: Core business logic only
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

export const RecordViolation = Interaction.create({
  name: 'RecordViolation',
  action: Action.create({ name: 'recordViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'scoreDeduction' }) // Optional override
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

// Collect all definitions
export const entities = [User, Dormitory, ScoreRule, ViolationRecord, KickoutRequest];
export const relations = [
  UserDormitoryRelation,
  DormitoryHeadRelation, 
  UserViolationRelation,
  ViolationRuleRelation,
  KickoutRequesterRelation,
  KickoutTargetRelation
];
export const interactions = [
  CreateDormitory,
  AssignDormHead,
  AssignUserToDormitory,
  CreateScoreRule,
  RecordViolation,
  RequestKickout
];
export const activities = [];
export const dicts = [];