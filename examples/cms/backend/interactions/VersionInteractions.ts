import { Interaction, Action, Payload, PayloadItem, Attributive, InteractionEventEntity } from 'interaqt'
import { Version } from '../entities/Version'
import { Style } from '../entities/Style'

// Create Version Interaction
export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({ name: 'createVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'description' })
    ]
  })
})

// Publish Version Interaction
export const PublishVersion = Interaction.create({
  name: 'PublishVersion',
  action: Action.create({ name: 'publishVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', base: Version, isRef: true, required: true })
    ]
  })
})

// Add Style to Version Interaction
export const AddStyleToVersion = Interaction.create({
  name: 'AddStyleToVersion',
  action: Action.create({ name: 'addStyleToVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', base: Version, isRef: true, required: true }),
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true }),
      PayloadItem.create({ name: 'order', required: true })
    ]
  })
})

// Remove Style from Version Interaction
export const RemoveStyleFromVersion = Interaction.create({
  name: 'RemoveStyleFromVersion',
  action: Action.create({ name: 'removeStyleFromVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', base: Version, isRef: true, required: true }),
      PayloadItem.create({ name: 'styleId', base: Style, isRef: true, required: true })
    ]
  })
})

// Reorder Styles in Version Interaction
export const ReorderStylesInVersion = Interaction.create({
  name: 'ReorderStylesInVersion',
  action: Action.create({ name: 'reorderStylesInVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'versionId', base: Version, isRef: true, required: true }),
      PayloadItem.create({ name: 'styleOrders', isCollection: true, required: true })
    ]
  })
})

// Permission control for version interactions
export const VersionPermissionCheck = Attributive.create({
  name: 'canManageVersions',
  content: function(target, context) {
    const userRole = context.user?.role
    const interactionName = context.event?.interactionName
    
    // Only admin can manage versions
    if (userRole === 'admin') {
      return ['CreateVersion', 'PublishVersion', 'AddStyleToVersion', 'RemoveStyleFromVersion', 'ReorderStylesInVersion'].includes(interactionName)
    }
    
    return false
  }
})