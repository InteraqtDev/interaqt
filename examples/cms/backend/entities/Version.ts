import { Entity, Property, Transform, InteractionEventEntity } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ 
      name: 'version_number', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'description', 
      type: 'string' 
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
      name: 'published_at', 
      type: 'string'
    }),
    Property.create({
      name: 'style_count',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'is_current',
      type: 'boolean',
      defaultValue: () => false
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateVersion') {
        return {
          version_number: event.payload.version_number,
          description: event.payload.description,
          status: 'draft',
          created_at: new Date().toISOString(),
          created_by: { id: event.user.id }
        }
      }
      return null
    }
  })
})