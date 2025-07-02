import { Entity, Property, Transform, InteractionEventEntity } from 'interaqt'

// This entity captures style creation events and creates actual Style entities
export const StyleCreatedEvent = Entity.create({
  name: 'StyleCreatedEvent',
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
      type: 'string'
    }),
    Property.create({
      name: 'type',
      type: 'string'
    }),
    Property.create({
      name: 'thumb_key',
      type: 'string'
    }),
    Property.create({
      name: 'priority',
      type: 'number'
    }),
    Property.create({
      name: 'status',
      type: 'string'
    }),
    Property.create({
      name: 'created_at',
      type: 'string'
    }),
    Property.create({
      name: 'updated_at',
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          description: event.payload.description,
          type: event.payload.type,
          thumb_key: event.payload.thumb_key,
          priority: event.payload.priority,
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      return null;
    }
  })
})