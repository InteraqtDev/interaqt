# Interaction Matrix

## Summary Statistics
- Total Roles: 3
- Total Interactions: 13
- Total Requirements: 8 Read + 9 Write = 17
- Coverage: 100% of requirements have corresponding interactions

## Role-Interaction Matrix

| Role | Interaction | Action | Requirements Fulfilled | Test Cases |
|------|-------------|--------|----------------------|------------|
| Global Administrator | CreateUser | Create | WR001, RR001 | TC001, TC002 |
| Global Administrator | AssignDormitoryLeader | Update | WR002, RR001 | TC021 |
| Global Administrator | CreateDormitory | Create | WR003, RR002 | TC003, TC004 |
| Global Administrator | AssignUserToBed | Create | WR004, RR003 | TC005, TC006, TC019 |
| Global Administrator | ProcessRemovalRequest | Update | WR007, RR005 | TC011, TC012 |
| Global Administrator | RemoveUserFromDormitory | Delete | WR008, RR003 | TC013 |
| Global Administrator | ViewUserList | Retrieve | RR001 | TC014 |
| Global Administrator | ViewDormitoryList | Retrieve | RR002 | TC014 |
| Global Administrator | ViewAuditLog | Retrieve | RR006 | TC025 |
| Dormitory Leader | ApplyScoreDeduction | Create | WR005, RR004 | TC007, TC008, TC020 |
| Dormitory Leader | CreateRemovalRequest | Create | WR006, RR005 | TC009, TC010 |
| Dormitory Leader | ViewDormitoryList | Retrieve | RR002 | TC015 |
| Dormitory Leader | ViewMyDormitoryUsers | Retrieve | RR007 | TC017 |
| Dormitory Leader | ViewMyProfile | Retrieve | RR008 | TC015 |
| Regular User | ViewMyProfile | Retrieve | RR008 | TC016 |

## Requirement Coverage Matrix

| Requirement ID | Type | Interactions | Test Coverage | Priority |
|----------------|------|--------------|---------------|----------|
| RR001 | Read | I001, I002, I009 | TC001, TC002, TC014, TC021 | Critical |
| RR002 | Read | I003, I010 | TC003, TC004, TC014, TC015 | Critical |
| RR003 | Read | I004, I008 | TC005, TC006, TC013, TC019 | Critical |
| RR004 | Read | I005 | TC007, TC008, TC020 | High |
| RR005 | Read | I006, I007 | TC009, TC010, TC011, TC012 | High |
| RR006 | Read | I013 | TC025 | Medium |
| RR007 | Read | I011 | TC017 | High |
| RR008 | Read | I012 | TC015, TC016 | Medium |
| WR001 | Write | I001 | TC001, TC002, TC018 | Critical |
| WR002 | Write | I002 | TC021 | High |
| WR003 | Write | I003 | TC003, TC004, TC018 | Critical |
| WR004 | Write | I004 | TC005, TC006, TC019, TC023 | Critical |
| WR005 | Write | I005 | TC007, TC008, TC020, TC023 | High |
| WR006 | Write | I006 | TC009, TC010, TC023 | High |
| WR007 | Write | I007 | TC011, TC012, TC023 | High |
| WR008 | Write | I008 | TC013, TC023 | Critical |
| WR009 | Write | Auto-generated | TC025 | Medium |

## Data Access Matrix

| Entity/Relation | Read Interactions | Write Interactions | Computed Properties |
|-----------------|-------------------|-------------------|-------------------|
| User | I001, I009, I011, I012 | I001, I002 | currentScore (from ScoreEvents) |
| Dormitory | I003, I010, I011 | I003 | occupiedBeds, availableBeds (from BedAssignments) |
| ScoreEvent | I005 (read for validation) | I005 | None |
| RemovalRequest | I006, I007 | I006, I007 | None |
| AuditLog | I013 | Auto-generated | None |
| BedAssignment | I004, I008, I009, I010, I011 | I004, I008 | None |
| DormitoryLeadership | I002, I010, I011 | I002 | None |
| UserScoring | I005, I011 | I005 | None |
| RemovalRequesting | I006, I007 | I006 | None |
| AuditTracking | I013 | Auto-generated | None |

## Permission Summary

