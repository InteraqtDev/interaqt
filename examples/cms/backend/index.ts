import { 
  Entity, Property, Relation, Interaction, Action, Payload, PayloadItem,
  Transform, StateMachine, StateNode, StateTransfer, InteractionEventEntity,
  MatchExp, Attributive, BoolExp, boolExpToAttributives
} from 'interaqt';

// States for style status management
const DraftState = StateNode.create({ name: 'draft' });
const PublishedState = StateNode.create({ name: 'published' });
const OfflineState = StateNode.create({ name: 'offline' });

// Update states
const UpdatedState = StateNode.create({ name: 'updated' });

// User Entity
export const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string', defaultValue: () => 'viewer' }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() })
  ]
});

// Style Entity - will be defined with computations after interactions
export const Style = Entity.create({
  name: 'Style',
  properties: [
    Property.create({ name: 'label', type: 'string' }),
    Property.create({ name: 'slug', type: 'string' }),
    Property.create({ name: 'description', type: 'string' }),
    Property.create({ name: 'type', type: 'string' }),
    Property.create({ name: 'thumbKey', type: 'string' }),
    Property.create({ name: 'priority', type: 'number', defaultValue: () => 0 }),
    Property.create({ 
      name: 'status', 
      type: 'string', 
      defaultValue: () => 'draft'
    }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() }),
    Property.create({ 
      name: 'updatedAt', 
      type: 'bigint', 
      defaultValue: () => Date.now()
    })
  ]
});

// Version Entity for version management
export const Version = Entity.create({
  name: 'Version',
  properties: [
    Property.create({ name: 'versionNumber', type: 'number', defaultValue: () => 1 }),
    Property.create({ name: 'snapshotData', type: 'object' }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() })
  ]
});

// PublishedStyle Entity - filtered entity for published styles only
export const PublishedStyle = Entity.create({
  name: 'PublishedStyle',
  sourceEntity: Style,
  filterCondition: MatchExp.atom({
    key: 'status',
    value: ['=', 'published']
  })
});

// User-Style Relation (creator/owner)
export const UserStyleRelation = Relation.create({
  source: User,
  sourceProperty: 'styles',
  target: Style,
  targetProperty: 'creator',
  type: '1:n',
  properties: [
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() })
  ]
});

// Style-Version Relation (version history)
export const StyleVersionRelation = Relation.create({
  source: Style,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'styles',
  type: 'n:n',
  properties: [
    Property.create({ name: 'isActive', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() })
  ]
});

// User-Version Relation (version creator)
export const UserVersionRelation = Relation.create({
  source: User,
  sourceProperty: 'versions',
  target: Version,
  targetProperty: 'creator',
  type: '1:n',
  properties: [
    Property.create({ name: 'createdAt', type: 'bigint', defaultValue: () => Date.now() })
  ]
});

// === Attributives ===

// Role-based attributives
const AdminRole = Attributive.create({
  name: 'AdminRole',
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'admin';
  }
});

const EditorRole = Attributive.create({
  name: 'EditorRole', 
  content: function(targetUser, eventArgs) {
    return eventArgs.user?.role === 'editor';
  }
});

const AdminOrEditorRole = Attributive.create({
  name: 'AdminOrEditorRole',
  content: function(targetUser, eventArgs) {
    const role = eventArgs.user?.role;
    return role === 'admin' || role === 'editor';
  }
});

// Data validation attributives
const UniqueSlug = Attributive.create({
  name: 'UniqueSlug',
  content: async function(slug, eventArgs) {
    if (!slug) return true; // Let required validation handle empty slug
    
    const { MatchExp } = this.globals;
    const existingStyle = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'slug', value: ['=', slug] }),
      undefined,
      ['id']
    );
    
    return !existingStyle; // Return true if slug is unique
  }
});

// Style ownership attributive
const StyleCreator = Attributive.create({
  name: 'StyleCreator',
  content: async function(targetUser, eventArgs) {
    const styleId = eventArgs.payload.style?.id;
    if (!styleId) return false;
    
    const { MatchExp } = this.globals;
    const style = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', styleId] }),
      undefined,
      [['creator', { attributeQuery: ['id'] }]]
    );
    
    return style && style.creator.id === eventArgs.user.id;
  }
});

// Style status attributives
const StyleIsDraft = Attributive.create({
  name: 'StyleIsDraft',
  content: async function(style, eventArgs) {
    if (!style?.id) return false;
    
    const { MatchExp } = this.globals;
    const styleData = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['status']
    );
    
    return styleData && styleData.status === 'draft';
  }
});

const StyleIsPublished = Attributive.create({
  name: 'StyleIsPublished',
  content: async function(style, eventArgs) {
    if (!style?.id) return false;
    
    const { MatchExp } = this.globals;
    const styleData = await this.system.storage.findOne('Style',
      MatchExp.atom({ key: 'id', value: ['=', style.id] }),
      undefined,
      ['status']
    );
    
    return styleData && styleData.status === 'published';
  }
});

// Style Management Interactions

// Create Style
export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'createStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ 
        name: 'slug', 
        required: true,
        attributives: UniqueSlug  // Validate slug uniqueness
      }),
      PayloadItem.create({ name: 'description', required: false }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'thumbKey', required: false }),
      PayloadItem.create({ name: 'priority', required: false })
    ]
  }),
  userAttributives: AdminOrEditorRole  // Only admin or editor can create styles
});

