# Computation Implementation Plan

Based on the computation analysis document, here's the progressive implementation plan for all computations:

## Current Status (Already Implemented)
- [x] Dormitory entity: Transform from InteractionEventEntity (CreateDormitory)
- [x] Bed entity: Transform from Dormitory (auto-create based on capacity)
- [x] ViolationRecord entity: Transform from InteractionEventEntity (RecordViolation)
- [x] EvictionRequest entity: Transform from InteractionEventEntity (SubmitEvictionRequest)

## Stage 1: Basic Entity and Relation Operations (Dependencies: InteractionEventEntity)

### 1. Missing Entity Transform Computations
- [ ] **No User entity Transform needed** (external creation)

### 2. Missing Relation Transform Computations
- [ ] **DormitoryDormHeadRelation**: Transform from AppointDormHead interaction
- [ ] **UserDormitoryRelation**: StateMachine for assignment/eviction
- [ ] **UserBedRelation**: StateMachine for assignment/eviction

### 3. Missing Property StateMachine Computations
- [ ] **User.role**: StateMachine (student → dormHead via AppointDormHead)
- [ ] **User.status**: StateMachine (active → evicted via ReviewEvictionRequest)
- [ ] **User.evictedAt**: StateMachine with computeValue (timestamp on eviction)
- [ ] **Bed.status**: StateMachine (vacant ↔ occupied via assign/evict)
- [ ] **Bed.assignedAt**: StateMachine with computeValue (timestamp on assignment)
- [ ] **EvictionRequest.status**: StateMachine (pending → approved/rejected)
- [ ] **EvictionRequest.decidedAt**: StateMachine with computeValue (timestamp on decision)
- [ ] **EvictionRequest.adminNotes**: StateMachine with computeValue (set on decision)

### 4. Missing Property Computed Values
- [ ] **User.points**: Custom computation (100 - sum of violations, min 0)
- [ ] **User.isEligibleForEviction**: computed function (points < 60)
- [ ] **Dormitory.occupancy**: Count with filter (occupied beds)
- [ ] **Dormitory.availableBeds**: computed function (capacity - occupancy)
- [ ] **Dormitory.occupancyRate**: computed function (occupancy/capacity × 100)

## Implementation Order (Most dependencies to least)

### Round 1: StateNodes and Basic StateMachines
1. **Define StateNodes** (no dependencies)
2. **User.role StateMachine** (depends on AppointDormHead interaction)
3. **User.status StateMachine** (depends on ReviewEvictionRequest interaction)
4. **Bed.status StateMachine** (depends on AssignUserToDormitory, ReviewEvictionRequest)
5. **EvictionRequest.status StateMachine** (depends on ReviewEvictionRequest interaction)

### Round 2: Relation StateMachines
6. **DormitoryDormHeadRelation Transform** (depends on AppointDormHead interaction)
7. **UserDormitoryRelation StateMachine** (depends on AssignUserToDormitory, ReviewEvictionRequest)
8. **UserBedRelation StateMachine** (depends on AssignUserToDormitory, ReviewEvictionRequest)

### Round 3: Computed Properties with Data Dependencies
9. **User.points Custom computation** (depends on UserViolationRelation, ViolationRecord.points)
10. **User.isEligibleForEviction computed** (depends on User.points)
11. **Dormitory.occupancy Count** (depends on DormitoryBedRelation, Bed.status)
12. **Dormitory.availableBeds computed** (depends on capacity, occupancy)
13. **Dormitory.occupancyRate computed** (depends on occupancy, capacity)

### Round 4: StateMachine computeValue Functions
14. **User.evictedAt StateMachine** (depends on status transitions)
15. **Bed.assignedAt StateMachine** (depends on status transitions)
16. **EvictionRequest.decidedAt StateMachine** (depends on status transitions)
17. **EvictionRequest.adminNotes StateMachine** (depends on ReviewEvictionRequest payload)

## Testing Strategy

For each computation:
1. Implement the computation
2. Run `npm run check` to ensure type checking passes
3. Add focused test case in `tests/basic.test.ts`
4. Run `npm run test tests/basic.test.ts` to ensure test passes
5. Mark as completed in this checklist

## Error Handling

If any computation fails:
1. Document the error in `errors/` directory
2. Fix the implementation
3. Re-run tests
4. Update this plan with lessons learned