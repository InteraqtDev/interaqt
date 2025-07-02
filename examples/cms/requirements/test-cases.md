# CMS Style Management System - Test Cases

## TC001: Create Style
**Description**: Create a new style with all required properties
- **Preconditions**: User has admin or editor role and is authenticated
- **Input Data**: 
  ```json
  {
    "label": "Manga Art",
    "slug": "manga-art", 
    "description": "Japanese manga style artwork",
    "type": "animation",
    "thumb_key": "styles/thumbnails/manga-art.jpg",
    "priority": 100
  }
  ```
- **Expected Results**:
  1. Create new Style record with provided data
  2. Auto-generate UUID for id field
  3. Set status to "draft" by default
  4. Set created_at to current timestamp
  5. Set updated_at to current timestamp
  6. Link style to creating user via StyleCreatedBy relation
  7. Link style to updating user via StyleUpdatedBy relation
- **Post Validation**: Style appears in styles list with draft status

## TC002: Update Style Properties
**Description**: Modify existing style properties
- **Preconditions**: Style exists and user has permission to update
- **Input Data**: 
  ```json
  {
    "styleId": "existing-style-id",
    "label": "Updated Manga Art",
    "description": "Updated description for manga style",
    "priority": 150
  }
  ```
- **Expected Results**:
  1. Update specified properties on existing style
  2. Update updated_at timestamp
  3. Link style to updating user via StyleUpdatedBy relation
  4. Preserve unchanged properties
  5. Maintain creation audit trail
- **Post Validation**: Style shows updated values and new updated_at timestamp

## TC003: Change Style Status
**Description**: Change style lifecycle status (draft → published → offline)
- **Preconditions**: Style exists in draft status, user has appropriate permissions
- **Input Data**: 
  ```json
  {
    "styleId": "existing-style-id",
    "status": "published"
  }
  ```
- **Expected Results**:
  1. Update style status to "published"
  2. Update updated_at timestamp
  3. Style becomes visible in published styles list
  4. Style becomes available for version inclusion
- **Post Validation**: Style status changed and audit trail preserved

## TC004: Soft Delete Style
**Description**: Mark style as offline (soft delete)
- **Preconditions**: Style exists, user has admin role
- **Input Data**: 
  ```json
  {
    "styleId": "existing-style-id"
  }
  ```
- **Expected Results**:
  1. Set style status to "offline"
  2. Update updated_at timestamp
  3. Style disappears from active styles list
  4. Style data preserved for audit purposes
- **Exception Scenario**: Cannot delete style that is part of current published version

## TC005: List Styles with Filtering
**Description**: Query styles with various filters and sorting
- **Preconditions**: Multiple styles exist with different statuses and properties
- **Input Data**: 
  ```json
  {
    "status": "published",
    "type": "animation", 
    "sortBy": "priority",
    "sortOrder": "desc",
    "limit": 10,
    "offset": 0
  }
  ```
- **Expected Results**:
  1. Return only styles matching filter criteria
  2. Sort results by specified field and order
  3. Include pagination metadata
  4. Return related user information for audit
- **Post Validation**: Results match filter criteria and sorting order

## TC006: Get Style Detail
**Description**: Retrieve complete style information including relationships
- **Preconditions**: Style exists and user has read permission
- **Input Data**: 
  ```json
  {
    "styleId": "existing-style-id"
  }
  ```
- **Expected Results**:
  1. Return complete style data
  2. Include created_by user information
  3. Include updated_by user information
  4. Include version associations if any
- **Post Validation**: All related data is properly populated

## TC007: Create Version
**Description**: Create a new version snapshot with selected styles
- **Preconditions**: Published styles exist, user has editor or admin role
- **Input Data**: 
  ```json
  {
    "name": "Version 1.2.0",
    "description": "New styles for Q2 release",
    "styleIds": ["style-id-1", "style-id-2", "style-id-3"]
  }
  ```
- **Expected Results**:
  1. Create new Version record
  2. Link specified styles to version via StyleVersion relations
  3. Set version status to draft initially
  4. Link version to creating user
  5. Preserve style data at time of version creation
