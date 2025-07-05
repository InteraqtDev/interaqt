import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Version } from '../entities/Version'

// User created versions relationship
export const UserVersionRelation = Relation.create({
  source: Version,
  sourceProperty: 'createdBy',
  target: User,
  targetProperty: 'createdVersions',
  type: 'n:1'
})