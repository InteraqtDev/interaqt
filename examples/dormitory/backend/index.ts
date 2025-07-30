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

const InteractionEventEntityType = InteractionEventEntity;

// ===== INTERACTION DEFINITIONS (Must be declared first) =====

export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'createUser' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'email', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'role', 
        required: true 
      })
    ]
  })
});

export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
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
  })
});

export const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assignUserToDormitory' }),
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
  })
});

export const AssignDormitoryHead = Interaction.create({
  name: 'AssignDormitoryHead',
  action: Action.create({ name: 'assignDormitoryHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      })
    ]
  })
});

export const DeductUserScore = Interaction.create({
  name: 'DeductUserScore',
  action: Action.create({ name: 'deductUserScore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUserId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'reason', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'points', 
        required: true 
      })
    ]
  })
});

export const SubmitExpelRequest = Interaction.create({
  name: 'SubmitExpelRequest',
  action: Action.create({ name: 'submitExpelRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'targetUserId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'reason', 
        required: true 
      })
    ]
  })
});

export const ProcessExpelRequest = Interaction.create({
  name: 'ProcessExpelRequest',
  action: Action.create({ name: 'processExpelRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'requestId', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'decision', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'comment' 
      })
    ]
  })
});

export const ViewDormitoryMembers = Interaction.create({
  name: 'ViewDormitoryMembers',
  action: Action.create({ name: 'viewDormitoryMembers' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'dormitoryId', 
        required: true 
      })
    ]
  })
});

export const ViewUserProfile = Interaction.create({
  name: 'ViewUserProfile',
  action: Action.create({ name: 'viewUserProfile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      })
    ]
  })
});

export const ViewScoreRecords = Interaction.create({
  name: 'ViewScoreRecords',
  action: Action.create({ name: 'viewScoreRecords' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'userId', 
        required: true 
      })
    ]
  })
});

// ===== STATE NODES DECLARATION (Must be declared before use) =====

// User role state nodes
const studentRoleState = StateNode.create({ name: 'student' });
const dormHeadRoleState = StateNode.create({ name: 'dormHead' });
const adminRoleState = StateNode.create({ name: 'admin' });

// User status state nodes
const activeUserState = StateNode.create({ name: 'active' });
const expelledUserState = StateNode.create({ name: 'expelled' });

// User score state nodes
const scoreInitialState = StateNode.create({ name: 'initial' });
const scoreUpdatedState = StateNode.create({ 
  name: 'updated',
  computeValue: async function(this: any, event: any) {
    // Calculate new score = current score - deducted points
    const currentRecord = this.getCurrentRecord();
    const currentScore = currentRecord?.score || 100;
    const deductedPoints = event.payload.points;
    return Math.max(0, currentScore - deductedPoints);
  }
});

// Bed status state nodes
const availableBedState = StateNode.create({ name: 'available' });
const occupiedBedState = StateNode.create({ name: 'occupied' });

// ExpelRequest status state nodes
const pendingState = StateNode.create({ name: 'pending' });
const approvedState = StateNode.create({ 
  name: 'approved',
  computeValue: () => ({
    processedAt: Math.floor(Date.now()/1000)
  })
});
const rejectedState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => ({
    processedAt: Math.floor(Date.now()/1000)
  })
});

// Relation lifecycle state nodes
const relationExistsState = StateNode.create({
  name: 'exists',
  computeValue: () => ({}) // Relation exists
});

const relationDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => null // Returning null deletes the relation
});

// ===== FORWARD DECLARATIONS =====
// We'll define DormitoryBedRelation after the entities are created

