import { 
  Interaction, Action, Payload, PayloadItem
} from 'interaqt'
import { Style, Version, User } from './entities'

// === Style Management Interactions ===

export const CreateStyleInteraction = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'label',
        required: true
      }),
      PayloadItem.create({
        name: 'slug',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        required: true
      }),
      PayloadItem.create({
        name: 'type',
        required: true
      }),
      PayloadItem.create({
        name: 'thumbKey',
        required: false
      }),
      PayloadItem.create({
        name: 'priority',
        required: false
      })
    ]
  })
})

export const UpdateStyleInteraction = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        required: true
      }),
      PayloadItem.create({
        name: 'label',
        required: false
      }),
      PayloadItem.create({
        name: 'slug',
        required: false
      }),
      PayloadItem.create({
        name: 'description',
        required: false
      }),
      PayloadItem.create({
        name: 'type',
        required: false
      }),
      PayloadItem.create({
        name: 'thumbKey',
        required: false
      }),
      PayloadItem.create({
        name: 'priority',
        required: false
      })
    ]
  })
})

export const DeleteStyleInteraction = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        required: true
      })
    ]
  })
})

export const PublishStyleInteraction = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        required: true
      })
    ]
  })
})

export const UnpublishStyleInteraction = Interaction.create({
  name: 'UnpublishStyle',
  action: Action.create({ name: 'unpublish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        required: true
      })
    ]
  })
})

export const ReorderStylesInteraction = Interaction.create({
  name: 'ReorderStyles',
  action: Action.create({ name: 'reorder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleUpdates',
        isCollection: true,
        required: true
      })
    ]
  })
})

// === Query Interactions ===

export const ListStylesInteraction = Interaction.create({
  name: 'ListStyles',
  action: Action.create({ name: 'list' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'filters',
        required: false
      }),
      PayloadItem.create({
        name: 'sortBy',
        required: false
      }),
      PayloadItem.create({
        name: 'sortOrder',
        required: false
      }),
      PayloadItem.create({
        name: 'limit',
        required: false
      }),
      PayloadItem.create({
        name: 'offset',
        required: false
      })
    ]
  })
})

export const GetStyleInteraction = Interaction.create({
  name: 'GetStyle',
  action: Action.create({ name: 'get' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'styleId',
        required: true
      })
    ]
  })
})

export const SearchStylesInteraction = Interaction.create({
  name: 'SearchStyles',
  action: Action.create({ name: 'search' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'searchTerm',
        required: true
      }),
      PayloadItem.create({
        name: 'searchFields',
        isCollection: true,
        required: false
      }),
      PayloadItem.create({
        name: 'limit',
        required: false
      })
    ]
  })
})

// === Version Management Interactions ===

export const CreateVersionInteraction = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'versionName',
        required: true
      }),
      PayloadItem.create({
        name: 'description',
        required: true
      }),
      PayloadItem.create({
        name: 'snapshot',
        required: false
      })
    ]
  })
})

export const PublishVersionInteraction = Interaction.create({
  name: 'PublishVersion',
  action: Action.create({ name: 'publish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'versionId',
        required: true
      })
    ]
  })
})

export const RollbackVersionInteraction = Interaction.create({
  name: 'RollbackVersion',
  action: Action.create({ name: 'rollback' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'targetVersionId',
        required: true
      })
    ]
  })
})

export const ViewVersionHistoryInteraction = Interaction.create({
  name: 'ViewVersionHistory',
  action: Action.create({ name: 'list' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'limit',
        required: false
      }),
      PayloadItem.create({
        name: 'offset',
        required: false
      })
    ]
  })
})