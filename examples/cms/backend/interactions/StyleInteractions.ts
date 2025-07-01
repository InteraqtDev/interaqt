import { Interaction, PayloadItem } from 'interaqt'

export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: 'create',
  payload: [
    PayloadItem.create({ name: 'label', required: true }),
    PayloadItem.create({ name: 'slug', required: true }),
    PayloadItem.create({ name: 'description' }),
    PayloadItem.create({ name: 'type', required: true }),
    PayloadItem.create({ name: 'thumbKey' }),
    PayloadItem.create({ name: 'priority' }),
    PayloadItem.create({ name: 'createdAt', required: true }),
    PayloadItem.create({ name: 'updatedAt', required: true }),
    PayloadItem.create({ name: 'createdBy', required: true })
  ]
})

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'styleId', required: true }),
    PayloadItem.create({ name: 'label' }),
    PayloadItem.create({ name: 'slug' }),
    PayloadItem.create({ name: 'description' }),
    PayloadItem.create({ name: 'type' }),
    PayloadItem.create({ name: 'thumbKey' }),
    PayloadItem.create({ name: 'priority' }),
    PayloadItem.create({ name: 'updatedAt', required: true })
  ]
})

export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: 'delete',
  payload: [
    PayloadItem.create({ name: 'styleId', required: true })
  ]
})

export const UpdateStyleStatus = Interaction.create({
  name: 'UpdateStyleStatus',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'styleId', required: true }),
    PayloadItem.create({ name: 'status', required: true }),
    PayloadItem.create({ name: 'updatedAt', required: true })
  ]
})

export const UpdateStylePriority = Interaction.create({
  name: 'UpdateStylePriority',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'styleUpdates', required: true }),
    PayloadItem.create({ name: 'updatedAt', required: true })
  ]
})

export const BatchUpdateStyles = Interaction.create({
  name: 'BatchUpdateStyles',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'styleIds', required: true }),
    PayloadItem.create({ name: 'updates', required: true }),
    PayloadItem.create({ name: 'updatedAt', required: true })
  ]
})

export const GetStyleList = Interaction.create({
  name: 'GetStyleList',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'filter' }),
    PayloadItem.create({ name: 'sort' }),
    PayloadItem.create({ name: 'page' }),
    PayloadItem.create({ name: 'limit' })
  ]
})

export const GetStyleDetail = Interaction.create({
  name: 'GetStyleDetail',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'styleId', required: true })
  ]
})

export const SearchStyles = Interaction.create({
  name: 'SearchStyles',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'query', required: true }),
    PayloadItem.create({ name: 'filters' }),
    PayloadItem.create({ name: 'page' }),
    PayloadItem.create({ name: 'limit' })
  ]
})