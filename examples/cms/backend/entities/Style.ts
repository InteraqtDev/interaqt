import { Entity, Property } from 'interaqt'

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'label',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'slug',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'description',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'type',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'thumbKey',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'priority',
      type: 'number',
      collection: false,
      defaultValue: () => 0
    }),
    Property.create({
      name: 'status',
      type: 'string',
      collection: false,
      defaultValue: () => 'draft'
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      collection: false,
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string',
      collection: false,
      defaultValue: () => new Date().toISOString()
    })
  ]
})