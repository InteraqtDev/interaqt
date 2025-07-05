import { Entity, Property, Transform, InteractionEventEntity, Count } from 'interaqt'

export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'versionNumber', type: 'number' }),
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ 
      name: 'isActive', 
      type: 'boolean', 
      defaultValue: () => false,
      computation: Transform.create({
        record: InteractionEventEntity,
        callback: function(event) {
          if (event.interactionName === 'PublishVersion') {
            // This version becomes active if it's the target
            if (event.payload.versionId === this.id) {
              return true
            }
            // All other versions become inactive
            return false
          }
          return undefined // Keep existing value
        }
      })
    }),
    Property.create({ name: 'createdAt', type: 'string' })
  ],
  // Transform in Entity's computation creates versions from interactions
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateVersion') {
        // Auto-increment version number (simplified - in real implementation would query existing versions)
        const versionNumber = Date.now() % 10000 // Simplified auto-increment
        return {
          versionNumber: versionNumber,
          label: event.payload.label,
          description: event.payload.description || '',
          isActive: false,
          createdAt: new Date().toISOString(),
          createdBy: { id: event.user.id }
        }
      }
      return null
    }
  })
})