- **Exception Scenario**: Cannot include draft or offline styles in version

## TC008: Publish Version
**Description**: Mark a version as current active version
- **Preconditions**: Version exists in draft status, user has admin role
- **Input Data**: 
  ```json
  {
    "versionId": "version-id"
  }
  ```
- **Expected Results**:
  1. Set specified version is_current = true
  2. Set all other versions is_current = false
  3. Update version timestamps
  4. Version becomes active for frontend consumption
- **Post Validation**: Only one version has is_current = true

## TC009: Rollback to Previous Version
**Description**: Revert to a previously published version
- **Preconditions**: Target version exists and was previously published, user has admin role
- **Input Data**: 
  ```json
  {
    "versionId": "previous-version-id"
  }
  ```
- **Expected Results**:
  1. Set target version is_current = true
  2. Set current version is_current = false
  3. Update version timestamps
  4. Frontend sees styles from target version
- **Post Validation**: Target version is now current, style data matches version snapshot

## TC010: Update Style Priorities (Bulk)
**Description**: Update priority values for multiple styles at once
- **Preconditions**: Multiple styles exist, user has admin or editor role
- **Input Data**: 
  ```json
  {
    "updates": [
      {"styleId": "style-1", "priority": 100},
      {"styleId": "style-2", "priority": 200},
      {"styleId": "style-3", "priority": 300}
    ]
  }
  ```
- **Expected Results**:
  1. Update priority for each specified style
  2. Update updated_at for each style
  3. Maintain audit trail for each change
  4. Operation is atomic (all succeed or all fail)
- **Post Validation**: All styles have new priority values and updated timestamps

## TC011: Duplicate Slug Validation
**Description**: Prevent creation of styles with duplicate slugs
- **Preconditions**: Style with slug "manga-art" already exists
- **Input Data**: 
  ```json
  {
    "label": "Another Manga",
    "slug": "manga-art",
    "description": "Different manga style",
    "type": "animation"
  }
  ```
- **Expected Results**:
  1. Interaction fails with validation error
  2. Error message indicates slug must be unique
  3. No style record is created
- **Exception Scenario**: This is the expected failure case

## TC012: Invalid Status Transition
**Description**: Prevent invalid status changes
- **Preconditions**: Style exists in "offline" status
- **Input Data**: 
  ```json
  {
    "styleId": "offline-style-id",
    "status": "published"
  }
  ```
- **Expected Results**:
  1. Interaction fails with validation error
  2. Error message indicates invalid status transition
  3. Style status remains unchanged
- **Exception Scenario**: Direct offline → published transition should not be allowed

## TC013: Permission Denied - Editor Deleting Style
**Description**: Verify permission controls work correctly
- **Preconditions**: Style exists, user has editor role (not admin)
- **Input Data**: 
  ```json
  {
    "styleId": "existing-style-id"
  }
  ```
- **Expected Results**:
  1. DeleteStyle interaction fails with permission error
  2. Style data remains unchanged
  3. Error message indicates insufficient permissions
- **Exception Scenario**: This is the expected failure case

## TC014: Search Styles by Text
**Description**: Find styles using text search on label and description
- **Preconditions**: Multiple styles exist with various labels and descriptions
- **Input Data**: 
  ```json
  {
    "searchText": "manga",
    "searchFields": ["label", "description"]
  }
  ```
- **Expected Results**:
  1. Return styles where label or description contains "manga"
  2. Search is case-insensitive
  3. Results include relevance scoring
  4. Pagination works with search results
- **Post Validation**: All returned styles contain search term in specified fields

## TC015: Version Content Immutability
**Description**: Verify that published versions preserve style data even after style updates
- **Preconditions**: Version published with specific styles, styles subsequently updated
- **Input Data**: Query published version content
- **Expected Results**:
  1. Version shows original style data at time of version creation
  2. Subsequent style updates do not affect version content
  3. Version maintains referential integrity
- **Post Validation**: Version content remains stable regardless of style changes