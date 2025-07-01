import { Entity, Property } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'name',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'description',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'snapshot',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      collection: false,
      defaultValue: () => new Date().toISOString()
    })
  ]
})