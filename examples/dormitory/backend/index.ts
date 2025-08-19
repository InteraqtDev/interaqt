import {
  Entity,
  Property,
  Relation,
  Interaction,
  Payload,
  PayloadItem,
  Action,
  Controller,
  Count,
  Summation,
  WeightedSummation,
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  Condition,
  Conditions,
  BoolExp,
  MatchExp,
  InteractionEventEntity,
  GetAction,
  Query,
  QueryItem
} from 'interaqt'

// ========= ENTITIES =========

// User entity - System users with different roles
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'phone', type: 'string' }),
    Property.create({ name: 'role', type: 'string', defaultValue: () => 'student' }), // admin, dormHead, student
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }), // active, suspended, removed
    Property.create({ name: 'totalPoints', type: 'number' }), // Will add computation later
    Property.create({ name: 'isRemovable', type: 'boolean' }), // Will add computation later
    Property.create({ name: 'isDormHead', type: 'boolean' }), // Will add computation later
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// Dormitory entity - Dormitory rooms that house students
const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }), // 4-6 beds
    Property.create({ name: 'floor', type: 'number' }),
    Property.create({ name: 'building', type: 'string' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }), // active, inactive
    Property.create({ name: 'occupancy', type: 'number' }), // Will add computation later
    Property.create({ name: 'availableBeds', type: 'number' }), // Will add computation later
    Property.create({ name: 'hasDormHead', type: 'boolean' }), // Will add computation later
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// Bed entity - Individual bed units within dormitories
const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'code', type: 'string' }), // e.g., 'A', 'B', '1', '2'
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'available' }), // available, occupied, maintenance
    Property.create({ name: 'isAvailable', type: 'boolean' }), // Will add computation later
    Property.create({ name: 'assignedAt', type: 'timestamp' }),
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// PointDeduction entity - Disciplinary point records
const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }), // 1-10 points
    Property.create({ name: 'category', type: 'string' }), // hygiene, noise, curfew, damage, other
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }), // active, appealed, cancelled
    Property.create({ name: 'details', type: 'string' }),
    Property.create({ name: 'evidence', type: 'string' }),
    Property.create({ name: 'issuedAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// RemovalRequest entity - Requests to remove problematic users
const RemovalRequest = Entity.create({
  name: 'RemovalRequest',
  properties: [
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'targetPoints', type: 'number' }), // Will add computation later
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'pending' }), // pending, approved, rejected, cancelled
    Property.create({ name: 'adminComment', type: 'string' }),
    Property.create({ name: 'processedAt', type: 'timestamp' }),
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'updatedAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// ========= RELATIONS =========

// UserDormitoryRelation - Assigns users to dormitories (n:1)
const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'assignedBy', type: 'string' })
  ]
})

// UserBedRelation - Assigns users to specific beds (1:1)
const UserBedRelation = Relation.create({
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'user',
  type: '1:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'assignedBy', type: 'string' })
  ]
})

// DormitoryBedRelation - Links dormitories to their beds (1:n)
const DormitoryBedRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  properties: [
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// DormitoryDormHeadRelation - Assigns dorm heads to manage dormitories (n:1)
const DormitoryDormHeadRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitories',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'timestamp', defaultValue: () => Date.now() }),
    Property.create({ name: 'assignedBy', type: 'string' })
  ]
})

