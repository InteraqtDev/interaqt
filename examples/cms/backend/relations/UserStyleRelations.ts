import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Style } from '../entities/Style'

// User created styles relationship
export const UserCreatedStyleRelation = Relation.create({
  source: Style,
  sourceProperty: 'createdBy',
  target: User,
  targetProperty: 'createdStyles',
  type: 'n:1'
})

// User updated styles relationship
export const UserUpdatedStyleRelation = Relation.create({
  source: Style,
  sourceProperty: 'updatedBy',
  target: User,
  targetProperty: 'updatedStyles',
  type: 'n:1'
})