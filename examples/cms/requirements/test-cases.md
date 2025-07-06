# Style Management System - Test Cases

🔴 **CRITICAL: All test cases are based on Interactions, NOT on Entity/Relation operations**

## TC001: Create Style (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with editor or admin role
- **Input Data**: 
  ```json
  {
    "label": "Modern Art",
    "slug": "modern-art",
    "description": "Contemporary artistic styles",
    "type": "artistic",
    "thumb_key": "s3://bucket/modern-art-thumb.jpg",
    "priority": 10
  }
  ```
- **Expected Results**:
  1. Create new Style record with status "draft"
  2. Auto-generate unique id (uuid)
  3. Set created_at to current timestamp
  4. Set updated_at to current timestamp
  5. User's created style count automatically +1
- **Post Validation**: Style appears in user's created styles list with draft status

## TC002: Create Style with Invalid Data (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with editor or admin role
- **Input Data**: 
  ```json
  {
    "label": "",
    "slug": "",
    "description": "",
    "type": "",
    "thumb_key": "",
    "priority": -1
  }
  ```
- **Expected Results**:
  1. Interaction returns validation error
  2. Error type is "validation failed"
  3. No Style record created
  4. User's created style count unchanged
- **Note**: Do NOT test this with storage.create - it bypasses validation!

## TC003: Create Style with Duplicate Slug (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: 
  - User logged in with editor or admin role
  - Style with slug "existing-slug" already exists
- **Input Data**: 
  ```json
  {
    "label": "New Style",
    "slug": "existing-slug",
    "description": "This should fail",
    "type": "test",
    "thumb_key": "s3://bucket/test.jpg",
    "priority": 5
  }
  ```
- **Expected Results**:
  1. Interaction returns uniqueness constraint error
  2. Error message indicates slug already exists
  3. No new Style record created
  4. Existing style with same slug unchanged

## TC004: Update Style (via UpdateStyle Interaction)
- **Interaction**: UpdateStyle
- **Preconditions**: 
  - User logged in with appropriate permissions
  - Style exists with id "style123"
  - User is creator of the style OR has admin role
- **Input Data**: 
  ```json
  {
    "styleId": "style123",
    "updates": {
      "label": "Updated Modern Art",
      "description": "Updated description",
      "priority": 15
    }
  }
  ```
- **Expected Results**:
  1. Update specified fields in Style record
  2. updated_at timestamp changes to current time
  3. created_at timestamp remains unchanged
  4. Other fields remain unchanged
  5. Style status remains the same
- **Post Validation**: Updated data persists and is retrievable

## TC005: Update Style Without Permission (via UpdateStyle Interaction)
- **Interaction**: UpdateStyle
- **Preconditions**: 
  - User logged in with editor role
  - Style exists created by different user
  - Current user is NOT admin
- **Input Data**: 
  ```json
  {
    "styleId": "style123",
    "updates": {
      "label": "Unauthorized Update"
    }
  }
  ```
- **Expected Results**:
  1. Interaction returns permission denied error
  2. No changes made to Style record
  3. updated_at timestamp unchanged
- **Exception Scenario**: Permission check happens at Interaction level

## TC006: Publish Style (via PublishStyle Interaction)
- **Interaction**: PublishStyle
- **Preconditions**: 
  - User logged in with publish permission (editor or admin)
  - Style exists with status "draft"
- **Input Data**: 
  ```json
  {
    "styleId": "style123"
  }
  ```
- **Expected Results**:
  1. Style status changes from "draft" to "published"
  2. updated_at timestamp updated
  3. System published style count automatically +1
  4. System draft style count automatically -1
- **Post Validation**: Style appears in published styles list

## TC007: Unpublish Style (via UnpublishStyle Interaction)
- **Interaction**: UnpublishStyle
- **Preconditions**: 
  - User logged in with admin role
  - Style exists with status "published"
- **Input Data**: 
  ```json
  {
    "styleId": "style123"
  }
  ```
- **Expected Results**:
  1. Style status changes from "published" to "offline"
  2. updated_at timestamp updated
  3. System published style count automatically -1
  4. System offline style count automatically +1
- **Post Validation**: Style no longer appears in published styles list

## TC008: Delete Style (via DeleteStyle Interaction)
- **Interaction**: DeleteStyle
- **Preconditions**: 
  - User logged in with admin role
  - Style exists with any status
- **Input Data**: 
  ```json
  {
    "styleId": "style123"
  }
  ```
- **Expected Results**:
  1. Style record marked as deleted (soft delete)
  2. Style no longer appears in normal queries
  3. Audit trail preserved
  4. System total style count -1
- **Post Validation**: Style not found in regular list queries

