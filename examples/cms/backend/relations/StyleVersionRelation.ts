import { Relation, Property } from 'interaqt'
import { Style } from '../entities/Style'
import { Version } from '../entities/Version'

export const StyleVersionRelation = Relation.create({
  name: 'StyleVersionRelation',
  source: Style,
  target: Version,
  type: 'n:n',
  properties: [
    Property.create({
      name: 'sortOrder',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'isActive',
      type: 'boolean',
      defaultValue: () => true
    }),
    Property.create({
      name: 'createdAt',
      type: 'string'
    })
  ]
})