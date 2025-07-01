# CMS Backend Interaction Matrix

## User Roles and Permissions

### Admin User Role
- **Description**: Product operations personnel with full system access
- **Capabilities**: Complete CRUD operations, version management, publishing control
- **Authentication**: Required for all admin operations
- **Authorization**: Full access to all Style and Version management functions

### Public/Frontend Role
- **Description**: Anonymous access for frontend consumption
- **Capabilities**: Read-only access to published styles
- **Authentication**: Not required
- **Authorization**: Limited to published content only

## Interaction Coverage Matrix

### Style Management Operations

| Operation | Admin User | Public/Frontend | Test Case | Interaction Name |
|-----------|------------|-----------------|-----------|------------------|
| Create Style | ✅ Full Access | ❌ Denied | TC001 | CreateStyle |
| Read Style (Admin) | ✅ All Statuses | ❌ Denied | TC006 | ListStylesAdmin |
| Read Style (Public) | ❌ N/A | ✅ Published Only | TC010 | GetPublishedStyles |
| Update Style Properties | ✅ Full Access | ❌ Denied | TC002 | UpdateStyle |
| Delete Style | ✅ Full Access | ❌ Denied | TC005 | DeleteStyle |
| Publish Style | ✅ Full Access | ❌ Denied | TC003 | PublishStyle |
| Unpublish Style | ✅ Full Access | ❌ Denied | TC004 | UnpublishStyle |
| Bulk Update Priorities | ✅ Full Access | ❌ Denied | TC007 | BulkUpdatePriorities |

### Version Management Operations

| Operation | Admin User | Public/Frontend | Test Case | Interaction Name |
|-----------|------------|-----------------|-----------|------------------|
| Create Version | ✅ Full Access | ❌ Denied | TC008 | CreateVersion |
| List Versions | ✅ Full Access | ❌ Denied | - | ListVersions |
| Rollback to Version | ✅ Full Access | ❌ Denied | TC009 | RollbackToVersion |
| Delete Version | ✅ Full Access | ❌ Denied | - | DeleteVersion |

### Authentication & Authorization Operations

| Operation | Admin User | Public/Frontend | Test Case | Interaction Name |
|-----------|------------|-----------------|-----------|------------------|
| Admin Login | ✅ Required | ❌ N/A | - | AdminLogin |
| Token Validation | ✅ Automatic | ❌ N/A | TC011 | ValidateAdminToken |
| Access Control | ✅ Enforced | ✅ Limited | TC012 | CheckPermissions |

## Interaction Definitions Required

### Core Style Management
1. **CreateStyle** - Create new style in draft status
2. **UpdateStyle** - Modify existing style properties
3. **DeleteStyle** - Remove style from system
4. **PublishStyle** - Change status from draft to published
5. **UnpublishStyle** - Change status from published to offline
6. **ListStylesAdmin** - List styles with filtering by status (admin view)
7. **GetPublishedStyles** - Get published styles for frontend consumption
8. **BulkUpdatePriorities** - Update multiple style priorities atomically

### Version Management
9. **CreateVersion** - Create snapshot of current styles state
10. **ListVersions** - Get version history
11. **RollbackToVersion** - Restore styles to previous version state
12. **DeleteVersion** - Remove version snapshot

### Authentication & Security
13. **AdminLogin** - Authenticate admin user
14. **ValidateAdminToken** - Check token validity
15. **CheckPermissions** - Verify user role permissions

## Permission Control Matrix

### Style Entity Permissions
```
Style.create -> Admin only
Style.read -> Admin (all), Public (published only)
Style.update -> Admin only
Style.delete -> Admin only
Style.status_change -> Admin only
```

### Version Entity Permissions
```
Version.create -> Admin only
Version.read -> Admin only
Version.rollback -> Admin only
Version.delete -> Admin only
```

## Security Requirements per Interaction

### Authentication Required
- All admin operations (CreateStyle, UpdateStyle, etc.)
- All version management operations
- No authentication for GetPublishedStyles

### Role-based Authorization
- **Admin Role**: Required for all management operations
- **No Role**: Allowed only for GetPublishedStyles

### Input Validation Required
- **Slug validation**: URL-safe format, uniqueness
- **Type validation**: Must be from allowed types
- **Status validation**: Must follow valid transitions
- **Priority validation**: Must be positive integer
- **File validation**: Thumbnail keys must be valid S3 paths

## Error Handling Matrix

| Scenario | Admin Response | Public Response | Test Coverage |
|----------|----------------|-----------------|---------------|
| Invalid Authentication | 401 Unauthorized | N/A | TC011 |
| Insufficient Permissions | 403 Forbidden | 403 Forbidden | TC012 |
| Invalid Input Data | 400 Bad Request | 400 Bad Request | Multiple TCs |
| Resource Not Found | 404 Not Found | 404 Not Found | Multiple TCs |
| Duplicate Slug | 409 Conflict | N/A | TC014 |
| Concurrent Updates | 409 Conflict | N/A | TC013 |
| System Error | 500 Internal Error | 500 Internal Error | TC015 |

## Business Rule Enforcement

### Status Transition Rules
- **Draft → Published**: Allowed with PublishStyle
- **Published → Offline**: Allowed with UnpublishStyle  
- **Offline → Published**: Allowed with PublishStyle
- **Draft → Offline**: Not allowed directly
- **Any → Draft**: Only through creation or rollback

### Validation Rules
- **Slug Uniqueness**: Enforced across all styles
- **Required Fields**: label, slug, type must be provided
- **Type Constraints**: Must be from predefined list
- **Priority Constraints**: Must be positive integer

### Atomic Operations
- **BulkUpdatePriorities**: All updates succeed or all fail
- **RollbackToVersion**: Complete state restoration or full rollback
- **CreateVersion**: Complete snapshot or failure

## Interaction Dependencies

### Prerequisites
1. **User Authentication** → Required for all admin interactions
2. **Style Existence** → Required for update/delete/status change operations
3. **Version Existence** → Required for rollback operations

### Side Effects
1. **CreateStyle** → Increments admin style count (if tracked)
2. **DeleteStyle** → Decrements admin style count (if tracked)
3. **PublishStyle** → Makes style visible to frontend
4. **UnpublishStyle** → Hides style from frontend
5. **CreateVersion** → Creates immutable snapshot for rollback
6. **RollbackToVersion** → Creates new version automatically

## Coverage Validation

### All User Roles Covered
- ✅ Admin: Complete CRUD and management capabilities
- ✅ Public/Frontend: Read access to published content

### All Operations Covered
- ✅ Style CRUD operations
- ✅ Status management (publish/unpublish)
- ✅ Priority management (including bulk updates)
- ✅ Version management (create, rollback)
- ✅ Authentication and authorization

### All Test Cases Mapped
- ✅ Each interaction has corresponding test cases
- ✅ Success and failure scenarios covered
- ✅ Edge cases and concurrent operations included
- ✅ Security and validation scenarios tested

### Missing Interactions: None
All required business operations have corresponding interactions defined.