# Interaction Matrix - Dormitory Management System

## Overview
This document maps all system interactions to user roles, ensuring complete coverage of operations, permissions, and business rules.

## Interaction Summary by Category

### Administrative Operations
| Interaction | Purpose | Primary Actor |
|-------------|---------|---------------|
| CreateDormitory | Create new dormitory with beds | Admin |
| AppointDormHead | Appoint student as dormitory head | Admin |
| AssignUserToDormitory | Assign student to dormitory and bed | Admin |
| ReviewEvictionRequest | Approve/reject eviction requests | Admin |

### Dormitory Management Operations
| Interaction | Purpose | Primary Actor |
|-------------|---------|---------------|
| RecordViolation | Record student violations and deduct points | DormHead |
| SubmitEvictionRequest | Request eviction of problematic student | DormHead |

### Query Operations
| Interaction | Purpose | Primary Actor |
|-------------|---------|---------------|
| ViewMyDormitory | View assigned dormitory information | Student/DormHead |
| ViewMyViolations | View violation history and points | Student/DormHead |
| ViewMyEvictionStatus | Check eviction request status | Student/DormHead |

## Detailed Permission Matrix

### CreateDormitory
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | None | Capacity must be 4-6 |
| DormHead | ❌ Denied | N/A | N/A |
| Student | ❌ Denied | N/A | N/A |

**Test Coverage**: TC001 (valid), TC008 (max capacity), TC011 (permission denied), TC016 (invalid capacity)

### AppointDormHead
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | None | - Target must be student<br>- Dormitory cannot have existing dormHead<br>- User cannot already be dormHead |
| DormHead | ❌ Denied | N/A | N/A |
| Student | ❌ Denied | N/A | N/A |

**Test Coverage**: TC002 (valid), TC012 (permission denied), TC021 (duplicate dormHead)

### AssignUserToDormitory
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | None | - User not already assigned<br>- Bed must be vacant<br>- User not evicted<br>- Bed belongs to specified dormitory |
| DormHead | ❌ Denied | N/A | N/A |
| Student | ❌ Denied | N/A | N/A |

**Test Coverage**: TC003 (valid), TC010 (full assignment), TC017 (already assigned), TC018 (occupied bed), TC022 (evicted user), TC023 (full dormitory)

### ReviewEvictionRequest
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | None | Request must be pending |
| DormHead | ❌ Denied | N/A | N/A |
| Student | ❌ Denied | N/A | N/A |

**Test Coverage**: TC006 (approve), TC007 (reject), TC015 (permission denied), TC025 (non-pending)

### RecordViolation
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ❌ Denied | N/A | N/A |
| DormHead | ✅ Allowed | User must be in managed dormitory | - Points must be positive<br>- User not evicted |
| Student | ❌ Denied | N/A | N/A |

**Test Coverage**: TC004 (valid), TC009 (multiple), TC013 (wrong dormitory), TC014 (student denied), TC024 (points floor)

### SubmitEvictionRequest
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ❌ Denied | N/A | N/A |
| DormHead | ✅ Allowed | User must be in managed dormitory | - User points < 60<br>- No pending request exists |
| Student | ❌ Denied | N/A | N/A |

**Test Coverage**: TC005 (valid), TC019 (high points), TC020 (duplicate request)

### ViewMyDormitory
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | Can view any user's dormitory | None |
| DormHead | ✅ Allowed | Can view own dormitory | None |
| Student | ✅ Allowed | Can view own dormitory | None |

**Test Coverage**: Covered implicitly in assignment tests

### ViewMyViolations
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | Can view any user's violations | None |
| DormHead | ✅ Allowed | Can view own violations | None |
| Student | ✅ Allowed | Can view own violations only | None |

**Test Coverage**: Covered implicitly in violation tests

### ViewMyEvictionStatus
| Role | Permission | Conditions | Business Rules |
|------|------------|------------|----------------|
| Admin | ✅ Allowed | Can view any user's status | None |
| DormHead | ✅ Allowed | Can view own status | None |
| Student | ✅ Allowed | Can view own status only | None |

**Test Coverage**: Covered implicitly in eviction tests

## State Transitions Triggered by Interactions

### User Status States
```
active → warned (automatic when points < 70)
warned → evictionPending (via SubmitEvictionRequest)
evictionPending → evicted (via ReviewEvictionRequest[approve])
evictionPending → active/warned (via ReviewEvictionRequest[reject])
```

### Bed Status States
```
vacant → occupied (via AssignUserToDormitory)
occupied → vacant (via ReviewEvictionRequest[approve])
```

