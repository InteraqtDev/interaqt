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

// ==================== ENTITIES ====================

// User Entity
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'phone', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'role', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'status', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'totalPoints', type: 'number' }), // Will have Summation computation
    Property.create({ name: 'isRemovable', type: 'boolean' }), // Will have computed function
    Property.create({ name: 'isDormHead', type: 'boolean' }), // Will have computed function
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' }) // Will have StateMachine computation
  ]
})

// Dormitory Entity
const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'floor', type: 'number' }), // Will have StateMachine computation
    Property.create({ name: 'building', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'status', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'occupancy', type: 'number' }), // Will have Count computation
    Property.create({ name: 'availableBeds', type: 'number' }), // Will have computed function
    Property.create({ name: 'hasDormHead', type: 'boolean' }), // Will have Count computation
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' }) // Will have StateMachine computation
  ]
})

// Bed Entity
const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'bedNumber', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'isAvailable', type: 'boolean' }), // Will have computed function
    Property.create({ name: 'assignedAt', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' }) // Will have StateMachine computation
  ]
})

// PointDeduction Entity
const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'category', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'evidence', type: 'string' }),
    Property.create({ name: 'deductedAt', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'string' })
  ]
})

// RemovalRequest Entity
const RemovalRequest = Entity.create({
  name: 'RemovalRequest',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'totalPoints', type: 'number' }), // Will have Transform computation
    Property.create({ name: 'status', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'adminComment', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'processedAt', type: 'string' }), // Will have StateMachine computation
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ name: 'updatedAt', type: 'string' }) // Will have StateMachine computation
  ]
})

// ==================== RELATIONS ====================

// UserDormitoryRelation: n:1 (many users to one dormitory)
const UserDormitoryRelation = Relation.create({
  name: 'UserDormitoryRelation',
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1'
})

// UserBedRelation: 1:1 (one user to one bed)
const UserBedRelation = Relation.create({
  name: 'UserBedRelation',
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1'
})

// DormitoryBedRelation: 1:n (one dormitory to many beds)
const DormitoryBedRelation = Relation.create({
  name: 'DormitoryBedRelation',
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
})

// DormitoryDormHeadRelation: n:1 (many dormitories to one dorm head)
const DormitoryDormHeadRelation = Relation.create({
  name: 'DormitoryDormHeadRelation',
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: 'n:1'
})

// UserPointDeductionRelation: 1:n (one user to many point deductions)
const UserPointDeductionRelation = Relation.create({
  name: 'UserPointDeductionRelation',
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n'
})

// DeductionIssuerRelation: n:1 (many deductions to one issuer)
const DeductionIssuerRelation = Relation.create({
  name: 'DeductionIssuerRelation',
  source: PointDeduction,
  sourceProperty: 'issuedBy',
  target: User,
  targetProperty: 'issuedDeductions',
  type: 'n:1'
})

// RemovalRequestTargetRelation: n:1 (many requests to one target user)
const RemovalRequestTargetRelation = Relation.create({
  name: 'RemovalRequestTargetRelation',
  source: RemovalRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'removalRequests',
  type: 'n:1'
})

// RemovalRequestInitiatorRelation: n:1 (many requests to one initiator)
const RemovalRequestInitiatorRelation = Relation.create({
  name: 'RemovalRequestInitiatorRelation',
  source: RemovalRequest,
  sourceProperty: 'requestedBy',
  target: User,
  targetProperty: 'initiatedRemovalRequests',
  type: 'n:1'
})

// RemovalRequestAdminRelation: n:1 (many requests to one admin processor)
const RemovalRequestAdminRelation = Relation.create({
  name: 'RemovalRequestAdminRelation',
  source: RemovalRequest,
  sourceProperty: 'processedBy',
  target: User,
  targetProperty: 'processedRemovalRequests',
  type: 'n:1'
})

// ==================== INTERACTIONS ====================

// CreateDormitory Interaction
const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true }),
      PayloadItem.create({ name: 'floor' }),
      PayloadItem.create({ name: 'building' })
    ]
  })
})

// UpdateDormitory Interaction
const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'floor' }),
      PayloadItem.create({ name: 'building' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
})