## TC009: Reorder Styles (via ReorderStyles Interaction)
- **Interaction**: ReorderStyles
- **Preconditions**: 
  - User logged in with editor or admin role
  - Multiple styles exist
- **Input Data**: 
  ```json
  {
    "styleUpdates": [
      {"styleId": "style1", "priority": 1},
      {"styleId": "style2", "priority": 2},
      {"styleId": "style3", "priority": 3}
    ]
  }
  ```
- **Expected Results**:
  1. Each style's priority updated to specified value
  2. All specified styles have updated_at timestamp changed
  3. Styles appear in new order when queried with sorting
- **Post Validation**: Query results respect new priority ordering

## TC010: List Styles with Filtering (via ListStyles Interaction)
- **Interaction**: ListStyles
- **Preconditions**: 
  - User logged in
  - Multiple styles exist with different statuses and types
- **Input Data**: 
  ```json
  {
    "filters": {
      "status": "published",
      "type": "artistic"
    },
    "sortBy": "priority",
    "sortOrder": "asc"
  }
  ```
- **Expected Results**:
  1. Return only styles matching filter criteria
  2. Results sorted by priority ascending
  3. Each style includes all requested fields
  4. Pagination metadata included if applicable
- **Post Validation**: All returned styles match filter criteria

## TC011: Search Styles (via SearchStyles Interaction)
- **Interaction**: SearchStyles
- **Preconditions**: 
  - User logged in
  - Styles exist with searchable content
- **Input Data**: 
  ```json
  {
    "searchTerm": "modern",
    "searchFields": ["label", "description"],
    "limit": 10
  }
  ```
- **Expected Results**:
  1. Return styles where label or description contains "modern"
  2. Results limited to specified count
  3. Search is case-insensitive
  4. Results ranked by relevance
- **Post Validation**: All results contain search term in specified fields

## TC012: Create Version (via CreateVersion Interaction)
- **Interaction**: CreateVersion
- **Preconditions**: 
  - User logged in with admin role
  - Current published styles exist
- **Input Data**: 
  ```json
  {
    "versionName": "v2.1.0",
    "description": "Added new artistic styles and updated priorities"
  }
  ```
- **Expected Results**:
  1. Create new Version record
  2. Snapshot current state of all published styles
  3. Version marked as working version (not published)
  4. created_at timestamp set
- **Post Validation**: Version appears in version history

## TC013: Publish Version (via PublishVersion Interaction)
- **Interaction**: PublishVersion
- **Preconditions**: 
  - User logged in with admin role
  - Version exists in non-published state
  - Version contains valid style data
- **Input Data**: 
  ```json
  {
    "versionId": "version123"
  }
  ```
- **Expected Results**:
  1. Version marked as current/published
  2. All styles in version become active
  3. Previous version marked as historical
  4. published_at timestamp set
  5. System current version automatically updated
- **Post Validation**: Version shows as current in system status

## TC014: Rollback Version (via RollbackVersion Interaction)
- **Interaction**: RollbackVersion
- **Preconditions**: 
  - User logged in with admin role
  - Target version exists and was previously published
  - Current system state differs from target version
- **Input Data**: 
  ```json
  {
    "targetVersionId": "version120"
  }
  ```
- **Expected Results**:
  1. System state reverted to target version
  2. All styles restored to target version state
  3. New rollback version created for audit trail
  4. Current version reference updated
- **Post Validation**: All style data matches target version snapshot

## TC015: Unauthorized Access (via Any Interaction)
- **Interaction**: Any restricted interaction
- **Preconditions**: 
  - User NOT logged in OR insufficient permissions
- **Input Data**: Any valid data for the interaction
- **Expected Results**:
  1. Interaction returns authentication/authorization error
  2. No data changes occur
  3. Error message indicates permission issue
  4. Audit log records access attempt
- **Exception Scenario**: Authentication/authorization check happens at Interaction level

## Permission Matrix

| Role | CreateStyle | UpdateStyle | DeleteStyle | PublishStyle | UnpublishStyle | CreateVersion | PublishVersion | RollbackVersion |
|------|-------------|-------------|-------------|--------------|----------------|---------------|----------------|-----------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editor | ✅ | ✅ (own) | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Viewer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Edge Cases and Error Scenarios

1. **Concurrent Updates**: Multiple users updating same style simultaneously
2. **Network Failures**: Interaction interrupted during execution
3. **Data Corruption**: Invalid data states requiring recovery
4. **Version Conflicts**: Rollback when current data has newer changes
5. **Storage Limits**: Exceeding system capacity limits
6. **Invalid References**: Referencing non-existent entities

Each edge case should be tested through the appropriate Interaction, not through direct storage manipulation.