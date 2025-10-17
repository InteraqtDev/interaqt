---
name: integration-implementation-handler
description: Guide for implementing integrations to connect reactive backend with imperative external systems
model: inherit
color: purple
---

# Integration Implementation Guide

## Overview

**Integrations** bridge the gap between the reactive backend framework and imperative external systems (APIs, services, databases, message queues, etc.). They allow external non-reactive systems to participate in the reactive data flow.

## Integration Interface

Every integration must implement the `IIntegration` interface:

```typescript
export type IIntegration = {
    configure?:() => Promise<any>
    setup?:(controller: Controller) => Promise<any>
    createSideEffects:() => RecordMutationSideEffect[]
    createAPIs?: () => APIs
}
```

### Constructor Arguments

```typescript
export type IIntegrationConstructorArgs = {
    entities: EntityInstance[],
    relations: RelationInstance[],
    activities: ActivityInstance[],
    interactions: InteractionInstance[],
    dict: DictionaryInstance[]
}

export type IIntegrationHandles = {
    [k:string]: any  // External handles like websocketServer, etc.
}

class MyIntegration implements IIntegration {
    constructor(
        public args: IIntegrationConstructorArgs, 
        public handles: IIntegrationHandles
    ) {}
}
```

## Lifecycle Methods

### 1. `configure()` - Schema Augmentation

**Purpose**: Modify the reactive schema before system initialization.

**Use Cases**:
- Inject new entities into the system
- Add computed properties to existing entities
- Configure state machines for reactive properties
- Inject computations into relations

**Execution Timing**: Before Controller initialization

**Example - Injecting Entity**:
```typescript
async configure() {
    // Create and inject a new entity for external events
    const TaskEvent = Entity.create({
        name: 'LLMPicGenAsyncTaskEvent',
        properties: [
            Property.create({ name: 'taskId', type: 'string' }),
            Property.create({ name: 'status', type: 'string' }),
            Property.create({ name: 'result', type: 'object' }),
        ]
    });
    
    // Inject into entities array
    this.args.entities.push(TaskEvent);
}
```

