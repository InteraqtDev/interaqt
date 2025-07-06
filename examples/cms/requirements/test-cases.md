# CMS Style Management System - Test Cases

## TC001: Create Style (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with admin/editor role
- **Input Data**: 
  ```json
  {
    "label": "Cyberpunk",
    "slug": "cyberpunk",
    "description": "Futuristic digital art style",
    "type": "digital",
    "thumb_key": "styles/cyberpunk-thumb.jpg",
    "priority": 10
  }
  ```
- **Expected Results**:
  1. Create new Style record with status "draft"
  2. Auto-generate UUID for id
  3. Set created_at and updated_at to current time
  4. Create initial version record
  5. Return success with Style data
- **Post Validation**: Style appears in draft list with correct data

## TC002: Create Style with Invalid Data (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with admin/editor role
- **Input Data**: 
  ```json
  {
    "label": "",
    "slug": "invalid slug!@#",
    "type": "unknown_type"
  }
  ```
- **Expected Results**:
  1. Interaction returns validation error
  2. No Style record created
  3. Error details include field-specific messages
- **Note**: Do NOT test with storage.create - it bypasses validation!

## TC003: Update Style (via UpdateStyle Interaction)
- **Interaction**: UpdateStyle
- **Preconditions**: Style exists, user has edit permission
- **Input Data**:
  ```json
  {
    "id": "existing-style-id",
    "label": "Updated Cyberpunk",
    "description": "Enhanced futuristic art style",
    "priority": 15
  }
  ```
- **Expected Results**:
  1. Update Style record with new values
  2. Update updated_at timestamp
  3. Create new version record
  4. Preserve other unchanged fields
  5. Return success with updated Style

## TC004: Publish Style (via PublishStyle Interaction)
- **Interaction**: PublishStyle
- **Preconditions**: Style exists in "draft" status, user is admin
- **Input Data**: `{ "id": "style-id" }`
- **Expected Results**:
  1. Change Style status to "published"
  2. Update updated_at timestamp
  3. Create version record for status change
  4. Style becomes visible to end users

## TC005: Unpublish Style (via UnpublishStyle Interaction)
- **Interaction**: UnpublishStyle
- **Preconditions**: Style exists in "published" status, user is admin
- **Input Data**: `{ "id": "style-id" }`
- **Expected Results**:
  1. Change Style status to "offline"
  2. Update updated_at timestamp
  3. Create version record for status change
  4. Style hidden from end users but preserved

## TC006: Delete Style (via DeleteStyle Interaction)
- **Interaction**: DeleteStyle
- **Preconditions**: Style exists, user is admin
- **Input Data**: `{ "id": "style-id" }`
- **Expected Results**:
  1. Remove Style record from database
  2. Preserve version history for audit
  3. Return success confirmation

## TC007: Reorder Styles (via ReorderStyles Interaction)
- **Interaction**: ReorderStyles
- **Preconditions**: Multiple Styles exist, user is admin
- **Input Data**:
  ```json
  {
    "style_orders": [
      { "id": "style-1", "priority": 1 },
      { "id": "style-2", "priority": 2 },
      { "id": "style-3", "priority": 3 }
    ]
  }
  ```
- **Expected Results**:
  1. Update priority values for all specified Styles
  2. Update updated_at for modified Styles
  3. Create version records for changes
  4. Return success with updated order

## TC008: Rollback Style Version (via RollbackStyleVersion Interaction)
- **Interaction**: RollbackStyleVersion
- **Preconditions**: Style has version history, user is admin
- **Input Data**: `{ "style_id": "style-id", "target_version": 3 }`
- **Expected Results**:
  1. Restore Style to state from target version
  2. Create new version record (no destructive rollback)
  3. Update updated_at timestamp
  4. Preserve all version history

## TC009: Create Style - Permission Denied (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with "viewer" role
- **Input Data**: Valid Style data
- **Expected Results**:
  1. Interaction returns permission error
  2. No Style record created
  3. Error indicates insufficient permissions

## TC010: Update Style - Permission Denied (via UpdateStyle Interaction)
- **Interaction**: UpdateStyle
- **Preconditions**: Style exists, user is editor but not owner, user not admin
- **Input Data**: Valid update data
- **Expected Results**:
  1. Interaction returns permission error
  2. Style record unchanged
  3. No version record created

## TC011: List Published Styles (via ListPublishedStyles Interaction)
- **Interaction**: ListPublishedStyles
- **Preconditions**: Multiple Styles with different statuses exist
- **Input Data**: `{ "page": 1, "limit": 10 }`
- **Expected Results**:
  1. Return only Styles with "published" status
  2. Sort by priority (ascending)
  3. Include pagination metadata
  4. Exclude draft and offline Styles

## TC012: List All Styles for Admin (via ListAllStyles Interaction)
- **Interaction**: ListAllStyles
- **Preconditions**: User is admin, multiple Styles exist
- **Input Data**: `{ "page": 1, "limit": 10 }`
- **Expected Results**:
  1. Return all Styles regardless of status
  2. Sort by priority (ascending)
  3. Include status information
  4. Include pagination metadata

## TC013: Get Style Version History (via GetStyleVersions Interaction)
- **Interaction**: GetStyleVersions
- **Preconditions**: Style exists with version history, user has read permission
- **Input Data**: `{ "style_id": "style-id" }`
- **Expected Results**:
  1. Return chronological list of versions
  2. Include version number, timestamp, and creator
  3. Include snapshot data for each version
  4. Sort by creation time (newest first)

## TC014: Duplicate Slug Validation (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: Style with slug "existing-slug" already exists
- **Input Data**: Style data with slug "existing-slug"
- **Expected Results**:
  1. Interaction returns slug uniqueness error
  2. No Style record created
  3. Error message indicates slug already exists

## TC015: Upload Style Thumbnail (via UploadStyleThumbnail Interaction)
- **Interaction**: UploadStyleThumbnail
- **Preconditions**: Style exists, user has edit permission
- **Input Data**: `{ "style_id": "style-id", "image_file": <file_data> }`
- **Expected Results**:
  1. Upload image to S3 storage
  2. Update Style thumb_key with S3 key
  3. Update updated_at timestamp
  4. Create version record
  5. Return S3 URL for immediate use