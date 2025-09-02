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
// INTERACTIONS (Empty for now - will be populated in Task 3.1.3)
// =========================

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
export const activities = []
export const interactions = []
export const dicts = [SystemConfig, ViolationRules]