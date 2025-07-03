import { Interaction, Action, Payload, PayloadItem } from 'interaqt'

export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({ name: 'createVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'version_number', required: true }),
      PayloadItem.create({ name: 'description', required: true })
    ]
  })
})

export const AddStyleToVersion = Interaction.create({
  name: 'AddStyleToVersion',
  action: Action.create({ name: 'addStyleToVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', required: true }),
      PayloadItem.create({ name: 'styleId', required: true })
    ]
  })
})

export const RemoveStyleFromVersion = Interaction.create({
  name: 'RemoveStyleFromVersion',
  action: Action.create({ name: 'removeStyleFromVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', required: true }),
      PayloadItem.create({ name: 'styleId', required: true })
    ]
  })
})

export const PublishVersion = Interaction.create({
  name: 'PublishVersion',
  action: Action.create({ name: 'publishVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', required: true })
    ]
  })
})

export const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',
  action: Action.create({ name: 'rollbackVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetVersionId', required: true })
    ]
  })
})

export const ArchiveVersion = Interaction.create({
  name: 'ArchiveVersion',
  action: Action.create({ name: 'archiveVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', required: true })
    ]
  })
})