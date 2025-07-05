import { Relation, Property, Transform, InteractionEventEntity } from 'interaqt'
import { Style } from '../entities/Style'
import { Version } from '../entities/Version'

// Style 和 Version 的多对多关系，用于存储版本快照
export const StyleVersionRelation = Relation.create({
  source: Style,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'styles',
  type: 'n:n',
  properties: [
    // 快照数据 - 保存创建版本时的 Style 状态
    Property.create({
      name: 'snapshotData',
      type: 'string' // JSON 格式存储完整的 Style 数据
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    })
  ],
  // Transform to create snapshots when version is created
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['interactionName', 'payload'],
    callback: function(event) {
      if (event.interactionName === 'CreateVersion') {
        // 这里应该查询所有 published 的 Style 并创建快照
        // 实际实现需要在 Interaction 中处理
        return null
      }
      return null
    }
  })
}) 