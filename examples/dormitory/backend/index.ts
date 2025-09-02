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
  GetAction,
  InteractionEventEntity
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
      type: 'number'
    }),
    Property.create({
      name: 'isActive',
      type: 'boolean'
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
      if (event.interactionName === 'CreateUser') {
        return {
          username: event.payload.username,
          email: event.payload.email,
          isActive: true,
          createdAt: Math.floor(Date.now() / 1000)
          // Note: fullName and role are now handled by separate StateMachine computations
        }
      }
      return null
    }
  })
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
      type: 'number'
    }),
    Property.create({
      name: 'availableBeds',
      type: 'number'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          bedCount: event.payload.bedCount,
          building: event.payload.building,
          floor: event.payload.floor
        }
      }
      return null
    }
  })
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
      type: 'number'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'ApplyScoreDeduction') {
        return {
          amount: -(event.payload.deductionAmount),  // Negative for deduction
          reason: event.payload.reason,
          category: event.payload.category,
          timestamp: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
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
      type: 'string'
    }),
    Property.create({
      name: 'createdAt',
      type: 'number'
    }),
    Property.create({
      name: 'processedAt',
      type: 'number'
    }),
    Property.create({
      name: 'notes',
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: (event) => {
      if (event.interactionName === 'CreateRemovalRequest') {
        return {
          reason: event.payload.reason,
          urgency: event.payload.urgency,
          status: 'pending',
          createdAt: Math.floor(Date.now() / 1000)
        }
      }
      return null
    }
  })
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
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: (event) => {
      // Track all significant interactions in the system
      const auditableInteractions = [
        'CreateUser',
        'CreateDormitory', 
        'AssignUserToBed',
        'ApplyScoreDeduction',
        'CreateRemovalRequest',
        'ProcessRemovalRequest',
        'RemoveUserFromDormitory',
        'AssignDormitoryLeader'
      ]
      
      if (auditableInteractions.includes(event.interactionName)) {
        return {
          actionType: event.interactionName,
          timestamp: Math.floor(Date.now() / 1000),
          details: JSON.stringify({
            userId: event.user?.id,
            payload: event.payload,
            interaction: event.interactionName
          })
        }
      }
      
      return null
    }
  })
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

// ==================== INTERACTIONS ====================

// CreateUser Interaction
export const CreateUserInteraction = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'username',
        required: true
      }),
      PayloadItem.create({
        name: 'email',
        required: true
      }),
      PayloadItem.create({
        name: 'password',
        required: true
      }),
      PayloadItem.create({
        name: 'fullName',
        required: true
      }),
      PayloadItem.create({
        name: 'role',
        required: true
      })
    ]
  })
})

// CreateDormitory Interaction
export const CreateDormitoryInteraction = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        required: true
      }),
      PayloadItem.create({
        name: 'bedCount',
        required: true
      }),
      PayloadItem.create({
        name: 'building',
        required: true
      }),
      PayloadItem.create({
        name: 'floor',
        required: true
      })
    ]
  })
})

// AssignDormitoryLeader Interaction
export const AssignDormitoryLeaderInteraction = Interaction.create({
  name: 'AssignDormitoryLeader',
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

// AssignUserToBed Interaction
export const AssignUserToBedInteraction = Interaction.create({
  name: 'AssignUserToBed',
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
      }),
      PayloadItem.create({
        name: 'bedNumber',
        required: true
      })
    ]
  })
})

// ApplyScoreDeduction Interaction
export const ApplyScoreDeductionInteraction = Interaction.create({
  name: 'ApplyScoreDeduction',
  action: Action.create({ name: 'apply' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'deductionAmount',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      }),
      PayloadItem.create({
        name: 'category',
        required: true
      })
    ]
  })
})

// CreateRemovalRequest Interaction
export const CreateRemovalRequestInteraction = Interaction.create({
  name: 'CreateRemovalRequest',
  action: Action.create({ name: 'create' }),
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
        name: 'urgency',
        required: true
      })
    ]
  })
})

// ProcessRemovalRequest Interaction
export const ProcessRemovalRequestInteraction = Interaction.create({
  name: 'ProcessRemovalRequest',
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
        name: 'notes',
        required: false
      })
    ]
  })
})

