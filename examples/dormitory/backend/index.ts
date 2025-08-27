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
    Property.create({ 
      name: 'points', 
      type: 'number',
      defaultValue: () => 100
    }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'resident'
    }),
    Property.create({ 
      name: 'createdAt', 
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

// User entity Transform computation - creates User from interactions
User.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: async function(this: Controller, event: any) {
    if (event.interactionName === 'CreateUser') {
      return {
        username: event.payload.username,
        password: event.payload.password,
        email: event.payload.email,
        name: event.payload.name,
        role: event.payload.role || 'resident',
        points: 100,
        createdAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    } else if (event.interactionName === 'Registration') {
      return {
        username: event.payload.username,
        password: event.payload.password,
        email: event.payload.email,
        name: event.payload.name,
        role: 'resident',
        points: 100,
        createdAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
    }
    return null
  }
})

// Dormitory entity Transform computation - creates Dormitory from CreateDormitory interaction
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: async function(this: Controller, event: any) {
    if (event.interactionName === 'CreateDormitory') {
      // Store the dormitory data for later reference
      const dormitoryData = {
        name: event.payload.name,
        capacity: event.payload.capacity,
        floor: event.payload.floor,
        building: event.payload.building,
        occupiedBeds: 0,
        createdAt: Math.floor(Date.now() / 1000),
        isDeleted: false
      }
      
      // After dormitory is created, we also need to create beds for it
      // This will be handled by a separate Bed computation
      return dormitoryData
    }
    return null
  }
})

// Bed entity Transform computation - creates Beds when Dormitory is created
Bed.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: async function(this: Controller, event: any) {
    if (event.interactionName === 'CreateDormitory') {
      const capacity = event.payload.capacity
      const beds = []
      
      // Create beds based on dormitory capacity
      for (let i = 1; i <= capacity; i++) {
        beds.push({
          bedNumber: `${i}`,
          isOccupied: false,
          createdAt: Math.floor(Date.now() / 1000)
        })
      }
      
      return beds // Returns array to create multiple beds
    }
    return null
  }
})

// DormitoryBedsRelation Transform computation - creates relations when Dormitory and Beds are created
DormitoryBedsRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: async function(this: Controller, event: any) {
    if (event.interactionName === 'CreateDormitory') {
      // After dormitory and beds are created, the system will have their IDs
      // We need to find the created dormitory and beds to establish relations
      
      // Find the dormitory that was just created
      const dormitory = await this.system.storage.findOne(
        'Dormitory',
        MatchExp.atom({ key: 'name', value: ['=', event.payload.name] })
          .and({ key: 'capacity', value: ['=', event.payload.capacity] })
          .and({ key: 'floor', value: ['=', event.payload.floor] })
          .and({ key: 'building', value: ['=', event.payload.building] }),
        undefined,
        ['id']
      )
      
      if (!dormitory) return null
      
      // Find all beds that were just created (they should have the same createdAt time)
      const currentTime = Math.floor(Date.now() / 1000)
      const beds = await this.system.storage.find(
        'Bed',
        MatchExp.atom({ key: 'createdAt', value: ['>=', currentTime - 2] }), // Within 2 seconds
        undefined,
        ['id'],
        { limit: event.payload.capacity }
      )
      
      if (!beds || beds.length === 0) return null
      
      // Create relations between dormitory and beds
      const relations = beds.map(bed => ({
        source: dormitory,
        target: bed,
        assignedAt: Math.floor(Date.now() / 1000)
      }))
      
      return relations
    }
    return null
  }
})
