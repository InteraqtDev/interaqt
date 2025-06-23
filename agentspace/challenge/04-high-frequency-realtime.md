# 高频实时场景挑战

## 业务场景：秒杀与高频交易

### 具体需求

#### 1. 秒杀系统
- **库存扣减**：1000个商品，10万人同时抢购，确保不超卖
- **限购控制**：每人限购1件，需要实时检查用户购买记录
- **防刷机制**：识别和阻止机器人刷单
- **队列管理**：超出库存的请求需要排队或直接拒绝
- **回滚处理**：支付失败后需要立即释放库存

#### 2. 实时竞拍
- **出价记录**：毫秒级记录每次出价，确保顺序正确
- **价格更新**：当前最高价需要实时推送给所有参与者
- **竞拍结束**：精确到秒的结束时间控制
- **自动出价**：用户设置最高价，系统自动跟价

#### 3. 金融交易
- **订单撮合**：买卖订单的实时匹配
- **价格计算**：基于成交量的实时价格更新
- **风控检查**：实时检查用户资金和持仓
- **市场数据**：毫秒级的行情数据推送

### 当前框架的挑战

#### 1. 响应式计算的延迟
```javascript
// 秒杀库存扣减的问题
const Product = Entity.create({
  properties: [
    Property.create({
      name: 'remainingStock',
      computedData: WeightedSummation.create({
        record: OrderItemRelation,
        callback: (orderItem) => ({
          weight: -1,
          value: orderItem.quantity
        })
      })
    })
  ]
});

// ❌ 问题：
// 1. 响应式计算不是同步的
// 2. 在高并发下，多个用户可能同时看到相同的库存数
// 3. 计算结果更新有延迟，可能导致超卖
// 4. 无法在库存不足时立即阻止下单
```

#### 2. 并发控制困难
```javascript
// 秒杀下单的并发问题
const PlaceSecKillOrder = Interaction.create({
  name: 'PlaceSecKillOrder',
  action: Action.create({ name: 'placeSecKillOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'productId', base: Product, isRef: true }),
      PayloadItem.create({ name: 'quantity', required: true })
    ]
  })
});

// 当前框架无法在 Interaction 层面进行并发控制
// Transform 计算时库存可能已经被其他请求扣减
const OrderCreation = Transform.create({
  record: InteractionEvent,
  callback: (event) => {
    if (event.interactionName === 'PlaceSecKillOrder') {
      // ❌ 问题：这里无法原子性地检查库存并扣减
      // 1. 检查库存时可能还有库存
      // 2. 创建订单时库存可能已经不足
      // 3. 多个并发请求可能都通过检查
      
      const product = getProduct(event.payload.productId);
      if (product.remainingStock >= event.payload.quantity) {
        // 这里有竞态条件！
        return createOrder(event);
      }
      return null;
    }
  }
});
```

#### 3. 实时性要求与响应式计算的冲突
```javascript
// 竞拍出价的实时性问题
const Auction = Entity.create({
  properties: [
    Property.create({
      name: 'currentHighestBid',
      computedData: Transform.create({
        record: BidRelation,
        callback: (bids) => {
          // ❌ 问题：
          // 1. 这个计算不是实时的
          // 2. 新的出价可能需要等待计算完成才能看到结果
          // 3. 在高频出价时，计算可能跟不上
          return Math.max(...bids.map(bid => bid.amount));
        }
      })
    })
  ]
});
```

#### 4. 事务性保证缺失
```javascript
// 库存扣减需要事务性保证
// 当前框架无法保证以下操作的原子性：
// 1. 检查库存
// 2. 检查用户限购
// 3. 扣减库存
// 4. 创建订单
// 5. 扣减用户余额

// 如果任何一步失败，前面的操作需要回滚
// 但响应式计算难以表达这种事务性需求
```

### 为什么困难

1. **响应式计算的异步性**
   - 计算结果更新不是瞬时的
   - 存在计算延迟和传播延迟
   - 高并发时延迟更明显

2. **缺乏原子性保证**
   - 响应式计算是数据流驱动的
   - 无法保证多个操作的原子性
   - 竞态条件难以避免

3. **状态一致性问题**
   - 高频更新时状态可能不一致
   - 读取和写入之间存在时间窗口
   - 多个并发修改可能冲突

4. **性能瓶颈**
   - 响应式计算有计算开销
   - 复杂的依赖关系影响性能
   - 数据库操作可能成为瓶颈

### 当前的权宜之计

#### 1. 预扣库存
```javascript
// 在用户加购物车时预扣库存
// 问题：
// 1. 库存利用率低
// 2. 用户可能不下单
// 3. 需要定时释放
```

#### 2. 队列机制
```javascript
// 将秒杀请求放入队列，串行处理
// 问题：
// 1. 失去了响应式的优势
// 2. 增加了系统复杂度
// 3. 延迟增加
```

#### 3. 乐观锁
```javascript
// 使用版本号进行乐观锁控制
// 问题：
// 1. 高并发下冲突率很高
// 2. 需要大量重试
// 3. 用户体验差
```

### 理想的解决方案（框架增强）

1. **原子性响应式操作**
```javascript
// 假设的原子性支持
const SecKillOrder = AtomicInteraction.create({
  name: 'PlaceSecKillOrder',
  atomicChecks: [
    AtomicCheck.create({
      name: 'stockCheck',
      condition: 'product.stock >= quantity',
      action: 'product.stock -= quantity'
    }),
    AtomicCheck.create({
      name: 'limitCheck',
      condition: 'user.secKillOrderCount < 1',
      action: 'user.secKillOrderCount += 1'
    })
  ],
  rollback: 'automatic'
});
```

2. **实时响应式计算**
```javascript
// 假设的实时计算支持
Property.create({
  name: 'currentPrice',
  computedData: RealtimeTransform.create({
    record: TradeRelation,
    latency: 'microsecond',
    consistency: 'strong'
  })
});
```

3. **优先级计算**
```javascript
// 假设的优先级支持
Property.create({
  name: 'stockCount',
  computedData: PriorityComputation.create({
    priority: 'critical',
    isolation: 'serializable'
  })
});
```

### 真实业务影响

这类高频实时场景对业务极其重要：

1. **用户体验**：延迟和错误直接影响用户满意度
2. **商业损失**：超卖可能导致巨大的经济损失
3. **技术信誉**：系统崩溃会影响平台信誉
4. **监管风险**：金融场景的错误可能触发监管问题

## 相关业务场景

- **电商**：秒杀、限时抢购、库存管理、价格战
- **社交**：热门内容排序、实时互动、直播打赏
- **内容**：热搜实时排名、播放量统计、广告竞价
- **OA**：资源预定、会议室管理、审批时效

## 可能的缓解策略

1. **混合架构**：关键路径用传统技术，非关键用响应式
2. **预计算**：提前计算可能的结果
3. **缓存层**：多级缓存减少计算延迟
4. **分片策略**：将热点数据分散到多个节点
5. **降级方案**：高负载时关闭部分响应式计算

## 技术方向

1. **内存计算**：将关键数据放在内存中计算
2. **流式处理**：使用流处理引擎处理高频事件
3. **分布式锁**：保证关键操作的原子性
4. **事件溯源**：记录所有事件，支持回放和恢复