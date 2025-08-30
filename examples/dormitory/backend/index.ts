import {
  Entity,
  Property,
  Relation,
  Interaction,
  Activity,
  Dictionary,
  Action,
  Payload,
  PayloadItem,
  Condition,
  BoolExp,
  Conditions,
  StateNode,
  StateTransfer,
  StateMachine,
  Count,
  Summation,
  Transform,
  Every,
  Any,
  WeightedSummation,
  Custom,
  RealTime,
  Expression,
  GetAction,
  Query,
  QueryItem,
  MatchExp,
  InteractionEventEntity
} from 'interaqt'

// =============================================================================
// ENTITIES
// =============================================================================

// User Entity
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
      name: 'studentId',
      type: 'string'
    }),
    Property.create({
      name: 'phone',
      type: 'string'
    }),
    Property.create({
      name: 'points',
      type: 'number',
      defaultValue: () => 100
    }),
    Property.create({
      name: 'role',
      type: 'string'
    }),
    Property.create({
      name: 'createdAt',
      type: 'number'
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean'
    })
  ]
})

// Dormitory Entity
export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({
      name: 'name',
      type: 'string'
    }),
    Property.create({
      name: 'location',
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
      name: 'createdAt',
      type: 'number'
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean'
    })
  ]
})

// Bed Entity
export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({
      name: 'number',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'vacant'
    }),
    Property.create({
      name: 'createdAt',
      type: 'number'
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean'
    })
  ]
})

// PointDeduction Entity
export const PointDeduction = Entity.create({
  name: 'PointDeduction',
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
      name: 'deductedAt',
      type: 'number'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean'
    })
  ]
})

// RemovalRequest Entity
export const RemovalRequest = Entity.create({
  name: 'RemovalRequest',
  properties: [
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string'
    }),
    Property.create({
      name: 'requestedAt',
      type: 'number'
    }),
    Property.create({
      name: 'processedAt',
      type: 'number'
    }),
    Property.create({
      name: 'adminComment',
      type: 'string'
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      defaultValue: () => false
    })
  ]
})

// DeductionRule Entity
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
      defaultValue: () => true
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({
      name: 'updatedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      defaultValue: () => false
    })
  ]
})

// =============================================================================
// RELATIONS
// =============================================================================

// UserDormitoryLeaderRelation: 1:1 - User to Dormitory (leader relationship)
export const UserDormitoryLeaderRelation = Relation.create({
  source: User,
  sourceProperty: 'managedDormitory',
  target: Dormitory,
  targetProperty: 'leader',
  type: '1:1',
  properties: [
    Property.create({
      name: 'assignedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// UserBedAssignmentRelation: 1:1 - User to Bed (assignment relationship)
export const UserBedAssignmentRelation = Relation.create({
  source: User,
  sourceProperty: 'assignedBed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1',
  properties: [
    Property.create({
      name: 'assignedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// DormitoryBedRelation: 1:n - Dormitory to Bed
export const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// UserPointDeductionRelation: 1:n - User to PointDeduction
export const UserPointDeductionRelation = Relation.create({
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// UserRemovalRequestTargetRelation: 1:n - User to RemovalRequest (target user)
export const UserRemovalRequestTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'removalRequests',
  target: RemovalRequest,
  targetProperty: 'targetUser',
  type: '1:n'
})

// UserRemovalRequestRequesterRelation: 1:n - User to RemovalRequest (requester)
export const UserRemovalRequestRequesterRelation = Relation.create({
  source: User,
  sourceProperty: 'submittedRequests',
  target: RemovalRequest,
  targetProperty: 'requestedBy',
  type: '1:n'
})

// UserRemovalRequestProcessorRelation: 1:n - User to RemovalRequest (processor)
export const UserRemovalRequestProcessorRelation = Relation.create({
  source: User,
  sourceProperty: 'processedRequests',
  target: RemovalRequest,
  targetProperty: 'processedBy',
  type: '1:n',
  properties: [
    Property.create({
      name: 'processedAt',
      type: 'number'
    })
  ]
})

// DeductionRuleApplicationRelation: 1:n - DeductionRule to PointDeduction
export const DeductionRuleApplicationRelation = Relation.create({
  source: DeductionRule,
  sourceProperty: 'applications',
  target: PointDeduction,
  targetProperty: 'rule',
  type: '1:n'
})

// =============================================================================
// INTERACTIONS
// =============================================================================

// Core User Management Interactions

export const CreateUserInteraction = Interaction.create({
  name: 'createUser',
  action: Action.create({ name: 'create' }),
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
        name: 'studentId',
        required: true
      }),
      PayloadItem.create({
        name: 'phone',
        required: false
      }),
      PayloadItem.create({
        name: 'role',
        required: false
      })
    ]
  })
})

export const UpdateUserInteraction = Interaction.create({
  name: 'updateUser',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'name',
        required: false
      }),
      PayloadItem.create({
        name: 'email',
        required: false
      }),
      PayloadItem.create({
        name: 'phone',
        required: false
      })
    ]
  })
})

