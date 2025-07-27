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
  MatchExp,
  InteractionEventEntity
} from 'interaqt';

// ============================================================================
// STATE NODES (must be declared first)
// ============================================================================

// User role states
const studentRoleState = StateNode.create({ name: 'student' });
const dormHeadRoleState = StateNode.create({ name: 'dormHead' });
const adminRoleState = StateNode.create({ name: 'admin' });

// Bed status states
const availableBedState = StateNode.create({ name: 'available' });
const occupiedBedState = StateNode.create({ name: 'occupied' });

// KickoutRequest status states
const pendingRequestState = StateNode.create({ name: 'pending' });
const approvedRequestState = StateNode.create({ name: 'approved' });
const rejectedRequestState = StateNode.create({ name: 'rejected' });

// Relation lifecycle states (for UserDormitoryRelation and UserBedRelation)
const relationExistsState = StateNode.create({
  name: 'exists',
  computeValue: () => ({}) // Relation exists
});
const relationDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => null // Returning null deletes the relation
});

// ============================================================================
// INTERACTIONS (must be declared before used in computations)
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

export const AssignUserToBed = Interaction.create({
  name: 'AssignUserToBed',
  action: Action.create({ name: 'assignUserToBed' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedNumber', required: true })
    ]
  })
});

export const RecordScore = Interaction.create({
  name: 'RecordScore',
  action: Action.create({ name: 'recordScore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'points', required: true })
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
      PayloadItem.create({ name: 'processNote' })
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

export const GetUserScoreHistory = Interaction.create({
  name: 'GetUserScoreHistory',
  action: Action.create({ name: 'getUserScoreHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
});

export const GetMyDormitoryInfo = Interaction.create({
  name: 'GetMyDormitoryInfo',
  action: Action.create({ name: 'getMyDormitoryInfo' }),
  payload: Payload.create({
    items: []
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

export const GetKickoutRequests = Interaction.create({
  name: 'GetKickoutRequests',
  action: Action.create({ name: 'getKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
});

// ============================================================================
// ENTITIES (declared before relations that depend on them)
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
          StateTransfer.create({
            trigger: AssignDormHead,
            current: studentRoleState,
            next: dormHeadRoleState,
            computeTarget: (event) => ({ id: event.payload.userId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'canBeKickedOut',
      type: 'boolean',
      defaultValue: () => false
    })
  ]
  // No entity-level computation - users are created externally
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
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'availableBeds',
      type: 'number',
      computed: (dormitory) => (dormitory.capacity || 0) - (dormitory.occupiedBeds || 0)
    }),
    Property.create({
      name: 'isFullyOccupied',
      type: 'boolean',
      computed: (dormitory) => (dormitory.occupiedBeds || 0) >= (dormitory.capacity || 0)
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

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'number', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'available',
      computation: StateMachine.create({
        states: [availableBedState, occupiedBedState],
        defaultState: availableBedState,
        transfers: [
          StateTransfer.create({
            trigger: AssignUserToBed,
            current: availableBedState,
            next: occupiedBedState,
            computeTarget: async function(this: any, event) {
              // Find the bed in the specified dormitory with the specified number
              const bed = await this.system.storage.findOne(
                'Bed',
                MatchExp.atom({
                  key: 'number',
                  value: ['=', event.payload.bedNumber]
                }),
                undefined,
                ['*']
              );
              return bed;
            }
          }),
          StateTransfer.create({
            trigger: ProcessKickoutRequest,
            current: occupiedBedState,
            next: availableBedState,
            computeTarget: async function(this: any, event) {
              if (event.payload.decision === 'approved') {
                // Find the kickout request to get the target user
                const request = await this.system.storage.findOne(
                  'KickoutRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                
                if (request && request.targetUser) {
                  // Find the bed occupied by the target user
                  const userBedRelation = await this.system.storage.findOne(
                    'UserBedRelation',
                    MatchExp.atom({
                      key: 'source.id',
                      value: ['=', request.targetUser.id]
                    }),
                    undefined,
                    ['*']
                  );
                  return userBedRelation?.target;
                }
              }
              return null;
            }
          })
        ]
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'isOccupied',
      type: 'boolean',
      computed: (bed) => bed.status === 'occupied'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        const capacity = event.payload.capacity;
        const beds = [];
        for (let i = 1; i <= capacity; i++) {
          beds.push({
            number: i,
            status: 'available'
          });
        }
        return beds;
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
      name: 'points', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RecordScore') {
        return {
          reason: event.payload.reason,
          points: event.payload.points
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
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending',
      computation: StateMachine.create({
        states: [pendingRequestState, approvedRequestState, rejectedRequestState],
        defaultState: pendingRequestState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessKickoutRequest,
            current: pendingRequestState,
            next: approvedRequestState,
            computeTarget: (event) => {
              if (event.payload.decision === 'approved') {
                return { id: event.payload.requestId };
              }
              return null;
            }
          }),
          StateTransfer.create({
            trigger: ProcessKickoutRequest,
            current: pendingRequestState,
            next: rejectedRequestState,
            computeTarget: (event) => {
              if (event.payload.decision === 'rejected') {
                return { id: event.payload.requestId };
              }
              return null;
            }
          })
        ]
      })
    }),
    Property.create({ 
      name: 'requestedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'string'
    }),
    Property.create({ 
      name: 'processNote', 
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'RequestKickout') {
        return {
          reason: event.payload.reason,
          requester: event.user,
          targetUser: { id: event.payload.targetUserId }
        };
      }
      return null;
    }
  })
});

// ============================================================================
// RELATIONS (declared after entities)
// ============================================================================

export const UserDormitoryRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: 'n:1',
  sourceProperty: 'dormitory',
  targetProperty: 'users',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    })
  ],
  computation: StateMachine.create({
    states: [relationExistsState, relationDeletedState],
    defaultState: relationDeletedState,
    transfers: [
      // Create relation when user is assigned to bed
      StateTransfer.create({
        trigger: AssignUserToBed,
        current: relationDeletedState,
        next: relationExistsState,
        computeTarget: (event) => ({
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId }
        })
      }),
      // Delete relation when user is kicked out (approved)
      StateTransfer.create({
        trigger: ProcessKickoutRequest,
        current: relationExistsState,
        next: relationDeletedState,
        computeTarget: async function(this: any, event) {
          if (event.payload.decision === 'approved') {
            // Find the kickout request to get the target user
            const request = await this.system.storage.findOne(
              'KickoutRequest',
              MatchExp.atom({
                key: 'id',
                value: ['=', event.payload.requestId]
              }),
              undefined,
              ['*']
            );
            
            if (request && request.targetUser) {
              // Find the existing relation to delete
              const relation = await this.system.storage.findOne(
                'UserDormitoryRelation',
                MatchExp.atom({
                  key: 'source.id',
                  value: ['=', request.targetUser.id]
                }),
                undefined,
                ['*']
              );
              return relation;
            }
          }
          return null;
        }
      })
    ]
  })
});

export const UserBedRelation = Relation.create({
  source: User,
  target: Bed,
  type: '1:1',
  sourceProperty: 'bed',
  targetProperty: 'user',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ],
  computation: StateMachine.create({
    states: [relationExistsState, relationDeletedState],
    defaultState: relationDeletedState,
    transfers: [
      // Create relation when user is assigned to bed
      StateTransfer.create({
        trigger: AssignUserToBed,
        current: relationDeletedState,
        next: relationExistsState,
        computeTarget: async function(this: any, event) {
          // Find the bed in the specified dormitory with the specified number
          const bed = await this.system.storage.findOne(
            'Bed',
            MatchExp.atom({
              key: 'number',
              value: ['=', event.payload.bedNumber]
            }),
            undefined,
            ['*']
          );
          
          return {
            source: { id: event.payload.userId },
            target: bed
          };
        }
      }),
      // Delete relation when user is kicked out (approved)
      StateTransfer.create({
        trigger: ProcessKickoutRequest,
        current: relationExistsState,
        next: relationDeletedState,
        computeTarget: async function(this: any, event) {
          if (event.payload.decision === 'approved') {
            // Find the kickout request to get the target user
            const request = await this.system.storage.findOne(
              'KickoutRequest',
              MatchExp.atom({
                key: 'id',
                value: ['=', event.payload.requestId]
              }),
              undefined,
              ['*']
            );
            
            if (request && request.targetUser) {
              // Find the existing relation to delete
              const relation = await this.system.storage.findOne(
                'UserBedRelation',
                MatchExp.atom({
                  key: 'source.id',
                  value: ['=', request.targetUser.id]
                }),
                undefined,
                ['*']
              );
              return relation;
            }
          }
          return null;
        }
      })
    ]
  })
});

export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  target: Bed,
  type: '1:n',
  sourceProperty: 'beds',
  targetProperty: 'dormitory',
  properties: [
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
  // No computation - created automatically with entities
});

