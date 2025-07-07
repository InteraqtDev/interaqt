import { StateMachine, StateNode, StateTransfer } from 'interaqt';
import { KickoutRequest } from './entities.js';
import { ProcessKickoutRequest } from './interactions.js';

// Apply StateMachine for kickout request processing after all dependencies are available
const pendingState = StateNode.create({ name: 'pending' });
const approvedState = StateNode.create({ name: 'approved' });
const rejectedState = StateNode.create({ name: 'rejected' });

// Apply StateMachine to status property
const statusProperty = KickoutRequest.properties.find(p => p.name === 'status');
if (statusProperty) {
  statusProperty.computation = StateMachine.create({
    states: [pendingState, approvedState, rejectedState],
    defaultState: pendingState,
    transfers: [
      StateTransfer.create({
        current: pendingState,
        next: approvedState,
        trigger: ProcessKickoutRequest,
        computeTarget: (event) => ({ id: event.payload.request.id }),
        condition: (event) => event.payload.decision === 'approved'
      }),
      StateTransfer.create({
        current: pendingState,
        next: rejectedState,
        trigger: ProcessKickoutRequest,
        computeTarget: (event) => ({ id: event.payload.request.id }),
        condition: (event) => event.payload.decision === 'rejected'
      })
    ]
  });
}

// Apply StateMachine to processedAt property  
const processedAtProperty = KickoutRequest.properties.find(p => p.name === 'processedAt');
if (processedAtProperty) {
  const processedState = StateNode.create({ 
    name: 'processed',
    computeValue: () => Math.floor(Date.now() / 1000)
  });
  
  processedAtProperty.computation = StateMachine.create({
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
}