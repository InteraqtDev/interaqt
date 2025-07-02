import { Interaction, Action, Payload, PayloadItem } from 'interaqt'

export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({
    name: 'CreateVersion'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'styleIds' })
    ]
  })
})

export const PublishVersion = Interaction.create({
  name: 'PublishVersion',
  action: Action.create({
    name: 'PublishVersion'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId' })
    ]
  })
})

export const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',
  action: Action.create({
    name: 'RollbackVersion'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId' })
    ]
  })
})

export const ListVersions = Interaction.create({
  name: 'ListVersions',
  action: Action.create({
    name: 'ListVersions'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'limit', required: false }),
      PayloadItem.create({ name: 'offset', required: false })
    ]
  })
})

export const GetVersionDetail = Interaction.create({
  name: 'GetVersionDetail',
  action: Action.create({
    name: 'GetVersionDetail'
  }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId' })
    ]
  })
})