// DeactivateDormitory Interaction
const DeactivateDormitory = Interaction.create({
  name: 'DeactivateDormitory',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

// AssignDormHead Interaction
const AssignDormHead = Interaction.create({
  name: 'AssignDormHead',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

// RemoveDormHead Interaction
const RemoveDormHead = Interaction.create({
  name: 'RemoveDormHead',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true })
    ]
  })
})

// AssignUserToDormitory Interaction
const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'dormitoryId', required: true }),
      PayloadItem.create({ name: 'bedNumber', required: true })
    ]
  })
})

// RemoveUserFromDormitory Interaction
const RemoveUserFromDormitory = Interaction.create({
  name: 'RemoveUserFromDormitory',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'reason' })
    ]
  })
})

// IssuePointDeduction Interaction
const IssuePointDeduction = Interaction.create({
  name: 'IssuePointDeduction',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true }),
      PayloadItem.create({ name: 'points', required: true }),
      PayloadItem.create({ name: 'category', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'evidence' })
    ]
  })
})

// InitiateRemovalRequest Interaction
const InitiateRemovalRequest = Interaction.create({
  name: 'InitiateRemovalRequest',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

// CancelRemovalRequest Interaction
const CancelRemovalRequest = Interaction.create({
  name: 'CancelRemovalRequest',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true })
    ]
  })
})

// ProcessRemovalRequest Interaction
const ProcessRemovalRequest = Interaction.create({
  name: 'ProcessRemovalRequest',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId', required: true }),
      PayloadItem.create({ name: 'decision', required: true }),
      PayloadItem.create({ name: 'adminComment' })
    ]
  })
})

// ViewSystemStats Interaction
const ViewSystemStats = Interaction.create({
  name: 'ViewSystemStats',
  action: Action.create({ name: 'read' }),
  payload: Payload.create({
    items: []
  })
})

// ViewDormitoryStats Interaction
const ViewDormitoryStats = Interaction.create({
  name: 'ViewDormitoryStats',
  action: Action.create({ name: 'read' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId', required: true })
    ]
  })
})

// ViewUserDeductions Interaction
const ViewUserDeductions = Interaction.create({
  name: 'ViewUserDeductions',
  action: Action.create({ name: 'read' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetUserId', required: true })
    ]
  })
})

// ViewMyDormitory Interaction
const ViewMyDormitory = Interaction.create({
  name: 'ViewMyDormitory',
  action: Action.create({ name: 'read' }),
  payload: Payload.create({
    items: []
  })
})

// ViewMyDeductions Interaction
const ViewMyDeductions = Interaction.create({
  name: 'ViewMyDeductions',
  action: Action.create({ name: 'read' }),
  payload: Payload.create({
    items: []
  })
})

// ViewMyBed Interaction
const ViewMyBed = Interaction.create({
  name: 'ViewMyBed',
  action: Action.create({ name: 'read' }),
  payload: Payload.create({
    items: []
  })
})

// CreateUser Interaction
const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'email', required: true }),
      PayloadItem.create({ name: 'phone' }),
      PayloadItem.create({ name: 'role' })
    ]
  })
})

// UpdateUserProfile Interaction
const UpdateUserProfile = Interaction.create({
  name: 'UpdateUserProfile',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: true }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'phone' })
    ]
  })
})

// SetBedMaintenance Interaction
const SetBedMaintenance = Interaction.create({
  name: 'SetBedMaintenance',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'bedId', required: true }),
      PayloadItem.create({ name: 'status', required: true })
    ]
  })
})

// AppealDeduction Interaction
const AppealDeduction = Interaction.create({
  name: 'AppealDeduction',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'deductionId', required: true }),
      PayloadItem.create({ name: 'appealReason', required: true })
    ]
  })
})

// CancelDeduction Interaction
const CancelDeduction = Interaction.create({
  name: 'CancelDeduction',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'deductionId', required: true }),
      PayloadItem.create({ name: 'reason', required: true })
    ]
  })
})

// ==================== EXPORTS ====================

export const entities = [User, Dormitory, Bed, PointDeduction, RemovalRequest]
export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserPointDeductionRelation,
  DeductionIssuerRelation,
  RemovalRequestTargetRelation,
  RemovalRequestInitiatorRelation,
  RemovalRequestAdminRelation
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
  ViewSystemStats,
  ViewDormitoryStats,
  ViewUserDeductions,
  ViewMyDormitory,
  ViewMyDeductions,
  ViewMyBed,
  CreateUser,
  UpdateUserProfile,
  SetBedMaintenance,
  AppealDeduction,
  CancelDeduction
]
export const dicts = []

