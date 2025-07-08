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
// NOTE: Entity computations are now defined inline in entities.ts to avoid conflicts
// We only keep relation computations here

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

// NOTE: Complex computations like StateMachine and Count are causing conflicts
// These will be implemented later after basic functionality is working
// For now, status updates and count computations are handled manually in interactions