import { Relation } from '@'
import { User, Version, Style } from './entities'

// Style belongs to Version (many-to-one)
export const StyleVersionRelation = Relation.create({
  source: Style,
  sourceProperty: 'version',
  target: Version,
  targetProperty: 'styles',
  name: 'StyleVersionRelation',
  type: 'n:1'
})

// User creates Styles (one-to-many)
export const UserStylesRelation = Relation.create({
  source: User,
  sourceProperty: 'createdStyles',
  target: Style,
  targetProperty: 'creator',
  name: 'UserStylesRelation',
  type: '1:n'
})

// User creates Versions (one-to-many)
export const UserVersionsRelation = Relation.create({
  source: User,
  sourceProperty: 'createdVersions',
  target: Version,
  targetProperty: 'creator',
  name: 'UserVersionsRelation',
  type: '1:n'
})