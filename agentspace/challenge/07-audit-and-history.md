# 审计与历史状态管理挑战

## 业务场景：数据审计与合规要求

### 具体需求

#### 1. 金融审计要求
- **交易记录追溯**：每笔交易的完整生命周期，包括所有状态变更
- **余额变化历史**：账户余额的每次变动记录，支持任意时点查询
- **操作审计日志**：谁在什么时间做了什么操作，修改了哪些数据
- **数据不可篡改**：历史记录一旦生成不能被修改或删除
- **监管报告**：生成特定时期的合规报告

#### 2. 医疗数据管理
- **病历版本管理**：患者病历的每次修改都要保留历史版本
- **处方变更记录**：药物剂量调整的完整历史
- **诊断演进追踪**：诊断结论的变化过程
- **医生操作记录**：每个医生的每次操作都要有详细记录

#### 3. 电商业务审计
- **价格变化历史**：商品价格的历史变化，支持价保政策
- **库存变动记录**：库存的每次进出记录，支持盘点对账
- **订单状态追踪**：订单的完整状态变迁历史
- **用户行为分析**：用户行为的时间序列分析

### 当前框架的挑战

#### 1. 响应式计算只关注当前状态
```javascript
// 当前的响应式计算
const User = Entity.create({
  properties: [
    Property.create({
      name: 'accountBalance',
      computedData: WeightedSummation.create({
        record: TransactionRelation,
        callback: (transaction) => ({
          weight: 1,
          value: transaction.amount
        })
      })
    })
  ]
});

// ❌ 问题：
// 1. 只能计算当前余额，无法查询历史任意时点的余额
// 2. 如果要查询"2023年12月31日的余额"，框架无法支持
// 3. 响应式计算会覆盖之前的结果，历史状态丢失
```

#### 2. 缺乏时间版本概念
```javascript
// 商品价格的历史变化
const Product = Entity.create({
  properties: [
    Property.create({
      name: 'currentPrice',
      computedData: Transform.create({
        record: PriceUpdateEvent,
        callback: (priceEvents) => {
          // ❌ 问题：
          // 1. 只能获取最新价格，历史价格信息丢失
          // 2. 无法查询"商品在某个时间段的价格"
          // 3. 价格调整的原因、操作人等上下文信息缺失
          
          const latestEvent = priceEvents.sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
          )[0];
          return latestEvent?.price || 0;
        }
      })
    })
  ]
});
```

#### 3. 无法追溯计算过程
```javascript
// 用户VIP等级计算
const User = Entity.create({
  properties: [
    Property.create({
      name: 'vipLevel',
      computedData: Transform.create({
        record: UserOrderRelation,
        callback: (orders) => {
          // ❌ 问题：
          // 1. 只能看到最终的VIP等级，看不到计算依据
          // 2. 如果规则发生变化，无法知道历史等级是如何计算的
          // 3. 用户质疑等级时，无法提供计算过程的证明
          
          const totalSpent = orders.reduce((sum, order) => sum + order.amount, 0);
          if (totalSpent > 100000) return 'diamond';
          if (totalSpent > 50000) return 'gold';
          return 'silver';
        }
      })
    })
  ]
});

// 缺少的信息：
// - 什么时候升级到gold级别的？
// - 升级时的消费总额是多少？
// - 升级依据的是哪些订单？
// - 使用的是哪个版本的规则？
```

#### 4. 数据删除和修正的问题
```javascript
// 订单取消的处理
const CancelOrder = Interaction.create({
  name: 'CancelOrder',
  action: Action.create({ name: 'cancelOrder' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'orderId', base: Order, isRef: true })
    ]
  })
});

const OrderStatus = Transform.create({
  record: InteractionEvent,
  callback: (event) => {
    if (event.interactionName === 'CancelOrder') {
      // ❌ 问题：
      // 1. 订单状态从'pending'变为'cancelled'，但中间状态丢失
      // 2. 无法知道订单在什么时候、为什么被取消
      // 3. 如果后来发现取消错误，无法恢复到之前的状态
      return { status: 'cancelled', cancelledAt: new Date() };
    }
  }
});
```

### 为什么困难

1. **响应式计算的实时性与历史保存冲突**
   - 响应式系统专注于当前最新状态
   - 历史状态保存需要额外的存储和管理机制
   - 两者的设计目标不一致

2. **存储成本和查询复杂度**
   - 保存所有历史状态会大幅增加存储需求
   - 历史查询的性能优化复杂
   - 需要专门的时间序列数据结构

3. **计算规则的版本管理**
   - 业务规则可能随时间变化
   - 需要记录每个时期使用的规则版本
   - 历史数据的重算问题

