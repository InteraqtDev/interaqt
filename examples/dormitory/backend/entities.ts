import { Entity, Property, Relation, Transform, InteractionEventEntity, StateMachine, StateNode, StateTransfer } from 'interaqt';

// User Entity
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }),  // admin, leader, resident
    Property.create({ 
      name: 'score', 
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
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateUser') {
        return {
          username: event.payload.username,
          email: event.payload.email,
          role: event.payload.role || 'resident',
          score: 100,
          isActive: true,
          createdAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// Dormitory Entity
export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'leaderId', type: 'string' }),
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
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          isActive: true,
          createdAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// BedSpace Entity
export const BedSpace = Entity.create({
  name: 'BedSpace',
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }),
    Property.create({ name: 'bedNumber', type: 'number' }),
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
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateBedSpace') {
        return {
          dormitoryId: event.payload.dormitoryId,
          bedNumber: event.payload.bedNumber,
          createdAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// Assignment Entity
export const Assignment = Entity.create({
  name: 'Assignment',
  properties: [
    Property.create({ name: 'userId', type: 'string' }),
    Property.create({ name: 'bedSpaceId', type: 'string' }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      defaultValue: () => true
    }),
    Property.create({ 
      name: 'assignedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AssignUserToBed') {
        return {
          userId: event.payload.userId,
          bedSpaceId: event.payload.bedSpaceId,
          isActive: true,
          assignedAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// Violation Entity
export const Violation = Entity.create({
  name: 'Violation',
  properties: [
    Property.create({ name: 'userId', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'scoreDeduction', type: 'number' }),
    Property.create({ name: 'reportedById', type: 'string' }),
    Property.create({ 
      name: 'reportedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'ReportViolation') {
        const violationType = event.payload.type;
        const scoreMap = {
          'NOISE_VIOLATION': 10,
          'CLEANLINESS_ISSUE': 15,
          'DAMAGE_TO_PROPERTY': 25,
          'UNAUTHORIZED_GUESTS': 20,
          'CURFEW_VIOLATION': 10
        };
        return {
          userId: event.payload.targetUserId,
          type: event.payload.type,
          description: event.payload.description,
          scoreDeduction: scoreMap[violationType] || 10,
          reportedById: event.user.id,
          reportedAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// KickoutRequest Entity with StateMachine
export const KickoutRequest = Entity.create({
  name: 'KickoutRequest',
  properties: [
    Property.create({ name: 'requesterId', type: 'string' }),
    Property.create({ name: 'targetUserId', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'pending'
    }),
    Property.create({ 
      name: 'requestedAt', 
      type: 'number',
      defaultValue: () => Math.floor(Date.now() / 1000)
    }),
    Property.create({ name: 'reviewedAt', type: 'number' }),
    Property.create({ name: 'reviewedById', type: 'string' })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'SubmitKickoutRequest') {
        return {
          requesterId: event.user.id,
          targetUserId: event.payload.targetUserId,
          reason: event.payload.reason,
          status: 'pending',
          requestedAt: Math.floor(Date.now() / 1000)
        };
      }
      return null;
    }
  })
});

// Relations
export const UserDormitoryLeader = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'leader',
  type: '1:1',
  properties: [
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
  ]
});

export const UserBedSpaceAssignment = Relation.create({
  source: User,
  sourceProperty: 'bedSpace',
  target: BedSpace,
  targetProperty: 'user',
  type: 'n:1',
  properties: [
    Property.create({ name: 'assignedAt', type: 'number' }),
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => true })
  ]
});

export const DormitoryBedSpace = Relation.create({
  source: Dormitory,
  sourceProperty: 'bedSpaces',
  target: BedSpace,
  targetProperty: 'dormitory',
  type: '1:n'
});

export const UserViolation = Relation.create({
  source: User,
  sourceProperty: 'violations',
  target: Violation,
  targetProperty: 'user',
  type: '1:n',
  properties: [
    Property.create({ name: 'reportedAt', type: 'number' })
  ]
});

// Export collections
export const entities = [User, Dormitory, BedSpace, Assignment, Violation, KickoutRequest];
export const relations = [UserDormitoryLeader, UserBedSpaceAssignment, DormitoryBedSpace, UserViolation];