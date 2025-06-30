import { Entity, Property, Count, Transform, Any } from '@'

// User Entity for permission control
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'username',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'email',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'role',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string',
      collection: false
    })
  ]
})

// Version Entity for version management
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
      name: 'status',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'publishedAt',
      type: 'string',
      collection: false
    })
  ]
})

// Style Entity - the main entity for style management
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
      collection: false
    }),
    Property.create({
      name: 'status',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      collection: false
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string',
      collection: false
    })
  ]
})