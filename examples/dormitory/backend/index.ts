import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Controller,
  Count,
  Summation,
  StateMachine,
  StateNode,
  StateTransfer,
  Transform,
  Custom,
  Condition,
  Conditions,
  BoolExp,
  MatchExp,
  Dictionary,
  InteractionEventEntity
} from 'interaqt'

// ========================= ENTITIES =========================

const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'password', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'role', type: 'string' }),
    Property.create({ name: 'createdAt', type: 'number' }),
    Property.create({ name: 'isDeleted', type: 'boolean' })
  ]
})

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'floor', type: 'number' }),
    Property.create({ name: 'building', type: 'string' }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ 
      name: 'isDeleted', 
      type: 'boolean',
      defaultValue: () => false
    }),
    Property.create({ 
      name: 'occupiedBeds', 
      type: 'number',
      defaultValue: () => 0
    })
  ]
})

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'bedNumber', type: 'string' }),
    Property.create({ 
      name: 'isOccupied', 
      type: 'boolean',
      defaultValue: () => false
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

const PointDeduction = Entity.create({
  name: 'PointDeduction',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'points', type: 'number' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ 
      name: 'createdAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ name: 'createdBy', type: 'string' })
  ]
})

const RemovalRequest = Entity.create({
  name: 'RemovalRequest',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
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
    Property.create({ name: 'processedAt', type: 'number' }),
    Property.create({ name: 'adminComment', type: 'string' })
  ]
})

// ========================= RELATIONS =========================

const UserDormitoryLeaderRelation = Relation.create({
  name: 'UserDormitoryLeaderRelation',
  source: User,
  sourceProperty: 'managedDormitory',
  target: Dormitory,
  targetProperty: 'dormitoryLeader',
  type: '1:1',
  properties: [
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ]
})

const DormitoryBedsRelation = Relation.create({
  name: 'DormitoryBedsRelation',
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  properties: []
})

const UserBedRelation = Relation.create({
  name: 'UserBedRelation',
  source: User,
  sourceProperty: 'bed',
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

const UserPointDeductionsRelation = Relation.create({
  name: 'UserPointDeductionsRelation',
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n',
  properties: []
})

const UserRemovalRequestsRelation = Relation.create({
  name: 'UserRemovalRequestsRelation',
  source: User,
  sourceProperty: 'removalRequests',
  target: RemovalRequest,
  targetProperty: 'targetUser',
  type: '1:n',
  properties: []
})

const DormitoryLeaderRemovalRequestsRelation = Relation.create({
  name: 'DormitoryLeaderRemovalRequestsRelation',
  source: User,
  sourceProperty: 'submittedRemovalRequests',
  target: RemovalRequest,
  targetProperty: 'requestedBy',
  type: '1:n',
  properties: []
})

// ========================= DICTIONARIES =========================

const totalUsers = Dictionary.create({
  name: 'totalUsers',
  type: 'number',
  collection: false
})

const totalDormitories = Dictionary.create({
  name: 'totalDormitories',
  type: 'number',
  collection: false
})

const totalOccupiedBeds = Dictionary.create({
  name: 'totalOccupiedBeds',
  type: 'number',
  collection: false
})

const totalAvailableBeds = Dictionary.create({
  name: 'totalAvailableBeds',
  type: 'number',
  collection: false
})

const pendingRemovalRequests = Dictionary.create({
  name: 'pendingRemovalRequests',
  type: 'number',
  collection: false
})

// ========================= INTERACTIONS =========================

// Admin Interactions
const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'capacity' }),
      PayloadItem.create({ name: 'floor' }),
      PayloadItem.create({ name: 'building' })
    ]
  })
})

const UpdateDormitory = Interaction.create({
  name: 'UpdateDormitory',
  action: Action.create({ name: 'updateDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' }),
      PayloadItem.create({ name: 'name', required: false }),
      PayloadItem.create({ name: 'floor', required: false }),
      PayloadItem.create({ name: 'building', required: false })
    ]
  })
})

const DeleteDormitory = Interaction.create({
  action: Action.create({ name: 'deleteDormitory' }),
  name: 'DeleteDormitory',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  })
})

const AssignDormitoryLeader = Interaction.create({
  action: Action.create({ name: 'assignDormitoryLeader' }),
  name: 'AssignDormitoryLeader',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  })
})