// ===== ENTITY DEFINITIONS =====

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
            trigger: AssignDormitoryHead,
            current: studentRoleState,
            next: dormHeadRoleState,
            computeTarget: (event: any) => ({ id: event.payload.userId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'score', 
      type: 'number',
      defaultValue: () => 100,
      computation: StateMachine.create({
        states: [scoreInitialState, scoreUpdatedState],
        defaultState: scoreInitialState,
        transfers: [
          StateTransfer.create({
            trigger: DeductUserScore,
            current: scoreInitialState,
            next: scoreUpdatedState,
            computeTarget: (event: any) => ({ id: event.payload.targetUserId })
          }),
          StateTransfer.create({
            trigger: DeductUserScore,
            current: scoreUpdatedState,
            next: scoreUpdatedState,
            computeTarget: (event: any) => ({ id: event.payload.targetUserId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeUserState, expelledUserState],
        defaultState: activeUserState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessExpelRequest,
            current: activeUserState,
            next: expelledUserState,
            computeTarget: async function(this: any, event: any) {
              if (event.payload.decision === 'approved') {
                // Find the expel request to get the target user
                const request = await this.system.storage.findOne(
                  'ExpelRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                
                if (request && request.targetUser) {
                  return { id: request.targetUser.id };
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
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntityType,
    callback: (event: any) => {
      if (event.interactionName === 'CreateUser') {
        return {
          name: event.payload.name,
          email: event.payload.email,
          role: event.payload.role,
          score: 100,
          status: 'active',
          createdAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
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
      name: 'occupiedCount',
      type: 'number',
      defaultValue: () => 0,
      computed: function(dormitory: any) {
        // This will be updated via a separate computation after DormitoryBedRelation is available
        return 0;
      }
    }),
    Property.create({
      name: 'availableCount',
      type: 'number',
      computed: function(dormitory: any) {
        return (dormitory.capacity || 0) - (dormitory.occupiedCount || 0);
      }
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntityType,
    callback: (event: any) => {
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

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'bedNumber', 
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
            trigger: AssignUserToDormitory,
            current: availableBedState,
            next: occupiedBedState,
            computeTarget: async function(this: any, event: any) {
              // Find the bed in the specified dormitory with the specified bed number
              const bed = await this.system.storage.findOne(
                'Bed',
                MatchExp.atom({
                  key: 'bedNumber',
                  value: ['=', event.payload.bedNumber]
                }),
                undefined,
                ['*']
              );
              return bed;
            }
          }),
          StateTransfer.create({
            trigger: ProcessExpelRequest,
            current: occupiedBedState,
            next: availableBedState,
            computeTarget: async function(this: any, event: any) {
              if (event.payload.decision === 'approved') {
                // Find the expelled user's bed
                const request = await this.system.storage.findOne(
                  'ExpelRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                
                if (request && request.targetUser) {
                  // Find the user's bed through UserBedRelation
                  const userBedRelation = await this.system.storage.findOne(
                    'UserBedRelation',
                    MatchExp.atom({
                      key: 'source.id',
                      value: ['=', request.targetUser.id]
                    }),
                    undefined,
                    ['*']
                  );
                  
                  if (userBedRelation && userBedRelation.target) {
                    return userBedRelation.target;
                  }
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
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: Dormitory,
    callback: (dormitory: any) => {
      // Create beds when dormitory is created
      const beds = [];
      for (let i = 1; i <= dormitory.capacity; i++) {
        beds.push({
          bedNumber: i,
          status: 'available',
          createdAt: Math.floor(Date.now()/1000),
          dormitory: { id: dormitory.id }
        });
      }
      return beds;
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
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntityType,
    callback: (event: any) => {
      if (event.interactionName === 'DeductUserScore') {
        return {
          reason: event.payload.reason,
          points: event.payload.points,
          createdAt: Math.floor(Date.now()/1000),
          user: { id: event.payload.targetUserId },
          deductor: event.user
        };
      }
      return null;
    }
  })
});

export const ExpelRequest = Entity.create({
  name: 'ExpelRequest',
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
        states: [pendingState, approvedState, rejectedState],
        defaultState: pendingState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessExpelRequest,
            current: pendingState,
            next: approvedState,
            computeTarget: (event: any) => {
              if (event.payload.decision === 'approved') {
                return { id: event.payload.requestId };
              }
              return null;
            }
          }),
          StateTransfer.create({
            trigger: ProcessExpelRequest,
            current: pendingState,
            next: rejectedState,
            computeTarget: (event: any) => {
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
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number',
      computation: StateMachine.create({
        states: [scoreInitialState, scoreUpdatedState],
        defaultState: scoreInitialState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessExpelRequest,
            current: scoreInitialState,
            next: scoreUpdatedState,
            computeTarget: (event: any) => ({ id: event.payload.requestId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'comment', 
      type: 'string',
      computation: StateMachine.create({
        states: [scoreInitialState, scoreUpdatedState],
        defaultState: scoreInitialState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessExpelRequest,
            current: scoreInitialState,
            next: scoreUpdatedState,
            computeTarget: (event: any) => ({ id: event.payload.requestId })
          })
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntityType,
    callback: (event: any) => {
      if (event.interactionName === 'SubmitExpelRequest') {
        return {
          reason: event.payload.reason,
          status: 'pending',
          createdAt: Math.floor(Date.now()/1000),
          applicant: event.user,
          targetUser: { id: event.payload.targetUserId }
        };
      }
      return null;
    }
  })
});

// ===== FILTERED ENTITIES =====

export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

export const AvailableBed = Entity.create({
  name: 'AvailableBed',
  sourceEntity: Bed,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'available']
  })
});

export const PendingExpelRequest = Entity.create({
  name: 'PendingExpelRequest',
  sourceEntity: ExpelRequest,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'pending']
  })
});

export const LowScoreUser = Entity.create({
  name: 'LowScoreUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'score',
    value: ['<', 60]
  }).and(MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  }))
});

// ===== RELATION DEFINITIONS =====

export const DormitoryBedRelation = Relation.create({
  source: Bed,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'beds',
  type: 'n:1'
  // No computation needed - created automatically with Bed entity
});

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
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    })
  ],
  computation: StateMachine.create({
    states: [relationExistsState, relationDeletedState],
    defaultState: relationDeletedState,
    transfers: [
      StateTransfer.create({
        trigger: AssignUserToDormitory,
        current: relationDeletedState,
        next: relationExistsState,
        computeTarget: (event: any) => ({
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId }
        })
      }),
      StateTransfer.create({
        trigger: ProcessExpelRequest,
        current: relationExistsState,
        next: relationDeletedState,
        computeTarget: async function(this: any, event: any) {
          if (event.payload.decision === 'approved') {
            const request = await this.system.storage.findOne(
              'ExpelRequest',
              MatchExp.atom({
                key: 'id',
                value: ['=', event.payload.requestId]
              }),
              undefined,
              ['*']
            );
            
            if (request && request.targetUser) {
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
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: StateMachine.create({
    states: [relationExistsState, relationDeletedState],
    defaultState: relationDeletedState,
    transfers: [
      StateTransfer.create({
        trigger: AssignUserToDormitory,
        current: relationDeletedState,
        next: relationExistsState,
        computeTarget: async function(this: any, event: any) {
          // Find the specific bed to assign
          const bed = await this.system.storage.findOne(
            'Bed',
            MatchExp.atom({
              key: 'bedNumber',
              value: ['=', event.payload.bedNumber]
            }),
            undefined,
            ['*']
          );
          
          if (bed) {
            return {
              source: { id: event.payload.userId },
              target: { id: bed.id }
            };
          }
          return null;
        }
      }),
      StateTransfer.create({
        trigger: ProcessExpelRequest,
        current: relationExistsState,
        next: relationDeletedState,
        computeTarget: async function(this: any, event: any) {
          if (event.payload.decision === 'approved') {
            const request = await this.system.storage.findOne(
              'ExpelRequest',
              MatchExp.atom({
                key: 'id',
                value: ['=', event.payload.requestId]
              }),
              undefined,
              ['*']
            );
            
            if (request && request.targetUser) {
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

// DormitoryBedRelation already defined above

export const DormitoryHeadRelation = Relation.create({
  source: User,
  sourceProperty: 'managedDormitory',
  target: Dormitory,
  targetProperty: 'head',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: StateMachine.create({
    states: [relationExistsState, relationDeletedState],
    defaultState: relationDeletedState,
    transfers: [
      StateTransfer.create({
        trigger: AssignDormitoryHead,
        current: relationDeletedState,
        next: relationExistsState,
        computeTarget: (event: any) => ({
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId }
        })
      }),
      StateTransfer.create({
        trigger: ProcessExpelRequest,
        current: relationExistsState,
        next: relationDeletedState,
        computeTarget: async function(this: any, event: any) {
          if (event.payload.decision === 'approved') {
            const request = await this.system.storage.findOne(
              'ExpelRequest',
              MatchExp.atom({
                key: 'id',
                value: ['=', event.payload.requestId]
              }),
              undefined,
              ['*']
            );
            
            if (request && request.targetUser) {
              // Check if the expelled user is a dorm head
              const relation = await this.system.storage.findOne(
                'DormitoryHeadRelation',
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

export const UserScoreRecordRelation = Relation.create({
  source: ScoreRecord,
  sourceProperty: 'user',
  target: User,
  targetProperty: 'scoreRecords',
  type: 'n:1'
  // No computation needed - created automatically with ScoreRecord entity
});

export const ScoreRecordDeductorRelation = Relation.create({
  source: ScoreRecord,
  sourceProperty: 'deductor',
  target: User,
  targetProperty: 'deductedScoreRecords',
  type: 'n:1'
  // No computation needed - created automatically with ScoreRecord entity
});

export const ApplicantExpelRequestRelation = Relation.create({
  source: ExpelRequest,
  sourceProperty: 'applicant',
  target: User,
  targetProperty: 'submittedExpelRequests',
  type: 'n:1'
  // No computation needed - created automatically with ExpelRequest entity
});

export const TargetExpelRequestRelation = Relation.create({
  source: ExpelRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'receivedExpelRequests',
  type: 'n:1'
  // No computation needed - created automatically with ExpelRequest entity
});

export const ProcessorExpelRequestRelation = Relation.create({
  source: ExpelRequest,
  sourceProperty: 'processor',
  target: User,
  targetProperty: 'processedExpelRequests',
  type: 'n:1',
  computation: StateMachine.create({
    states: [relationExistsState, relationDeletedState],
    defaultState: relationDeletedState,
    transfers: [
      StateTransfer.create({
        trigger: ProcessExpelRequest,
        current: relationDeletedState,
        next: relationExistsState,
        computeTarget: (event: any) => ({
          source: { id: event.payload.requestId },
          target: event.user
        })
      })
    ]
  })
});

// ===== EXPORTS =====

export const entities = [
  User, 
  Dormitory, 
  Bed, 
  ScoreRecord, 
  ExpelRequest,
  ActiveUser,
  AvailableBed,
  PendingExpelRequest,
  LowScoreUser
];

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryHeadRelation,
  UserScoreRecordRelation,
  ScoreRecordDeductorRelation,
  ApplicantExpelRequestRelation,
  TargetExpelRequestRelation,
  ProcessorExpelRequestRelation
];

export const interactions = [
  CreateUser,
  CreateDormitory,
  AssignUserToDormitory,
  AssignDormitoryHead,
  DeductUserScore,
  SubmitExpelRequest,
  ProcessExpelRequest,
  ViewDormitoryMembers,
  ViewUserProfile,
  ViewScoreRecords
];

export const activities = [];

export const dicts = [];