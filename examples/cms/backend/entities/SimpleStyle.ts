import { Entity, Property } from 'interaqt'

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'thumb_key', type: 'string' }),
    Property.create({ name: 'priority', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'draft' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'updatedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
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
  ]
})