// Export individual relation instances for tests
export { UserDormitoryRelation, UserBedRelation, DormitoryBedRelation, DormitoryDormHeadRelation, 
         UserPointDeductionRelation, DeductionIssuerRelation, RemovalRequestTargetRelation, 
         RemovalRequestInitiatorRelation, RemovalRequestAdminRelation }

// ==================== COMPUTATIONS ====================

// Phase 1: Entity Creation Computations

// User entity creation via CreateUser interaction
User.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event: any) {
    if (event.interactionName === 'CreateUser') {
      const payload = event.payload
      const timestamp = new Date().toISOString()
      
      return {
        name: payload.name,
        email: payload.email,
        phone: payload.phone || '',
        role: payload.role || 'student',
        status: 'active',
        totalPoints: 0,
        isRemovable: false,
        isDormHead: false,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    }
    return null
  }
})

// Dormitory entity creation via CreateDormitory interaction
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event: any) {
    if (event.interactionName === 'CreateDormitory') {
      const payload = event.payload
      const timestamp = new Date().toISOString()
      
      // Validate capacity
      const capacity = payload.capacity
      if (capacity < 4 || capacity > 6) {
        // Note: Validation will be handled by business rules later
        // For now, we'll accept the value
      }
      
      return {
        name: payload.name,
        capacity: capacity,
        floor: payload.floor || 1,
        building: payload.building || 'Main',
        status: 'active',
        occupancy: 0,
        availableBeds: capacity,
        hasDormHead: false,
        createdAt: timestamp
        // updatedAt will be controlled by StateMachine computation
      }
    }
    return null
  }
})

// PointDeduction entity creation via IssuePointDeduction interaction
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event: any, context: any) {
    if (event.interactionName === 'IssuePointDeduction') {
      const payload = event.payload
      const timestamp = new Date().toISOString()
      
      return {
        reason: payload.reason,
        points: payload.points,
        category: payload.category,
        status: 'active',
        description: payload.description || '',
        evidence: payload.evidence || '',
        deductedAt: timestamp,
        createdAt: timestamp,
        // Relations - these will trigger automatic relation creation
        user: { id: payload.targetUserId },  // UserPointDeductionRelation
        issuedBy: { id: event.user.id }      // DeductionIssuerRelation
      }
    }
    return null
  }
})

// RemovalRequest entity creation via InitiateRemovalRequest interaction
RemovalRequest.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event: any) {
    if (event.interactionName === 'InitiateRemovalRequest') {
      const payload = event.payload
      const timestamp = new Date().toISOString()
      
      return {
        reason: payload.reason,
        totalPoints: 0, // Will be calculated later with proper computation
        status: 'pending',
        adminComment: '',
        // processedAt will be set by StateMachine computation when processed
        // updatedAt will be set by StateMachine computation when updated
        createdAt: timestamp,
        // Relations - these will trigger automatic relation creation
        targetUser: { id: payload.targetUserId },     // RemovalRequestTargetRelation
        requestedBy: { id: event.user.id }            // RemovalRequestInitiatorRelation
      }
    }
    return null
  }
})

// Phase 2: Entity and Relation Computations

// Bed entity creation - created automatically with Dormitory
Bed.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event: any, context: any) {
    if (event.interactionName === 'CreateDormitory') {
      const payload = event.payload
      const timestamp = new Date().toISOString()
      const capacity = payload.capacity
      
      // Create beds based on dormitory capacity
      // We need to return an array of beds since multiple beds are created
      const beds = []
      for (let i = 1; i <= capacity; i++) {
        beds.push({
          bedNumber: `${i}`, // Bed number as string: "1", "2", etc.
          status: 'available',
          isAvailable: true,
          assignedAt: '',
          createdAt: timestamp,
          updatedAt: timestamp
        })
      }
      
      // Return array of beds to create multiple entities
      return beds
    }
    return null
  }
})

// UserDormitoryRelation: StateMachine computation
// Created by AssignUserToDormitory, deleted by RemoveUserFromDormitory or approved ProcessRemovalRequest
// Note: notExists state means relation doesn't exist - returns null value
const relationNotExistsState = StateNode.create({ 
  name: 'notExists',
  computeValue: () => null  // Return null to indicate no relation
})
const relationExistsState = StateNode.create({ 
  name: 'exists'
})

