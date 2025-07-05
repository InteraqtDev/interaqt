# Detailed Requirements Analysis for Style Management System

## 1. Business Context
The system provides a backend content management interface for product operations staff to manage predefined data online.

## 2. Core Entities Analysis

### 2.1 User Entity
- **Properties**: 
  - id (uuid, auto-generated)
  - name (string, manual)
  - email (string, manual)
  - role (string, manual) - values: admin, editor, viewer
  - createdAt (timestamptz, auto)
  - updatedAt (timestamptz, auto)
- **Note**: User authentication is handled externally. The system assumes pre-authenticated users.

### 2.2 Style Entity
- **Properties**:
  - id (uuid, auto-generated)
  - label (text, manual) - display name like "Manga"
  - slug (text, manual) - URL-safe unique identifier like "manga"
  - description (text, manual)
  - type (varchar(32), manual) - "animation", "surreal", etc.
  - thumb_key (text, manual) - S3 path for thumbnail
  - priority (int, manual) - for frontend sorting
  - status (varchar(16), manual) - "draft", "published", "offline"
  - createdAt (timestamptz, auto)
  - updatedAt (timestamptz, auto)
  - createdBy (relation to User)
  - updatedBy (relation to User)

### 2.3 Version Entity
- **Properties**:
  - id (uuid, auto-generated)
  - versionNumber (int, auto) - incremental version number
  - label (string, manual) - version label like "v1.0"
  - description (text, manual)
  - isActive (boolean, auto) - only one version can be active
  - createdAt (timestamptz, auto)
  - createdBy (relation to User)

### 2.4 StyleVersion Entity (Junction for Style-Version relationship)
- **Properties**:
  - id (uuid, auto-generated)
  - styleId (relation to Style)
  - versionId (relation to Version)
  - order (int, manual) - order within version
  - createdAt (timestamptz, auto)

## 3. Key Relationships
- User creates and updates Styles (1:n)
- User creates Versions (1:n)
- Style belongs to multiple Versions (n:n through StyleVersion)
- Version contains multiple Styles (n:n through StyleVersion)

## 4. Business Operations Analysis

### 4.1 Style Management Operations
1. **Create Style**: Admin/Editor creates new style
2. **Update Style**: Admin/Editor updates existing style
3. **Delete Style**: Admin soft-deletes style
4. **Change Style Status**: Admin/Editor changes draft/published/offline status
5. **Reorder Styles**: Admin/Editor changes priority for sorting

### 4.2 Version Management Operations
1. **Create Version**: Admin creates new version
2. **Publish Version**: Admin makes version active
3. **Rollback Version**: Admin activates previous version
4. **Add Style to Version**: Admin adds style to specific version
5. **Remove Style from Version**: Admin removes style from version
6. **Reorder Styles in Version**: Admin changes style order within version

### 4.3 Permission Requirements
- **Admin**: Full access to all operations
- **Editor**: Can create/update styles, but cannot publish versions
- **Viewer**: Read-only access

## 5. Data Validation Requirements
- **Style.label**: Required, non-empty string
- **Style.slug**: Required, unique, URL-safe format
- **Style.type**: Required, must be predefined values
- **Style.priority**: Required, positive integer
- **Style.status**: Required, must be "draft", "published", or "offline"
- **Version.label**: Required, non-empty string
- **Version.versionNumber**: Auto-increment, unique
- **StyleVersion.order**: Required, positive integer

## 6. Business Rules
1. **Unique Slug**: Each style must have unique slug across all styles
2. **Single Active Version**: Only one version can be active at a time
3. **Style Status Rules**: Only published styles can be included in active versions
4. **Version Publishing**: When version is published, it becomes active and previous active version becomes inactive
5. **Style Ordering**: Styles within a version must have unique order values
6. **Soft Delete**: Styles are soft-deleted, not physically removed

## 7. Computed Properties
1. **Style.isPublished**: Derived from status === 'published'
2. **Style.isDeleted**: Derived from status === 'offline' or deleted flag
3. **Version.styleCount**: Count of styles in the version
4. **Version.publishedStyleCount**: Count of published styles in the version
5. **User.createdStyleCount**: Count of styles created by user
6. **User.lastActivityAt**: Timestamp of last activity by user

## 8. Error Scenarios
1. **Validation Errors**: Invalid data format, missing required fields
2. **Permission Errors**: Insufficient permissions for operation
3. **Conflict Errors**: Duplicate slug, multiple active versions
4. **Reference Errors**: Referenced style/version/user not found
5. **Business Rule Violations**: Invalid state transitions, ordering conflicts