// UserPointDeductionRelation - Links users to their point deductions (1:n)
const UserPointDeductionRelation = Relation.create({
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n',
  properties: [
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// PointDeductionIssuerRelation - Tracks who issued each point deduction (n:1)
const PointDeductionIssuerRelation = Relation.create({
  source: PointDeduction,
  sourceProperty: 'issuer',
  target: User,
  targetProperty: 'issuedDeductions',
  type: 'n:1',
  properties: [
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// RemovalRequestTargetRelation - Links removal requests to target users (n:1)
const RemovalRequestTargetRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'removalRequestsTargeting',
  type: 'n:1',
  properties: [
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// RemovalRequestInitiatorRelation - Tracks who initiated each removal request (n:1)
const RemovalRequestInitiatorRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'initiator',
  target: User,
  targetProperty: 'initiatedRemovalRequests',
  type: 'n:1',
  properties: [
    Property.create({ name: 'createdAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// RemovalRequestProcessorRelation - Tracks which admin processed each removal request (n:1)
const RemovalRequestProcessorRelation = Relation.create({
  source: RemovalRequest,
  sourceProperty: 'processor',
  target: User,
  targetProperty: 'processedRemovalRequests',
  type: 'n:1',
  properties: [
    Property.create({ name: 'processedAt', type: 'timestamp', defaultValue: () => Date.now() })
  ]
})

// ========= INTERACTIONS =========

// CreateDormitory - Create new dormitory with beds
const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'capacity' }),
      PayloadItem.create({ name: 'floor' }),
      PayloadItem.create({ name: 'building' })
    ]
  }),
  action: Action.create({ name: 'create' })
})

// UpdateDormitory - Modify dormitory details
const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'floor' }),
      PayloadItem.create({ name: 'building' }),
      PayloadItem.create({ name: 'status' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// DeactivateDormitory - Mark dormitory as inactive
const DeactivateDormitory = Interaction.create({
  name: 'DeactivateDormitory',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// AssignDormHead - Appoint user as dorm head
const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  }),
  action: Action.create({ name: 'create' })
})

// RemoveDormHead - Remove dorm head privileges
const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' })
    ]
  }),
  action: Action.create({ name: 'delete' })
})

// AssignUserToDormitory - Assign student to dormitory and bed
const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'dormitoryId' }),
      PayloadItem.create({ name: 'bedCode' })
    ]
  }),
  action: Action.create({ name: 'create' })
})

// RemoveUserFromDormitory - Remove user from dormitory
const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'reason' })
    ]
  }),
  action: Action.create({ name: 'delete' })
})

// IssuePointDeduction - Issue disciplinary points
const IssuePointDeduction = Interaction.create({
  name: 'IssuePointDeduction',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId' }),
      PayloadItem.create({ name: 'reason' }),
      PayloadItem.create({ name: 'points' }),
      PayloadItem.create({ name: 'category' }),
      PayloadItem.create({ name: 'details' }),
      PayloadItem.create({ name: 'evidence' })
    ]
  }),
  action: Action.create({ name: 'create' })
})

// InitiateRemovalRequest - Request removal of problematic user
const InitiateRemovalRequest = Interaction.create({
  name: 'InitiateRemovalRequest',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId' }),
      PayloadItem.create({ name: 'reason' })
    ]
  }),
  action: Action.create({ name: 'create' })
})

// CancelRemovalRequest - Cancel pending removal request
const CancelRemovalRequest = Interaction.create({
  name: 'CancelRemovalRequest',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// ProcessRemovalRequest - Approve or reject removal request
const ProcessRemovalRequest = Interaction.create({
  name: 'ProcessRemovalRequest',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId' }),
      PayloadItem.create({ name: 'decision' }),
      PayloadItem.create({ name: 'adminComment' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// CreateUser - Create new user (for testing/initialization)
const CreateUser = Interaction.create({
  name: 'CreateUser',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'email' }),
      PayloadItem.create({ name: 'phone' }),
      PayloadItem.create({ name: 'role' })
    ]
  }),
  action: Action.create({ name: 'create' })
})

// UpdateUserProfile - Update user profile
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'phone' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// SetBedMaintenance - Set bed maintenance status
const SetBedMaintenance = Interaction.create({
  name: 'SetBedMaintenance',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'bedId' }),
      PayloadItem.create({ name: 'status' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// AppealDeduction - Appeal point deduction
const AppealDeduction = Interaction.create({
  name: 'AppealDeduction',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'deductionId' }),
      PayloadItem.create({ name: 'appealReason' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// CancelDeduction - Cancel incorrect deduction
const CancelDeduction = Interaction.create({
  name: 'CancelDeduction',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'deductionId' }),
      PayloadItem.create({ name: 'reason' })
    ]
  }),
  action: Action.create({ name: 'update' })
})

