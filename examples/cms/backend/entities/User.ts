import { Entity, Property } from 'interaqt'

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'name',
      type: 'string'
    }),
    Property.create({
      name: 'role',
      type: 'string'
    }),
    Property.create({
      name: 'email',
      type: 'string'
    })
  ]
})