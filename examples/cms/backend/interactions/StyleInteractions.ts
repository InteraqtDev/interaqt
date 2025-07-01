import { Interaction, Action, Payload, PayloadItem, createUserRoleAttributive } from 'interaqt'
import { User } from '../entities/User'
import { Style } from '../entities/Style'
import { UserStyleRelation } from '../relations/UserStyleRelation'

const AdminRole = createUserRoleAttributive({ name: 'admin' })

export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'create' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'style',
        base: Style,
        isRef: false,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'update' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'style',
        base: Style,
        isRef: true,
        required: true,
        isCollection: false
      }),
      PayloadItem.create({
        name: 'updates',
        base: Style,
        isRef: false,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'delete' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'style',
        base: Style,
        isRef: true,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publish' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'style',
        base: Style,
        isRef: true,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const UnpublishStyle = Interaction.create({
  name: 'UnpublishStyle',
  action: Action.create({ name: 'unpublish' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'style',
        base: Style,
        isRef: true,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const ListStylesAdmin = Interaction.create({
  name: 'ListStylesAdmin',
  action: Action.create({ name: 'listAdmin' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: []
  })
})

export const GetPublishedStyles = Interaction.create({
  name: 'GetPublishedStyles',
  action: Action.create({ name: 'getPublished' }),
  payload: Payload.create({
    items: []
  })
})

export const BulkUpdatePriorities = Interaction.create({
  name: 'BulkUpdatePriorities',
  action: Action.create({ name: 'bulkUpdate' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styles',
        base: Style,
        isRef: true,
        required: true,
        isCollection: true
      })
    ]
  })
})