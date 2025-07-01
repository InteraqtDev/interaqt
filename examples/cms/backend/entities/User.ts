import { Entity, Property } from 'interaqt'

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'email',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'roles',
      type: 'string',
      collection: true,
      defaultValue: () => ['admin']
    }),
    Property.create({
      name: 'name',
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