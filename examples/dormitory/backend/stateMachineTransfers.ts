import { StateTransfer } from 'interaqt';
import { ApproveKickoutRequest, TransferUser } from './interactions';
import { 
  pendingState, 
  approvedState, 
  rejectedState, 
  activeState, 
  inactiveState, 
  KickoutRequestStateMachine,
  AssignmentStateMachine 
} from './computations';

// Add transfers to KickoutRequest StateMachine
KickoutRequestStateMachine.transfers = [
  StateTransfer.create({
    current: pendingState,
    next: approvedState,
    trigger: ApproveKickoutRequest,
    computeTarget: (event) => {
      if (event.payload.decision === 'approved') {
        return { id: event.payload.requestId };
      }
      return null;
    }
  }),
  StateTransfer.create({
    current: pendingState,
    next: rejectedState,
    trigger: ApproveKickoutRequest,
    computeTarget: (event) => {
      if (event.payload.decision === 'rejected') {
        return { id: event.payload.requestId };
      }
      return null;
    }
  })
];

// Add transfers to Assignment StateMachine
AssignmentStateMachine.transfers = [
  StateTransfer.create({
    current: activeState,
    next: inactiveState,
    trigger: TransferUser,
    computeTarget: (event) => {
      // When a user is transferred, their old assignment becomes inactive
      return { userId: event.payload.userId };
    }
  }),
  StateTransfer.create({
    current: activeState,
    next: inactiveState,
    trigger: ApproveKickoutRequest,
    computeTarget: (event) => {
      if (event.payload.decision === 'approved') {
        // When a kickout is approved, the user's assignment becomes inactive
        return { targetUserId: event.payload.targetUserId };
      }
      return null;
    }
  })
];

export { KickoutRequestStateMachine, AssignmentStateMachine };