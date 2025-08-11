# 外部资源同步的 interaqt 抽象设计

## 设计理念

在 interaqt 框架中，外部资源同步应该通过响应式的方式来处理。核心理念是：

1. **状态驱动**：使用 StateMachine 管理资源同步状态
2. **事件响应**：通过 Interaction 触发状态变化
3. **响应式计算**：使用 Transform 等计算自动处理副作用
4. **关系追踪**：通过 Relation 关联本地实体和外部资源

## 核心抽象

### 1. ExternalResource Entity

外部资源的基础实体模板：

```typescript
import { Entity, Property, StateMachine, StateNode, StateTransfer, Interaction } from 'interaqt'

// 定义外部资源的通用状态
const pendingState = StateNode.create({ name: 'pending' })
const syncingState = StateNode.create({ name: 'syncing' })
const syncedState = StateNode.create({ name: 'synced' })
const failedState = StateNode.create({ name: 'failed' })
const stalledState = StateNode.create({ name: 'stalled' })

// 定义触发状态转换的交互
const StartSync = Interaction.create({
  name: 'StartSync',
  dataSchema: { resourceId: 'string' }
})

const CompleteSync = Interaction.create({
  name: 'CompleteSync',
  dataSchema: { 
    resourceId: 'string',
    externalId: 'string',
    externalUrl: 'string'
  }
})

const FailSync = Interaction.create({
  name: 'FailSync',
  dataSchema: {
    resourceId: 'string',
    error: 'string'
  }
})

const RetrySync = Interaction.create({
  name: 'RetrySync',
  dataSchema: { resourceId: 'string' }
})

// 外部资源实体模板
const ExternalResource = Entity.create({
  name: 'ExternalResource',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'resourceType',
      type: 'string',
      required: true,
      description: 'file, payment, email, etc.'
    }),
    Property.create({
      name: 'syncStatus',
      type: 'string',
      required: true,
      computed: StateMachine.create({
        name: 'syncStatusMachine',
        states: [pendingState, syncingState, syncedState, failedState, stalledState],
        defaultState: pendingState,
        transfers: [
          // pending -> syncing
          StateTransfer.create({
            current: pendingState,
            next: syncingState,
            trigger: StartSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          }),
          // syncing -> synced
          StateTransfer.create({
            current: syncingState,
            next: syncedState,
            trigger: CompleteSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          }),
          // syncing -> failed
          StateTransfer.create({
            current: syncingState,
            next: failedState,
            trigger: FailSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          }),
          // failed -> syncing (retry)
          StateTransfer.create({
            current: failedState,
            next: syncingState,
            trigger: RetrySync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          })
        ]
      })
    }),
    Property.create({
      name: 'externalId',
      type: 'string',
      required: false,
      description: 'ID in external system'
    }),
    Property.create({
      name: 'externalUrl',
      type: 'string',
      required: false,
      description: 'URL of external resource'
    }),
    Property.create({
      name: 'lastError',
      type: 'string',
      required: false
    }),
    Property.create({
      name: 'retryCount',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'syncStartedAt',
      type: 'string',
      required: false,
      computed: StateMachine.create({
        name: 'syncStartedAtMachine',
        states: [StateNode.create({ 
          name: 'timestamp',
          computeValue: () => new Date().toISOString()
        })],
        defaultState: StateNode.create({ name: 'timestamp' }),
        transfers: [
          StateTransfer.create({
            current: StateNode.create({ name: 'timestamp' }),
            next: StateNode.create({ 
              name: 'timestamp',
              computeValue: () => new Date().toISOString()
            }),
            trigger: StartSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          })
        ]
      })
    }),
    Property.create({
      name: 'syncCompletedAt',
      type: 'string',
      required: false,
      computed: StateMachine.create({
        name: 'syncCompletedAtMachine',
        states: [StateNode.create({ 
          name: 'timestamp',
          computeValue: () => new Date().toISOString()
        })],
        defaultState: StateNode.create({ name: 'timestamp' }),
        transfers: [
          StateTransfer.create({
            current: StateNode.create({ name: 'timestamp' }),
            next: StateNode.create({ 
              name: 'timestamp',
              computeValue: () => new Date().toISOString()
            }),
            trigger: CompleteSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          })
        ]
      })
    })
  ]
})
```

### 2. 文件上传资源示例

