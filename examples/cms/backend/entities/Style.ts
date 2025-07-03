import { Entity, Property, Transform, InteractionEventEntity } from 'interaqt'

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
      type: 'string',
      defaultValue: () => 'draft'
    }),
    Property.create({ 
      name: 'created_at', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'updated_at', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'version_count',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'is_published',
      type: 'boolean',
      defaultValue: () => false
    }),
    Property.create({
      name: 'last_published_at',
      type: 'string'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
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
          updated_at: new Date().toISOString(),
          created_by: { id: event.user.id }
        }
      }
      return null
    }
  })
})