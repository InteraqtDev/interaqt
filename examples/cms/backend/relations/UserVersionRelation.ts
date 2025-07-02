import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Version } from '../entities/Version'

export const UserVersionRelation = Relation.create({
  source: User,
  sourceProperty: 'createdVersions',
  target: Version,
  targetProperty: 'createdBy',
  type: 'n:1'
})