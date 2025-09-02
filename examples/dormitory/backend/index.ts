import {
  Entity,
  Property,
  Relation,
  Activity,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Dictionary
} from 'interaqt'

// =========================
// ENTITIES
// =========================

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
      name: 'role',
      type: 'string',
      defaultValue: () => 'student'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({
      name: 'behaviorScore',
      type: 'number',
      defaultValue: () => 100
      // Note: computation will be added later in Task 3.1.4
    }),
    Property.create({
      name: 'phoneNumber',
      type: 'string'
    })
  ]
})

const Dormitory = Entity.create({
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
      name: 'maxBeds',
      type: 'number'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    })
    // Note: currentOccupancy and availableBeds computations will be added later in Task 3.1.4
  ]
})

const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({
      name: 'number',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    })
    // Note: isOccupied computation will be added later in Task 3.1.4
  ]
})

const BehaviorViolation = Entity.create({
  name: 'BehaviorViolation',
  properties: [
    Property.create({
      name: 'violationType',
      type: 'string'
    }),
    Property.create({
      name: 'description',
      type: 'string'
    }),
    Property.create({
      name: 'scoreDeduction',
      type: 'number'
    }),
    Property.create({
      name: 'timestamp',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000) // Timestamps in seconds, not milliseconds
    }),
    Property.create({
      name: 'evidenceUrl',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    })
  ]
})

const EvictionRequest = Entity.create({
  name: 'EvictionRequest',
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
      name: 'requestDate',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000) // Timestamps in seconds, not milliseconds
    }),
    Property.create({
      name: 'decisionDate',
      type: 'number'
    }),
    Property.create({
      name: 'adminNotes',
      type: 'string'
    }),
    Property.create({
      name: 'supportingEvidence',
      type: 'string'
    })
  ]
})

// =========================
// RELATIONS
// =========================

const UserBedAssignment = Relation.create({
  source: User,
  sourceProperty: 'assignedBed',
  target: Bed,
  targetProperty: 'assignedUser',
  type: 'n:1', // Many users can be assigned to beds, but each user has at most one bed
  properties: [
    Property.create({
      name: 'assignmentDate',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000) // Timestamps in seconds, not milliseconds
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({
      name: 'assignedBy',
      type: 'string'
    })
  ]
})

const DormitoryLeadership = Relation.create({
  source: User,
  sourceProperty: 'ledDormitory',
  target: Dormitory,
  targetProperty: 'leader',
  type: 'n:1', // Many users can be dormitory leaders, but each user leads at most one dormitory
  properties: [
    Property.create({
      name: 'assignmentDate',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000) // Timestamps in seconds, not milliseconds
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active'
    }),
    Property.create({
      name: 'assignedBy',
      type: 'string'
    })
  ]
})

const BedDormitory = Relation.create({
  source: Bed,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'beds',
  type: 'n:1', // Many beds belong to one dormitory
  properties: [
    Property.create({
      name: 'createdDate',
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000) // Timestamps in seconds, not milliseconds
    })
  ]
})

const UserViolationRelation = Relation.create({
  source: User,
  sourceProperty: 'violations',
  target: BehaviorViolation,
  targetProperty: 'violator',
  type: '1:n', // One user can have many violations
  properties: []
})

const ViolationReporterRelation = Relation.create({
  source: User,
  sourceProperty: 'reportedViolations',
  target: BehaviorViolation,
  targetProperty: 'reporter',
  type: '1:n', // One user can report many violations
  properties: [
    Property.create({
      name: 'reporterRole',
      type: 'string'
    })
  ]
})

const EvictionTargetRelation = Relation.create({
  source: User,
  sourceProperty: 'evictionRequests',
  target: EvictionRequest,
  targetProperty: 'targetUser',
  type: '1:n', // One user can be target of many eviction requests
  properties: []
})

const EvictionRequesterRelation = Relation.create({
  source: User,
  sourceProperty: 'submittedEvictionRequests',
  target: EvictionRequest,
  targetProperty: 'requester',
  type: '1:n', // One user can submit many eviction requests
  properties: [
    Property.create({
      name: 'requesterRole',
      type: 'string'
    })
  ]
})

const EvictionDeciderRelation = Relation.create({
  source: User,
  sourceProperty: 'decidedEvictionRequests',
  target: EvictionRequest,
  targetProperty: 'decider',
  type: '1:n', // One user can decide on many eviction requests
  properties: [
    Property.create({
      name: 'decisionRole',
      type: 'string'
    })
  ]
})

// =========================
// DICTIONARIES
// =========================

