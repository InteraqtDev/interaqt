import { 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  BoolExp,
  boolExpToAttributives
} from 'interaqt'
import { Style } from '../entities/Style'
import { OperatorOrAdminRole } from './StyleInteractions'

// UpdateStylePriority 交互
export const UpdateStylePriority = Interaction.create({
  name: 'UpdateStylePriority',
  action: Action.create({ name: 'updatePriority' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        base: Style,
        isRef: true
      }),
      PayloadItem.create({
        name: 'newPriority',
        isRef: false
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  )
})

// ReorderStyles 批量重排序交互
export const ReorderStyles = Interaction.create({
  name: 'ReorderStyles',
  action: Action.create({ name: 'reorder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styles',
        isRef: false,
        isCollection: true
        // 数组格式: [{ styleId: string, priority: number }]
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  )
}) 