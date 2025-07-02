# 场景问题与解答

## 问题：请假系统中的条件触发备忘录

**场景描述**：在请假系统中，如果一个用户一个月内已经请假过3次，就要记录一个备忘信息给总监。

**传统思维的错误处理方式**：
```javascript
// ❌ 错误：试图在请假时"计算"和"触发"
async function submitLeaveRequest(userId, leaveData) {
  // 1. 创建请假记录
  const leave = await createLeave(userId, leaveData);
  
  // 2. 查询本月请假次数
  const thisMonth = getThisMonthRange();
  const leaveCount = await db.query(`
    SELECT COUNT(*) FROM leaves 
    WHERE userId = ? AND createdAt BETWEEN ? AND ?
  `, [userId, thisMonth.start, thisMonth.end]);
  
  // 3. 如果超过3次，创建备忘录
  if (leaveCount >= 3) {
    await createMemoForDirector(userId, `用户${userId}本月已请假${leaveCount}次`);
  }
}
```

**问题分析**：
- 手动触发逻辑，容易遗漏
- 业务逻辑分散，难以维护
- 无法自动追踪状态变化
- 数据一致性问题

## 解答：声明式的 interaqt 方案

### 核心思维转换

将"当用户请假超过3次时触发备忘录"转换为**声明备忘录的存在性**：

> **备忘录存在**，当且仅当用户在当月的请假次数 ≥ 3

### 完整实现方案

#### 1. 定义基础实体

```typescript
// 用户实体
const User = Entity.create({
  name: 'User',
  properties: [
    Property.create({ name: 'username', type: 'string' }),
    Property.create({ name: 'email', type: 'string' }),
    Property.create({ name: 'department', type: 'string' })
  ]
});

// 请假实体
const LeaveRequest = Entity.create({
  name: 'LeaveRequest',
  properties: [
    Property.create({ name: 'startDate', type: 'string' }),
    Property.create({ name: 'endDate', type: 'string' }),
    Property.create({ name: 'reason', type: 'string' }),
    Property.create({ name: 'status', type: 'string' }), // pending, approved, rejected
    Property.create({ name: 'createdAt', type: 'string' })
  ]
});

// 总监备忘录实体
const DirectorMemo = Entity.create({
  name: 'DirectorMemo',
  properties: [
    Property.create({ name: 'content', type: 'string' }),
    Property.create({ name: 'priority', type: 'string' }),
    Property.create({ name: 'month', type: 'string' }), // YYYY-MM 格式
    Property.create({ name: 'createdAt', type: 'string' })
  ]
});
```

#### 2. 定义关系

```typescript
// 用户-请假关系
const UserLeaveRelation = Relation.create({
  source: User,
  sourceProperty: 'leaveRequests',
  target: LeaveRequest,
  targetProperty: 'user',
  type: '1:n'
});

// 用户-备忘录关系
const UserMemoRelation = Relation.create({
  source: User,
  sourceProperty: 'memos',
  target: DirectorMemo,
  targetProperty: 'user',
  type: '1:n'
});
```

#### 3. 关键：声明用户本月请假次数

```typescript
// 在用户实体上添加本月请假次数的计算属性
User.properties.push(
  Property.create({
    name: 'currentMonthLeaveCount',
    type: 'number',
    defaultValue: () => 0,
    computation: Count.create({
      record: UserLeaveRelation,
      attributeQuery: [['target', { attributeQuery: ['createdAt', 'status'] }]],
      callback: function(relation) {
        const leave = relation.target;
        
        // 只计算已批准的请假
        if (leave.status !== 'approved') return false;
        
        // 判断是否在当月
        const leaveDate = new Date(leave.createdAt);
        const currentDate = new Date();
        
        return leaveDate.getFullYear() === currentDate.getFullYear() &&
               leaveDate.getMonth() === currentDate.getMonth();
      }
    })
  })
);
```

#### 4. 核心：声明备忘录的存在条件