```typescript
// 文件特定的状态
const uploadingState = StateNode.create({ 
  name: 'uploading',
  computeValue: ({ progress }) => progress || 0
})

const UpdateUploadProgress = Interaction.create({
  name: 'UpdateUploadProgress',
  dataSchema: {
    fileId: 'string',
    progress: 'number'  // 0-100
  }
})

const FileResource = Entity.create({
  name: 'FileResource',
  properties: [
    // 继承基础属性
    ...ExternalResource.properties,
    
    // 文件特定属性
    Property.create({
      name: 'fileName',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'fileSize',
      type: 'number',
      required: true
    }),
    Property.create({
      name: 'mimeType',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'uploadProgress',
      type: 'number',
      defaultValue: () => 0,
      computed: StateMachine.create({
        name: 'uploadProgressMachine',
        states: [
          StateNode.create({ name: 'idle', computeValue: () => 0 }),
          uploadingState,
          StateNode.create({ name: 'complete', computeValue: () => 100 })
        ],
        defaultState: StateNode.create({ name: 'idle' }),
        transfers: [
          StateTransfer.create({
            current: StateNode.create({ name: 'idle' }),
            next: uploadingState,
            trigger: StartSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          }),
          StateTransfer.create({
            current: uploadingState,
            next: uploadingState,
            trigger: UpdateUploadProgress,
            computeTarget: ({ payload }) => ({ id: payload.fileId })
          }),
          StateTransfer.create({
            current: uploadingState,
            next: StateNode.create({ name: 'complete', computeValue: () => 100 }),
            trigger: CompleteSync,
            computeTarget: ({ payload }) => ({ id: payload.resourceId })
          })
        ]
      })
    }),
    Property.create({
      name: 's3Key',
      type: 'string',
      required: false
    }),
    Property.create({
      name: 'cdnUrl',
      type: 'string',
      required: false
    })
  ]
})
```

### 3. 支付资源示例

```typescript
// 支付特定状态
const authorizedState = StateNode.create({ name: 'authorized' })
const capturedState = StateNode.create({ name: 'captured' })
const refundedState = StateNode.create({ name: 'refunded' })

const AuthorizePayment = Interaction.create({
  name: 'AuthorizePayment',
  dataSchema: {
    paymentId: 'string',
    authorizationCode: 'string'
  }
})

const CapturePayment = Interaction.create({
  name: 'CapturePayment',
  dataSchema: {
    paymentId: 'string',
    amount: 'number'
  }
})

const RefundPayment = Interaction.create({
  name: 'RefundPayment',
  dataSchema: {
    paymentId: 'string',
    amount: 'number',
    reason: 'string'
  }
})

const PaymentResource = Entity.create({
  name: 'PaymentResource',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'amount',
      type: 'number',
      required: true
    }),
    Property.create({
      name: 'currency',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'paymentStatus',
      type: 'string',
      required: true,
      computed: StateMachine.create({
        name: 'paymentStatusMachine',
        states: [
          pendingState,
          authorizedState,
          capturedState,
          refundedState,
          failedState
        ],
        defaultState: pendingState,
        transfers: [
          StateTransfer.create({
            current: pendingState,
            next: authorizedState,
            trigger: AuthorizePayment,
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          }),
          StateTransfer.create({
            current: authorizedState,
            next: capturedState,
            trigger: CapturePayment,
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          }),
          StateTransfer.create({
            current: capturedState,
            next: refundedState,
            trigger: RefundPayment,
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          })
        ]
      })
    }),
    Property.create({
      name: 'stripePaymentIntentId',
      type: 'string',
      required: false
    }),
    Property.create({
      name: 'stripeCustomerId',
      type: 'string',
      required: false
    })
  ]
})
```

### 4. WebhookEvent Entity

用于记录外部系统的回调事件：

```typescript
const ProcessWebhook = Interaction.create({
  name: 'ProcessWebhook',
  dataSchema: {
    eventId: 'string'
  }
})

const unprocessedState = StateNode.create({ name: 'unprocessed' })
const processedState = StateNode.create({ name: 'processed' })
const errorState = StateNode.create({ name: 'error' })

const WebhookEvent = Entity.create({
  name: 'WebhookEvent',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'resourceId',
      type: 'string',
      required: true,
      description: 'ID of the related resource'
    }),
    Property.create({
      name: 'eventType',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'payload',
      type: 'object',
      required: true
    }),
    Property.create({
      name: 'signature',
      type: 'string',
      required: false,
      description: 'Webhook signature for verification'
    }),
    Property.create({
      name: 'processStatus',
      type: 'string',
      computed: StateMachine.create({
        name: 'webhookProcessStatus',
        states: [unprocessedState, processedState, errorState],
        defaultState: unprocessedState,
        transfers: [
          StateTransfer.create({
            current: unprocessedState,
            next: processedState,
            trigger: ProcessWebhook,
            computeTarget: ({ payload }) => ({ id: payload.eventId })
          })
        ]
      })
    }),
    Property.create({
      name: 'receivedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'processedAt',
      type: 'string',
      required: false,
      computed: StateMachine.create({
        name: 'processedAtMachine',
        states: [StateNode.create({
          name: 'timestamp',
          computeValue: () => new Date().toISOString()
        })],
        defaultState: StateNode.create({ name: 'timestamp' }),
        transfers: [
          StateTransfer.create({
            current: StateNode.create({ name: 'timestamp' }),
            next: StateNode.create({
              name: 'timestamp',
              computeValue: () => new Date().toISOString()
            }),
            trigger: ProcessWebhook,
            computeTarget: ({ payload }) => ({ id: payload.eventId })
          })
        ]
      })
    })
  ]
})
```

