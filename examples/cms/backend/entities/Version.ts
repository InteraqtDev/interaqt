import { Entity, Property, Transform, InteractionEventEntity } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({
      name: 'versionNumber',
      type: 'number'
    }),
    Property.create({
      name: 'publishedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'isActive',
      type: 'boolean',
      defaultValue: () => false
    }),
    Property.create({
      name: 'comment',
      type: 'string'
    })
  ],
  // Transform to create Version from CreateVersion interaction
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload', 'user'],
    callback: function(event) {
      if (event.interactionName === 'CreateVersion') {
        return {
          versionNumber: Date.now(), // 使用时间戳作为版本号，确保递增
          comment: event.payload.comment || 'Version created',
          isActive: true,
          publishedBy: { id: event.user.id }
        }
      }
      if (event.interactionName === 'RollbackToVersion') {
        // 回滚时创建新版本
        return {
          versionNumber: Date.now(),
          comment: `Rollback to version ${event.payload.versionId}`,
          isActive: true,
          publishedBy: { id: event.user.id }
        }
      }
      return null
    }
  })
}) 