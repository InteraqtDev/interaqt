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
  StateMachine,
  StateNode,
  StateTransfer,
  Count,
  Summation,
  Transform,
  Activity,
  InteractionEventEntity,
  Controller,
  MatchExp,
  BoolExp
} from 'interaqt'

// ================== ENTITIES ==================

// User entity - system users with different roles
const User = Entity.create({
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
      name: 'phone',
      type: 'string',
      defaultValue: () => ''
    }),
    Property.create({
      name: 'role',
      type: 'string'
      // Managed by StateMachine computation
    }),
    Property.create({
      name: 'status',
      type: 'string'
      // Managed by StateMachine computation
    }),
    Property.create({
      name: 'points',
      type: 'number'
      // Managed by StateMachine computation
    }),
    Property.create({
      name: 'joinedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'totalDeductions',
      type: 'number'
      // will have Summation computation later
    }),
    Property.create({
      name: 'deductionCount',
      type: 'number'
      // will have Count computation later
    })
  ]
})

// Dormitory entity - dormitory rooms that can house multiple students
const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({
      name: 'name',
      type: 'string'
    }),
    Property.create({
      name: 'capacity',
      type: 'number'
    }),
    Property.create({
      name: 'floor',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'building',
      type: 'string',
      defaultValue: () => ''
    }),
    Property.create({
      name: 'status',
      type: 'string',
      computed: function(record) {
        // computed function receives the record as parameter
        const capacity = record.capacity || 0
        const occupancy = record.occupancy || 0
        
        // Check if dormitory is full
        if (capacity > 0 && occupancy >= capacity) {
          return 'full'
        }
        return 'available'
      }
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'occupancy',
      type: 'number'
      // will have Count computation later
    }),
    Property.create({
      name: 'availableBeds',
      type: 'number',
      computed: function(record) {
        // computed function receives the record as parameter
        const capacity = record.capacity || 0
        const occupancy = record.occupancy || 0
        return Math.max(0, capacity - occupancy)
      }
    })
  ]
})

