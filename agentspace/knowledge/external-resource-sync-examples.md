# 外部资源同步实战示例

本文档提供了在 interaqt 框架中实现外部资源同步的完整示例，涵盖文件上传、支付处理、邮件发送等常见场景。

## 完整示例 1：文件上传系统

### 场景描述

实现一个文件上传系统，支持：
- 上传文件到 S3
- 实时进度追踪
- 失败重试
- CDN 分发

### 实体定义

```typescript
import { 
  Entity, Property, Relation, StateMachine, 
  StateNode, StateTransfer, Interaction, InteractionEventEntity, Transform, Count 
} from 'interaqt'

// ========== 状态定义 ==========
const pendingState = StateNode.create({ name: 'pending' })
const uploadingState = StateNode.create({ name: 'uploading' })
const processingState = StateNode.create({ name: 'processing' })
const readyState = StateNode.create({ name: 'ready' })
const failedState = StateNode.create({ name: 'failed' })

// ========== 实体定义 ==========
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'id', type: 'string', required: true }),
    Property.create({ name: 'name', type: 'string', required: true }),
    Property.create({ name: 'email', type: 'string', required: true }),
    Property.create({ 
      name: 'uploadedFilesCount',
      type: 'number',
      computed: Count.create({
        name: 'userFileCount',
        relation: 'UserFileRelation',
        relationDirection: 'source'
      })
    })
  ]
})

const File = Entity.create({
  name: 'File',
  properties: [
    Property.create({ name: 'id', type: 'string', required: true }),
    Property.create({ name: 'fileName', type: 'string', required: true }),
    Property.create({ name: 'fileSize', type: 'number', required: true }),
    Property.create({ name: 'mimeType', type: 'string', required: true }),
    Property.create({ 
      name: 'status',
      type: 'string',
      computed: StateMachine.create({
        name: 'fileStatusMachine',
        states: [pendingState, uploadingState, processingState, readyState, failedState],
        initialState: pendingState,
        transfers: [
          StateTransfer.create({
            current: pendingState,
            next: uploadingState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'StartUpload'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.fileId })
          }),
          StateTransfer.create({
            current: uploadingState,
            next: processingState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'FinishUpload'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.fileId })
          }),
          StateTransfer.create({
            current: processingState,
            next: readyState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'CompleteProcessing'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.fileId })
          }),
          StateTransfer.create({
            current: uploadingState,
            next: failedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'UploadFailed'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.fileId })
          }),
          StateTransfer.create({
            current: failedState,
            next: uploadingState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'RetryUpload'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.fileId })
          })
        ]
      })
    }),
    Property.create({
      name: 'uploadProgress',
      type: 'number',
      defaultValue: () => 0
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
    }),
    Property.create({
      name: 'thumbnailUrl',
      type: 'string',
      required: false
    }),
    Property.create({
      name: 'retryCount',
      type: 'number',
      defaultValue: () => 0
    }),
    Property.create({
      name: 'lastError',
      type: 'string',
      required: false
    }),
    Property.create({
      name: 'createdAt',
      type: 'string',
      defaultValue: () => new Date().toISOString()
    }),
    Property.create({
      name: 'uploadedAt',
      type: 'string',
      required: false
    })
  ]
})

const UploadSession = Entity.create({
  name: 'UploadSession',
  properties: [
    Property.create({ name: 'id', type: 'string', required: true }),
    Property.create({ name: 'sessionToken', type: 'string', required: true }),
    Property.create({ name: 'presignedUrl', type: 'string', required: true }),
    Property.create({ name: 'expiresAt', type: 'string', required: true }),
    Property.create({
      name: 'isValid',
      type: 'boolean',
      computed: ({ expiresAt }) => new Date(expiresAt) > new Date()
    })
  ]
})

// ========== 关系定义 ==========
const UserFileRelation = Relation.create({
  name: 'UserFileRelation',
  source: User,
  target: File,
  sourceProperty: 'files',
  targetProperty: 'owner',
  type: '1:n'
})

const FileSessionRelation = Relation.create({
  name: 'FileSessionRelation',
  source: File,
  target: UploadSession,
  sourceProperty: 'session',
  targetProperty: 'file',
  type: '1:1'
})

// ========== 交互定义 ==========
const InitiateUpload = Interaction.create({
  name: 'InitiateUpload',
  dataSchema: {
    userId: 'string',
    fileName: 'string',
    fileSize: 'number',
    mimeType: 'string'
  },
  computedData: {
    file: Transform.create({
      name: 'createFile',
      record: File,
      callback: ({ payload }) => ({
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        status: 'pending',
        owner: { id: payload.userId }
      })
    }),
    session: Transform.create({
      name: 'createSession',
      record: UploadSession,
      callback: ({ payload }) => {
        // 在实际应用中，这里会调用 S3 API 生成预签名 URL
        const sessionToken = generateToken()
        const presignedUrl = generatePresignedUrl(payload.fileName)
        const expiresAt = new Date(Date.now() + 3600000).toISOString() // 1 hour
        
        return {
          sessionToken,
          presignedUrl,
          expiresAt,
          file: { id: generatedFileId } // 引用刚创建的文件
        }
      }
    })
  }
})

const UpdateUploadProgress = Interaction.create({
  name: 'UpdateUploadProgress',
  dataSchema: {
    fileId: 'string',
    progress: 'number'
  },
  dataAttributives: {
    uploadProgress: ({ payload }) => payload.progress
  }
})

const CompleteUpload = Interaction.create({
  name: 'CompleteUpload',
  dataSchema: {
    fileId: 'string',
    s3Key: 'string',
    cdnUrl: 'string'
  },
  dataAttributives: {
    s3Key: ({ payload }) => payload.s3Key,
    cdnUrl: ({ payload }) => payload.cdnUrl,
    uploadedAt: () => new Date().toISOString()
  }
})

const ProcessFile = Interaction.create({
  name: 'ProcessFile',
  dataSchema: {
    fileId: 'string'
  },
  computedData: {
    thumbnail: Transform.create({
      name: 'generateThumbnail',
      record: File,
      callback: async ({ payload }) => {
        const file = await getFile(payload.fileId)
        
        // 只为图片生成缩略图
        if (file.mimeType.startsWith('image/')) {
          const thumbnailUrl = await generateThumbnail(file.s3Key)
          return {
            id: file.id,
            thumbnailUrl
          }
        }
        
        return null
      }
    })
  }
})

// ========== Transform 定义 ==========
// 自动开始上传
const AutoStartUpload = Transform.create({
  name: 'autoStartUpload',
  record: InitiateUpload,
  callback: async ({ payload, result }) => {
    // 延迟 100ms 后自动开始上传
    setTimeout(() => {
      controller.callInteraction('StartUpload', {
        payload: { fileId: result.file.id }
      })
    }, 100)
  }
})

// 上传完成后自动处理
const AutoProcessFile = Transform.create({
  name: 'autoProcessFile',
  record: FinishUpload,
  callback: async ({ payload }) => {
    await controller.callInteraction('ProcessFile', {
      payload: { fileId: payload.fileId }
    })
  }
})

// 失败自动重试
const AutoRetryUpload = Transform.create({
  name: 'autoRetryUpload',
  record: UploadFailed,
  callback: async ({ payload }) => {
    const file = await getFile(payload.fileId)
    
    if (file.retryCount < 3) {
      // 指数退避
      const delay = Math.pow(2, file.retryCount) * 1000
      
      setTimeout(() => {
        controller.callInteraction('RetryUpload', {
          payload: { fileId: payload.fileId }
        })
      }, delay)
    }
  }
})
```