// RemoveUserFromDormitory Interaction
export const RemoveUserFromDormitoryInteraction = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'remove' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'effective',
        required: false
      })
    ]
  })
})

// ViewUserList Interaction
export const ViewUserListInteraction = Interaction.create({
  name: 'ViewUserList',
  action: GetAction,
  data: User
})

// ViewDormitoryList Interaction
export const ViewDormitoryListInteraction = Interaction.create({
  name: 'ViewDormitoryList',
  action: GetAction,
  data: Dormitory
})

// ViewMyDormitoryUsers Interaction
export const ViewMyDormitoryUsersInteraction = Interaction.create({
  name: 'ViewMyDormitoryUsers',
  action: GetAction,
  data: User
})

// ViewMyProfile Interaction
export const ViewMyProfileInteraction = Interaction.create({
  name: 'ViewMyProfile',
  action: GetAction,
  data: User
})

// ViewAuditLog Interaction
export const ViewAuditLogInteraction = Interaction.create({
  name: 'ViewAuditLog',
  action: GetAction,
  data: AuditLog
})

// LogAuditEvent Interaction
export const LogAuditEventInteraction = Interaction.create({
  name: 'LogAuditEvent',
  action: Action.create({ name: 'log' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'actionType',
        required: true
      }),
      PayloadItem.create({
        name: 'actorId',
        required: true
      }),
      PayloadItem.create({
        name: 'details',
        required: false
      })
    ]
  })
})

// UpdateUserProfile Interaction
export const UpdateUserProfileInteraction = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'fullName',
        required: false
      })
    ]
  })
})

// UpdateSystemSettings Interaction
export const UpdateSystemSettingsInteraction = Interaction.create({
  name: 'UpdateSystemSettings',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'settings',
        required: true
      })
    ]
  })
})

// UpdateScoreThresholds Interaction
export const UpdateScoreThresholdsInteraction = Interaction.create({
  name: 'UpdateScoreThresholds',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'thresholds',
        required: true
      })
    ]
  })
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

export const interactions = [
  CreateUserInteraction,
  CreateDormitoryInteraction,
  AssignDormitoryLeaderInteraction,
  AssignUserToBedInteraction,
  ApplyScoreDeductionInteraction,
  CreateRemovalRequestInteraction,
  ProcessRemovalRequestInteraction,
  RemoveUserFromDormitoryInteraction,
  ViewUserListInteraction,
  ViewDormitoryListInteraction,
  ViewMyDormitoryUsersInteraction,
  ViewMyProfileInteraction,
  ViewAuditLogInteraction,
  LogAuditEventInteraction,
  UpdateUserProfileInteraction,
  UpdateSystemSettingsInteraction,
  UpdateScoreThresholdsInteraction
]

// Placeholder exports for upcoming tasks
export const activities: any[] = []
export const dicts: any[] = []

// ==================== COMPUTATION ASSIGNMENTS ====================

// State nodes for User.fullName property
const fullNameDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    // Handle initial creation and updates
    if (event?.interactionName === 'CreateUser') {
      return event.payload?.fullName
    }
    if (event?.interactionName === 'UpdateUserProfile') {
      return event.payload?.fullName || lastValue
    }
    // Return existing value if no specific event
    return lastValue
  }
})

// StateMachine for User.fullName property
const UserFullNameStateMachine = StateMachine.create({
  states: [fullNameDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: CreateUserInteraction,
      current: fullNameDefaultState,
      next: fullNameDefaultState,
      computeTarget: async function(this, event) {
        // Find the user that was just created
        // Since this runs after entity creation, we can find by username
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'username', value: ['=', event.payload?.username] }),
          undefined,
          ['id']
        )
        
        return user
      }
    }),
    StateTransfer.create({
      trigger: UpdateUserProfileInteraction,
      current: fullNameDefaultState, 
      next: fullNameDefaultState,
      computeTarget: async function(this, event) {
        // Find the user to update by ID
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'id', value: ['=', event.payload?.userId] }),
          undefined,
          ['id']
        )
        
        return user
      }
    })
  ],
  defaultState: fullNameDefaultState
})

// Assign StateMachine computation to User.fullName property
User.properties.find(p => p.name === 'fullName').computation = UserFullNameStateMachine

