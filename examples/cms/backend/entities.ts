import { 
  Entity, Property, Relation, Transform, Count, StateMachine, StateNode, StateTransfer,
  InteractionEventEntity, MatchExp
} from 'interaqt'

// === User Entity ===
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string', defaultValue: () => 'viewer' }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString() 
    }),
    Property.create({ 
      name: 'lastLoginAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString() 
    }),
    // Style count will be added after relation is defined
  ]
})

// === Style Status State Machine ===
const draftState = StateNode.create({ name: 'draft' })
const publishedState = StateNode.create({ name: 'published' })
const offlineState = StateNode.create({ name: 'offline' })
const deletedState = StateNode.create({ name: 'deleted' })

export const StyleLifecycleStateMachine = StateMachine.create({
  states: [draftState, publishedState, offlineState, deletedState],
  defaultState: draftState,
  transfers: [
    // State transfers will be populated after interactions are defined
  ]
})

// === Style Entity ===
export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'thumbKey', type: 'string' }),
    Property.create({ name: 'priority', type: 'number', defaultValue: () => 0 }),
    Property.create({
      name: 'status',
      type: 'string',
      computation: StyleLifecycleStateMachine,
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
      defaultValue: () => new Date().toISOString() 
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      defaultValue: () => false,
      computed: (style) => style.status === 'deleted'
    })
  ],
  // Transform to create styles from interactions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          description: event.payload.description,
          type: event.payload.type,
          thumbKey: event.payload.thumbKey,
          priority: event.payload.priority || 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: { id: event.user.id }
        }
      }
      
      return null
    }
  })
})

// === Version Entity ===
export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'versionName', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string', 
      defaultValue: () => new Date().toISOString() 
    }),
    Property.create({ name: 'publishedAt', type: 'string' }),
    Property.create({ name: 'isCurrent', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'isPublished', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'snapshot', type: 'string' }) // JSON string of style data
  ],
  // Transform to create versions from interactions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateVersion') {
        return {
          versionName: event.payload.versionName,
          description: event.payload.description,
          createdAt: new Date().toISOString(),
          snapshot: event.payload.snapshot || JSON.stringify([]),
          createdBy: { id: event.user.id }
        }
      }
      
      return null
    }
  })
})

// === Filtered Entities ===
export const ActiveStyle = Entity.create({
  name: 'ActiveStyle',
  sourceEntity: Style,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['!=', 'deleted']
  })
})

export const PublishedStyle = Entity.create({
  name: 'PublishedStyle',
  sourceEntity: Style,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
})

export const DraftStyle = Entity.create({
  name: 'DraftStyle',
  sourceEntity: Style,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'draft']
  })
})