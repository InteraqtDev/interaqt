import { Relation, Property } from 'interaqt'
import { Version } from '../entities/Version'
import { User } from '../entities/User'

export const VersionUserRelation = Relation.create({
  name: 'VersionUserRelation',
  source: Version,
  target: User,
  type: 'n:1',
  properties: [
    Property.create({
      name: 'createdAt',
      type: 'string'
    })
  ]
})