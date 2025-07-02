# CMS Style Management System - Interaction Matrix

## User Roles Definition

### Admin
- Full system access
- Can perform all operations
- Can publish and rollback versions
- Can delete styles

### Editor  
- Content creation and editing
- Can create and update styles
- Can create versions but not publish them
- Cannot delete styles

### Viewer
- Read-only access
- Can view published content only
- Cannot perform any modification operations

## Interaction-Role Permission Matrix

| Interaction | Admin | Editor | Viewer | Description |
|-------------|-------|---------|---------|-------------|
| **Style Management** |
| CreateStyle | ✅ | ✅ | ❌ | Create new style record |
| UpdateStyle | ✅ | ✅* | ❌ | Modify existing style (*own content only for editor) |
| UpdateStyleStatus | ✅ | ✅ | ❌ | Change style status (draft/published/offline) |
| DeleteStyle | ✅ | ❌ | ❌ | Soft delete style (admin only) |
| ListStyles | ✅ | ✅ | ✅** | Query styles with filters (**published only for viewer) |
| GetStyleDetail | ✅ | ✅ | ✅** | Get single style details (**published only for viewer) |
| UpdateStylePriorities | ✅ | ✅ | ❌ | Bulk update style priorities |
| SearchStyles | ✅ | ✅ | ✅** | Text search in styles (**published only for viewer) |
| **Version Management** |
| CreateVersion | ✅ | ✅ | ❌ | Create version snapshot |
| PublishVersion | ✅ | ❌ | ❌ | Mark version as current (admin only) |
| RollbackVersion | ✅ | ❌ | ❌ | Revert to previous version (admin only) |
| ListVersions | ✅ | ✅ | ✅** | Query available versions (**published only for viewer) |
| GetVersionDetail | ✅ | ✅ | ✅** | Get version with styles (**published only for viewer) |

## Detailed Permission Rules

### CreateStyle
- **Admin**: Can create any style
- **Editor**: Can create any style
- **Viewer**: No access
- **Business Rule**: New styles default to "draft" status

### UpdateStyle  
- **Admin**: Can update any style regardless of creator
- **Editor**: Can update styles they created + styles in "draft" status
- **Viewer**: No access
- **Business Rule**: Updates preserve audit trail

### UpdateStyleStatus
- **Admin**: Can change any style to any status
- **Editor**: Can change draft→published, published→draft (not to offline)
- **Viewer**: No access
- **Business Rule**: Status transitions must be valid

### DeleteStyle (Soft Delete)
- **Admin**: Can delete any style
- **Editor**: No access
- **Viewer**: No access  
- **Business Rule**: Cannot delete style included in current published version

### ListStyles
- **Admin**: See all styles regardless of status
- **Editor**: See all styles regardless of status
- **Viewer**: See only published styles
- **Business Rule**: Results filtered by permission level

### GetStyleDetail
- **Admin**: Can view any style with full details
- **Editor**: Can view any style with full details
- **Viewer**: Can view published styles only
- **Business Rule**: Includes audit information based on role

### UpdateStylePriorities
- **Admin**: Can update priorities for any styles
- **Editor**: Can update priorities for styles they have edit access to
- **Viewer**: No access
- **Business Rule**: Bulk operation is atomic

### SearchStyles
- **Admin**: Search across all styles
- **Editor**: Search across all styles  
- **Viewer**: Search only published styles
- **Business Rule**: Search respects permission filters

### CreateVersion
- **Admin**: Can create versions with any published styles
- **Editor**: Can create versions with any published styles
- **Viewer**: No access
- **Business Rule**: Can only include published styles

### PublishVersion
- **Admin**: Can publish any version
- **Editor**: No access
- **Viewer**: No access
- **Business Rule**: Only one version can be current

### RollbackVersion
- **Admin**: Can rollback to any previous version
- **Editor**: No access
- **Viewer**: No access
- **Business Rule**: Target version must have been previously published

### ListVersions
- **Admin**: See all versions regardless of status
- **Editor**: See all versions regardless of status
- **Viewer**: See only published versions
- **Business Rule**: Results filtered by permission level

### GetVersionDetail
- **Admin**: Can view any version with full details
- **Editor**: Can view any version with full details  
- **Viewer**: Can view published versions only
- **Business Rule**: Shows styles included at time of version creation

## Permission Enforcement Patterns

### Role-Based Filtering
Each interaction implements role-based data filtering:
```typescript
// Example pattern for data access
if (user.role === 'viewer') {
  // Filter to published content only
  filters.status = 'published'
} else {
  // Admin and Editor see all content
}
```

### Ownership-Based Access
For update operations, additional ownership checks:
```typescript
// Example pattern for update permissions
if (user.role === 'editor') {
  // Check if user created the style or style is in draft
  if (style.createdBy !== user.id && style.status !== 'draft') {
    throw new PermissionError('Cannot edit this style')
  }
}
```

### Operation-Specific Rules
Critical operations have additional restrictions:
```typescript
// Example pattern for critical operations
if (interactionName === 'PublishVersion' && user.role !== 'admin') {
  throw new PermissionError('Only admins can publish versions')
}
```

## Test Coverage Requirements

### Positive Permission Tests
Each interaction must have tests verifying:
- Admin can perform operation successfully
- Editor can perform operation when allowed
- Viewer can perform read operations on published content

### Negative Permission Tests  
Each interaction must have tests verifying:
- Editor cannot perform admin-only operations
- Viewer cannot perform write operations
- Ownership rules are enforced for editors

### Edge Case Permission Tests
- Style in current version cannot be deleted
- Status transitions follow business rules
- Bulk operations respect individual item permissions
- Version operations maintain data consistency

## Error Handling Standards

### Permission Error Messages
- Clear indication of what permission is missing
- Guidance on required role or conditions
- No exposure of sensitive system information

### Validation Error Messages
- Specific field validation failures
- Business rule violation explanations
- Actionable guidance for correction