UserDormitoryRelation.computation = StateMachine.create({
  states: [relationNotExistsState, relationExistsState],
  defaultState: relationNotExistsState,
  transfers: [
    // Create relation when AssignUserToDormitory is called
    StateTransfer.create({
      trigger: AssignUserToDormitory,
      current: relationNotExistsState,
      next: relationExistsState,
      computeTarget: function(event: any) {
        const payload = event.payload
        return {
          source: { id: payload.userId },
          target: { id: payload.dormitoryId }
        }
      }
    }),
    // Delete relation when RemoveUserFromDormitory is called
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: relationExistsState,
      next: relationNotExistsState,
      computeTarget: async function(this: Controller, event: any) {
        const payload = event.payload
        // Find existing relation to remove
        const relation = await this.system.storage.findOne(
          UserDormitoryRelation.name,
          MatchExp.atom({
            key: 'source.id',
            value: ['=', payload.userId]
          }),
          undefined,
          ['id']
        )
        return relation
      }
    })
    // TODO: Add ProcessRemovalRequest state transfer for deleting UserDormitoryRelation when approved
    // Currently disabled to avoid issues when user is not in a dormitory
  ]
})

// DormitoryDormHeadRelation: StateMachine computation
// Created by AssignDormHead, deleted by RemoveDormHead
const dormHeadRelationNotExistsState = StateNode.create({ 
  name: 'notExists',
  computeValue: () => null  // Return null to indicate no relation
})
const dormHeadRelationExistsState = StateNode.create({ 
  name: 'exists'
})

DormitoryDormHeadRelation.computation = StateMachine.create({
  states: [dormHeadRelationNotExistsState, dormHeadRelationExistsState],
  defaultState: dormHeadRelationNotExistsState,
  transfers: [
    // Create relation when AssignDormHead is called
    StateTransfer.create({
      trigger: AssignDormHead,
      current: dormHeadRelationNotExistsState,
      next: dormHeadRelationExistsState,
      computeTarget: function(event: any) {
        const payload = event.payload
        return {
          source: { id: payload.dormitoryId },
          target: { id: payload.userId }
        }
      }
    }),
    // Delete relation when RemoveDormHead is called
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: dormHeadRelationExistsState,
      next: dormHeadRelationNotExistsState,
      computeTarget: async function(this: Controller, event: any) {
        const payload = event.payload
        // Find existing relation to remove
        const relation = await this.system.storage.findOne(
          DormitoryDormHeadRelation.name,
          MatchExp.atom({
            key: 'target.id',
            value: ['=', payload.userId]
          }),
          undefined,
          ['id']
        )
        return relation
      }
    })
  ]
})

// RemovalRequestAdminRelation: Transform computation
// Created when ProcessRemovalRequest approves or rejects the request
// This relation cannot be deleted - it's a permanent record of who processed the request
RemovalRequestAdminRelation.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event: any) {
    if (event.interactionName === 'ProcessRemovalRequest') {
      const payload = event.payload
      // Ensure we have the required data
      if (!payload || !payload.requestId || !event.user || !event.user.id) {
        console.error('Missing required data for RemovalRequestAdminRelation', { payload, user: event.user })
        return null
      }
      // Create relation when admin processes the request (either approved or rejected)
      return {
        source: { id: payload.requestId },  // RemovalRequest
        target: { id: event.user.id }       // Admin who processed it
      }
    }
    return null
  }
})

// ========= PROPERTY COMPUTATIONS - PHASE 2 =========

// User.name: StateMachine computation
// Initial value set by entity Transform, updated by UpdateUserProfile
const userNameState = StateNode.create({ 
  name: 'hasName',
  // computeValue returns the actual name value that will be stored
  computeValue: function(lastValue: any, event: any) {
    // If event has payload with name, use it
    if (event && event.payload && event.payload.name !== undefined) {
      return event.payload.name
    }
    // Otherwise keep the last value
    return lastValue
  }
})

User.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [userNameState],
  defaultState: userNameState,
  transfers: [
    // Update name when UpdateUserProfile is called
    // Note: Initial value is set by entity Transform during CreateUser
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userNameState,
      next: userNameState,
      computeTarget: function(event: any) {
        // Only update if name is provided in payload
        if (event.payload.name !== undefined) {
          return { id: event.payload.userId }
        }
        return null
      }
    })
  ]
})