export const DeleteUserInteraction = Interaction.create({
  name: 'deleteUser',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  })
})

export const DeletePointDeductionInteraction = Interaction.create({
  name: 'deletePointDeduction',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'deductionId',
        required: true
      })
    ]
  })
})

// Dormitory Management Interactions

export const CreateDormitoryInteraction = Interaction.create({
  name: 'createDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        required: true
      }),
      PayloadItem.create({
        name: 'location',
        required: true
      }),
      PayloadItem.create({
        name: 'capacity',
        required: true
      })
    ]
  })
})

export const UpdateDormitoryInteraction = Interaction.create({
  name: 'updateDormitory',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'name',
        required: false
      }),
      PayloadItem.create({
        name: 'location',
        required: false
      }),
      PayloadItem.create({
        name: 'capacity',
        required: false
      })
    ]
  })
})

export const DeleteDormitoryInteraction = Interaction.create({
  name: 'deleteDormitory',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      })
    ]
  })
})

// Bed Management Interactions

export const CreateBedInteraction = Interaction.create({
  name: 'createBed',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      }),
      PayloadItem.create({
        name: 'number',
        required: true
      })
    ]
  })
})

export const UpdateBedInteraction = Interaction.create({
  name: 'updateBed',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'bedId',
        required: true
      }),
      PayloadItem.create({
        name: 'number',
        required: false
      })
    ]
  })
})

export const DeleteBedInteraction = Interaction.create({
  name: 'deleteBed',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'bedId',
        required: true
      })
    ]
  })
})

// User Assignment Interactions

export const AssignUserToBedInteraction = Interaction.create({
  name: 'assignUserToBed',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'bedId',
        required: true
      })
    ]
  })
})

export const RemoveUserFromBedInteraction = Interaction.create({
  name: 'removeUserFromBed',
  action: Action.create({ name: 'remove' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  })
})

export const AssignDormitoryLeaderInteraction = Interaction.create({
  name: 'assignDormitoryLeader',
  action: Action.create({ name: 'assign' }),
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
})

// Point Deduction System Interactions

export const CreateDeductionRuleInteraction = Interaction.create({
  name: 'createDeductionRule',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        required: true
      }),
      PayloadItem.create({
        name: 'points',
        required: true
      }),
      PayloadItem.create({
        name: 'isActive',
        required: false
      })
    ]
  })
})

export const UpdateDeductionRuleInteraction = Interaction.create({
  name: 'updateDeductionRule',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'ruleId',
        required: true
      }),
      PayloadItem.create({
        name: 'name',
        required: false
      }),
      PayloadItem.create({
        name: 'description',
        required: false
      }),
      PayloadItem.create({
        name: 'points',
        required: false
      }),
      PayloadItem.create({
        name: 'isActive',
        required: false
      })
    ]
  })
})

export const DeactivateDeductionRuleInteraction = Interaction.create({
  name: 'deactivateDeductionRule',
  action: Action.create({ name: 'deactivate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'ruleId',
        required: true
      })
    ]
  })
})

export const ApplyPointDeductionInteraction = Interaction.create({
  name: 'applyPointDeduction',
  action: Action.create({ name: 'apply' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetUserId',
        required: true
      }),
      PayloadItem.create({
        name: 'ruleId',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      })
    ]
  })
})

