# CMS Style Management System - Detailed Requirements

## Business Context
The system needs to provide a management interface for product operations personnel to manage preset data (Style objects) for an online platform. This is a content management system specifically focused on Style configuration and versioning.

## Core Entities and Data Analysis

### Style Entity
The core entity represents a style configuration with the following properties:

| Field | Type | Input Method | Description |
|-------|------|--------------|-------------|
| id | UUID | Automatic | System-generated unique identifier |
| label | Text | Manual | Display name for frontend (e.g., "Manga") |
| slug | Text | Manual | Unique, URL-safe identifier (e.g., "manga"), corresponds to legacy 'value' field |
| description | Text | Manual | Detailed description of the style |
| type | VARCHAR(32) | Manual | Style category (e.g., "animation", "surreal") |
| thumb_key | Text | Manual | S3 address for thumbnail image |
| priority | Integer | Manual | Frontend sorting priority, follows legacy logic |
| status | VARCHAR(16) | Manual | Lifecycle status: "draft", "published", "offline" |
| created_at | TimestampTZ | Automatic | Creation timestamp, defaults to now() |
| updated_at | TimestampTZ | Automatic | Last modification timestamp |

### User Entity (for permission management)
Required for tracking who performs operations:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | User identifier |
| name | Text | User display name |
| role | Text | User role (admin, editor, viewer) |
| email | Text | User email |

### Version Entity (for version management)
To support version management and rollback functionality:

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Version identifier |
| name | Text | Version name/label |
| description | Text | Version description |
| created_at | TimestampTZ | Version creation time |
| created_by | UUID | User who created this version |
| is_current | Boolean | Whether this is the current active version |

## Relationships Analysis

### Style-User Relations
- **StyleCreatedBy**: 1:n relationship between User and Style (who created each style)
- **StyleUpdatedBy**: 1:n relationship between User and Style (who last updated each style)

### Style-Version Relations  
- **StyleVersion**: n:n relationship between Style and Version (styles included in each version)

## Interaction Analysis

### Core CRUD Operations
1. **CreateStyle**: Create a new style record
2. **UpdateStyle**: Modify existing style properties
3. **DeleteStyle**: Soft delete a style (set status to offline)
4. **ListStyles**: Query styles with filtering and sorting
5. **GetStyleDetail**: Retrieve single style with full details

### Version Management Operations
6. **CreateVersion**: Create a new version snapshot
7. **PublishVersion**: Mark a version as current/active
8. **RollbackVersion**: Revert to a previous version
9. **ListVersions**: Query available versions
10. **GetVersionDetail**: Retrieve version with included styles

### Administrative Operations
11. **UpdateStylePriority**: Bulk update style priorities for sorting
12. **BulkUpdateStyleStatus**: Change status of multiple styles

## Permission Requirements

### Role-Based Access Control
- **Admin**: Full access to all operations
- **Editor**: Can create, update styles; can create versions but not publish
- **Viewer**: Read-only access to published content

### Operation Permissions
- CreateStyle: Admin, Editor
- UpdateStyle: Admin, Editor (own content), Admin (all content)
- DeleteStyle: Admin only
- CreateVersion: Admin, Editor
- PublishVersion: Admin only
- RollbackVersion: Admin only

## Business Process Analysis

### Style Management Workflow
1. Editor creates new style in "draft" status
2. Editor refines style properties and sets priority
3. Editor changes status to "published" when ready
4. Admin can publish versions containing published styles
5. Users can rollback to previous versions if needed

### Version Management Workflow  
1. User creates version with current published styles
2. Version is created in draft state
3. Admin reviews and publishes version
4. Published version becomes current active version
5. Previous versions remain available for rollback

## Data Validation Rules

### Style Validation
- `slug` must be unique across all styles
- `slug` must be URL-safe (lowercase, alphanumeric, hyphens only)
- `priority` must be positive integer
- `status` must be one of: "draft", "published", "offline"
- `type` must match predefined categories

### Version Validation
- Version `name` must be unique
- Only one version can be marked as `is_current = true`
- Cannot delete version that is currently active

## Sorting and Filtering Requirements

### Style Sorting Options
- By priority (ascending/descending)
- By created_at (newest/oldest)
- By updated_at (most/least recently modified)
- By status (draft, published, offline)
- By type (alphabetical)

### Style Filtering Options
- By status (draft/published/offline)
- By type (animation, surreal, etc.)
- By date range (created/updated within period)
- Search by label or description (text search)

## Integration Requirements

### S3 Integration
- `thumb_key` field stores S3 object keys
- System should validate S3 key existence (optional)
- Frontend will construct full S3 URLs from keys

### Legacy System Compatibility
- `slug` field corresponds to legacy `value` field
- Priority logic must match existing frontend sorting
- Status transitions must preserve backward compatibility

## Performance Requirements

### Query Performance
- Style listing with sorting should support pagination
- Filter operations should be optimized for large datasets
- Version operations should be efficient for rollback scenarios

### Data Consistency
- Version snapshots must maintain referential integrity
- Style updates should not affect published versions
- Rollback operations must be atomic and consistent