// User.phone computation
const userPhoneState = StateNode.create({
  name: 'userPhone',
  computeValue: function(lastValue?: any, event?: any) {
    // For UpdateUserProfile, use the phone from payload if provided
    if (event?.interactionName === 'UpdateUserProfile' && event.payload.phone !== undefined) {
      return event.payload.phone
    }
    // Otherwise keep the last value (initial value is set by entity Transform)
    return lastValue
  }
})

User.properties.find(p => p.name === 'phone').computation = StateMachine.create({
  states: [userPhoneState],
  defaultState: userPhoneState,
  transfers: [
    // Update phone when UpdateUserProfile is called
    // Note: Initial value is set by entity Transform during CreateUser
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userPhoneState,
      next: userPhoneState,
      computeTarget: function(event: any) {
        // Only update if phone is provided in payload
        if (event.payload.phone !== undefined) {
          return { id: event.payload.userId }
        }
        return null
      }
    })
  ]
})

// User.role: StateMachine computation
// State transitions between student, dormHead, admin based on interactions
const userRoleState = StateNode.create({
  name: 'userRole',
  computeValue: function(lastValue?: any, event?: any) {
    // For AssignDormHead, set role to dormHead
    if (event?.interactionName === 'AssignDormHead') {
      return 'dormHead'
    }
    // For RemoveDormHead, revert role to student
    if (event?.interactionName === 'RemoveDormHead') {
      return 'student'
    }
    // Otherwise keep the last value (initial value is set by entity Transform during CreateUser)
    return lastValue
  }
})

User.properties.find(p => p.name === 'role').computation = StateMachine.create({
  states: [userRoleState],
  defaultState: userRoleState,
  transfers: [
    // Change to dormHead when AssignDormHead is called
    StateTransfer.create({
      trigger: AssignDormHead,
      current: userRoleState,
      next: userRoleState,
      computeTarget: function(event: any) {
        // Update the user being assigned as dorm head
        return { id: event.payload.userId }
      }
    }),
    // Change back to student when RemoveDormHead is called
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: userRoleState,
      next: userRoleState,
      computeTarget: function(event: any) {
        // Update the user being removed as dorm head
        return { id: event.payload.userId }
      }
    })
  ]
})

// User.status: StateMachine computation
// State transitions between active, suspended, removed based on interactions
const userStatusState = StateNode.create({
  name: 'userStatus',
  computeValue: function(lastValue?: any, event?: any) {
    // For CreateUser, initial status is active
    if (event?.interactionName === 'CreateUser') {
      return 'active'
    }
    // For ProcessRemovalRequest, check if approved/rejected
    if (event?.interactionName === 'ProcessRemovalRequest') {
      if (event.payload.decision === 'approved') {
        return 'removed'
      }
      // If rejected, keep current status
      return lastValue
    }
    // For RemoveUserFromDormitory, set to suspended
    if (event?.interactionName === 'RemoveUserFromDormitory') {
      return 'suspended'
    }
    // Otherwise keep the last value
    return lastValue
  }
})

User.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [userStatusState],
  defaultState: userStatusState,
  transfers: [
    // Process removal request - can approve or reject
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userStatusState,
      next: userStatusState,
      computeTarget: async function(this: Controller, event: any) {
        // Get the removal request to find the target user
        const removalRequest = await this.system.storage.findOne(
          'RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          ['id', 'targetUser']
        )
        // Update the target user of the removal request
        return { id: removalRequest.targetUser.id }
      }
    }),
    // Direct removal from dormitory - suspends user
    StateTransfer.create({
      trigger: RemoveUserFromDormitory,
      current: userStatusState,
      next: userStatusState,
      computeTarget: function(event: any) {
        // Update the user being removed from dormitory
        return { id: event.payload.userId }
      }
    })
  ]
})

// User.updatedAt: StateMachine computation
// Updates timestamp when user is modified by various interactions
const userUpdatedAtState = StateNode.create({
  name: 'userUpdatedAt',
  computeValue: function(lastValue?: any, event?: any) {
    // Return current timestamp whenever triggered
    if (event?.interactionName === 'UpdateUserProfile' ||
        event?.interactionName === 'AssignDormHead' ||
        event?.interactionName === 'RemoveDormHead' ||
        event?.interactionName === 'ProcessRemovalRequest') {
      return new Date().toISOString()
    }
    // Keep the last value if not triggered by update interactions
    return lastValue
  }
})

