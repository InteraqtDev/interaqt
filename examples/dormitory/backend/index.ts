import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Count, 
  Summation, 
  WeightedSummation, 
  Every, 
  Any, 
  Transform, 
  StateMachine, 
  StateNode, 
  StateTransfer, 
  RealTime, 
  Expression, 
  Dictionary, 
  Custom,
  MatchExp,
  InteractionEventEntity
} from 'interaqt';

// ============================================================================
// STATE NODES - Must be declared before use
// ============================================================================

// User role states
const studentRoleState = StateNode.create({ name: 'student' });
const dormHeadRoleState = StateNode.create({ name: 'dormHead' });
const adminRoleState = StateNode.create({ name: 'admin' });

// User status states
const activeUserState = StateNode.create({ name: 'active' });
const kickedUserState = StateNode.create({ name: 'kicked' });
const suspendedUserState = StateNode.create({ name: 'suspended' });

// Dormitory status states
const activeDormState = StateNode.create({ name: 'active' });
const inactiveDormState = StateNode.create({ name: 'inactive' });
const maintenanceDormState = StateNode.create({ name: 'maintenance' });

// Score rule states
const activeRuleState = StateNode.create({ name: 'active', computeValue: () => true });
const inactiveRuleState = StateNode.create({ name: 'inactive', computeValue: () => false });

// Kick request states
const pendingRequestState = StateNode.create({ name: 'pending' });
const approvedRequestState = StateNode.create({ name: 'approved' });
const rejectedRequestState = StateNode.create({ name: 'rejected' });

// Relation status states
const activeRelationState = StateNode.create({ name: 'active' });
const inactiveRelationState = StateNode.create({ name: 'inactive' });

// Generic update states for timestamps
const initialState = StateNode.create({ name: 'initial' });
const updatedState = StateNode.create({ 
  name: 'updated',
  computeValue: () => Math.floor(Date.now()/1000)
});

// ============================================================================
// ENTITIES
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
      defaultValue: () => 'student',
      computation: StateMachine.create({
        states: [studentRoleState, dormHeadRoleState, adminRoleState],
        defaultState: studentRoleState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
    }),
    Property.create({
      name: 'totalScore',
      type: 'number',
      defaultValue: () => 100
      // Note: Computation will be added after relations are defined
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeUserState, kickedUserState, suspendedUserState],
        defaultState: activeUserState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000),
      computation: StateMachine.create({
        states: [initialState, updatedState],
        defaultState: initialState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
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
      // Note: Computation will be added after relations are defined
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeDormState, inactiveDormState, maintenanceDormState],
        defaultState: activeDormState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000),
      computation: StateMachine.create({
        states: [initialState, updatedState],
        defaultState: initialState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
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
      defaultValue: () => true,
      computation: StateMachine.create({
        states: [activeRuleState, inactiveRuleState],
        defaultState: activeRuleState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000),
      computation: StateMachine.create({
        states: [initialState, updatedState],
        defaultState: initialState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
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
        // Note: In Stage 2, we'll need to fetch the ScoreRule to get the actual score value
        return {
          reason: event.payload.reason,
          score: 10, // Placeholder - will be computed from ScoreRule in Stage 2
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
      defaultValue: () => 'pending',
      computation: StateMachine.create({
        states: [pendingRequestState, approvedRequestState, rejectedRequestState],
        defaultState: pendingRequestState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({
      name: 'processedAt',
      type: 'number',
      computation: StateMachine.create({
        states: [initialState, updatedState],
        defaultState: initialState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
    }),
    Property.create({
      name: 'adminNotes',
      type: 'string',
      computation: StateMachine.create({
        states: [initialState, StateNode.create({ 
          name: 'updated',
          computeValue: (lastValue, event) => event?.payload?.adminNotes || ''
        })],
        defaultState: initialState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
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
// FILTERED ENTITIES
// ============================================================================

export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

export const ActiveDormitory = Entity.create({
  name: 'ActiveDormitory',
  sourceEntity: Dormitory,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

export const ActiveScoreRule = Entity.create({
  name: 'ActiveScoreRule',
  sourceEntity: ScoreRule,
  filterCondition: MatchExp.atom({
    key: 'isActive',
    value: ['=', true]
  })
});

export const PendingKickRequest = Entity.create({
  name: 'PendingKickRequest',
  sourceEntity: KickRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});

export const LowScoreUser = Entity.create({
  name: 'LowScoreUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'totalScore',
    value: ['<', 20]
  }).and({
    key: 'status',
    value: ['=', 'active']
  })
});

// ============================================================================
// RELATIONS
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
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
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
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [
          // Note: State transfers will be added in Stage 2 with actual interactions
        ]
      })
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
  // No computation needed - created via entity reference when ScoreRecord is created
});

export const ScoreRuleRecordRelation = Relation.create({
  source: ScoreRule,
  sourceProperty: 'records',
  target: ScoreRecord,
  targetProperty: 'rule',
  type: '1:n'
  // No computation needed - created via entity reference when ScoreRecord is created
});

export const RequestorKickRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'kickRequestsInitiated',
  target: KickRequest,
  targetProperty: 'requestor',
  type: '1:n'
  // No computation needed - created via entity reference when KickRequest is created
});

export const TargetUserKickRequestRelation = Relation.create({
  source: User,
  sourceProperty: 'kickRequestsReceived',
  target: KickRequest,
  targetProperty: 'targetUser',
  type: '1:n'
  // No computation needed - created via entity reference when KickRequest is created
});

export const DormitoryKickRequestRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'kickRequests',
  target: KickRequest,
  targetProperty: 'dormitory',
  type: '1:n'
  // No computation needed - created via entity reference when KickRequest is created
});

export const OperatorScoreRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'scoreRecordsOperated',
  target: ScoreRecord,
  targetProperty: 'operator',
  type: '1:n'
  // No computation needed - created via entity reference when ScoreRecord is created
});

// ============================================================================
// POST-RELATION COMPUTATIONS - Fix forward reference issues
// ============================================================================

// Add the totalScore computation to User entity
User.properties.find(p => p.name === 'totalScore').computation = Custom.create({
  name: 'UserTotalScoreCalculator',
  dataDeps: {
    scoreRecords: {
      type: 'relation',
      source: UserScoreRecordRelation,
      attributeQuery: [['target', { attributeQuery: ['score'] }]]
    }
  },
  compute: async function(dataDeps, record) {
    const userScoreRecords = (dataDeps.scoreRecords || []).filter(rel => 
      rel.source && rel.source.id === record.id
    );
    const totalDeductions = userScoreRecords.reduce((sum, rel) => 
      sum + (rel.target?.score || 0), 0
    );
    return Math.max(0, 100 - totalDeductions);
  }
});

// Add the currentOccupancy computation to Dormitory entity
Dormitory.properties.find(p => p.name === 'currentOccupancy').computation = Count.create({
  record: UserDormitoryRelation,
  direction: 'target',
  attributeQuery: ['status'],
  callback: function(relation) {
    return relation.status === 'active';
  }
});

// ============================================================================
// INTERACTIONS - Stage 1: Core Business Logic Only
// ============================================================================

// Dormitory Management Interactions
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
      PayloadItem.create({ name: 'capacity' }),
      PayloadItem.create({ name: 'status' })
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

export const GetAllDormitories = Interaction.create({
  name: 'GetAllDormitories',
  action: Action.create({ name: 'getAllDormitories' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

// User Assignment Management Interactions
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

export const TransferUserDormitory = Interaction.create({
  name: 'TransferUserDormitory',
  action: Action.create({ name: 'transferUserDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'newDormitoryId', required: true }),
      PayloadItem.create({ name: 'newBedNumber', required: true })
    ]
  })
});

// Dorm Head Management Interactions
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
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

// Score Rule Management Interactions
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
      PayloadItem.create({ name: 'scoreDeduction' })
    ]
  })
});

export const DeactivateScoreRule = Interaction.create({
  name: 'DeactivateScoreRule',
  action: Action.create({ name: 'deactivateScoreRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true })
    ]
  })
});

export const GetScoreRules = Interaction.create({
  name: 'GetScoreRules',
  action: Action.create({ name: 'getScoreRules' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'isActive' })
    ]
  })
});

