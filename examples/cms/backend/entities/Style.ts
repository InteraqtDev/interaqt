import { Entity, Property, Transform, InteractionEventEntity, StateMachine, StateNode, StateTransfer } from 'interaqt'

// 定义状态节点用于 status 和 isDeleted
const draftState = StateNode.create({ name: 'draft' })
const publishedState = StateNode.create({ name: 'published' })
const offlineState = StateNode.create({ name: 'offline' })

// 使用 computeValue 将状态映射到 boolean 值
const activeState = StateNode.create({ 
  name: 'active',
  computeValue: () => false  // active 状态对应 isDeleted = false
})
const deletedState = StateNode.create({ 
  name: 'deleted',
  computeValue: () => true   // deleted 状态对应 isDeleted = true
})

// 创建状态机用于 status 管理
const StatusStateMachine = StateMachine.create({
  states: [draftState, publishedState, offlineState],
  defaultState: draftState,
  transfers: []  // 将在 Interaction 定义后设置
})

// 创建状态机用于软删除管理
const DeletionStateMachine = StateMachine.create({
  states: [activeState, deletedState],
  defaultState: activeState,
  transfers: []  // 将在 Interaction 定义后设置
})

export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({
      name: 'label',
      type: 'string'
    }),
    Property.create({
      name: 'slug',
      type: 'string'
    }),
    Property.create({
      name: 'description',
      type: 'string'
    }),
    Property.create({
      name: 'type',
      type: 'string' // 'animation' | 'surreal' | ...
    }),
    Property.create({
      name: 'thumbKey',
      type: 'string'
    }),
    Property.create({
      name: 'priority',
      type: 'number'
    }),
    Property.create({
      name: 'status',
      type: 'string',
      defaultValue: () => 'draft',
      computation: StatusStateMachine
    }),
    Property.create({
      name: 'isDeleted',
      type: 'boolean',
      defaultValue: () => false,
      computation: DeletionStateMachine
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'updatedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ],
  // Transform to create Style from CreateStyle interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          label: event.payload.label,
          slug: event.payload.slug,
          description: event.payload.description || '',
          type: event.payload.type,
          thumbKey: event.payload.thumbKey || '',
          priority: event.payload.priority,
          createdBy: { id: event.user.id }  // Relation will be created automatically
        }
      }
      return null
    }
  })
})

// Export state nodes and machines for use in interactions
export { 
  draftState, 
  publishedState, 
  offlineState,
  activeState,
  deletedState,
  StatusStateMachine,
  DeletionStateMachine
}

// 这个函数将在所有 Interaction 定义后调用，用于设置状态机的 transfers
export function updateStyleStateMachines(interactions: any) {
  const { PublishStyle, UnpublishStyle, DeleteStyle, RestoreStyle } = interactions
  
  // 设置 StatusStateMachine 的 transfers
  StatusStateMachine.transfers = [
    StateTransfer.create({
      current: draftState,
      next: publishedState,
      trigger: PublishStyle,
      computeTarget: (event: any) => ({ id: event.payload.styleId.id })
    }),
    StateTransfer.create({
      current: publishedState,
      next: offlineState,
      trigger: UnpublishStyle,
      computeTarget: (event: any) => ({ id: event.payload.styleId.id })
    }),
    StateTransfer.create({
      current: offlineState,
      next: publishedState,
      trigger: PublishStyle,
      computeTarget: (event: any) => ({ id: event.payload.styleId.id })
    })
  ]
  
  // 设置 DeletionStateMachine 的 transfers
  DeletionStateMachine.transfers = [
    StateTransfer.create({
      current: activeState,
      next: deletedState,
      trigger: DeleteStyle,
      computeTarget: (event: any) => ({ id: event.payload.styleId.id })
    }),
    StateTransfer.create({
      current: deletedState,
      next: activeState,
      trigger: RestoreStyle,
      computeTarget: (event: any) => ({ id: event.payload.styleId.id })
    })
  ]
} 