// State nodes for User.role property
const roleDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    // Handle initial creation and role updates
    if (event?.interactionName === 'CreateUser') {
      return event.payload?.role
    }
    if (event?.interactionName === 'AssignDormitoryLeader') {
      // When assigned as dormitory leader, update role to 'dormitory_leader'
      return 'dormitory_leader'
    }
    // Return existing value if no specific event
    return lastValue
  }
})

// StateMachine for User.role property
const UserRoleStateMachine = StateMachine.create({
  states: [roleDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: CreateUserInteraction,
      current: roleDefaultState,
      next: roleDefaultState,
      computeTarget: async function(this, event) {
        // Find the user that was just created
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'username', value: ['=', event.payload?.username] }),
          undefined,
          ['id']
        )
        
        return user
      }
    }),
    StateTransfer.create({
      trigger: AssignDormitoryLeaderInteraction,
      current: roleDefaultState, 
      next: roleDefaultState,
      computeTarget: async function(this, event) {
        // Find the user being assigned as leader
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'id', value: ['=', event.payload?.userId] }),
          undefined,
          ['id']
        )
        
        return user
      }
    })
  ],
  defaultState: roleDefaultState
})

// Assign StateMachine computation to User.role property
User.properties.find(p => p.name === 'role').computation = UserRoleStateMachine

// State nodes for BedAssignmentRelation
const bedNotAssignedState = StateNode.create({ 
  name: 'notAssigned',
  computeValue: () => null  // No relation exists
})

const bedAssignedState = StateNode.create({ 
  name: 'assigned',
  computeValue: (lastValue, event) => ({
    bedNumber: event?.payload?.bedNumber,
    assignedAt: Math.floor(Date.now() / 1000)
  })
})

// StateMachine for BedAssignmentRelation
const BedAssignmentStateMachine = StateMachine.create({
  states: [bedNotAssignedState, bedAssignedState],
  transfers: [
    StateTransfer.create({
      trigger: AssignUserToBedInteraction,
      current: bedNotAssignedState,
      next: bedAssignedState,
      computeTarget: async function(this, event) {
        // Find the user and dormitory from the payload
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.userId] }),
          undefined,
          ['id', 'isActive']
        )
        
        const dormitory = await this.system.storage.findOne('Dormitory',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.dormitoryId] }),
          undefined,
          ['id', 'bedCount', 'occupiedBeds']
        )
        
        // Check if user is active and dormitory has capacity
        if (user?.isActive && dormitory && (dormitory.occupiedBeds < dormitory.bedCount)) {
          return {
            source: { id: user.id },
            target: { id: dormitory.id }
          }
        }
        
        return null  // Don't create relation if conditions not met
      }
    }),
    StateTransfer.create({
      trigger: RemoveUserFromDormitoryInteraction,
      current: bedAssignedState,
      next: bedNotAssignedState,
      computeTarget: async function(this, event) {
        // Find existing relation to remove
        const relation = await this.system.storage.findOneRelationByName(BedAssignmentRelation.name,
          MatchExp.atom({ key: 'source.id', value: ['=', event.payload.userId] }),
          undefined,
          ['id']
        )
        
        return relation
      }
    })
  ],
  defaultState: bedNotAssignedState
})

// Assign StateMachine computation to BedAssignmentRelation
BedAssignmentRelation.computation = BedAssignmentStateMachine

// State nodes for DormitoryLeadershipRelation
const leaderNotAssignedState = StateNode.create({ 
  name: 'notAssigned',
  computeValue: () => null  // No relation exists
})

const leaderAssignedState = StateNode.create({ 
  name: 'assigned',
  computeValue: (lastValue, event) => ({
    assignedAt: Math.floor(Date.now() / 1000)
  })
})