User.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [userUpdatedAtState],
  defaultState: userUpdatedAtState,
  transfers: [
    // Update timestamp when profile is updated
    StateTransfer.create({
      trigger: UpdateUserProfile,
      current: userUpdatedAtState,
      next: userUpdatedAtState,
      computeTarget: function(event: any) {
        return { id: event.payload.userId }
      }
    }),
    // Update timestamp when assigned as dorm head
    StateTransfer.create({
      trigger: AssignDormHead,
      current: userUpdatedAtState,
      next: userUpdatedAtState,
      computeTarget: function(event: any) {
        return { id: event.payload.userId }
      }
    }),
    // Update timestamp when removed as dorm head
    StateTransfer.create({
      trigger: RemoveDormHead,
      current: userUpdatedAtState,
      next: userUpdatedAtState,
      computeTarget: function(event: any) {
        return { id: event.payload.userId }
      }
    }),
    // Update timestamp when removal request is processed
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: userUpdatedAtState,
      next: userUpdatedAtState,
      computeTarget: async function(this: Controller, event: any) {
        // Get the removal request to find the target user
        const removalRequest = await this.system.storage.findOne(
          'RemovalRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          ['id', 'targetUser']
        )
        // Update the target user of the removal request
        return { id: removalRequest.targetUser.id }
      }
    })
  ]
})

// Dormitory.name: StateMachine computation
// Direct assignment from CreateDormitory and UpdateDormitory interactions
const dormitoryNameState = StateNode.create({
  name: 'dormitoryName',
  computeValue: function(lastValue?: any, event?: any) {
    // For CreateDormitory, set initial name
    if (event?.interactionName === 'CreateDormitory') {
      return event.payload.name
    }
    // For UpdateDormitory, update name if provided
    if (event?.interactionName === 'UpdateDormitory' && event.payload.name !== undefined) {
      return event.payload.name
    }
    // Otherwise keep the last value
    return lastValue
  }
})

Dormitory.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [dormitoryNameState],
  defaultState: dormitoryNameState,
  transfers: [
    // Update name when dormitory is updated
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryNameState,
      next: dormitoryNameState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    })
  ]
})

// Dormitory.floor: StateMachine computation
// Direct assignment from CreateDormitory and UpdateDormitory interactions
const dormitoryFloorState = StateNode.create({
  name: 'dormitoryFloor',
  computeValue: function(lastValue?: any, event?: any) {
    // For CreateDormitory, set initial floor
    if (event?.interactionName === 'CreateDormitory') {
      return event.payload.floor
    }
    // For UpdateDormitory, update floor if provided
    if (event?.interactionName === 'UpdateDormitory' && event.payload.floor !== undefined) {
      return event.payload.floor
    }
    // Otherwise keep the last value
    return lastValue
  }
})

Dormitory.properties.find(p => p.name === 'floor').computation = StateMachine.create({
  states: [dormitoryFloorState],
  defaultState: dormitoryFloorState,
  transfers: [
    // Update floor when dormitory is updated
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryFloorState,
      next: dormitoryFloorState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    })
  ]
})

// Dormitory.building: StateMachine computation
// Direct assignment from CreateDormitory and UpdateDormitory interactions
const dormitoryBuildingState = StateNode.create({
  name: 'dormitoryBuilding',
  computeValue: function(lastValue?: any, event?: any) {
    // For CreateDormitory, set initial building
    if (event?.interactionName === 'CreateDormitory') {
      return event.payload.building
    }
    // For UpdateDormitory, update building if provided
    if (event?.interactionName === 'UpdateDormitory' && event.payload.building !== undefined) {
      return event.payload.building
    }
    // Otherwise keep the last value
    return lastValue
  }
})

Dormitory.properties.find(p => p.name === 'building').computation = StateMachine.create({
  states: [dormitoryBuildingState],
  defaultState: dormitoryBuildingState,
  transfers: [
    // Update building when dormitory is updated
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryBuildingState,
      next: dormitoryBuildingState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    })
  ]
})