// Removal Request Workflow Interactions

export const SubmitRemovalRequestInteraction = Interaction.create({
  name: 'submitRemovalRequest',
  action: Action.create({ name: 'submit' }),
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
})

export const ProcessRemovalRequestInteraction = Interaction.create({
  name: 'processRemovalRequest',
  action: Action.create({ name: 'process' }),
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
        name: 'adminComment',
        required: false
      })
    ]
  })
})

// Query Interactions

export const GetUserProfileInteraction = Interaction.create({
  name: 'getUserProfile',
  action: GetAction,
  data: User,
  query: Query.create({
    items: [
      QueryItem.create({
        name: 'attributeQuery',
        value: ['id', 'name', 'email', 'studentId', 'phone', 'points', 'role', 'createdAt', 'updatedAt', 'isDeleted']
      })
    ]
  })
})

export const GetDormitoryInfoInteraction = Interaction.create({
  name: 'getDormitoryInfo',
  action: GetAction,
  data: Dormitory,
  query: Query.create({
    items: [
      QueryItem.create({
        name: 'attributeQuery',
        value: ['id', 'name', 'location', 'capacity', 'currentOccupancy', 'createdAt', 'updatedAt', 'isDeleted']
      })
    ]
  })
})

export const GetPointHistoryInteraction = Interaction.create({
  name: 'getPointHistory',
  action: GetAction,
  data: PointDeduction,
  query: Query.create({
    items: [
      QueryItem.create({
        name: 'attributeQuery',
        value: ['id', 'reason', 'points', 'deductedAt', 'isDeleted']
      })
    ]
  })
})

export const GetRemovalRequestsInteraction = Interaction.create({
  name: 'getRemovalRequests',
  action: GetAction,
  data: RemovalRequest,
  query: Query.create({
    items: [
      QueryItem.create({
        name: 'attributeQuery',
        value: ['id', 'reason', 'status', 'requestedAt', 'processedAt', 'adminComment', 'isDeleted']
      })
    ]
  })
})

// Administrative Interactions

export const GetSystemStatsInteraction = Interaction.create({
  name: 'getSystemStats',
  action: GetAction,
  data: User // This will be configured later with dictionary access
})

export const GetDormitoryListInteraction = Interaction.create({
  name: 'getDormitoryList',
  action: GetAction,
  data: Dormitory,
  query: Query.create({
    items: [
      QueryItem.create({
        name: 'attributeQuery',
        value: ['id', 'name', 'location', 'capacity', 'currentOccupancy', 'createdAt', 'updatedAt', 'isDeleted']
      })
    ]
  })
})

export const GetUserListInteraction = Interaction.create({
  name: 'getUserList',
  action: GetAction,
  data: User,
  query: Query.create({
    items: [
      QueryItem.create({
        name: 'attributeQuery',
        value: ['id', 'name', 'email', 'studentId', 'phone', 'points', 'role', 'createdAt', 'updatedAt', 'isDeleted']
      })
    ]
  })
})

// =============================================================================
// EXPORTS
// =============================================================================

export const entities = [
  User,
  Dormitory,
  Bed,
  PointDeduction,
  RemovalRequest,
  DeductionRule
]

export const relations = [
  UserDormitoryLeaderRelation,
  UserBedAssignmentRelation,
  DormitoryBedRelation,
  UserPointDeductionRelation,
  UserRemovalRequestTargetRelation,
  UserRemovalRequestRequesterRelation,
  UserRemovalRequestProcessorRelation,
  DeductionRuleApplicationRelation
]

export const activities = []

export const interactions = [
  CreateUserInteraction,
  UpdateUserInteraction,
  DeleteUserInteraction,
  DeletePointDeductionInteraction,
  CreateDormitoryInteraction,
  UpdateDormitoryInteraction,
  DeleteDormitoryInteraction,
  CreateBedInteraction,
  UpdateBedInteraction,
  DeleteBedInteraction,
  AssignUserToBedInteraction,
  RemoveUserFromBedInteraction,
  AssignDormitoryLeaderInteraction,
  CreateDeductionRuleInteraction,
  UpdateDeductionRuleInteraction,
  DeactivateDeductionRuleInteraction,
  ApplyPointDeductionInteraction,
  SubmitRemovalRequestInteraction,
  ProcessRemovalRequestInteraction,
  GetUserProfileInteraction,
  GetDormitoryInfoInteraction,
  GetPointHistoryInteraction,
  GetRemovalRequestsInteraction,
  GetSystemStatsInteraction,
  GetDormitoryListInteraction,
  GetUserListInteraction
]

