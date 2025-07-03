import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Style } from '../entities/Style'

export const UserStyleRelation = Relation.create({
  source: User,
  sourceProperty: 'styles',
  target: Style,
  targetProperty: 'created_by',
  type: '1:n'
})