const RemoveDormitoryLeader = Interaction.create({
  action: Action.create({ name: 'removeDormitoryLeader' }),
  name: 'RemoveDormitoryLeader',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' })
    ]
  })
})

const AssignUserToBed = Interaction.create({
  action: Action.create({ name: 'assignUserToBed' }),
  name: 'AssignUserToBed',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'bedId' })
    ]
  })
})

const RemoveUserFromBed = Interaction.create({
  action: Action.create({ name: 'removeUserFromBed' }),
  name: 'RemoveUserFromBed',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' })
    ]
  })
})

const ProcessRemovalRequest = Interaction.create({
  action: Action.create({ name: 'processRemovalRequest' }),
  name: 'ProcessRemovalRequest',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'requestId' }),
      PayloadItem.create({ name: 'decision' }),
      PayloadItem.create({ name: 'adminComment', required: false })
    ]
  })
})

const DeductPoints = Interaction.create({
  action: Action.create({ name: 'deductPoints' }),
  name: 'DeductPoints',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'points' }),
      PayloadItem.create({ name: 'reason' }),
      PayloadItem.create({ name: 'description' })
    ]
  })
})

const CreateUser = Interaction.create({
  action: Action.create({ name: 'createUser' }),
  name: 'CreateUser',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'username' }),
      PayloadItem.create({ name: 'password' }),
      PayloadItem.create({ name: 'email' }),
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'role', required: false })
    ]
  })
})

const DeleteUser = Interaction.create({
  action: Action.create({ name: 'deleteUser' }),
  name: 'DeleteUser',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' })
    ]
  })
})

// Dormitory Leader Interactions
const SubmitRemovalRequest = Interaction.create({
  action: Action.create({ name: 'submitRemovalRequest' }),
  name: 'SubmitRemovalRequest',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'reason' })
    ]
  })
})

const DeductResidentPoints = Interaction.create({
  action: Action.create({ name: 'deductResidentPoints' }),
  name: 'DeductResidentPoints',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' }),
      PayloadItem.create({ name: 'points' }),
      PayloadItem.create({ name: 'reason' }),
      PayloadItem.create({ name: 'description' })
    ]
  })
})

// Resident Interactions
const ViewMyDormitory = Interaction.create({
  action: Action.create({ name: 'viewMyDormitory' }),
  name: 'ViewMyDormitory',
  payload: Payload.create({
    items: []
  })
})

const ViewMyPoints = Interaction.create({
  action: Action.create({ name: 'viewMyPoints' }),
  name: 'ViewMyPoints',
  payload: Payload.create({
    items: []
  })
})

const UpdateProfile = Interaction.create({
  action: Action.create({ name: 'updateProfile' }),
  name: 'UpdateProfile',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: false }),
      PayloadItem.create({ name: 'email', required: false })
    ]
  })
})

// Authentication Interactions
const Login = Interaction.create({
  action: Action.create({ name: 'login' }),
  name: 'Login',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'username' }),
      PayloadItem.create({ name: 'password' })
    ]
  })
})

const Registration = Interaction.create({
  action: Action.create({ name: 'registration' }),
  name: 'Registration',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'username' }),
      PayloadItem.create({ name: 'password' }),
      PayloadItem.create({ name: 'email' }),
      PayloadItem.create({ name: 'name' })
    ]
  })
})

const ChangePassword = Interaction.create({
  action: Action.create({ name: 'changePassword' }),
  name: 'ChangePassword',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'oldPassword' }),
      PayloadItem.create({ name: 'newPassword' })
    ]
  })
})

const UpdateUsername = Interaction.create({
  action: Action.create({ name: 'updateUsername' }),
  name: 'UpdateUsername',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'newUsername' })
    ]
  })
})

// Query Interactions
const GetDormitories = Interaction.create({
  action: Action.create({ name: 'getDormitories' }),
  name: 'GetDormitories',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'includeDeleted', required: false })
    ]
  })
})

const GetDormitoryDetail = Interaction.create({
  action: Action.create({ name: 'getDormitoryDetail' }),
  name: 'GetDormitoryDetail',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'dormitoryId' })
    ]
  })
})

