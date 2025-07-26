import {
  Entity, Property, Relation, Count, Summation, 
  Transform, Controller, InteractionEventEntity,
  Interaction, Action, Payload, PayloadItem,
  MatchExp
} from 'interaqt';

// ================ Entities ================

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'phone', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'student'
    }),
    Property.create({ 
      name: 'violationScore', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    })
  ]
});

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ 
      name: 'occupancyCount', 
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
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity
        };
      }
      return null;
    }
  })
});

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'number', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'vacant'
    })
  ],
  computation: Transform.create({
    record: Dormitory,
    callback: (dormitory) => {
      const beds = [];
      for (let i = 1; i <= dormitory.capacity; i++) {
        beds.push({
          number: `${dormitory.name}-${i}`,
          dormitory: dormitory
        });
      }
      return beds;
    }
  })
});

const ViolationRule = Entity.create({
  name: 'ViolationRule',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'category', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateViolationRule') {
        return {
          name: event.payload.name,
          description: event.payload.description,
          points: event.payload.points,
          category: event.payload.category
        };
      }
      return null;
    }
  })
});

const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'recordedAt', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(this: Controller, event) {
      if (event.interactionName === 'RecordViolation') {
        const rule = await this.system.storage.get('ViolationRule', event.payload.violationRuleId, 
          ['points']);
        const targetUser = await this.system.storage.get('User', event.payload.targetUserId);
        
        if (!rule || !targetUser) return null;
        
        return {
          description: event.payload.description,
          points: rule.points,
          recordedAt: new Date().toISOString(),
          user: targetUser,
          rule: rule,
          recordedBy: event.user
        };
      }
      return null;
    }
  })
});

const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'requestDate', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({ 
      name: 'adminComments', 
      type: 'string',
      defaultValue: () => ''
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(this: Controller, event) {
      if (event.interactionName === 'RequestKickout') {
        const targetUser = await this.system.storage.get('User', event.payload.targetUserId);
        
        // For Stage 1, we'll simplify and just create the request
        // In Stage 2, we'll add proper dormitory lookups
        return {
          reason: event.payload.reason,
          requestDate: new Date().toISOString(),
          targetUser: targetUser,
          initiator: event.user
        };
      }
      return null;
    }
  })
});

// Add UserBedRelation entity
const UserBedRelation = Entity.create({
  name: 'UserBedRelation',
  properties: [
    Property.create({ name: 'assignedAt', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(this: Controller, event) {
      if (event.interactionName === 'AssignUserToBed') {
        const user = await this.system.storage.get('User', event.payload.userId);
        const bed = await this.system.storage.get('Bed', event.payload.bedId);
        
        return {
          user: user,
          bed: bed,
          assignedAt: new Date().toISOString()
        };
      }
      return null;
    }
  })
});

// ================ Transform Computations for State Updates ================

// Update bed status when UserBedRelation is created/deleted
const BedStatusUpdate = Transform.create({
  entity: Bed,
  field: 'status',
  record: UserBedRelation,
  callback: function(relation) {
    if (relation && relation.bed) {
      return 'occupied';
    }
    return undefined;
  }
});

// Update user role when assigned as dorm head
const UserRoleUpdate = Transform.create({
  entity: User, 
  field: 'role',
  record: InteractionEventEntity,
  callback: async function(this: Controller, event) {
    if (event.interactionName === 'AssignDormHead' && 
        event.payload.userId === event.user?.id) {
      return 'dormHead';
    }
    return undefined;
  }
});

// ================ Relations ================

const BedDormitoryRelation = Relation.create({
  name: 'BedDormitoryRelation',
  source: Bed,
  target: Dormitory,
  sourceProperty: 'dormitory',
  targetProperty: 'beds',
  type: 'n:1'
});

const UserBedRelationUser = Relation.create({
  name: 'UserBedRelationUser',
  source: UserBedRelation,
  target: User,
  sourceProperty: 'user',
  targetProperty: 'currentBedRelation',
  type: 'n:1'
});

const UserBedRelationBed = Relation.create({
  name: 'UserBedRelationBed',
  source: UserBedRelation,
  target: Bed,
  sourceProperty: 'bed',
  targetProperty: 'occupantRelation',
  type: 'n:1'
});

const UserViolationRelation = Relation.create({
  name: 'UserViolationRelation',
  source: ViolationRecord,
  target: User,
  sourceProperty: 'user',
  targetProperty: 'violations',
  type: 'n:1'
});

const ViolationRuleRecordRelation = Relation.create({
  name: 'ViolationRuleRecordRelation',
  source: ViolationRecord,
  target: ViolationRule,
  sourceProperty: 'rule',
  targetProperty: 'records',
  type: 'n:1'
});

const RecorderViolationRelation = Relation.create({
  name: 'RecorderViolationRelation',
  source: ViolationRecord,
  target: User,
  sourceProperty: 'recordedBy',
  targetProperty: 'recordedViolations',
  type: 'n:1'
});

const KickoutRequestUserRelation = Relation.create({
  name: 'KickoutRequestUserRelation',
  source: KickoutRequest,
  target: User,
  sourceProperty: 'targetUser',
  targetProperty: 'kickoutRequests',
  type: 'n:1'
});

const KickoutRequestInitiatorRelation = Relation.create({
  name: 'KickoutRequestInitiatorRelation',
  source: KickoutRequest,
  target: User,
  sourceProperty: 'initiator',
  targetProperty: 'initiatedRequests',
  type: 'n:1'
});

// ================ Interactions ================

const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'CreateDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  })
});