### 服务层实现

```typescript
// services/upload.service.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Controller } from 'interaqt'

export class UploadService {
  private s3Client: S3Client
  private controller: Controller
  
  constructor(controller: Controller) {
    this.controller = controller
    this.s3Client = new S3Client({ region: 'us-east-1' })
  }
  
  async initiateUpload(userId: string, file: Express.Multer.File) {
    // 创建文件记录和上传会话
    const result = await this.controller.callInteraction('InitiateUpload', {
      payload: {
        userId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      }
    })
    
    // 生成预签名 URL
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `uploads/${userId}/${result.file.id}/${file.originalname}`,
      ContentType: file.mimetype
    })
    
    const presignedUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600
    })
    
    return {
      fileId: result.file.id,
      sessionToken: result.session.sessionToken,
      presignedUrl
    }
  }
  
  async handleS3Notification(event: S3Event) {
    for (const record of event.Records) {
      const s3Key = record.s3.object.key
      const fileId = extractFileId(s3Key)
      
      if (record.eventName === 's3:ObjectCreated:Put') {
        // 文件上传成功
        await this.controller.callInteraction('FinishUpload', {
          payload: { fileId }
        })
        
        await this.controller.callInteraction('CompleteUpload', {
          payload: {
            fileId,
            s3Key,
            cdnUrl: `${process.env.CDN_URL}/${s3Key}`
          }
        })
      }
    }
  }
  
  async processFile(fileId: string) {
    const file = await this.getFile(fileId)
    
    try {
      // 处理文件（如生成缩略图、提取元数据等）
      if (file.mimeType.startsWith('image/')) {
        const thumbnailUrl = await this.generateThumbnail(file.s3Key)
        
        await this.controller.callInteraction('CompleteProcessing', {
          payload: { fileId }
        })
        
        // 更新缩略图 URL
        await this.storage.update('File', fileId, { thumbnailUrl })
      } else {
        // 其他类型文件直接标记为完成
        await this.controller.callInteraction('CompleteProcessing', {
          payload: { fileId }
        })
      }
    } catch (error) {
      await this.controller.callInteraction('ProcessingFailed', {
        payload: {
          fileId,
          error: error.message
        }
      })
    }
  }
}
```

