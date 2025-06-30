import { Entity, Property, Count } from '@interaqt/runtime'
import { StyleVersionRelation } from './relations'

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'label',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'slug',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'description',
      type: 'string',
      collection: false,
      required: false
    }),
    Property.create({
      name: 'type',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'thumb_key',
      type: 'string',
      collection: false,
      required: false
    }),
    Property.create({
      name: 'priority',
      type: 'number',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'status',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'created_at',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'updated_at',
      type: 'string',
      collection: false,
      required: true
    })
  ]
})

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'version_number',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'description',
      type: 'string',
      collection: false,
      required: false
    }),
    Property.create({
      name: 'created_at',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'is_current',
      type: 'boolean',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'created_by',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'styles_count',
      type: 'number',
      collection: false,
      required: false,
      computedData: Count.create({
        record: StyleVersionRelation,
        recordName: 'StyleVersionRelation'
      })
    })
  ]
})

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'username',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'role',
      type: 'string',
      collection: false,
      required: true
    }),
    Property.create({
      name: 'created_at',
      type: 'string',
      collection: false,
      required: true
    })
  ]
})