### 5. ResourceEvent Relation

关联资源和其事件：

```typescript
const ResourceEventRelation = Relation.create({
  name: 'ResourceEventRelation',
  source: ExternalResource,
  target: WebhookEvent,
  sourceProperty: 'events',
  targetProperty: 'resource',
  type: '1:n'
})
```

## 使用模式

### 模式 1：异步操作处理

```typescript
// 创建文件上传交互
const UploadFile = Interaction.create({
  name: 'UploadFile',
  dataSchema: {
    fileName: 'string',
    fileSize: 'number',
    mimeType: 'string'
  },
  computedData: {
    fileResource: Transform.create({
      name: 'createFileResource',
      record: FileResource,
      callback: ({ payload }) => ({
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        syncStatus: 'pending'
      })
    })
  }
})

// 使用示例
await controller.callInteraction('UploadFile', {
  payload: {
    fileName: 'document.pdf',
    fileSize: 1024000,
    mimeType: 'application/pdf'
  }
})

// 开始上传
await controller.callInteraction('StartSync', {
  payload: { resourceId: fileId }
})

// 更新进度
await controller.callInteraction('UpdateUploadProgress', {
  payload: { fileId, progress: 50 }
})

// 完成上传
await controller.callInteraction('CompleteSync', {
  payload: {
    resourceId: fileId,
    externalId: 's3-key-123',
    externalUrl: 'https://cdn.example.com/file.pdf'
  }
})
```

### 模式 2：Webhook 处理

```typescript
// Webhook 接收器交互
const ReceiveWebhook = Interaction.create({
  name: 'ReceiveWebhook',
  dataSchema: {
    resourceId: 'string',
    eventType: 'string',
    payload: 'object',
    signature: 'string'
  },
  computedData: {
    webhookEvent: Transform.create({
      name: 'createWebhookEvent',
      record: WebhookEvent,
      callback: ({ payload }) => ({
        resourceId: payload.resourceId,
        eventType: payload.eventType,
        payload: payload.payload,
        signature: payload.signature,
        processStatus: 'unprocessed'
      })
    })
  }
})

// 处理 Webhook 的 Transform
const ProcessWebhookTransform = Transform.create({
  name: 'processWebhookEvents',
  record: ProcessWebhook,
  callback: async ({ payload }) => {
    const event = await system.storage.findOne(
      'WebhookEvent',
      MatchExp.atom({ key: 'id', value: ['=', payload.eventId] }),
      undefined,
      ['id', 'resourceId', 'eventType', 'payload']
    )
    
    // 根据事件类型触发相应的交互
    switch (event.eventType) {
      case 'payment.authorized':
        await controller.callInteraction('AuthorizePayment', {
          payload: {
            paymentId: event.resourceId,
            authorizationCode: event.payload.authCode
          }
        })
        break
      case 'file.uploaded':
        await controller.callInteraction('CompleteSync', {
          payload: {
            resourceId: event.resourceId,
            externalId: event.payload.s3Key,
            externalUrl: event.payload.cdnUrl
          }
        })
        break
    }
  }
})
```

### 模式 3：重试机制

