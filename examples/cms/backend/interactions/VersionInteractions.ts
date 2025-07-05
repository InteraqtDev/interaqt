import { 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  BoolExp,
  boolExpToAttributives
} from 'interaqt'
import { Version } from '../entities/Version'
import { OperatorOrAdminRole, AdminRole } from './StyleInteractions'

// CreateVersion 交互
export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({ name: 'createVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'comment',
        isRef: false,
        required: false
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(OperatorOrAdminRole)
  )
})

// RollbackToVersion 交互
export const RollbackToVersion = Interaction.create({
  name: 'RollbackToVersion',
  action: Action.create({ name: 'rollback' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'versionId',
        base: Version,
        isRef: true
      })
    ]
  }),
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminRole)
  )
}) 