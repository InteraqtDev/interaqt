import { Relation } from 'interaqt'
import { Style } from '../entities/Style'
import { Version } from '../entities/Version'

export const StyleVersionRelation = Relation.create({
  source: Style,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'styles',
  type: 'n:n'
})