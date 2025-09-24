# 消息通信抽象设计

## 设计理念

本设计遵循以下核心原则：
- **最小化**：每个抽象只负责一个核心概念
- **正交性**：抽象之间相互独立，可自由组合
- **灵活性**：能够构造各种复杂的通信场景
- **可扩展**：易于添加新的功能而不破坏现有抽象

## 核心抽象

### 1. Identity（身份）

最基础的抽象，代表任何可以参与通信的实体。

```typescript
interface Identity {
  id: string
  type: 'user' | 'system' | 'bot' | string  // 可扩展的类型
}
```

**设计理由**：
- 不仅限于用户，可以表示系统、机器人或任何其他实体
- 类型系统允许区分不同种类的参与者

### 2. Channel（通道）

通信发生的逻辑空间，是消息传递的载体。

```typescript
interface Channel {
  id: string
  type: 'direct' | 'group' | 'broadcast' | 'topic' | string
  metadata?: Record<string, any>
}
```

**设计理由**：
- 统一了一对一、群组、广播等不同通信模式
- 元数据支持灵活的扩展（如群组名称、主题等）

### 3. Membership（成员关系）

描述身份与通道之间的关系。

```typescript
interface Membership {
  identity: Identity
  channel: Channel
  role?: 'owner' | 'admin' | 'member' | 'observer' | string
  permissions?: string[]
  joinedAt: Date
  metadata?: Record<string, any>
}
```

**设计理由**：
- 将成员关系作为独立实体，支持复杂的权限管理
- 可以轻松实现不同的访问控制模型

### 4. Message（消息）

通信的基本单位。

```typescript
interface Message {
  id: string
  channel: Channel
  sender: Identity
  content: Content
  timestamp: Date
  metadata?: Record<string, any>
}

interface Content {
  type: 'text' | 'image' | 'file' | 'reaction' | 'system' | string
  data: any
}
```

**设计理由**：
- 内容类型可扩展，支持各种消息格式
- 元数据支持消息级别的扩展（如已读状态、引用等）

### 5. Delivery（投递）

描述消息如何到达接收者。

```typescript
interface Delivery {
  message: Message
  recipient: Identity
  status: 'pending' | 'delivered' | 'read' | 'failed'
  deliveredAt?: Date
  readAt?: Date
  metadata?: Record<string, any>
}
```

**设计理由**：
- 将投递状态与消息本身分离，支持更复杂的投递逻辑
- 可以实现消息的个性化投递（如免打扰、过滤等）

## 组合模式示例

### 1. 一对一聊天

```typescript
// 创建直接通道
const directChannel: Channel = {
  id: 'ch_123',
  type: 'direct'
}

// 两个用户加入
const membership1: Membership = {
  identity: { id: 'user1', type: 'user' },
  channel: directChannel,
  role: 'member',
  joinedAt: new Date()
}

const membership2: Membership = {
  identity: { id: 'user2', type: 'user' },
  channel: directChannel,
  role: 'member',
  joinedAt: new Date()
}

// 发送消息
const message: Message = {
  id: 'msg_456',
  channel: directChannel,
  sender: { id: 'user1', type: 'user' },
  content: { type: 'text', data: 'Hello!' },
  timestamp: new Date()
}
```

### 2. 群组聊天

```typescript
// 创建群组通道
const groupChannel: Channel = {
  id: 'ch_group_789',
  type: 'group',
  metadata: {
    name: '项目讨论组',
    description: '项目相关讨论'
  }
}

// 多个成员，不同角色
const ownerMembership: Membership = {
  identity: { id: 'user1', type: 'user' },
  channel: groupChannel,
  role: 'owner',
  permissions: ['manage_members', 'delete_messages'],
  joinedAt: new Date()
}

const memberMembership: Membership = {
  identity: { id: 'user2', type: 'user' },
  channel: groupChannel,
  role: 'member',
  joinedAt: new Date()
}
```

### 3. 系统通知

```typescript
// 广播通道
const broadcastChannel: Channel = {
  id: 'ch_broadcast_system',
  type: 'broadcast',
  metadata: { scope: 'all_users' }
}

// 系统身份发送
const systemMessage: Message = {
  id: 'msg_system_001',
  channel: broadcastChannel,
  sender: { id: 'system', type: 'system' },
  content: { 
    type: 'system', 
    data: { 
      event: 'maintenance',
      message: '系统将于今晚维护'
    }
  },
  timestamp: new Date()
}
```

### 4. 消息回复与线程

通过元数据实现：

```typescript
const replyMessage: Message = {
  id: 'msg_reply_123',
  channel: groupChannel,
  sender: { id: 'user2', type: 'user' },
  content: { type: 'text', data: '我同意这个观点' },
  timestamp: new Date(),
  metadata: {
    replyTo: 'msg_original_456',  // 回复的消息ID
    threadId: 'thread_789'         // 线程ID
  }
}
```

### 5. 消息反应（Reaction）