**Example - Injecting Property Computation**:
```typescript
async configure() {
    // Find target entities
    const streamEntities = Stream.instances;
    
    for (const entity of streamEntities) {
        // Find and inject computation into property
        const urlProperty = entity.properties.find(p => p.name === 'url')!;
        
        urlProperty.computation = Custom.create({
            name: 'generateStreamUrl',
            async getInitialValue(this: Controller, record?: any) {
                // Call external API to generate URL
                const timestamp = Math.floor(Date.now() / 1000) + 3600;
                const authString = `/${appName}/${streamName}${key}${timestamp}`;
                const sign = crypto.createHash('md5').update(authString).digest('hex');
                return `rtmp://${domain}/${appName}/${streamName}?volcTime=${timestamp}&volcSecret=${sign}`;
            },
            incrementalCompute: async function(this: { controller: Controller, state: any }, lastValue: any, mutationEvent: any, record: any, dataDeps: any) {
                // Skip recomputation if URL should remain constant
                return ComputationResult.skip();
            }
        });
    }
}
```

**Example - Injecting State Machine**:
```typescript
async configure() {
    const taskEntities = AsyncTask.instances;
    
    for (const taskEntity of taskEntities) {
        const statusProperty = taskEntity.properties.find(p => p.name === 'status');
        
        // Create state node
        const statusState = StateNode.create({
            name: 'status',
            computeValue: (lastValue, mutationEvent) => {
                return mutationEvent?.record?.status || lastValue || 'pending';
            }
        });
        
        // Configure state machine
        statusProperty.computation = StateMachine.create({
            states: [statusState],
            initialState: statusState,
            transfers: [
                StateTransfer.create({
                    trigger: {
                        recordName: 'TaskEvent',  // Event entity name
                        type: 'create',
                        record: { taskType: taskEntity.name }
                    },
                    current: statusState,
                    next: statusState,
                    computeTarget: async function(this: Controller, mutationEvent: any) {
                        const event = mutationEvent.record;
                        if (event.status) {
                            return { id: event.taskId };  // Target record to update
                        }
                        return undefined;
                    }
                })
            ]
        });
    }
}
```

### 2. `setup()` - Runtime Initialization

**Purpose**: Initialize external connections and register runtime handlers.

**Use Cases**:
- Connect to external services (Redis, databases, message queues)
- Register event listeners on external handles
- Set up WebSocket connection handlers
- Initialize API clients

**Execution Timing**: After Controller initialization, before server starts

**Example - External Service Connection**:
```typescript
async setup(controller: Controller) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.subscriber = createClient({ url: redisUrl });
    this.subscriber.on('error', (err) => console.error('Redis Error:', err));
    await this.subscriber.connect();
    
    this.publisher = createClient({ url: redisUrl });
    await this.publisher.connect();
}
```

**Example - WebSocket Handler Registration**:
```typescript
async setup(controller: Controller) {
    // Register handler for user connection
    this.handles.websocketServer.on('connection-setup-completed', async (ws, request) => {
        const user = ws.user;
        if (!user) return;
        
        // Query user's channels
        const userChannels = await controller.system.storage.find(
            'UserChannelRelation',
            MatchExp.atom({ key: 'source.id', value: ['=', user.id] }),
            undefined,
            ['id', ['target', { attributeQuery: ['id'] }]]
        );
        
        // Subscribe to Redis channels for this user
        for (let relation of userChannels) {
            this.subscriber?.subscribe(relation.target.id, (message) => {
                ws.send(message);
            });
        }
    });
}
```

### 3. `createSideEffects()` - Reactive Synchronization

**Purpose**: Define side effects that synchronize reactive data changes to external systems.

**Use Cases**:
- Push data mutations to external APIs
- Publish messages to message queues
- Update external database records
- Trigger external workflows

**Return Value**: Array of `RecordMutationSideEffect`

**Example - Publishing to Message Queue**:
```typescript
createSideEffects(): RecordMutationSideEffect[] {
    const dispatcher = this;
    
    return [
        RecordMutationSideEffect.create({
            name: 'channel_message_publish_sideeffect',
            record: {
                name: 'ChannelMessageRelation',  // Target relation/entity
            },
            async content(this: Controller, event: RecordMutationEvent) {
                if (event.type === 'create') {
                    const channelId = event.record?.source.id;
                    const message = event.record?.target;
                    
                    if (message && channelId) {
                        const messageData = {
                            type: 'message',
                            channelId,
                            message
                        };
                        
                        // Publish to external system
                        await dispatcher.publisher?.publish(
                            channelId, 
                            JSON.stringify(messageData)
                        );
                        console.log('Published to Redis:', channelId);
                    }
                }
            }
        })
    ];
}
```

**Example - Multiple Side Effects**:
```typescript
createSideEffects(): RecordMutationSideEffect[] {
    return [
        // Handle relation creation
        ...UserChannelRelation.instances.map(instance => 
            RecordMutationSideEffect.create({
                name: `channel_user_relation_${instance.name}_create`,
                record: { name: instance.name! },
                async content(this: Controller, event: RecordMutationEvent) {
                    if (event.type === 'create') {
                        // Subscribe online users to new channels
                        const clients = Array.from(websocketServer.clients);
                        const wsClient = clients.find(c => c.user.id === event.record?.source.id);
                        if (wsClient) {
                            subscriber?.subscribe(event.record?.target.id, (msg) => {
                                wsClient.send(msg);
                            });
                        }
                    }
                }
            })
        ),
        
        // Handle relation deletion
        ...UserChannelRelation.instances.map(instance => 
            RecordMutationSideEffect.create({
                name: `channel_user_relation_${instance.name}_delete`,
                record: { name: instance.name! },
                async content(this: Controller, event: RecordMutationEvent) {
                    if (event.type === 'delete') {
                        // Unsubscribe user from channel
                        // ... implementation
                    }
                }
            })
        )
    ];
}
```

### 4. `createAPIs()` - Custom Endpoints

**Purpose**: Create custom API endpoints for external system interactions.

**Use Cases**:
- Query external service status
- Trigger external operations
- Proxy requests to external APIs
- Implement custom business logic that doesn't fit interactions

**Return Value**: Object mapping API names to API definitions

**Example - Status Query API**:
```typescript
createAPIs(): APIs {
    const apis: APIs = {};
    
    apis.queryTaskStatus = createAPI(
        async function(this: Controller, context, params: { taskId: string, taskType: string }) {
            const { taskId, taskType } = params;
            
            // Query internal state
            const task = await this.system.storage.findOne(
                taskType,
                MatchExp.atom({ key: 'id', value: ['=', taskId] }),
                undefined,
                ['id', 'executionId', 'status', 'result']
            );
            
            if (!task) {
                return { error: 'Task not found' };
            }
            
            // Query external system
            const externalStatus = await queryExternalAPI(task.executionId);
            
            // Update internal state via event creation
            if (externalStatus.status !== task.status) {
                await this.system.storage.create('TaskEvent', {
                    taskId,
                    eventType: 'statusUpdated',
                    status: externalStatus.status,
                    result: externalStatus.result,
                    taskType
                });
            }
            
            return {
                success: true,
                taskId,
                status: externalStatus.status,
                result: externalStatus.result
            };
        },
        {
            params: { taskId: 'string', taskType: 'string' },
            useNamedParams: true,
            allowAnonymous: false
        }
    );
    
    return apis;
}
```

## Integration Patterns

### Pattern 1: External Service Synchronization (Redis, MQ)

**Characteristics**:
- Bidirectional data flow
- Real-time synchronization
- Connection management

**Implementation**:
- `setup()`: Establish connections, register listeners
- `createSideEffects()`: Push internal changes to external system
- External events → Create records in reactive system

**Example**: RedisChannelIntegration

### Pattern 2: External Resource Generation (URLs, Tokens)

**Characteristics**:
- One-way data flow (internal → external)
- Lazy evaluation
- Resource lifecycle management

**Implementation**:
- `configure()`: Inject Custom computation into properties
- `getInitialValue()`: Call external API to generate resource
- `incrementalCompute()`: Usually skip (resources are immutable)

**Example**: VolcStreamIntegration

### Pattern 3: Async Task Management

**Characteristics**:
- Async operation lifecycle
- Status polling
- Result synchronization

**Implementation**:
- `configure()`: Inject event entity, configure state machines
- `createAPIs()`: Provide status query endpoint
- Event-driven state updates via injected entity

**Example**: VolcPicGenIntegration

## Best Practices

### 1. Separation of Concerns

- **configure()**: Schema modifications only
- **setup()**: Connection establishment only
- **createSideEffects()**: Data synchronization only
- **createAPIs()**: Query/command operations only

### 2. Error Handling

```typescript
async setup(controller: Controller) {
    try {
        this.client = await connectToService();
        this.client.on('error', (err) => {
            console.error('Service error:', err);
            // Implement reconnection logic
        });
    } catch (error) {
        console.error('Failed to connect:', error);
        throw error;  // Fail fast if critical
    }
}
```

### 3. Event-Driven State Updates

**❌ BAD - Direct State Mutation**:
```typescript
// Don't directly update entity properties
await this.system.storage.update(taskType, taskId, {
    status: newStatus  // This bypasses reactive system
});
```

**✅ GOOD - Event-Driven Updates**:
```typescript
// Create event records to trigger state machines
await this.system.storage.create('TaskEvent', {
    taskId,
    eventType: 'statusUpdated',
    status: newStatus,
    taskType
});
// State machine will reactively update the target entity
```

### 4. Resource Cleanup

```typescript
async cleanup() {
    if (this.subscriber?.isOpen) {
        await this.subscriber.disconnect();
    }
    if (this.publisher?.isOpen) {
        await this.publisher.disconnect();
    }
}
```

### 5. Environment Configuration

```typescript
async setup(controller: Controller) {
    const apiKey = process.env.EXTERNAL_API_KEY;
    if (!apiKey) {
        throw new Error('EXTERNAL_API_KEY must be set');
    }
    // ... use apiKey
}
```

### 6. Type Safety with External APIs

```typescript
// Define external API types
export type ExternalTaskStatus = 'pending' | 'processing' | 'success' | 'failed';

