# CMS Style Management - Interaction Matrix

## User Roles and Permissions

| Interaction | Admin | Editor | Viewer | Anonymous |
|-------------|-------|---------|---------|-----------|
| **Style Management** |
| CreateStyle | ✅ | ✅ | ❌ | ❌ |
| UpdateStyle | ✅ | ✅ (own only) | ❌ | ❌ |
| DeleteStyle | ✅ | ❌ | ❌ | ❌ |
| PublishStyle | ✅ | ❌ | ❌ | ❌ |
| UnpublishStyle | ✅ | ❌ | ❌ | ❌ |
| **Content Viewing** |
| ListPublishedStyles | ✅ | ✅ | ✅ | ✅ |
| ListAllStyles | ✅ | ✅ (limited) | ❌ | ❌ |
| GetStyleDetails | ✅ | ✅ | ✅ (published only) | ✅ (published only) |
| **Organization** |
| ReorderStyles | ✅ | ❌ | ❌ | ❌ |
| SearchStyles | ✅ | ✅ | ✅ (published only) | ✅ (published only) |
| **Version Management** |
| GetStyleVersions | ✅ | ✅ (own styles) | ❌ | ❌ |
| RollbackStyleVersion | ✅ | ❌ | ❌ | ❌ |
| **File Management** |
| UploadStyleThumbnail | ✅ | ✅ (own styles) | ❌ | ❌ |
| DeleteStyleThumbnail | ✅ | ✅ (own styles) | ❌ | ❌ |

## Permission Logic Details

### Admin Permissions
- Full access to all Style operations
- Can manage any Style regardless of creator
- Can publish/unpublish Styles
- Can delete Styles and manage versions
- Can reorder Styles globally

### Editor Permissions
- Can create new Styles (own ownership)
- Can edit own Styles only
- Cannot publish/unpublish (requires admin approval)
- Can view own Style versions
- Cannot delete Styles or rollback versions

### Viewer Permissions
- Read-only access to published Styles
- Cannot create, edit, or delete any content
- Cannot access draft or offline Styles
- Cannot view version history

### Anonymous Access
- Can view published Styles only
- No authentication required for public Style viewing
- Limited to basic read operations

## Interaction Definitions

### Core CRUD Operations
1. **CreateStyle** - Create new Style in draft status
2. **UpdateStyle** - Modify existing Style properties
3. **DeleteStyle** - Remove Style (admin only)
4. **GetStyleDetails** - Retrieve single Style with full details

### Publishing Workflow
5. **PublishStyle** - Change status from draft to published
6. **UnpublishStyle** - Change status from published to offline
7. **ListPublishedStyles** - Get all publicly visible Styles
8. **ListAllStyles** - Get all Styles (role-filtered)

### Organization & Search
9. **ReorderStyles** - Update priority values for sorting
10. **SearchStyles** - Find Styles by text search
11. **GetStylesByType** - Filter Styles by type category

### Version Management
12. **GetStyleVersions** - Retrieve version history for a Style
13. **RollbackStyleVersion** - Restore Style to previous version
14. **CompareStyleVersions** - Show differences between versions

### File Management
15. **UploadStyleThumbnail** - Upload and assign thumbnail image
16. **DeleteStyleThumbnail** - Remove thumbnail image
17. **GetStyleThumbnailUrl** - Get signed URL for thumbnail access

## Data Access Patterns

### User Attribution
- All Interactions require user context for permission checking
- Style ownership tracked through creator relationship
- Version history includes user who made each change

### Data Attribution
- Style updates validate field constraints
- Slug uniqueness enforced across all Styles
- Status transitions validated (draft → published → offline)
- Priority values must be positive integers

### Permission Computation
- Role-based access control with user.role
- Ownership checks with style.created_by = user.id
- Status-based visibility (published vs. draft/offline)
- Combined AND/OR logic for complex permissions