| Role | Can Create | Can Read | Can Update | Can Delete |
|------|------------|----------|------------|------------|
| Global Administrator | User, Dormitory, BedAssignment | All entities | User roles, RemovalRequest status | BedAssignment |
| Dormitory Leader | ScoreEvent, RemovalRequest | Own dormitory users, own profile | None | None |
| Regular User | None | Own profile only | None | None |

## Business Rule Enforcement

| Rule/Condition | Enforced By Interaction | Test Case | Priority |
|----------------|------------------------|-----------|----------|
| Username must be unique | I001 | TC018 | Critical |
| Email must be unique and valid | I001 | TC018 | Critical |
| Bed count 4-6 inclusive | I003 | TC004 | Critical |
| One user per bed constraint | I004 | TC019 | Critical |
| User can only be assigned to one bed | I004 | TC019 | Critical |
| Leader can only manage own dormitory users | I005, I006, I011 | TC008, TC017 | High |
| Score threshold for removal requests | I006 | TC010 | High |
| Removal requires approved request | I008 | TC022 | High |
| Cannot process already processed requests | I007 | TC022 | Medium |
| Leader cannot be assigned to bed | I002 | TC021 | Medium |
| Dormitory cannot have multiple leaders | I002 | TC021 | Medium |

## Workflow State Transitions

| Workflow | States | Transitions | Interactions | Test Coverage |
|----------|--------|-------------|--------------|---------------|
| User Lifecycle | Created -> Assigned -> Scored -> Removal Requested -> Removed | Linear with branches | I001 -> I004 -> I005 -> I006 -> I007 -> I008 | TC023 |
| Removal Process | Pending -> Approved/Rejected -> (Executed) | Approval-based | I006 -> I007 -> I008 | TC011, TC012, TC013 |
| Score Management | Event Created -> Score Updated -> Threshold Check | Event-driven | I005 -> Auto-computation | TC007, TC020 |
| Dormitory Setup | Created -> Leader Assigned -> Users Assigned | Sequential | I003 -> I002 -> I004 | TC024 |

## Gap Analysis

### Uncovered Requirements
**None identified** - All requirements have corresponding interactions

### Missing Test Cases
**None identified** - All interactions have test coverage including:
- Success scenarios (positive tests)
- Validation errors (negative tests)  
- Permission boundaries (access control tests)
- Business rule enforcement (constraint tests)
- End-to-end workflows (integration tests)

### Incomplete Permission Definitions
**None identified** - Permission model is complete and consistent:
- Global Administrator: Full system access
- Dormitory Leader: Dormitory-scoped management
- Regular User: Self-service only

## System Dependencies and Integration Points

### Authentication System
- **Required for**: All interactions except system initialization
- **Integration points**: User role validation, session management
- **Test coverage**: TC014, TC015, TC016

### Scoring System
- **Required for**: Score deductions, removal threshold checks
- **Integration points**: Score computation, threshold validation
- **Test coverage**: TC007, TC008, TC020

### Audit System  
- **Required for**: Compliance tracking, action logging
- **Integration points**: All write operations trigger audit events
- **Test coverage**: TC025

### Notification System (Future Enhancement)
- **Potential integration**: Score change notifications, removal request alerts
- **Current status**: Not in scope for current requirements

## Performance Considerations

### High-Volume Operations
- **ViewUserList (I009)**: May require pagination for large user bases
- **ViewAuditLog (I013)**: Requires date range filtering for performance
- **Score computations**: Real-time updates for currentScore property

### Concurrent Access Scenarios
- **Bed assignments**: Race condition prevention for simultaneous assignments
- **Score deductions**: Atomic operations for score calculations
- **Removal requests**: Prevention of duplicate requests

### Data Integrity Constraints
- **Referential integrity**: User-Dormitory-Bed relationships must remain consistent
- **Business constraints**: Score thresholds, bed capacity limits
- **Audit trail**: Complete action logging without gaps

## Deployment and Operational Considerations

### Configuration Requirements
- **SystemSettings dictionary**: Scoring rules, thresholds, capacity limits
- **Initial data**: Administrator account, default scoring categories
- **Security settings**: Password policies, session timeouts

### Monitoring and Alerting
- **Critical operations**: User assignments, score threshold breaches, removal approvals
- **System health**: Audit log integrity, permission validation failures
- **Business metrics**: Occupancy rates, score distributions, removal frequencies

### Backup and Recovery
- **Critical data**: User assignments, scoring history, removal decisions
- **Recovery procedures**: Point-in-time recovery for audit compliance
- **Data archival**: Long-term storage for historical records