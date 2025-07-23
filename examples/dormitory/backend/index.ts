import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  Count,
  Summation,
  InteractionEventEntity,
  Condition,
  BoolExp,
  Conditions,
  MatchExp
} from 'interaqt';

// State Nodes (must be declared first)
const pendingState = StateNode.create({ name: 'pending' });
const approvedState = StateNode.create({ name: 'approved' });
const rejectedState = StateNode.create({ name: 'rejected' });

const studentState = StateNode.create({ name: 'student' });
const dormHeadState = StateNode.create({ name: 'dormHead' });
const adminState = StateNode.create({ name: 'admin' });

// Permission Conditions
const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: any, event: any) {
    return event.user?.role === 'admin';
  }
});

const DormHeadRole = Condition.create({
  name: 'DormHeadRole', 
  content: async function(this: any, event: any) {
    return event.user?.role === 'dormHead';
  }
});

const AdminOrDormHead = Condition.create({
  name: 'AdminOrDormHead',
  content: async function(this: any, event: any) {
    const role = event.user?.role;
    return role === 'admin' || role === 'dormHead';
  }
});

// Business Rule Conditions
const ValidDormitoryCapacity = Condition.create({
  name: 'ValidDormitoryCapacity',
  content: async function(this: any, event: any) {
    const capacity = event.payload?.capacity;
    return capacity >= 4 && capacity <= 6;
  }
});

const NoDuplicateBedAssignment = Condition.create({
  name: 'NoDuplicateBedAssignment',
  content: async function(this: any, event: any) {
    const { dormitoryId, bedNumber } = event.payload;
    if (!dormitoryId || !bedNumber) return false;
    
    const existingAssignment = await this.system.storage.findOne('DormitoryAssignment',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitoryId] }).and(
        MatchExp.atom({ key: 'bedNumber', value: ['=', bedNumber] })
      ),
      undefined,
      ['id']
    );
    
    return !existingAssignment; // Return true if NO existing assignment (bed is available)
  }
});

const DormitoryNotFull = Condition.create({
  name: 'DormitoryNotFull',
  content: async function(this: any, event: any) {
    const { dormitoryId } = event.payload;
    if (!dormitoryId) return false;
    
    // Get dormitory capacity
    const dormitory = await this.system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
      undefined,
      ['capacity']
    );
    
    if (!dormitory) return false;
    
    // Count current assignments directly from DormitoryAssignment table
    const assignments = await this.system.storage.find('DormitoryAssignment',
      MatchExp.atom({ key: 'dormitoryId', value: ['=', dormitoryId] }),
      undefined,
      ['id']
    );
    
    const currentOccupancy = assignments.length;
    return currentOccupancy < dormitory.capacity;
  }
});

const UserNotAlreadyAssigned = Condition.create({
  name: 'UserNotAlreadyAssigned',
  content: async function(this: any, event: any) {
    const { userId } = event.payload;
    if (!userId) return false;
    
    const existingAssignment = await this.system.storage.findOne('DormitoryAssignment',
      MatchExp.atom({ key: 'userId', value: ['=', userId] }),
      undefined,
      ['id']
    );
    
    return !existingAssignment; // Return true if user is NOT already assigned
  }
});

// User Entity
const User = Entity.create({
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
      defaultValue: () => 100
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      defaultValue: () => true 
    })
  ]
});

// Dormitory Entity
const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
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
    }
  })
});

// DormitoryAssignment Entity
const DormitoryAssignment = Entity.create({
  name: 'DormitoryAssignment',
  properties: [
    Property.create({ name: 'userId', type: 'string' }),
    Property.create({ name: 'dormitoryId', type: 'string' }),
    Property.create({ name: 'bedNumber', type: 'number' }),
    Property.create({ 
      name: 'assignedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ name: 'assignedBy', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          userId: event.payload.userId,
          dormitoryId: event.payload.dormitoryId,
          bedNumber: event.payload.bedNumber,
          assignedBy: event.user.id
        };
      }
    }
  })
});

// ViolationRecord Entity  
const ViolationRecord = Entity.create({
  name: 'ViolationRecord',
  properties: [
    Property.create({ name: 'userId', type: 'string' }),
    Property.create({ name: 'dormitoryId', type: 'string' }),
    Property.create({ name: 'violationType', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'scoreDeduction', type: 'number' }),
    Property.create({ name: 'recordedBy', type: 'string' }),
    Property.create({ 
      name: 'recordedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordViolation') {
        return {
          userId: event.payload.targetUserId,
          dormitoryId: event.payload.dormitoryId,
          violationType: event.payload.violationType,
          description: event.payload.description || '',
          scoreDeduction: event.payload.scoreDeduction,
          recordedBy: event.user.id
        };
      }
    }
  })
});