// Score Operation Interactions
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

// Kick Request Management Interactions
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

export const RejectKickRequest = Interaction.create({
  name: 'RejectKickRequest',
  action: Action.create({ name: 'rejectKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'adminNotes' })
    ]
  })
});

export const GetKickRequests = Interaction.create({
  name: 'GetKickRequests',
  action: Action.create({ name: 'getKickRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'dormitoryId' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

// User Query Interactions
export const GetUserInfo = Interaction.create({
  name: 'GetUserInfo',
  action: Action.create({ name: 'getUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

export const GetDormitoryUsers = Interaction.create({
  name: 'GetDormitoryUsers',
  action: Action.create({ name: 'getDormitoryUsers' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
});

// ============================================================================
// DICTIONARIES
// ============================================================================

export const SystemStats = Dictionary.create({
  name: 'SystemStats',
  type: 'object',
  collection: false,
  computation: Custom.create({
    name: 'SystemStatsCalculator',
    dataDeps: {
      users: {
        type: 'records',
        source: User,
        attributeQuery: ['id', 'status']
      },
      dormitories: {
        type: 'records',
        source: Dormitory,
        attributeQuery: ['id', 'status', 'capacity', 'currentOccupancy']
      }
    },
    compute: async function(dataDeps) {
      const users = dataDeps.users || [];
      const dormitories = dataDeps.dormitories || [];
      
      const totalUsers = users.length;
      const activeUsers = users.filter(u => u.status === 'active').length;
      const totalDormitories = dormitories.length;
      const activeDormitories = dormitories.filter(d => d.status === 'active');
      
      const totalCapacity = activeDormitories.reduce((sum, dorm) => sum + (dorm.capacity || 0), 0);
      const totalOccupancy = activeDormitories.reduce((sum, dorm) => sum + (dorm.currentOccupancy || 0), 0);
      const averageOccupancyRate = totalCapacity > 0 ? (totalOccupancy / totalCapacity) * 100 : 0;
      
      return {
        totalUsers,
        activeUsers,
        kickedUsers: totalUsers - activeUsers,
        totalDormitories,
        activeDormitories: activeDormitories.length,
        totalCapacity,
        totalOccupancy,
        averageOccupancyRate: Math.round(averageOccupancyRate * 100) / 100
      };
    }
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
  KickRequest,
  ActiveUser,
  ActiveDormitory,
  ActiveScoreRule,
  PendingKickRequest,
  LowScoreUser
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
  UpdateDormitory,
  GetDormitoryInfo,
  GetAllDormitories,
  AssignUserToDormitory,
  RemoveUserFromDormitory,
  TransferUserDormitory,
  AssignDormHead,
  RemoveDormHead,
  CreateScoreRule,
  UpdateScoreRule,
  DeactivateScoreRule,
  GetScoreRules,
  DeductUserScore,
  GetUserScoreRecords,
  RequestKickUser,
  ApproveKickRequest,
  RejectKickRequest,
  GetKickRequests,
  GetUserInfo,
  GetDormitoryUsers
];

export const dicts = [
  SystemStats
];

export const activities = [];