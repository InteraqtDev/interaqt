# CMS Style Management System - Detailed Requirements

## Overview
A content management system for managing Style objects with version control, publishing workflow, and administrative interface.

## Data Analysis

### Entities
**Style Entity**
- `id`: UUID - Unique identifier (auto-generated)
- `label`: Text - Display name (e.g., "Manga") 
- `slug`: Text - URL-safe unique identifier (e.g., "manga")
- `description`: Text - Detailed description
- `type`: String - Category type (e.g., "animation", "surreal")
- `thumb_key`: Text - S3 storage key for thumbnail image
- `priority`: Integer - Sorting priority for frontend display
- `status`: String - Workflow status ("draft", "published", "offline")
- `created_at`: Timestamp - Creation time (auto-generated)
- `updated_at`: Timestamp - Last modification time (auto-generated)

**User Entity** (Required for operations)
- `id`: UUID - Unique identifier
- `username`: String - Login username
- `role`: String - User role ("admin", "editor", "viewer")
- `created_at`: Timestamp - Account creation time

**Version Entity** (For version management)
- `id`: UUID - Unique identifier
- `style_id`: UUID - Reference to Style
- `version_number`: Integer - Version sequence number
- `snapshot_data`: JSON - Complete Style state at this version
- `created_at`: Timestamp - Version creation time
- `created_by`: UUID - User who created this version

### Relations
- **User-Style**: One-to-many (User can manage multiple Styles)
- **Style-Version**: One-to-many (Style has multiple versions)
- **User-Version**: One-to-many (User creates multiple versions)

## Interaction Analysis

### User Operations & Permissions

**Admin Role:**
- Create new Styles
- Edit any Style
- Delete any Style
- Publish/unpublish Styles
- Manage version history
- Sort/reorder Styles

**Editor Role:**
- Create new Styles
- Edit own Styles
- Submit for review
- View published Styles

**Viewer Role:**
- View published Styles only

### Business Processes

**Style Creation Workflow:**
1. User creates Style in "draft" status
2. User edits Style properties
3. User submits for review (admin approval)
4. Admin publishes Style (status: "published")

**Version Management:**
1. Every significant change creates a new version
2. Users can view version history
3. Admin can rollback to previous versions
4. Version rollback creates a new version (no destructive changes)

**Publishing Control:**
1. Only published Styles are visible to end users
2. Draft Styles are work-in-progress
3. Offline Styles are temporarily hidden but preserved

## Technical Requirements

### Data Validation
- `slug` must be unique across all Styles
- `slug` must be URL-safe (alphanumeric, hyphens, underscores only)
- `label` cannot be empty
- `type` must be from predefined list
- `priority` must be positive integer
- `status` must be one of: "draft", "published", "offline"

### Sorting & Ordering
- Styles sorted by `priority` field (ascending)
- Support for reordering via priority updates
- Frontend pagination support

### File Management
- Thumbnail images stored in S3
- `thumb_key` contains S3 object key
- Support for image upload/replacement
- Automatic thumbnail generation if needed

### Performance Considerations
- Efficient queries for published Styles
- Indexed searching by slug
- Pagination for large Style lists
- Caching for frequently accessed data