// Update Style
export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'updateStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true
      }),
      PayloadItem.create({ name: 'label', required: false }),
      PayloadItem.create({ name: 'slug', required: false }),
      PayloadItem.create({ name: 'description', required: false }),
      PayloadItem.create({ name: 'type', required: false }),
      PayloadItem.create({ name: 'thumbKey', required: false }),
      PayloadItem.create({ name: 'priority', required: false })
    ]
  }),
  // Admin can update any style, editor can only update own styles
  userAttributives: boolExpToAttributives(
    BoolExp.atom(AdminRole)
      .or(BoolExp.atom(EditorRole).and(BoolExp.atom(StyleCreator)))
  )
});

// Delete Style
export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'deleteStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true
      })
    ]
  }),
  userAttributives: AdminRole  // Only admin can delete styles
});

// Publish Style
export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true,
        attributives: StyleIsDraft  // Can only publish draft styles
      })
    ]
  }),
  userAttributives: AdminRole  // Only admin can publish styles
});

// Unpublish Style
export const UnpublishStyle = Interaction.create({
  name: 'UnpublishStyle',
  action: Action.create({ name: 'unpublishStyle' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true,
        attributives: StyleIsPublished  // Can only unpublish published styles
      })
    ]
  }),
  userAttributives: AdminRole  // Only admin can unpublish styles
});

// Reorder Styles
export const ReorderStyles = Interaction.create({
  name: 'ReorderStyles',
  action: Action.create({ name: 'reorderStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleOrders',
        isCollection: true,
        required: true
      })
    ]
  }),
  userAttributives: AdminRole  // Only admin can reorder styles
});

// List Published Styles - accessible to all users
export const ListPublishedStyles = Interaction.create({
  name: 'ListPublishedStyles',
  action: Action.create({ name: 'listPublishedStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'page', required: false }),
      PayloadItem.create({ name: 'limit', required: false })
    ]
  })
  // No userAttributives - accessible to all users
});

// List All Styles (for admin)
export const ListAllStyles = Interaction.create({
  name: 'ListAllStyles',
  action: Action.create({ name: 'listAllStyles' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'page', required: false }),
      PayloadItem.create({ name: 'limit', required: false }),
      PayloadItem.create({ name: 'status', required: false })
    ]
  }),
  userAttributives: AdminOrEditorRole  // Admin and editors can list all styles
});

// Get Style Details
export const GetStyleDetails = Interaction.create({
  name: 'GetStyleDetails',
  action: Action.create({ name: 'getStyleDetails' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true
      })
    ]
  })
});

// Version Management Interactions

// Get Style Versions
export const GetStyleVersions = Interaction.create({
  name: 'GetStyleVersions',
  action: Action.create({ name: 'getStyleVersions' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true
      })
    ]
  })
});

// Rollback Style Version
export const RollbackStyleVersion = Interaction.create({
  name: 'RollbackStyleVersion',
  action: Action.create({ name: 'rollbackStyleVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true
      }),
      PayloadItem.create({ 
        name: 'targetVersion',
        base: Version,
        isRef: true,
        required: true
      })
    ]
  })
});

// File Management Interactions

// Upload Style Thumbnail
export const UploadStyleThumbnail = Interaction.create({
  name: 'UploadStyleThumbnail',
  action: Action.create({ name: 'uploadStyleThumbnail' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'style',
        base: Style,
        isRef: true,
        required: true
      }),
      PayloadItem.create({ name: 'imageFile', required: true })
    ]
  })
});

// Now add computations to Style entity
Style.computation = Transform.create({
  record: InteractionEventEntity,
  callback: function(event) {
    if (event.interactionName === 'CreateStyle') {
      return {
        label: event.payload.label,
        slug: event.payload.slug,
        description: event.payload.description || '',
        type: event.payload.type,
        thumbKey: event.payload.thumbKey || '',
        priority: event.payload.priority || 0,
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        creator: event.user // Creates UserStyleRelation automatically
      };
    }
  }
});

// Add StateMachine computation for status updates
const statusProperty = Style.properties.find(p => p.name === 'status');
if (statusProperty) {
  statusProperty.computation = StateMachine.create({
    states: [DraftState, PublishedState, OfflineState],
    defaultState: DraftState,
    transfers: [
      StateTransfer.create({
        trigger: PublishStyle,
        current: DraftState,
        next: PublishedState,
        computeTarget: (event) => ({ id: event.payload.style.id })
      }),
      StateTransfer.create({
        trigger: UnpublishStyle,
        current: PublishedState,
        next: OfflineState,
        computeTarget: (event) => ({ id: event.payload.style.id })
      })
    ]
  });
}

// Add StateMachine computation for updatedAt
const updatedAtProperty = Style.properties.find(p => p.name === 'updatedAt');
if (updatedAtProperty) {
  updatedAtProperty.computation = StateMachine.create({
    states: [UpdatedState],
    defaultState: UpdatedState,
    transfers: [
      StateTransfer.create({
        trigger: UpdateStyle,
        current: UpdatedState,
        next: UpdatedState,
        computeTarget: (event) => ({ id: event.payload.style.id })
      })
    ]
  });
}

// UserStyleRelation is created automatically when Style includes creator reference

export const entities = [User, Style, Version, PublishedStyle]
export const relations = [UserStyleRelation, StyleVersionRelation, UserVersionRelation]
export const activities = []
export const interactions = [
  CreateStyle, UpdateStyle, DeleteStyle, PublishStyle, UnpublishStyle,
  ReorderStyles, ListPublishedStyles, ListAllStyles, GetStyleDetails,
  GetStyleVersions, RollbackStyleVersion, UploadStyleThumbnail
]
export const dicts = []