### API 路由实现

```typescript
// routes/upload.routes.ts
import { FastifyInstance } from 'fastify'
import { UploadService } from '../services/upload.service'

export async function uploadRoutes(app: FastifyInstance) {
  const uploadService = new UploadService(app.controller)
  
  // 初始化上传
  app.post('/api/upload/initiate', async (request, reply) => {
    const { userId } = request.user
    const file = request.file
    
    const result = await uploadService.initiateUpload(userId, file)
    
    return {
      fileId: result.fileId,
      uploadUrl: result.presignedUrl,
      sessionToken: result.sessionToken
    }
  })
  
  // 更新上传进度（客户端调用）
  app.post('/api/upload/progress', async (request, reply) => {
    const { fileId, progress } = request.body
    
    await app.controller.callInteraction('UpdateUploadProgress', {
      payload: { fileId, progress }
    })
    
    return { success: true }
  })
  
  // S3 事件通知 Webhook
  app.post('/webhooks/s3', async (request, reply) => {
    const event = request.body
    
    // 验证 S3 事件签名
    if (!verifyS3Signature(request.headers, event)) {
      return reply.code(401).send({ error: 'Invalid signature' })
    }
    
    await uploadService.handleS3Notification(event)
    
    return { success: true }
  })
  
  // 获取文件列表
  app.get('/api/files', async (request, reply) => {
    const { userId } = request.user
    
    const files = await app.storage.find(
      'File',
      MatchExp.atom({ key: 'owner.id', value: ['=', userId] }),
      undefined,
      ['id', 'fileName', 'fileSize', 'mimeType', 'status', 'cdnUrl', 'thumbnailUrl', 'createdAt']
    )
    
    return { files }
  })
  
  // 重试失败的上传
  app.post('/api/upload/retry/:fileId', async (request, reply) => {
    const { fileId } = request.params
    
    await app.controller.callInteraction('RetryUpload', {
      payload: { fileId }
    })
    
    return { success: true }
  })
}
```

