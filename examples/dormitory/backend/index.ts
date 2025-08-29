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
export const interactions = []
export const dicts = []