// KickoutRequest Entity
const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'targetUserId', type: 'string' }),
    Property.create({ name: 'applicantId', type: 'string' }),
    Property.create({ name: 'dormitoryId', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({ 
      name: 'requestedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ name: 'processedAt', type: 'string' }),
    Property.create({ name: 'processedBy', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RequestKickout') {
        return {
          targetUserId: event.payload.targetUserId,
          applicantId: event.user.id,
          dormitoryId: event.payload.dormitoryId,
          reason: event.payload.reason
        };
      }
    }
  })
});

// Relations
const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        // Connect existing User and Dormitory entities
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId }
        };
      }
    }
  })
});

const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violations',
  target: ViolationRecord,
  targetProperty: 'violator',
  type: '1:n'
});

const UserKickoutTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequests',
  target: KickoutRequest,
  targetProperty: 'targetUser',
  type: '1:n'
});

const UserKickoutApplicantRelation = Relation.create({
  source: User,
  sourceProperty: 'appliedKickouts',
  target: KickoutRequest,
  targetProperty: 'applicant',
  type: '1:n'
});

// Add computed properties after relations are defined
Dormitory.properties.push(
  Property.create({
    name: 'currentOccupancy', 
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserDormitoryRelation,
      direction: 'target'
    })
  })
);

// Add user score calculation based on violations
User.properties.push(
  Property.create({
    name: 'currentScore',
    type: 'number',
    defaultValue: () => 100,
    computation: Summation.create({
      record: UserViolationRelation,
      attributeQuery: ['scoreDeduction']
    })
  })
);

// Actions
const CreateAction = Action.create({ name: 'create' });
const AssignAction = Action.create({ name: 'assign' });
const PromoteAction = Action.create({ name: 'promote' });
const RecordAction = Action.create({ name: 'record' });
const RequestAction = Action.create({ name: 'request' });
const ProcessAction = Action.create({ name: 'process' });

// Interactions
const CreateDormitoryInteraction = Interaction.create({
  name: 'CreateDormitory',
  action: CreateAction,
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
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole).and(BoolExp.atom(ValidDormitoryCapacity))
  })
});

const AssignUserToDormitoryInteraction = Interaction.create({
  name: 'AssignUserToDormitory',
  action: AssignAction,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'bedNumber',
        required: true
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(NoDuplicateBedAssignment))
      .and(BoolExp.atom(DormitoryNotFull))
      .and(BoolExp.atom(UserNotAlreadyAssigned))
  })
});

const PromoteToDormHeadInteraction = Interaction.create({
  name: 'PromoteToDormHead',
  action: PromoteAction,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  }),
  conditions: AdminRole
});

const RecordViolationInteraction = Interaction.create({
  name: 'RecordViolation',
  action: RecordAction,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        required: true
      }),
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'violationType',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        required: false
      }),
      PayloadItem.create({
        name: 'scoreDeduction',
        required: true
      })
    ]
  }),
  conditions: AdminOrDormHead
});

const RequestKickoutInteraction = Interaction.create({
  name: 'RequestKickout', 
  action: RequestAction,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        required: true
      }),
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      })
    ]
  }),
  conditions: DormHeadRole
});

const ProcessKickoutRequestInteraction = Interaction.create({
  name: 'ProcessKickoutRequest',
  action: ProcessAction,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        required: true
      }),
      PayloadItem.create({
        name: 'decision',
        required: true
      })
    ]
  }),
  conditions: AdminRole
});

// Add computed properties that depend on interactions (after interactions are defined)

// TODO: StateMachine for status updates will be added after basic functionality works

// Add StateMachine for User role updates
User.properties.push(
  Property.create({
    name: 'currentRole',
    type: 'string',
    defaultValue: () => 'student',
    computation: StateMachine.create({
      states: [studentState, dormHeadState, adminState],
      transfers: [
        StateTransfer.create({
          trigger: PromoteToDormHeadInteraction,
          current: studentState,
          next: dormHeadState,
          computeTarget: (event) => ({ id: event.payload.userId })
        })
      ],
      defaultState: studentState
    })
  })
);

// Export all definitions
export const entities = [
  User,
  Dormitory,
  DormitoryAssignment,
  ViolationRecord,
  KickoutRequest
];

export const relations = [
  UserDormitoryRelation,
  UserViolationRelation,
  UserKickoutTargetRelation,
  UserKickoutApplicantRelation
];

export const interactions = [
  CreateDormitoryInteraction,
  AssignUserToDormitoryInteraction,
  PromoteToDormHeadInteraction,
  RecordViolationInteraction,
  RequestKickoutInteraction,
  ProcessKickoutRequestInteraction
];

export const activities = [];
export const dicts = [];