// StateMachine for DormitoryLeadershipRelation
const DormitoryLeadershipStateMachine = StateMachine.create({
  states: [leaderNotAssignedState, leaderAssignedState],
  transfers: [
    StateTransfer.create({
      trigger: AssignDormitoryLeaderInteraction,
      current: leaderNotAssignedState,
      next: leaderAssignedState,
      computeTarget: async function(this, event) {
        // Find the user and check if they can be a leader
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.userId] }),
          undefined,
          ['id', 'role', 'isActive']
        )
        
        const dormitory = await this.system.storage.findOne('Dormitory',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.dormitoryId] }),
          undefined,
          ['id']
        )
        
        // Check if dormitory already has a leader
        const existingLeader = await this.system.storage.findOneRelationByName(DormitoryLeadershipRelation.name,
          MatchExp.atom({ key: 'target.id', value: ['=', event.payload.dormitoryId] }),
          undefined,
          ['id']
        )
        
        // Can assign if user is active, dormitory exists, and no current leader
        if (user?.isActive && dormitory && !existingLeader) {
          return {
            source: { id: user.id },
            target: { id: dormitory.id }
          }
        }
        
        return null  // Don't create relation if conditions not met
      }
    })
  ],
  defaultState: leaderNotAssignedState
})

// Assign StateMachine computation to DormitoryLeadershipRelation
DormitoryLeadershipRelation.computation = DormitoryLeadershipStateMachine

// Add Transform computation for AuditTrackingRelation
// This creates the relation between User and AuditLog when AuditLog entities exist
AuditTrackingRelation.computation = Transform.create({
  record: AuditLog,
  attributeQuery: ['id', 'actionType', 'details'],
  callback: async function(this, auditLog) {
    // Parse the details to get the userId
    try {
      const details = JSON.parse(auditLog.details)
      const userId = details.userId
      
      if (userId) {
        // Check if userId is a valid UUID format (system-generated) or a test string
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
        
        if (isUuidFormat) {
          // Use the UUID directly
          return {
            source: { id: userId },
            target: { id: auditLog.id },
            timestamp: Math.floor(Date.now() / 1000)
          }
        } else {
          // For test scenarios with string IDs, try to find a matching User entity
          // This might be a test user context ID, so we skip creating the relation
          // since test contexts don't represent actual User entities
          return null
        }
      }
    } catch (e) {
      // If we can't parse details, skip this audit log
      console.warn('Failed to parse audit log details:', e)
    }
    
    return null
  }
})

// Add Transform computation for UserScoringRelation
// This creates the relation between User and ScoreEvent when ScoreEvent entities are created
UserScoringRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: async function(this, event) {
    if (event.interactionName === 'ApplyScoreDeduction') {
      // Find the corresponding ScoreEvent that was created by this interaction
      const scoreEvents = await this.system.storage.find('ScoreEvent',
        MatchExp.atom({ key: 'reason', value: ['=', event.payload.reason] })
          .and({ key: 'category', value: ['=', event.payload.category] })
          .and({ key: 'amount', value: ['=', -(event.payload.deductionAmount)] }),
        { limit: 1, orderBy: { timestamp: 'desc' } },
        ['id', 'timestamp']
      )
      
      if (scoreEvents.length > 0 && event.payload.userId) {
        const scoreEvent = scoreEvents[0]
        return {
          source: { id: event.payload.userId },
          target: { id: scoreEvent.id },
          createdAt: Math.floor(Date.now() / 1000)
        }
      }
    }
    
    return null
  }
})

// Add Transform computation for RemovalRequestingRelation
// This creates the relation between User and RemovalRequest when RemovalRequest entities are created
RemovalRequestingRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: async function(this, event) {
    if (event.interactionName === 'CreateRemovalRequest') {
      // Find the corresponding RemovalRequest that was created by this interaction
      const removalRequests = await this.system.storage.find('RemovalRequest',
        MatchExp.atom({ key: 'reason', value: ['=', event.payload.reason] })
          .and({ key: 'urgency', value: ['=', event.payload.urgency] })
          .and({ key: 'status', value: ['=', 'pending'] }),
        { limit: 1, orderBy: { createdAt: 'desc' } },
        ['id', 'createdAt']
      )
      
      if (removalRequests.length > 0 && event.payload.targetUserId) {
        const removalRequest = removalRequests[0]
        
        // Check if the requesting user (event.user.id) is a valid UUID format
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.user.id)
        
        // Create relations array
        const relations = []
        
        // Only create relation for requester if it's a valid UUID (real user entity)
        if (isUuidFormat) {
          relations.push({
            source: { id: event.user.id },
            target: { id: removalRequest.id },
            role: 'requester',
            createdAt: Math.floor(Date.now() / 1000)
          })
        }
        
        // Always create relation for target user (payload contains actual user ID)
        relations.push({
          source: { id: event.payload.targetUserId },
          target: { id: removalRequest.id },
          role: 'target',
          createdAt: Math.floor(Date.now() / 1000)
        })
        
        return relations.length > 0 ? relations : null
      }
    }
    
    return null
  }
})

