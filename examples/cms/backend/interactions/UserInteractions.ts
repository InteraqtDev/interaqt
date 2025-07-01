import { Interaction, Action, Payload, PayloadItem, createUserRoleAttributive } from 'interaqt'
import { User } from '../entities/User'

const AdminRole = createUserRoleAttributive({ name: 'admin' })

export const AdminLogin = Interaction.create({
  name: 'AdminLogin',
  action: Action.create({ name: 'login' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'credentials',
        base: User,
        isRef: false,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const ValidateAdminToken = Interaction.create({
  name: 'ValidateAdminToken',
  action: Action.create({ name: 'validate' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'token',
        base: User,
        isRef: false,
        required: true,
        isCollection: false
      })
    ]
  })
})

export const CheckPermissions = Interaction.create({
  name: 'CheckPermissions',
  action: Action.create({ name: 'check' }),
  userAttributives: AdminRole,
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'user',
        base: User,
        isRef: true,
        required: true,
        isCollection: false
      })
    ]
  })
})