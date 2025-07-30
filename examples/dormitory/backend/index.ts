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
  Any,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  MatchExp,
  InteractionEventEntity
} from 'interaqt'

// ================================
// STATE NODES DECLARATION (MUST BE FIRST)
// ================================

// User states
export const activeUserState = StateNode.create({ 
  name: 'active',
  computeValue: () => 'active'
})
export const kickedUserState = StateNode.create({ 
  name: 'kicked',
  computeValue: () => 'kicked'
})

// User role states  
export const studentRoleState = StateNode.create({ 
  name: 'student',
  computeValue: () => 'student'
})
export const dormHeadRoleState = StateNode.create({ 
  name: 'dormHead',
  computeValue: () => 'dormHead'
})

// DeductionRule states
export const activeRuleState = StateNode.create({ 
  name: 'active',
  computeValue: () => true
})
export const inactiveRuleState = StateNode.create({ 
  name: 'inactive',
  computeValue: () => false
})

// DeductionRecord states
export const activeDeductionState = StateNode.create({ 
  name: 'active',
  computeValue: () => 'active'
})
export const cancelledDeductionState = StateNode.create({ 
  name: 'cancelled',
  computeValue: () => 'cancelled'
})

// KickoutRequest states
export const pendingRequestState = StateNode.create({ 
  name: 'pending',
  computeValue: () => 'pending'
})
export const approvedRequestState = StateNode.create({ 
  name: 'approved',
  computeValue: (lastValue, event) => ({
    ...lastValue,
    status: 'approved',
    processedAt: Math.floor(Date.now() / 1000),
    processor: event?.user?.id
  })
})
export const rejectedRequestState = StateNode.create({ 
  name: 'rejected',
  computeValue: (lastValue, event) => ({
    ...lastValue,
    status: 'rejected',
    processedAt: Math.floor(Date.now() / 1000),
    processor: event?.user?.id
  })
})

// Relation states
export const activeRelationState = StateNode.create({ 
  name: 'active',
  computeValue: () => 'active'
})
export const inactiveRelationState = StateNode.create({ 
  name: 'inactive',
  computeValue: () => 'inactive'
})

// ================================
// ENTITIES
// ================================

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
        states: [studentRoleState, dormHeadRoleState],
        defaultState: studentRoleState,
        transfers: [] // Will be populated after interactions are defined
      })
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeUserState, kickedUserState],
        defaultState: activeUserState,
        transfers: [] // Will be populated after interactions are defined
      })
    }),
    Property.create({
      name: 'totalScore',
      type: 'number',
      defaultValue: () => 0,
      computation: null // Will be set after relations are defined
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

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
      defaultValue: () => 0,
      computation: null // Will be set after relations are defined
    }),
    Property.create({
      name: 'availableBeds',
      type: 'number',
      computed: function(dormitory) {
        return (dormitory.capacity || 0) - (dormitory.currentOccupancy || 0)
      }
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity
        }
      }
      return null
    }
  })
})

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'number', 
      type: 'number' 
    }),
    Property.create({
      name: 'isOccupied',
      type: 'boolean',
      defaultValue: () => false,
      computation: null // Will be set after relations are defined
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        const capacity = event.payload.capacity
        const beds = []
        for (let i = 1; i <= capacity; i++) {
          beds.push({ number: i })
        }
        return beds
      }
      return null
    }
  })
})

export const DeductionRule = Entity.create({
  name: 'DeductionRule',
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
      name: 'points', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      defaultValue: () => true,
      computation: StateMachine.create({
        states: [activeRuleState, inactiveRuleState],
        defaultState: activeRuleState,
        transfers: [] // Will be populated after interactions are defined
      })
    }),
    Property.create({
      name: 'usageCount',
      type: 'number',
      defaultValue: () => 0,
      computation: null // Will be set after relations are defined
    }),
    Property.create({
      name: 'totalPointsDeducted',
      type: 'number',
      defaultValue: () => 0,
      computation: null // Will be set after relations are defined
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'CreateDeductionRule') {
        return {
          name: event.payload.name,
          description: event.payload.description,
          points: event.payload.points
        }
      }
      return null
    }
  })
})

