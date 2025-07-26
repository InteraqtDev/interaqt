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
    Property.create({ name: 'recordedAt', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(this: Controller, event) {
      if (event.interactionName === 'RecordViolation') {
        const rule = await this.system.storage.get('ViolationRule', event.payload.violationRuleId);
        const targetUser = await this.system.storage.get('User', event.payload.targetUserId);
        
        return {
          description: event.payload.description,
          points: rule.points,
          recordedAt: Date.now(),
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
    Property.create({ name: 'requestDate', type: 'number' }),
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
        const userBedRelation = await this.system.storage.findOne(
          'UserBedRelation',
          MatchExp.atom({ key: 'source.id', value: ['=', targetUser.id] }),
          undefined,
          ['target', ['target', { attributeQuery: ['dormitory'] }]]
        );
        
        if (!userBedRelation) return null;
        
        const dormitory = userBedRelation.target.dormitory;
        
        return {
          reason: event.payload.reason,
          requestDate: Date.now(),
          targetUser: targetUser,
          initiator: event.user,
          dormitory: dormitory
        };
      }
      return null;
    }
  })
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

const UserBedRelation = Relation.create({
  name: 'UserBedRelation',
  source: User,
  target: Bed,
  sourceProperty: 'currentBed',
  targetProperty: 'occupant',
  type: '1:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(this: Controller, event) {
      if (event.interactionName === 'AssignUserToBed') {
        const user = await this.system.storage.get('User', event.payload.userId);
        const bed = await this.system.storage.get('Bed', event.payload.bedId);
        
        return {
          source: user,
          target: bed,
          assignedAt: Date.now()
        };
      }
      return null;
    }
  })
});

const DormitoryDormHeadRelation = Relation.create({
  name: 'DormitoryDormHeadRelation',
  source: Dormitory,
  target: User,
  sourceProperty: 'dormHead',
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: async function(this: Controller, event) {
      if (event.interactionName === 'AssignDormHead') {
        const user = await this.system.storage.get('User', event.payload.userId);
        const dormitory = await this.system.storage.get('Dormitory', event.payload.dormitoryId);
        
        return {
          source: dormitory,
          target: user,
          assignedAt: Date.now()
        };
      }
      return null;
    }
  })
});

const UserViolationRelation = Relation.create({
  name: 'UserViolationRelation',
  source: User,
  target: ViolationRecord,
  sourceProperty: 'violations',
  targetProperty: 'user',
  type: '1:n'
});

const ViolationRuleRecordRelation = Relation.create({
  name: 'ViolationRuleRecordRelation',
  source: ViolationRule,
  target: ViolationRecord,
  sourceProperty: 'records',
  targetProperty: 'rule',
  type: '1:n'
});

const RecorderViolationRelation = Relation.create({
  name: 'RecorderViolationRelation',
  source: User,
  target: ViolationRecord,
  sourceProperty: 'recordedViolations',
  targetProperty: 'recordedBy',
  type: '1:n'
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

const KickoutRequestDormitoryRelation = Relation.create({
  name: 'KickoutRequestDormitoryRelation',
  source: KickoutRequest,
  target: Dormitory,
  sourceProperty: 'dormitory',
  targetProperty: 'kickoutRequests',
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
  action: Action.create({ 
    name: 'AssignUserToBed',
    effect: async function(this: Controller, event) {
      // Update bed status to occupied
      await this.system.storage.update('Bed', event.payload.bedId, { status: 'occupied' });
    }
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'bedId', required: true })
    ]
  })
});

