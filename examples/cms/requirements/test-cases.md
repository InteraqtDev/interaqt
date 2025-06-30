# CMS Style Management System - Test Cases

## Overview
Test cases for a CMS system managing Style objects with drag-and-drop sorting, version management, and publishing workflow.

## Entity Analysis
### Style Entity
- **id**: uuid (auto-generated)
- **label**: text (manual input) - Display name like "Manga"
- **slug**: text (manual input) - Unique URL-safe identifier like "manga"
- **description**: text (manual input) - Description of the style
- **type**: varchar(32) (manual input) - Category like "animation", "surreal", etc.
- **thumb_key**: text (S3 address) - Thumbnail image reference
- **priority**: int (manual input) - Sort order for frontend display
- **status**: varchar(16) (manual input) - "draft", "published", "offline"
- **created_at**: timestamptz (auto) - Creation timestamp
- **updated_at**: timestamptz (auto) - Last update timestamp

### Version Entity
- **id**: uuid (auto-generated)
- **version_number**: string - Version identifier like "v1.0.0"
- **description**: text - Version description
- **created_at**: timestamptz (auto) - Version creation time
- **is_current**: boolean - Whether this is the current published version
- **created_by**: string - User who created this version

## Test Cases

### TC-001: Style Entity CRUD Operations

#### TC-001-1: Create Style (Success)
**Given**: Valid style data
**When**: CreateStyle interaction is called with:
```json
{
  "label": "Manga",
  "slug": "manga",
  "description": "Japanese comic art style",
  "type": "animation",
  "thumb_key": "s3://bucket/manga-thumb.jpg",
  "priority": 1,
  "status": "draft"
}
```
**Then**: 
- Style entity is created with auto-generated id, created_at, updated_at
- slug "manga" is unique in system
- status is set to "draft"

#### TC-001-2: Create Style with Duplicate Slug (Failure)
**Given**: Style with slug "manga" already exists
**When**: CreateStyle interaction is called with slug "manga"
**Then**: 
- Interaction returns error "Slug already exists"
- No new Style entity is created

#### TC-001-3: Create Style with Invalid Status (Failure)
**Given**: Valid style data with invalid status
**When**: CreateStyle interaction is called with status "invalid_status"
**Then**: 
- Interaction returns error "Invalid status. Must be draft, published, or offline"
- No new Style entity is created

#### TC-001-4: Update Style (Success)
**Given**: Existing Style entity with id "style-123"
**When**: UpdateStyle interaction is called with:
```json
{
  "id": "style-123",
  "label": "Updated Manga",
  "description": "Updated description"
}
```
**Then**:
- Style entity is updated with new values
- updated_at timestamp is refreshed
- Other fields remain unchanged

#### TC-001-5: Update Style Status (Success)
**Given**: Style in "draft" status
**When**: UpdateStyleStatus interaction is called to change status to "published"
**Then**:
- Style status changes to "published"
- updated_at timestamp is refreshed

#### TC-001-6: Delete Style (Success)
**Given**: Existing Style entity
**When**: DeleteStyle interaction is called
**Then**: Style entity is removed from system

#### TC-001-7: Get Style by ID (Success)
**Given**: Style entity exists with known id
**When**: Style is queried by id
**Then**: Complete style data is returned

#### TC-001-8: List All Styles (Success)
**Given**: Multiple Style entities exist
**When**: Styles are queried
**Then**: All styles are returned ordered by priority ascending

### TC-002: Style Slug Uniqueness Validation

#### TC-002-1: Slug Uniqueness Constraint
**Given**: Style with slug "manga" exists
**When**: Attempting to create another style with slug "manga"
**Then**: Validation error prevents creation

#### TC-002-2: Slug Format Validation
**Given**: Style creation with slug containing spaces or special characters
**When**: CreateStyle is called with slug "manga style!"
**Then**: Validation error for invalid URL-safe format

### TC-003: Style Priority and Sorting

#### TC-003-1: Update Style Priority (Success)
**Given**: Multiple styles with different priorities
**When**: UpdateStylePriority interaction is called to reorder
**Then**: 
- Style priority is updated
- Styles maintain unique priority values
- Listing reflects new sort order

#### TC-003-2: Drag-and-Drop Priority Reordering (Success)
**Given**: Styles with priorities [1,2,3,4,5]
**When**: ReorderStyles interaction moves style at priority 2 to priority 4
**Then**: 
- Target style priority becomes 4
- Styles at priorities 3,4 shift down to 2,3
- Final order: [1,2,3,4,5] with IDs reordered

### TC-004: Version Management

#### TC-004-1: Create Version (Success)
**Given**: Current system state with styles
**When**: CreateVersion interaction is called with:
```json
{
  "version_number": "v1.0.0",
  "description": "Initial release"
}
```
**Then**:
- Version entity is created
- All current "published" styles are associated with this version
- Version is marked as current (is_current: true)
- Previous current version is_current becomes false

#### TC-004-2: Rollback to Previous Version (Success)
**Given**: Multiple versions exist (v1.0.0, v1.1.0)
**When**: RollbackToVersion interaction is called with version "v1.0.0"
**Then**:
- All styles revert to their state from v1.0.0
- Version v1.0.0 becomes current (is_current: true)
- Current version v1.1.0 becomes non-current

#### TC-004-3: List Versions (Success)
**Given**: Multiple versions exist
**When**: Versions are queried
**Then**: All versions returned ordered by created_at descending

### TC-005: Style Status Workflow

#### TC-005-1: Draft to Published Transition
**Given**: Style in "draft" status
**When**: PublishStyle interaction is called
**Then**: Style status changes to "published"