const AssignUserToBed = Interaction.create({
  name: 'AssignUserToBed',
  action: Action.create({ name: 'AssignUserToBed' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'bedId', required: true })
    ]
  })
});

const RemoveUserFromBed = Interaction.create({
  name: 'RemoveUserFromBed',
  action: Action.create({ name: 'RemoveUserFromBed' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

const TransferUser = Interaction.create({
  name: 'TransferUser',
  action: Action.create({ name: 'TransferUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'newBedId', required: true })
    ]
  })
});

const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'AssignDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

const CreateViolationRule = Interaction.create({
  name: 'CreateViolationRule',
  action: Action.create({ name: 'CreateViolationRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'category', required: true })
    ]
  })
});

const RecordViolation = Interaction.create({
  name: 'RecordViolation',
  action: Action.create({ name: 'RecordViolation' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'violationRuleId', required: true }),
      PayloadItem.create({ name: 'description', required: true })
    ]
  })
});

const RequestKickout = Interaction.create({
  name: 'RequestKickout',
  action: Action.create({ name: 'RequestKickout' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

const ApproveKickoutRequest = Interaction.create({
  name: 'ApproveKickoutRequest',
  action: Action.create({ name: 'ApproveKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'comments', required: false })
    ]
  })
});

const RejectKickoutRequest = Interaction.create({
  name: 'RejectKickoutRequest',
  action: Action.create({ name: 'RejectKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'comments', required: true })
    ]
  })
});

// ================ Add computations after relations are defined ================

// Add violationScore computation to User
User.properties.find(p => p.name === 'violationScore')!.computation = Summation.create({
  record: UserViolationRelation,
  direction: 'target',
  attributeQuery: [['source', { 
    attributeQuery: ['points'],
    where: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
  }]]
});

// Add occupancyCount computation to Dormitory
Dormitory.properties.find(p => p.name === 'occupancyCount')!.computation = Count.create({
  record: UserBedRelationBed,
  direction: 'target',
  attributeQuery: [['source', { 
    attributeQuery: ['bed'],
    where: MatchExp.atom({ key: 'bed.dormitory.id', value: ['=', '$self.id'] })
  }]]
});

// ================ Exports ================

export const entities = [User, Dormitory, Bed, ViolationRule, ViolationRecord, KickoutRequest, UserBedRelation];
export const relations = [
  BedDormitoryRelation, UserBedRelationUser, UserBedRelationBed,
  UserViolationRelation, ViolationRuleRecordRelation, RecorderViolationRelation,
  KickoutRequestUserRelation, KickoutRequestInitiatorRelation
];
export const interactions = [
  CreateDormitory, AssignUserToBed, RemoveUserFromBed, TransferUser,
  AssignDormHead, CreateViolationRule, RecordViolation,
  RequestKickout, ApproveKickoutRequest, RejectKickoutRequest
];