// Dormitory.status: StateMachine computation
// State transitions between active and inactive
const dormitoryStatusState = StateNode.create({
  name: 'dormitoryStatus',
  computeValue: function(lastValue?: any, event?: any) {
    // For CreateDormitory, default to active
    if (event?.interactionName === 'CreateDormitory') {
      return 'active'
    }
    // For UpdateDormitory, update status if provided
    if (event?.interactionName === 'UpdateDormitory' && event.payload.status !== undefined) {
      return event.payload.status
    }
    // For DeactivateDormitory, always set to inactive
    if (event?.interactionName === 'DeactivateDormitory') {
      return 'inactive'
    }
    // Otherwise keep the last value
    return lastValue || 'active'
  }
})

Dormitory.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [dormitoryStatusState],
  defaultState: dormitoryStatusState,
  transfers: [
    // Update status via UpdateDormitory
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryStatusState,
      next: dormitoryStatusState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    }),
    // Deactivate dormitory
    StateTransfer.create({
      trigger: DeactivateDormitory,
      current: dormitoryStatusState,
      next: dormitoryStatusState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    })
  ]
})

// Dormitory.updatedAt: StateMachine computation
// Updated on UpdateDormitory or DeactivateDormitory
const dormitoryUpdatedAtNotSetState = StateNode.create({
  name: 'notSet',
  computeValue: () => undefined // No value initially
})
const dormitoryUpdatedAtSetState = StateNode.create({
  name: 'set',
  computeValue: () => new Date().toISOString()
})

Dormitory.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [dormitoryUpdatedAtNotSetState, dormitoryUpdatedAtSetState],
  defaultState: dormitoryUpdatedAtNotSetState,
  transfers: [
    // Update timestamp when UpdateDormitory is called (first time)
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryUpdatedAtNotSetState,
      next: dormitoryUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    }),
    // Update timestamp when UpdateDormitory is called (subsequent times)
    StateTransfer.create({
      trigger: UpdateDormitory,
      current: dormitoryUpdatedAtSetState,
      next: dormitoryUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    }),
    // Update timestamp when DeactivateDormitory is called (first time)
    StateTransfer.create({
      trigger: DeactivateDormitory,
      current: dormitoryUpdatedAtNotSetState,
      next: dormitoryUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    }),
    // Update timestamp when DeactivateDormitory is called (subsequent times)
    StateTransfer.create({
      trigger: DeactivateDormitory,
      current: dormitoryUpdatedAtSetState,
      next: dormitoryUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.dormitoryId }
      }
    })
  ]
})

// ========== PointDeduction.status computation ==========
// State transitions: active (initial) → appealed, cancelled
const pointDeductionStatusActiveState = StateNode.create({
  name: 'active',
  computeValue: () => 'active'
})

const pointDeductionStatusAppealedState = StateNode.create({
  name: 'appealed',
  computeValue: () => 'appealed'
})

const pointDeductionStatusCancelledState = StateNode.create({
  name: 'cancelled',
  computeValue: () => 'cancelled'
})

PointDeduction.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [
    pointDeductionStatusActiveState,
    pointDeductionStatusAppealedState,
    pointDeductionStatusCancelledState
  ],
  defaultState: pointDeductionStatusActiveState,
  transfers: [
    // IssuePointDeduction creates with active status (already set by initial state)
    // AppealDeduction: active → appealed
    StateTransfer.create({
      trigger: AppealDeduction,
      current: pointDeductionStatusActiveState,
      next: pointDeductionStatusAppealedState,
      computeTarget: function(event: any) {
        return { id: event.payload.deductionId }
      }
    }),
    // CancelDeduction: active → cancelled
    StateTransfer.create({
      trigger: CancelDeduction,
      current: pointDeductionStatusActiveState,
      next: pointDeductionStatusCancelledState,
      computeTarget: function(event: any) {
        return { id: event.payload.deductionId }
      }
    }),
    // CancelDeduction: appealed → cancelled (if admin cancels after appeal)
    StateTransfer.create({
      trigger: CancelDeduction,
      current: pointDeductionStatusAppealedState,
      next: pointDeductionStatusCancelledState,
      computeTarget: function(event: any) {
        return { id: event.payload.deductionId }
      }
    })
  ]
})