const SystemConfig = Dictionary.create({
  name: 'SystemConfig',
  type: 'object',
  collection: false,
  defaultValue: () => ({
    evictionScoreThreshold: 50,
    maxBedsPerDormitory: 6,
    minBedsPerDormitory: 4
  })
})

const ViolationRules = Dictionary.create({
  name: 'ViolationRules',
  type: 'object',
  collection: false,
  defaultValue: () => ({
    noiseViolation: 10,
    cleanlinessViolation: 15,
    guestPolicyViolation: 20
  })
})

// Note: SystemStats dictionary with computations will be added later in Task 3.1.4

// =========================
// INTERACTIONS
// =========================

// Core Business Logic Interactions

const CreateDormitory = Interaction.create({
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
        name: 'bedCount',
        required: true
      })
    ]
  })
})

const AssignUserToBed = Interaction.create({
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

const RemoveUserFromDormitory = Interaction.create({
  name: 'removeUserFromDormitory',
  action: Action.create({ name: 'remove' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      })
    ]
  })
})

const RecordBehaviorViolation = Interaction.create({
  name: 'recordBehaviorViolation',
  action: Action.create({ name: 'record' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'violationType',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        required: true
      }),
      PayloadItem.create({
        name: 'evidenceUrl',
        required: false
      })
    ]
  })
})

const ModifyBehaviorScore = Interaction.create({
  name: 'modifyBehaviorScore',
  action: Action.create({ name: 'modify' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'newScore',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      })
    ]
  })
})

const AssignDormitoryLeader = Interaction.create({
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

const RemoveDormitoryLeader = Interaction.create({
  name: 'removeDormitoryLeader',
  action: Action.create({ name: 'remove' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      }),
      PayloadItem.create({
        name: 'reason',
        required: true
      })
    ]
  })
})

const SubmitEvictionRequest = Interaction.create({
  name: 'submitEvictionRequest',
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
      }),
      PayloadItem.create({
        name: 'supportingEvidence',
        required: false
      })
    ]
  })
})

const ProcessEvictionRequest = Interaction.create({
  name: 'processEvictionRequest',
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
        name: 'adminNotes',
        required: true
      })
    ]
  })
})

// Read Interactions

const ViewDormitoryFacilities = Interaction.create({
  name: 'viewDormitoryFacilities',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'filters',
        required: false
      })
    ]
  })
})

const ViewUserBehaviorScores = Interaction.create({
  name: 'viewUserBehaviorScores',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'dormitoryId',
        required: true
      })
    ]
  })
})

const ViewManagementHierarchy = Interaction.create({
  name: 'viewManagementHierarchy',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: []
  })
})

const ViewEvictionRequests = Interaction.create({
  name: 'viewEvictionRequests',
  action: Action.create({ name: 'view' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'status',
        required: false
      })
    ]
  })
})

// Support/Validation Interactions

const ValidateDormitoryCreation = Interaction.create({
  name: 'validateDormitoryCreation',
  action: Action.create({ name: 'validate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'name',
        required: true
      })
    ]
  })
})

const CheckUserAssignmentEligibility = Interaction.create({
  name: 'checkUserAssignmentEligibility',
  action: Action.create({ name: 'check' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  })
})

const VerifyBedAvailability = Interaction.create({
  name: 'verifyBedAvailability',
  action: Action.create({ name: 'verify' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'bedId',
        required: true
      })
    ]
  })
})

const GetCurrentBehaviorScore = Interaction.create({
  name: 'getCurrentBehaviorScore',
  action: Action.create({ name: 'get' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  })
})

const ValidateEvictionEligibility = Interaction.create({
  name: 'validateEvictionEligibility',
  action: Action.create({ name: 'validate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'userId',
        required: true
      })
    ]
  })
})

// =========================
// COMPUTATIONS
// =========================

// Import computation types
import {
  Transform,
  StateMachine,
  StateNode,
  StateTransfer,
  Count,
  Summation,
  Any,
  Custom,
  InteractionEventEntity
} from 'interaqt'

// User entity computation - Transform for creation from InteractionEventEntity
User.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    // Handle various user creation scenarios
    if (event.interactionName === 'createUser' || 
        event.interactionName === 'CreateUser' ||
        event.interactionName === 'registerUser' ||
        event.interactionName === 'RegisterUser') {
      return {
        name: event.payload.name,
        email: event.payload.email,
        role: event.payload.role || 'student',  // Default to student
        status: 'active',  // Default to active
        phoneNumber: event.payload.phoneNumber
      };
    }
    return null;
  }
})

