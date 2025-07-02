# 外部系统集成挑战

## 业务场景：支付与第三方服务集成

### 具体需求
1. **支付网关回调**：支付宝/微信支付异步通知订单支付成功
2. **物流状态同步**：从物流公司API获取包裹运输状态更新
3. **库存同步**：与ERP系统实时同步商品库存数据
4. **风控检查**：调用第三方征信API进行用户信用评估
5. **短信发送状态**：短信服务商的发送结果回调

### 当前框架的挑战

#### 1. 外部事件不受框架控制
```javascript
// 当前框架只能处理用户主动触发的 Interaction
const PlaceOrder = Interaction.create({
  name: 'PlaceOrder',
  action: Action.create({ name: 'placeOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'amount', required: true }),
      PayloadItem.create({ name: 'paymentMethod', required: true })
    ]
  })
});

// ❌ 问题：支付网关的回调不是用户 Interaction
// 支付成功的通知来自支付宝服务器，不是用户操作
// 框架无法直接处理这种外部异步事件
```

#### 2. 异步状态管理复杂
```javascript
// 订单状态的复杂性：
// 1. 用户下单 -> pending
// 2. 调用支付网关 -> processing  
// 3. 等待支付结果...
// 4. 支付网关回调 -> paid (这一步不是用户交互)

const Order = Entity.create({
  properties: [
    Property.create({
      name: 'status',
      computation: StateMachine.create({
        states: ['pending', 'processing', 'paid', 'failed'],
        transitions: [
          { from: 'pending', to: 'processing', on: PaymentSubmit },
          // ❌ 问题：无法表达外部回调触发的状态转换
          { from: 'processing', to: 'paid', on: ??? } // 支付回调不是 Interaction
        ]
      })
    })
  ]
});
```

#### 3. 第三方API的不确定性
```javascript
// 风控检查的挑战
const User = Entity.create({
  properties: [
    Property.create({
      name: 'creditScore',
      computation: Transform.create({
        record: InteractionEvent,
        callback: async (event) => {
          if (event.interactionName === 'CreateUser') {
            // ❌ 问题：
            // 1. 第三方API可能失败
            // 2. 响应时间不确定
            // 3. 需要重试机制
            // 4. 可能需要人工审核兜底
            const score = await creditAPI.check(event.user.idCard);
            return score;
          }
        }
      })
    })
  ]
});
```

### 为什么困难

1. **控制权在外部**
   - 第三方系统的回调时机不可控
   - 可能有延迟、失败、重复等问题
   - 框架无法预测和控制这些事件

2. **异步性与响应式的冲突**
   - 响应式计算期望同步或可预期的异步
   - 第三方回调的时间完全不确定
   - 可能永远不会到达

3. **错误处理复杂**
   - 第三方服务可能失败
   - 需要重试、降级、人工处理等机制
   - 响应式计算难以表达这种复杂的错误处理

4. **幂等性问题**
   - 第三方回调可能重复发送
   - 需要防重处理
   - 状态可能需要回滚

### 当前的解决方案局限

#### 1. 包装为虚拟 Interaction
```javascript
// 权宜之计：将外部事件包装成 Interaction
const PaymentCallback = Interaction.create({
  name: 'PaymentCallback',
  action: Action.create({ name: 'paymentCallback' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', required: true }),
      PayloadItem.create({ name: 'status', required: true })
    ]
  })
});

// 问题：需要外部系统来"调用"这个 Interaction
// 失去了类型安全和业务语义
```

#### 2. 轮询机制
```javascript
// 定时轮询第三方状态
// 问题：
// 1. 实时性差
// 2. 资源浪费
// 3. 增加第三方系统压力
```

### 理想的解决方案（框架增强）

1. **外部事件桥接器**
```javascript
// 假设的外部事件支持
const PaymentWebhook = ExternalEvent.create({
  name: 'PaymentSuccess',
  source: 'alipay',
  mapping: {
    orderId: 'out_trade_no',
    amount: 'total_amount',
    status: 'trade_status'
  }
});

const Order = Entity.create({
  properties: [
    Property.create({
      name: 'status',
      computation: StateMachine.create({
        transitions: [
          { from: 'processing', to: 'paid', on: PaymentWebhook }
        ]
      })
    })
  ]
});
```

2. **异步计算状态管理**
```javascript
// 假设的异步计算支持
Property.create({
  name: 'creditScore',
  computation: AsyncTransform.create({
    trigger: CreateUserInteraction,
    externalCall: async (user) => {
      return await creditAPI.check(user.idCard);
    },
    timeout: 30000,
    retry: 3,
    fallback: 'manual_review'
  })
})
```

### 真实业务影响

这类挑战在实际业务中非常常见：

1. **支付流程**：几乎所有电商都需要处理支付回调
2. **物流跟踪**：订单状态需要实时更新
3. **库存管理**：多渠道销售需要库存同步
4. **消息推送**：短信、邮件发送状态跟踪
5. **第三方认证**：OAuth、实名认证等

## 相关业务场景

- **电商**：支付回调、物流更新、库存同步、价格监控
- **社交**：第三方登录、内容审核、推送服务
- **内容**：CDN回调、转码状态、审核结果
- **OA**：邮件发送、文档转换、外部审批系统