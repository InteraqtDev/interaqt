import { Interaction, Action, Payload, PayloadItem, createUserRoleAttributive } from 'interaqt'
import { User } from '../entities/User'
import { Version } from '../entities/Version'
import { UserVersionRelation } from '../relations/UserVersionRelation'

const AdminRole = createUserRoleAttributive({ name: 'admin' })

export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({ name: 'create' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'version',
        base: Version,
        isRef: false,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const ListVersions = Interaction.create({
  name: 'ListVersions',
  action: Action.create({ name: 'list' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: []
  })
})

export const RollbackToVersion = Interaction.create({
  name: 'RollbackToVersion',
  action: Action.create({ name: 'rollback' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'version',
        base: Version,
        isRef: true,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const DeleteVersion = Interaction.create({
  name: 'DeleteVersion',
  action: Action.create({ name: 'delete' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'version',
        base: Version,
        isRef: true,
        required: true,
        isCollection: false
      })
    ]
  })
})