export const DormitoryHeadRelation = Relation.create({
  source: User,
  target: Dormitory,
  type: '1:1',
  sourceProperty: 'managedDormitory',
  targetProperty: 'head',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'appointedBy', 
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          appointedBy: event.user.id
        };
      }
      return null;
    }
  })
});

export const UserScoreRelation = Relation.create({
  source: ScoreRecord,
  target: User,
  type: 'n:1',
  sourceProperty: 'targetUser',
  targetProperty: 'scoreRecords',
  properties: [
    Property.create({ 
      name: 'recordedBy', 
      type: 'string'
    })
  ]
  // No computation - created automatically with ScoreRecord
});

export const RequestTargetRelation = Relation.create({
  source: KickoutRequest,
  target: User,
  type: 'n:1',
  sourceProperty: 'targetUser',
  targetProperty: 'kickoutRequests'
  // No computation - created automatically with KickoutRequest
});

export const RequestRequesterRelation = Relation.create({
  source: KickoutRequest,
  target: User,
  type: 'n:1',
  sourceProperty: 'requester',
  targetProperty: 'myKickoutRequests'
  // No computation - created automatically with KickoutRequest
});

export const RequestProcessorRelation = Relation.create({
  source: KickoutRequest,
  target: User,
  type: 'n:1',
  sourceProperty: 'processor',
  targetProperty: 'processedKickoutRequests',
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'ProcessKickoutRequest') {
        return {
          source: { id: event.payload.requestId },
          target: event.user
        };
      }
      return null;
    }
  })
});

