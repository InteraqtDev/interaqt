import { Transform, StateMachine, StateNode, StateTransfer, Count, Summation, Property, InteractionEventEntity } from 'interaqt';
import { User, Dormitory, Bed, ScoreRecord, KickoutRequest } from './entities.js';
import { 
  UserDormitoryRelation,
  UserBedRelation,
  DormitoryBedRelation,
  DormitoryLeaderRelation,
  UserScoreRecordRelation,
  KickoutRequestTargetUserRelation,
  KickoutRequestApplicantRelation,
  KickoutRequestProcessorRelation
} from './relations.js';
import {
  CreateDormitory,
  AssignUserToDormitory,
  RecordScoreDeduction,
  CreateKickoutRequest,
  ProcessKickoutRequest
} from './interactions.js';

// Apply Transform computations to entities after all dependencies are available

// 用户创建 Transform
User.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    // For now, users will be created manually via initial data
    // We can add user registration interactions later
    return null;
  }
});

// 宿舍创建 Transform - already defined inline in entities.ts, skip here

// 扣分记录创建 Transform
ScoreRecord.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'RecordScoreDeduction') {
      return {
        reason: event.payload.reason,
        score: event.payload.score,
        recordedAt: Math.floor(Date.now() / 1000),
        user: event.payload.user,  // This will create relation automatically
        recordedBy: event.user  // This will create relation automatically
      };
    }
    return null;
  }
});

// 踢出申请创建 Transform
KickoutRequest.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateKickoutRequest') {
      return {
        reason: event.payload.reason,
        status: 'pending',
        createdAt: Math.floor(Date.now() / 1000),
        targetUser: event.payload.user,  // This will create relation automatically
        applicant: event.user  // This will create relation automatically
      };
    }
    return null;
  }
});

// Apply Transform computation to relation for dormitory-user assignment
UserDormitoryRelation.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'AssignUserToDormitory') {
      return {
        source: event.payload.user,
        target: event.payload.dormitory,
        assignedAt: Math.floor(Date.now() / 1000),
        assignedBy: event.user.id
      };
    }
    return null;
  }
});

// Apply Transform computation to relation for user-bed assignment
UserBedRelation.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'AssignUserToDormitory') {
      // We need to find the correct bed in the dormitory
      return {
        source: event.payload.user,
        target: { number: event.payload.bedNumber }, // This needs to be resolved to actual bed
        assignedAt: Date.now()
      };
    }
    return null;
  }
});

// Apply Transform computation to relation for dormitory leader appointment
DormitoryLeaderRelation.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'AppointDormLeader') {
      return {
        source: event.payload.dormitory,
        target: event.payload.user,
        appointedAt: Math.floor(Date.now() / 1000),
        appointedBy: event.user.id
      };
    }
    return null;
  }
});

// State nodes for kickout request processing
const pendingState = StateNode.create({ name: 'pending' });
const approvedState = StateNode.create({ 
  name: 'approved',
  computeValue: () => Math.floor(Date.now() / 1000)  // Set processedAt timestamp
});
const rejectedState = StateNode.create({ 
  name: 'rejected',
  computeValue: () => Math.floor(Date.now() / 1000)  // Set processedAt timestamp
});

// Apply StateMachine for kickout request status
KickoutRequest.properties.find(p => p.name === 'status').computation = StateMachine.create({
  states: [pendingState, approvedState, rejectedState],
  defaultState: pendingState,
  transfers: [
    StateTransfer.create({
      current: pendingState,
      next: approvedState,
      trigger: ProcessKickoutRequest,
      computeTarget: (event) => ({ id: event.payload.request.id })
    }),
    StateTransfer.create({
      current: pendingState,
      next: rejectedState,
      trigger: ProcessKickoutRequest,
      computeTarget: (event) => ({ id: event.payload.request.id })
    })
  ]
});

// Apply StateMachine for processedAt timestamp
const processedState = StateNode.create({ 
  name: 'processed',
  computeValue: () => Math.floor(Date.now() / 1000)
});

KickoutRequest.properties.find(p => p.name === 'processedAt').computation = StateMachine.create({
  states: [processedState],
  defaultState: processedState,
  transfers: [
    StateTransfer.create({
      current: processedState,
      next: processedState,
      trigger: ProcessKickoutRequest,
      computeTarget: (event) => ({ id: event.payload.request.id })
    })
  ]
});

// Add reactive count properties
// User's score record count
User.properties.push(
  Property.create({
    name: 'scoreRecordCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserScoreRecordRelation
    })
  })
);

// Dormitory's current count (automatic)
Dormitory.properties.find(p => p.name === 'currentCount').computation = Count.create({
  record: UserDormitoryRelation,
  direction: 'source'  // Count users assigned to this dormitory
});

// User's total score deduction
User.properties.push(
  Property.create({
    name: 'totalScoreDeduction',
    type: 'number',
    defaultValue: () => 0,
    computation: Summation.create({
      record: UserScoreRecordRelation,
      attributeQuery: [['target', { attributeQuery: ['score'] }]]
    })
  })
);

// User's current effective score (100 - total deductions)
User.properties.push(
  Property.create({
    name: 'effectiveScore',
    type: 'number',
    computed: function(user) {
      const baseScore = user.score || 100;
      const deductions = user.totalScoreDeduction || 0;
      return Math.max(0, baseScore - deductions);
    }
  })
);