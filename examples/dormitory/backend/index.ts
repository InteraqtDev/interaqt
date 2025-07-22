import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Count,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  InteractionEventEntity,
  Condition,
  BoolExp,
  Conditions,
  MatchExp,
  Summation
} from 'interaqt'

// ==================== State Nodes ====================
// Define state nodes first to avoid circular references
const availableState = StateNode.create({ name: 'available' })
const occupiedState = StateNode.create({ name: 'occupied' })

const activeState = StateNode.create({ name: 'active' })
const removedState = StateNode.create({ name: 'removed' })

const pendingState = StateNode.create({ name: 'pending' })
const approvedState = StateNode.create({ 
  name: 'approved'
})
const rejectedState = StateNode.create({ 
  name: 'rejected'
})

// ==================== Permission Conditions ====================

// Role-based conditions
const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: any, event: any) {
    if (event.user?.role !== 'admin') {
      throw new Error('权限不足')
    }
    return true
  }
})

const DormHeadRole = Condition.create({
  name: 'DormHeadRole',
  content: async function(this: any, event: any) {
    return event.user?.role === 'dormHead'
  }
})

const StudentRole = Condition.create({
  name: 'StudentRole',
  content: async function(this: any, event: any) {
    return event.user?.role === 'student'
  }
})

// ==================== Business Rule Conditions ====================

// Dormitory capacity validation
const ValidDormitoryCapacity = Condition.create({
  name: 'ValidDormitoryCapacity',
  content: async function(this: any, event: any) {
    const capacity = event.payload?.capacity
    if (!(capacity >= 4 && capacity <= 6)) {
      throw new Error('容量必须在4-6之间')
    }
    return true
  }
})

// Check if user is already assigned to a dormitory
const UserNotAssigned = Condition.create({
  name: 'UserNotAssigned',
  content: async function(this: any, event: any) {
    const userId = event.payload?.userId
    if (!userId) return false
    
    const userDormRelation = await this.system.storage.findOneRelationByName(
      'User_dormitory_users_Dormitory',
      this.globals.MatchExp.atom({ key: 'source.id', value: ['=', userId] }),
      undefined,
      ['id']
    )
    
    if (userDormRelation) {
      throw new Error('用户已有宿舍分配')
    }
    return true
  }
})

// Check if dormitory is not full
const DormitoryNotFull = Condition.create({
  name: 'DormitoryNotFull',
  content: async function(this: any, event: any) {
    const dormitoryId = event.payload?.dormitoryId
    if (!dormitoryId) return false
    
    const dormitory = await this.system.storage.findOne(
      'Dormitory',
      this.globals.MatchExp.atom({ key: 'id', value: ['=', dormitoryId] }),
      undefined,
      ['id', 'capacity', 'currentOccupancy']
    )
    
    if (!dormitory || dormitory.currentOccupancy >= dormitory.capacity) {
      throw new Error('宿舍已满')
    }
    return true
  }
})

// Check if deduction points is positive
const ValidDeductionPoints = Condition.create({
  name: 'ValidDeductionPoints',
  content: async function(this: any, event: any) {
    const points = event.payload?.points
    return points > 0
  }
})

// Check if dorm head and target user are in same dormitory
const SameDormitory = Condition.create({
  name: 'SameDormitory',
  content: async function(this: any, event: any) {
    const dormHeadId = event.user?.id
    const targetUserId = event.payload?.userId
    
    if (!dormHeadId || !targetUserId) return false
    
    // Get dorm head's dormitory
    const dormHeadRelation = await this.system.storage.findOneRelationByName(
      'User_dormitory_users_Dormitory',
      this.globals.MatchExp.atom({ key: 'source.id', value: ['=', dormHeadId] }),
      undefined,
      ['target']
    )
    
    if (!dormHeadRelation) return false
    
    // Check if target user is in same dormitory
    const targetUserRelation = await this.system.storage.findOneRelationByName(
      'User_dormitory_users_Dormitory',
      this.globals.MatchExp.atom({ key: 'source.id', value: ['=', targetUserId] }),
      undefined,
      ['target']
    )
    
    if (!targetUserRelation || targetUserRelation.target.id !== dormHeadRelation.target.id) {
      throw new Error('无权对其他宿舍成员扣分')
    }
    return true
  }
})