const GetUsers = Interaction.create({
  action: Action.create({ name: 'getUsers' }),
  name: 'GetUsers',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'role', required: false }),
      PayloadItem.create({ name: 'dormitoryId', required: false }),
      PayloadItem.create({ name: 'includeDeleted', required: false })
    ]
  })
})

const GetRemovalRequests = Interaction.create({
  action: Action.create({ name: 'getRemovalRequests' }),
  name: 'GetRemovalRequests',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status', required: false }),
      PayloadItem.create({ name: 'dormitoryId', required: false })
    ]
  })
})

const GetPointDeductions = Interaction.create({
  action: Action.create({ name: 'getPointDeductions' }),
  name: 'GetPointDeductions',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId', required: false }),
      PayloadItem.create({ name: 'startDate', required: false }),
      PayloadItem.create({ name: 'endDate', required: false })
    ]
  })
})

// Admin interaction for promoting users to admin role
const PromoteToAdmin = Interaction.create({
  action: Action.create({ name: 'promoteToAdmin' }),
  name: 'PromoteToAdmin',
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'userId' })
    ]
  })
})

// ========================= EXPORTS =========================

export const entities = [
  User,
  Dormitory,
  Bed,
  PointDeduction,
  RemovalRequest
]

export const relations = [
  UserDormitoryLeaderRelation,
  DormitoryBedsRelation,
  UserBedRelation,
  UserPointDeductionsRelation,
  UserRemovalRequestsRelation,
  DormitoryLeaderRemovalRequestsRelation
]

export const dictionaries = [
  totalUsers,
  totalDormitories,
  totalOccupiedBeds,
  totalAvailableBeds,
  pendingRemovalRequests
]

export const interactions = [
  // Admin
  CreateDormitory,
  UpdateDormitory,
  DeleteDormitory,
  AssignDormitoryLeader,
  RemoveDormitoryLeader,
  AssignUserToBed,
  RemoveUserFromBed,
  ProcessRemovalRequest,
  DeductPoints,
  CreateUser,
  DeleteUser,
  PromoteToAdmin,
  // Dormitory Leader
  SubmitRemovalRequest,
  DeductResidentPoints,
  // Resident
  ViewMyDormitory,
  ViewMyPoints,
  UpdateProfile,
  // Authentication
  Login,
  Registration,
  ChangePassword,
  UpdateUsername,
  // Query
  GetDormitories,
  GetDormitoryDetail,
  GetUsers,
  GetRemovalRequests,
  GetPointDeductions
]

export const activities: any[] = []
export const dicts = dictionaries

// ========================= COMPUTATIONS =========================

// Relation: UserDormitoryLeaderRelation - StateMachine computation
const relationNotExistsState = StateNode.create({ 
  name: 'notExists',
  computeValue: () => null  // Return null means no relation
})

const relationExistsState = StateNode.create({ 
  name: 'exists',
  computeValue: () => ({
    assignedAt: Math.floor(Date.now() / 1000)
  })
})

UserDormitoryLeaderRelation.computation = StateMachine.create({
  states: [relationNotExistsState, relationExistsState],
  transfers: [
    StateTransfer.create({
      trigger: AssignDormitoryLeader,
      current: relationNotExistsState,
      next: relationExistsState,
      computeTarget: function(event) {
        return {
          source: { id: event.payload.userId },
          target: { id: event.payload.dormitoryId }
        }
      }
    }),
    StateTransfer.create({
      trigger: RemoveDormitoryLeader,
      current: relationExistsState,
      next: relationNotExistsState,
      computeTarget: async function(this: Controller, event) {
        // Find existing relation to remove by userId
        const relation = await this.system.storage.findOne(
          UserDormitoryLeaderRelation.name,
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }),
          undefined,
          ['id']
        )
        return relation
      }
    })
  ],
  defaultState: relationNotExistsState
})

// Entity: User - Transform computation for creation
User.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateUser') {
      return {
        username: event.payload.username,  // Set initial username
        password: event.payload.password,  // Should be hashed in production
        email: event.payload.email,
        name: event.payload.name,
        points: 100,  // Initial points
        role: event.payload.role || 'resident',
        createdAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    }
    if (event.interactionName === 'Registration') {
      return {
        username: event.payload.username,  // Set initial username
        password: event.payload.password,  // Should be hashed in production
        email: event.payload.email,
        name: event.payload.name,
        points: 100,  // Initial points
        role: 'resident',  // Registration always creates residents
        createdAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    }
    return null
  }
})