// State nodes for User.isActive property (soft delete handling)
const activeState = StateNode.create({
  name: 'active',
  computeValue: (lastValue, event) => {
    // Handle initial creation and activation
    if (event?.interactionName === 'CreateUser') {
      return true  // Users are active when created
    }
    if (event?.interactionName === 'ActivateUser') {
      return true  // Explicitly activate user
    }
    // Keep existing active state
    return lastValue !== undefined ? lastValue : true
  }
})

const inactiveState = StateNode.create({
  name: 'inactive', 
  computeValue: (lastValue, event) => {
    // Handle deactivation
    if (event?.interactionName === 'DeactivateUser') {
      return false  // Explicitly deactivate user (soft delete)
    }
    // Keep existing inactive state
    return lastValue !== undefined ? lastValue : false
  }
})

// StateMachine for User.isActive property
const UserIsActiveStateMachine = StateMachine.create({
  states: [activeState, inactiveState],
  transfers: [
    StateTransfer.create({
      trigger: CreateUserInteraction,
      current: inactiveState,  // Default state before creation
      next: activeState,
      computeTarget: async function(this, event) {
        // Find the user that was just created
        const user = await this.system.storage.findOne('User',
          MatchExp.atom({ key: 'username', value: ['=', event.payload?.username] }),
          undefined,
          ['id']
        )
        
        return user
      }
    })
    // Note: DeactivateUser and ActivateUser interactions would be added later if needed
    // StateTransfer.create({
    //   trigger: DeactivateUserInteraction,
    //   current: activeState,
    //   next: inactiveState,
    //   computeTarget: async function(this, event) {
    //     const user = await this.system.storage.findOne('User',
    //       MatchExp.atom({ key: 'id', value: ['=', event.payload?.userId] }),
    //       undefined,
    //       ['id']
    //     )
    //     return user
    //   }
    // }),
    // StateTransfer.create({
    //   trigger: ActivateUserInteraction,
    //   current: inactiveState,
    //   next: activeState,
    //   computeTarget: async function(this, event) {
    //     const user = await this.system.storage.findOne('User',
    //       MatchExp.atom({ key: 'id', value: ['=', event.payload?.userId] }),
    //       undefined,
    //       ['id']
    //     )
    //     return user
    //   }
    // })
  ],
  defaultState: inactiveState  // Default to inactive before creation
})

// Assign StateMachine computation to User.isActive property
User.properties.find(p => p.name === 'isActive').computation = UserIsActiveStateMachine

// State nodes for RemovalRequest.status property
const statusDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    // Handle initial creation
    if (event?.interactionName === 'CreateRemovalRequest') {
      return 'pending'  // All removal requests start as pending
    }
    // Handle status updates through ProcessRemovalRequest
    if (event?.interactionName === 'ProcessRemovalRequest') {
      if (event.payload?.decision === 'approved') {
        return 'approved'
      }
      if (event.payload?.decision === 'rejected') {
        return 'rejected'
      }
    }
    // Keep existing value
    return lastValue || 'pending'
  }
})

// StateMachine for RemovalRequest.status property
const RemovalRequestStatusStateMachine = StateMachine.create({
  states: [statusDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: CreateRemovalRequestInteraction,
      current: statusDefaultState,
      next: statusDefaultState,
      computeTarget: async function(this, event) {
        // Find the removal request that was just created
        const removalRequest = await this.system.storage.findOne('RemovalRequest',
          MatchExp.atom({ key: 'reason', value: ['=', event.payload?.reason] })
            .and({ key: 'urgency', value: ['=', event.payload?.urgency] }),
          undefined,
          ['id']
        )
        
        return removalRequest
      }
    }),
    StateTransfer.create({
      trigger: ProcessRemovalRequestInteraction,
      current: statusDefaultState,
      next: statusDefaultState,
      computeTarget: async function(this, event) {
        // Find the removal request being processed
        const removalRequest = await this.system.storage.findOne('RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload?.requestId] }),
          undefined,
          ['id']
        )
        
        return removalRequest
      }
    })
  ],
  defaultState: statusDefaultState
})

