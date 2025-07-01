import { Entity, Property, Count } from 'interaqt'

export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({
      name: 'username',
      type: 'string'
    }),
    Property.create({
      name: 'email',
      type: 'string'
    }),
    Property.create({
      name: 'role',
      type: 'string',
      defaultValue: () => 'viewer'
    }),
    Property.create({
      name: 'isActive',
      type: 'boolean',
      defaultValue: () => true
    }),
    Property.create({
      name: 'createdAt',
      type: 'string'
    }),
    Property.create({
      name: 'styleCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: () => StyleUserRelation
      })
    }),
    Property.create({
      name: 'versionCount', 
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: () => VersionUserRelation
      })
    })
  ]
})

// Import relations - these will be defined later
import { StyleUserRelation } from '../relations/StyleUserRelation'
import { VersionUserRelation } from '../relations/VersionUserRelation'