// Map to internal types
function mapExternalStatus(external: string): TaskStatus {
    switch (external) {
        case 'in_queue': return 'pending';
        case 'generating': return 'processing';
        case 'done': return 'success';
        default: return 'failed';
    }
}
```

## Integration Registration

After creating an integration, register it in `integrations/index.ts`:

```typescript
import { MyIntegration } from './myintegration';

const AggregatedIntegrationClass = createAggregatedIntegration([
    RedisChannelIntegration,
    VolcStreamIntegration,
    VolcPicGenIntegration,
    MyIntegration  // Add your integration
]);

export default AggregatedIntegrationClass;
```

## Testing Integrations

1. **Unit Tests**: Test integration logic in isolation
2. **Integration Tests**: Test with mock external services
3. **E2E Tests**: Test with real external services in staging

```typescript
// Mock external service for testing
class MockExternalService {
    async query(id: string) {
        return { status: 'success', result: { data: 'test' } };
    }
}

// Use in tests
const integration = new MyIntegration(args, { 
    externalService: new MockExternalService() 
});
```

## Common Pitfalls

1. **❌ Modifying schema in setup()**: Schema must be finalized before Controller initialization
2. **❌ Blocking operations in configure()**: Avoid heavy I/O, keep it fast
3. **❌ Forgetting error handlers**: Always handle connection errors
4. **❌ Direct state mutations**: Use event-driven updates instead
5. **❌ Ignoring cleanup**: Implement proper resource cleanup
6. **❌ Hardcoding configuration**: Use environment variables

## Summary

Integrations enable reactive systems to communicate with external imperative systems through four key mechanisms:

1. **configure()**: Augment reactive schema
2. **setup()**: Initialize external connections
3. **createSideEffects()**: Synchronize data to external systems
4. **createAPIs()**: Expose custom endpoints

Choose the appropriate pattern based on your integration needs, and always prioritize event-driven design for state synchronization.

