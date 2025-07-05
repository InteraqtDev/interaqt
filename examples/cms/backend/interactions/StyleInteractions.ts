import { 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Attributive,
  Condition,
  BoolExp,
  boolExpToConditions,
  boolExpToAttributives
} from 'interaqt'
import { Style } from '../entities/Style'

// 权限检查 Attributive
export const OperatorOrAdminRole = Attributive.create({
  name: 'OperatorOrAdminRole',
  content: function(targetUser, eventArgs) {
    // eventArgs.user 包含调用交互的用户信息
    return eventArgs.user && (eventArgs.user.role === 'operator' || eventArgs.user.role === 'admin')
  }
})

export const AdminRole = Attributive.create({
  name: 'AdminRole', 
  content: function(targetUser, eventArgs) {
    // eventArgs.user 包含调用交互的用户信息
    return eventArgs.user && eventArgs.user.role === 'admin'
  }
})

// 条件检查
const StyleNotDeleted = Condition.create({
  name: 'StyleNotDeleted',
  content: function(this: any, { payload }) {
    // 这里需要在交互执行时检查 style 的 isDeleted 状态
    // 实际检查会在交互处理中进行
    return true // 默认通过，实际检查在运行时
  }
})

// CreateStyle 交互
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'label',
        isRef: false
      }),
      PayloadItem.create({
        name: 'slug',
        isRef: false
      }),
      PayloadItem.create({
        name: 'description',
        isRef: false,
        required: false
      }),
      PayloadItem.create({
        name: 'type',
        isRef: false
      }),
      PayloadItem.create({
        name: 'thumbKey',
        isRef: false,
        required: false
      }),
      PayloadItem.create({
        name: 'priority',
        isRef: false
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  )
})

// UpdateStyle 交互
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        base: Style,
        isRef: true
      }),
      PayloadItem.create({
        name: 'label',
        isRef: false,
        required: false
      }),
      PayloadItem.create({
        name: 'description',
        isRef: false,
        required: false
      }),
      PayloadItem.create({
        name: 'type',
        isRef: false,
        required: false
      }),
      PayloadItem.create({
        name: 'thumbKey',
        isRef: false,
        required: false
      }),
      PayloadItem.create({
        name: 'priority',
        isRef: false,
        required: false
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  ),
  conditions: boolExpToConditions(
    BoolExp.atom(StyleNotDeleted)
  )
})

// DeleteStyle 交互（软删除）
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        base: Style,
        isRef: true
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminRole)
  ),
  conditions: boolExpToConditions(
    BoolExp.atom(StyleNotDeleted)
  )
})

// RestoreStyle 交互
export const RestoreStyle = Interaction.create({
  name: 'RestoreStyle',
  action: Action.create({ name: 'restore' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        base: Style,
        isRef: true
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminRole)
  )
})

// PublishStyle 交互
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        base: Style,
        isRef: true
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  ),
  conditions: boolExpToConditions(
    BoolExp.atom(StyleNotDeleted)
  )
})

// UnpublishStyle 交互
export const UnpublishStyle = Interaction.create({
  name: 'UnpublishStyle',
  action: Action.create({ name: 'unpublish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        base: Style,
        isRef: true
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  ),
  conditions: boolExpToConditions(
    BoolExp.atom(StyleNotDeleted)
  )
}) 