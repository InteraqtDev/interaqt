import { Transform, StateMachine, StateNode, StateTransfer } from 'interaqt';
import { User, Dormitory, BedSpace, Assignment, Violation, KickoutRequest } from './entities';

// Add reactive computations for User score based on violations
export const UserScoreComputation = Transform.create({
  record: Violation,
  attributeQuery: ['userId', 'scoreDeduction'],
  callback: function(violations) {
    // For each user, calculate their score based on violations
    const userScores = new Map();
    
    violations.forEach(violation => {
      const userId = violation.userId;
      const currentDeduction = userScores.get(userId) || 0;
      userScores.set(userId, currentDeduction + (violation.scoreDeduction || 0));
    });
    
    // Return updated scores for all users
    const results = [];
    userScores.forEach((totalDeductions, userId) => {
      results.push({
        id: userId,
        score: Math.max(0, 100 - totalDeductions)
      });
    });
    
    return results;
  }
});

// Add reactive computation for BedSpace occupancy based on assignments
export const BedSpaceOccupancyComputation = Transform.create({
  record: Assignment,
  attributeQuery: ['bedSpaceId', 'isActive'],
  callback: function(assignments) {
    // For each bed space, check if it has an active assignment
    const bedOccupancy = new Map();
    
    assignments.forEach(assignment => {
      if (assignment.isActive) {
        bedOccupancy.set(assignment.bedSpaceId, true);
      }
    });
    
    // Return updated occupancy for all bed spaces
    const results = [];
    bedOccupancy.forEach((isOccupied, bedSpaceId) => {
      results.push({
        id: bedSpaceId,
        isOccupied: isOccupied
      });
    });
    
    return results;
  }
});

// Create state nodes for KickoutRequest StateMachine
export const pendingState = StateNode.create({ name: 'pending' });
export const approvedState = StateNode.create({ name: 'approved' });
export const rejectedState = StateNode.create({ name: 'rejected' });

// StateMachine for KickoutRequest status management
export const KickoutRequestStateMachine = StateMachine.create({
  states: [pendingState, approvedState, rejectedState],
  transfers: [], // Will be populated after interactions are defined
  defaultState: pendingState
});

// Create state nodes for Assignment StateMachine
export const activeState = StateNode.create({ name: 'active' });
export const inactiveState = StateNode.create({ name: 'inactive' });

// StateMachine for Assignment lifecycle management
export const AssignmentStateMachine = StateMachine.create({
  states: [activeState, inactiveState],
  transfers: [], // Will be populated after interactions are defined
  defaultState: activeState
});

export const computations = [
  UserScoreComputation,
  BedSpaceOccupancyComputation,
  KickoutRequestStateMachine,
  AssignmentStateMachine
];