export const DeductionRecord = Entity.create({
  name: 'DeductionRecord',
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
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeDeductionState, cancelledDeductionState],
        defaultState: activeDeductionState,
        transfers: [] // Will be populated after interactions are defined
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: async function(this: any, event) {
      if (event.interactionName === 'RecordDeduction') {
        // Get the rule points
        const rule = await this.system.storage.findOne(
          'DeductionRule',
          MatchExp.atom({
            key: 'id',
            value: ['=', event.payload.ruleId]
          }),
          undefined,
          ['points']
        )
        
        return {
          reason: event.payload.reason,
          points: rule?.points || 0
        }
      }
      return null
    }
  })
})

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
        transfers: [] // Will be populated after interactions are defined
      })
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'processedAt', 
      type: 'number',
      computation: StateMachine.create({
        states: [
          StateNode.create({ 
            name: 'unprocessed',
            computeValue: () => null
          }),
          StateNode.create({ 
            name: 'processed',
            computeValue: () => Math.floor(Date.now() / 1000)
          })
        ],
        defaultState: StateNode.create({ name: 'unprocessed' }),
        transfers: [
          // Will be populated after interactions are defined
        ]
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'CreateKickoutRequest') {
        return {
          reason: event.payload.reason
        }
      }
      return null
    }
  })
})

// ================================
// RELATIONS
// ================================

export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [] // Will be populated after interactions are defined
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'AssignUserToDormitory') {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId }
        }
      }
      return null
    }
  })
})

export const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'user',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [] // Will be populated after interactions are defined
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: async function(this: any, event) {
      if (event.interactionName === 'AssignUserToDormitory') {
        // Find the specific bed in the dormitory
        const bed = await this.system.storage.findOne(
          'Bed',
          MatchExp.atom({
            key: 'number',
            value: ['=', event.payload.bedNumber]
          }),
          undefined,
          ['id']
        )
        
        if (bed) {
          return {
            source: { id: event.payload.userId },
            target: bed
          }
        }
      }
      return null
    }
  })
})

export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
})

export const DormitoryHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory', 
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'appointedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active',
      computation: StateMachine.create({
        states: [activeRelationState, inactiveRelationState],
        defaultState: activeRelationState,
        transfers: [] // Will be populated after interactions are defined
      })
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'AssignDormHead') {
        return {
          source: { id: event.payload.dormitoryId },
          target: { id: event.payload.userId }
        }
      }
      return null
    }
  })
})

export const UserDeductionRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'deductionRecords',
  target: DeductionRecord,
  targetProperty: 'user',
  type: '1:n'
})

export const DeductionRuleRecordRelation = Relation.create({
  source: DeductionRule,
  sourceProperty: 'records',
  target: DeductionRecord,
  targetProperty: 'rule',
  type: '1:n'
})

export const RecorderDeductionRelation = Relation.create({
  source: User,
  sourceProperty: 'recordedDeductions',
  target: DeductionRecord,
  targetProperty: 'recorder',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'user'],
    callback: (event) => {
      if (event.interactionName === 'RecordDeduction') {
        return {
          source: event.user,
          target: null // Will be set by the DeductionRecord entity creation
        }
      }
      return null
    }
  })
})

export const ApplicantKickoutRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequests',
  target: KickoutRequest,
  targetProperty: 'applicant',
  type: '1:n'
})

