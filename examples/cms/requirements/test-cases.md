# CMS Backend Test Cases

## TC001: Create Style (Admin)
- **Preconditions**: Admin user authenticated
- **Input Data**: 
  - label: "Manga Style"
  - slug: "manga"
  - description: "Japanese animation style"
  - type: "animation"
  - thumb_key: "styles/manga-thumb.jpg"
  - priority: 100
- **Expected Results**:
  1. Create new Style record with auto-generated UUID
  2. Status automatically set to "draft"
  3. created_at set to current timestamp
  4. updated_at set to current timestamp
  5. All input fields saved correctly
  6. Admin's style management count +1 (if tracked)
- **Post Validation**: Style appears in admin's draft styles list
- **Exception Scenarios**:
  - Duplicate slug should fail with validation error
  - Invalid type should fail validation
  - Empty required fields should fail validation

## TC002: Update Style Properties (Admin)
- **Preconditions**: Style exists in draft status, admin has update permission
- **Input Data**: 
  - styleId: "existing-uuid"
  - updates: { label: "Updated Manga", priority: 200 }
- **Expected Results**:
  1. Update specified fields only
  2. updated_at timestamp refreshed
  3. Other fields remain unchanged
  4. Style remains in same status
- **Post Validation**: Updated values reflected in style record
- **Exception Scenarios**:
  - Non-existent styleId should fail
  - Invalid field values should fail validation
  - Unauthorized user should be denied

## TC003: Publish Style (Admin)
- **Preconditions**: Style exists in draft status
- **Input Data**: styleId: "draft-style-uuid"
- **Expected Results**:
  1. Status changed from "draft" to "published"
  2. updated_at timestamp refreshed
  3. Style becomes visible to frontend queries
- **Post Validation**: Style appears in published styles list
- **Exception Scenarios**:
  - Already published style should fail
  - Offline style should be allowed to publish
  - Non-existent style should fail

## TC004: Unpublish Style (Admin)
- **Preconditions**: Style exists in published status
- **Input Data**: styleId: "published-style-uuid"
- **Expected Results**:
  1. Status changed from "published" to "offline"
  2. updated_at timestamp refreshed
  3. Style no longer visible to frontend queries
- **Post Validation**: Style appears in offline styles list
- **Exception Scenarios**:
  - Draft style should fail to unpublish
  - Already offline style should fail

## TC005: Delete Style (Admin)
- **Preconditions**: Style exists (any status)
- **Input Data**: styleId: "target-style-uuid"
- **Expected Results**:
  1. Style record removed from database
  2. Associated relations cleaned up
  3. Admin's style management count -1 (if tracked)
- **Post Validation**: Style no longer appears in any lists
- **Exception Scenarios**:
  - Non-existent style should fail
  - Unauthorized user should be denied

## TC006: List Styles by Status (Admin)
- **Preconditions**: Multiple styles exist with different statuses
- **Input Data**: status: "published" (or "draft", "offline")
- **Expected Results**:
  1. Return only styles matching requested status
  2. Results sorted by priority (ascending)
  3. Include all style properties
  4. Pagination support if many results
- **Post Validation**: All returned styles have correct status
- **Exception Scenarios**:
  - Invalid status should return empty list
  - No styles should return empty list

## TC007: Bulk Update Priorities (Admin)
- **Preconditions**: Multiple styles exist
- **Input Data**: 
  - updates: [
      { styleId: "uuid1", priority: 10 },
      { styleId: "uuid2", priority: 20 },
      { styleId: "uuid3", priority: 30 }
    ]
- **Expected Results**:
  1. All specified styles have priority updated
  2. updated_at timestamp refreshed for all
  3. Operation is atomic (all succeed or all fail)
  4. New sorting order reflected immediately
- **Post Validation**: Style list reflects new priority order
- **Exception Scenarios**:
  - Non-existent styleId should fail entire operation
  - Invalid priority values should fail entire operation
  - Partial failures should rollback all changes

