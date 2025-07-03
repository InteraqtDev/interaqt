# Interaction Matrix - Style Management System

## User Roles
- **Admin**: Full system access, can publish and delete
- **Editor**: Can create and modify content, cannot publish or delete
- **Viewer**: Read-only access

## Interaction Access Matrix

| Interaction | Admin | Editor | Viewer | Description |
|------------|-------|--------|--------|-------------|
| **Style Management** |
| CreateStyle | ✅ | ✅ | ❌ | Create new style (draft status) |
| UpdateStyle | ✅ | ✅* | ❌ | Update style properties (*own styles only for Editor) |
| PublishStyle | ✅ | ❌ | ❌ | Change style status to published |
| OfflineStyle | ✅ | ❌ | ❌ | Soft delete style (set to offline) |
| ReorderStyles | ✅ | ✅ | ❌ | Update priority of multiple styles |
| **Version Management** |
| CreateVersion | ✅ | ✅ | ❌ | Create new version (draft status) |
| AddStyleToVersion | ✅ | ✅* | ❌ | Add style to version (*draft versions only for Editor) |
| RemoveStyleFromVersion | ✅ | ✅* | ❌ | Remove style from version (*draft versions only for Editor) |
| PublishVersion | ✅ | ❌ | ❌ | Publish version and all included styles |
| RollbackVersion | ✅ | ❌ | ❌ | Rollback to previous version |
| ArchiveVersion | ✅ | ❌ | ❌ | Archive old version |
| **Query Operations** |
| GetStyles | ✅ | ✅ | ✅ | List styles with filtering options |
| GetStyleDetails | ✅ | ✅ | ✅ | Get detailed style information |
| GetVersions | ✅ | ✅ | ✅ | List versions |
| GetVersionDetails | ✅ | ✅ | ✅ | Get detailed version information |
| SearchStyles | ✅ | ✅ | ✅ | Search styles by various criteria |

## Detailed Interaction Definitions

### Style Management Interactions

#### CreateStyle
- **Permissions**: Admin, Editor
- **Payload**: label, slug, description, type, thumb_key, priority
- **Default Values**: status="draft", created_at=now(), updated_at=now()
- **Side Effects**: 
  - Creates User-Style relation
  - Increments user's created_styles_count

#### UpdateStyle
- **Permissions**: 
  - Admin: Can update any style
  - Editor: Can only update own draft styles
- **Payload**: styleId, label?, slug?, description?, type?, thumb_key?, priority?
- **Validations**: 
  - Slug uniqueness check
  - Editor permission check for style ownership
- **Side Effects**: Updates updated_at timestamp

#### PublishStyle
- **Permissions**: Admin only
- **Payload**: styleId
- **Business Rules**: 
  - Only draft styles can be published
  - Updates last_published_at timestamp
- **Side Effects**: Status change triggers computed properties update

#### OfflineStyle
- **Permissions**: Admin only
- **Payload**: styleId
- **Business Rules**: Soft delete (status="offline")
- **Side Effects**: Removes from active queries but maintains relations

#### ReorderStyles
- **Permissions**: Admin, Editor
- **Payload**: Array of {styleId, priority} objects
- **Validations**: All styles must exist and be accessible to user
- **Side Effects**: Updates priority and updated_at for all affected styles

### Version Management Interactions

#### CreateVersion
- **Permissions**: Admin, Editor
- **Payload**: version_number, description
- **Default Values**: status="draft", created_at=now()
- **Validations**: version_number format validation
- **Side Effects**: 
  - Creates User-Version relation
  - Increments user's created_versions_count

#### AddStyleToVersion
- **Permissions**: 
  - Admin: Can add any style to any version
  - Editor: Can only add to draft versions
- **Payload**: versionId, styleId
- **Validations**: 
  - Both version and style must exist
  - Style cannot be offline
  - Version must be draft (for Editor)
- **Side Effects**: 
  - Creates Style-Version relation
  - Updates computed counts

#### RemoveStyleFromVersion
- **Permissions**: 
  - Admin: Can remove from any version
  - Editor: Can only remove from draft versions
- **Payload**: versionId, styleId
- **Validations**: Relation must exist
- **Side Effects**: 
  - Removes Style-Version relation
  - Updates computed counts

#### PublishVersion
- **Permissions**: Admin only
- **Payload**: versionId
- **Business Rules**: 
  - Only one version can be published at a time
  - All styles in version become published
  - Previous published version becomes archived
- **Side Effects**: 
  - Updates version status and published_at
  - Updates all related styles' status
  - Updates is_current computations

#### RollbackVersion
- **Permissions**: Admin only
- **Payload**: targetVersionId
- **Business Rules**: 
  - Target version must exist and be archived
  - Current version becomes archived
  - All styles in target version become published
- **Side Effects**: Complex status updates across versions and styles

### Query Interactions

#### GetStyles
- **Permissions**: All roles
- **Payload**: status?, type?, orderBy?, order?, limit?, offset?
- **Data Filtering**: 
  - Viewer: Only published styles
  - Editor: Own styles + published styles
  - Admin: All styles
- **Response**: Array of styles with computed properties

#### GetStyleDetails
- **Permissions**: All roles
- **Payload**: styleId
- **Data Filtering**: Same as GetStyles
- **Response**: Complete style data with relations and computed properties

#### GetVersions
- **Permissions**: All roles
- **Payload**: includeStyles?, orderBy?, order?, limit?, offset?
- **Data Filtering**: 
  - Viewer: Only published versions
  - Editor: Own versions + published versions
  - Admin: All versions
- **Response**: Array of versions with optional style data

#### SearchStyles
- **Permissions**: All roles
- **Payload**: searchTerm, searchFields[], status?, type?
- **Data Filtering**: Same as GetStyles
- **Response**: Matching styles with relevance scoring

## Permission Implementation Strategy

### Role-Based Access Control
Each interaction checks user role and applies appropriate permissions:

```typescript
// Example permission check pattern
if (user.role === 'viewer') {
  throw new Error('Insufficient permissions')
}

if (user.role === 'editor' && interaction.requiresAdmin) {
  throw new Error('Admin privileges required')
}

if (user.role === 'editor' && !isOwner(user.id, resourceId)) {
  throw new Error('Can only modify own resources')
}
```

### Data Access Filtering
Query operations apply role-based filtering:

- **Admin**: Access to all data
- **Editor**: Own draft content + all published content
- **Viewer**: Published content only

### Business Rule Enforcement
Each interaction enforces specific business rules:

- **Uniqueness constraints**: slug, published version
- **Status transitions**: draft → published → offline
- **Ownership rules**: Editor can only modify own content
- **Cascade effects**: Publishing version affects all included styles

## Test Coverage Requirements

Each interaction must have tests covering:

1. **Success Cases**: Normal operation with valid permissions
2. **Permission Denied**: Users without sufficient privileges
3. **Validation Errors**: Invalid input data
4. **Business Rule Violations**: Conflicts with system constraints
5. **Edge Cases**: Boundary conditions and unusual scenarios

## API Consistency

All interactions follow consistent patterns:

- **Input**: `{ user, payload }` structure
- **Output**: Success data or error object
- **Error Handling**: Structured error responses with codes
- **Side Effects**: Automatic computation updates
- **Audit Trail**: User attribution for all modifications