export const TargetKickoutRelation = Relation.create({
  source: User,
  sourceProperty: 'kickoutRequestsAgainst',
  target: KickoutRequest,
  targetProperty: 'target',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: (event) => {
      if (event.interactionName === 'CreateKickoutRequest') {
        return [
          // Applicant relation
          {
            source: event.user,
            target: null // Will be set by KickoutRequest creation
          },
          // Target relation
          {
            source: { id: event.payload.targetUserId },
            target: null // Will be set by KickoutRequest creation
          }
        ]
      }
      return null
    }
  })
})

export const ProcessorKickoutRelation = Relation.create({
  source: User,
  sourceProperty: 'processedKickoutRequests',
  target: KickoutRequest,
  targetProperty: 'processor',
  type: '1:n',
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: (event) => {
      if (event.interactionName === 'ApproveKickoutRequest' || 
          event.interactionName === 'RejectKickoutRequest') {
        return {
          source: event.user,
          target: { id: event.payload.requestId }
        }
      }
      return null
    }
  })
})

// ================================
// INTERACTIONS
// ================================

export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  })
})

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
})

export const DeleteDormitory = Interaction.create({
  name: 'DeleteDormitory',
  action: Action.create({ name: 'deleteDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

export const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'assignDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

export const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'removeDormHead' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

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
})

export const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'removeUserFromDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
})

export const CreateDeductionRule = Interaction.create({
  name: 'CreateDeductionRule',
  action: Action.create({ name: 'createDeductionRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'points', required: true })
    ]
  })
})

export const UpdateDeductionRule = Interaction.create({
  name: 'UpdateDeductionRule',
  action: Action.create({ name: 'updateDeductionRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'points' })
    ]
  })
})

export const DisableDeductionRule = Interaction.create({
  name: 'DisableDeductionRule',
  action: Action.create({ name: 'disableDeductionRule' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'ruleId', required: true })
    ]
  })
})

