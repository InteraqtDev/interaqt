import { Entity, Property, Count, Transform } from 'interaqt'

export const Style = Entity.create({
  name: 'Style',
  properties: [
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
      defaultValue: () => 'draft'
    }),
    Property.create({
      name: 'createdAt',
      type: 'string'
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string'
    }),
    Property.create({
      name: 'createdBy',
      type: 'string'
    }),
    Property.create({
      name: 'versionCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: () => StyleVersionRelation
      })
    }),
    Property.create({
      name: 'isReferencedByPublishedVersion',
      type: 'boolean',
      defaultValue: () => false,
      computedData: Transform.create({
        record: () => StyleVersionRelation,
        callback: (styleVersions, style) => {
          return styleVersions.some(sv => {
            if (sv.source === style.id) {
              // Check if the target version is published
              const version = sv.target
              return version && version.status === 'published'
            }
            return false
          })
        }
      })
    })
  ]
})

// Import relations - these will be defined later
import { StyleVersionRelation } from '../relations/StyleVersionRelation'