### 前端集成

```typescript
// frontend/upload.tsx
import { useState, useCallback } from 'react'
import axios from 'axios'

export function FileUploader() {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [files, setFiles] = useState([])
  
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true)
    setProgress(0)
    
    try {
      // 1. 初始化上传
      const { data } = await axios.post('/api/upload/initiate', {
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      })
      
      const { fileId, uploadUrl, sessionToken } = data
      
      // 2. 上传到 S3
      await axios.put(uploadUrl, file, {
        headers: {
          'Content-Type': file.type
        },
        onUploadProgress: (event) => {
          const percentCompleted = Math.round(
            (event.loaded * 100) / event.total
          )
          setProgress(percentCompleted)
          
          // 更新服务器端进度
          axios.post('/api/upload/progress', {
            fileId,
            progress: percentCompleted
          })
        }
      })
      
      // 3. 刷新文件列表
      await refreshFiles()
      
    } catch (error) {
      console.error('Upload failed:', error)
      // 显示错误和重试按钮
    } finally {
      setUploading(false)
    }
  }, [])
  
  const refreshFiles = useCallback(async () => {
    const { data } = await axios.get('/api/files')
    setFiles(data.files)
  }, [])
  
  return (
    <div>
      <input
        type="file"
        onChange={(e) => handleUpload(e.target.files[0])}
        disabled={uploading}
      />
      
      {uploading && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
          <span>{progress}%</span>
        </div>
      )}
      
      <div className="file-list">
        {files.map(file => (
          <FileItem key={file.id} file={file} />
        ))}
      </div>
    </div>
  )
}

function FileItem({ file }) {
  const statusColors = {
    pending: 'gray',
    uploading: 'blue',
    processing: 'yellow',
    ready: 'green',
    failed: 'red'
  }
  
  return (
    <div className="file-item">
      {file.thumbnailUrl && (
        <img src={file.thumbnailUrl} alt={file.fileName} />
      )}
      <div>
        <h4>{file.fileName}</h4>
        <span style={{ color: statusColors[file.status] }}>
          {file.status}
        </span>
        {file.status === 'ready' && file.cdnUrl && (
          <a href={file.cdnUrl} download>Download</a>
        )}
        {file.status === 'failed' && (
          <button onClick={() => retryUpload(file.id)}>
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
```

## 完整示例 2：支付处理系统

### 场景描述

实现一个支付处理系统，支持：
- Stripe 支付集成
- 支付状态追踪
- Webhook 事件处理
- 退款处理

### 实体定义

