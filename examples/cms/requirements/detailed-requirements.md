# Detailed Requirements Analysis - Style Management System

## Overview
A content management system for product operations personnel to manage pre-configured Style data with version control and publishing capabilities.

## Data Structure Analysis

### Core Entities

#### 1. Style Entity
- **id**: UUID (auto-generated)
- **label**: Text (manual) - Display name for frontend (e.g., "Manga")
- **slug**: Text (manual) - Unique, URL-safe identifier (e.g., "manga", corresponds to old "value")
- **description**: Text (manual) - Style description
- **type**: varchar(32) (manual) - Category like "animation", "surreal", etc.
- **thumb_key**: Text (manual) - S3 address for thumbnail
- **priority**: Integer (manual) - Frontend sorting order
- **status**: varchar(16) (manual) - "draft" | "published" | "offline"
- **created_at**: Timestamp (auto) - Creation time, default now()
- **updated_at**: Timestamp (auto) - Last modification time

#### 2. User Entity (for operations personnel)
Note: interaqt does not handle authentication - users are pre-authenticated
- **id**: UUID (auto-generated)
- **name**: Text - User display name
- **email**: Text - User email
- **role**: Text - User role ("admin", "editor", "viewer")
- **created_at**: Timestamp (auto)

#### 3. Version Entity (for version management and rollback)
- **id**: UUID (auto-generated)
- **version_number**: Text - Semantic version like "v1.0", "v1.1"
- **description**: Text - Version description
- **status**: varchar(16) - "draft" | "published" | "archived"
- **created_at**: Timestamp (auto)
- **created_by**: Reference to User
- **published_at**: Timestamp (nullable) - When version was published

## Relationship Analysis

### Relations
1. **User-Style Relation**: Who created/modified which styles
   - Type: 1:n (One user can create many styles)
   - User.styles → Style.created_by

2. **Style-Version Relation**: Which styles belong to which version
   - Type: n:m (Many styles can be in many versions)
   - Style.versions ↔ Version.styles

3. **User-Version Relation**: Who created which versions
   - Type: 1:n (One user can create many versions)
   - User.versions → Version.created_by

## Interaction Analysis

### Core Operations Required

1. **Style Management**
   - Create Style (draft status by default)
   - Update Style properties
   - Delete Style (soft delete - change to "offline")
   - Change Style status (draft → published → offline)
   - Reorder Styles (update priority)

2. **Version Management**
   - Create Version
   - Add Styles to Version
   - Remove Styles from Version
   - Publish Version (make all included styles "published")
   - Rollback to Previous Version
   - Archive Version

3. **Query Operations**
   - List Styles (with filtering by status, type)
   - Get Style Details
   - List Versions
   - Get Version Details with included Styles
   - Search Styles by label/slug/type

## Permission Requirements

### Role-Based Access Control
- **Admin**: Full access to all operations
- **Editor**: Can manage styles and create versions, cannot delete or publish
- **Viewer**: Read-only access

### Operation Permissions
- **Create Style**: Admin, Editor
- **Update Style**: Admin, Editor (own styles), Admin (all styles)
- **Delete Style**: Admin only
- **Change Style Status**: Admin only
- **Create Version**: Admin, Editor
- **Publish Version**: Admin only
- **Rollback Version**: Admin only

## Business Process Analysis

### Style Lifecycle
1. **Creation**: Editor creates style in "draft" status
2. **Editing**: Editor can modify draft styles
3. **Review**: Admin reviews and can publish or reject
4. **Publishing**: Admin changes status to "published"
5. **Maintenance**: Admin can set to "offline" for maintenance
6. **Deletion**: Admin can soft delete (set to "offline" permanently)

### Version Management Workflow
1. **Version Creation**: Editor creates new version
2. **Style Assignment**: Editor adds styles to version
3. **Review**: Admin reviews version content
4. **Publishing**: Admin publishes version (all included styles become "published")
5. **Rollback**: If issues found, Admin can rollback to previous version
6. **Archival**: Old versions are archived but kept for reference

## Computed Properties Needed

### Style Entity Computations
- **version_count**: Number of versions this style appears in
- **is_published**: Boolean indicating if style is currently published
- **last_published_at**: When this style was last published

### Version Entity Computations
- **style_count**: Number of styles in this version
- **is_current**: Boolean indicating if this is the currently published version

### User Entity Computations
- **created_styles_count**: Number of styles created by this user
- **created_versions_count**: Number of versions created by this user

## Data Validation Requirements

### Style Validation
- **slug**: Must be unique, URL-safe (alphanumeric + hyphens/underscores)
- **type**: Must be from predefined list
- **priority**: Must be positive integer
- **status**: Must be one of "draft", "published", "offline"

### Version Validation
- **version_number**: Must follow semantic versioning pattern
- **status**: Must be one of "draft", "published", "archived"
- **Business Rule**: Only one version can be "published" at a time

## Additional Requirements

### Sorting Support
- Styles must be sortable by priority field
- Default sorting: priority ASC, created_at DESC

### Version Control Features
- Track which user created/modified each style
- Track version history for rollback capability
- Maintain audit trail of all changes

### Data Integrity
- Soft delete only (never physically delete data)
- Maintain referential integrity between entities
- Ensure only one published version exists at any time