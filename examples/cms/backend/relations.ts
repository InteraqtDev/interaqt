import { Relation } from '@interaqt/runtime'
import { Style, Version, User } from './entities'

export const StyleVersionRelation = Relation.create({
  source: Style,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'styles',
  relType: 'n:n',
  properties: [
    {
      name: 'snapshot_data',
      type: 'object',
      collection: false
    },
    {
      name: 'created_at',
      type: 'string',
      collection: false
    }
  ]
})

export const UserVersionRelation = Relation.create({
  source: User,
  sourceProperty: 'created_versions',
  target: Version,
  targetProperty: 'creator',
  relType: '1:n'
})