// Bed entity - individual bed within a dormitory
const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({
      name: 'bedNumber',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string'
      // Managed by StateMachine computation (no defaultValue)
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// PointDeduction entity - record of points deducted from a user
const PointDeduction = Entity.create({
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
      name: 'category',
      type: 'string'
    }),
    Property.create({
      name: 'occurredAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'recordedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// EvictionRequest entity - request to evict a user from dormitory
const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
  properties: [
    Property.create({
      name: 'reason',
      type: 'string'
    }),
    Property.create({
      name: 'totalPoints',
      type: 'number'
    }),
    Property.create({
      name: 'status',
      type: 'string'
      // Managed by StateMachine computation (no defaultValue)
    }),
    Property.create({
      name: 'requestedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'processedAt',
      type: 'string'
      // Managed by StateMachine computation (no defaultValue)
    }),
    Property.create({
      name: 'adminComment',
      type: 'string'
      // Will be set when ApproveEviction or RejectEviction is executed
    })
  ]
})

// ================== RELATIONS ==================

// UserDormitoryRelation - assigns users to their dormitory (n:1)
const UserDormitoryRelation = Relation.create({
  name: 'UserDormitoryRelation',
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1',
  properties: [
    Property.create({
      name: 'assignedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// UserBedRelation - assigns users to their specific bed (1:1)
const UserBedRelation = Relation.create({
  name: 'UserBedRelation',
  source: User,
  sourceProperty: 'bed',
  target: Bed,
  targetProperty: 'occupant',
  type: '1:1',
  properties: [
    Property.create({
      name: 'occupiedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// DormitoryBedRelation - links dormitories to their beds (1:n)
const DormitoryBedRelation = Relation.create({
  name: 'DormitoryBedRelation',
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n',
  properties: []
})

// DormitoryDormHeadRelation - designates the head of a dormitory (1:1)
const DormitoryDormHeadRelation = Relation.create({
  name: 'DormitoryDormHeadRelation',
  source: Dormitory,
  sourceProperty: 'dormHead',
  target: User,
  targetProperty: 'managedDormitory',
  type: '1:1',
  properties: [
    Property.create({
      name: 'appointedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// UserPointDeductionRelation - links users to their point deduction records (1:n)
const UserPointDeductionRelation = Relation.create({
  name: 'UserPointDeductionRelation',
  source: User,
  sourceProperty: 'pointDeductions',
  target: PointDeduction,
  targetProperty: 'user',
  type: '1:n',
  properties: []
})

// PointDeductionRecorderRelation - links point deductions to the user who recorded them (n:1)
const PointDeductionRecorderRelation = Relation.create({
  name: 'PointDeductionRecorderRelation',
  source: PointDeduction,
  sourceProperty: 'recorder',
  target: User,
  targetProperty: 'recordedDeductions',
  type: 'n:1',
  properties: []
})

// EvictionRequestTargetUserRelation - links eviction requests to the target user (n:1)
const EvictionRequestTargetUserRelation = Relation.create({
  name: 'EvictionRequestTargetUserRelation',
  source: EvictionRequest,
  sourceProperty: 'targetUser',
  target: User,
  targetProperty: 'evictionRequests',
  type: 'n:1',
  properties: []
})

// EvictionRequestRequesterRelation - links eviction requests to the requester (n:1)
const EvictionRequestRequesterRelation = Relation.create({
  name: 'EvictionRequestRequesterRelation',
  source: EvictionRequest,
  sourceProperty: 'requester',
  target: User,
  targetProperty: 'submittedEvictionRequests',
  type: 'n:1',
  properties: []
})

// EvictionRequestApproverRelation - links eviction requests to the admin who approved/rejected them (n:1)
const EvictionRequestApproverRelation = Relation.create({
  name: 'EvictionRequestApproverRelation',
  source: EvictionRequest,
  sourceProperty: 'approver',
  target: User,
  targetProperty: 'processedEvictionRequests',
  type: 'n:1',
  properties: [
    Property.create({
      name: 'approvedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
})

// ================== CONDITIONS ==================

// Role-based permission conditions
const AdminRole = Condition.create({
  name: 'AdminRole',
  content: async function(this: Controller, event: any) {
    return event.user?.role === 'admin';
  }
});

const DormHeadRole = Condition.create({
  name: 'DormHeadRole',
  content: async function(this: Controller, event: any) {
    return event.user?.role === 'dormHead';
  }
});

const AdminOrDormHead = Condition.create({
  name: 'AdminOrDormHead',
  content: async function(this: Controller, event: any) {
    const role = event.user?.role;
    return role === 'admin' || role === 'dormHead';
  }
});

const AuthenticatedUser = Condition.create({
  name: 'AuthenticatedUser',
  content: async function(this: Controller, event: any) {
    return !!event.user && !!event.user.id;
  }
});

// Business rule conditions for CreateDormitory
const ValidDormitoryCapacity = Condition.create({
  name: 'ValidDormitoryCapacity',
  content: async function(this: Controller, event: any) {
    const capacity = event.payload?.capacity;
    return capacity >= 4 && capacity <= 6;
  }
});

const UniqueDormitoryName = Condition.create({
  name: 'UniqueDormitoryName',
  content: async function(this: Controller, event: any) {
    const name = event.payload?.name;
    if (!name) return false;
    
    const existing = await this.system.storage.findOne('Dormitory',
      MatchExp.atom({ key: 'name', value: ['=', name] }),
      undefined,
      ['id']
    );
    
    return !existing;
  }
});

// Business rule conditions for AssignUserToDormitory
const UserNotAssigned = Condition.create({
  name: 'UserNotAssigned',
  content: async function(this: Controller, event: any) {
    const userId = event.payload?.userId;
    if (!userId) return false;
    
    const existingRelation = await this.system.storage.findOne('UserDormitoryRelation',
      MatchExp.atom({ key: 'source', value: ['=', { id: userId }] }),
      undefined,
      ['id']
    );
    
    return !existingRelation;
  }
});

const BedIsVacant = Condition.create({
  name: 'BedIsVacant',
  content: async function(this: Controller, event: any) {
    const bedId = event.payload?.bedId;
    if (!bedId) return false;
    
    const bed = await this.system.storage.findOne('Bed',
      MatchExp.atom({ key: 'id', value: ['=', bedId] }),
      undefined,
      ['status']
    );
    
    return bed?.status === 'vacant';
  }
});

const BedBelongsToDormitory = Condition.create({
  name: 'BedBelongsToDormitory',
  content: async function(this: Controller, event: any) {
    const bedId = event.payload?.bedId;
    const dormitoryId = event.payload?.dormitoryId;
    if (!bedId || !dormitoryId) return false;
    
    const relation = await this.system.storage.findOne('DormitoryBedRelation',
      BoolExp.and(
        MatchExp.atom({ key: 'source', value: ['=', { id: dormitoryId }] }),
        MatchExp.atom({ key: 'target', value: ['=', { id: bedId }] })
      ),
      undefined,
      ['id']
    );
    
    return !!relation;
  }
});

// Business rule conditions for AppointDormHead
const UserInTargetDormitory = Condition.create({
  name: 'UserInTargetDormitory',
  content: async function(this: Controller, event: any) {
    const userId = event.payload?.userId;
    const dormitoryId = event.payload?.dormitoryId;
    if (!userId || !dormitoryId) return false;
    
    const relation = await this.system.storage.findOne('UserDormitoryRelation',
      BoolExp.and(
        MatchExp.atom({ key: 'source', value: ['=', { id: userId }] }),
        MatchExp.atom({ key: 'target', value: ['=', { id: dormitoryId }] })
      ),
      undefined,
      ['id']
    );
    
    return !!relation;
  }
});

// Business rule conditions for RecordPointDeduction
const DormHeadSameDormitory = Condition.create({
  name: 'DormHeadSameDormitory',
  content: async function(this: Controller, event: any) {
    // Admin can deduct from anyone
    if (event.user?.role === 'admin') return true;
    
    // DormHead must be in same dormitory as target
    if (event.user?.role === 'dormHead') {
      const targetUserId = event.payload?.targetUserId;
      if (!targetUserId) return false;
      
      // Get dormHead's dormitory
      const dormHeadRelation = await this.system.storage.findOne('UserDormitoryRelation',
        MatchExp.atom({ key: 'source', value: ['=', event.user] }),
        undefined,
        ['target']
      );
      
      if (!dormHeadRelation) return false;
      
      // Check if target user is in same dormitory
      const targetRelation = await this.system.storage.findOne('UserDormitoryRelation',
        BoolExp.and(
          MatchExp.atom({ key: 'source', value: ['=', { id: targetUserId }] }),
          MatchExp.atom({ key: 'target', value: ['=', dormHeadRelation.target] })
        ),
        undefined,
        ['id']
      );
      
      return !!targetRelation;
    }
    
    return false;
  }
});

const ValidPointDeduction = Condition.create({
  name: 'ValidPointDeduction',
  content: async function(this: Controller, event: any) {
    const points = event.payload?.points;
    return points > 0;
  }
});

// Business rule conditions for RequestEviction
const TargetUserLowPoints = Condition.create({
  name: 'TargetUserLowPoints',
  content: async function(this: Controller, event: any) {
    const targetUserId = event.payload?.targetUserId;
    if (!targetUserId) return false;
    
    const user = await this.system.storage.findOne('User',
      MatchExp.atom({ key: 'id', value: ['=', targetUserId] }),
      undefined,
      ['points']
    );
    
    return user?.points < 30;
  }
});

const NoPendingEvictionRequest = Condition.create({
  name: 'NoPendingEvictionRequest',
  content: async function(this: Controller, event: any) {
    const targetUserId = event.payload?.targetUserId;
    if (!targetUserId) return false;
    
    // Check for existing pending request for this user
    const existingRequest = await this.system.storage.find('EvictionRequest',
      MatchExp.atom({ key: 'status', value: ['=', 'pending'] }),
      undefined,
      ['id', 'targetUser']
    );
    
    // Check if any of the pending requests are for this user
    for (const request of existingRequest) {
      const targetRelation = await this.system.storage.findOne('EvictionRequestTargetUserRelation',
        BoolExp.and(
          MatchExp.atom({ key: 'source', value: ['=', request] }),
          MatchExp.atom({ key: 'target', value: ['=', { id: targetUserId }] })
        ),
        undefined,
        ['id']
      );
      
      if (targetRelation) return false;
    }
    
    return true;
  }
});

// Business rule conditions for ApproveEviction/RejectEviction
const RequestIsPending = Condition.create({
  name: 'RequestIsPending',
  content: async function(this: Controller, event: any) {
    const requestId = event.payload?.requestId;
    if (!requestId) return false;
    
    const request = await this.system.storage.findOne('EvictionRequest',
      MatchExp.atom({ key: 'id', value: ['=', requestId] }),
      undefined,
      ['status', 'processedAt']
    );
    
    return request?.status === 'pending' && !request?.processedAt;
  }
});

// Query permission conditions
const UserHasDormitory = Condition.create({
  name: 'UserHasDormitory',
  content: async function(this: Controller, event: any) {
    const relation = await this.system.storage.findOne('UserDormitoryRelation',
      MatchExp.atom({ key: 'source', value: ['=', event.user] }),
      undefined,
      ['id']
    );
    
    return !!relation;
  }
});

const CanViewDormitory = Condition.create({
  name: 'CanViewDormitory',
  content: async function(this: Controller, event: any) {
    // Admin can view any dormitory
    if (event.user?.role === 'admin') return true;
    
    const dormitoryId = event.payload?.dormitoryId;
    
    // If no dormitory specified, user must have one
    if (!dormitoryId) {
      return await UserHasDormitory.content.call(this, event);
    }
    
    // Otherwise, check if user is in that dormitory
    const relation = await this.system.storage.findOne('UserDormitoryRelation',
      BoolExp.and(
        MatchExp.atom({ key: 'source', value: ['=', event.user] }),
        MatchExp.atom({ key: 'target', value: ['=', { id: dormitoryId }] })
      ),
      undefined,
      ['id']
    );
    
    if (relation) return true;
    
    // Or if user is dormHead of that dormitory
    if (event.user?.role === 'dormHead') {
      const dormHeadRelation = await this.system.storage.findOne('DormitoryDormHeadRelation',
        BoolExp.and(
          MatchExp.atom({ key: 'source', value: ['=', { id: dormitoryId }] }),
          MatchExp.atom({ key: 'target', value: ['=', event.user] })
        ),
        undefined,
        ['id']
      );
      
      return !!dormHeadRelation;
    }
    
    return false;
  }
});

// ================== INTERACTIONS ==================

// CreateDormitory - Admin creates a new dormitory with beds
const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        required: true
      }),
      PayloadItem.create({
        name: 'capacity',
        required: true
      }),
      PayloadItem.create({
        name: 'floor',
        required: false
      }),
      PayloadItem.create({
        name: 'building',
        required: false
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(ValidDormitoryCapacity))
      .and(BoolExp.atom(UniqueDormitoryName))
  })
})

// AssignUserToDormitory - Admin assigns a student to a dormitory bed
const AssignUserToDormitory = Interaction.create({
  name: 'AssignUserToDormitory',
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
        name: 'bedId',
        required: true
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(UserNotAssigned))
      .and(BoolExp.atom(BedIsVacant))
      .and(BoolExp.atom(BedBelongsToDormitory))
  })
})

// AppointDormHead - Admin appoints a user as dormitory head
const AppointDormHead = Interaction.create({
  name: 'AppointDormHead',
  action: Action.create({ name: 'appoint' }),
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
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(UserInTargetDormitory))
  })
})

// RecordPointDeduction - Record a point deduction for violations
const RecordPointDeduction = Interaction.create({
  name: 'RecordPointDeduction',
  action: Action.create({ name: 'deduct' }),
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
        name: 'points',
        required: true
      }),
      PayloadItem.create({
        name: 'category',
        required: true
      }),
      PayloadItem.create({
        name: 'occurredAt',
        required: false
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminOrDormHead)
      .and(BoolExp.atom(DormHeadSameDormitory))
      .and(BoolExp.atom(ValidPointDeduction))
  })
})

// RequestEviction - DormHead requests to evict a problematic resident
const RequestEviction = Interaction.create({
  name: 'RequestEviction',
  action: Action.create({ name: 'request' }),
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
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(DormHeadRole)
      .and(BoolExp.atom(DormHeadSameDormitory))
      .and(BoolExp.atom(TargetUserLowPoints))
      .and(BoolExp.atom(NoPendingEvictionRequest))
  })
})

// ApproveEviction - Admin approves an eviction request
const ApproveEviction = Interaction.create({
  name: 'ApproveEviction',
  action: Action.create({ name: 'approve' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        required: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        required: false
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(RequestIsPending))
  })
})

// RejectEviction - Admin rejects an eviction request
const RejectEviction = Interaction.create({
  name: 'RejectEviction',
  action: Action.create({ name: 'reject' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'requestId',
        required: true
      }),
      PayloadItem.create({
        name: 'adminComment',
        required: false
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AdminRole)
      .and(BoolExp.atom(RequestIsPending))
  })
})

// Query interactions - read-only operations

// ViewMyDormitory - View current user's dormitory information
const ViewMyDormitory = Interaction.create({
  name: 'ViewMyDormitory',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AuthenticatedUser)
      .and(BoolExp.atom(UserHasDormitory))
  })
})