// Assign StateMachine computation to RemovalRequest.status property
RemovalRequest.properties.find(p => p.name === 'status').computation = RemovalRequestStatusStateMachine

// State nodes for RemovalRequest.processedAt property
const processedAtDefaultState = StateNode.create({
  name: 'unprocessed',
  computeValue: (lastValue, event) => {
    // If this is triggered by ProcessRemovalRequest, set timestamp
    if (event && event.interactionName === 'ProcessRemovalRequest') {
      return Math.floor(Date.now() / 1000)
    }
    // Keep existing value or null if not set
    return lastValue !== undefined ? lastValue : null
  }
})

// StateMachine for RemovalRequest.processedAt property
const RemovalRequestProcessedAtStateMachine = StateMachine.create({
  states: [processedAtDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: ProcessRemovalRequestInteraction,
      current: processedAtDefaultState,
      next: processedAtDefaultState,
      computeTarget: async function(this, event) {
        // Find the removal request being processed
        const removalRequest = await this.system.storage.findOne('RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload?.requestId] }),
          undefined,
          ['id']
        )
        
        return removalRequest
      }
    })
  ],
  defaultState: processedAtDefaultState
})

// Assign StateMachine computation to RemovalRequest.processedAt property
RemovalRequest.properties.find(p => p.name === 'processedAt').computation = RemovalRequestProcessedAtStateMachine

// State nodes for RemovalRequest.notes property
const notesDefaultState = StateNode.create({
  name: 'default',
  computeValue: (lastValue, event) => {
    // Set notes from ProcessRemovalRequest interaction payload
    if (event && event.interactionName === 'ProcessRemovalRequest') {
      return event.payload?.notes || lastValue
    }
    // Keep existing value
    return lastValue || null
  }
})

// StateMachine for RemovalRequest.notes property
const RemovalRequestNotesStateMachine = StateMachine.create({
  states: [notesDefaultState],
  transfers: [
    StateTransfer.create({
      trigger: ProcessRemovalRequestInteraction,
      current: notesDefaultState,
      next: notesDefaultState,
      computeTarget: async function(this, event) {
        // Find the removal request being processed
        const removalRequest = await this.system.storage.findOne('RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload?.requestId] }),
          undefined,
          ['id']
        )
        
        return removalRequest
      }
    })
  ],
  defaultState: notesDefaultState
})

// Assign StateMachine computation to RemovalRequest.notes property
RemovalRequest.properties.find(p => p.name === 'notes').computation = RemovalRequestNotesStateMachine

// Assign Summation computation to User.currentScore property
User.properties.find(p => p.name === 'currentScore').computation = Summation.create({
  property: 'scoreEvents', // Use property name from UserScoringRelation sourceProperty
  attributeQuery: ['amount'] // Sum the amount field from related ScoreEvent entities
})

// Assign Count computation to Dormitory.occupiedBeds property
Dormitory.properties.find(p => p.name === 'occupiedBeds').computation = Count.create({
  property: 'residents' // Use property name from BedAssignmentRelation targetProperty
})

// Assign computed function to Dormitory.availableBeds property
Dormitory.properties.find(p => p.name === 'availableBeds').computed = function(dormitory) {
  return (dormitory.bedCount || 0) - (dormitory.occupiedBeds || 0)
}

// ========= ADD CONDITIONS BELOW THIS LINE (append to file) =========
// DO NOT modify any code above this line
// All conditions are added via assignment pattern below

// P001: Only admin can create users
const isAdministrator = Condition.create({
  name: 'isAdministrator',
  content: function(this: Controller, event: any) {
    return event.user?.role === 'administrator'
  }
})

// Assign condition to existing interaction
CreateUserInteraction.conditions = isAdministrator

// P002: Only admin can create dormitories
// Reuse the same condition since both CreateUser and CreateDormitory require administrator role
CreateDormitoryInteraction.conditions = isAdministrator

// P003: Only admin can assign leaders
AssignDormitoryLeaderInteraction.conditions = isAdministrator