import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Condition,
  Conditions,
  BoolExp,
  Controller,
  Activity,
  Dictionary,
  Count,
  Summation,
  Custom,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  MatchExp,
  GetAction
} from 'interaqt'

// ==================== ENTITIES ====================

// User Entity
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'username',
      type: 'string'
    }),
    Property.create({
      name: 'email',
      type: 'string'
    }),
    Property.create({
      name: 'fullName',
      type: 'string'
    }),
    Property.create({
      name: 'role',
      type: 'string'
    }),
    Property.create({
      name: 'currentScore',
      type: 'number',
      defaultValue: () => 100
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
      name: 'bedCount',
      type: 'number'
    }),
    Property.create({
      name: 'building',
      type: 'string'
    }),
    Property.create({
      name: 'floor',
      type: 'number'
    }),
    Property.create({
      name: 'occupiedBeds',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'availableBeds',
      type: 'number'
    })
  ]
})

// ScoreEvent Entity
export const ScoreEvent = Entity.create({
  name: 'ScoreEvent',
  properties: [
    Property.create({
      name: 'amount',
      type: 'number'
    }),
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'category',
      type: 'string'
    }),
    Property.create({
      name: 'timestamp',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
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
      name: 'urgency',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({
      name: 'processedAt',
      type: 'number'
    }),
    Property.create({
      name: 'notes',
      type: 'string'
    })
  ]
})

// AuditLog Entity
export const AuditLog = Entity.create({
  name: 'AuditLog',
  properties: [
    Property.create({
      name: 'actionType',
      type: 'string'
    }),
    Property.create({
      name: 'timestamp',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({
      name: 'details',
      type: 'string'
    })
  ]
})

// ==================== RELATIONS ====================

// BedAssignmentRelation (User n:1 Dormitory)
export const BedAssignmentRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1',
  properties: [
    Property.create({
      name: 'bedNumber',
      type: 'number'
    }),
    Property.create({
      name: 'assignedAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// DormitoryLeadershipRelation (User 1:1 Dormitory)
export const DormitoryLeadershipRelation = Relation.create({
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

// UserScoringRelation (User 1:n ScoreEvent)
export const UserScoringRelation = Relation.create({
  source: User,
  sourceProperty: 'scoreEvents',
  target: ScoreEvent,
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

// RemovalRequestingRelation (User n:n RemovalRequest)
export const RemovalRequestingRelation = Relation.create({
  source: User,
  sourceProperty: 'removalRequests',
  target: RemovalRequest,
  targetProperty: 'users',
  type: 'n:n',
  properties: [
    Property.create({
      name: 'role',
      type: 'string'
    }),
    Property.create({
      name: 'createdAt',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// AuditTrackingRelation (User 1:n AuditLog)
export const AuditTrackingRelation = Relation.create({
  source: User,
  sourceProperty: 'auditLogs',
  target: AuditLog,
  targetProperty: 'actor',
  type: '1:n',
  properties: [
    Property.create({
      name: 'timestamp',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

// ==================== EXPORTS ====================

export const entities = [User, Dormitory, ScoreEvent, RemovalRequest, AuditLog]
export const relations = [
  BedAssignmentRelation,
  DormitoryLeadershipRelation,
  UserScoringRelation,
  RemovalRequestingRelation,
  AuditTrackingRelation
]

// Placeholder exports for upcoming tasks
export const interactions: any[] = []
export const activities: any[] = []
export const dicts: any[] = []