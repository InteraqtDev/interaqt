import { Relation, Transform, InteractionEventEntity } from 'interaqt'
import { v4 as uuid } from 'uuid'
import { User } from '../entities/User'
import { Style } from '../entities/Style'

export const UserStyleRelation = Relation.create({
  source: User,
  sourceProperty: 'styles',
  target: Style,
  targetProperty: 'createdBy',
  type: '1:n',
  properties: [],
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(interactionEvent) {
      if (interactionEvent.interactionName === 'CreateStyle') {
        // For CreateStyle, create new Style entity and relation
        const styleData = interactionEvent.payload.style
        return {
          source: interactionEvent.user,
          target: {
            id: styleData.id || uuid(),  // Generate ID if not provided
            label: styleData.label,
            slug: styleData.slug,
            description: styleData.description,
            type: styleData.type,
            thumbKey: styleData.thumbKey,
            priority: styleData.priority,
            status: 'draft',
            createdAt: interactionEvent.createdAt,
            updatedAt: interactionEvent.createdAt
          }
        }
      } else if (interactionEvent.interactionName === 'UpdateStyle') {
        // For UpdateStyle, update existing Style entity
        const payload = interactionEvent.payload
        return {
          source: interactionEvent.user,
          target: {
            id: payload.style.id,
            ...payload.updates,
            updatedAt: interactionEvent.createdAt
          }
        }
      } else if (interactionEvent.interactionName === 'PublishStyle') {
        // For PublishStyle, update Style status
        return {
          source: interactionEvent.user,
          target: {
            id: interactionEvent.payload.style.id,
            status: 'published',
            updatedAt: interactionEvent.createdAt
          }
        }
      } else if (interactionEvent.interactionName === 'UnpublishStyle') {
        // For UnpublishStyle, update Style status
        return {
          source: interactionEvent.user,
          target: {
            id: interactionEvent.payload.style.id,
            status: 'offline',
            updatedAt: interactionEvent.createdAt
          }
        }
      } else if (interactionEvent.interactionName === 'DeleteStyle') {
        // For DeleteStyle, delete the Style entity
        return {
          source: interactionEvent.user,
          target: {
            id: interactionEvent.payload.style.id,
            _delete: true
          }
        }
      }
      return null
    }
  })
})