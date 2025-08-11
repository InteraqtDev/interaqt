# 外部资源同步模式总结

## 概述

在现代软件系统中，与外部资源的交互是不可避免的。这些外部资源包括文件存储服务（S3）、支付网关（Stripe）、邮件服务（SendGrid）、消息队列（RabbitMQ）等。本文档总结了处理这些外部资源同步的常见模式。

## 核心特征

外部资源同步通常具有以下特征：

1. **异步性**：操作通常不是立即完成的
2. **状态性**：需要追踪操作的当前状态
3. **不确定性**：可能成功、失败或超时
4. **外部依赖**：依赖外部系统的可用性和响应
5. **最终一致性**：本地状态与外部状态可能暂时不一致

## 常见场景分析

### 1. 文件上传/下载（S3、CDN）

**特征**：
- 大文件传输需要时间
- 支持断点续传
- 需要进度追踪
- 可能需要预签名 URL

**状态流转**：
```
pending → uploading(progress%) → uploaded → processing → ready
                ↓                     ↓           ↓
              failed               failed      failed
```

**数据模型**：
```typescript
{
  id: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  status: 'pending' | 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed',
  progress: number,  // 0-100
  externalId: string,  // S3 object key
  externalUrl: string,  // CDN URL
  uploadStartedAt: Date,
  uploadCompletedAt: Date,
  error: string,
  retryCount: number
}
```

### 2. 支付处理（Stripe、PayPal）

**特征**：
- 多步骤流程（授权、捕获、结算）
- Webhook 回调通知
- 需要幂等性保证
- 涉及敏感信息

**状态流转**：
```
initiated → processing → authorized → captured → settled
     ↓           ↓            ↓           ↓          ↓
  cancelled   failed      declined    refunded   disputed
```

**数据模型**：
```typescript
{
  id: string,
  amount: number,
  currency: string,
  status: PaymentStatus,
  externalPaymentId: string,  // Stripe payment intent ID
  externalCustomerId: string,
  paymentMethod: string,
  initiatedAt: Date,
  authorizedAt: Date,
  capturedAt: Date,
  settledAt: Date,
  failureReason: string,
  webhookEvents: Array<{
    eventType: string,
    receivedAt: Date,
    processed: boolean
  }>
}
```

### 3. 邮件发送（SendGrid、AWS SES）

**特征**：
- 异步发送
- 递送状态追踪
- 可能有发送延迟
- 需要处理退信

**状态流转**：
```
queued → sending → sent → delivered
    ↓        ↓       ↓         ↓
 failed   failed  bounced  complained
```

**数据模型**：
```typescript
{
  id: string,
  recipient: string,
  subject: string,
  status: EmailStatus,
  externalMessageId: string,
  queuedAt: Date,
  sentAt: Date,
  deliveredAt: Date,
  openedAt: Date,
  clickedAt: Date,
  bounceType: string,
  complaintType: string
}
```

### 4. 外部 API 调用

**特征**：
- 同步或异步
- 需要重试机制
- 可能需要速率限制
- 响应缓存

**状态流转**：
```
pending → calling → success
    ↓        ↓         
 cancelled  failed → retrying
              ↑          ↓
              ←─────────→
```

### 5. 消息队列（RabbitMQ、Kafka）

**特征**：
- 发布确认
- 消费确认
- 死信队列
- 顺序保证

**状态流转**：
```
published → confirmed → consumed → acknowledged
     ↓          ↓           ↓           ↓
  failed     failed     failed    dead-lettered
```

## 通用模式总结

### 模式 1：异步操作模式（Async Operation Pattern）

**适用场景**：操作需要较长时间完成，如文件上传、批量处理

**核心要素**：
- 操作ID：唯一标识一次操作
- 状态机：定义状态转换规则
- 进度追踪：可选，用于长时间操作
- 超时处理：防止操作永久挂起

### 模式 2：回调通知模式（Webhook Callback Pattern）

**适用场景**：外部系统主动通知状态变化，如支付确认、邮件递送

**核心要素**：
- 回调端点：接收外部通知
- 事件类型：区分不同的通知类型
- 幂等处理：防止重复处理
- 签名验证：确保请求来自可信源

### 模式 3：轮询检查模式（Polling Pattern）

**适用场景**：需要主动检查外部资源状态，如任务进度查询

**核心要素**：
- 轮询间隔：固定或指数退避
- 最大重试次数：防止无限轮询
- 状态缓存：减少不必要的查询

### 模式 4：重试补偿模式（Retry and Compensation Pattern）

**适用场景**：处理失败和异常情况

**核心要素**：
- 重试策略：立即、固定延迟、指数退避
- 最大重试次数：防止无限重试
- 补偿操作：失败后的清理或回滚
- 断路器：防止雪崩效应

### 模式 5：缓存同步模式（Cache Synchronization Pattern）

**适用场景**：减少对外部资源的访问，提高性能

**核心要素**：
- 缓存策略：TTL、LRU、主动失效
- 同步机制：推送、拉取、混合
- 一致性级别：强一致、最终一致
- 失效处理：缓存穿透、缓存雪崩

### 模式 6：乐观锁定模式（Optimistic Locking Pattern）

**适用场景**：处理并发更新冲突

**核心要素**：
- 版本号：追踪资源版本
- 冲突检测：比较版本号
- 冲突解决：重试或合并

## 状态管理最佳实践

### 1. 状态设计原则

- **原子性**：状态转换应该是原子的
- **不可逆性**：某些状态转换是单向的
- **可追溯性**：记录状态变化历史
- **超时处理**：为中间状态设置超时

### 2. 状态字段设计

```typescript
interface ExternalResourceState {
  // 核心状态
  status: string;  // 当前状态
  
  // 时间追踪
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  
  // 外部引用
  externalId?: string;  // 外部系统的ID
  externalUrl?: string;  // 外部资源URL
  
  // 错误处理
  lastError?: string;
  errorCount: number;
  retryCount: number;
  nextRetryAt?: Date;
  
  // 元数据
  metadata?: Record<string, any>;
}
```

### 3. 事件记录

记录所有重要的状态变化事件：

```typescript
interface ResourceEvent {
  id: string;
  resourceId: string;
  eventType: string;
  timestamp: Date;
  oldStatus?: string;
  newStatus?: string;
  details?: Record<string, any>;
  source: 'internal' | 'external';
}
```

## 错误处理策略

### 1. 分类错误

- **暂时性错误**：网络超时、服务暂时不可用
- **永久性错误**：认证失败、资源不存在
- **业务错误**：余额不足、配额超限

### 2. 处理策略

- **暂时性错误**：重试
- **永久性错误**：标记失败，通知用户
- **业务错误**：返回具体错误信息

### 3. 重试策略

```typescript
interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}
```

## 监控和告警

### 关键指标

1. **成功率**：操作成功的比例
2. **延迟**：操作完成的时间
3. **重试率**：需要重试的操作比例
4. **失败率**：最终失败的操作比例
5. **积压量**：等待处理的操作数量

### 告警规则

- 成功率低于阈值
- 平均延迟超过预期
- 重试率异常升高
- 有操作长时间停留在中间状态

## 总结

外部资源同步是一个复杂的领域，需要考虑异步性、不确定性、一致性等多个方面。通过识别和应用这些通用模式，我们可以构建更加健壮和可维护的系统。关键是要：

1. 明确定义状态机和状态转换规则
2. 实现合适的重试和补偿机制
3. 记录详细的事件日志
4. 设置合理的监控和告警
5. 处理好各种边界情况和异常场景
