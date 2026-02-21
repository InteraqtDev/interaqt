# Interaction Context Implementation Plan

## Background
With the rise of agents, interactions may not only come from frontend API calls but also from agents via tools, scheduled tasks, etc. The current `Interaction` event entity only records basic information (user, payload, query). We need to add a `context` field to the `Interaction` event entity to record more contextual information about the interaction source and environment.

## Goal
Add a `context` property to `InteractionEventEntity` and `InteractionEventArgs` to allow passing and storing arbitrary context data during an interaction dispatch.

## Detailed Design

### 1. Modify `InteractionEventArgs`
Update `InteractionEventArgs` type definition in `src/builtins/interaction/Interaction.ts` to include an optional `context` property.

```typescript
export type InteractionEventArgs = {
  user: EventUser,
  query?: EventQuery,
  payload?: EventPayload,
  activityId?: string,
  context?: Record<string, any>, // New field
}
```

### 2. Modify `InteractionEventEntity`
Update `InteractionEventEntity` definition in `src/builtins/interaction/Interaction.ts` to include a `context` property.

```typescript
export const InteractionEventEntity = Entity.create({
  name: INTERACTION_RECORD,
  properties: [
    Property.create({ name: 'interactionId', type: 'string', collection: false }),
    Property.create({ name: 'interactionName', type: 'string', collection: false }),
    Property.create({ name: 'payload', type: 'object', collection: false }),
    Property.create({ name: 'user', type: 'object', collection: false }),
    Property.create({ name: 'query', type: 'object', collection: false }),
    Property.create({ name: 'context', type: 'object', collection: false }), // New property
  ]
})
```

### 3. Update `buildInteractionMapEventData`
Update `buildInteractionMapEventData` function in `src/builtins/interaction/Interaction.ts` to map the `context` from `InteractionEventArgs` to the event data object.

```typescript
function buildInteractionMapEventData(interaction: InteractionInstance): (args: InteractionEventArgs) => Record<string, any> {
  return (args: InteractionEventArgs) => ({
    interactionName: interaction.name,
    interactionId: interaction.uuid,
    user: args.user,
    query: args.query || {},
    payload: args.payload || {},
    context: args.context || {}, // Map context
  });
}
```

## Impact Analysis
- **Backward Compatibility**: The `context` field in `InteractionEventArgs` is optional, so existing calls to `controller.dispatch` with interactions will continue to work without changes (context will be empty object).
- **Storage**: The underlying storage system must support the new `context` field. Since we are using `Entity.create` and `Property.create`, the framework should handle the schema update or creation.
- **Tests**: Existing tests should pass. New tests should be added to verify that `context` is correctly passed and stored.

## Verification Plan
1.  Implement the changes in `src/builtins/interaction/Interaction.ts`.
2.  Add a new test case in `tests/runtime` (e.g., `tests/runtime/interaction_context.spec.ts`) to:
    - Create an interaction.
    - Dispatch it with a `context` object (e.g., `{ source: 'agent', tool: 'create_post' }`).
    - Verify that the created `Interaction` event record in storage contains the correct `context` data.
3.  Run all runtime tests to ensure no regressions.
