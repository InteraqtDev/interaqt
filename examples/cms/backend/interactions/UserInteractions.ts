import { Interaction, PayloadItem } from 'interaqt'

export const CreateUser = Interaction.create({
  name: 'CreateUser',
  action: 'create',
  payload: [
    PayloadItem.create({ name: 'username', required: true }),
    PayloadItem.create({ name: 'email', required: true }),
    PayloadItem.create({ name: 'role', required: true }),
    PayloadItem.create({ name: 'isActive' }),
    PayloadItem.create({ name: 'createdAt', required: true })
  ]
})

export const UpdateUser = Interaction.create({
  name: 'UpdateUser',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'userId', required: true }),
    PayloadItem.create({ name: 'username' }),
    PayloadItem.create({ name: 'email' }),
    PayloadItem.create({ name: 'role' }),
    PayloadItem.create({ name: 'isActive' })
  ]
})

export const DeleteUser = Interaction.create({
  name: 'DeleteUser',
  action: 'delete',
  payload: [
    PayloadItem.create({ name: 'userId', required: true })
  ]
})

export const GetUserList = Interaction.create({
  name: 'GetUserList',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'filter' }),
    PayloadItem.create({ name: 'page' }),
    PayloadItem.create({ name: 'limit' })
  ]
})

export const GetCurrentUser = Interaction.create({
  name: 'GetCurrentUser',
  action: 'read',
  payload: []
})

export const UpdateProfile = Interaction.create({
  name: 'UpdateProfile',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'username' }),
    PayloadItem.create({ name: 'email' })
  ]
})