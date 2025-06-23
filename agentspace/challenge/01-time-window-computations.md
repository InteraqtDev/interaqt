# 时间窗口计算挑战

## 业务场景：电商营销指标

### 具体需求
1. **滑动窗口统计**：计算用户"过去7天的购买次数"、"本月累计消费金额"
2. **时间衰减权重**：计算商品"热度分数"，近期购买权重更高（如：今天权重1.0，昨天0.9，前天0.8...）
3. **连续性指标**：判断用户是否为"连续7天活跃用户"
4. **周期性重置**：每月积分清零，VIP等级重新计算

### 当前框架的挑战

#### 1. 缺乏时间窗口概念
```javascript
// 当前框架的局限性：只能基于事件驱动计算
const User = Entity.create({
  properties: [
    Property.create({
      name: 'totalOrders',
      computedData: Count.create({
        record: UserOrderRelation  // ✅ 能做：总订单数
      })
    }),
    Property.create({
      name: 'last7DaysOrders',
      computedData: Count.create({
        record: UserOrderRelation,
        // ❌ 问题：无法表达"过去7天"的时间窗口
        // 框架缺乏时间窗口的内置支持
        callback: (order) => {
          // 这里的时间判断会有问题：
          // 1. 什么时候重新计算？
          // 2. 如何处理时间的流逝？
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          return new Date(order.createdAt) > sevenDaysAgo;
        }
      })
    })
  ]
});
```

#### 2. 时间流逝不是"事件"
```javascript
// 问题：时间的流逝本身不产生 Interaction
// 但"过去7天"的定义每天都在变化

// 比如用户在1月1日下了订单
// 在1月8日时，这个订单应该不再计入"过去7天"
// 但没有任何事件触发这个重新计算
```

### 为什么困难

1. **响应式计算依赖事件触发**
   - 框架的响应式计算是事件驱动的
   - 时间的流逝不产生 InteractionEvent
   - 无法自动触发"过期"计算

2. **缺乏定时器/调度机制**
   - 没有内置的定时重新计算机制
   - 无法表达"每天凌晨重新计算"

3. **历史状态的复杂性**
   - 需要维护多个时间点的状态快照
   - 滑动窗口需要持续更新边界

### 可能的解决方案（框架扩展）

1. **引入时间窗口计算类型**
```javascript
// 假设的时间窗口支持
Property.create({
  name: 'last7DaysOrders',
  computedData: TimeWindowCount.create({
    record: UserOrderRelation,
    window: { days: 7 },
    scheduler: 'daily'  // 每天重新计算
  })
})
```

2. **定时任务集成**
```javascript
// 假设的定时任务支持
Property.create({
  name: 'monthlyActiveScore',
  computedData: ScheduledComputation.create({
    record: UserActivityRelation,
    schedule: 'monthly',
    reset: true  // 每月重置
  })
})
```

### 当前的权宜之计

1. **外部定时任务**：通过外部定时器定期触发虚拟 Interaction
2. **近似计算**：使用更粗粒度的时间窗口（如按天分组）
3. **混合架构**：时间相关计算放在框架外部处理

## 相关业务场景

- **电商**：用户活跃度、商品热度、促销效果分析
- **社交**：用户互动频率、内容热度衰减
- **内容**：阅读趋势、热门内容排序
- **OA**：员工考勤统计、项目进度跟踪