#### TC-005-2: Published to Offline Transition
**Given**: Style in "published" status  
**When**: TakeStyleOffline interaction is called
**Then**: Style status changes to "offline"

#### TC-005-3: Offline to Published Transition
**Given**: Style in "offline" status
**When**: PublishStyle interaction is called
**Then**: Style status changes to "published"

### TC-006: Computed Properties

#### TC-006-1: Total Styles Count
**Given**: Multiple styles exist in different statuses
**When**: TotalStylesCount computation is accessed
**Then**: Returns count of all styles regardless of status

#### TC-006-2: Published Styles Count
**Given**: Mix of draft, published, and offline styles
**When**: PublishedStylesCount computation is accessed
**Then**: Returns count of only "published" styles

#### TC-006-3: Styles by Type Count
**Given**: Styles with different type values
**When**: StylesByTypeCount computation is accessed
**Then**: Returns object with type as key and count as value

### TC-007: Data Validation

#### TC-007-1: Required Fields Validation
**Given**: Style creation without required fields
**When**: CreateStyle is called missing label or slug
**Then**: Validation error for missing required fields

#### TC-007-2: Type Enumeration Validation
**Given**: Style creation with custom type value
**When**: CreateStyle is called with type "custom_type"
**Then**: Style is created (type field allows custom values)

#### TC-007-3: Status Enumeration Validation
**Given**: Style with invalid status
**When**: UpdateStyleStatus is called with "invalid_status"
**Then**: Validation error for invalid status value

### TC-008: Permissions and Security

#### TC-008-1: Admin Full Access
**Given**: User with admin role
**When**: Any Style operation is performed
**Then**: All operations succeed

#### TC-008-2: Editor Access
**Given**: User with editor role
**When**: CRUD operations are performed on styles
**Then**: Create, update, delete operations succeed

#### TC-008-3: Viewer Access Restriction
**Given**: User with viewer role
**When**: Create/Update/Delete operations are attempted
**Then**: Operations fail with permission error

#### TC-008-4: Version Management Permissions
**Given**: User with editor role
**When**: Version management operations are attempted
**Then**: Only admin users can create versions and rollback

### TC-009: Integration and Performance

#### TC-009-1: Bulk Style Operations
**Given**: Need to import 100+ styles
**When**: BulkCreateStyles interaction is called
**Then**: All styles created efficiently with batch processing

#### TC-009-2: Large Dataset Querying
**Given**: System with 1000+ styles
**When**: Style listing is requested
**Then**: Results are paginated and performant

#### TC-009-3: Real-time Updates
**Given**: Multiple users viewing style list
**When**: Style priority is updated by one user
**Then**: All users see updated sort order immediately

### TC-010: Error Handling

#### TC-010-1: Database Connection Error
**Given**: Database connection issues
**When**: Any Style operation is performed
**Then**: Graceful error response with retry mechanism

#### TC-010-2: S3 Thumbnail Access Error
**Given**: Invalid thumb_key reference
**When**: Style with broken thumbnail is accessed
**Then**: Style data returns with placeholder thumbnail indication

#### TC-010-3: Concurrent Modification
**Given**: Two users editing same style simultaneously
**When**: Both submit updates
**Then**: Last write wins with proper updated_at tracking

## End-to-End Business Process Test Cases

### BTC-001: Complete Style Lifecycle
1. **Create Draft Style**: Admin creates new style in draft status
2. **Review and Edit**: Editor reviews and updates style details
3. **Publish Style**: Admin publishes style making it live
4. **Update Priority**: Admin adjusts sort order via drag-and-drop
5. **Create Version**: Admin creates version snapshot
6. **Take Offline**: Admin temporarily takes style offline
7. **Rollback**: Admin rolls back to previous version
8. **Re-publish**: Style becomes available again

### BTC-002: Version Management Workflow
1. **Initial State**: Multiple published styles exist
2. **Create v1.0.0**: Admin creates first version snapshot
3. **Add New Styles**: Editor adds more styles and publishes
4. **Create v1.1.0**: Admin creates second version
5. **Issue Found**: Problem discovered with v1.1.0
6. **Rollback**: Admin rolls back to v1.0.0
7. **Fix and Re-release**: Issues fixed, new v1.1.1 created

### BTC-003: Content Management Workflow
1. **Bulk Import**: Admin imports multiple styles from external source
2. **Categorization**: Editor assigns types and priorities
3. **Review Process**: Styles move from draft to published
4. **Reordering**: Admin adjusts display order based on analytics
5. **Maintenance**: Periodic cleanup of offline styles
6. **Backup**: Regular version snapshots for recovery

## Test Data Requirements

### Seed Data for Testing
- 20+ Style entities with varied properties
- 3+ Version entities representing different snapshots
- Multiple user roles (admin, editor, viewer)
- Sample S3 thumbnail references
- Different status combinations
- Various type categories

### Performance Test Data
- 1000+ Style entities for load testing
- Concurrent user simulation data
- Large file upload scenarios for thumbnails

## Acceptance Criteria Summary

1. ✅ All CRUD operations work correctly with proper validation
2. ✅ Slug uniqueness is enforced
3. ✅ Drag-and-drop priority reordering functions properly
4. ✅ Version management with rollback capability
5. ✅ Status workflow (draft → published → offline) enforced
6. ✅ Computed properties update reactively
7. ✅ Permission system controls access appropriately
8. ✅ Error handling provides clear feedback
9. ✅ Performance acceptable with large datasets
10. ✅ Real-time updates work across multiple users