export const dicts = []

// =============================================================================
// COMPUTATIONS
// =============================================================================

// User entity computation - Transform computation for creation
User.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'createUser') {
      return {
        name: event.payload.name,
        email: event.payload.email,
        studentId: event.payload.studentId,
        phone: event.payload.phone || '',
        role: event.payload.role || 'user',
        points: 100,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    }
    return null
  }
})

// Dormitory entity computation - Transform computation for creation
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'createDormitory') {
      return {
        name: event.payload.name,
        location: event.payload.location,
        capacity: event.payload.capacity,
        currentOccupancy: 0,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    }
    return null
  }
})

// Bed entity computation - Transform computation for creation
Bed.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'createBed') {
      const timestamp = Math.floor(Date.now() / 1000)
      return {
        number: event.payload.number,
        status: 'vacant',
        createdAt: timestamp,
        updatedAt: timestamp, // Initialize updatedAt with same timestamp as createdAt
        isDeleted: false,
        dormitory: { id: event.payload.dormitoryId } // Creates DormitoryBedRelation via 'dormitory' targetProperty
      }
    }
    return null
  }
})

// PointDeduction entity computation - Transform computation for creation
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: async function(event) {
    if (event.interactionName === 'applyPointDeduction') {
      // Fetch the deduction rule to get the points value (_owner computation)
      const rule = await this.system.storage.findOne('DeductionRule',
        this.globals.MatchExp.atom({ key: 'id', value: ['=', event.payload.ruleId] }),
        undefined,
        ['id', 'points']
      )
      
      return {
        reason: event.payload.reason,
        points: rule?.points || 0, // Set from referenced DeductionRule.points
        deductedAt: Math.floor(Date.now() / 1000),
        isDeleted: false,
        user: { id: event.payload.targetUserId }, // Creates UserPointDeductionRelation via 'user' targetProperty
        rule: { id: event.payload.ruleId } // Creates DeductionRuleApplicationRelation via 'rule' targetProperty
      }
    }
    return null
  }
})

// DeductionRule entity computation - Transform computation for creation
DeductionRule.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'createDeductionRule') {
      return {
        name: event.payload.name,
        description: event.payload.description,
        points: event.payload.points,
        isActive: event.payload.isActive !== undefined ? event.payload.isActive : true,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    }
    return null
  }
})

// RemovalRequest entity computation - Transform computation for creation
RemovalRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'submitRemovalRequest') {
      return {
        reason: event.payload.reason,
        status: 'pending',
        requestedAt: Math.floor(Date.now() / 1000),
        isDeleted: false,
        // processedAt and adminComment are not set initially
        targetUser: { id: event.payload.targetUserId }, // Creates UserRemovalRequestTargetRelation via 'targetUser' targetProperty
        requestedBy: event.user // Creates UserRemovalRequestRequesterRelation via 'requestedBy' targetProperty
      }
    }
    return null
  }
})

// UserDormitoryLeaderRelation StateMachine computation
const notAssignedState = StateNode.create({ 
  name: 'notAssigned',
  computeValue: () => null  // Return null means no relation
});

const assignedState = StateNode.create({ 
  name: 'assigned',
  computeValue: () => ({
    assignedAt: Math.floor(Date.now() / 1000)
  })
});

UserDormitoryLeaderRelation.computation = StateMachine.create({
  states: [notAssignedState, assignedState],
  transfers: [
    StateTransfer.create({
      trigger: AssignDormitoryLeaderInteraction,
      current: notAssignedState,
      next: assignedState,
      computeTarget: (event) => ({
        source: { id: event.payload.userId },
        target: { id: event.payload.dormitoryId }
      })
    })
  ],
  defaultState: notAssignedState
})