// ============================================================================
// ADD COMPUTED PROPERTIES THAT DEPEND ON RELATIONS
// ============================================================================

// Add totalScore property to User after UserScoreRelation is defined
User.properties.push(
  Property.create({
    name: 'totalScore',
    type: 'number',
    defaultValue: () => 0,
    computation: Summation.create({
      record: UserScoreRelation,
      direction: 'target',
      attributeQuery: [['source', { attributeQuery: ['points'] }]]
    })
  })
);

// Update canBeKickedOut to be computed based on totalScore
const canBeKickedOutProperty = User.properties.find(p => p.name === 'canBeKickedOut');
if (canBeKickedOutProperty) {
  canBeKickedOutProperty.computed = (user) => (user.totalScore || 0) >= 100;
}

// Add occupiedBeds property to Dormitory after DormitoryBedRelation is defined
Dormitory.properties.push(
  Property.create({
    name: 'occupiedBeds',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: DormitoryBedRelation,
      direction: 'source',
      callback: (relation) => {
        return relation.target && relation.target.status === 'occupied';
      }
    })
  })
);

// ============================================================================
// EXPORTS
// ============================================================================

export const entities = [
  User,
  Dormitory, 
  Bed,
  ScoreRecord,
  KickoutRequest
];

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryHeadRelation,
  UserScoreRelation,
  RequestTargetRelation,
  RequestRequesterRelation,
  RequestProcessorRelation
];

export const activities = [];

export const interactions = [
  CreateDormitory,
  AssignDormHead,
  AssignUserToBed,
  RecordScore,
  RequestKickout,
  ProcessKickoutRequest,
  GetDormitoryInfo,
  GetUserScoreHistory,
  GetMyDormitoryInfo,
  GetAllDormitories,
  GetKickoutRequests
];

export const dicts = [];