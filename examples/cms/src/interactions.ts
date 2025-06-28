import { Interaction, Action, Payload, PayloadItem } from 'interaqt';
import { StyleComputed, UserComputed, VersionComputed } from './entities-computed.js';

// Style CRUD Interactions

export const CreateStyle = Interaction.create({
  name: 'CreateStyle',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'label', required: true }),
      PayloadItem.create({ name: 'slug', required: true }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority', type: 'number' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
});

export const UpdateStyle = Interaction.create({
  name: 'UpdateStyle',
  action: Action.create({ name: 'update' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true }),
      PayloadItem.create({ name: 'label' }),
      PayloadItem.create({ name: 'slug' }),
      PayloadItem.create({ name: 'description' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'thumbKey' }),
      PayloadItem.create({ name: 'priority', type: 'number' }),
      PayloadItem.create({ name: 'status' })
    ]
  })
});

export const DeleteStyle = Interaction.create({
  name: 'DeleteStyle',
  action: Action.create({ name: 'delete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true })
    ]
  })
});

export const GetStyleList = Interaction.create({
  name: 'GetStyleList',
  action: Action.create({ name: 'query' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'page', type: 'number' }),
      PayloadItem.create({ name: 'limit', type: 'number' }),
      PayloadItem.create({ name: 'sortBy' }),
      PayloadItem.create({ name: 'sortOrder' }),
      PayloadItem.create({ name: 'search' })
    ]
  })
});

export const GetStyleDetail = Interaction.create({
  name: 'GetStyleDetail',
  action: Action.create({ name: 'query' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true })
    ]
  })
});

// Status Management Interactions

export const SetStyleStatus = Interaction.create({
  name: 'SetStyleStatus',
  action: Action.create({ name: 'updateStatus' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true }),
      PayloadItem.create({ name: 'status', required: true })
    ]
  })
});

export const PublishStyle = Interaction.create({
  name: 'PublishStyle',
  action: Action.create({ name: 'publish' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true })
    ]
  })
});

export const DraftStyle = Interaction.create({
  name: 'DraftStyle',
  action: Action.create({ name: 'draft' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true })
    ]
  })
});

export const OfflineStyle = Interaction.create({
  name: 'OfflineStyle',
  action: Action.create({ name: 'offline' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: StyleComputed, isRef: true, required: true })
    ]
  })
});

// Sorting Management Interactions

export const UpdateStyleOrder = Interaction.create({
  name: 'UpdateStyleOrder',
  action: Action.create({ name: 'reorder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'draggedId', base: StyleComputed, isRef: true, required: true }),
      PayloadItem.create({ name: 'targetId', base: StyleComputed, isRef: true, required: true }),
      PayloadItem.create({ name: 'position', required: true }) // 'before' or 'after'
    ]
  })
});

export const BatchUpdateOrder = Interaction.create({
  name: 'BatchUpdateOrder',
  action: Action.create({ name: 'batchReorder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'orderUpdates', 
        isCollection: true,
        required: true
        // Array of { id, priority } objects
      })
    ]
  })
});

// Version Management Interactions

export const CreateVersion = Interaction.create({
  name: 'CreateVersion',
  action: Action.create({ name: 'createVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'description' })
    ]
  })
});

export const GetVersionList = Interaction.create({
  name: 'GetVersionList',
  action: Action.create({ name: 'queryVersions' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'page', type: 'number' }),
      PayloadItem.create({ name: 'limit', type: 'number' })
    ]
  })
});

export const GetVersionDetail = Interaction.create({
  name: 'GetVersionDetail',
  action: Action.create({ name: 'queryVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: VersionComputed, isRef: true, required: true })
    ]
  })
});

export const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',
  action: Action.create({ name: 'rollback' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'id', base: VersionComputed, isRef: true, required: true })
    ]
  })
});

export const CompareVersions = Interaction.create({
  name: 'CompareVersions',
  action: Action.create({ name: 'compare' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'sourceVersionId', base: VersionComputed, isRef: true, required: true }),
      PayloadItem.create({ name: 'targetVersionId', base: VersionComputed, isRef: true, required: true })
    ]
  })
});

// Batch Operations

export const BatchUpdateStatus = Interaction.create({
  name: 'BatchUpdateStatus',
  action: Action.create({ name: 'batchUpdateStatus' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleIds', 
        base: StyleComputed, 
        isRef: true, 
        isCollection: true, 
        required: true 
      }),
      PayloadItem.create({ name: 'status', required: true })
    ]
  })
});

export const BatchDeleteStyles = Interaction.create({
  name: 'BatchDeleteStyles',
  action: Action.create({ name: 'batchDelete' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ 
        name: 'styleIds', 
        base: StyleComputed, 
        isRef: true, 
        isCollection: true, 
        required: true 
      })
    ]
  })
});

// File Management Operations

export const UploadThumbnail = Interaction.create({
  name: 'UploadThumbnail',
  action: Action.create({ name: 'uploadFile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: StyleComputed, isRef: true }),
      PayloadItem.create({ name: 'fileName', required: true }),
      PayloadItem.create({ name: 'fileData', required: true }),
      PayloadItem.create({ name: 'fileType' })
    ]
  })
});

export const DeleteThumbnail = Interaction.create({
  name: 'DeleteThumbnail',
  action: Action.create({ name: 'deleteFile' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'styleId', base: StyleComputed, isRef: true, required: true }),
      PayloadItem.create({ name: 'thumbKey', required: true })
    ]
  })
});

// Search and Filter Operations

export const SearchStyles = Interaction.create({
  name: 'SearchStyles',
  action: Action.create({ name: 'search' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'query', required: true }),
      PayloadItem.create({ name: 'status' }),
      PayloadItem.create({ name: 'type' }),
      PayloadItem.create({ name: 'page', type: 'number' }),
      PayloadItem.create({ name: 'limit', type: 'number' })
    ]
  })
});

export const FilterStylesByStatus = Interaction.create({
  name: 'FilterStylesByStatus',
  action: Action.create({ name: 'filterByStatus' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'status', required: true }),
      PayloadItem.create({ name: 'page', type: 'number' }),
      PayloadItem.create({ name: 'limit', type: 'number' })
    ]
  })
});

export const FilterStylesByType = Interaction.create({
  name: 'FilterStylesByType',
  action: Action.create({ name: 'filterByType' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'type', required: true }),
      PayloadItem.create({ name: 'page', type: 'number' }),
      PayloadItem.create({ name: 'limit', type: 'number' })
    ]
  })
});

export const interactions = [
  // Style CRUD
  CreateStyle,
  UpdateStyle,
  DeleteStyle,
  GetStyleList,
  GetStyleDetail,
  
  // Status Management
  SetStyleStatus,
  PublishStyle,
  DraftStyle,
  OfflineStyle,
  
  // Sorting
  UpdateStyleOrder,
  BatchUpdateOrder,
  
  // Version Management
  CreateVersion,
  GetVersionList,
  GetVersionDetail,
  RollbackVersion,
  CompareVersions,
  
  // Batch Operations
  BatchUpdateStatus,
  BatchDeleteStyles,
  
  // File Management
  UploadThumbnail,
  DeleteThumbnail,
  
  // Search and Filter
  SearchStyles,
  FilterStylesByStatus,
  FilterStylesByType
];