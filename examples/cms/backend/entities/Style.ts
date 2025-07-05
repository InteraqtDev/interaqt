import { Entity, Property, Transform, InteractionEventEntity, StateMachine, StateNode, StateTransfer } from 'interaqt'

// Define state nodes for style lifecycle
const DraftState = StateNode.create({ name: 'draft' })
const PublishedState = StateNode.create({ name: 'published' })
const OfflineState = StateNode.create({ name: 'offline' })

// Import interactions to reference in state machine (will be defined later)
// For now, we'll handle state management through Transform instead of StateMachine

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ 
      name: 'label', 
      type: 'string',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateStyle' && 
              event.payload.styleId === this.id && 
              event.payload.label !== undefined) {
            return event.payload.label
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ 
      name: 'slug', 
      type: 'string',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateStyle' && 
              event.payload.styleId === this.id && 
              event.payload.slug !== undefined) {
            return event.payload.slug
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ 
      name: 'description', 
      type: 'string',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateStyle' && 
              event.payload.styleId === this.id && 
              event.payload.description !== undefined) {
            return event.payload.description
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ 
      name: 'type', 
      type: 'string',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateStyle' && 
              event.payload.styleId === this.id && 
              event.payload.type !== undefined) {
            return event.payload.type
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ 
      name: 'thumb_key', 
      type: 'string',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateStyle' && 
              event.payload.styleId === this.id && 
              event.payload.thumb_key !== undefined) {
            return event.payload.thumb_key
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ 
      name: 'priority', 
      type: 'number',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'UpdateStyle' && 
              event.payload.styleId === this.id && 
              event.payload.priority !== undefined) {
            return event.payload.priority
          }
          if (event.interactionName === 'ReorderStyles') {
            const styleOrder = event.payload.styleOrders.find(so => so.styleId === this.id)
            if (styleOrder) {
              return styleOrder.priority
            }
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'draft',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'PublishStyle' && event.payload.styleId === this.id) {
            return 'published'
          }
          if (event.interactionName === 'UnpublishStyle' && event.payload.styleId === this.id) {
            return 'draft'
          }
          if (event.interactionName === 'DeleteStyle' && event.payload.styleId === this.id) {
            return 'offline'
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'string',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (['UpdateStyle', 'PublishStyle', 'UnpublishStyle', 'DeleteStyle', 'ReorderStyles'].includes(event.interactionName)) {
            if (event.interactionName === 'UpdateStyle' && event.payload.styleId === this.id) {
              return new Date().toISOString()
            }
            if (event.interactionName === 'PublishStyle' && event.payload.styleId === this.id) {
              return new Date().toISOString()
            }
            if (event.interactionName === 'UnpublishStyle' && event.payload.styleId === this.id) {
              return new Date().toISOString()
            }
            if (event.interactionName === 'DeleteStyle' && event.payload.styleId === this.id) {
              return new Date().toISOString()
            }
            if (event.interactionName === 'ReorderStyles') {
              const styleOrder = event.payload.styleOrders.find(so => so.styleId === this.id)
              if (styleOrder) {
                return new Date().toISOString()
              }
            }
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({
      name: 'isPublished',
      type: 'boolean',
      computed: function(style) {
        return style.status === 'published'
      }
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      computed: function(style) {
        return style.status === 'offline'
      }
    })
  ],
  // Transform in Entity's computation creates styles from interactions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          description: event.payload.description || '',
          type: event.payload.type,
          thumb_key: event.payload.thumb_key || '',
          priority: event.payload.priority,
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: { id: event.user.id },
          updatedBy: { id: event.user.id }
        }
      }
      return null
    }
  })
})