```typescript
// 带重试计数的状态机
const retryState = StateNode.create({ 
  name: 'retry',
  computeValue: ({ retryCount }) => (retryCount || 0) + 1
})

const RetryStateMachine = StateMachine.create({
  name: 'retryMachine',
  states: [
    pendingState,
    syncingState,
    syncedState,
    failedState,
    retryState
  ],
  defaultState: pendingState,
  transfers: [
    // ... 其他转换
    StateTransfer.create({
      current: failedState,
      next: retryState,
      trigger: RetrySync,
      computeTarget: ({ payload }) => ({ id: payload.resourceId })
    }),
    StateTransfer.create({
      current: retryState,
      next: syncingState,
      trigger: StartSync,
      computeTarget: ({ payload }) => ({ id: payload.resourceId })
    })
  ]
})

// 自动重试的 Transform
const AutoRetryTransform = Transform.create({
  name: 'autoRetry',
  record: FailSync,
  callback: async ({ payload }) => {
    const resource = await system.storage.findOne(
      'ExternalResource',
      MatchExp.atom({ key: 'id', value: ['=', payload.resourceId] }),
      undefined,
      ['id', 'retryCount']
    )
    
    if (resource.retryCount < 3) {
      // 延迟重试
      setTimeout(() => {
        controller.callInteraction('RetrySync', {
          payload: { resourceId: payload.resourceId }
        })
      }, Math.pow(2, resource.retryCount) * 1000)  // 指数退避
    }
  }
})
```

### 模式 4：缓存同步

```typescript
// 缓存实体
const CachedResource = Entity.create({
  name: 'CachedResource',
  properties: [
    Property.create({
      name: 'id',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'resourceId',
      type: 'string',
      required: true
    }),
    Property.create({
      name: 'cachedData',
      type: 'object',
      required: true
    }),
    Property.create({
      name: 'cachedAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'ttl',
      type: 'number',
      defaultValue: () => 3600  // 1 hour
    }),
    Property.create({
      name: 'isValid',
      type: 'boolean',
      computed: ({ cachedAt, ttl }) => {
        const age = Date.now() - new Date(cachedAt).getTime()
        return age < ttl * 1000
      }
    })
  ]
})

// 缓存失效交互
const InvalidateCache = Interaction.create({
  name: 'InvalidateCache',
  dataSchema: {
    resourceId: 'string'
  }
})

// 缓存更新 Transform
const UpdateCacheTransform = Transform.create({
  name: 'updateCache',
  record: CompleteSync,
  callback: async ({ payload }) => {
    // 创建或更新缓存
    const cache = await system.storage.findOne(
      'CachedResource',
      MatchExp.atom({ key: 'resourceId', value: ['=', payload.resourceId] }),
      undefined,
      ['id']
    )
    
    if (cache) {
      await system.storage.update('CachedResource', cache.id, {
        cachedData: { 
          externalId: payload.externalId,
          externalUrl: payload.externalUrl
        },
        cachedAt: new Date().toISOString()
      })
    } else {
      await system.storage.create('CachedResource', {
        resourceId: payload.resourceId,
        cachedData: {
          externalId: payload.externalId,
          externalUrl: payload.externalUrl
        }
      })
    }
  }
})
```

## 实现指南

### 1. 基础设施层

在应用层需要实现的支持服务：

```typescript
// 外部服务适配器接口
interface ExternalServiceAdapter {
  // 执行同步操作
  sync(resource: ExternalResource): Promise<SyncResult>
  
  // 验证 Webhook 签名
  verifyWebhook(signature: string, payload: object): boolean
  
  // 查询外部资源状态
  queryStatus(externalId: string): Promise<ResourceStatus>
}

// S3 适配器示例
class S3Adapter implements ExternalServiceAdapter {
  async sync(resource: FileResource): Promise<SyncResult> {
    // 生成预签名 URL
    const presignedUrl = await this.generatePresignedUrl(resource.fileName)
    
    // 返回上传信息
    return {
      externalId: `s3://${bucket}/${key}`,
      externalUrl: presignedUrl,
      metadata: { bucket, key }
    }
  }
  
  verifyWebhook(signature: string, payload: object): boolean {
    // 验证 AWS SNS 签名
    return verifySignature(signature, payload, this.secret)
  }
  
  async queryStatus(externalId: string): Promise<ResourceStatus> {
    // 查询 S3 对象状态
    const metadata = await s3.headObject({ Key: externalId })
    return {
      exists: true,
      size: metadata.ContentLength,
      lastModified: metadata.LastModified
    }
  }
}
```

### 2. 控制器层

处理外部请求和内部逻辑的协调：

```typescript
// Webhook 控制器
class WebhookController {
  constructor(
    private controller: Controller,
    private adapters: Map<string, ExternalServiceAdapter>
  ) {}
  
  async handleWebhook(
    service: string,
    signature: string,
    payload: object
  ) {
    // 验证签名
    const adapter = this.adapters.get(service)
    if (!adapter.verifyWebhook(signature, payload)) {
      throw new Error('Invalid webhook signature')
    }
    
    // 创建 Webhook 事件
    await this.controller.callInteraction('ReceiveWebhook', {
      payload: {
        resourceId: payload.resourceId,
        eventType: payload.type,
        payload: payload,
        signature: signature
      }
    })
    
    // 触发处理
    await this.controller.callInteraction('ProcessWebhook', {
      payload: { eventId: webhookEvent.id }
    })
  }
}

