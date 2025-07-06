# Interaction Matrix - Style Management System

## User Roles and Corresponding Interactions

### Admin Role
**Complete system access with all management capabilities**

**Style Management:**
- CreateStyle: Create new styles
- UpdateStyle: Modify any style regardless of creator
- DeleteStyle: Remove any style (soft delete)
- PublishStyle: Change style status to published
- UnpublishStyle: Change style status to offline
- ReorderStyles: Update priority values for sorting

**Version Management:**
- CreateVersion: Create new version snapshots
- PublishVersion: Make a version active
- RollbackVersion: Revert to previous version
- ViewVersionHistory: Access complete version history

**Query Operations:**
- ListStyles: View all styles (including drafts from other users)
- GetStyle: Access any style details
- SearchStyles: Search across all styles
- GetSystemStats: View system-wide statistics

### Editor Role
**Content creation and limited management capabilities**

**Style Management:**
- CreateStyle: Create new styles (own drafts)
- UpdateStyle: Modify only own styles or published styles they're assigned to edit
- PublishStyle: Publish styles (own and assigned)
- ReorderStyles: Update priorities within their scope

**Query Operations:**
- ListStyles: View published styles + own drafts
- GetStyle: Access published styles and own drafts
- SearchStyles: Search published styles and own content
- GetMyStyles: View personal style collection

**Restricted Operations:**
- ❌ DeleteStyle: Cannot delete styles
- ❌ UnpublishStyle: Cannot unpublish styles
- ❌ Version Management: No version control access

### Viewer Role
**Read-only access to published content**

**Query Operations Only:**
- ListStyles: View only published styles
- GetStyle: Access only published style details
- SearchStyles: Search only published styles

**Restricted Operations:**
- ❌ All Creation/Modification Operations
- ❌ All Management Operations
- ❌ Access to draft or offline content

## Permission Control Matrix

| Interaction | Admin | Editor | Viewer | Permission Logic |
|-------------|-------|--------|--------|------------------|
| CreateStyle | ✅ | ✅ | ❌ | Authenticated + (Admin OR Editor) |
| UpdateStyle | ✅ | ✅* | ❌ | Authenticated + (Admin OR (Editor AND (IsOwner OR AssignedEditor))) |
| DeleteStyle | ✅ | ❌ | ❌ | Authenticated + Admin |
| PublishStyle | ✅ | ✅* | ❌ | Authenticated + (Admin OR (Editor AND CanPublish)) |
| UnpublishStyle | ✅ | ❌ | ❌ | Authenticated + Admin |
| ReorderStyles | ✅ | ✅* | ❌ | Authenticated + (Admin OR (Editor AND InScope)) |
| CreateVersion | ✅ | ❌ | ❌ | Authenticated + Admin |
| PublishVersion | ✅ | ❌ | ❌ | Authenticated + Admin |
| RollbackVersion | ✅ | ❌ | ❌ | Authenticated + Admin |
| ListStyles | ✅ | ✅* | ✅* | Authenticated + FilterByPermission |
| GetStyle | ✅ | ✅* | ✅* | Authenticated + (Admin OR Published OR IsOwner) |
| SearchStyles | ✅ | ✅* | ✅* | Authenticated + FilterByPermission |

*\* = With restrictions based on data ownership or status*

## Data-Level Permission Rules

### Style Entity Permissions
```typescript
// Admin: Full access to all styles
AdminStyleAccess = user.role === 'admin'

// Editor: Access to own drafts + published styles + assigned styles
EditorStyleAccess = user.role === 'editor' AND (
  style.createdBy === user.id OR 
  style.status === 'published' OR
  style.assignedEditors.includes(user.id)
)

// Viewer: Only published styles
ViewerStyleAccess = user.role === 'viewer' AND style.status === 'published'
```

### Version Entity Permissions
```typescript
// Only admins can access version management
VersionAccess = user.role === 'admin'
```

## Interaction-Specific Business Rules

### CreateStyle Interaction
- **User Attributive**: Must be authenticated with Editor or Admin role
- **Data Attributive**: Validate required fields, slug uniqueness
- **Side Effects**: Update user's created style count, set timestamps

### UpdateStyle Interaction
- **User Attributive**: Must be authenticated with appropriate role
- **Data Attributive**: Validate ownership or admin privileges
- **Conditions**: Style must exist and not be deleted
- **Side Effects**: Update timestamp, maintain audit trail

### PublishStyle Interaction
- **User Attributive**: Must have publish permissions
- **Data Attributive**: Style must be in draft status
- **Conditions**: All required fields must be complete
- **Side Effects**: Update system counts, notify subscribers

### DeleteStyle Interaction
- **User Attributive**: Must be admin
- **Data Attributive**: Style must exist
- **Conditions**: Check for dependencies
- **Side Effects**: Soft delete, update counts, audit trail

### Version Management Interactions
- **User Attributive**: Admin only
- **Data Attributive**: Version data integrity checks
- **Conditions**: System state validation
- **Side Effects**: Atomic state changes, backup creation

## Coverage Verification

### ✅ Every User Role Has Corresponding Interactions
- **Admin**: Complete CRUD + Management operations
- **Editor**: Content creation + Limited management
- **Viewer**: Read-only query operations

### ✅ Every Interaction Has Clear Permission Controls
- User-level permissions defined
- Data-level permissions specified
- Business rule validation included

### ✅ Every Interaction Has Corresponding Test Cases
- Positive cases for valid permissions
- Negative cases for permission violations
- Edge cases for boundary conditions
- Error handling scenarios

## Security Considerations

### Authentication Requirements
- All interactions require valid authentication token
- Session timeout and renewal mechanisms
- Multi-factor authentication for admin operations

### Authorization Checks
- Role-based access control (RBAC)
- Resource-level permissions
- Dynamic permission evaluation

### Data Protection
- Sensitive field access control
- Audit logging for all operations
- Data retention and deletion policies

### API Security
- Input validation and sanitization
- Rate limiting per user role
- SQL injection prevention
- XSS protection for stored content

This interaction matrix ensures comprehensive coverage of all user scenarios while maintaining strict security boundaries and clear permission hierarchies.