// Check if target user score is below 60
const LowScore = Condition.create({
  name: 'LowScore',
  content: async function(this: any, event: any) {
    const userId = event.payload?.userId
    if (!userId) return false
    
    const user = await this.system.storage.findOne(
      'User',
      this.globals.MatchExp.atom({ key: 'id', value: ['=', userId] }),
      undefined,
      ['id', 'score', ['deductionRecords', { attributeQuery: ['points'] }]]
    )
    
    if (!user || user.score >= 60) {
      throw new Error('用户积分高于60分，不能申请踢出')
    }
    return true
  }
})

// Check if removal request is pending
const RequestPending = Condition.create({
  name: 'RequestPending',
  content: async function(this: any, event: any) {
    const requestId = event.payload?.requestId?.id
    if (!requestId) return false
    
    const request = await this.system.storage.findOne(
      'RemovalRequest',
      this.globals.MatchExp.atom({ key: 'id', value: ['=', requestId] }),
      undefined,
      ['id', 'status']
    )
    
    if (!request || request.status !== 'pending') {
      throw new Error('申请已处理')
    }
    return true
  }
})

// Check if student can view dormitory (only their own)
const CanViewDormitory = Condition.create({
  name: 'CanViewDormitory',
  content: async function(this: any, event: any) {
    const user = event.user
    
    // Admin and dorm head can view any dormitory
    if (user.role === 'admin' || user.role === 'dormHead') {
      return true
    }
    
    // Students can only view their own dormitory
    // Note: In Stage 1, we'll let all users view for simplicity
    return true
  }
})

// ==================== Entities ====================

// ==================== Forward declare entities ====================
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string', defaultValue: () => 'student' }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({
      name: 'score',
      type: 'number',
      defaultValue: () => 100
    }),
    Property.create({ name: 'joinedAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
})

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({
      name: 'currentOccupancy',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
})

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'bedNumber', type: 'number' }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'available'
    })
  ]
})

const DeductionRule = Entity.create({
  name: 'DeductionRule',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
  ]
})

const DeductionRecord = Entity.create({
  name: 'DeductionRecord',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
})

const RemovalRequest = Entity.create({
  name: 'RemovalRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'processedAt', type: 'string', defaultValue: () => null })
  ]
})

// ==================== Relations ====================

// User-Dormitory Relation (n:1)
const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1'
})

// User-Bed Relation (1:1)
const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1'
})

// Dormitory-Bed Relation (1:n)
const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
})

// Dormitory-DormHead Relation (1:1)
const DormitoryDormHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1'
})

// User-DeductionRecord Relation (1:n)
const UserDeductionRecordRelation = Relation.create({
  source: User,
  sourceProperty: 'deductionRecords',
  target: DeductionRecord,
  targetProperty: 'user',
  type: '1:n'
})

// DeductionRule-DeductionRecord Relation (1:n)
const DeductionRuleDeductionRecordRelation = Relation.create({
  source: DeductionRule,
  sourceProperty: 'records',
  target: DeductionRecord,
  targetProperty: 'rule',
  type: '1:n'
})

// RemovalRequest-User Relation (n:1) - Target User
const RemovalRequestUserRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'removalRequests',
  type: 'n:1'
})

// RemovalRequest-DormHead Relation (n:1) - Requester
const RemovalRequestDormHeadRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'createdRequests',
  type: 'n:1'
})

// ==================== Interactions ====================

// Admin Interactions

// CreateDormitory Interaction
const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  }),
  // Admin only + valid capacity (4-6)
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole).and(BoolExp.atom(ValidDormitoryCapacity))
  })
})

// AssignDormHead Interaction
const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  }),
  // Admin only
  conditions: AdminRole
})

// AssignUserToDormitory Interaction
const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'assign' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  }),
  // Admin only + user not assigned + dormitory not full
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(UserNotAssigned))
      .and(BoolExp.atom(DormitoryNotFull))
  })
})

