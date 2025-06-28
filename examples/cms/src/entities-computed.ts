import { Entity, Property, Count, Transform, Any, Every } from 'interaqt';
import { User, Style, Version } from './entities.js';
import { UserStyleRelation, UserVersionRelation } from './relations.js';

// Add computed properties to the existing Style entity
Style.properties.push(
  Property.create({
    name: 'isPublished',
    type: 'boolean',
    defaultValue: () => false,
    computed: (record) => record.status === 'published'
  }),
  Property.create({
    name: 'isDraft',
    type: 'boolean',
    defaultValue: () => true,
    computed: (record) => record.status === 'draft'
  }),
  Property.create({
    name: 'isOffline',
    type: 'boolean',
    defaultValue: () => false,
    computed: (record) => record.status === 'offline'
  }),
  Property.create({
    name: 'displayPriority',
    type: 'string',
    defaultValue: () => 'Normal',
    computed: (record) => {
      if (record.priority >= 100) return 'High';
      if (record.priority >= 50) return 'Medium';
      return 'Normal';
    }
  })
);

// Add computed properties to the existing User entity
User.properties.push(
  Property.create({
    name: 'totalStylesCreated',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserStyleRelation,
      direction: 'target'
    })
  }),
  Property.create({
    name: 'publishedStylesCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserStyleRelation,
      direction: 'target',
      attributeQuery: [['target', { attributeQuery: ['status'] }]],
      callback: function(relation) {
        return relation.target.status === 'published';
      }
    })
  }),
  Property.create({
    name: 'draftStylesCount',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserStyleRelation,
      direction: 'target',
      attributeQuery: [['target', { attributeQuery: ['status'] }]],
      callback: function(relation) {
        return relation.target.status === 'draft';
      }
    })
  }),
  Property.create({
    name: 'versionsCreated',
    type: 'number',
    defaultValue: () => 0,
    computedData: Count.create({
      record: UserVersionRelation,
      direction: 'target'
    })
  }),
  Property.create({
    name: 'canDelete',
    type: 'boolean',
    defaultValue: () => false,
    computed: (record) => record.role === 'Admin'
  }),
  Property.create({
    name: 'canCreateVersion',
    type: 'boolean',
    defaultValue: () => false,
    computed: (record) => record.role === 'Admin'
  }),
  Property.create({
    name: 'canSetOffline',
    type: 'boolean',
    defaultValue: () => false,
    computed: (record) => record.role === 'Admin'
  })
);

// Add computed properties to the existing Version entity
Version.properties.push(
  Property.create({
    name: 'stylesCount',
    type: 'number',
    defaultValue: () => 0,
    computed: (record) => {
      if (!record.snapshot || !record.snapshot.styles) return 0;
      return record.snapshot.styles.length;
    }
  }),
  Property.create({
    name: 'formattedCreatedAt',
    type: 'string',
    defaultValue: () => '',
    computed: (record) => {
      if (!record.createdAt) return '';
      return new Date(record.createdAt).toLocaleString();
    }
  }),
  Property.create({
    name: 'isLatest',
    type: 'boolean',
    defaultValue: () => false
    // This would be computed based on comparison with other versions
    // We'll implement this logic in the frontend or through a global computation
  })
);

// Computed properties are now added to the original entities