```typescript
// 备忘录的存在完全基于用户的请假次数
const MemoGenerationComputed = createClass({
  name: 'MemoGenerationComputed'
});

class MemoGenerationComputation implements DataBasedComputation {
  state = {}
  dataDeps: {[key: string]: DataDep} = {
    users: {
      type: 'records',
      source: User,
      attributeQuery: ['username', 'currentMonthLeaveCount']
    }
  }
  
  constructor(
    public controller: Controller, 
    public args: KlassInstance<typeof MemoGenerationComputed>, 
    public dataContext: DataContext
  ) {}
  
  async compute(deps: {users: any[]}, context: any) {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const memosToGenerate = [];
    
    for (const user of deps.users) {
      // 声明：当用户本月请假 >= 3次时，备忘录应该存在
      if (user.currentMonthLeaveCount >= 3) {
        memosToGenerate.push({
          userId: user.id,
          content: `${user.username} 本月已请假 ${user.currentMonthLeaveCount} 次，请关注`,
          priority: 'high',
          month: currentMonth,
          createdAt: new Date().toISOString()
        });
      }
    }
    
    return memosToGenerate;
  }
}

// 注册计算处理器
ComputationHandle.Handles.set(MemoGenerationComputed, {
  global: MemoGenerationComputation
});

// 定义全局备忘录字典
const directorMemos = Dictionary.create({
  name: 'directorMemos',
  type: 'object',
  collection: true,
  computation: MemoGenerationComputed.create({})
});
```

#### 5. 最佳方案：从请假交互数据中 Transform 出备忘录

这才是 interaqt 框架的核心思想！备忘录数据应该从用户的请假交互数据中直接 transform 出来：

```typescript
// 定义请假交互
const SubmitLeaveRequestInteraction = Interaction.create({
  name: 'submitLeaveRequest',
  action: Action.create({ name: 'create' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({
        name: 'leaveData',
        base: LeaveRequest,
        required: true
      })
    ]
  })
});

// 关键：DirectorMemo 从请假交互数据中 Transform 出来
DirectorMemo.computation = Transform.create({
  record: InteractionEventEntity, // 从交互数据转换
  attributeQuery: ['interactionName', 'payload', 'user', 'createdAt'],
  dataDeps: {
    users: {
      type: 'records',
      source: User,
      attributeQuery: ['username', 'currentMonthLeaveCount']
    }
  },
  callback: (interactionEvents: any[], dataDeps: any) => {
    // Transform 的本质：声明数据转换关系
    // 输入：请假交互数据 + 用户状态数据
    // 输出：符合条件的备忘录数据
    
    return interactionEvents
      .filter(event => event.interactionName === 'submitLeaveRequest')
      .map(event => {
        const user = dataDeps.users.find(u => u.id === event.user.id);
        if (!user) return null;
        
        const currentMonth = new Date(event.createdAt).toISOString().slice(0, 7);
        
        // 声明转换条件：当用户本月请假次数 >= 3 时，交互数据转换为备忘录数据
        if (user.currentMonthLeaveCount >= 3) {
          return {
            content: `${user.username} 本月第 ${user.currentMonthLeaveCount} 次请假，需要总监关注`,
            priority: user.currentMonthLeaveCount >= 5 ? 'urgent' : 'high',
            month: currentMonth,
            createdAt: event.createdAt,
            triggerEventId: event.id // 数据血缘关系
          };
        }
        
        // 不满足转换条件时返回 null（表示该交互数据不转换为备忘录）
        return null;
      })
      .filter(memo => memo !== null);
  }
});

// 或者更精确地，直接在关系上定义 Transform
UserMemoRelation.computation = Transform.create({
  record: InteractionEventEntity,
  attributeQuery: ['interactionName', 'payload', 'user', 'createdAt'],
  dataDeps: {
    userLeaveCount: {
      type: 'records', 
      source: User,
      attributeQuery: ['currentMonthLeaveCount']
    }
  },
  callback: (events: any[], dataDeps: any) => {
    const relations = [];
    
    const leaveSubmissions = events.filter(e => e.interactionName === 'submitLeaveRequest');
    
    for (const event of leaveSubmissions) {
      const user = dataDeps.userLeaveCount.find(u => u.id === event.user.id);
      
      // 声明关系转换条件：如果用户已请假 >= 3次，交互数据转换为用户-备忘录关系
      if (user && user.currentMonthLeaveCount >= 3) {
        relations.push({
          source: event.user.id,
          target: {
            content: `${event.user.username} 本月第 ${user.currentMonthLeaveCount} 次请假`,
            priority: 'high',
            month: new Date(event.createdAt).toISOString().slice(0, 7),
            createdAt: event.createdAt
          }
        });
      }
      // 如果 < 3次，不转换关系（返回空，相当于 null）
    }
    
    return relations;
  }
});
```

