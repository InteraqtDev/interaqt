# Interaction Matrix for Style Management System

## User Roles and Permissions

| Role | Description | Capabilities |
|------|-------------|--------------|
| **Admin** | System administrator | Full access to all operations |
| **Editor** | Content editor | Can manage styles but cannot publish versions |
| **Viewer** | Read-only user | Can only query/view data |

## Interaction-Role Matrix

| Interaction | Admin | Editor | Viewer | Description |
|-------------|-------|--------|--------|-------------|
| **CreateStyle** | ✅ | ✅ | ❌ | Create new style |
| **UpdateStyle** | ✅ | ✅ | ❌ | Update existing style |
| **DeleteStyle** | ✅ | ❌ | ❌ | Soft delete style |
| **PublishStyle** | ✅ | ✅ | ❌ | Change style status to published |
| **UnpublishStyle** | ✅ | ✅ | ❌ | Change style status to draft |
| **ReorderStyles** | ✅ | ✅ | ❌ | Change style priority order |
| **CreateVersion** | ✅ | ❌ | ❌ | Create new version |
| **PublishVersion** | ✅ | ❌ | ❌ | Make version active |
| **AddStyleToVersion** | ✅ | ❌ | ❌ | Add style to version |
| **RemoveStyleFromVersion** | ✅ | ❌ | ❌ | Remove style from version |
| **ReorderStylesInVersion** | ✅ | ❌ | ❌ | Change style order in version |

## Detailed Interaction Definitions

### Style Management Interactions

#### 1. CreateStyle
- **Action**: createStyle
- **Permissions**: Admin, Editor
- **Payload**:
  - label (required): Display name
  - slug (required): URL-safe identifier
  - description (optional): Style description
  - type (required): Style category
  - thumb_key (optional): S3 thumbnail path
  - priority (required): Sort order number
- **Business Rules**:
  - Slug must be unique
  - Type must be from predefined list
  - Priority must be positive integer
  - Initial status is "draft"

#### 2. UpdateStyle
- **Action**: updateStyle
- **Permissions**: Admin, Editor
- **Payload**:
  - styleId (required): Target style ID
  - label (optional): New display name
  - slug (optional): New URL-safe identifier
  - description (optional): New description
  - type (optional): New style category
  - thumb_key (optional): New thumbnail path
  - priority (optional): New sort order
- **Business Rules**:
  - Can only update existing styles
  - New slug must be unique if provided
  - Updates updatedAt and updatedBy automatically

#### 3. DeleteStyle
- **Action**: deleteStyle
- **Permissions**: Admin only
- **Payload**:
  - styleId (required): Target style ID
- **Business Rules**:
  - Performs soft delete (status = "offline")
  - Removes style from all versions
  - Cannot be undone (no restore interaction)

#### 4. PublishStyle
- **Action**: publishStyle
- **Permissions**: Admin, Editor
- **Payload**:
  - styleId (required): Target style ID
- **Business Rules**:
  - Changes status from "draft" to "published"
  - Only published styles can be added to versions

#### 5. UnpublishStyle
- **Action**: unpublishStyle
- **Permissions**: Admin, Editor
- **Payload**:
  - styleId (required): Target style ID
- **Business Rules**:
  - Changes status from "published" to "draft"
  - Removes style from all versions automatically

#### 6. ReorderStyles
- **Action**: reorderStyles
- **Permissions**: Admin, Editor
- **Payload**:
  - styleOrders (required): Array of {styleId, priority}
- **Business Rules**:
  - Updates priority values for multiple styles
  - Maintains unique priority values

### Version Management Interactions

#### 7. CreateVersion
- **Action**: createVersion
- **Permissions**: Admin only
- **Payload**:
  - label (required): Version display name
  - description (optional): Version description
- **Business Rules**:
  - Auto-increments versionNumber
  - Initial isActive is false
  - Can create multiple inactive versions

#### 8. PublishVersion
- **Action**: publishVersion
- **Permissions**: Admin only
- **Payload**:
  - versionId (required): Target version ID
- **Business Rules**:
  - Makes target version active (isActive = true)
  - Sets all other versions to inactive
  - Only one version can be active at a time

#### 9. AddStyleToVersion
- **Action**: addStyleToVersion
- **Permissions**: Admin only
- **Payload**:
  - versionId (required): Target version ID
  - styleId (required): Style to add
  - order (required): Position in version
- **Business Rules**:
  - Style must be published
  - Order must be unique within version
  - Creates StyleVersion relation

#### 10. RemoveStyleFromVersion
- **Action**: removeStyleFromVersion
- **Permissions**: Admin only
- **Payload**:
  - versionId (required): Target version ID
  - styleId (required): Style to remove
- **Business Rules**:
  - Removes StyleVersion relation
  - Reorders remaining styles if needed

#### 11. ReorderStylesInVersion
- **Action**: reorderStylesInVersion
- **Permissions**: Admin only
- **Payload**:
  - versionId (required): Target version ID
  - styleOrders (required): Array of {styleId, order}
- **Business Rules**:
  - Updates order for multiple styles in version
  - Maintains unique order values within version

## Permission Control Implementation

Each interaction will use **Attributive** for permission checking:

```typescript
const StylePermissionCheck = Attributive.create({
  name: 'canManageStyles',
  type: 'boolean',
  record: InteractionEventEntity,
  computation: function(event) {
    const userRole = event.user.role;
    const interactionName = event.interactionName;
    
    // Admin has full access
    if (userRole === 'admin') return true;
    
    // Editor can manage styles but not versions
    if (userRole === 'editor') {
      return ['CreateStyle', 'UpdateStyle', 'PublishStyle', 'UnpublishStyle', 'ReorderStyles'].includes(interactionName);
    }
    
    // Viewer has no write access
    return false;
  }
});
```

## Query Operations (No Permission Required)

These are read operations available to all authenticated users:

- **GetStyles**: Query styles with filters
- **GetActiveVersion**: Get currently active version
- **GetVersions**: List all versions
- **GetStylesInVersion**: Get styles in specific version
- **GetStyleHistory**: Get audit trail for style changes

## Error Scenarios by Role

### Admin Errors
- Validation errors (invalid data)
- Business rule violations (duplicate slug, etc.)
- Reference errors (style/version not found)

### Editor Errors
- All admin errors plus:
- Permission denied for version operations
- Permission denied for style deletion

### Viewer Errors
- Permission denied for all write operations
- Can only encounter read-related errors

## Coverage Verification

✅ **All user roles have defined capabilities**  
✅ **All interactions have clear permission rules**  
✅ **Permission boundaries are explicit**  
✅ **Error scenarios are covered for each role**  
✅ **Business rules are enforced consistently**