// ViewMyPoints - View current user's points and deduction history
const ViewMyPoints = Interaction.create({
  name: 'ViewMyPoints',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  conditions: AuthenticatedUser
})

// ViewDormitoryMembers - View members of a dormitory
const ViewDormitoryMembers = Interaction.create({
  name: 'ViewDormitoryMembers',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: false
      })
    ]
  }),
  conditions: Conditions.create({
    content: BoolExp.atom(AuthenticatedUser)
      .and(BoolExp.atom(CanViewDormitory))
  })
})

// ViewAllDormitories - View all dormitories in the system
const ViewAllDormitories = Interaction.create({
  name: 'ViewAllDormitories',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  }),
  conditions: AdminRole
})

// ================== EXPORTS ==================

export const entities = [
  User,
  Dormitory,
  Bed,
  PointDeduction,
  EvictionRequest
]

export const relations = [
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryDormHeadRelation,
  UserPointDeductionRelation,
  PointDeductionRecorderRelation,
  EvictionRequestTargetUserRelation,
  EvictionRequestRequesterRelation,
  EvictionRequestApproverRelation
]

export const interactions = [
  CreateDormitory,
  AssignUserToDormitory,
  AppointDormHead,
  RecordPointDeduction,
  RequestEviction,
  ApproveEviction,
  RejectEviction,
  ViewMyDormitory,
  ViewMyPoints,
  ViewDormitoryMembers,
  ViewAllDormitories
]

