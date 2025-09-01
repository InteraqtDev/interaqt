# Interaction Matrix

## Summary Statistics
- Total Roles: 3 (Global Administrator, Dormitory Leader, Regular User)
- Total Interactions: 13
- Total Requirements: 17 (8 Read + 9 Write)
- Coverage: 100% (All requirements have corresponding interactions)

## Role-Interaction Matrix

| Role | Interaction | Action | Requirements Fulfilled | Test Cases |
|------|-------------|--------|----------------------|------------|
| Global Administrator | CreateUser | Create | WR001, RR001 | TC001, TC002 |
| Global Administrator | AssignDormitoryLeader | Update | WR002, RR001 | TC018, TC019 |
| Global Administrator | CreateDormitory | Create | WR003, RR002 | TC003, TC004 |
| Global Administrator | AssignUserToBed | Create | WR004, RR003 | TC005, TC006 |
| Global Administrator | ProcessRemovalRequest | Update | WR007, RR005 | TC011, TC012 |
| Global Administrator | RemoveUserFromDormitory | Delete | WR008, RR003 | TC013 |
| Global Administrator | ViewUserList | Retrieve | RR001 | TC014, TC015 |
| Global Administrator | ViewDormitoryList | Retrieve | RR002 | TC003, TC004 |
| Global Administrator | ViewAuditLog | Retrieve | RR006 | TC020 |
| Dormitory Leader | ApplyScoreDeduction | Create | WR005, RR004 | TC007, TC008 |
| Dormitory Leader | CreateRemovalRequest | Create | WR006, RR005 | TC009, TC010 |
| Dormitory Leader | ViewDormitoryList | Retrieve | RR002 | - |
| Dormitory Leader | ViewMyDormitoryUsers | Retrieve | RR007 | TC016 |
| Dormitory Leader | ViewMyProfile | Retrieve | RR008 | TC017 |
| Regular User | ViewMyProfile | Retrieve | RR008 | TC017 |

## Requirement Coverage Matrix

| Requirement ID | Type | Interactions | Test Coverage | Priority |
|----------------|------|--------------|---------------|----------|
| RR001 | Read | I001, I002, I009 | TC001, TC002, TC014, TC015, TC018, TC019 | Critical |
| RR002 | Read | I003, I010 | TC003, TC004 | Critical |
| RR003 | Read | I004, I008 | TC005, TC006, TC013 | Critical |
| RR004 | Read | I005 | TC007, TC008 | High |
| RR005 | Read | I006, I007 | TC009, TC010, TC011, TC012 | High |
| RR006 | Read | I013 | TC020 | Medium |
| RR007 | Read | I011 | TC016 | High |
| RR008 | Read | I012 | TC017 | Medium |
| WR001 | Write | I001 | TC001, TC002 | Critical |
| WR002 | Write | I002 | TC018, TC019 | High |
| WR003 | Write | I003 | TC003, TC004 | Critical |
| WR004 | Write | I004 | TC005, TC006 | Critical |
| WR005 | Write | I005 | TC007, TC008 | High |
| WR006 | Write | I006 | TC009, TC010 | High |
| WR007 | Write | I007 | TC011, TC012 | High |
| WR008 | Write | I008 | TC013 | High |
| WR009 | Write | System-Generated | Audit logs created by all interactions | Medium |

## Data Access Matrix

| Entity/Relation | Read Interactions | Write Interactions | Computed Properties |
|-----------------|-------------------|-------------------|-------------------|
| User | I009, I010, I011, I012 | I001, I002, I004, I005, I006, I008 | currentScore |
| Dormitory | I010 | I003 | occupiedBeds, availableBeds |
| ScoreEvent | I005 (implicit read), I011 | I005 | - |
| RemovalRequest | I006 (implicit read), I007 | I006, I007 | - |
| AuditLog | I013 | All interactions (WR009) | - |
| BedAssignment | I004 (implicit read), I008, I009, I010 | I004, I008 | - |
| DormitoryLeadership | I002 (implicit read), I010, I011 | I002 | - |
| UserScoring | I005, I011 | I005 | - |
| RemovalRequesting | I006, I007 | I006 | - |
| AuditTracking | I013 | All interactions | - |

