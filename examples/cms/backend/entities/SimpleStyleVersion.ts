import { Entity, Property } from 'interaqt'

export const StyleVersion = Entity.create({
  name: 'StyleVersion',
  properties: [
    Property.create({ name: 'order', type: 'number' }),
    Property.create({ name: 'status', type: 'string', defaultValue: () => 'active' }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({
      name: 'isActive',
      type: 'boolean',
      computed: function(styleVersion) {
        return styleVersion.status === 'active'
      }
    })
  ]
})