```typescript
// ========== 支付状态定义 ==========
const paymentPendingState = StateNode.create({ name: 'pending' })
const paymentProcessingState = StateNode.create({ name: 'processing' })
const paymentAuthorizedState = StateNode.create({ name: 'authorized' })
const paymentCapturedState = StateNode.create({ name: 'captured' })
const paymentRefundedState = StateNode.create({ name: 'refunded' })
const paymentFailedState = StateNode.create({ name: 'failed' })

// ========== 实体定义 ==========
const Payment = Entity.create({
  name: 'Payment',
  properties: [
    Property.create({ name: 'id', type: 'string', required: true }),
    Property.create({ name: 'amount', type: 'number', required: true }),
    Property.create({ name: 'currency', type: 'string', required: true }),
    Property.create({
      name: 'status',
      type: 'string',
      computed: StateMachine.create({
        name: 'paymentStatusMachine',
        states: [
          paymentPendingState,
          paymentProcessingState,
          paymentAuthorizedState,
          paymentCapturedState,
          paymentRefundedState,
          paymentFailedState
        ],
        initialState: paymentPendingState,
        transfers: [
          StateTransfer.create({
            current: paymentPendingState,
            next: paymentProcessingState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'ProcessPayment'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          }),
          StateTransfer.create({
            current: paymentProcessingState,
            next: paymentAuthorizedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'AuthorizePayment'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          }),
          StateTransfer.create({
            current: paymentAuthorizedState,
            next: paymentCapturedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'CapturePayment'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          }),
          StateTransfer.create({
            current: paymentCapturedState,
            next: paymentRefundedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'RefundPayment'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          }),
          StateTransfer.create({
            current: paymentProcessingState,
            next: paymentFailedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'PaymentFailed'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.paymentId })
          })
        ]
      })
    }),
    Property.create({ name: 'stripePaymentIntentId', type: 'string', required: false }),
    Property.create({ name: 'stripeCustomerId', type: 'string', required: false }),
    Property.create({ name: 'paymentMethodId', type: 'string', required: false }),
    Property.create({ name: 'description', type: 'string', required: false }),
    Property.create({ name: 'metadata', type: 'object', required: false }),
    Property.create({ name: 'failureReason', type: 'string', required: false }),
    Property.create({ name: 'refundAmount', type: 'number', required: false }),
    Property.create({ name: 'refundReason', type: 'string', required: false }),
    Property.create({ name: 'createdAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'authorizedAt', type: 'string', required: false }),
    Property.create({ name: 'capturedAt', type: 'string', required: false }),
    Property.create({ name: 'refundedAt', type: 'string', required: false })
  ]
})

const PaymentEvent = Entity.create({
  name: 'PaymentEvent',
  properties: [
    Property.create({ name: 'id', type: 'string', required: true }),
    Property.create({ name: 'paymentId', type: 'string', required: true }),
    Property.create({ name: 'eventType', type: 'string', required: true }),
    Property.create({ name: 'stripeEventId', type: 'string', required: true }),
    Property.create({ name: 'payload', type: 'object', required: true }),
    Property.create({ name: 'processed', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'receivedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'processedAt', type: 'string', required: false })
  ]
})

// ========== 交互定义 ==========
const CreatePayment = Interaction.create({
  name: 'CreatePayment',
  dataSchema: {
    userId: 'string',
    amount: 'number',
    currency: 'string',
    description: 'string',
    metadata: 'object'
  },
  computedData: {
    payment: Transform.create({
      name: 'createPayment',
      record: Payment,
      callback: ({ payload }) => ({
        amount: payload.amount,
        currency: payload.currency,
        description: payload.description,
        metadata: { ...payload.metadata, userId: payload.userId },
        status: 'pending'
      })
    })
  }
})

const HandleStripeWebhook = Interaction.create({
  name: 'HandleStripeWebhook',
  dataSchema: {
    stripeEventId: 'string',
    eventType: 'string',
    paymentIntentId: 'string',
    payload: 'object'
  },
  computedData: {
    event: Transform.create({
      name: 'createPaymentEvent',
      record: PaymentEvent,
      callback: async ({ payload }) => {
        // 查找对应的支付记录
        const payment = await system.storage.findOne(
          'Payment',
          MatchExp.atom({ 
            key: 'stripePaymentIntentId', 
            value: ['=', payload.paymentIntentId] 
          }),
          undefined,
          ['id']
        )
        
        if (!payment) {
          throw new Error(`Payment not found for intent: ${payload.paymentIntentId}`)
        }
        
        return {
          paymentId: payment.id,
          eventType: payload.eventType,
          stripeEventId: payload.stripeEventId,
          payload: payload.payload
        }
      }
    }),
    processEvent: Transform.create({
      name: 'processPaymentEvent',
      record: PaymentEvent,
      callback: async ({ payload }) => {
        // 根据事件类型触发相应的状态转换
        const eventHandlers = {
          'payment_intent.processing': 'ProcessPayment',
          'payment_intent.succeeded': 'CapturePayment',
          'payment_intent.payment_failed': 'PaymentFailed',
          'charge.refunded': 'RefundPayment'
        }
        
        const interaction = eventHandlers[payload.eventType]
        if (interaction) {
          await controller.callInteraction(interaction, {
            payload: {
              paymentId: createdEvent.paymentId,
              ...payload.payload
            }
          })
        }
      }
    })
  }
})
```

### 服务层实现

