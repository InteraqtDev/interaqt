# Computation Implementation Plan

Based on `docs/computation-analysis.md`, this plan orders computations from least dependent to most dependent for progressive implementation.

## Implementation Order (Least to Most Dependent)

### Phase 1: Basic Entity Creations (from InteractionEventEntity)
- [x] ViolationRecord entity (Transform from InteractionEventEntity - RecordViolation)
- [x] EvictionRequest entity (Transform from InteractionEventEntity - SubmitEvictionRequest) 
- [x] Dormitory entity (Transform from InteractionEventEntity - CreateDormitory)
- [x] Bed entity (Transform from Dormitory)

### Phase 2: Relation Creations and Basic State Transitions
- [x] DormitoryDormHeadRelation (Transform from InteractionEventEntity - AppointDormHead)
- [x] User.role StateMachine (student → dormHead via AppointDormHead)
- [x] EvictionRequest.status basic handling (defaults to 'pending' - StateMachine complexity deferred)
- [ ] EvictionRequest.decidedAt StateMachine (timestamp on decision) - DEFERRED
- [ ] EvictionRequest.adminNotes StateMachine (set on decision) - DEFERRED

### Phase 3: Assignment System State Machines
- [x] UserDormitoryRelation Transform (create on assignUserToDormitory) 
- [x] UserBedRelation Transform (create on assignUserToDormitory)
- [x] Bed.status StateMachine (vacant → occupied via assignUserToDormitory)
- [ ] Bed.assignedAt computation - DEFERRED (complex interaction with StateMachine)

### Phase 4: Eviction System State Machines  
- [x] User.status StateMachine (active → evicted via ReviewEvictionRequest)
- [ ] User.evictedAt StateMachine (timestamp on eviction) - DEFERRED (Transform not supported on properties)

### Phase 5: Points System (depends on violations)
- [ ] User.points Custom computation (100 - sum of violations, min 0) - DEFERRED (Property-level Custom computation trigger issues)

### Phase 6: Computed Properties (depend on other computations)
- [ ] User.isEligibleForEviction computed function (points < 60)
- [ ] Dormitory.occupancy Count (occupied beds)
- [ ] Dormitory.availableBeds computed function (capacity - occupancy)
- [ ] Dormitory.occupancyRate computed function (occupancy/capacity × 100)

## Notes
- Each computation will be implemented and tested individually before moving to the next
- Type checks will be run after each implementation
- Tests will be written and verified for each computation before proceeding
- Any errors will be documented in the errors/ directory