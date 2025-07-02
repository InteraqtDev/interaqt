import { Interaction, Action, Payload, PayloadItem } from 'interaqt'

export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({
    name: 'CreateStyle'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'slug' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumb_key' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
})

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({
    name: 'UpdateStyle'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId' }),
      PayloadItem.create({ name: 'label', required: false }),
      PayloadItem.create({ name: 'description', required: false }),
      PayloadItem.create({ name: 'type', required: false }),
      PayloadItem.create({ name: 'thumb_key', required: false }),
      PayloadItem.create({ name: 'priority', required: false })
    ]
  })
})

export const UpdateStyleStatus = Interaction.create({
  name: 'UpdateStyleStatus',
  action: Action.create({
    name: 'UpdateStyleStatus'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
})

export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({
    name: 'DeleteStyle'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId' })
    ]
  })
})

export const ListStyles = Interaction.create({
  name: 'ListStyles',
  action: Action.create({
    name: 'ListStyles'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status', required: false }),
      PayloadItem.create({ name: 'type', required: false }),
      PayloadItem.create({ name: 'sortBy', required: false }),
      PayloadItem.create({ name: 'sortOrder', required: false }),
      PayloadItem.create({ name: 'limit', required: false }),
      PayloadItem.create({ name: 'offset', required: false })
    ]
  })
})

export const GetStyleDetail = Interaction.create({
  name: 'GetStyleDetail',
  action: Action.create({
    name: 'GetStyleDetail'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId' })
    ]
  })
})

export const UpdateStylePriorities = Interaction.create({
  name: 'UpdateStylePriorities',
  action: Action.create({
    name: 'UpdateStylePriorities'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'updates' })
    ]
  })
})

export const SearchStyles = Interaction.create({
  name: 'SearchStyles',
  action: Action.create({
    name: 'SearchStyles'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'searchText' }),
      PayloadItem.create({ name: 'searchFields', required: false }),
      PayloadItem.create({ name: 'limit', required: false }),
      PayloadItem.create({ name: 'offset', required: false })
    ]
  })
})