export const activities: Activity[] = []

export const dicts = []  // Global dictionaries - none needed for this system

// ================== COMPUTATIONS ==================
// Will be added using assignment pattern after exports

// === User.role StateMachine ===
// State nodes for user role transitions
const userRoleState = StateNode.create({ name: 'user' })
const dormHeadRoleState = StateNode.create({ name: 'dormHead' })

const UserRoleStateMachine = StateMachine.create({
  states: [userRoleState, dormHeadRoleState],
  defaultState: userRoleState,
  transfers: [
    StateTransfer.create({
      current: userRoleState,
      next: dormHeadRoleState,
      trigger: AppointDormHead,
      computeTarget: (event) => ({ id: event.payload.userId })
    })
    // Note: No transfer back to 'user' state - once appointed, they remain dormHead
  ]
})

// Apply computation to User.role property
User.properties.find(p => p.name === 'role').computation = UserRoleStateMachine

// === User.status StateMachine ===
// State nodes for user status transitions
const activeUserState = StateNode.create({ name: 'active' })
const inactiveUserState = StateNode.create({ name: 'inactive' })

const UserStatusStateMachine = StateMachine.create({
  states: [activeUserState, inactiveUserState],
  defaultState: activeUserState,
  transfers: [
    StateTransfer.create({
      current: activeUserState,
      next: inactiveUserState,
      trigger: ApproveEviction,
      computeTarget: async function(this: Controller, event) {
        // Get the eviction request details
        const request = await this.system.storage.findOne(
          'EvictionRequest',
          MatchExp.atom({ key: 'id', value: ['=', event.payload.requestId] }),
          undefined,
          [['targetUser', { attributeQuery: ['id'] }]]
        )
        // Return the target user who is being evicted
        return request?.targetUser ? { id: request.targetUser.id } : null
      }
    })
    // Note: No transfer back to 'active' state - once evicted, they remain inactive
  ]
})

