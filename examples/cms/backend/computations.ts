import { Property, Count, Transform, Any } from '@'
import { User, Version, Style } from './entities'
import { StyleVersionRelation, UserStylesRelation, UserVersionsRelation } from './relations'

// Add computed properties to entities after relations are defined

// User computed properties
User.properties.push(
  Property.create({
    name: 'stylesCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserStylesRelation
    })
  })
)

User.properties.push(
  Property.create({
    name: 'versionsCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserVersionsRelation
    })
  })
)

// Version computed properties
Version.properties.push(
  Property.create({
    name: 'stylesCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Count.create({
      record: StyleVersionRelation
    })
  })
)

// Count styles by status in version
Version.properties.push(
  Property.create({
    name: 'publishedStylesCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Count.create({
      record: StyleVersionRelation,
      attributeQuery: [['source', {attributeQuery: ['status']}]],
      callback: function(relation) {
        return relation.source.status === 'published'
      }
    })
  })
)

Version.properties.push(
  Property.create({
    name: 'draftStylesCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Count.create({
      record: StyleVersionRelation,
      attributeQuery: [['source', {attributeQuery: ['status']}]],
      callback: function(relation) {
        return relation.source.status === 'draft'
      }
    })
  })
)

Version.properties.push(
  Property.create({
    name: 'offlineStylesCount',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Count.create({
      record: StyleVersionRelation,
      attributeQuery: [['source', {attributeQuery: ['status']}]],
      callback: function(relation) {
        return relation.source.status === 'offline'
      }
    })
  })
)

// Check if version can be published (has at least one published style)
Version.properties.push(
  Property.create({
    name: 'canBePublished',
    type: 'boolean',
    collection: false,
    defaultValue: () => false,
    computedData: Any.create({
      record: StyleVersionRelation,
      attributeQuery: [['source', {attributeQuery: ['status']}]],
      callback: function(relation) {
        return relation.source.status === 'published'
      }
    })
  })
)

// Get maximum priority in version for new style priority calculation
Version.properties.push(
  Property.create({
    name: 'maxPriority',
    type: 'number',
    collection: false,
    defaultValue: () => 0,
    computedData: Transform.create({
      record: StyleVersionRelation,
      attributeQuery: [['source', {attributeQuery: ['priority']}]],
      callback: function(relations) {
        if (relations.length === 0) return 0
        return Math.max(...relations.map(r => r.source.priority || 0))
      }
    })
  })
)

// Calculate next style priority for new styles
Version.properties.push(
  Property.create({
    name: 'nextStylePriority',
    type: 'number',
    collection: false,
    defaultValue: () => 1,
    computedData: Transform.create({
      record: StyleVersionRelation,
      attributeQuery: [['source', {attributeQuery: ['priority']}]],
      callback: function(relations) {
        if (relations.length === 0) return 1
        const maxPriority = Math.max(...relations.map(r => r.source.priority || 0))
        return maxPriority + 1
      }
    })
  })
)