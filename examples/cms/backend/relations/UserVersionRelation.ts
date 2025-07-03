import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Version } from '../entities/Version'

export const UserVersionRelation = Relation.create({
  source: User,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'created_by',
  type: '1:n'
})