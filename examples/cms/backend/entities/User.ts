import { Entity, Property } from 'interaqt'

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'email', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'role', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'created_at', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'created_styles_count',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'created_versions_count',
      type: 'number',
      defaultValue: () => 0
    })
  ]
})