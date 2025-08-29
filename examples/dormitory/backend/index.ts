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
  MatchExp
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
      type: 'string',
      defaultValue: () => 'user'
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
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({
      name: 'requestedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
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
  type: '1:n'
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