```typescript
// services/payment.service.ts
import Stripe from 'stripe'
import { Controller } from 'interaqt'

export class PaymentService {
  private stripe: Stripe
  private controller: Controller
  
  constructor(controller: Controller) {
    this.controller = controller
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    })
  }
  
  async createPaymentIntent(
    userId: string,
    amount: number,
    currency: string,
    description: string
  ) {
    // 创建本地支付记录
    const result = await this.controller.callInteraction('CreatePayment', {
      payload: {
        userId,
        amount,
        currency,
        description,
        metadata: { userId }
      }
    })
    
    // 创建 Stripe PaymentIntent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amount * 100, // Stripe 使用分为单位
      currency,
      description,
      metadata: {
        paymentId: result.payment.id,
        userId
      }
    })
    
    // 更新支付记录
    await this.storage.update('Payment', result.payment.id, {
      stripePaymentIntentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer
    })
    
    // 开始处理支付
    await this.controller.callInteraction('ProcessPayment', {
      payload: { paymentId: result.payment.id }
    })
    
    return {
      paymentId: result.payment.id,
      clientSecret: paymentIntent.client_secret
    }
  }
  
  async handleWebhook(signature: string, payload: string) {
    let event: Stripe.Event
    
    try {
      // 验证 Webhook 签名
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      )
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err.message}`)
    }
    
    // 处理事件
    await this.controller.callInteraction('HandleStripeWebhook', {
      payload: {
        stripeEventId: event.id,
        eventType: event.type,
        paymentIntentId: event.data.object.id,
        payload: event.data.object
      }
    })
    
    return { received: true }
  }
  
  async refundPayment(paymentId: string, amount?: number, reason?: string) {
    const payment = await this.getPayment(paymentId)
    
    if (payment.status !== 'captured') {
      throw new Error('Can only refund captured payments')
    }
    
    // 创建 Stripe 退款
    const refund = await this.stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: amount ? amount * 100 : undefined, // 部分退款
      reason: reason || 'requested_by_customer'
    })
    
    // 更新本地状态
    await this.controller.callInteraction('RefundPayment', {
      payload: {
        paymentId,
        refundAmount: refund.amount / 100,
        refundReason: reason
      }
    })
    
    return {
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status
    }
  }
}
```

## 完整示例 3：邮件发送系统

### 场景描述

实现一个邮件发送系统，支持：
- SendGrid 集成
- 邮件队列管理
- 递送状态追踪
- 模板管理

### 实体定义

```typescript
// ========== 邮件状态定义 ==========
const emailQueuedState = StateNode.create({ name: 'queued' })
const emailSendingState = StateNode.create({ name: 'sending' })
const emailSentState = StateNode.create({ name: 'sent' })
const emailDeliveredState = StateNode.create({ name: 'delivered' })
const emailBouncedState = StateNode.create({ name: 'bounced' })
const emailFailedState = StateNode.create({ name: 'failed' })

