# 复杂业务规则引擎挑战

## 业务场景：电商优惠券与定价系统

### 具体需求

#### 1. 优惠券叠加规则
- **店铺券 + 平台券**：可同时使用，但有优先级
- **满减券 + 折扣券**：不能同时使用
- **新用户券**：只能与指定商品券叠加
- **VIP专享券**：与其他券互斥
- **时间限制**：特定时间段的券有不同叠加规则

#### 2. 动态定价策略
- **会员等级定价**：黄金会员9.5折，钻石会员9折
- **批量购买阶梯价**：买2件9折，买5件8折，买10件7折
- **地区差异化定价**：一线城市+10%，三线城市-5%
- **竞品价格联动**：自动调整到比竞品低5%
- **库存紧急定价**：库存<10时涨价20%

#### 3. 积分兑换规则
- **积分抵现比例**：普通商品1:0.01，奢侈品1:0.005
- **积分上限**：单笔订单最多抵扣30%
- **积分来源权重**：购物积分权重1.0，签到积分权重0.5
- **积分有效期**：不同来源积分有不同有效期
- **积分冻结规则**：退货后积分需冻结7天

### 当前框架的挑战

#### 1. 规则优先级和冲突解决
```javascript
// 当前框架难以表达复杂的规则优先级
const Order = Entity.create({
  properties: [
    Property.create({
      name: 'finalPrice',
      computedData: Transform.create({
        record: OrderItemRelation,
        callback: (orderItems, context) => {
          // ❌ 问题：如何处理多种优惠券的组合？
          const appliedCoupons = context.coupons;
          
          // 复杂的业务逻辑：
          // 1. 检查券的有效性和使用条件
          // 2. 确定券的优先级和互斥关系
          // 3. 计算最优的券组合
          // 4. 应用会员折扣
          // 5. 检查库存影响价格
          // 6. 应用地区定价策略
          
          // 这种复杂逻辑难以用声明式方式表达
          let price = basePrice;
          
          // 券的应用顺序很重要，但难以在声明式中表达
          for (const coupon of appliedCoupons) {
            if (canApplyCoupon(coupon, context)) {
              price = applyCoupon(price, coupon);
            }
          }
          
          return price;
        }
      })
    })
  ]
});
```

#### 2. 条件复杂度爆炸
```javascript
// 积分抵扣的复杂规则
const Order = Entity.create({
  properties: [
    Property.create({
      name: 'pointsDiscount',
      computedData: Transform.create({
        record: UserPointsRelation,
        callback: (userPoints, context) => {
          // ❌ 问题：条件判断过于复杂
          const { order, user } = context;
          
          // 1. 检查积分类型和权重
          const availablePoints = userPoints.filter(point => {
            return point.status === 'active' && 
                   point.expiryDate > new Date() &&
                   point.source !== 'refund_frozen';
          });
          
          // 2. 计算抵扣比例（基于商品类型）
          const ratio = order.items.every(item => item.category === 'luxury') 
            ? 0.005 : 0.01;
          
          // 3. 检查抵扣上限（基于用户等级和订单金额）
          const maxDiscountRatio = user.vipLevel === 'diamond' ? 0.5 : 0.3;
          const maxDiscount = order.totalAmount * maxDiscountRatio;
          
          // 4. 应用积分有效期权重
          let totalDiscount = 0;
          for (const point of availablePoints) {
            const weight = getPointWeight(point.source, point.earnedDate);
            const discount = Math.min(point.value * ratio * weight, 
                                    maxDiscount - totalDiscount);
            totalDiscount += discount;
            if (totalDiscount >= maxDiscount) break;
          }
          
          return totalDiscount;
        }
      })
    })
  ]
});
```

