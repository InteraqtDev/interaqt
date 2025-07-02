import { Entity, Property } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'name',
      type: 'string'
    }),
    Property.create({
      name: 'description',
      type: 'string'
    }),
    Property.create({
      name: 'created_at',
      type: 'string'
    }),
    Property.create({
      name: 'is_current',
      type: 'boolean',
      defaultValue: () => false
    })
  ]
})