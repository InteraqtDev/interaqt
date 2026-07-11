# Permission Control (Attributive — Removed)

The `Attributive` / `Attributives` concept has been **removed** from the interaqt framework, along with all of its attachment points:

- `Interaction.userAttributives` / `Interaction.userRef`
- `PayloadItem.attributives` / `PayloadItem.itemRef`
- `createUserRoleAttributive` / `boolExpToAttributives`
- activity `refs` and `isRef` user binding

Declaring any of these now fails fast at declaration time with an error pointing here.

## Use Conditions instead

`Condition` is the single guard concept. A condition callback receives the **full event args** (`user`, `payload`, `query`, `activityId`) with the Controller as `this`, so every form previously expressed with attributives is expressible as a condition:

```typescript
// Role check (was: createUserRoleAttributive)
const AdminOnly = Condition.create({
  name: 'AdminOnly',
  content: async function(event) {
    return !!(event.user.roles && event.user.roles.includes('admin'))
  }
})

// Payload-content check (was: PayloadItem.attributives)
const PublishedPostOnly = Condition.create({
  name: 'PublishedPostOnly',
  content: async function(this: Controller, event) {
    const post = await this.system.storage.findOne('Post',
      MatchExp.atom({ key: 'id', value: ['=', event.payload.post.id] }),
      undefined, ['status'])
    return post?.status === 'published'
  }
})

// Activity user binding (was: userRef/itemRef + isRef attributive):
// query this activity's own interaction events to locate the bound user.
const MustBeRequestReceiver = Condition.create({
  name: 'MustBeRequestReceiver',
  content: async function(this: Controller, event) {
    if (!event.activityId) return false
    const sendEvent = await this.system.storage.findOne(InteractionEventEntity.name,
      MatchExp.atom({ key: 'interactionName', value: ['=', 'sendRequest'] })
        .and({ key: 'activity.id', value: ['=', event.activityId] }),
      undefined, ['*'])
    return !!sendEvent && sendEvent.payload?.to?.id === event.user.id
  }
})
```

Combine conditions with `Conditions.create({ content: BoolExp.atom(a).and(b).or(c) })`.

## Contract

- Guard callbacks must return an actual `boolean`; any non-boolean result fails the check (fail-closed).
- Conditions run inside the dispatch transaction, before the event record is persisted.
- For row-level data access control on queries, use `dataPolicy` (match/modifier/attributeQuery) on GetAction interactions.
- Row filtering and column projection are independent: `dataPolicy.match` without `dataPolicy.attributeQuery`
  leaves the projection caller-controlled (including `['*']` — every column of matched rows). Whenever
  `dataPolicy.match` guards an entity with sensitive columns, declare `dataPolicy.attributeQuery` as well.
