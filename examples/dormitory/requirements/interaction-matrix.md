# Interaction Matrix

## Summary Statistics
- **Total Roles:** 3 (Administrator, Dormitory Leader, Resident)
- **Total Interactions:** 9 (5 Admin, 2 Leader, 2 Resident)
- **Total Test Cases:** 20 (10 Core, 4 Permission, 6 Business Rule)
- **Coverage:** 100% - All roles and interactions have corresponding test cases

## Role-Interaction Matrix

| Role | Interaction ID | Interaction Name | Description | Test Cases |
|------|----------------|------------------|-------------|------------|
| Administrator | AI001 | CreateDormitory | Create new dormitory with 4-6 beds | TC001, TC002, TC020 |
| Administrator | AI002 | AssignUserToDormitory | Assign user to specific bed in dormitory | TC003, TC004, TC017 |
| Administrator | AI003 | AppointDormitoryLeader | Designate user as dormitory leader | TC005, TC018 |
| Administrator | AI004 | ProcessKickoutApplication | Approve/reject kickout applications | TC014, TC019 |
| Administrator | AI005 | DeductUserPoints | Deduct points for rule violations | TC006 |
| DormLeader | DL001 | SubmitKickoutApplication | Apply to kick out dormitory resident | TC007, TC012, TC015, TC016 |
| DormLeader | DL002 | ViewDormitoryResidents | View all residents in managed dormitory | TC008, TC013 |
| Resident | R001 | ViewMyDormitoryInfo | View own dormitory assignment details | TC009 |
| Resident | R002 | ViewMyPointHistory | View own point deduction history | TC010 |

## Permission Control Matrix

| Role | Create Operations | Read Operations | Update Operations | Delete Operations |
|------|-------------------|-----------------|-------------------|-------------------|
| **Administrator** | - Create Dormitory<br>- Create User Assignment<br>- Create Point Deduction<br>- Appoint Leaders | - View All Dormitories<br>- View All Users<br>- View All Applications<br>- View All Point Records | - Process Applications<br>- Update Assignments<br>- Modify User Roles | - Remove Assignments<br>- Soft Delete Records |
| **Dormitory Leader** | - Submit Kickout Applications | - View Own Dormitory Residents<br>- View Resident Point History<br>- View Own Point History<br>- View Own Dormitory Info | - Update Application Status (Submit Only) | - Cannot Delete Any Records |
| **Resident** | - None | - View Own Dormitory Info<br>- View Own Point History<br>- View Own Profile | - Update Own Profile (Limited) | - Cannot Delete Any Records |

## Entity Access Control Matrix

| Entity | Administrator | Dormitory Leader | Resident |
|--------|---------------|------------------|----------|
| **User** | Read/Write All | Read: Own Dormitory Residents | Read: Own Data Only |
| **Dormitory** | Read/Write All | Read: Assigned Dormitory | Read: Assigned Dormitory |
| **Bed** | Read/Write All | Read: Own Dormitory Beds | Read: Own Bed Assignment |
| **PointDeduction** | Read/Write All | Read: Own Dormitory Residents' | Read: Own Records Only |
| **KickoutApplication** | Read/Write All | Read/Write: Own Submitted | Read: Applications Targeting Self |

## Business Rule Enforcement Matrix

| Business Rule | Rule ID | Enforced By Interaction | Validation Logic | Test Cases |
|---------------|---------|------------------------|------------------|-------------|
| One bed per user | BR001 | AI002 - AssignUserToDormitory | Check user not already assigned | TC004, TC017 |
| Bed capacity 4-6 | BR001 | AI001 - CreateDormitory | Validate totalBeds range | TC002, TC020 |
| Points threshold for kickout | BR003 | DL001 - SubmitKickoutApplication | Check target user points < 60 | TC015 |
| Leader must be resident | BR004 | AI003 - AppointDormitoryLeader | Verify user assigned to dormitory | TC018 |
| No duplicate applications | BR003 | DL001 - SubmitKickoutApplication | Check no pending application exists | TC016 |
| Application status workflow | BR004 | AI004 - ProcessKickoutApplication | Only process pending applications | TC019 |
| Point deduction immutability | BR002 | AI005 - DeductUserPoints | Create-only, no updates allowed | TC006 |

## Interaction Dependencies

### Sequential Dependencies
1. **User Onboarding Flow:**
   - AI001 (CreateDormitory) → AI002 (AssignUserToDormitory) → AI003 (AppointDormitoryLeader)