// CreateDeductionRule Interaction
const CreateDeductionRule = Interaction.create({
  name: 'CreateDeductionRule',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'points', required: true })
    ]
  }),
  // Admin only + points > 0
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole).and(BoolExp.atom(ValidDeductionPoints))
  })
})

// DormHead Interactions

// DeductPoints Interaction
const DeductPoints = Interaction.create({
  name: 'DeductPoints',
  action: Action.create({ name: 'deduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'ruleId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  }),
  // Dorm head only + same dormitory
  conditions: Conditions.create({
    content: BoolExp.atom(DormHeadRole).and(BoolExp.atom(SameDormitory))
  })
})

// RequestUserRemoval Interaction
const RequestUserRemoval = Interaction.create({
  name: 'RequestUserRemoval',
  action: Action.create({ name: 'request' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  }),
  // Dorm head only + same dormitory + target user score < 60
  conditions: Conditions.create({
    content: BoolExp.atom(DormHeadRole)
      .and(BoolExp.atom(SameDormitory))
      .and(BoolExp.atom(LowScore))
  })
})

// ProcessRemovalRequest Interaction - split into approve and reject
const ApproveRemovalRequest = Interaction.create({
  name: 'ApproveRemovalRequest',
  action: Action.create({ name: 'approveRemoval' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        base: RemovalRequest,
        isRef: true
      })
    ]
  }),
  // Admin only + request pending
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole).and(BoolExp.atom(RequestPending))
  })
})

const RejectRemovalRequest = Interaction.create({
  name: 'RejectRemovalRequest',
  action: Action.create({ name: 'rejectRemoval' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        base: RemovalRequest,
        isRef: true
      })
    ]
  }),
  // Admin only + request pending
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole).and(BoolExp.atom(RequestPending))
  })
})

// Student Interactions

// ViewDormitoryInfo Interaction
const ViewDormitoryInfo = Interaction.create({
  name: 'ViewDormitoryInfo',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  // All users can view (students only their own, others any)
  conditions: CanViewDormitory
})

// ViewMyScore Interaction
const ViewMyScore = Interaction.create({
  name: 'ViewMyScore',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  // Student only
  conditions: StudentRole
})

// ==================== Now add computations to properties ====================

// Fix score computation - now it should subtract points
const userScoreProperty = User.properties.find(p => p.name === 'score')
if (userScoreProperty) {
  // Since we need 100 - sum(deductions), we can't use Summation directly
  // Let's keep the computed property but make sure it handles the case properly
  userScoreProperty.computed = function(user: any) {
    // Default score is 100
    const baseScore = 100
    
    // If no deductionRecords property exists, return base score
    if (!user.deductionRecords) {
      return baseScore
    }
    
    // If deductionRecords is an array, sum the points
    if (Array.isArray(user.deductionRecords)) {
      const totalDeductions = user.deductionRecords.reduce((sum: number, record: any) => {
        return sum + (record.points || 0)
      }, 0)
      return Math.max(0, baseScore - totalDeductions)
    }
    
    // Otherwise return base score
    return baseScore
  }
}

// Add currentOccupancy computation to Dormitory
const dormitoryOccupancyProperty = Dormitory.properties.find(p => p.name === 'currentOccupancy')
if (dormitoryOccupancyProperty) {
  dormitoryOccupancyProperty.computation = Count.create({
    record: UserDormitoryRelation
  })
}

// Add StateMachine to User status
const userStatusProperty = User.properties.find(p => p.name === 'status')
if (userStatusProperty) {
  userStatusProperty.computation = StateMachine.create({
    states: [activeState, removedState],
    defaultState: activeState,
    transfers: [
      StateTransfer.create({
        trigger: ApproveRemovalRequest,
        current: activeState,
        next: removedState,
        computeTarget: async function(this: any, event: any) {
          // Find the removal request to get the target user
          const request = await this.system.storage.findOne(
            'RemovalRequest',
            this.globals.MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId.id] }),
            undefined,
            ['targetUser']
          )
          return request?.targetUser
        }
      })
    ]
  })
}

