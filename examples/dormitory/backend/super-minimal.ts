/**
 * 超级最小化的后端实现，没有任何计算
 */

import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem
} from 'interaqt'

// 最简单的实体 - 只有基础属性
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'email', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'role', 
      type: 'string',
      defaultValue: () => 'student'
    })
  ]
})

export const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ 
      name: 'name', 
      type: 'string' 
    }),
    Property.create({ 
      name: 'capacity', 
      type: 'number' 
    })
  ]
})

// 简单的交互
export const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'name', 
        required: true 
      }),
      PayloadItem.create({ 
        name: 'capacity', 
        required: true 
      })
    ]
  })
})

// 导出
export const entities = [User, Dormitory]
export const relations = []
export const interactions = [CreateDormitory]
export const computations = []
