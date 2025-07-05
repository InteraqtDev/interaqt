import { Relation } from 'interaqt'
import { Style } from '../entities/Style'
import { Version } from '../entities/Version'
import { StyleVersion } from '../entities/StyleVersion'

// Style to StyleVersion relationship
export const StyleStyleVersionRelation = Relation.create({
  source: StyleVersion,
  sourceProperty: 'style',
  target: Style,
  targetProperty: 'styleVersions',
  type: 'n:1'
})

// Version to StyleVersion relationship
export const VersionStyleVersionRelation = Relation.create({
  source: StyleVersion,
  sourceProperty: 'version',
  target: Version,
  targetProperty: 'styleVersions',
  type: 'n:1'
})