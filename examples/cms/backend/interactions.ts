import { 
  Interaction, 
  Action, 
  Payload, 
  Controller, 
  Attributive,
  PayloadItem,
  CreateAction,
  UpdateAction,
  DeleteAction
} from '@interaqt/runtime'
import { Style, Version, User } from './entities'
import { v4 as uuid } from 'uuid'

const AdminAttributive = Attributive.create({
  name: 'AdminOnly',
  content: async (ctx) => {
    return ctx.user?.role === 'admin'
  }
})

const EditorAttributive = Attributive.create({
  name: 'EditorOrAdmin',
  content: async (ctx) => {
    return ctx.user?.role === 'admin' || ctx.user?.role === 'editor'
  }
})

const ViewerAttributive = Attributive.create({
  name: 'AnyUser',
  content: async (ctx) => {
    return !!ctx.user
  }
})

export const CreateStyleInteraction = Interaction.create({
  name: 'CreateStyle',
  action: CreateAction.create({
    entity: Style
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'label',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'slug',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'type',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'thumb_key',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'priority',
        base: 'number',
        required: true
      }),
      PayloadItem.create({
        name: 'status',
        base: 'string',
        required: false
      })
    ]
  }),
  attributives: [EditorAttributive],
  dataAttributives: {
    id: () => uuid(),
    status: (payload) => payload.status || 'draft',
    created_at: () => new Date().toISOString(),
    updated_at: () => new Date().toISOString()
  }
})

export const UpdateStyleInteraction = Interaction.create({
  name: 'UpdateStyle',
  action: UpdateAction.create({
    entity: Style,
    recordSelection: 'byId'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'id',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'label',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'slug',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'description',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'type',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'thumb_key',
        base: 'string',
        required: false
      }),
      PayloadItem.create({
        name: 'priority',
        base: 'number',
        required: false
      })
    ]
  }),
  attributives: [EditorAttributive],
  dataAttributives: {
    updated_at: () => new Date().toISOString()
  }
})

export const UpdateStyleStatusInteraction = Interaction.create({
  name: 'UpdateStyleStatus',
  action: UpdateAction.create({
    entity: Style,
    recordSelection: 'byId'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'id',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'status',
        base: 'string',
        required: true
      })
    ]
  }),
  attributives: [EditorAttributive],
  dataAttributives: {
    updated_at: () => new Date().toISOString()
  }
})

export const DeleteStyleInteraction = Interaction.create({
  name: 'DeleteStyle',
  action: DeleteAction.create({
    entity: Style,
    recordSelection: 'byId'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'id',
        base: 'string',
        required: true
      })
    ]
  }),
  attributives: [AdminAttributive]
})

export const ReorderStylesInteraction = Interaction.create({
  name: 'ReorderStyles',
  action: Action.create({
    name: 'ReorderStyles'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'style_id',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'new_position',
        base: 'number',
        required: true
      })
    ]
  }),
  attributives: [EditorAttributive]
})

export const BulkCreateStylesInteraction = Interaction.create({
  name: 'BulkCreateStyles',
  action: Action.create({
    name: 'BulkCreateStyles'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styles',
        base: 'object',
        required: true
      })
    ]
  }),
  attributives: [AdminAttributive]
})

export const CreateVersionInteraction = Interaction.create({
  name: 'CreateVersion',
  action: CreateAction.create({
    entity: Version
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'version_number',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        base: 'string',
        required: false
      })
    ]
  }),
  attributives: [AdminAttributive],
  dataAttributives: {
    id: () => uuid(),
    created_at: () => new Date().toISOString(),
    is_current: () => true,
    created_by: (payload, ctx) => ctx.user?.id || 'system'
  }
})

export const RollbackToVersionInteraction = Interaction.create({
  name: 'RollbackToVersion',
  action: Action.create({
    name: 'RollbackToVersion'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'version_id',
        base: 'string',
        required: true
      })
    ]
  }),
  attributives: [AdminAttributive]
})

export const PublishStyleInteraction = Interaction.create({
  name: 'PublishStyle',
  action: UpdateAction.create({
    entity: Style,
    recordSelection: 'byId'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'id',
        base: 'string',
        required: true
      })
    ]
  }),
  attributives: [EditorAttributive],
  dataAttributives: {
    status: () => 'published',
    updated_at: () => new Date().toISOString()
  }
})

export const TakeStyleOfflineInteraction = Interaction.create({
  name: 'TakeStyleOffline',
  action: UpdateAction.create({
    entity: Style,
    recordSelection: 'byId'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'id',
        base: 'string',
        required: true
      })
    ]
  }),
  attributives: [EditorAttributive],
  dataAttributives: {
    status: () => 'offline',
    updated_at: () => new Date().toISOString()
  }
})

export const CreateUserInteraction = Interaction.create({
  name: 'CreateUser',
  action: CreateAction.create({
    entity: User
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'username',
        base: 'string',
        required: true
      }),
      PayloadItem.create({
        name: 'role',
        base: 'string',
        required: true
      })
    ]
  }),
  attributives: [AdminAttributive],
  dataAttributives: {
    id: () => uuid(),
    created_at: () => new Date().toISOString()
  }
})