#### 3. 规则的动态性和可配置性
```javascript
// ❌ 问题：业务规则经常变化，但代码中硬编码
const couponRules = {
  // 这些规则应该能动态配置，而不是写死在代码中
  'NEWUSER': {
    canStackWith: ['PRODUCT_SPECIFIC'],
    cannotStackWith: ['VIP_EXCLUSIVE', 'PLATFORM_GENERAL'],
    maxUsagePerUser: 1,
    validCategories: ['electronics', 'books']
  },
  'VIP_EXCLUSIVE': {
    canStackWith: [],
    requiresVipLevel: 'gold',
    discountRate: 0.15
  }
  // 规则变化时需要修改代码和重新部署
};
```

### 为什么困难

1. **命令式逻辑难以声明式表达**
   - 复杂的条件判断和分支逻辑
   - 规则之间的相互依赖和影响
   - 计算顺序很重要（折扣应用的先后顺序）

2. **规则组合的复杂性**
   - N个规则可能有2^N种组合
   - 需要处理冲突和优先级
   - 某些组合可能产生意外结果

3. **性能考虑**
   - 复杂规则计算可能很慢
   - 需要缓存和优化
   - 实时价格计算的响应时间要求

4. **业务变化频繁**
   - 营销活动经常调整规则
   - 需要支持A/B测试不同规则
   - 规则配置需要非技术人员也能操作

### 当前解决方案的局限

#### 1. 巨大的 Transform 函数
```javascript
// 所有复杂逻辑都塞在一个 Transform 中
// 问题：
// 1. 难以测试和维护
// 2. 无法复用
// 3. 性能问题
// 4. 不支持动态配置
```

#### 2. 多个相互依赖的计算
```javascript
// 试图拆分成多个计算，但依赖关系复杂
Property.create({
  name: 'memberDiscount',
  computedData: Transform.create({...})
}),
Property.create({
  name: 'couponDiscount',
  computedData: Transform.create({
    // 依赖 memberDiscount 的结果
    // 但计算顺序难以保证
  })
}),
Property.create({
  name: 'finalPrice',
  computedData: Transform.create({
    // 依赖所有前面的计算
    // 复杂度仍然很高
  })
})
```

### 理想的解决方案（框架增强）

1. **规则引擎集成**
```javascript
// 假设的规则引擎支持
const PricingRules = RuleEngine.create({
  name: 'OrderPricing',
  rules: [
    Rule.create({
      name: 'VipDiscount',
      condition: 'user.vipLevel >= "gold"',
      action: 'price = price * 0.9',
      priority: 100
    }),
    Rule.create({
      name: 'BulkDiscount',
      condition: 'quantity >= 5',
      action: 'price = price * 0.85',
      priority: 90
    })
  ],
  conflictResolution: 'priority'
});

Property.create({
  name: 'finalPrice',
  computedData: RuleBasedComputation.create({
    ruleEngine: PricingRules,
    input: ['basePrice', 'quantity', 'user', 'coupons']
  })
});
```

2. **可配置的业务规则**
```javascript
// 假设的配置化规则支持
const CouponRules = ConfigurableRules.create({
  source: 'database', // 从数据库读取规则配置
  type: 'coupon_stacking',
  refreshInterval: '5m'
});
```

### 真实业务影响

这类复杂规则在电商中极其常见且重要：

1. **直接影响收入**：定价策略错误可能造成巨大损失
2. **用户体验**：优惠券使用体验影响转化率
3. **运营效率**：规则调整的灵活性影响营销活动效果
4. **系统稳定性**：复杂计算可能影响性能

## 相关业务场景

- **电商**：定价策略、优惠券系统、会员权益、库存定价
- **社交**：内容推荐算法、用户等级体系、积分体系
- **内容**：付费内容定价、广告竞价、创作者分成
- **OA**：审批流程规则、权限控制规则、考勤计算规则

## 可能的缓解策略

1. **规则外置**：将复杂规则放在专门的规则引擎中
2. **分层计算**：将复杂规则拆分成多个简单的响应式计算
3. **预计算**：对常见场景进行预计算和缓存
4. **混合架构**：复杂规则用传统方式，简单计算用响应式