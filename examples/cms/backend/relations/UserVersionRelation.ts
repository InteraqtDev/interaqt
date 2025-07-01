import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Version } from '../entities/Version'

export const UserVersionRelation = Relation.create({
  source: User,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'createdBy',
  type: '1:n',
  properties: []
})