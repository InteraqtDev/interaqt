# Round 9: Action Effects Not Supported

## Current Status
- 3 out of 10 tests passing (TC001, TC002, TC010)
- Entity creation and basic operations work
- Action effects do not execute

## Key Finding
The interaqt framework does not support the `effect` property in Action.create() as we attempted to use it. The framework expects all state changes to be handled through:

1. **Transform computations** - For creating new entities based on events
2. **Property computations** - For computing property values
3. **Direct storage operations** - Within Transform callbacks only

## What Works
1. Basic entity creation through Transform computations
2. Default values for properties
3. Relations between entities
4. Simple interactions without side effects

## What Doesn't Work
1. Action effects for updating entity states
2. Complex state management within interactions
3. Side effects outside of Transform computations

## Attempted Approaches That Failed
1. **StateMachine** - Too complex for initial implementation
2. **Action effects** - Not supported by framework
3. **Transform on fields** - Cannot use storage operations inside
4. **Separate entity for assignments** - Naming conflicts

## Recommended Approach
Based on our experiments, the framework seems to expect:

1. **Entity Creation**: Use Transform computation on the entity itself
2. **State Updates**: Must be handled through new entity creation or external processes
3. **Relations**: Use built-in Relation definitions, not computed relations
4. **Side Effects**: Should be handled outside the framework's computation system

## Conclusion
The interaqt framework has a specific model for handling data transformations that doesn't align with traditional CRUD operations. It appears to be designed for:
- Event-driven entity creation
- Immutable state management
- Declarative computations

Rather than imperative updates within interactions.

## Next Steps
To make this work, would need to:
1. Study more working examples from the framework
2. Understand the intended pattern for handling updates
3. Possibly use external services for complex state management
4. Or accept that certain operations aren't supported in Stage 1