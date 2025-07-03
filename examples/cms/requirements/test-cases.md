# Test Cases - Style Management System

## User Management Test Cases

### TC001: Create User (Setup Only - No Authentication Logic)
- **Preconditions**: System setup
- **Input Data**: 
  ```json
  {
    "name": "John Editor",
    "email": "john@example.com", 
    "role": "editor"
  }
  ```
- **Expected Results**:
  1. Create new User record with auto-generated ID
  2. created_at is current timestamp
  3. User can be retrieved by ID
- **Post Validation**: User appears in system storage

## Style Management Test Cases

### TC002: Create Style (Draft)
- **Preconditions**: User with "editor" or "admin" role exists
- **Input Data**:
  ```json
  {
    "label": "Manga Style",
    "slug": "manga",
    "description": "Japanese manga illustration style",
    "type": "animation",
    "thumb_key": "s3://bucket/manga-thumb.jpg",
    "priority": 1
  }
  ```
- **Expected Results**:
  1. Create new Style record with auto-generated ID
  2. Status is "draft" by default
  3. created_at and updated_at are current timestamp
  4. created_by links to the user
  5. User's created_styles_count automatically +1
- **Post Validation**: Style appears in draft styles list

### TC003: Update Style Properties
- **Preconditions**: Draft style exists, user has permission
- **Input Data**:
  ```json
  {
    "styleId": "style-123",
    "label": "Updated Manga Style",
    "description": "Updated description",
    "priority": 2
  }
  ```
- **Expected Results**:
  1. Style properties are updated
  2. updated_at timestamp is refreshed
  3. Other properties remain unchanged
- **Exception Scenario**: Cannot update published styles by non-admin users

### TC004: Publish Style
- **Preconditions**: Draft style exists, user has "admin" role
- **Input Data**:
  ```json
  {
    "styleId": "style-123"
  }
  ```
- **Expected Results**:
  1. Style status changes to "published"
  2. is_published computation becomes true
  3. last_published_at is set to current timestamp
  4. updated_at is refreshed
- **Exception Scenario**: Non-admin users cannot publish styles

### TC005: Soft Delete Style
- **Preconditions**: Style exists, user has "admin" role
- **Input Data**:
  ```json
  {
    "styleId": "style-123"
  }
  ```
- **Expected Results**:
  1. Style status changes to "offline"
  2. Style no longer appears in active styles list
  3. Style still exists in storage (soft delete)
  4. All relations remain intact
- **Exception Scenario**: Non-admin users cannot delete styles

### TC006: Reorder Styles
- **Preconditions**: Multiple styles exist, user has permission
- **Input Data**:
  ```json
  {
    "reorderList": [
      {"styleId": "style-1", "priority": 1},
      {"styleId": "style-2", "priority": 2},
      {"styleId": "style-3", "priority": 3}
    ]
  }
  ```
- **Expected Results**:
  1. All specified styles have their priority updated
  2. updated_at timestamp refreshed for all modified styles
  3. Styles appear in new order when queried with priority sorting

## Version Management Test Cases

### TC007: Create Version
- **Preconditions**: User with "editor" or "admin" role exists
- **Input Data**:
  ```json
  {
    "version_number": "v1.0",
    "description": "Initial style collection release"
  }
  ```
- **Expected Results**:
  1. Create new Version record with auto-generated ID
  2. Status is "draft" by default
  3. created_at is current timestamp
  4. created_by links to the user
  5. User's created_versions_count automatically +1
  6. style_count is 0 initially
- **Post Validation**: Version appears in versions list

### TC008: Add Style to Version
- **Preconditions**: Version and Style exist in draft status
- **Input Data**:
  ```json
  {
    "versionId": "version-123",
    "styleId": "style-456"
  }
  ```
- **Expected Results**:
  1. Create StyleVersion relation record
  2. Version's style_count automatically +1
  3. Style's version_count automatically +1
- **Exception Scenario**: Cannot add offline styles to version

### TC009: Remove Style from Version
- **Preconditions**: Style is already in version, version is draft
- **Input Data**:
  ```json
  {
    "versionId": "version-123",
    "styleId": "style-456"
  }
  ```
- **Expected Results**:
  1. Remove StyleVersion relation record
  2. Version's style_count automatically -1
  3. Style's version_count automatically -1
- **Exception Scenario**: Cannot modify published versions

### TC010: Publish Version
- **Preconditions**: Draft version with styles exists, user has "admin" role
- **Input Data**:
  ```json
  {
    "versionId": "version-123"
  }
  ```
