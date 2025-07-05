import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Version } from '../entities/Version'

// User 发布的 Version
export const UserVersionRelation = Relation.create({
  source: User,
  sourceProperty: 'publishedVersions',
  target: Version,
  targetProperty: 'publishedBy',
  type: '1:n'
}) 