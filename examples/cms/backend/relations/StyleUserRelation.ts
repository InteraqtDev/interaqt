import { Relation, Property } from 'interaqt'
import { User } from '../entities/User'
import { Style } from '../entities/Style'

export const StyleUserRelation = Relation.create({
  name: 'StyleUserRelation',
  source: Style,
  target: User,
  type: 'n:1',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string'
    })
  ]
})