2. **Kickout Process Flow:**
   - AI005 (DeductUserPoints) → DL001 (SubmitKickoutApplication) → AI004 (ProcessKickoutApplication)

3. **Information Access Flow:**
   - AI002 (AssignUserToDormitory) → R001 (ViewMyDormitoryInfo)
   - AI005 (DeductUserPoints) → R002 (ViewMyPointHistory)

### Data Dependencies
| Interaction | Required Pre-existing Data | Creates Data For |
|-------------|---------------------------|------------------|
| AI002 | User exists, Dormitory exists, Bed available | R001, DL002 can access |
| AI005 | User exists | R002, DL001 can evaluate |
| DL001 | User assigned, Points < threshold | AI004 can process |
| AI003 | User assigned to dormitory | DL001, DL002 permissions |

## Permission Validation Points

### Access Control Checks
1. **Role-Based Access:**
   - Check user role before allowing interaction execution
   - Admin role bypasses most restrictions
   - Leader role restricted to assigned dormitory scope
   - Resident role restricted to own data access

2. **Data Scope Restrictions:**
   - Leaders can only access their assigned dormitory data
   - Residents can only access their own records
   - Cross-dormitory access blocked for non-admins

3. **Operation-Level Permissions:**
   - Create operations require specific roles
   - Read operations respect data scope
   - Update operations have business rule validation
   - Delete operations restricted to admin role

### Business Rule Validation Points
1. **Pre-Interaction Validation:**
   - User existence and role verification
   - Data relationship validation (user-dormitory assignment)
   - Constraint checking (bed availability, point thresholds)

2. **During-Interaction Validation:**
   - Business logic rule enforcement
   - Data integrity maintenance
   - Concurrent access handling

3. **Post-Interaction Validation:**
   - Audit trail creation
   - Related data updates (computed properties)
   - Notification triggers (if applicable)

## Test Coverage Analysis

### Core Functionality Coverage
- ✅ **CRUD Operations:** All basic create, read operations tested
- ✅ **Business Logic:** Point deduction, assignment logic validated
- ✅ **Workflow Processes:** Kickout application flow covered

### Permission Testing Coverage
- ✅ **Role Enforcement:** Admin, Leader, Resident roles tested
- ✅ **Data Access Control:** Scope restrictions validated
- ✅ **Operation Permissions:** Create/Read/Update permissions tested

### Business Rule Testing Coverage
- ✅ **Constraint Validation:** Bed limits, assignment rules tested
- ✅ **Threshold Rules:** Point thresholds for kickout tested
- ✅ **Workflow Rules:** Application status transitions tested

### Gap Analysis
**No Critical Gaps Identified** - All interactions have corresponding test cases covering:
- Happy path scenarios (core functionality)
- Error scenarios (invalid data, permission denied)
- Edge cases (business rule violations)

## Implementation Priority Matrix

### Phase 1: Core Infrastructure (Critical)
1. **AI001 - CreateDormitory** → Foundation for all other operations
2. **AI002 - AssignUserToDormitory** → Enables user-dormitory relationships
3. **AI003 - AppointDormitoryLeader** → Establishes role hierarchy

### Phase 2: Business Operations (High)
4. **AI005 - DeductUserPoints** → Core business logic for violations
5. **DL001 - SubmitKickoutApplication** → Key dormitory management feature
6. **AI004 - ProcessKickoutApplication** → Administrative workflow completion

### Phase 3: Information Access (Medium)
7. **DL002 - ViewDormitoryResidents** → Leader management capabilities
8. **R001 - ViewMyDormitoryInfo** → Basic user information access
9. **R002 - ViewMyPointHistory** → User transparency features

## Quality Assurance Checklist

### Completeness Verification
- ✅ Every user role has appropriate interactions
- ✅ Every interaction has clear permission controls
- ✅ Every interaction has corresponding test cases
- ✅ All business rules are explicitly validated
- ✅ All entity operations are covered by interactions

### Consistency Verification
- ✅ Permission model is consistent across all interactions
- ✅ Business rules are consistently enforced
- ✅ Data access patterns follow role-based security
- ✅ Error handling is standardized across interactions

### Security Verification
- ✅ No direct entity manipulation bypassing business rules
- ✅ All sensitive operations require appropriate role verification
- ✅ Data access is properly scoped by user permissions
- ✅ Audit trails maintained for all critical operations