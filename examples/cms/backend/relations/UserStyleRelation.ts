import { Relation } from 'interaqt'
import { User } from '../entities/User'
import { Style } from '../entities/Style'

// User 创建的 Style
export const UserStyleRelation = Relation.create({
  source: User,
  sourceProperty: 'createdStyles',
  target: Style,
  targetProperty: 'createdBy',
  type: '1:n'
})

// User 最后更新的 Style
export const UserStyleUpdateRelation = Relation.create({
  source: User,
  sourceProperty: 'updatedStyles',
  target: Style,
  targetProperty: 'updatedBy',
  type: '1:n'
}) 