// 同步服务
class SyncService {
  constructor(
    private controller: Controller,
    private adapters: Map<string, ExternalServiceAdapter>
  ) {}
  
  async startSync(resourceId: string) {
    // 获取资源
    const resource = await this.getResource(resourceId)
    
    // 开始同步
    await this.controller.callInteraction('StartSync', {
      payload: { resourceId }
    })
    
    try {
      // 调用外部服务
      const adapter = this.adapters.get(resource.resourceType)
      const result = await adapter.sync(resource)
      
      // 完成同步
      await this.controller.callInteraction('CompleteSync', {
        payload: {
          resourceId,
          externalId: result.externalId,
          externalUrl: result.externalUrl
        }
      })
    } catch (error) {
      // 同步失败
      await this.controller.callInteraction('FailSync', {
        payload: {
          resourceId,
          error: error.message
        }
      })
    }
  }
}
```

### 3. 调度器层

处理定时任务和轮询：

```typescript
// 轮询调度器
class PollingScheduler {
  private intervals: Map<string, NodeJS.Timer> = new Map()
  
  constructor(
    private controller: Controller,
    private syncService: SyncService
  ) {}
  
  // 开始轮询
  startPolling(resourceId: string, interval: number) {
    const timer = setInterval(async () => {
      const resource = await this.getResource(resourceId)
      
      // 检查是否需要同步
      if (resource.syncStatus === 'pending' || 
          resource.syncStatus === 'failed' && resource.retryCount < 3) {
        await this.syncService.startSync(resourceId)
      }
      
      // 检查是否超时
      if (resource.syncStatus === 'syncing') {
        const syncDuration = Date.now() - new Date(resource.syncStartedAt).getTime()
        if (syncDuration > 60000) {  // 1 分钟超时
          await this.controller.callInteraction('FailSync', {
            payload: {
              resourceId,
              error: 'Sync timeout'
            }
          })
        }
      }
    }, interval)
    
    this.intervals.set(resourceId, timer)
  }
  
  // 停止轮询
  stopPolling(resourceId: string) {
    const timer = this.intervals.get(resourceId)
    if (timer) {
      clearInterval(timer)
      this.intervals.delete(resourceId)
    }
  }
}

// 批量同步调度器
class BatchSyncScheduler {
  constructor(
    private controller: Controller,
    private syncService: SyncService
  ) {}
  
  async syncBatch(resourceIds: string[], concurrency: number = 5) {
    const queue = [...resourceIds]
    const active = new Set<Promise<void>>()
    
    while (queue.length > 0 || active.size > 0) {
      // 启动新的同步任务
      while (active.size < concurrency && queue.length > 0) {
        const resourceId = queue.shift()!
        const promise = this.syncService.startSync(resourceId)
          .finally(() => active.delete(promise))
        active.add(promise)
      }
      
      // 等待至少一个完成
      if (active.size > 0) {
        await Promise.race(active)
      }
    }
  }
}
```

## 最佳实践

### 1. 状态机设计

- **单一职责**：每个状态机只负责一个属性的状态管理
- **原子转换**：状态转换应该是原子的，避免中间状态
- **幂等性**：相同的触发应该产生相同的结果
- **超时处理**：为长时间运行的状态设置超时机制

### 2. 错误处理

- **分类错误**：区分暂时性错误和永久性错误
- **重试策略**：使用指数退避避免雪崩
- **断路器**：在连续失败后暂停重试
- **错误记录**：保留详细的错误信息用于调试

### 3. 性能优化

- **批量处理**：合并多个操作减少外部调用
- **缓存策略**：合理设置 TTL 和失效机制
- **异步处理**：使用队列处理非关键路径操作
- **并发控制**：限制并发请求数避免超载

### 4. 监控和调试

- **事件追踪**：记录所有状态变化事件
- **日志聚合**：集中管理日志便于问题定位
- **指标监控**：监控成功率、延迟等关键指标
- **告警设置**：及时发现和处理异常情况

## 总结

通过将外部资源同步抽象为 interaqt 的响应式模型，我们可以：

1. **统一管理**：使用一致的模式处理各种外部资源
2. **响应式更新**：通过 StateMachine 自动管理状态转换
3. **事件驱动**：通过 Interaction 触发所有操作
4. **可追溯性**：完整记录所有状态变化和事件
5. **可扩展性**：轻松添加新的资源类型和状态

这种设计充分利用了 interaqt 框架的响应式特性，使外部资源同步变得更加可控和可维护。
