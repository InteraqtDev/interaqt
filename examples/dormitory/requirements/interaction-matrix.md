# Dormitory Management System - Interaction Matrix

## Overview
This document maps all system interactions to user roles, permissions, business rules, and test coverage to ensure complete implementation.

## Interaction Categories

### 1. Administrative Interactions
Interactions that manage system structure and configuration.

### 2. Management Interactions  
Interactions for dormitory leaders to manage their assigned dormitories.

### 3. User Interactions
Interactions for all authenticated users to view and manage their own data.

### 4. System Interactions
Core system functionality like authentication.

---

## Complete Interaction Matrix

| Interaction | Category | Roles Allowed | Permission Type | Business Rules | Test Cases |
|------------|----------|---------------|-----------------|----------------|------------|
| **CreateDormitory** | Administrative | Admin | Role-based | - Capacity must be 4-6<br>- Auto-creates beds | TC001, TC013 |
| **AssignDormitoryLeader** | Administrative | Admin | Role-based | - User must exist<br>- One leader per dormitory | TC006 |
| **AssignUserToBed** | Administrative | Admin | Role-based | - Bed must be unoccupied<br>- User can only have one bed | TC002, TC012, TC017 |
| **ProcessRemovalRequest** | Administrative | Admin | Role-based | - Request must be pending<br>- Updates bed occupancy | TC005, TC010, TC015 |
| **DeductPoints** | Administrative | Admin | Role-based | - Points cannot go below 0<br>- Creates audit record | TC003, TC014 |
| **SubmitRemovalRequest** | Management | Dormitory Leader | Scope-based | - Target must be in same dormitory<br>- Target must have < 30 points | TC004, TC009, TC011 |
| **DeductResidentPoints** | Management | Dormitory Leader | Scope-based | - Target must be in same dormitory<br>- Points cannot go below 0 | TC008, TC016 |
| **ViewMyDormitory** | User | All authenticated | Self-access | - Returns user's assigned dormitory | - |
| **ViewMyPoints** | User | All authenticated | Self-access | - Returns current points and history | - |
| **UpdateProfile** | User | All authenticated | Self-access | - Can only update own profile<br>- Some fields restricted | - |
| **Login** | System | Anonymous | Public | - Valid credentials required | - |

---

## Permission Control Details

### Role-Based Permissions
- **Admin-only interactions**: Full system control
  - CreateDormitory
  - AssignDormitoryLeader
  - AssignUserToBed
  - ProcessRemovalRequest
  - DeductPoints (any user)

### Scope-Based Permissions
- **Dormitory Leader interactions**: Limited to their dormitory
  - SubmitRemovalRequest (residents in their dormitory only)
  - DeductResidentPoints (residents in their dormitory only)

### Self-Access Permissions
- **All authenticated users**: Own data only
  - ViewMyDormitory
  - ViewMyPoints
  - UpdateProfile

---

## Business Logic Validation Matrix

| Business Rule | Affected Interactions | Implementation Priority |
|--------------|----------------------|------------------------|
| Bed capacity 4-6 | CreateDormitory | Core |
| One user per bed | AssignUserToBed | Core |
| One bed per user | AssignUserToBed | Core |
| Points >= 0 | DeductPoints, DeductResidentPoints | Core |
| Initial points = 100 | User creation | Core |
| Removal threshold < 30 points | SubmitRemovalRequest | Business Logic |
| Same dormitory validation | SubmitRemovalRequest, DeductResidentPoints | Business Logic |
| Pending request validation | ProcessRemovalRequest | Business Logic |

---

## Test Coverage Analysis

### Fully Tested Interactions
✅ **CreateDormitory**: TC001 (success), TC013 (invalid capacity), TC007 (permission)
✅ **AssignUserToBed**: TC002 (success), TC012 (occupied), TC017 (duplicate)
✅ **ProcessRemovalRequest**: TC005 (approve), TC015 (reject), TC010 (permission)
✅ **DeductPoints**: TC003 (success), TC014 (boundary)
✅ **SubmitRemovalRequest**: TC004 (success), TC009 (permission), TC011 (business rule)
✅ **AssignDormitoryLeader**: TC006 (success)
✅ **DeductResidentPoints**: TC016 (success), TC008 (wrong dormitory)

### Partially Tested Interactions
⚠️ **Login**: No dedicated test case (assumed in preconditions)
⚠️ **UpdateProfile**: No test case defined
⚠️ **ViewMyDormitory**: No test case defined
⚠️ **ViewMyPoints**: No test case defined

---

## Implementation Roadmap

### Phase 1: Core Infrastructure
1. Implement entities and relations
2. Implement basic CRUD operations
3. Set up authentication system

### Phase 2: Core Business Logic
1. Implement administrative interactions:
   - CreateDormitory
   - AssignUserToBed
   - AssignDormitoryLeader
2. Implement point system:
   - DeductPoints
   - Point balance tracking

### Phase 3: Advanced Features
1. Implement removal request workflow:
   - SubmitRemovalRequest
   - ProcessRemovalRequest
2. Implement dormitory leader functions:
   - DeductResidentPoints
   - Scoped permissions

### Phase 4: User Features
1. Implement user self-service:
   - ViewMyDormitory
   - ViewMyPoints
   - UpdateProfile

---

## Validation Checklist

### Completeness Check
- [x] Every user role has necessary interactions
- [x] Every entity has appropriate CRUD operations via interactions
- [x] All business processes are covered
- [x] Permission controls are defined for all interactions
- [x] Business rules are documented for all interactions

### Test Coverage Check
- [x] Core business logic has test cases
- [x] Permission controls have test cases
- [x] Business rule validations have test cases
- [x] Edge cases and error conditions covered
- [ ] All interactions have at least one test case (4 interactions missing tests)

### Security Check
- [x] Admin-only operations protected
- [x] Dormitory leader scope enforcement defined
- [x] User can only modify own data
- [x] No direct entity access bypassing permissions
- [x] Audit trail for critical operations (point deductions, removals)

---

## Notes and Recommendations

1. **Missing Test Cases**: Consider adding test cases for Login, UpdateProfile, ViewMyDormitory, and ViewMyPoints interactions for complete coverage.

2. **Audit Trail**: All point deductions and removal requests are permanent records that cannot be deleted, ensuring accountability.

3. **Soft Deletes**: User entities use soft delete to preserve historical data while removing access.

4. **Permission Hierarchy**: Clear separation between admin (system-wide), dormitory leader (dormitory-scoped), and resident (self-only) permissions.

5. **Business Rule Enforcement**: Critical business rules (points threshold, bed capacity) are enforced at the Interaction level, not just UI.

6. **Cascading Effects**: Removal approval automatically updates bed occupancy and resets roles if needed.