const Email = Entity.create({
  name: 'Email',
  properties: [
    Property.create({ name: 'id', type: 'string', required: true }),
    Property.create({ name: 'recipient', type: 'string', required: true }),
    Property.create({ name: 'subject', type: 'string', required: true }),
    Property.create({ name: 'templateId', type: 'string', required: false }),
    Property.create({ name: 'templateData', type: 'object', required: false }),
    Property.create({ name: 'htmlContent', type: 'string', required: false }),
    Property.create({ name: 'textContent', type: 'string', required: false }),
    Property.create({
      name: 'status',
      type: 'string',
      computed: StateMachine.create({
        name: 'emailStatusMachine',
        states: [
          emailQueuedState,
          emailSendingState,
          emailSentState,
          emailDeliveredState,
          emailBouncedState,
          emailFailedState
        ],
        initialState: emailQueuedState,
        transfers: [
          StateTransfer.create({
            current: emailQueuedState,
            next: emailSendingState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'SendEmail'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.emailId })
          }),
          StateTransfer.create({
            current: emailSendingState,
            next: emailSentState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'EmailSent'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.emailId })
          }),
          StateTransfer.create({
            current: emailSentState,
            next: emailDeliveredState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'EmailDelivered'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.emailId })
          }),
          StateTransfer.create({
            current: emailSentState,
            next: emailBouncedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'EmailBounced'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.emailId })
          }),
          StateTransfer.create({
            current: emailSendingState,
            next: emailFailedState,
            trigger: {
              recordName: InteractionEventEntity.name,
              record: {
                interactionName: 'EmailFailed'
              }
            },
            computeTarget: ({ payload }) => ({ id: payload.emailId })
          })
        ]
      })
    }),
    Property.create({ name: 'sendgridMessageId', type: 'string', required: false }),
    Property.create({ name: 'priority', type: 'number', defaultValue: () => 0 }),
    Property.create({ name: 'retryCount', type: 'number', defaultValue: () => 0 }),
    Property.create({ name: 'lastError', type: 'string', required: false }),
    Property.create({ name: 'queuedAt', type: 'string', defaultValue: () => new Date().toISOString() }),
    Property.create({ name: 'sentAt', type: 'string', required: false }),
    Property.create({ name: 'deliveredAt', type: 'string', required: false }),
    Property.create({ name: 'openedAt', type: 'string', required: false }),
    Property.create({ name: 'clickedAt', type: 'string', required: false })
  ]
})
```

## 最佳实践总结

### 1. 状态管理

**原则**：
- 使用 StateMachine 管理所有异步操作状态
- 为每个关键时间点定义 StateNode
- 通过 Interaction 触发状态转换

**示例**：
```typescript
// 好的做法：清晰的状态定义
const states = {
  pending: StateNode.create({ name: 'pending' }),
  processing: StateNode.create({ name: 'processing' }),
  completed: StateNode.create({ name: 'completed' }),
  failed: StateNode.create({ name: 'failed' })
}

