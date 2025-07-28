import { 
  Entity, Property, Relation, 
  Count, Summation, WeightedSummation, Every, Any, Transform, 
  StateMachine, StateNode, StateTransfer, RealTime, Expression, 
  Dictionary, Custom, MatchExp,
  Interaction, Action, Payload, PayloadItem, InteractionEventEntity
} from 'interaqt';

// ========== State Nodes Declaration ==========
// Declare all state nodes before use in StateMachines

// User role states
const studentRoleState = StateNode.create({ name: 'student' });
const dormHeadRoleState = StateNode.create({ name: 'dormHead' });
const adminRoleState = StateNode.create({ name: 'admin' });

// User status states
const activeUserState = StateNode.create({ name: 'active' });
const kickedUserState = StateNode.create({ name: 'kicked' });
const pendingKickUserState = StateNode.create({ name: 'pending_kick' });

// Dormitory status states
const activeDormitoryState = StateNode.create({ name: 'active' });
const inactiveDormitoryState = StateNode.create({ name: 'inactive' });

// Bed status states
const availableBedState = StateNode.create({ name: 'available' });
const occupiedBedState = StateNode.create({ name: 'occupied' });

// ScoreRecord status states
const activeScoreState = StateNode.create({ name: 'active' });
const revokedScoreState = StateNode.create({ 
  name: 'revoked',
  computeValue: (event: any) => ({
    revokedAt: Math.floor(Date.now()/1000),
    revokeReason: event?.payload?.reason || 'No reason provided'
  })
});

// KickRequest status states
const pendingKickRequestState = StateNode.create({ name: 'pending' });
const approvedKickRequestState = StateNode.create({ 
  name: 'approved',
  computeValue: (event: any) => ({
    processedAt: Math.floor(Date.now()/1000),
    adminComment: event?.payload?.comment || ''
  })
});
const rejectedKickRequestState = StateNode.create({ 
  name: 'rejected',
  computeValue: (event: any) => ({
    processedAt: Math.floor(Date.now()/1000),
    adminComment: event?.payload?.comment || ''
  })
});

// ScoreRule status states
const activeRuleState = StateNode.create({ name: 'true' });
const inactiveRuleState = StateNode.create({ name: 'false' });

// Relation status states
const activeRelationState = StateNode.create({ name: 'active' });
const inactiveRelationState = StateNode.create({ name: 'inactive' });

// ========== Interactions ==========
// Define interactions first so they can be referenced in StateMachines

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

export const CreateScoreRecord = Interaction.create({
  name: 'CreateScoreRecord',
  action: Action.create({ name: 'createScoreRecord' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'score', required: true })
    ]
  })
});

