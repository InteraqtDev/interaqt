import { Entity, Property } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'versionNumber', type: 'number' }),
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() })
  ]
})