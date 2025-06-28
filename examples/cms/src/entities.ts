import { Entity, Property } from 'interaqt';

// User Entity for authentication and authorization
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'Viewer'  // Admin, Operator, Viewer
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

// Style Entity - the core content management entity
export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ 
      name: 'label', 
      type: 'string'
    }),
    Property.create({ 
      name: 'slug', 
      type: 'string'
    }),
    Property.create({ 
      name: 'description', 
      type: 'string'
    }),
    Property.create({ 
      name: 'type', 
      type: 'string'
    }),
    Property.create({ 
      name: 'thumbKey', 
      type: 'string'
    }),
    Property.create({ 
      name: 'priority', 
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'draft'  // draft, published, offline
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

// Version Entity for version management
export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'id', type: 'string' }),
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ 
      name: 'snapshot', 
      type: 'object',
      collection: false  // JSON object containing all published styles at creation time
    }),
    Property.create({ 
      name: 'createdAt', 
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ]
});

export const entities = [User, Style, Version];