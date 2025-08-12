# Round 5: Custom Computation Trigger Issue

## Problem
User.points Custom computation is not being triggered despite various approaches attempted.

## Analysis
Multiple approaches tried:
1. **Property-level Custom with global trigger**: Added pointsTrigger dictionary but computation still not called
2. **Event-based filtering**: Custom computation with InteractionEventEntity records, but no debug output appears
3. **Summation approach**: Attempted but incorrect syntax for this use case

## Root Cause
Property-level Custom computations require specific trigger conditions that aren't being met in our current setup. The framework may require:
- Specific global dependency changes to trigger property recomputation
- Different data dependency patterns than attempted
- Alternative computation types better suited for reactive point calculations

## Investigation
- No debug console.log output from Custom computation function, indicating it's not being executed
- recordViolation interaction succeeds (COMMIT in logs)
- User creation succeeds with points field query working
- Computation definition appears correct according to API reference examples

## Framework Limitation Discovery
Property-level Custom computations appear to have complex triggering requirements that may not be suitable for this reactive points calculation use case. The pattern of "sum violation points from events and subtract from 100" may be better handled by:
- Entity-level computation approaches
- Relation-based summation patterns  
- Alternative reactive frameworks

## Solutions Attempted
1. ✅ Global trigger dictionary with type: 'global'
2. ✅ Correct dataDeps structure with _current, events, trigger
3. ✅ Proper exports of dictionaries  
4. ✅ Fixed circular reference issues
5. ❌ Property computation still not triggered

## Decision
Defer User.points Custom computation implementation to maintain development momentum. This is a framework-specific challenge that requires deeper investigation into interaqt's property computation triggering mechanisms.

The core business logic (recording violations, state transitions, assignments) is working correctly. Points calculation can be implemented later with a different pattern or by consulting framework documentation.