export const RecordDeduction = Interaction.create({
  name: 'RecordDeduction',
  action: Action.create({ name: 'recordDeduction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

export const CancelDeduction = Interaction.create({
  name: 'CancelDeduction',
  action: Action.create({ name: 'cancelDeduction' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'deductionId', required: true }),
      PayloadItem.create({ name: 'reason' })
    ]
  })
})

export const CreateKickoutRequest = Interaction.create({
  name: 'CreateKickoutRequest',
  action: Action.create({ name: 'createKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

export const ApproveKickoutRequest = Interaction.create({
  name: 'ApproveKickoutRequest',
  action: Action.create({ name: 'approveKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  })
})

export const RejectKickoutRequest = Interaction.create({
  name: 'RejectKickoutRequest',
  action: Action.create({ name: 'rejectKickoutRequest' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'reason' })
    ]
  })
})

export const GetDormitoryInfo = Interaction.create({
  name: 'GetDormitoryInfo',
  action: Action.create({ name: 'getDormitoryInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

export const GetDormitoryList = Interaction.create({
  name: 'GetDormitoryList',
  action: Action.create({ name: 'getDormitoryList' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
})

export const GetUserInfo = Interaction.create({
  name: 'GetUserInfo',
  action: Action.create({ name: 'getUserInfo' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
})

export const GetDeductionRules = Interaction.create({
  name: 'GetDeductionRules',
  action: Action.create({ name: 'getDeductionRules' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'isActive' })
    ]
  })
})

export const GetDeductionHistory = Interaction.create({
  name: 'GetDeductionHistory',
  action: Action.create({ name: 'getDeductionHistory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'limit' }),
      PayloadItem.create({ name: 'offset' })
    ]
  })
})

export const GetKickoutRequests = Interaction.create({
  name: 'GetKickoutRequests',
  action: Action.create({ name: 'getKickoutRequests' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'applicantId' }),
      PayloadItem.create({ name: 'targetId' })
    ]
  })
})

export const GetUserDeductionSummary = Interaction.create({
  name: 'GetUserDeductionSummary',
  action: Action.create({ name: 'getUserDeductionSummary' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
})

export const GetDormitoryStatistics = Interaction.create({
  name: 'GetDormitoryStatistics',
  action: Action.create({ name: 'getDormitoryStatistics' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

export const GetSystemStatistics = Interaction.create({
  name: 'GetSystemStatistics',
  action: Action.create({ name: 'getSystemStatistics' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'timeRange' })
    ]
  })
})

// ================================
// EXPORTS
// ================================

export const entities = [
  User,
  Dormitory,
  Bed,
  DeductionRule,
  DeductionRecord,
  KickoutRequest
]

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryHeadRelation,
  UserDeductionRecordRelation,
  DeductionRuleRecordRelation,
  RecorderDeductionRelation,
  ApplicantKickoutRelation,
  TargetKickoutRelation,
  ProcessorKickoutRelation
]

export const activities = []

export const interactions = [
  CreateDormitory,
  UpdateDormitory,
  DeleteDormitory,
  AssignDormHead,
  RemoveDormHead,
  AssignUserToDormitory,
  RemoveUserFromDormitory,
  CreateDeductionRule,
  UpdateDeductionRule,
  DisableDeductionRule,
  RecordDeduction,
  CancelDeduction,
  CreateKickoutRequest,
  ApproveKickoutRequest,
  RejectKickoutRequest,
  GetDormitoryInfo,
  GetDormitoryList,
  GetUserInfo,
  GetDeductionRules,
  GetDeductionHistory,
  GetKickoutRequests,
  GetUserDeductionSummary,
  GetDormitoryStatistics,
  GetSystemStatistics
]

export const dicts = []

// ================================
// POST-INITIALIZATION SETUP
// ================================

// Now that all interactions are defined, we can set up the state machine transfers
// and computations that reference them

// User role state machine
const userRoleStateMachine = User.properties.find(p => p.name === 'role')?.computation as any
if (userRoleStateMachine && userRoleStateMachine.transfers) {
  userRoleStateMachine.transfers.push(
    StateTransfer.create({
      trigger: AssignDormHead,
      current: studentRoleState,
      next: dormHeadRoleState,
      computeTarget: (event) => ({ id: event.payload.userId })
    }),
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: dormHeadRoleState,
      next: studentRoleState,
      computeTarget: async function(this: any, event) {
        // Find the current dormHead for this dormitory
        const dormHeadRelation = await this.system.storage.findOneRelationByName(
          'DormitoryHeadRelation',
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.dormitoryId]
          }).and(MatchExp.atom({
            key: 'status',
            value: ['=', 'active']
          })),
          undefined,
          [['target', { attributeQuery: ['id'] }]]
        )
        return dormHeadRelation?.target || null
      }
    })
  )
}

// User status state machine
const userStatusStateMachine = User.properties.find(p => p.name === 'status')?.computation as any
if (userStatusStateMachine && userStatusStateMachine.transfers) {
  userStatusStateMachine.transfers.push(
    StateTransfer.create({
      trigger: ApproveKickoutRequest,
      current: activeUserState,
      next: kickedUserState,
      computeTarget: async function(this: any, event) {
        // Find the target user from the kickout request
        const request = await this.system.storage.findOne(
          'KickoutRequest',
          MatchExp.atom({
            key: 'id',
            value: ['=', event.payload.requestId]
          }),
          undefined,
          [['target', { attributeQuery: ['id'] }]]
        )
        return request?.target || null
      }
    })
  )
}

// User totalScore computation
const userTotalScoreProperty = User.properties.find(p => p.name === 'totalScore')
if (userTotalScoreProperty) {
  userTotalScoreProperty.computation = WeightedSummation.create({
    record: UserDeductionRecordRelation,
    attributeQuery: [['target', { attributeQuery: ['points', 'status'] }]],
    callback: function(relation) {
      const record = relation.target
      return {
        weight: record?.status === 'active' ? 1 : 0,
        value: record?.points || 0
      }
    }
  })
}

// Dormitory currentOccupancy computation
const dormitoryOccupancyProperty = Dormitory.properties.find(p => p.name === 'currentOccupancy')
if (dormitoryOccupancyProperty) {
  dormitoryOccupancyProperty.computation = Count.create({
    record: UserDormitoryRelation,
    direction: 'target',
    attributeQuery: ['status'],
    callback: function(relation) {
      return relation.status === 'active'
    }
  })
}

// Bed isOccupied computation
const bedIsOccupiedProperty = Bed.properties.find(p => p.name === 'isOccupied')
if (bedIsOccupiedProperty) {
  bedIsOccupiedProperty.computation = Any.create({
    record: UserBedRelation,
    direction: 'target',
    attributeQuery: ['status'],
    callback: function(relation) {
      return relation.status === 'active'
    }
  })
}

// DeductionRule isActive state machine
const ruleActiveStateMachine = DeductionRule.properties.find(p => p.name === 'isActive')?.computation as any
if (ruleActiveStateMachine && ruleActiveStateMachine.transfers) {
  ruleActiveStateMachine.transfers.push(
    StateTransfer.create({
      trigger: DisableDeductionRule,
      current: activeRuleState,
      next: inactiveRuleState,
      computeTarget: (event) => ({ id: event.payload.ruleId })
    })
  )
}

// DeductionRule usageCount computation
const ruleUsageCountProperty = DeductionRule.properties.find(p => p.name === 'usageCount')
if (ruleUsageCountProperty) {
  ruleUsageCountProperty.computation = Count.create({
    record: DeductionRuleRecordRelation,
    direction: 'source'
  })
}

// DeductionRule totalPointsDeducted computation
const ruleTotalPointsProperty = DeductionRule.properties.find(p => p.name === 'totalPointsDeducted')
if (ruleTotalPointsProperty) {
  ruleTotalPointsProperty.computation = WeightedSummation.create({
    record: DeductionRuleRecordRelation,
    attributeQuery: [['target', { attributeQuery: ['points', 'status'] }]],
    callback: function(relation) {
      const record = relation.target
      return {
        weight: record?.status === 'active' ? 1 : 0,
        value: record?.points || 0
      }
    }
  })
}

// DeductionRecord status state machine
const recordStatusStateMachine = DeductionRecord.properties.find(p => p.name === 'status')?.computation as any
if (recordStatusStateMachine && recordStatusStateMachine.transfers) {
  recordStatusStateMachine.transfers.push(
    StateTransfer.create({
      trigger: CancelDeduction,
      current: activeDeductionState,
      next: cancelledDeductionState,
      computeTarget: (event) => ({ id: event.payload.deductionId })
    })
  )
}

// KickoutRequest status state machine
const requestStatusStateMachine = KickoutRequest.properties.find(p => p.name === 'status')?.computation as any
if (requestStatusStateMachine && requestStatusStateMachine.transfers) {
  requestStatusStateMachine.transfers.push(
    StateTransfer.create({
      trigger: ApproveKickoutRequest,
      current: pendingRequestState,
      next: approvedRequestState,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      trigger: RejectKickoutRequest,
      current: pendingRequestState,
      next: rejectedRequestState,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  )
}

// KickoutRequest processedAt state machine
const processedAtStateMachine = KickoutRequest.properties.find(p => p.name === 'processedAt')?.computation as any
if (processedAtStateMachine && processedAtStateMachine.transfers) {
  const unprocessedState = StateNode.create({ 
    name: 'unprocessed',
    computeValue: () => null
  })
  const processedState = StateNode.create({ 
    name: 'processed',
    computeValue: () => Math.floor(Date.now() / 1000)
  })
  
  processedAtStateMachine.transfers.push(
    StateTransfer.create({
      trigger: ApproveKickoutRequest,
      current: unprocessedState,
      next: processedState,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      trigger: RejectKickoutRequest,
      current: unprocessedState,
      next: processedState,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  )
}

// UserDormitoryRelation status state machine
const userDormRelationStatusStateMachine = UserDormitoryRelation.properties?.find(p => p.name === 'status')?.computation as any
if (userDormRelationStatusStateMachine && userDormRelationStatusStateMachine.transfers) {
  userDormRelationStatusStateMachine.transfers.push(
    StateTransfer.create({
      trigger: ApproveKickoutRequest,
      current: activeRelationState,
      next: inactiveRelationState,
      computeTarget: async function(this: any, event) {
        // Find the user-dormitory relation for the kicked user
        const request = await this.system.storage.findOne(
          'KickoutRequest',
          MatchExp.atom({
            key: 'id',
            value: ['=', event.payload.requestId]
          }),
          undefined,
          [['target', { attributeQuery: ['id'] }]]
        )
        
        if (request?.target) {
          const relation = await this.system.storage.findOneRelationByName(
            'UserDormitoryRelation',
            MatchExp.atom({
              key: 'source.id',
              value: ['=', request.target.id]
            }).and(MatchExp.atom({
              key: 'status',
              value: ['=', 'active']
            })),
            undefined,
            ['id']
          )
          return relation
        }
        return null
      }
    }),
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: activeRelationState,
      next: inactiveRelationState,
      computeTarget: async function(this: any, event) {
        const relation = await this.system.storage.findOneRelationByName(
          'UserDormitoryRelation',
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }).and(MatchExp.atom({
            key: 'status',
            value: ['=', 'active']
          })),
          undefined,
          ['id']
        )
        return relation
      }
    })
  )
}

// UserBedRelation status state machine
const userBedRelationStatusStateMachine = UserBedRelation.properties?.find(p => p.name === 'status')?.computation as any
if (userBedRelationStatusStateMachine && userBedRelationStatusStateMachine.transfers) {
  userBedRelationStatusStateMachine.transfers.push(
    StateTransfer.create({
      trigger: ApproveKickoutRequest,
      current: activeRelationState,
      next: inactiveRelationState,
      computeTarget: async function(this: any, event) {
        // Find the user-bed relation for the kicked user
        const request = await this.system.storage.findOne(
          'KickoutRequest',
          MatchExp.atom({
            key: 'id',
            value: ['=', event.payload.requestId]
          }),
          undefined,
          [['target', { attributeQuery: ['id'] }]]
        )
        
        if (request?.target) {
          const relation = await this.system.storage.findOneRelationByName(
            'UserBedRelation',
            MatchExp.atom({
              key: 'source.id',
              value: ['=', request.target.id]
            }).and(MatchExp.atom({
              key: 'status',
              value: ['=', 'active']
            })),
            undefined,
            ['id']
          )
          return relation
        }
        return null
      }
    }),
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: activeRelationState,
      next: inactiveRelationState,
      computeTarget: async function(this: any, event) {
        const relation = await this.system.storage.findOneRelationByName(
          'UserBedRelation',
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }).and(MatchExp.atom({
            key: 'status',
            value: ['=', 'active']
          })),
          undefined,
          ['id']
        )
        return relation
      }
    })
  )
}

// DormitoryHeadRelation status state machine
const dormHeadRelationStatusStateMachine = DormitoryHeadRelation.properties?.find(p => p.name === 'status')?.computation as any
if (dormHeadRelationStatusStateMachine && dormHeadRelationStatusStateMachine.transfers) {
  dormHeadRelationStatusStateMachine.transfers.push(
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: activeRelationState,
      next: inactiveRelationState,
      computeTarget: async function(this: any, event) {
        const relation = await this.system.storage.findOneRelationByName(
          'DormitoryHeadRelation',
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.dormitoryId]
          }).and(MatchExp.atom({
            key: 'status',
            value: ['=', 'active']
          })),
          undefined,
          ['id']
        )
        return relation
      }
    })
  )
}