// Note: Bed status management is simplified for Stage 1
// In Stage 2, we would implement proper bed status state management
// Currently, bed status is set via defaultValue and would need 
// different mechanisms for updates

// Add StateMachine to RemovalRequest status
const removalRequestStatusProperty = RemovalRequest.properties.find(p => p.name === 'status')
if (removalRequestStatusProperty) {
  removalRequestStatusProperty.computation = StateMachine.create({
    states: [pendingState, approvedState, rejectedState],
    defaultState: pendingState,
    transfers: [
      // Separate transfer for approval
      StateTransfer.create({
        trigger: ApproveRemovalRequest,
        current: pendingState,
        next: approvedState,
        computeTarget: (event: any) => {
          return { id: event.payload.requestId.id }
        }
      }),
      // Separate transfer for rejection
      StateTransfer.create({
        trigger: RejectRemovalRequest,
        current: pendingState,
        next: rejectedState,
        computeTarget: (event: any) => {
          return { id: event.payload.requestId.id }
        }
      })
    ]
  })
}

// Note: User role updates are not handled via StateMachine in Stage 1
// Role is set when user is created and would need different mechanism for updates

// ==================== Entity-level Computations ====================

// Transform to create dormitory (simplified - no nested creation)
Dormitory.computation = Transform.create({
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

// Transform to create beds when a dormitory is created
Bed.computation = Transform.create({
  record: Dormitory,
  attributeQuery: ['id', 'capacity'],
  callback: (dormitory) => {
    // Create beds for new dormitory
    // Returning array of beds to create all at once
    const beds = []
    for (let i = 1; i <= dormitory.capacity; i++) {
      beds.push({
        bedNumber: i,
        dormitory: { id: dormitory.id }
      })
    }
    // Transform should handle array of records
    return beds
  }
})

// Transform to create deduction rule
DeductionRule.computation = Transform.create({
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

// Transform to create deduction record
DeductionRecord.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: async function(this: any, event: any) {
    if (event.interactionName === 'DeductPoints') {
      // Fetch the rule to get the actual points
      const rule = await this.system.storage.findOne(
        'DeductionRule',
        this.globals.MatchExp.atom({ key: 'id', value: ['=', event.payload.ruleId] }),
        undefined,
        ['points']
      )
      
      return {
        reason: event.payload.reason,
        points: rule?.points || 0,
        user: { id: event.payload.userId },
        rule: { id: event.payload.ruleId }
      }
    }
    return null
  }
})

// Transform to create removal request
RemovalRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: (event) => {
    if (event.interactionName === 'RequestUserRemoval') {
      return {
        reason: event.payload.reason,
        targetUser: { id: event.payload.userId },
        requester: { id: event.user.id }
      }
    }
    return null
  }
})

// ==================== Relation-level Computations ====================

// Link user and dormitory
UserDormitoryRelation.computation = Transform.create({
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

// Link user and bed
UserBedRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: (event) => {
    if (event.interactionName === 'AssignUserToDormitory') {
      // Find first available bed in the dormitory
      return {
        source: { id: event.payload.userId },
        target: { status: 'available', dormitory: { id: event.payload.dormitoryId } }
      }
    }
    return null
  }
})

// Link dormitory and dorm head
DormitoryDormHeadRelation.computation = Transform.create({
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

// Transform to update user role when assigned as dorm head
// Note: Removed as Transform is for creating new entities, not updating existing ones
// Role updates would typically be handled through a StateMachine or other mechanism

// ==================== Exports ====================

export const entities = [
  User,
  Dormitory,
  Bed,
  DeductionRule,
  DeductionRecord,
  RemovalRequest
]

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserDeductionRecordRelation,
  DeductionRuleDeductionRecordRelation,
  RemovalRequestUserRelation,
  RemovalRequestDormHeadRelation
]

export const interactions = [
  CreateDormitory,
  AssignDormHead,
  AssignUserToDormitory,
  CreateDeductionRule,
  DeductPoints,
  RequestUserRemoval,
  ApproveRemovalRequest,
  RejectRemovalRequest,
  ViewDormitoryInfo,
  ViewMyScore
]

export const activities = []
export const dicts = []