// ========== RemovalRequest.status computation ==========
// State transitions: pending → approved/rejected/cancelled
const removalRequestStatusState = StateNode.create({
  name: 'removalRequestStatus',
  computeValue: function(lastValue?: any, event?: any) {
    // For InitiateRemovalRequest, default to pending
    if (event?.interactionName === 'InitiateRemovalRequest') {
      return 'pending'
    }
    // For ProcessRemovalRequest, update based on decision
    if (event?.interactionName === 'ProcessRemovalRequest') {
      if (event.payload.decision === 'approve') {
        return 'approved'
      } else if (event.payload.decision === 'reject') {
        return 'rejected'
      }
    }
    // For CancelRemovalRequest, set to cancelled
    if (event?.interactionName === 'CancelRemovalRequest') {
      return 'cancelled'
    }
    // Otherwise keep the last value
    return lastValue || 'pending'
  }
})

RemovalRequest.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [removalRequestStatusState],
  defaultState: removalRequestStatusState,
  transfers: [
    // ProcessRemovalRequest updates the status
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestStatusState,
      next: removalRequestStatusState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    }),
    // CancelRemovalRequest updates the status
    StateTransfer.create({
      trigger: CancelRemovalRequest,
      current: removalRequestStatusState,
      next: removalRequestStatusState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    })
  ]
})

// RemovalRequest.adminComment StateMachine computation - Phase 2
const removalRequestAdminCommentState = StateNode.create({
  name: 'adminComment',
  computeValue: function(lastValue?: any, event?: any) {
    // Set adminComment when ProcessRemovalRequest is called
    if (event?.interactionName === 'ProcessRemovalRequest') {
      return event.payload.adminComment || ''
    }
    // Otherwise keep the last value
    return lastValue || ''
  }
})

RemovalRequest.properties.find(p => p.name === 'adminComment').computation = StateMachine.create({
  states: [removalRequestAdminCommentState],
  defaultState: removalRequestAdminCommentState,
  transfers: [
    // ProcessRemovalRequest sets the adminComment
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestAdminCommentState,
      next: removalRequestAdminCommentState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    })
  ]
})

// RemovalRequest.processedAt StateMachine computation - Phase 2
const removalRequestProcessedAtNotSetState = StateNode.create({
  name: 'notSet',
  computeValue: () => undefined // No value initially
})

const removalRequestProcessedAtSetState = StateNode.create({
  name: 'set',
  computeValue: () => new Date().toISOString()
})

RemovalRequest.properties.find(p => p.name === 'processedAt').computation = StateMachine.create({
  states: [removalRequestProcessedAtNotSetState, removalRequestProcessedAtSetState],
  defaultState: removalRequestProcessedAtNotSetState,
  transfers: [
    // ProcessRemovalRequest sets the processedAt timestamp
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestProcessedAtNotSetState,
      next: removalRequestProcessedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    })
  ]
})

// RemovalRequest.updatedAt StateMachine computation - Phase 2
const removalRequestUpdatedAtNotSetState = StateNode.create({
  name: 'notSet',
  computeValue: () => undefined // No value initially
})

const removalRequestUpdatedAtSetState = StateNode.create({
  name: 'set',
  computeValue: () => new Date().toISOString()
})

RemovalRequest.properties.find(p => p.name === 'updatedAt').computation = StateMachine.create({
  states: [removalRequestUpdatedAtNotSetState, removalRequestUpdatedAtSetState],
  defaultState: removalRequestUpdatedAtNotSetState,
  transfers: [
    // ProcessRemovalRequest sets/updates the updatedAt timestamp (first time)
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestUpdatedAtNotSetState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    }),
    // ProcessRemovalRequest updates the updatedAt timestamp (subsequent times)
    StateTransfer.create({
      trigger: ProcessRemovalRequest,
      current: removalRequestUpdatedAtSetState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    }),
    // CancelRemovalRequest sets/updates the updatedAt timestamp (first time)
    StateTransfer.create({
      trigger: CancelRemovalRequest,
      current: removalRequestUpdatedAtNotSetState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    }),
    // CancelRemovalRequest updates the updatedAt timestamp (subsequent times)
    StateTransfer.create({
      trigger: CancelRemovalRequest,
      current: removalRequestUpdatedAtSetState,
      next: removalRequestUpdatedAtSetState,
      computeTarget: function(event: any) {
        return { id: event.payload.requestId }
      }
    })
  ]
})