- **Expected Results**:
  1. Version status changes to "published"
  2. published_at is set to current timestamp
  3. is_current computation becomes true
  4. All other versions' is_current becomes false (only one current version)
  5. All styles in this version become "published"
- **Exception Scenario**: Non-admin users cannot publish versions

### TC011: Rollback to Previous Version
- **Preconditions**: Multiple versions exist, at least one published, user has "admin" role
- **Input Data**:
  ```json
  {
    "targetVersionId": "version-456"
  }
  ```
- **Expected Results**:
  1. Target version status changes to "published"
  2. Current version status changes to "archived"
  3. Target version's is_current becomes true
  4. All styles in target version become "published"
  5. Styles not in target version become "draft" or remain "offline"
- **Exception Scenario**: Cannot rollback to non-existent or deleted versions

## Query Operations Test Cases

### TC012: List Styles with Filtering
- **Preconditions**: Multiple styles with different statuses and types exist
- **Input Data**:
  ```json
  {
    "status": "published",
    "type": "animation",
    "orderBy": "priority",
    "order": "ASC"
  }
  ```
- **Expected Results**:
  1. Return only styles matching filter criteria
  2. Results sorted by priority ascending
  3. Include computed properties (version_count, is_published)
- **Variations**: Filter by different combinations of status, type

### TC013: Get Style Details
- **Preconditions**: Style exists
- **Input Data**:
  ```json
  {
    "styleId": "style-123"
  }
  ```
- **Expected Results**:
  1. Return complete style data
  2. Include all computed properties
  3. Include created_by user information
  4. Include list of versions containing this style

### TC014: List Versions with Styles
- **Preconditions**: Multiple versions with styles exist
- **Input Data**:
  ```json
  {
    "includeStyles": true,
    "orderBy": "created_at",
    "order": "DESC"
  }
  ```
- **Expected Results**:
  1. Return all versions ordered by creation date (newest first)
  2. Include computed properties (style_count, is_current)
  3. Include full style data for each version
  4. Include created_by user information

### TC015: Search Styles
- **Preconditions**: Multiple styles with different labels and descriptions exist
- **Input Data**:
  ```json
  {
    "searchTerm": "manga",
    "searchFields": ["label", "description", "type"]
  }
  ```
- **Expected Results**:
  1. Return styles where any specified field contains search term (case-insensitive)
  2. Include relevance scoring if possible
  3. Exclude offline styles unless specifically requested

## Permission Control Test Cases

### TC016: Editor Creates Style
- **Preconditions**: User with "editor" role
- **Expected Results**: Successfully creates style in draft status

### TC017: Editor Attempts to Publish Style
- **Preconditions**: User with "editor" role, draft style exists
- **Expected Results**: Operation fails with permission denied error

### TC018: Viewer Attempts to Create Style
- **Preconditions**: User with "viewer" role
- **Expected Results**: Operation fails with permission denied error

### TC019: Admin Full Access
- **Preconditions**: User with "admin" role
- **Expected Results**: Can perform all operations successfully

## Edge Cases and Error Scenarios

### TC020: Duplicate Slug Prevention
- **Preconditions**: Style with slug "manga" exists
- **Input Data**: New style with same slug "manga"
- **Expected Results**: Operation fails with duplicate slug error

### TC021: Invalid Version Number Format
- **Preconditions**: Creating new version
- **Input Data**: Invalid version number like "1.0.0.0.0"
- **Expected Results**: Operation fails with invalid format error

### TC022: Multiple Current Versions Prevention
- **Preconditions**: One published version exists
- **Input Data**: Attempt to publish second version
- **Expected Results**: Previous version automatically becomes "archived"

### TC023: Offline Style in Version
- **Preconditions**: Style with "offline" status
- **Input Data**: Attempt to add to version
- **Expected Results**: Operation fails with status validation error

### TC024: Version Rollback to Same Version
- **Preconditions**: Currently published version
- **Input Data**: Attempt to rollback to same version
- **Expected Results**: Operation succeeds but no changes made (idempotent)

## Data Consistency Validation

### TC025: Computed Property Accuracy
- **Preconditions**: Complex style-version relationships exist
- **Validation Points**:
  1. style_count matches actual relation count
  2. version_count matches actual relation count
  3. created_styles_count matches user's actual styles
  4. is_current computation is accurate
  5. Only one version has is_current = true

### TC026: Cascade Behavior Verification
- **Preconditions**: Version with multiple styles published
- **Operations**: Delete version, modify style status
- **Validation Points**:
  1. Relation cleanup works correctly
  2. Computed properties update appropriately
  3. No orphaned records created
  4. Data consistency maintained across all operations