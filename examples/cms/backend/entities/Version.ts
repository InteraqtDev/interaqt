import { Entity, Property, Count, Transform } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'versionNumber',
      type: 'number'
    }),
    Property.create({
      name: 'name',
      type: 'string'
    }),
    Property.create({
      name: 'description',
      type: 'string'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'draft'
    }),
    Property.create({
      name: 'publishedAt',
      type: 'string'
    }),
    Property.create({
      name: 'createdAt',
      type: 'string'
    }),
    Property.create({
      name: 'createdBy',
      type: 'string'
    }),
    Property.create({
      name: 'styleCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: () => StyleVersionRelation
      })
    }),
    Property.create({
      name: 'activeStyleCount',
      type: 'number',
      defaultValue: () => 0,
      computedData: Count.create({
        record: () => StyleVersionRelation,
        callback: (relations, version) => {
          return relations.filter(rel => rel.target === version.id && rel.isActive === true).length
        }
      })
    }),
    Property.create({
      name: 'nextVersionNumber',
      type: 'number',
      defaultValue: () => 1,
      computedData: Transform.create({
        record: () => Version,
        callback: (versions) => {
          const maxVersion = Math.max(...versions.map(v => v.versionNumber || 0))
          return maxVersion + 1
        }
      })
    })
  ]
})

// Import relations - these will be defined later
import { StyleVersionRelation } from '../relations/StyleVersionRelation'