// Export all entities, relations, and other components
export const entities = [User, Dormitory, Bed, BehaviorViolation, EvictionRequest]
export const relations = [
  UserBedAssignment,
  DormitoryLeadership,
  BedDormitory,
  UserViolationRelation,
  ViolationReporterRelation,
  EvictionTargetRelation,
  EvictionRequesterRelation,
  EvictionDeciderRelation
]

// Export individual relations for testing
export { BedDormitory, UserViolationRelation, ViolationReporterRelation, EvictionTargetRelation, EvictionRequesterRelation }
export const activities = []
export const interactions = [
  CreateDormitory,
  AssignUserToBed,
  RemoveUserFromDormitory,
  RecordBehaviorViolation,
  ModifyBehaviorScore,
  AssignDormitoryLeader,
  RemoveDormitoryLeader,
  SubmitEvictionRequest,
  ProcessEvictionRequest,
  ViewDormitoryFacilities,
  ViewUserBehaviorScores,
  ViewManagementHierarchy,
  ViewEvictionRequests,
  ValidateDormitoryCreation,
  CheckUserAssignmentEligibility,
  VerifyBedAvailability,
  GetCurrentBehaviorScore,
  ValidateEvictionEligibility
]
export const dicts = [SystemConfig, ViolationRules]

// =========================
// COMPUTATION ASSIGNMENTS
// =========================

// Dormitory entity computation - Transform for creation from InteractionEventEntity
// Also creates Bed entities via the 'beds' relation property (_parent:Dormitory pattern)
Dormitory.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    // Handle dormitory creation from createDormitory interaction (I101)
    if (event.interactionName === 'createDormitory') {
      const bedCount = event.payload.bedCount;
      const beds = [];
      
      // Create bedCount number of beds to be created via relation
      for (let i = 1; i <= bedCount; i++) {
        beds.push({
          number: i.toString(),  // Generated sequence: "1", "2", "3", etc.
          status: 'active'  // Default to active status
        });
      }
      
      // Return dormitory object with beds to be created via BedDormitory relation
      return {
        name: event.payload.name,
        location: event.payload.location,
        maxBeds: event.payload.bedCount,  // Map bedCount to maxBeds
        status: 'active',  // Default to active status
        beds: beds  // Create beds via the 'beds' relation property
      };
    }
    return null;
  }
})

// BehaviorViolation entity computation - Transform for creation from InteractionEventEntity
// Also creates UserViolationRelation and ViolationReporterRelation via relation properties
BehaviorViolation.computation = Transform.create({
  record: InteractionEventEntity,
  callback: async function(event) {
    // Handle behavior violation recording from recordBehaviorViolation interaction (I201)
    if (event.interactionName === 'recordBehaviorViolation') {
      // Get violation rules to lookup score deduction
      const violationRules = await this.system.storage.get('DICTIONARY_RECORD', 'ViolationRules', {
        noiseViolation: 10,
        cleanlinessViolation: 15,
        guestPolicyViolation: 20
      });
      
      const violationType = event.payload.violationType;
      const scoreDeduction = violationRules[violationType] || 0;
      
      // Return BehaviorViolation object with relations
      return {
        violationType: violationType,
        description: event.payload.description,
        scoreDeduction: scoreDeduction,  // Looked up from ViolationRules
        timestamp: Math.floor(Date.now() / 1000),  // Current timestamp in seconds
        evidenceUrl: event.payload.evidenceUrl,
        status: 'active',  // Default to active status
        violator: { id: event.payload.userId },  // Create UserViolationRelation via 'violator' property
        reporter: event.user  // Create ViolationReporterRelation via 'reporter' property
      };
    }
    return null;
  }
})

// EvictionRequest entity computation - Transform for creation from InteractionEventEntity
// Also creates EvictionTargetRelation and EvictionRequesterRelation via relation properties
EvictionRequest.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    // Handle eviction request submission from submitEvictionRequest interaction (I401)
    if (event.interactionName === 'submitEvictionRequest') {
      // Return EvictionRequest object with relations
      return {
        reason: event.payload.reason,
        status: 'pending',  // Default initial status
        requestDate: Math.floor(Date.now() / 1000),  // Current timestamp in seconds
        supportingEvidence: event.payload.supportingEvidence,
        targetUser: { id: event.payload.targetUserId },  // Create EvictionTargetRelation via 'targetUser' property
        requester: event.user  // Create EvictionRequesterRelation via 'requester' property
      };
    }
    return null;
  }
})