// Apply computation to User.status property  
User.properties.find(p => p.name === 'status').computation = UserStatusStateMachine

// === User.points StateMachine ===
// This uses a single-state machine with self-transition to track point deductions
const userPointsState = StateNode.create({
  name: 'tracking',
  computeValue: (lastValue, event) => {
    // Initialize to 100 if no previous value
    if (lastValue === undefined || lastValue === null) {
      return 100
    }
    // Deduct points if this is a RecordPointDeduction event
    if (event?.interactionName === 'RecordPointDeduction') {
      const deduction = event.payload?.points || 0
      const newPoints = Math.max(0, lastValue - deduction) // Ensure points don't go below 0
      return newPoints
    }
    // Keep current value for other events
    return lastValue
  }
})

const UserPointsStateMachine = StateMachine.create({
  states: [userPointsState],
  defaultState: userPointsState,
  transfers: [
    StateTransfer.create({
      current: userPointsState,
      next: userPointsState, // Self-transition
      trigger: RecordPointDeduction,
      computeTarget: (event) => ({ id: event.payload.targetUserId })
    })
  ]
})

// Apply computation to User.points property
User.properties.find(p => p.name === 'points').computation = UserPointsStateMachine

// === PointDeduction Transform ===
// Creates PointDeduction entities from RecordPointDeduction interactions
PointDeduction.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'RecordPointDeduction') {
      return {
        reason: event.payload.reason,
        points: event.payload.points,
        category: event.payload.category,
        occurredAt: event.payload.occurredAt || new Date().toISOString(),
        recordedAt: new Date().toISOString(),
        // Relations will be created separately
        user: { id: event.payload.targetUserId },
        recorder: { id: event.user.id }
      }
    }
    return null
  }
})