// Read-only interactions
const ViewSystemStats = Interaction.create({
  name: 'ViewSystemStats',
  payload: Payload.create({ items: [] }),
  action: Action.create({ name: 'read' })
})

const ViewDormitoryStats = Interaction.create({
  name: 'ViewDormitoryStats',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  }),
  action: Action.create({ name: 'read' })
})

const ViewUserDeductions = Interaction.create({
  name: 'ViewUserDeductions',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId' })
    ]
  }),
  action: Action.create({ name: 'read' })
})

const ViewMyDormitory = Interaction.create({
  name: 'ViewMyDormitory',
  payload: Payload.create({ items: [] }),
  action: Action.create({ name: 'read' })
})

const ViewMyDeductions = Interaction.create({
  name: 'ViewMyDeductions',
  payload: Payload.create({ items: [] }),
  action: Action.create({ name: 'read' })
})

const ViewMyBed = Interaction.create({
  name: 'ViewMyBed',
  payload: Payload.create({ items: [] }),
  action: Action.create({ name: 'read' })
})

// ========= EXPORTS =========
export const entities = [User, Dormitory, Bed, PointDeduction, RemovalRequest]
export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserPointDeductionRelation,
  PointDeductionIssuerRelation,
  RemovalRequestTargetRelation,
  RemovalRequestInitiatorRelation,
  RemovalRequestProcessorRelation
]
export const activities = []
export const interactions = [
  CreateDormitory,
  UpdateDormitory,
  DeactivateDormitory,
  AssignDormHead,
  RemoveDormHead,
  AssignUserToDormitory,
  RemoveUserFromDormitory,
  IssuePointDeduction,
  InitiateRemovalRequest,
  CancelRemovalRequest,
  ProcessRemovalRequest,
  CreateUser,
  UpdateUserProfile,
  SetBedMaintenance,
  AppealDeduction,
  CancelDeduction,
  ViewSystemStats,
  ViewDormitoryStats,
  ViewUserDeductions,
  ViewMyDormitory,
  ViewMyDeductions,
  ViewMyBed
]
export const dicts = []

// ========= COMPUTATIONS =========
// Phase 1: Entity Computations

// User entity computation - Create from CreateUser interaction
User.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'CreateUser') {
      return {
        name: event.payload.name,
        email: event.payload.email,
        phone: event.payload.phone,
        role: event.payload.role || 'student'
      }
    }
    return null
  }
})

// Dormitory entity computation - Create from CreateDormitory interaction
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'CreateDormitory') {
      return {
        name: event.payload.name,
        capacity: event.payload.capacity,
        floor: event.payload.floor,
        building: event.payload.building
      }
    }
    return null
  }
})

// PointDeduction entity computation - Create from IssuePointDeduction interaction
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'IssuePointDeduction') {
      return {
        reason: event.payload.reason,
        points: event.payload.points,
        category: event.payload.category,
        details: event.payload.details,
        evidence: event.payload.evidence
      }
    }
    return null
  }
})

// RemovalRequest entity computation - Create from InitiateRemovalRequest interaction
RemovalRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'InitiateRemovalRequest') {
      return {
        reason: event.payload.reason
      }
    }
    return null
  }
})

// Phase 2: Entity and Relation Computations

// Bed entity computation - Create beds automatically with Dormitory
Bed.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'CreateDormitory') {
      // Create beds based on capacity
      const capacity = event.payload.capacity
      const bedCodes = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, capacity)
      
      // Return array of bed entities to create
      return bedCodes.map((code: string) => ({
        code: code
      }))
    }
    return null
  }
})