// Entity: Dormitory - Transform computation for creation  
// Also creates Bed entities and DormitoryBedsRelation
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateDormitory') {
      const dormitory = {
        name: event.payload.name,
        capacity: event.payload.capacity,
        floor: event.payload.floor,
        building: event.payload.building,
        createdAt: Math.floor(Date.now() / 1000),
        isDeleted: false,
        occupiedBeds: 0
      }
      
      // Create beds through the relation property
      const beds = []
      for (let i = 1; i <= event.payload.capacity; i++) {
        beds.push({
          bedNumber: `${i}`,
          isOccupied: false,
          createdAt: Math.floor(Date.now() / 1000)
        })
      }
      
      // Return dormitory with beds property to create the relation
      return {
        ...dormitory,
        beds: beds  // This will create Bed entities and DormitoryBedsRelation
      }
    }
    return null
  }
})

// Entity: PointDeduction - Transform computation for creation
// Also creates UserPointDeductionsRelation
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'DeductPoints' || event.interactionName === 'DeductResidentPoints') {
      return {
        reason: event.payload.reason,
        points: event.payload.points,
        description: event.payload.description,
        createdAt: Math.floor(Date.now() / 1000),
        createdBy: event.user.id,
        user: { id: event.payload.userId }  // This will create UserPointDeductionsRelation
      }
    }
    return null
  }
})

// Entity: RemovalRequest - Transform computation for creation
// Also creates UserRemovalRequestsRelation and DormitoryLeaderRemovalRequestsRelation
RemovalRequest.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'SubmitRemovalRequest') {
      return {
        reason: event.payload.reason,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        targetUser: { id: event.payload.userId },  // This will create UserRemovalRequestsRelation
        requestedBy: { id: event.user.id }  // This will create DormitoryLeaderRemovalRequestsRelation
      }
    }
    return null
  }
})

// Relation: UserBedRelation - StateMachine computation for creation and deletion
const userBedNotExistsState = StateNode.create({
  name: 'relationNotExists',
  computeValue: () => null
})

const userBedExistsState = StateNode.create({
  name: 'relationExists',
  computeValue: () => ({
    assignedAt: Math.floor(Date.now() / 1000)
  })
})

UserBedRelation.computation = StateMachine.create({
  states: [userBedNotExistsState, userBedExistsState],
  transfers: [
    StateTransfer.create({
      trigger: AssignUserToBed,
      current: userBedNotExistsState,
      next: userBedExistsState,
      computeTarget: (event) => ({
        source: { id: event.payload.userId },
        target: { id: event.payload.bedId }
      })
    }),
    StateTransfer.create({
      trigger: RemoveUserFromBed,
      current: userBedExistsState,
      next: userBedNotExistsState,
      computeTarget: async function(this: Controller, event) {
        const relation = await this.system.storage.findOne(
          UserBedRelation.name,
          MatchExp.atom({
            key: 'source.id',
            value: ['=', event.payload.userId]
          }),
          undefined,
          ['id']
        )
        return relation
      }
    })
  ],
  defaultState: userBedNotExistsState
})

// Property: User.username - StateMachine computation for updates only
const usernameState = StateNode.create({
  name: 'username',
  computeValue: (lastValue, event) => {
    // For UpdateUsername, set new username
    if (event?.interactionName === 'UpdateUsername') {
      return event.payload.newUsername
    }
    // Preserve existing value
    return lastValue
  }
})

User.properties.find(p => p.name === 'username').computation = StateMachine.create({
  states: [usernameState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateUsername,
      current: usernameState,
      next: usernameState,
      computeTarget: (event) => ({ id: event.user.id })
    })
  ],
  defaultState: usernameState
})

// Property: User.password - StateMachine computation for updates
const passwordState = StateNode.create({
  name: 'password',
  computeValue: (lastValue, event) => {
    // For ChangePassword, set new password (should be hashed in production)
    if (event?.interactionName === 'ChangePassword') {
      return event.payload.newPassword
    }
    // Preserve existing value
    return lastValue
  }
})

