# Test Cases for Style Management System

## TC001: Create Style (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with admin/editor role
- **Input Data**: 
  ```json
  {
    "label": "Manga Style",
    "slug": "manga-style",
    "description": "Japanese manga illustration style",
    "type": "animation",
    "thumb_key": "styles/manga/thumb.jpg",
    "priority": 100
  }
  ```
- **Expected Results**:
  1. Create new style record with status "draft"
  2. Set createdAt to current timestamp
  3. Set updatedAt to current timestamp
  4. Link createdBy to current user
  5. Set updatedBy to current user
- **Post Validation**: Style appears in user's created styles list

## TC002: Create Style with Invalid Data (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: User logged in with admin/editor role
- **Input Data**: 
  ```json
  {
    "label": "",
    "slug": "",
    "type": "invalid-type"
  }
  ```
- **Expected Results**:
  1. Interaction returns validation error
  2. Error details specify missing label and slug
  3. No style record created
  4. User's style count unchanged

## TC003: Create Style with Duplicate Slug (via CreateStyle Interaction)
- **Interaction**: CreateStyle
- **Preconditions**: Style with slug "existing-slug" already exists
- **Input Data**:
  ```json
  {
    "label": "New Style",
    "slug": "existing-slug",
    "description": "Duplicate slug test",
    "type": "surreal"
  }
  ```
- **Expected Results**:
  1. Interaction returns conflict error
  2. Error type is "duplicate_slug"
  3. No style record created

## TC004: Update Style (via UpdateStyle Interaction)
- **Interaction**: UpdateStyle
- **Preconditions**: Style exists and user has edit permission
- **Input Data**:
  ```json
  {
    "styleId": "style-123",
    "label": "Updated Manga Style",
    "description": "Updated description",
    "priority": 200
  }
  ```
- **Expected Results**:
  1. Style record updated with new values
  2. updatedAt timestamp updated
  3. updatedBy linked to current user
  4. Other fields remain unchanged

## TC005: Publish Style (via PublishStyle Interaction)
- **Interaction**: PublishStyle
- **Preconditions**: Style exists in draft status, user has admin role
- **Input Data**: `{ "styleId": "style-123" }`
- **Expected Results**:
  1. Style status changes to "published"
  2. updatedAt timestamp updated
  3. updatedBy linked to current user
  4. Style becomes available for versions

## TC006: Delete Style (via DeleteStyle Interaction)
- **Interaction**: DeleteStyle
- **Preconditions**: Style exists, user has admin role
- **Input Data**: `{ "styleId": "style-123" }`
- **Expected Results**:
  1. Style status changes to "offline" (soft delete)
  2. updatedAt timestamp updated
  3. Style removed from all versions
  4. isDeleted computed property becomes true

## TC007: Create Version (via CreateVersion Interaction)
- **Interaction**: CreateVersion
- **Preconditions**: User logged in with admin role
- **Input Data**:
  ```json
  {
    "label": "Spring 2024 Collection",
    "description": "Spring collection with new animation styles"
  }
  ```
- **Expected Results**:
  1. Create new version record
  2. Auto-increment versionNumber
  3. Set isActive to false (not published yet)
  4. Link createdBy to current user
  5. Set createdAt to current timestamp

## TC008: Publish Version (via PublishVersion Interaction)
- **Interaction**: PublishVersion
- **Preconditions**: Version exists, user has admin role
- **Input Data**: `{ "versionId": "version-456" }`
- **Expected Results**:
  1. Target version isActive becomes true
  2. All other versions' isActive become false
  3. Only one active version exists in system

## TC009: Add Style to Version (via AddStyleToVersion Interaction)
- **Interaction**: AddStyleToVersion
- **Preconditions**: Style and version exist, style is published, user has admin role
- **Input Data**:
  ```json
  {
    "styleId": "style-123",
    "versionId": "version-456",
    "order": 1
  }
  ```
- **Expected Results**:
  1. Create StyleVersion relation record
  2. Style linked to version with specified order
  3. Version's styleCount automatically increments

## TC010: Reorder Styles in Version (via ReorderStylesInVersion Interaction)
- **Interaction**: ReorderStylesInVersion
- **Preconditions**: Multiple styles exist in version, user has admin role
- **Input Data**:
  ```json
  {
    "versionId": "version-456",
    "styleOrders": [
      {"styleId": "style-123", "order": 2},
      {"styleId": "style-456", "order": 1}
    ]
  }
  ```
- **Expected Results**:
  1. Update order values for all specified styles
  2. Maintain unique order values within version

## TC011: Permission Denied - Editor Cannot Publish Version
- **Interaction**: PublishVersion
- **Preconditions**: User has editor role (not admin)
- **Input Data**: `{ "versionId": "version-456" }`
- **Expected Results**:
  1. Interaction returns permission error
  2. Error type is "permission_denied"
  3. Version status unchanged

## TC012: Permission Denied - Viewer Cannot Create Style
- **Interaction**: CreateStyle
- **Preconditions**: User has viewer role
- **Input Data**: Valid style data
- **Expected Results**:
  1. Interaction returns permission error
  2. Error type is "permission_denied"
  3. No style record created

## TC013: Rollback to Previous Version (via PublishVersion Interaction)
- **Interaction**: PublishVersion
- **Preconditions**: Previous version exists, user has admin role
- **Input Data**: `{ "versionId": "previous-version-id" }`
- **Expected Results**:
  1. Previous version becomes active
  2. Current active version becomes inactive
  3. System effectively "rolls back" to previous state

## TC014: Query Active Version Styles
- **Query Operation**: Get styles in active version
- **Preconditions**: Active version exists with styles
- **Expected Results**:
  1. Return all published styles in active version
  2. Styles ordered by priority/order field
  3. Include style metadata (label, slug, type, etc.)

## TC015: Computed Properties Validation
- **Focus**: Verify all computed properties update correctly
- **Test Cases**:
  1. Style.isPublished updates when status changes
  2. Version.styleCount updates when styles added/removed
  3. User.createdStyleCount updates when user creates styles
  4. User.lastActivityAt updates on any user interaction

## TC016: Concurrent Version Publishing
- **Interaction**: PublishVersion (concurrent calls)
- **Preconditions**: Two admin users try to publish different versions simultaneously
- **Expected Results**:
  1. Only one version becomes active
  2. Last successful publish wins
  3. No multiple active versions exist

## TC017: Delete Style Used in Active Version
- **Interaction**: DeleteStyle
- **Preconditions**: Style is in active version, user has admin role
- **Input Data**: `{ "styleId": "style-in-active-version" }`
- **Expected Results**:
  1. Style status changes to "offline"
  2. Style automatically removed from all versions
  3. Version styleCount decrements

## TC018: Invalid State Transition
- **Interaction**: PublishStyle
- **Preconditions**: Style is already "offline" (deleted)
- **Input Data**: `{ "styleId": "deleted-style-id" }`
- **Expected Results**:
  1. Interaction returns state transition error
  2. Error indicates invalid state transition
  3. Style status unchanged

## Summary
- **Total Test Cases**: 18
- **CRUD Operations**: 9 test cases
- **Permission Controls**: 3 test cases  
- **Business Logic**: 4 test cases
- **Error Scenarios**: 6 test cases
- **Computed Properties**: 1 comprehensive test case

All test cases focus on Interaction-based testing as required by the interaqt framework principles.