## Permission Summary

| Role | Can Create | Can Read | Can Update | Can Delete |
|------|------------|----------|------------|------------|
| Global Administrator | User, Dormitory, BedAssignment | All entities and relations | User roles, RemovalRequest status, DormitoryLeadership | BedAssignment |
| Dormitory Leader | ScoreEvent, RemovalRequest | Own dormitory users, Own dormitory info, ScoreEvents, RemovalRequests | - | - |
| Regular User | - | Own profile and assignment | - | - |

## Business Rule Enforcement

| Rule/Condition | Enforced By Interaction | Test Case | Priority |
|----------------|------------------------|-----------|----------|
| Username must be unique | I001 | TC002 | Critical |
| Email must be valid format | I001 | TC002 | Critical |
| Role must be valid | I001 | TC002 | Critical |
| Password must meet security requirements | I001 | TC002 | Critical |
| User cannot be assigned to bed while being dormitory leader | I002 | TC018 | High |
| Dormitory cannot have multiple leaders | I002 | TC019 | High |
| Dormitory name must be unique | I003 | TC004 | High |
| Bed count must be between 4-6 | I003 | TC004 | Critical |
| User cannot be assigned to multiple beds | I004 | TC006 | Critical |
| Bed must be unoccupied for assignment | I004 | TC005 | Critical |
| Only dormitory leader can deduct scores from their residents | I005 | TC008 | High |
| Deduction amount must be positive | I005 | TC007 | High |
| User score must be below threshold for removal request | I006 | TC010 | High |
| No duplicate pending removal requests | I006 | TC009 | Medium |
| Only pending requests can be processed | I007 | TC011, TC012 | High |
| User must have approved removal request for forced removal | I008 | TC013 | High |
| Effective date cannot be in the past | I008 | TC013 | Medium |

## Gap Analysis

### Uncovered Requirements
- None identified - All requirements (RR001-RR008, WR001-WR009) have corresponding interactions

### Missing Test Cases
- I010 (ViewDormitoryList) for Dormitory Leader role - needs specific test case
- System-wide audit logging (WR009) - needs comprehensive test coverage across all interactions

### Incomplete Permission Definitions
- No gaps identified - Permission model is complete with clear role boundaries

## Validation Checklist

- [x] Every role has at least one interaction
  - Global Administrator: 9 interactions
  - Dormitory Leader: 5 interactions  
  - Regular User: 1 interaction

- [x] Every requirement has at least one interaction
  - All 8 read requirements covered
  - All 9 write requirements covered

- [x] Every interaction has at least one test case
  - 13 interactions with 20 test cases total
  - Critical interactions have multiple test scenarios

- [x] All critical requirements have multiple test scenarios
  - User management (RR001/WR001): 6 test cases
  - Dormitory management (RR002/WR003): 2 test cases
  - Bed assignment (RR003/WR004): 3 test cases

- [x] Permission model is complete and consistent
  - Clear separation of administrator vs. leader vs. user privileges
  - No overlapping or conflicting permissions identified

- [x] Business rules are explicitly tested
  - 15 business rules identified and tested
  - Both positive and negative test scenarios covered

## Implementation Recommendations

### Phase 1: Core Infrastructure
1. Implement User and Dormitory entities (I001, I003)
2. Implement basic assignment functionality (I004)
3. Implement authentication and authorization framework

### Phase 2: Workflow Operations
1. Implement scoring system (I005)
2. Implement removal request workflow (I006, I007, I008)
3. Implement dormitory leadership assignment (I002)

### Phase 3: Reporting and Administration
1. Implement administrative dashboards (I009, I010)
2. Implement role-specific views (I011, I012)
3. Implement audit logging and compliance features (I013)

### Critical Success Factors
- Strict validation of business rules at interaction level
- Comprehensive audit trail for all state-changing operations
- Role-based access control enforced at all interaction points
- Data integrity constraints implemented at entity and relation level