// UserBedAssignmentRelation StateMachine computation
const notAssignedToBedState = StateNode.create({ 
  name: 'notAssigned',
  computeValue: () => null  // Return null means no relation
});

const assignedToBedState = StateNode.create({ 
  name: 'assigned',
  computeValue: () => ({
    assignedAt: Math.floor(Date.now() / 1000)
  })
});

UserBedAssignmentRelation.computation = StateMachine.create({
  states: [notAssignedToBedState, assignedToBedState],
  transfers: [
    StateTransfer.create({
      trigger: AssignUserToBedInteraction,
      current: notAssignedToBedState,
      next: assignedToBedState,
      computeTarget: (event) => ({
        source: { id: event.payload.userId },
        target: { id: event.payload.bedId }
      })
    }),
    StateTransfer.create({
      trigger: RemoveUserFromBedInteraction,
      current: assignedToBedState,
      next: notAssignedToBedState,
      computeTarget: async function(this: any, event) {
        // Find existing relation to remove
        const relation = await this.system.storage.findOneRelationByName(
          UserBedAssignmentRelation.name,
          this.globals.MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }),
          undefined,
          ['id']
        );
        return relation;
      }
    })
  ],
  defaultState: notAssignedToBedState
})

// UserRemovalRequestProcessorRelation StateMachine computation
const notProcessedState = StateNode.create({ 
  name: 'notProcessed',
  computeValue: () => null  // Return null means no relation
});

const processedState = StateNode.create({ 
  name: 'processed',
  computeValue: () => ({
    processedAt: Math.floor(Date.now() / 1000)
  })
});

UserRemovalRequestProcessorRelation.computation = StateMachine.create({
  states: [notProcessedState, processedState],
  transfers: [
    StateTransfer.create({
      trigger: ProcessRemovalRequestInteraction,
      current: notProcessedState,
      next: processedState,
      computeTarget: async function(this: any, event) {
        // Find the removal request that is being processed
        const request = await this.system.storage.findOne('RemovalRequest', 
          this.globals.MatchExp.atom({
            key: 'id',
            value: ['=', event.payload.requestId]
          }),
          undefined,
          ['id']
        );
        
        return {
          source: event.user, // The admin who is processing the request
          target: request     // The request being processed
        };
      }
    })
  ],
  defaultState: notProcessedState
})

// User.name StateMachine computation
const nameDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createUser') {
      return event.payload.name;
    }
    if (event && event.interactionName === 'updateUser' && event.payload.name !== undefined) {
      return event.payload.name;
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [nameDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateUserInteraction,
      current: nameDefaultState,
      next: nameDefaultState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    })
  ],
  defaultState: nameDefaultState
})

// User.email StateMachine computation
const emailDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createUser') {
      return event.payload.email;
    }
    if (event && event.interactionName === 'updateUser' && event.payload.email !== undefined) {
      return event.payload.email;
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'email').computation = StateMachine.create({
  states: [emailDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateUserInteraction,
      current: emailDefaultState,
      next: emailDefaultState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    })
  ],
  defaultState: emailDefaultState
})

// User.phone StateMachine computation
const phoneDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createUser') {
      return event.payload.phone || '';
    }
    if (event && event.interactionName === 'updateUser' && event.payload.phone !== undefined) {
      return event.payload.phone;
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'phone').computation = StateMachine.create({
  states: [phoneDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateUserInteraction,
      current: phoneDefaultState,
      next: phoneDefaultState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    })
  ],
  defaultState: phoneDefaultState
})

// User.role StateMachine computation
const roleDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createUser') {
      return event.payload.role || 'user';
    }
    if (event && event.interactionName === 'assignDormitoryLeader') {
      return 'dormitoryLeader';
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'role').computation = StateMachine.create({
  states: [roleDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: AssignDormitoryLeaderInteraction,
      current: roleDefaultState,
      next: roleDefaultState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    })
  ],
  defaultState: roleDefaultState
})

// User.updatedAt StateMachine computation
const updatedAtDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && (event.interactionName === 'updateUser' || event.interactionName === 'assignDormitoryLeader')) {
      return Math.floor(Date.now() / 1000);
    }
    return lastValue;
  }
});

