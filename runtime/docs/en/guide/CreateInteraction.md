# Creating Interactions

## Creating Interactions

An Interaction represents an action a user can perform, similar to a post API.
Unlike other web frameworks, we don't need to declare how data should be handled when an interaction occurs.
Instead, we reference Interactions backward in data definitions, as detailed in [Use Computed Data](UseComputedData.md).

A simple friendship interaction is as follows:

```typescript
const sendInteraction = Interaction.create({
  name: 'sendRequest',
  action: Action.create({name: 'sendRequest'}),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'to',
        base: UserEntity,
        itemRef: userRefB
      })
    ]
  })
})

```

## Using Attributes

Attributive can restrict the users who can perform the current Interaction and can also be used to limit Payload.

### Creating Attributive

Avoid using external variables in Attributive; it should remain a pure function. Otherwise, it may become invalid during serialization and deserialization.

An Attributive declaring "Mine" looks like this:

```typescript
const Mine = Attributive.create({
    name: 'Mine',
    content:  function(this: Controller, request, { user }){
      return request.owner === user.id
    }
})
```

### Creating Generic Attributives

You can define certain attributives based on business rules, such as "Mine": it checks if the owner field on the entity points to the user making the current interaction request. You can have multiple differently named fields; it's recommended to inject field information through controller.globals into the attributive for evaluation rather than hardcoding it within Attributive

#### Using BoolExp to Combine Attributives

```typescript
boolExpToAttributives(
    BoolExp.atom(Mine).and(
        Attributive.create({
            name: 'Pending',
            content: async function(this: Controller, request, { user }){
             return request.result === 'pending'
            }
        })
    )
)
```