```typescript
const reactionMessage: Message = {
  id: 'msg_reaction_001',
  channel: groupChannel,
  sender: { id: 'user3', type: 'user' },
  content: { 
    type: 'reaction',
    data: {
      targetMessage: 'msg_456',
      emoji: '👍'
    }
  },
  timestamp: new Date()
}
```

## 高级场景

### 1. 临时/阅后即焚消息

```typescript
const ephemeralMessage: Message = {
  id: 'msg_ephemeral_123',
  channel: directChannel,
  sender: { id: 'user1', type: 'user' },
  content: { type: 'text', data: '这条消息10秒后消失' },
  timestamp: new Date(),
  metadata: {
    ephemeral: true,
    ttl: 10000  // 10秒
  }
}
```

### 2. 频道订阅模式

```typescript
// 主题频道
const topicChannel: Channel = {
  id: 'ch_topic_tech',
  type: 'topic',
  metadata: {
    topic: 'technology',
    public: true
  }
}

// 订阅者以观察者身份加入
const subscriberMembership: Membership = {
  identity: { id: 'user_subscriber', type: 'user' },
  channel: topicChannel,
  role: 'observer',
  permissions: ['read'],  // 只读权限
  joinedAt: new Date(),
  metadata: {
    subscriptionType: 'digest',  // 摘要订阅
    frequency: 'daily'
  }
}
```

### 3. 机器人集成

```typescript
// 机器人身份
const botIdentity: Identity = {
  id: 'bot_assistant',
  type: 'bot'
}

// 机器人加入群组
const botMembership: Membership = {
  identity: botIdentity,
  channel: groupChannel,
  role: 'member',
  permissions: ['read', 'write', 'execute_commands'],
  joinedAt: new Date(),
  metadata: {
    capabilities: ['translate', 'summarize', 'remind']
  }
}

// 命令消息
const commandMessage: Message = {
  id: 'msg_command_123',
  channel: groupChannel,
  sender: { id: 'user1', type: 'user' },
  content: { 
    type: 'text', 
    data: '/translate 你好'
  },
  timestamp: new Date(),
  metadata: {
    mentions: ['bot_assistant'],
    isCommand: true
  }
}
```

### 4. 跨通道转发

```typescript
// 转发消息到另一个通道
const forwardedMessage: Message = {
  id: 'msg_forward_456',
  channel: targetChannel,
  sender: { id: 'user1', type: 'user' },
  content: originalMessage.content,
  timestamp: new Date(),
  metadata: {
    forwarded: true,
    originalMessage: originalMessage.id,
    originalChannel: originalMessage.channel.id
  }
}
```

## 扩展机制

### 1. 自定义通道类型

```typescript
// 客服通道
const supportChannel: Channel = {
  id: 'ch_support_001',
  type: 'support',
  metadata: {
    priority: 'high',
    assignedAgent: 'agent_123',
    ticket: 'TICKET-456'
  }
}
```

### 2. 自定义消息类型

```typescript
// 投票消息
const pollMessage: Message = {
  id: 'msg_poll_789',
  channel: groupChannel,
  sender: { id: 'user1', type: 'user' },
  content: {
    type: 'poll',
    data: {
      question: '下次会议时间？',
      options: ['周一上午', '周二下午', '周三上午'],
      multipleChoice: false,
      deadline: new Date('2024-01-20')
    }
  },
  timestamp: new Date()
}
```

### 3. 权限扩展

```typescript
// 细粒度权限控制
const moderatorMembership: Membership = {
  identity: { id: 'user_mod', type: 'user' },
  channel: groupChannel,
  role: 'moderator',
  permissions: [
    'read',
    'write',
    'delete_others_messages',
    'pin_messages',
    'mute_members',
    'kick_members'
  ],
  joinedAt: new Date()
}
```

## 实现考虑

### 1. 存储模型

- **Identity**: 独立表，支持多种类型的实体
- **Channel**: 独立表，通过type字段区分不同类型
- **Membership**: 关联表，连接Identity和Channel
- **Message**: 独立表，引用Channel和Identity
- **Delivery**: 关联表，跟踪消息投递状态

### 2. 查询优化

- 为常见查询创建索引（如按时间查询消息）
- 使用分区策略处理大量消息
- 缓存活跃的Membership关系

### 3. 实时性

- 使用WebSocket或SSE推送新消息
- 发布/订阅模式处理消息分发
- 考虑使用消息队列处理高并发

## 总结

这套抽象设计具有以下优势：

1. **简单性**：只有5个核心抽象，易于理解和实现
2. **灵活性**：可以组合出各种复杂的通信场景
3. **可扩展性**：通过metadata和type系统支持无限扩展
4. **正交性**：每个抽象独立完整，互不依赖
5. **通用性**：适用于即时通讯、论坛、客服、协作等多种场景

通过这些基础抽象的组合，可以构建出：
- 即时通讯应用
- 企业协作平台
- 客服系统
- 社交网络
- IoT设备通信
- 游戏内聊天系统
- 等等...

这种设计让开发者能够快速构建符合特定需求的通信系统，同时保持代码的清晰和可维护性。
