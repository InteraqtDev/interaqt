import { 
  Entity, 
  Property, 
  Relation, 
  Interaction, 
  Action, 
  Payload, 
  PayloadItem,
  Transform,
  InteractionEventEntity,
  Controller, 
  MonoSystem, 
  PGLiteDB
} from 'interaqt';

// Follow CRUD example patterns exactly - minimal User and Dormitory

// === Entity Definitions ===
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'role', type: 'string', defaultValue: () => 'student' })
  ]
});

const Dormitory = Entity.create({
  name: 'Dormitory',
  properties: [
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'capacity', type: 'number' }),
    Property.create({ name: 'createdAt', type: 'number' })
  ],
  // Transform to create dormitories from interactions - following CRUD pattern exactly
  computation: Transform.create({
    record: InteractionEventEntity,
    callback: function(event) {
      if (event.interactionName === 'CreateDormitory') {
        return {
          name: event.payload.name,
          capacity: event.payload.capacity,
          createdAt: Math.floor(Date.now()/1000)
        };
      }
      return null;
    }
  })
});

// === Relations ===
const UserDormitoryRelation = Relation.create({
  source: User,
  sourceProperty: 'dormitory',
  target: Dormitory,
  targetProperty: 'residents',
  type: 'n:1'
});

// === Interactions ===
const CreateDormitory = Interaction.create({
  name: 'CreateDormitory',
  action: Action.create({ name: 'createDormitory' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', required: true }),
      PayloadItem.create({ name: 'capacity', required: true })
    ]
  })
});

// Collect all definitions
const entities = [User, Dormitory];
const relations = [UserDormitoryRelation];
const interactions = [CreateDormitory];

export { User, Dormitory, CreateDormitory, entities, relations, interactions };