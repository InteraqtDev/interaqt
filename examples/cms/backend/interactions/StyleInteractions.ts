import { Interaction, Action, Payload, PayloadItem } from 'interaqt'

export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description', required: true }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'thumb_key', required: true }),
      PayloadItem.create({ name: 'priority', required: true })
    ]
  })
})

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', required: true }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'slug' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumb_key' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
})

export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', required: true })
    ]
  })
})

export const OfflineStyle = Interaction.create({
  name: 'OfflineStyle',
  action: Action.create({ name: 'offlineStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', required: true })
    ]
  })
})

export const ReorderStyles = Interaction.create({
  name: 'ReorderStyles',
  action: Action.create({ name: 'reorderStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'reorderList', required: true })
    ]
  })
})