// UserPointDeductionRelation - Created automatically with PointDeduction
// Since the relation is created when IssuePointDeduction creates a PointDeduction entity,
// we need to handle this in the PointDeduction Transform computation
UserPointDeductionRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'IssuePointDeduction') {
      // This creates the relation between the target user and the deduction
      return {
        user: { id: event.payload.targetUserId },
        pointDeduction: null  // Will be linked to the created PointDeduction automatically
      }
    }
    return null
  }
})

// DeductionIssuerRelation (renamed from PointDeductionIssuerRelation) - Created automatically with PointDeduction  
// This tracks who issued the deduction
PointDeductionIssuerRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'IssuePointDeduction') {
      // This creates the relation between the issuer and the deduction
      return {
        pointDeduction: null,  // Will be linked to the created PointDeduction automatically
        user: event.user  // The user who issued the deduction
      }
    }
    return null
  }
})

// RemovalRequestTargetRelation - Created automatically with RemovalRequest
RemovalRequestTargetRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'InitiateRemovalRequest') {
      return {
        removalRequest: null,  // Will be linked to the created RemovalRequest automatically
        user: { id: event.payload.targetUserId }
      }
    }
    return null
  }
})

// RemovalRequestInitiatorRelation - Created automatically with RemovalRequest
RemovalRequestInitiatorRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['*'],
  callback: function(event: any) {
    if (event.interactionName === 'InitiateRemovalRequest') {
      return {
        removalRequest: null,  // Will be linked to the created RemovalRequest automatically
        user: event.user  // The user who initiated the request
      }
    }
    return null
  }
})

// UserDormitoryRelation computation - StateMachine for managing user-dormitory assignments
// Define states first
const userDormAssignedState = StateNode.create({
  name: 'assigned',
  computeValue: () => ({}) // Relation exists
})

const userDormDeletedState = StateNode.create({
  name: 'deleted',
  computeValue: () => null // Return null to delete the relation
})

UserDormitoryRelation.computation = StateMachine.create({
  states: [userDormAssignedState, userDormDeletedState],
  defaultState: userDormDeletedState, // Start with no relation
  transfers: [
    // Create relation when user is assigned to dormitory
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: userDormDeletedState,
      next: userDormAssignedState,
      computeTarget: async function(this: Controller, event: any) {
        // Find the user and dormitory
        const user = await this.system.storage.findOne(
          'User',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.userId] })
        )
        const dormitory = await this.system.storage.findOne(
          'Dormitory',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.dormitoryId] })
        )
        
        if (user && dormitory) {
          // Return the relation specification to create
          return {
            source: user,
            target: dormitory,
            assignedBy: event.user.id
          }
        }
        return null
      }
    }),
    // Delete relation when user is removed from dormitory
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: userDormAssignedState,
      next: userDormDeletedState,
      computeTarget: async function(this: Controller, event: any) {
        // Find the existing relation to delete
        const relation = await this.system.storage.findOne(
          'UserDormitoryRelation',
          MatchExp.atom({ key: 'user.id', value: ['=', event.payload.userId] }),
          undefined,
          ['id']
        )
        return relation
      }
    }),
    // Delete relation when removal request is approved
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userDormAssignedState,
      next: userDormDeletedState,
      computeTarget: async function(this: Controller, event: any) {
        if (event.payload.decision === 'approved') {
          // Find the removal request
          const request = await this.system.storage.findOne(
            'RemovalRequest',
            MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] })
          )
          
          if (request) {
            // Find the target user relation
            const targetRelation = await this.system.storage.findOne(
              'RemovalRequestTargetRelation',
              MatchExp.atom({ key: 'removalRequest.id', value: ['=', request.id] }),
              undefined,
              ['user']
            )
            
            if (targetRelation) {
              // Find and return the user-dormitory relation to delete
              const userDormRelation = await this.system.storage.findOne(
                'UserDormitoryRelation',
                MatchExp.atom({ key: 'user.id', value: ['=', targetRelation.user.id] }),
                undefined,
                ['id']
              )
              return userDormRelation
            }
          }
        }
        return null
      }
    })
  ]
})