// 避免：在属性中硬编码状态逻辑
Property.create({
  name: 'status',
  type: 'string',
  defaultValue: () => 'pending'  // 应该使用 StateMachine
})
```

### 2. 错误处理

**原则**：
- 区分暂时性错误和永久性错误
- 实现指数退避重试
- 记录详细的错误信息

**示例**：
```typescript
// 重试机制
const RetryWithBackoff = Transform.create({
  name: 'retryWithBackoff',
  record: OperationFailed,
  callback: async ({ payload }) => {
    const resource = await getResource(payload.resourceId)
    
    if (resource.retryCount < MAX_RETRIES) {
      const delay = Math.min(
        INITIAL_DELAY * Math.pow(2, resource.retryCount),
        MAX_DELAY
      )
      
      setTimeout(() => {
        controller.callInteraction('RetryOperation', {
          payload: { resourceId: payload.resourceId }
        })
      }, delay)
    } else {
      // 标记为永久失败
      await controller.callInteraction('MarkAsFailed', {
        payload: {
          resourceId: payload.resourceId,
          reason: 'Max retries exceeded'
        }
      })
    }
  }
})
```

### 3. Webhook 处理

**原则**：
- 验证签名确保安全
- 实现幂等处理
- 记录所有事件用于审计

**示例**：
```typescript
// Webhook 处理器
async function handleWebhook(signature: string, payload: object) {
  // 1. 验证签名
  if (!verifySignature(signature, payload)) {
    throw new Error('Invalid signature')
  }
  
  // 2. 检查幂等性
  const existing = await storage.findOne(
    'WebhookEvent',
    MatchExp.atom({ key: 'externalEventId', value: ['=', payload.id] })
  )
  
  if (existing) {
    return { processed: true, duplicate: true }
  }
  
  // 3. 创建事件记录
  await controller.callInteraction('RecordWebhookEvent', {
    payload: {
      externalEventId: payload.id,
      eventType: payload.type,
      payload: payload
    }
  })
  
  // 4. 处理事件
  await controller.callInteraction('ProcessWebhookEvent', {
    payload: { eventId: event.id }
  })
  
  return { processed: true }
}
```

### 4. 批量处理

**原则**：
- 使用队列管理批量操作
- 控制并发数避免过载
- 实现优先级队列

**示例**：
```typescript
class BatchProcessor {
  async processBatch(items: any[], concurrency: number = 5) {
    const queue = [...items]
    const active = new Map<string, Promise<void>>()
    const results = []
    
    while (queue.length > 0 || active.size > 0) {
      // 启动新任务
      while (active.size < concurrency && queue.length > 0) {
        const item = queue.shift()!
        const promise = this.processItem(item)
          .then(result => {
            results.push({ item, result })
            active.delete(item.id)
          })
          .catch(error => {
            results.push({ item, error })
            active.delete(item.id)
          })
        
        active.set(item.id, promise)
      }
      
      // 等待至少一个完成
      if (active.size > 0) {
        await Promise.race(active.values())
      }
    }
    
    return results
  }
}
```

### 5. 监控和可观测性

**原则**：
- 记录所有状态变化
- 实现性能指标收集
- 设置合理的告警

**示例**：
```typescript
// 监控 Transform
const MonitoringTransform = Transform.create({
  name: 'monitoring',
  record: [StartSync, CompleteSync, FailSync],
  callback: async ({ record, payload }) => {
    // 记录指标
    metrics.increment(`sync.${record.name}`)
    
    if (record.name === 'CompleteSync') {
      const duration = Date.now() - startTime
      metrics.histogram('sync.duration', duration)
    }
    
    if (record.name === 'FailSync') {
      // 发送告警
      await alerting.send({
        level: 'error',
        message: `Sync failed for resource ${payload.resourceId}`,
        details: payload.error
      })
    }
  }
})
```

### 6. 测试策略

**原则**：
- 模拟外部服务响应
- 测试各种失败场景
- 验证状态转换正确性

**示例**：
```typescript
describe('FileUpload', () => {
  it('should handle upload failure and retry', async () => {
    // 模拟 S3 失败
    mockS3.upload.mockRejectedValueOnce(new Error('Network error'))
    mockS3.upload.mockResolvedValueOnce({ Location: 'https://...' })
    
    // 初始化上传
    await controller.callInteraction('InitiateUpload', {
      payload: { fileName: 'test.pdf', fileSize: 1000 }
    })
    
    // 验证初始状态
    let file = await storage.findOne('File', 
      MatchExp.atom({ key: 'fileName', value: ['=', 'test.pdf'] }),
      undefined,
      ['status', 'retryCount']
    )
    expect(file.status).toBe('pending')
    
    // 触发上传失败
    await controller.callInteraction('StartUpload', {
      payload: { fileId: file.id }
    })
    
    // 验证失败状态
    file = await storage.findOne('File',
      MatchExp.atom({ key: 'id', value: ['=', file.id] }),
      undefined,
      ['status', 'retryCount']
    )
    expect(file.status).toBe('failed')
    expect(file.retryCount).toBe(1)
    
    // 触发重试
    await controller.callInteraction('RetryUpload', {
      payload: { fileId: file.id }
    })
    
    // 验证成功状态
    file = await storage.findOne('File',
      MatchExp.atom({ key: 'id', value: ['=', file.id] }),
      undefined,
      ['status']
    )
    expect(file.status).toBe('ready')
  })
})
```

## 总结

这些示例展示了如何在 interaqt 框架中优雅地处理外部资源同步。关键要点：

1. **使用 StateMachine** 管理复杂的状态流转
2. **通过 Interaction** 触发所有操作，保持响应式
3. **利用 Transform** 实现自动化的副作用处理
4. **记录详细的事件** 用于审计和调试
5. **实现健壮的错误处理** 包括重试和补偿
6. **设计清晰的服务层** 隔离外部依赖

通过这种方式，我们可以构建可维护、可测试、可观测的外部资源同步系统。