export const RevokeScoreRecord = Interaction.create({
  name: 'RevokeScoreRecord',
  action: Action.create({ name: 'revokeScoreRecord' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'recordId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

export const CreateKickRequest = Interaction.create({
  name: 'CreateKickRequest',
  action: Action.create({ name: 'createKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
});

export const ProcessKickRequest = Interaction.create({
  name: 'ProcessKickRequest',
  action: Action.create({ name: 'processKickRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'action', required: true }),
      PayloadItem.create({ name: 'comment' })
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
      PayloadItem.create({ name: 'score', required: true }),
      PayloadItem.create({ name: 'category', required: true })
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
      PayloadItem.create({ name: 'score' }),
      PayloadItem.create({ name: 'category' }),
      PayloadItem.create({ name: 'isActive' })
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

// ========== Entity Definitions ==========

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
            computeTarget: (event: any) => ({ id: event.payload.userId })
          }),
          StateTransfer.create({
            trigger: RemoveDormHead, 
            current: dormHeadRoleState,
            next: studentRoleState,
            computeTarget: (event: any) => ({ id: event.payload.userId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeUserState, kickedUserState, pendingKickUserState],
        defaultState: activeUserState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessKickRequest,
            current: activeUserState,
            next: kickedUserState,
            computeTarget: async function(this: any, event: any) {
              if (event.payload.action === 'approve') {
                // Find the kick request to get target user
                const kickRequest = await this.system.storage.findOne('KickRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                return kickRequest?.target;
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
      name: 'totalScore', 
      type: 'number',
      defaultValue: () => 0
      // Will implement computation later after fixing basic issues
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
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeDormitoryState, inactiveDormitoryState],
        defaultState: activeDormitoryState,
        transfers: []
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'currentOccupancy', 
      type: 'number',
      defaultValue: () => 0
      // Will implement computation later
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
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
              // Find the bed being assigned
              const dormitory = await this.system.storage.findOne('Dormitory',
                MatchExp.atom({
                  key: 'id',
                  value: ['=', event.payload.dormitoryId]
                }),
                undefined,
                ['*']
              );
              if (dormitory) {
                const bed = await this.system.storage.findOneRelationByName('DormitoryBed',
                  MatchExp.atom({
                    key: 'source.id',
                    value: ['=', dormitory.id]
                  }).and(MatchExp.atom({
                    key: 'target.bedNumber',
                    value: ['=', event.payload.bedNumber]
                  })),
                  undefined,
                  ['target']
                );
                return bed?.target;
              }
              return null;
            }
          }),
          StateTransfer.create({
            trigger: RemoveUserFromDormitory,
            current: occupiedBedState,
            next: availableBedState,
            computeTarget: async function(this: any, event: any) {
              // Find the bed to release
              const userBedRelation = await this.system.storage.findOneRelationByName('UserBed',
                MatchExp.atom({
                  key: 'source.id',
                  value: ['=', event.payload.userId]
                }),
                undefined,
                ['target']
              );
              return userBedRelation?.target;
            }
          }),
          StateTransfer.create({
            trigger: ProcessKickRequest,
            current: occupiedBedState,
            next: availableBedState,
            computeTarget: async function(this: any, event: any) {
              if (event.payload.action === 'approve') {
                const kickRequest = await this.system.storage.findOne('KickRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                if (kickRequest) {
                  const userBedRelation = await this.system.storage.findOneRelationByName('UserBed',
                    MatchExp.atom({
                      key: 'source.id',
                      value: ['=', kickRequest.target.id]
                    }),
                    undefined,
                    ['target']
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
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'CreateDormitory') {
        // Create beds for the dormitory
        const beds = [];
        for (let i = 1; i <= event.payload.capacity; i++) {
          beds.push({
            bedNumber: i
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
      name: 'score', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeScoreState, revokedScoreState],
        defaultState: activeScoreState,
        transfers: [
          StateTransfer.create({
            trigger: RevokeScoreRecord,
            current: activeScoreState,
            next: revokedScoreState,
            computeTarget: (event: any) => ({ id: event.payload.recordId })
          })
        ]
      })
    }),
    Property.create({ 
      name: 'revokedAt', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'revokeReason', 
      type: 'string',
      defaultValue: () => ''
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'CreateScoreRecord') {
        return {
          reason: event.payload.reason,
          score: event.payload.score,
          user: { id: event.payload.targetUserId },
          operator: event.user,
          rule: { id: event.payload.ruleId }
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
      name: 'requestedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now()/1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending',
      computation: StateMachine.create({
        states: [pendingKickRequestState, approvedKickRequestState, rejectedKickRequestState],
        defaultState: pendingKickRequestState,
        transfers: [
          StateTransfer.create({
            trigger: ProcessKickRequest,
            current: pendingKickRequestState,
            next: approvedKickRequestState,
            computeTarget: (event: any) => {
              if (event.payload.action === 'approve') {
                return { id: event.payload.requestId };
              }
              return null;
            }
          }),
          StateTransfer.create({
            trigger: ProcessKickRequest,
            current: pendingKickRequestState,
            next: rejectedKickRequestState,
            computeTarget: (event: any) => {
              if (event.payload.action === 'reject') {
                return { id: event.payload.requestId };
              }
              return null;
            }
          })
        ]
      })
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'adminComment', 
      type: 'string',
      defaultValue: () => ''
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'CreateKickRequest') {
        return {
          reason: event.payload.reason,
          requester: event.user,
          target: { id: event.payload.targetUserId }
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
      name: 'score', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'category', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      defaultValue: () => true,
      computation: StateMachine.create({
        states: [activeRuleState, inactiveRuleState],
        defaultState: activeRuleState,
        transfers: [
          StateTransfer.create({
            trigger: DeactivateScoreRule,
            current: activeRuleState,
            next: inactiveRuleState,
            computeTarget: (event: any) => ({ id: event.payload.ruleId })
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
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'CreateScoreRule') {
        return {
          name: event.payload.name,
          description: event.payload.description,
          score: event.payload.score,
          category: event.payload.category
        };
      }
      return null;
    }
  })
});

// ========== Relation Definitions ==========

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
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [
          StateTransfer.create({
            trigger: RemoveUserFromDormitory,
            current: activeRelationState,
            next: inactiveRelationState,
            computeTarget: async function(this: any, event: any) {
              const relation = await this.system.storage.findOneRelationByName('UserDormitory',
                MatchExp.atom({
                  key: 'source.id',
                  value: ['=', event.payload.userId]
                }),
                undefined,
                ['id']
              );
              return relation;
            }
          }),
          StateTransfer.create({
            trigger: ProcessKickRequest,
            current: activeRelationState,
            next: inactiveRelationState,
            computeTarget: async function(this: any, event: any) {
              if (event.payload.action === 'approve') {
                const kickRequest = await this.system.storage.findOne('KickRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                if (kickRequest) {
                  const relation = await this.system.storage.findOneRelationByName('UserDormitory',
                    MatchExp.atom({
                      key: 'source.id',
                      value: ['=', kickRequest.target.id]
                    }),
                    undefined,
                    ['id']
                  );
                  return relation;
                }
              }
              return null;
            }
          })
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId },
          status: 'active',
          assignedAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
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
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [
          StateTransfer.create({
            trigger: RemoveUserFromDormitory,
            current: activeRelationState,
            next: inactiveRelationState,
            computeTarget: async function(this: any, event: any) {
              const relation = await this.system.storage.findOneRelationByName('UserBed',
                MatchExp.atom({
                  key: 'source.id',
                  value: ['=', event.payload.userId]
                }),
                undefined,
                ['id']
              );
              return relation;
            }
          }),
          StateTransfer.create({
            trigger: ProcessKickRequest,
            current: activeRelationState,
            next: inactiveRelationState,
            computeTarget: async function(this: any, event: any) {
              if (event.payload.action === 'approve') {
                const kickRequest = await this.system.storage.findOne('KickRequest',
                  MatchExp.atom({
                    key: 'id',
                    value: ['=', event.payload.requestId]
                  }),
                  undefined,
                  ['*']
                );
                if (kickRequest) {
                  const relation = await this.system.storage.findOneRelationByName('UserBed',
                    MatchExp.atom({
                      key: 'source.id',
                      value: ['=', kickRequest.target.id]
                    }),
                    undefined,
                    ['id']
                  );
                  return relation;
                }
              }
              return null;
            }
          })
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: async function(this: any, event: any) {
      if (event.interactionName === 'AssignUserToDormitory') {
        // Find the relationship between dormitory and bed
        const bedRelation = await this.system.storage.findOneRelationByName('DormitoryBed',
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.dormitoryId]
          }).and(MatchExp.atom({
            key: 'target.bedNumber',
            value: ['=', event.payload.bedNumber]
          })),
          undefined,
          ['target']
        );
        
        if (bedRelation) {
          return {
            source: { id: event.payload.userId },
            target: bedRelation.target,
            status: 'active',
            assignedAt: Math.floor(Date.now()/1000)
          };
        }
      }
      return null;
    }
  })
});

export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: async function(this: any, event: any) {
      if (event.interactionName === 'CreateDormitory') {
        // Find the dormitory that was just created
        const dormitory = await this.system.storage.findOne('Dormitory',
          MatchExp.atom({
            key: 'name',
            value: ['=', event.payload.name]
          }),
          undefined,
          ['id']
        );
        
        if (dormitory) {
          // Find all beds that were created for this dormitory
          const beds = [];
          for (let i = 1; i <= event.payload.capacity; i++) {
            const bed = await this.system.storage.findOne('Bed',
              MatchExp.atom({
                key: 'bedNumber',
                value: ['=', i]
              }),
              undefined,
              ['id'],
              1,
              0,
              'desc'
            );
            if (bed) {
              beds.push({
                source: dormitory,
                target: bed
              });
            }
          }
          return beds;
        }
      }
      return null;
    }
  })
});

export const DormitoryHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'head',
  target: User,
  targetProperty: 'managedDormitory',
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
          StateTransfer.create({
            trigger: RemoveDormHead,
            current: activeRelationState,
            next: inactiveRelationState,
            computeTarget: async function(this: any, event: any) {
              const relation = await this.system.storage.findOneRelationByName('DormitoryHead',
                MatchExp.atom({
                  key: 'target.id',
                  value: ['=', event.payload.userId]
                }),
                undefined,
                ['id']
              );
              return relation;
            }
          })
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: { id: event.payload.dormitoryId },
          target: { id: event.payload.userId },
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

export const ScoreRecordOperatorRelation = Relation.create({
  source: User,
  sourceProperty: 'operatedScoreRecords',
  target: ScoreRecord,
  targetProperty: 'operator',
  type: '1:n'
});

export const KickRequestRequesterRelation = Relation.create({
  source: User,
  sourceProperty: 'requestedKicks',
  target: KickRequest,
  targetProperty: 'requester',
  type: '1:n'
});

export const KickRequestTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'receivedKicks',
  target: KickRequest,
  targetProperty: 'target',
  type: '1:n'
});

export const KickRequestApproverRelation = Relation.create({
  source: User,
  sourceProperty: 'approvedKicks',
  target: KickRequest,
  targetProperty: 'approver',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: (event: any) => {
      if (event.interactionName === 'ProcessKickRequest') {
        return {
          source: event.user,
          target: { id: event.payload.requestId }
        };
      }
      return null;
    }
  })
});

export const ScoreRecordRuleRelation = Relation.create({
  source: ScoreRule,
  sourceProperty: 'scoreRecords',
  target: ScoreRecord,
  targetProperty: 'rule',
  type: '1:n'
});

// ========== Filtered Entities ==========

export const ActiveUser = Entity.create({
  name: 'ActiveUser',
  sourceEntity: User,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
  })
});

export const ActiveScoreRecord = Entity.create({
  name: 'ActiveScoreRecord',
  sourceEntity: ScoreRecord,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'active']
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

export const AvailableBed = Entity.create({
  name: 'AvailableBed',
  sourceEntity: Bed,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'available']
  })
});

// Export arrays for easy consumption
export const entities = [
  User, Dormitory, Bed, ScoreRecord, KickRequest, ScoreRule,
  ActiveUser, ActiveScoreRecord, PendingKickRequest, AvailableBed
];

export const relations = [
  UserDormitoryRelation, UserBedRelation, DormitoryBedRelation, DormitoryHeadRelation,
  UserScoreRecordRelation, ScoreRecordOperatorRelation, 
  KickRequestRequesterRelation, KickRequestTargetRelation, KickRequestApproverRelation,
  ScoreRecordRuleRelation
];

export const interactions = [
  CreateDormitory, AssignDormHead, RemoveDormHead, AssignUserToDormitory, RemoveUserFromDormitory,
  CreateScoreRecord, RevokeScoreRecord, CreateKickRequest, ProcessKickRequest,
  CreateScoreRule, UpdateScoreRule, DeactivateScoreRule
];

export const activities = [];
export const dicts = [];
export const recordMutationSideEffects = [];