const RemoveUserFromBed = Interaction.create({
  name: 'RemoveUserFromBed',
  action: Action.create({ 
    name: 'RemoveUserFromBed',
    effect: async function(this: Controller, event) {
      // Find the user's current bed and update it to vacant
      const user = await this.system.storage.get('User', event.payload.userId, ['currentBed']);
      if (user.currentBed) {
        await this.system.storage.update('Bed', user.currentBed.id, { status: 'vacant' });
        
        // Delete the relation
        const relation = await this.system.storage.findOne(
          'UserBedRelation',
          MatchExp.atom({ key: 'source.id', value: ['=', event.payload.userId] })
        );
        if (relation) {
          await this.system.storage.delete('UserBedRelation', relation.id);
        }
      }
    }
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

const TransferUser = Interaction.create({
  name: 'TransferUser',
  action: Action.create({ 
    name: 'TransferUser',
    effect: async function(this: Controller, event) {
      // Get user's current bed
      const user = await this.system.storage.get('User', event.payload.userId, ['currentBed']);
      
      // Update old bed to vacant
      if (user.currentBed) {
        await this.system.storage.update('Bed', user.currentBed.id, { status: 'vacant' });
        
        // Delete old relation
        const oldRelation = await this.system.storage.findOne(
          'UserBedRelation',
          MatchExp.atom({ key: 'source.id', value: ['=', event.payload.userId] })
        );
        if (oldRelation) {
          await this.system.storage.delete('UserBedRelation', oldRelation.id);
        }
      }
      
      // Update new bed to occupied
      await this.system.storage.update('Bed', event.payload.newBedId, { status: 'occupied' });
      
      // Create new relation
      const newBed = await this.system.storage.get('Bed', event.payload.newBedId);
      await this.system.storage.create('UserBedRelation', {
        source: user,
        target: newBed,
        assignedAt: Date.now()
      });
    }
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'newBedId', required: true })
    ]
  })
});

const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ 
    name: 'AssignDormHead',
    effect: async function(this: Controller, event) {
      // Update user role to dormHead
      await this.system.storage.update('User', event.payload.userId, { role: 'dormHead' });
    }
  }),
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
  action: Action.create({ 
    name: 'ApproveKickoutRequest',
    effect: async function(this: Controller, event) {
      const request = await this.system.storage.get('KickoutRequest', event.payload.requestId, ['targetUser']);
      
      // Update request status and comments
      await this.system.storage.update('KickoutRequest', request.id, {
        status: 'approved',
        adminComments: event.payload.comments || ''
      });
      
      // Update user status
      await this.system.storage.update('User', request.targetUser.id, { status: 'kickedOut' });
      
      // Get user's current bed and update it
      const user = await this.system.storage.get('User', request.targetUser.id, ['currentBed']);
      if (user.currentBed) {
        await this.system.storage.update('Bed', user.currentBed.id, { status: 'vacant' });
        
        // Delete the relation
        const relation = await this.system.storage.findOne(
          'UserBedRelation',
          MatchExp.atom({ key: 'source.id', value: ['=', request.targetUser.id] })
        );
        if (relation) {
          await this.system.storage.delete('UserBedRelation', relation.id);
        }
      }
    }
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'comments', required: false })
    ]
  })
});

const RejectKickoutRequest = Interaction.create({
  name: 'RejectKickoutRequest',
  action: Action.create({ 
    name: 'RejectKickoutRequest',
    effect: async function(this: Controller, event) {
      await this.system.storage.update('KickoutRequest', event.payload.requestId, {
        status: 'rejected',
        adminComments: event.payload.comments
      });
    }
  }),
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
  direction: 'source',
  attributeQuery: [['target', { 
    attributeQuery: ['points'],
    where: MatchExp.atom({ key: 'status', value: ['=', 'active'] })
  }]]
});

// Add occupancyCount computation to Dormitory
Dormitory.properties.find(p => p.name === 'occupancyCount')!.computation = Count.create({
  record: BedDormitoryRelation,
  direction: 'target',
  attributeQuery: [['source', { 
    attributeQuery: ['status'],
    where: MatchExp.atom({ key: 'status', value: ['=', 'occupied'] })
  }]]
});

// ================ Exports ================

export const entities = [User, Dormitory, Bed, ViolationRule, ViolationRecord, KickoutRequest];
export const relations = [
  BedDormitoryRelation, UserBedRelation, DormitoryDormHeadRelation,
  UserViolationRelation, ViolationRuleRecordRelation, RecorderViolationRelation,
  KickoutRequestUserRelation, KickoutRequestInitiatorRelation, KickoutRequestDormitoryRelation
];
export const interactions = [
  CreateDormitory, AssignUserToBed, RemoveUserFromBed, TransferUser,
  AssignDormHead, CreateViolationRule, RecordViolation,
  RequestKickout, ApproveKickoutRequest, RejectKickoutRequest
];