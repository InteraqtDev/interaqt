import { Entity, Property, Transform, InteractionEventEntity, StateMachine, StateNode, StateTransfer, Count } from 'interaqt';

// Define state nodes for status management
const draftState = StateNode.create({ name: 'draft' });
const publishedState = StateNode.create({ name: 'published' });
const offlineState = StateNode.create({ name: 'offline' });

// Create status state machine (will be referenced in UpdateStyle interaction)
export const StyleStatusStateMachine = StateMachine.create({
  states: [draftState, publishedState, offlineState],
  defaultState: draftState,
  transfers: [] // Will be populated after interactions are defined
});

// Define state node for timestamp tracking
const timestampState = StateNode.create({
  name: 'updated',
  computeValue: () => new Date().toISOString()
});

// Create timestamp state machine (will be referenced in UpdateStyle interaction)  
export const StyleTimestampStateMachine = StateMachine.create({
  states: [timestampState],
  defaultState: timestampState,
  transfers: [] // Will be populated after interactions are defined
});

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ 
      name: 'label', 
      type: 'string'
    }),
    Property.create({ 
      name: 'slug', 
      type: 'string'
    }),
    Property.create({ 
      name: 'description', 
      type: 'string',
      defaultValue: () => ''
    }),
    Property.create({ 
      name: 'type', 
      type: 'string'
    }),
    Property.create({ 
      name: 'thumbKey', 
      type: 'string',
      defaultValue: () => ''
    }),
    Property.create({ 
      name: 'priority', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      computation: StyleStatusStateMachine,
      defaultValue: () => 'draft'
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'string',
      computation: StyleTimestampStateMachine,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'versionCount',
      type: 'number',
      defaultValue: () => 0,
      // Count will be computed based on StyleVersionRelation - configure later to avoid circular dependency
    })
  ],
  // Transform listens to CreateStyle interaction to create entities
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          description: event.payload.description || '',
          type: event.payload.type,
          thumbKey: event.payload.thumbKey || '',
          priority: event.payload.priority || 0,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastModifiedBy: { id: event.user.id } // Relation will be created automatically
        };
      }
      return null;
    }
  })
});

// Export state nodes and state machines for external use
export { draftState, publishedState, offlineState, timestampState };

// Function to set up state machine transfers after interactions are defined
export function setupStyleStateMachines(interactions: any) {
  const { PublishStyle, DeleteStyle, UpdateStyle } = interactions;
  
  // Set up status state machine transfers
  StyleStatusStateMachine.transfers = [
    StateTransfer.create({
      current: draftState,
      next: publishedState,
      trigger: PublishStyle,
      computeTarget: (event) => ({ id: event.payload.styleId })
    }),
    StateTransfer.create({
      current: publishedState,
      next: offlineState,
      trigger: DeleteStyle,
      computeTarget: (event) => ({ id: event.payload.styleId })
    }),
    StateTransfer.create({
      current: draftState,
      next: offlineState,
      trigger: DeleteStyle,
      computeTarget: (event) => ({ id: event.payload.styleId })
    })
  ];
  
  // Set up timestamp state machine transfers
  StyleTimestampStateMachine.transfers = [
    StateTransfer.create({
      current: timestampState,
      next: timestampState,
      trigger: UpdateStyle,
      computeTarget: (event) => ({ id: event.payload.styleId })
    })
  ];
} 