#### 6. 实时监控方案（可选）

```typescript
// 使用 RealTime 计算进行实时监控
User.properties.push(
  Property.create({
    name: 'needsDirectorAttention',
    type: 'boolean',
    defaultValue: () => false,
    computation: RealTime.create({
      nextRecomputeTime: (now: number) => 3600000, // 每小时检查一次
      dataDeps: {
        _current: {
          type: 'property',
          attributeQuery: ['currentMonthLeaveCount']
        }
      },
      callback: async (now: Expression, dataDeps: any) => {
        const leaveCount = dataDeps._current?.currentMonthLeaveCount || 0;
        return Expression.number(leaveCount).gt(2); // >= 3次时需要关注
      }
    })
  })
);
```

### 方案优势对比

#### 为什么从交互数据 Transform 是最佳方案？

**核心理念对比**：

| 方案 | 思维模式 | 特点 |
|------|---------|------|
| ❌ 传统方式 | "当请假时检查并创建备忘录" | 命令式，需要手动触发 |
| ⚠️ 从用户状态计算 | "备忘录存在当用户请假≥3次" | 声明式但基于状态汇总 |
| ✅ **从交互数据 Transform** | **"每个请假交互数据，如果满足条件就转换为备忘录数据"** | **完全符合 interaqt 数据转换理念** |

#### 1. **真正的数据转换关系**
```typescript
// ✅ 正确：备忘录数据是请假交互数据的转换结果
DirectorMemo.computation = Transform.create({
  record: InteractionEventEntity, // 从交互数据转换
  callback: (interactionEvents) => {
    // 声明转换关系：每个请假交互数据都可能转换为备忘录数据
    return interactionEvents
      .filter(event => event.interactionName === 'submitLeaveRequest')
      .map(event => {
        // 转换条件：如果满足就返回备忘录数据，否则返回 null
        if (shouldCreateMemo(event)) {
          return createMemoData(event);
        }
        return null; // Transform 支持返回 null，表示不转换
      })
      .filter(memo => memo !== null); // 过滤掉不转换的数据
  }
});
```

#### 2. **业务语义精确**
- **每次请假**都是一个独立的交互数据
- **每次请假**的交互数据都需要检查是否转换为提醒数据
- **备忘录**是特定请假交互数据的转换结果，而不是用户状态的副产品

#### 3. **数据血缘清晰**
```typescript
// 每个备忘录都能追溯到具体的请假交互数据
{
  id: 'memo_123',
  content: '张三本月第3次请假',
  triggerEventId: 'leave_event_456', // 明确的数据血缘：来源于哪个交互数据
  createdAt: '2023-12-15T10:30:00Z'
}
```

#### 4. **完美的业务对应**
- 用户每次请假 → 一个交互数据
- 如果需要提醒 → Transform 将交互数据转换为备忘录数据
- 如果不需要提醒 → Transform 返回 null（不转换）