4. **数据一致性和完整性**
   - 历史数据不能被篡改
   - 需要数字签名或区块链等技术保证
   - 跨系统的数据一致性难以维护

### 当前的权宜之计

#### 1. 手动记录历史
```javascript
// 在业务逻辑中手动保存历史记录
const PriceHistory = Entity.create({
  name: 'PriceHistory',
  properties: [
    Property.create({ name: 'productId' }),
    Property.create({ name: 'oldPrice' }),
    Property.create({ name: 'newPrice' }),
    Property.create({ name: 'changedAt' }),
    Property.create({ name: 'changedBy' }),
    Property.create({ name: 'reason' })
  ]
});

// 问题：
// 1. 需要在每个修改价格的地方都手动记录
// 2. 容易遗漏，数据不完整
// 3. 增加了业务逻辑的复杂度
```

#### 2. 事件溯源模式
```javascript
// 保存所有的 InteractionEvent
// 通过重放事件来重建历史状态
// 问题：
// 1. 重放成本很高
// 2. 计算规则变化时重放结果可能不一致
// 3. 事件数据量巨大
```

#### 3. 快照机制
```javascript
// 定期保存系统状态快照
// 问题：
// 1. 快照间隔内的状态无法查询
// 2. 存储成本高
// 3. 快照一致性难以保证
```

### 理想的解决方案（框架增强）

1. **时间版本化计算**
```javascript
// 假设的时间版本支持
Property.create({
  name: 'accountBalance',
  computedData: TemporalComputation.create({
    record: TransactionRelation,
    timeField: 'timestamp',
    computation: WeightedSummation.create({
      callback: (transaction) => ({
        weight: 1,
        value: transaction.amount
      })
    }),
    history: {
      retention: '7 years',
      snapshots: 'daily'
    }
  })
});

// 支持时间点查询
const balanceAt2023 = await system.getPropertyAt(
  user.id, 
  'accountBalance', 
  new Date('2023-12-31')
);
```

2. **审计日志自动化**
```javascript
// 假设的审计支持
const AuditableProperty = Property.create({
  name: 'vipLevel',
  computedData: Transform.create({
    record: UserOrderRelation,
    callback: (orders) => calculateVipLevel(orders)
  }),
  audit: {
    enabled: true,
    includeInputs: true,
    includeCalculationDetails: true,
    retention: 'forever'
  }
});

// 自动生成审计记录：
// - 什么时候计算的
// - 输入数据是什么
// - 使用的计算规则版本
// - 计算的中间步骤
// - 最终结果
```

3. **不可变历史记录**
```javascript
// 假设的不可变存储支持
Property.create({
  name: 'medicalDiagnosis',
  computedData: ImmutableTransform.create({
    record: DiagnosisEvent,
    callback: (events) => generateDiagnosis(events),
    immutable: true,
    signature: 'digital'  // 数字签名保证不可篡改
  })
});
```

4. **计算规则版本管理**
```javascript
// 假设的规则版本支持
const VipLevelRules = VersionedComputation.create({
  name: 'VipLevelCalculation',
  versions: [
    {
      version: 'v1.0',
      effectiveFrom: '2023-01-01',
      effectiveTo: '2023-06-30',
      computation: Transform.create({
        callback: (orders) => oldVipLevelLogic(orders)
      })
    },
    {
      version: 'v2.0', 
      effectiveFrom: '2023-07-01',
      computation: Transform.create({
        callback: (orders) => newVipLevelLogic(orders)
      })
    }
  ]
});
```

### 真实业务影响

审计和历史管理在很多行业都是强制要求：

1. **监管合规**：金融、医疗等行业的法律要求
2. **争议解决**：用户质疑时需要提供历史证据
3. **数据分析**：业务趋势分析需要历史数据
4. **系统恢复**：故障时需要回滚到历史状态
5. **安全调查**：安全事件的取证分析

## 相关业务场景

- **电商**：价格变化、库存变动、订单状态、用户等级变化
- **社交**：内容编辑历史、关系变化、权限调整
- **内容**：文档版本管理、发布历史、审核记录
- **OA**：审批流程、权限变更、考勤记录、薪资调整

## 可能的缓解策略

1. **分层存储**：当前数据用响应式，历史数据用专门存储
2. **事件溯源**：记录所有事件，支持状态重建
3. **定期快照**：在关键时点保存系统状态
4. **外部审计系统**：专门的审计日志系统
5. **区块链技术**：保证历史记录的不可篡改性

## 技术方向

1. **时间序列数据库**：InfluxDB、TimescaleDB等专门存储
2. **事件溯源框架**：EventStore、Apache Kafka等
3. **版本控制系统**：Git-like的数据版本管理
4. **区块链技术**：分布式账本技术
5. **数据湖架构**：支持海量历史数据的存储和查询