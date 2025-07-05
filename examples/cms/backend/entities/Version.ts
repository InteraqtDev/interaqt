import { Entity, Property, Transform, InteractionEventEntity, Count, StateMachine, StateNode } from 'interaqt';

// Define state node for active status tracking
const activeState = StateNode.create({
  name: 'active',
  computeValue: () => true  // Active state returns true
});

const inactiveState = StateNode.create({
  name: 'inactive', 
  computeValue: () => false
});

// State machine for tracking active version (will be set in interactions)
export const VersionActiveStateMachine = StateMachine.create({
  states: [activeState, inactiveState],
  defaultState: inactiveState,
  transfers: [] // Will be populated after interactions are defined
});

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ 
      name: 'versionNumber', 
      type: 'number'
    }),
    Property.create({ 
      name: 'publishedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean',
      computation: VersionActiveStateMachine,
      defaultValue: () => false
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'styleCount',
      type: 'number',
      defaultValue: () => 0,
      // Count will be computed based on StyleVersionRelation - configure later to avoid circular dependency
    })
  ],
  // Transform listens to PublishStyle interaction to create version
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'PublishStyle') {
        // Get next version number (this will be handled in the interaction)
        return {
          versionNumber: event.payload.versionNumber || 1,
          publishedAt: new Date().toISOString(),
          isActive: true,
          createdAt: new Date().toISOString(),
          publishedBy: { id: event.user.id } // Relation will be created automatically
        };
      }
      // Handle rollback - create new version from old version data
      if (event.interactionName === 'RollbackVersion') {
        return {
          versionNumber: event.payload.newVersionNumber,
          publishedAt: new Date().toISOString(),
          isActive: true,
          createdAt: new Date().toISOString(),
          publishedBy: { id: event.user.id }
        };
      }
      return null;
    }
  })
}); 