#### 5. **自然的扩展性**
```typescript
// 可以轻松扩展更复杂的业务规则
callback: (interactionEvents, dataDeps) => {
  return interactionEvents
    .filter(event => event.interactionName === 'submitLeaveRequest')
    .map(event => {
      const user = dataDeps.users.find(u => u.id === event.user.id);
      
      // 不同条件转换为不同类型的备忘录数据
      if (user.currentMonthLeaveCount >= 5) {
        return { type: 'urgent', content: '频繁请假警告', ... };
      } else if (user.currentMonthLeaveCount >= 3) {
        return { type: 'attention', content: '请假次数提醒', ... };
      } else if (isConsecutiveLeave(event, user)) {
        return { type: 'consecutive', content: '连续请假提醒', ... };
      }
      
      return null; // 正常情况不转换为备忘录
    })
    .filter(memo => memo !== null);
}
```

### 扩展场景

#### 处理更复杂的业务规则

```typescript
// 如果需要更复杂的规则：连续请假、不同类型请假等
User.properties.push(
  Property.create({
    name: 'leaveAnalysis',
    type: 'object',
    defaultValue: () => ({}),
    computation: Transform.create({
      record: UserLeaveRelation,
      attributeQuery: [['target', { attributeQuery: ['startDate', 'endDate', 'reason', 'status', 'createdAt'] }]],
      callback: (leaves: any[]) => {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const thisMonthLeaves = leaves.filter(leave => 
          leave.target.status === 'approved' &&
          leave.target.createdAt.startsWith(currentMonth)
        );
        
        return {
          totalCount: thisMonthLeaves.length,
          sickLeaves: thisMonthLeaves.filter(l => l.target.reason === 'sick').length,
          personalLeaves: thisMonthLeaves.filter(l => l.target.reason === 'personal').length,
          consecutiveDays: calculateConsecutiveDays(thisMonthLeaves),
          needsAttention: thisMonthLeaves.length >= 3 || calculateConsecutiveDays(thisMonthLeaves) >= 7
        };
      }
    })
  })
);

// 基于分析结果生成不同类型的备忘录
const generateMemoContent = (user: any) => {
  const analysis = user.leaveAnalysis;
  
  if (analysis.consecutiveDays >= 7) {
    return `${user.username} 本月连续请假 ${analysis.consecutiveDays} 天，建议关注健康状况`;
  }
  
  if (analysis.sickLeaves >= 2) {
    return `${user.username} 本月病假 ${analysis.sickLeaves} 次，建议关注工作环境`;
  }
  
  return `${user.username} 本月已请假 ${analysis.totalCount} 次，请关注出勤情况`;
};
```

### 关键理解

#### 核心认知转换

1. **不要思考"何时触发"，而要思考"从哪里 Transform"**
   - ❌ 错误：什么时候创建备忘录？
   - ✅ 正确：备忘录从哪个数据源 Transform 出来？

2. **每个数据都有其"数据血缘"**
   - 备忘录来自请假事件
   - 请假统计来自请假记录
   - 所有数据都能追溯到源头

3. **Transform 的 null 返回是核心特性**
   - 不满足条件时返回 null = 不转换数据
   - 满足条件时返回数据对象 = 转换为新数据
   - 这是声明式条件转换的完美体现

4. **交互驱动 vs 状态驱动的选择**
   - 交互驱动：每次交互数据都检查转换（适合需要即时响应的场景）
   - 状态驱动：基于当前状态数据转换（适合状态汇总的场景）
   - 本案例中，备忘录需要即时提醒，所以交互驱动更合适

#### 深层原理

**为什么从交互数据 Transform 更符合 interaqt 理念？**

```typescript
// interaqt 的核心：数据从数据转换而来，而不是通过程序化的处理
用户请假交互数据 → Transform → 请假记录数据 + (条件满足时)备忘录数据

// 而不是：
请假记录数据的累积 → 程序化计算 → 备忘录状态
```

这种方法完美体现了 interaqt 框架的核心思想：**声明式的数据转换关系**，而不是命令式的数据处理。交互数据是业务的起点，可能转换为多种业务数据，这种一对多的 Transform 关系正是声明式数据建模的精髓。

**关键理解**：Transform 不是传统的"事件回调"，而是**数据转换规则的声明**。框架会自动维护这种转换关系，当源数据变化时，目标数据会自动更新。