### EvictionRequest Status States
```
pending → approved (via ReviewEvictionRequest[approve])
pending → rejected (via ReviewEvictionRequest[reject])
```

## Computed Properties Affected by Interactions

| Computed Property | Triggering Interactions | Update Logic |
|-------------------|------------------------|--------------|
| User.currentPoints | RecordViolation | Subtract violation points from 100 |
| User.isEligibleForEviction | RecordViolation | True when points < 60 |
| Dormitory.occupancy | AssignUserToDormitory, ReviewEvictionRequest | Count of occupied beds |
| Dormitory.availableBeds | AssignUserToDormitory, ReviewEvictionRequest | Capacity - occupancy |
| Dormitory.occupancyRate | AssignUserToDormitory, ReviewEvictionRequest | (occupancy / capacity) * 100 |

## Validation Cascade by Interaction

### CreateDormitory
1. Validate user role (admin)
2. Validate capacity (4-6)
3. Create dormitory entity
4. Create bed entities (based on capacity)
5. Link beds to dormitory

### AssignUserToDormitory
1. Validate user role (admin)
2. Check user not already assigned
3. Check user not evicted
4. Check bed is vacant
5. Check bed belongs to dormitory
6. Create UserDormitoryRelation
7. Create UserBedRelation
8. Update bed status
9. Update dormitory occupancy

### ReviewEvictionRequest (Approve)
1. Validate user role (admin)
2. Check request is pending
3. Update request status
4. Update user status to evicted
5. Delete UserDormitoryRelation
6. Delete UserBedRelation
7. Update bed status to vacant
8. Update dormitory occupancy
9. Record timestamps

## Coverage Analysis

### Role Coverage
- **Admin**: 4 interactions (complete administrative control)
- **DormHead**: 2 interactions (dormitory management)
- **Student**: 3 query interactions (view-only access)

### Operation Coverage
- **Create**: Dormitory, Violation, EvictionRequest
- **Update**: User role/status, Bed status, Request status
- **Delete**: Relations on eviction
- **Query**: Dormitory info, Violations, Eviction status

### Business Rule Coverage
- **Capacity constraints**: ✅ Enforced
- **Assignment uniqueness**: ✅ Enforced
- **Point thresholds**: ✅ Enforced
- **Role hierarchy**: ✅ Enforced
- **State consistency**: ✅ Maintained

### Test Case Coverage
- **Core functionality**: 10 test cases (TC001-TC010)
- **Permission validation**: 5 test cases (TC011-TC015)
- **Business rules**: 10 test cases (TC016-TC025)
- **Total coverage**: 25 test cases

## Implementation Priority

### Stage 1 - Core Business Logic
1. ✅ All interactions without permission checks
2. ✅ All interactions without business rule validations
3. ✅ Focus on happy path with valid inputs
4. ✅ Ensure all relationships work correctly
5. ✅ Verify computed properties update

### Stage 2A - Permission Layer
1. ⏸️ Add role-based condition to each interaction
2. ⏸️ Implement permission denial logic
3. ⏸️ Ensure proper error messages

### Stage 2B - Business Rules Layer
1. ⏸️ Add business rule condition to interactions
2. ⏸️ Implement validation logic
3. ⏸️ Handle edge cases and boundaries

## Gaps and Recommendations

### Identified Gaps
None - All requirements are covered by the defined interactions.

### Future Enhancements (Out of Scope)
1. **Point Recovery System**: Allow points to be restored over time or through good behavior
2. **Transfer Between Dormitories**: Direct transfer without eviction
3. **Temporary Leave**: Handle students on leave/vacation
4. **Maintenance Requests**: Report and track dormitory maintenance issues
5. **Visitor Management**: Track and manage dormitory visitors
6. **Curfew Tracking**: Automated curfew violation detection
7. **Room Preferences**: Allow students to request specific rooms/roommates

### Security Considerations
1. All interactions require authenticated user
2. User role must be verified on each interaction
3. Cross-dormitory operations must be prevented
4. Audit trail for all administrative actions
5. Prevent privilege escalation attacks

## Conclusion

This interaction matrix ensures:
1. ✅ Every user role has appropriate interactions
2. ✅ Every interaction has clear permission controls
3. ✅ Every interaction has corresponding test cases
4. ✅ Both access control and business logic are documented
5. ✅ Complete traceability from requirements to tests

The system is ready for implementation following the progressive approach:
- Stage 1: Implement core functionality
- Stage 2A: Add permission layer
- Stage 2B: Add business rule validations