User.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [updatedAtDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateUserInteraction,
      current: updatedAtDefaultState,
      next: updatedAtDefaultState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    }),
    StateTransfer.create({
      trigger: AssignDormitoryLeaderInteraction,
      current: updatedAtDefaultState,
      next: updatedAtDefaultState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    })
  ],
  defaultState: updatedAtDefaultState
})

// User.isDeleted StateMachine computation
const isDeletedActiveState = StateNode.create({
  name: 'active',
  computeValue: () => false
});

const isDeletedDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => true
});

User.properties.find(p => p.name === 'isDeleted').computation = StateMachine.create({
  states: [isDeletedActiveState, isDeletedDeletedState],
  transfers: [
    StateTransfer.create({
      trigger: DeleteUserInteraction,
      current: isDeletedActiveState,
      next: isDeletedDeletedState,
      computeTarget: (event) => ({
        id: event.payload.userId
      })
    })
  ],
  defaultState: isDeletedActiveState
})

// Dormitory.name StateMachine computation
const dormitoryNameDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createDormitory') {
      return event.payload.name;
    }
    if (event && event.interactionName === 'updateDormitory' && event.payload.name !== undefined) {
      return event.payload.name;
    }
    return lastValue;
  }
});

Dormitory.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [dormitoryNameDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateDormitoryInteraction,
      current: dormitoryNameDefaultState,
      next: dormitoryNameDefaultState,
      computeTarget: (event) => ({
        id: event.payload.dormitoryId
      })
    })
  ],
  defaultState: dormitoryNameDefaultState
})

// Dormitory.location StateMachine computation
const dormitoryLocationDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createDormitory') {
      return event.payload.location;
    }
    if (event && event.interactionName === 'updateDormitory' && event.payload.location !== undefined) {
      return event.payload.location;
    }
    return lastValue;
  }
});

Dormitory.properties.find(p => p.name === 'location').computation = StateMachine.create({
  states: [dormitoryLocationDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateDormitoryInteraction,
      current: dormitoryLocationDefaultState,
      next: dormitoryLocationDefaultState,
      computeTarget: (event) => ({
        id: event.payload.dormitoryId
      })
    })
  ],
  defaultState: dormitoryLocationDefaultState
})

// Dormitory.capacity StateMachine computation
const dormitoryCapacityDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createDormitory') {
      const capacity = event.payload.capacity;
      // Validate capacity range (4-6)
      if (capacity < 4 || capacity > 6) {
        throw new Error('Dormitory capacity must be between 4 and 6');
      }
      return capacity;
    }
    if (event && event.interactionName === 'updateDormitory' && event.payload.capacity !== undefined) {
      const capacity = event.payload.capacity;
      // Validate capacity range (4-6)
      if (capacity < 4 || capacity > 6) {
        throw new Error('Dormitory capacity must be between 4 and 6');
      }
      // Note: occupancy constraint validation would need to be handled by business logic
      // The StateMachine computation doesn't have access to current occupancy data
      return capacity;
    }
    return lastValue;
  }
});

Dormitory.properties.find(p => p.name === 'capacity').computation = StateMachine.create({
  states: [dormitoryCapacityDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateDormitoryInteraction,
      current: dormitoryCapacityDefaultState,
      next: dormitoryCapacityDefaultState,
      computeTarget: (event) => ({
        id: event.payload.dormitoryId
      })
    })
  ],
  defaultState: dormitoryCapacityDefaultState
})

// Dormitory.updatedAt StateMachine computation
const dormitoryUpdatedAtDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'updateDormitory') {
      return Math.floor(Date.now() / 1000);
    }
    return lastValue;
  }
});

Dormitory.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [dormitoryUpdatedAtDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateDormitoryInteraction,
      current: dormitoryUpdatedAtDefaultState,
      next: dormitoryUpdatedAtDefaultState,
      computeTarget: (event) => ({
        id: event.payload.dormitoryId
      })
    })
  ],
  defaultState: dormitoryUpdatedAtDefaultState
})

// Dormitory.isDeleted StateMachine computation
const dormitoryIsDeletedActiveState = StateNode.create({
  name: 'active',
  computeValue: () => false
});

const dormitoryIsDeletedDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => true
});

Dormitory.properties.find(p => p.name === 'isDeleted').computation = StateMachine.create({
  states: [dormitoryIsDeletedActiveState, dormitoryIsDeletedDeletedState],
  transfers: [
    StateTransfer.create({
      trigger: DeleteDormitoryInteraction,
      current: dormitoryIsDeletedActiveState,
      next: dormitoryIsDeletedDeletedState,
      computeTarget: (event) => ({
        id: event.payload.dormitoryId
      })
    })
  ],
  defaultState: dormitoryIsDeletedActiveState
})

// Bed.number StateMachine computation
const bedNumberDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'createBed') {
      return event.payload.number;
    }
    if (event && event.interactionName === 'updateBed' && event.payload.number !== undefined) {
      return event.payload.number;
    }
    return lastValue;
  }
});

Bed.properties.find(p => p.name === 'number').computation = StateMachine.create({
  states: [bedNumberDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateBedInteraction,
      current: bedNumberDefaultState,
      next: bedNumberDefaultState,
      computeTarget: (event) => ({
        id: event.payload.bedId
      })
    })
  ],
  defaultState: bedNumberDefaultState
})

// Bed.updatedAt StateMachine computation
const bedUpdatedAtDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    if (event && event.interactionName === 'updateBed') {
      return Math.floor(Date.now() / 1000);
    }
    return lastValue;
  }
});

Bed.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [bedUpdatedAtDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateBedInteraction,
      current: bedUpdatedAtDefaultState,
      next: bedUpdatedAtDefaultState,
      computeTarget: (event) => ({
        id: event.payload.bedId
      })
    })
  ],
  defaultState: bedUpdatedAtDefaultState
})

// Bed.isDeleted StateMachine computation
const bedIsDeletedActiveState = StateNode.create({
  name: 'active',
  computeValue: () => false
});

const bedIsDeletedDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => true
});

Bed.properties.find(p => p.name === 'isDeleted').computation = StateMachine.create({
  states: [bedIsDeletedActiveState, bedIsDeletedDeletedState],
  transfers: [
    StateTransfer.create({
      trigger: DeleteBedInteraction,
      current: bedIsDeletedActiveState,
      next: bedIsDeletedDeletedState,
      computeTarget: (event) => ({
        id: event.payload.bedId
      })
    })
  ],
  defaultState: bedIsDeletedActiveState
})

// PointDeduction.isDeleted StateMachine computation
const pointDeductionIsDeletedActiveState = StateNode.create({
  name: 'active',
  computeValue: () => false
});

const pointDeductionIsDeletedDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => true
});

PointDeduction.properties.find(p => p.name === 'isDeleted').computation = StateMachine.create({
  states: [pointDeductionIsDeletedActiveState, pointDeductionIsDeletedDeletedState],
  transfers: [
    StateTransfer.create({
      trigger: DeletePointDeductionInteraction,
      current: pointDeductionIsDeletedActiveState,
      next: pointDeductionIsDeletedDeletedState,
      computeTarget: (event) => ({
        id: event.payload.deductionId
      })
    })
  ],
  defaultState: pointDeductionIsDeletedActiveState
})

// RemovalRequest.status StateMachine computation
const removalRequestPendingState = StateNode.create({
  name: 'pending',
  computeValue: () => 'pending'
});

const removalRequestProcessedState = StateNode.create({
  name: 'processed',
  computeValue: (lastValue, event) => {
    // Determine the status based on the decision in the event
    if (event && event.payload && event.payload.decision) {
      return event.payload.decision; // Will be 'approved' or 'rejected'
    }
    return lastValue; // Fallback to previous value
  }
});

RemovalRequest.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [removalRequestPendingState, removalRequestProcessedState],
  transfers: [
    StateTransfer.create({
      trigger: ProcessRemovalRequestInteraction,
      current: removalRequestPendingState,
      next: removalRequestProcessedState,
      computeTarget: (event) => ({
        id: event.payload.requestId
      })
    })
  ],
  defaultState: removalRequestPendingState
})