User.properties.find(p => p.name === 'password').computation = StateMachine.create({
  states: [passwordState],
  transfers: [
    StateTransfer.create({
      trigger: ChangePassword,
      current: passwordState,
      next: passwordState,
      computeTarget: (event) => ({ id: event.user.id })
    })
  ],
  defaultState: passwordState
})

// Property: User.email - StateMachine computation for updates
const emailState = StateNode.create({
  name: 'email',
  computeValue: (lastValue, event) => {
    // For UpdateProfile, set new email
    if (event?.interactionName === 'UpdateProfile' && event.payload.email) {
      return event.payload.email
    }
    // Preserve existing value (set by CreateUser/Registration in entity computation)
    return lastValue
  }
})

User.properties.find(p => p.name === 'email').computation = StateMachine.create({
  states: [emailState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateProfile,
      current: emailState,
      next: emailState,
      computeTarget: (event) => ({ id: event.user.id })
    })
  ],
  defaultState: emailState
})

// Property: User.name - StateMachine computation for updates
const nameState = StateNode.create({
  name: 'name',
  computeValue: (lastValue, event) => {
    // For UpdateProfile, set new name
    if (event?.interactionName === 'UpdateProfile' && event.payload.name) {
      return event.payload.name
    }
    // Preserve existing value (set by CreateUser/Registration in entity computation)
    return lastValue
  }
})

User.properties.find(p => p.name === 'name').computation = StateMachine.create({
  states: [nameState],
  transfers: [
    StateTransfer.create({
      trigger: UpdateProfile,
      current: nameState,
      next: nameState,
      computeTarget: (event) => ({ id: event.user.id })
    })
  ],
  defaultState: nameState
})

// Property: User.role - StateMachine computation for role transitions
const roleState = StateNode.create({
  name: 'role',
  computeValue: (lastValue, event) => {
    // AssignDormitoryLeader: changes role to 'dormitoryLeader'
    if (event?.interactionName === 'AssignDormitoryLeader') {
      return 'dormitoryLeader'
    }
    // RemoveDormitoryLeader: changes role back to 'resident'
    if (event?.interactionName === 'RemoveDormitoryLeader') {
      return 'resident'
    }
    // PromoteToAdmin: changes role to 'admin'
    if (event?.interactionName === 'PromoteToAdmin') {
      return 'admin'
    }
    // Preserve existing value (set by CreateUser/Registration in entity computation)
    return lastValue
  }
})

User.properties.find(p => p.name === 'role').computation = StateMachine.create({
  states: [roleState],
  transfers: [
    StateTransfer.create({
      trigger: AssignDormitoryLeader,
      current: roleState,
      next: roleState,
      computeTarget: (event) => ({ id: event.payload.userId })
    }),
    StateTransfer.create({
      trigger: RemoveDormitoryLeader,
      current: roleState,
      next: roleState,
      computeTarget: (event) => ({ id: event.payload.userId })
    }),
    StateTransfer.create({
      trigger: PromoteToAdmin,
      current: roleState,
      next: roleState,
      computeTarget: (event) => ({ id: event.payload.userId })
    })
  ],
  defaultState: roleState
})

// Property: User.points - StateMachine computation for penalty points
const pointsState = StateNode.create({
  name: 'points',
  computeValue: (lastValue, event) => {
    // For DeductPoints or DeductResidentPoints, reduce points
    if (event?.interactionName === 'DeductPoints' || event?.interactionName === 'DeductResidentPoints') {
      const currentPoints = typeof lastValue === 'number' ? lastValue : 100
      const deduction = event.payload.points || 0
      // Ensure points never go below 0
      return Math.max(0, currentPoints - deduction)
    }
    // Preserve existing value (set by CreateUser/Registration in entity computation)
    return typeof lastValue === 'number' ? lastValue : 100
  }
})

User.properties.find(p => p.name === 'points').computation = StateMachine.create({
  states: [pointsState],
  transfers: [
    StateTransfer.create({
      trigger: DeductPoints,
      current: pointsState,
      next: pointsState,
      computeTarget: (event) => ({ id: event.payload.userId })
    }),
    StateTransfer.create({
      trigger: DeductResidentPoints,
      current: pointsState,
      next: pointsState,
      computeTarget: (event) => ({ id: event.payload.userId })
    })
  ],
  defaultState: pointsState
})

