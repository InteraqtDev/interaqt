/**
 * 最小化的后端实现，用于测试基础功能
 */

import {
  Entity,
  Property,
  Relation,
  Interaction,
  Action,
  Payload,
  PayloadItem,
  Transform,
  InteractionEventEntity
} from 'interaqt'

// 最简单的实体
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
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
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
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'active'
    })
  ],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: (event) => {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          status: 'active'
        }
      }
      return null
    }
  })
})

export const Bed = Entity.create({
  name: 'Bed',
  properties: [
    Property.create({ 
      name: 'number', 
      type: 'number' 
    }),
    Property.create({ 
      name: 'status', 
      type: 'string',
      defaultValue: () => 'available'
    })
  ]
})

// 简单的关系
export const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'users',
  type: 'n:1'
})

export const DormitoryBedsRelation = Relation.create({
  source: Dormitory,
  sourceProperty: 'beds',
  target: Bed,
  targetProperty: 'dormitory',
  type: '1:n'
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
export const entities = [User, Dormitory, Bed]
export const relations = [UserDormitoryRelation, DormitoryBedsRelation]
export const interactions = [CreateDormitory]
export const computations = []