// === User.totalDeductions Summation ===
// Sums all point deductions for a user
User.properties.find(p => p.name === 'totalDeductions').computation = Summation.create({
  property: 'pointDeductions',  // Use property name from UserPointDeductionRelation
  attributeQuery: ['points']  // Sum the points field from related PointDeduction entities
})

// === User.deductionCount Count ===
// Counts the number of point deductions for a user
User.properties.find(p => p.name === 'deductionCount').computation = Count.create({
  property: 'pointDeductions'  // Count related PointDeduction entities via UserPointDeductionRelation
})

// === Dormitory Transform ===
// Creates Dormitory entities from CreateDormitory interactions
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'CreateDormitory') {
      // Create Dormitory with initial values
      return {
        name: event.payload.name,
        capacity: event.payload.capacity,
        floor: event.payload.floor || 0,
        building: event.payload.building || ''
        // occupancy will be computed by Count computation
        // status and availableBeds are computed properties
      }
    }
    return null
  }
})

// Dormitory.status and Dormitory.availableBeds are now defined as computed properties directly in the Entity definition

// === Bed Transform ===
// Creates Bed entities when a Dormitory is created
Bed.computation = Transform.create({
  record: Dormitory,
  attributeQuery: ['id', 'capacity'],
  callback: function(dormitory) {
    // Create beds for the dormitory (one bed per capacity unit)
    const beds = []
    for (let i = 1; i <= dormitory.capacity; i++) {
      beds.push({
        bedNumber: i.toString().padStart(3, '0'), // Format as 001, 002, etc.
        dormitory: { id: dormitory.id }
      })
    }
    return beds
  }
})

// === Bed.status StateMachine ===
// State nodes for bed status
const vacantBedState = StateNode.create({ name: 'vacant' })
const occupiedBedState = StateNode.create({ name: 'occupied' })

const BedStatusStateMachine = StateMachine.create({
  states: [vacantBedState, occupiedBedState],
  defaultState: vacantBedState,
  transfers: [
    StateTransfer.create({
      current: vacantBedState,
      next: occupiedBedState,
      trigger: AssignUserToDormitory,
      computeTarget: (event) => ({ id: event.payload.bedId })
    })
    // When a user is evicted, bed status changes would need to be handled separately
    // This would typically be done via a separate interaction or as part of eviction cleanup
  ]
})

// Apply computation to Bed.status property
Bed.properties.find(p => p.name === 'status').computation = BedStatusStateMachine

// === EvictionRequest Transform ===
// Creates EvictionRequest entities from RequestEviction interactions
EvictionRequest.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'RequestEviction') {
      return {
        reason: event.payload.reason,
        totalPoints: event.payload.totalPoints || 0,
        requestedAt: new Date().toISOString(),
        // Relations will be created separately
        targetUser: { id: event.payload.targetUserId },
        requester: { id: event.user.id }
      }
    }
    return null
  }
})

// === EvictionRequest.status StateMachine ===
// State nodes for eviction request status
const pendingState = StateNode.create({ name: 'pending' })
const approvedState = StateNode.create({ name: 'approved' })
const rejectedState = StateNode.create({ name: 'rejected' })

