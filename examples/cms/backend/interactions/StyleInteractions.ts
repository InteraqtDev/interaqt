import { Interaction, Action, Payload, PayloadItem, Attributive, InteractionEventEntity } from 'interaqt'
import { Style } from '../entities/Style'
import { User } from '../entities/User'

// Create Style Interaction
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'thumb_key' }),
      PayloadItem.create({ name: 'priority', required: true })
    ]
  })
})

// Update Style Interaction
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'slug' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumb_key' }),
      PayloadItem.create({ name: 'priority' })
    ]
  })
})

// Publish Style Interaction
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true })
    ]
  })
})

// Unpublish Style Interaction
export const UnpublishStyle = Interaction.create({
  name: 'UnpublishStyle',
  action: Action.create({ name: 'unpublishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true })
    ]
  })
})

// Delete Style Interaction
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true })
    ]
  })
})

// Reorder Styles Interaction
export const ReorderStyles = Interaction.create({
  name: 'ReorderStyles',
  action: Action.create({ name: 'reorderStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleOrders', isCollection: true, required: true })
    ]
  })
})

// Permission control for style interactions
export const StylePermissionCheck = Attributive.create({
  name: 'canManageStyles',
  content: function(target, context) {
    const userRole = context.user?.role
    const interactionName = context.event?.interactionName
    
    // Admin has full access
    if (userRole === 'admin') return true
    
    // Editor can manage styles but not delete them
    if (userRole === 'editor') {
      return ['CreateStyle', 'UpdateStyle', 'PublishStyle', 'UnpublishStyle', 'ReorderStyles'].includes(interactionName)
    }
    
    // Viewer has no write access
    return false
  }
})