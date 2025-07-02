import { Relation, Transform, InteractionEventEntity } from 'interaqt'
import { Style } from '../entities/Style'

// This is a special relation that creates Style entities when CreateStyle interaction is called
export const StyleCreationRelation = Relation.create({
  source: Style,
  sourceProperty: '_created',
  target: Style,
  targetProperty: '_creator',
  type: '1:1',
  computation: Transform.create({
    record: InteractionEventEntity,
    attributeQuery: ['*'],
    callback: function(event) {
      if (event.interactionName === 'CreateStyle') {
        return {
          source: {
            label: event.payload.label,
            slug: event.payload.slug,
            description: event.payload.description,
            type: event.payload.type,
            thumb_key: event.payload.thumb_key,
            priority: event.payload.priority,
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          target: {
            label: event.payload.label,
            slug: event.payload.slug,
            description: event.payload.description,
            type: event.payload.type,
            thumb_key: event.payload.thumb_key,
            priority: event.payload.priority,
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        };
      }
      return null;
    }
  })
})