const EvictionRequestStatusStateMachine = StateMachine.create({
  states: [pendingState, approvedState, rejectedState],
  defaultState: pendingState,
  transfers: [
    StateTransfer.create({
      current: pendingState,
      next: approvedState,
      trigger: ApproveEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      current: pendingState,
      next: rejectedState,
      trigger: RejectEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  ]
})

// Apply computation to EvictionRequest.status property
EvictionRequest.properties.find(p => p.name === 'status').computation = EvictionRequestStatusStateMachine

// === EvictionRequest.processedAt StateMachine ===
// Using a single-node StateMachine to record processing timestamp
const evictionProcessingState = StateNode.create({
  name: 'processedAt',
  computeValue: (lastValue, event) => {
    // Set timestamp when approved or rejected
    if (event?.interactionName === 'ApproveEviction' || 
        event?.interactionName === 'RejectEviction') {
      return new Date().toISOString()
    }
    return lastValue
  }
})

const EvictionRequestProcessedAtStateMachine = StateMachine.create({
  states: [evictionProcessingState],
  defaultState: evictionProcessingState,
  transfers: [
    StateTransfer.create({
      current: evictionProcessingState,
      next: evictionProcessingState,
      trigger: ApproveEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      current: evictionProcessingState,
      next: evictionProcessingState,
      trigger: RejectEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  ]
})

// Apply computation to EvictionRequest.processedAt property
EvictionRequest.properties.find(p => p.name === 'processedAt').computation = EvictionRequestProcessedAtStateMachine

// === UserBedRelation Transform ===
// Creates UserBedRelation when user is assigned to a bed
UserBedRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: function(event) {
    if (event.interactionName === 'AssignUserToDormitory') {
      return {
        source: { id: event.payload.userId },
        target: { id: event.payload.bedId }
      }
    }
    return null
  }
})

// === UserDormitoryRelation Transform ===
// Creates UserDormitoryRelation when user is assigned to a dormitory
UserDormitoryRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: function(event) {
    if (event.interactionName === 'AssignUserToDormitory') {
      return {
        source: { id: event.payload.userId },
        target: { id: event.payload.dormitoryId }
      }
    }
    return null
  }
})

// === Dormitory.occupancy Count ===
// Counts the number of users assigned to the dormitory
Dormitory.properties.find(p => p.name === 'occupancy').computation = Count.create({
  property: 'residents'  // Count residents via UserDormitoryRelation (targetProperty)
})

// === EvictionRequest.adminComment StateMachine ===
// Tracks admin comments on eviction requests
const adminCommentState = StateNode.create({
  name: 'comment',
  computeValue: (lastValue, event) => {
    // Set admin comment when approved or rejected
    if (event?.interactionName === 'ApproveEviction' || 
        event?.interactionName === 'RejectEviction') {
      return event.payload?.adminComment || null
    }
    return lastValue
  }
})

const EvictionRequestAdminCommentStateMachine = StateMachine.create({
  states: [adminCommentState],
  defaultState: adminCommentState,
  transfers: [
    StateTransfer.create({
      current: adminCommentState,
      next: adminCommentState,
      trigger: ApproveEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    }),
    StateTransfer.create({
      current: adminCommentState,
      next: adminCommentState,
      trigger: RejectEviction,
      computeTarget: (event) => ({ id: event.payload.requestId })
    })
  ]
})

// Apply computation to EvictionRequest.adminComment property
EvictionRequest.properties.find(p => p.name === 'adminComment').computation = EvictionRequestAdminCommentStateMachine

// === DormitoryDormHeadRelation Transform ===
// Creates DormitoryDormHeadRelation when a user is appointed as dormitory head
DormitoryDormHeadRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload'],
  callback: function(event) {
    if (event.interactionName === 'AppointDormHead') {
      return {
        source: { id: event.payload.dormitoryId },
        target: { id: event.payload.userId }
      }
    }
    return null
  }
})

// === EvictionRequestApproverRelation Transform ===
// Creates relation between eviction request and approver (admin who approved/rejected)
EvictionRequestApproverRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user'],
  callback: function(event) {
    if (event.interactionName === 'ApproveEviction' || 
        event.interactionName === 'RejectEviction') {
      return {
        evictionRequest: { id: event.payload.requestId },
        approver: { id: event.user.id }
      }
    }
    return null
  }
})