import { Entity, Property, Transform, InteractionEventEntity, StateMachine, StateNode, StateTransfer } from 'interaqt'

// Define state nodes for StyleVersion lifecycle
const ActiveState = StateNode.create({ name: 'active' })
const RemovedState = StateNode.create({ name: 'removed' })

// Handle status through Transform instead of StateMachine for now

export const StyleVersion = Entity.create({
  name: 'StyleVersion',
  properties: [
    Property.create({ 
      name: 'order', 
      type: 'number',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'ReorderStylesInVersion' && 
              event.payload.versionId === this.version?.id) {
            const styleOrder = event.payload.styleOrders.find(so => so.styleId === this.style?.id)
            if (styleOrder) {
              return styleOrder.order
            }
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ name: 'createdAt', type: 'string' }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'active',
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'RemoveStyleFromVersion' &&
              event.payload.styleId === this.style?.id &&
              event.payload.versionId === this.version?.id) {
            return 'removed'
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({
      name: 'isActive',
      type: 'boolean',
      computed: function(styleVersion) {
        return styleVersion.status === 'active'
      }
    })
  ],
  // Transform creates StyleVersion records when styles are added to versions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'AddStyleToVersion') {
        return {
          order: event.payload.order,
          status: 'active',
          createdAt: new Date().toISOString(),
          style: { id: event.payload.styleId },
          version: { id: event.payload.versionId }
        }
      }
      return null
    }
  })
})