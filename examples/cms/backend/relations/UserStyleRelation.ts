import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Style } from '../entities/Style'

export const UserStyleCreatedByRelation = Relation.create({
  source: User,
  sourceProperty: 'createdStyles',
  target: Style, 
  targetProperty: 'createdBy',
  type: 'n:1'
})

export const UserStyleUpdatedByRelation = Relation.create({
  source: User,
  sourceProperty: 'updatedStyles',
  target: Style,
  targetProperty: 'updatedBy', 
  type: 'n:1'
})