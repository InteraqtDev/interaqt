import { Interaction, PayloadItem } from 'interaqt'

export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: 'create',
  payload: [
    PayloadItem.create({ name: 'versionNumber', required: true }),
    PayloadItem.create({ name: 'name', required: true }),
    PayloadItem.create({ name: 'description' }),
    PayloadItem.create({ name: 'styleIds' }),
    PayloadItem.create({ name: 'createdAt', required: true }),
    PayloadItem.create({ name: 'createdBy', required: true })
  ]
})

export const UpdateVersion = Interaction.create({
  name: 'UpdateVersion',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true }),
    PayloadItem.create({ name: 'name' }),
    PayloadItem.create({ name: 'description' }),
    PayloadItem.create({ name: 'styleUpdates' })
  ]
})

export const DeleteVersion = Interaction.create({
  name: 'DeleteVersion',
  action: 'delete',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true })
  ]
})

export const PublishVersion = Interaction.create({
  name: 'PublishVersion',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true }),
    PayloadItem.create({ name: 'publishedAt', required: true })
  ]
})

export const ArchiveVersion = Interaction.create({
  name: 'ArchiveVersion',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true })
  ]
})

export const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'targetVersionId', required: true }),
    PayloadItem.create({ name: 'publishedAt', required: true })
  ]
})

export const GetVersionList = Interaction.create({
  name: 'GetVersionList',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'filter' }),
    PayloadItem.create({ name: 'sort' }),
    PayloadItem.create({ name: 'page' }),
    PayloadItem.create({ name: 'limit' })
  ]
})

export const GetVersionDetail = Interaction.create({
  name: 'GetVersionDetail',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true })
  ]
})

export const CompareVersions = Interaction.create({
  name: 'CompareVersions',
  action: 'read',
  payload: [
    PayloadItem.create({ name: 'version1Id', required: true }),
    PayloadItem.create({ name: 'version2Id', required: true })
  ]
})

export const AddStyleToVersion = Interaction.create({
  name: 'AddStyleToVersion',
  action: 'create',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true }),
    PayloadItem.create({ name: 'styleId', required: true }),
    PayloadItem.create({ name: 'sortOrder' })
  ]
})

export const RemoveStyleFromVersion = Interaction.create({
  name: 'RemoveStyleFromVersion',
  action: 'delete',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true }),
    PayloadItem.create({ name: 'styleId', required: true })
  ]
})

export const UpdateStyleOrderInVersion = Interaction.create({
  name: 'UpdateStyleOrderInVersion',
  action: 'update',
  payload: [
    PayloadItem.create({ name: 'versionId', required: true }),
    PayloadItem.create({ name: 'styleUpdates', required: true })
  ]
})