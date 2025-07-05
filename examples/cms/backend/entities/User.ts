import { Entity, Property } from 'interaqt'

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string' }), // admin, editor, viewer
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'updatedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'lastActivityAt', type: 'string' })
  ]
})