## TC008: Create Version Snapshot (Admin)
- **Preconditions**: Styles exist in system
- **Input Data**: 
  - version_name: "Pre-Holiday-Update"
  - description: "Snapshot before holiday style changes"
- **Expected Results**:
  1. Create new Version record with current timestamp
  2. Capture current state of all styles
  3. Version accessible for future rollback
  4. Version appears in version history
- **Post Validation**: Version record contains complete style snapshot
- **Exception Scenarios**:
  - Empty version name should fail
  - Duplicate version name should fail

## TC009: Rollback to Version (Admin)
- **Preconditions**: Version snapshot exists, current styles differ from snapshot
- **Input Data**: versionId: "snapshot-uuid"
- **Expected Results**:
  1. All current styles replaced with snapshot data
  2. New version created automatically (rollback point)
  3. updated_at timestamps refreshed for all affected styles
  4. Operation is atomic (complete success or complete failure)
- **Post Validation**: Current styles match snapshot exactly
- **Exception Scenarios**:
  - Non-existent version should fail
  - Corrupted snapshot data should fail with full rollback

## TC010: Get Frontend Styles (Public API)
- **Preconditions**: Styles exist with various statuses
- **Input Data**: None (public endpoint)
- **Expected Results**:
  1. Return only styles with "published" status
  2. Results sorted by priority (ascending)
  3. Include all necessary fields for frontend display
  4. Exclude admin-only fields (created_at, updated_at)
- **Post Validation**: No draft or offline styles included
- **Exception Scenarios**:
  - No published styles should return empty array
  - Should work without authentication

## TC011: Invalid Authentication (Security)
- **Preconditions**: User not authenticated or invalid token
- **Input Data**: Any admin operation request
- **Expected Results**:
  1. Request rejected with 401 Unauthorized
  2. No data modification occurs
  3. Clear error message about authentication
- **Post Validation**: System state unchanged
- **Exception Scenarios**:
  - Expired tokens should be handled gracefully
  - Malformed tokens should be rejected

## TC012: Unauthorized Access (Security)
- **Preconditions**: User authenticated but without admin role
- **Input Data**: Admin operation request
- **Expected Results**:
  1. Request rejected with 403 Forbidden
  2. No data modification occurs
  3. Clear error message about permissions
- **Post Validation**: System state unchanged
- **Exception Scenarios**:
  - Regular users should not access admin operations
  - Unknown roles should be denied

## TC013: Concurrent Style Updates (Edge Case)
- **Preconditions**: Same style being updated by multiple admin users
- **Input Data**: Simultaneous update requests to same styleId
- **Expected Results**:
  1. Updates processed in order received
  2. Last update wins (optimistic locking)
  3. All updates reflect correct updated_at timestamps
  4. No data corruption occurs
- **Post Validation**: Final state is consistent and valid
- **Exception Scenarios**:
  - Conflicting updates should be handled gracefully
  - System should remain stable under concurrent load

## TC014: Slug Uniqueness Validation (Data Integrity)
- **Preconditions**: Style exists with slug "manga"
- **Input Data**: Attempt to create new style with slug "manga"
- **Expected Results**:
  1. Creation request fails with validation error
  2. Clear error message about slug uniqueness
  3. No partial record created
  4. Existing style remains unaffected
- **Post Validation**: Only one style with "manga" slug exists
- **Exception Scenarios**:
  - Case-insensitive uniqueness should be enforced
  - Special characters in slugs should be validated

## TC015: Bulk Operation Failure Recovery (Reliability)
- **Preconditions**: Multiple styles exist for bulk update
- **Input Data**: Bulk update with one invalid styleId among valid ones
- **Expected Results**:
  1. Entire bulk operation fails atomically
  2. No partial updates applied
  3. System state exactly as before operation
  4. Clear error identifying the failure cause
- **Post Validation**: All styles remain in original state
- **Exception Scenarios**:
  - Database connection failures should rollback
  - Validation failures should rollback completely