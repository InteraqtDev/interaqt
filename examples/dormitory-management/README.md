# 宿舍管理系统示例

这是一个使用 @interaqt/runtime 框架构建的宿舍管理系统示例，展示了如何使用响应式编程和声明式方式构建复杂的业务系统。

## 系统概述

该系统模拟了学校宿舍管理的核心业务流程，包括：
- 宿舍分配与管理
- 学生入住申请流程
- 宿舍长管理制度
- 积分考核系统
- 违纪处理流程

## 核心实体

### 1. User（用户）
- 支持两种角色：admin（管理员）和 student（学生）
- 包含计算属性如 `isAdmin`、`hasActiveDormitory`、`totalScore` 等

### 2. Dormitory（宿舍）
- 包含楼栋、房间号、容量等基本信息
- 自动计算当前入住人数、是否已满、可用床位等

### 3. DormitoryMember（宿舍成员）
- 连接用户和宿舍的关系实体
- 记录床位号、角色（普通成员/宿舍长）、状态等

### 4. DormitoryApplication（入住申请）
- 管理学生申请入住宿舍的流程
- 包含多个状态：pending、leader_approved、admin_approved、rejected、cancelled

### 5. ScoreRecord（积分记录）
- 记录宿舍成员的加分/扣分情况
- 支持多种类别：hygiene（卫生）、discipline（纪律）等

### 6. KickRequest（踢出申请）
- 宿舍长申请踢出违纪成员的流程
- 需要管理员最终审批

## 业务流程

### 1. 入住申请流程
```
学生申请 → 宿舍长审批 → 管理员最终审批 → 创建宿舍成员关系
```

### 2. 积分管理
- 宿舍长可以给成员加分或扣分
- 成员总积分自动计算
- 积分低于-50分时标记为"踢出风险"

### 3. 踢出成员流程
```
宿舍长发起申请 → 管理员审批 → 更新成员状态
```

## 技术特点

### 1. 响应式计算
系统大量使用了响应式计算属性：
- `Count`：计算关联实体数量
- `WeightedSummation`：条件计数和求和
- `Every`/`Any`：检查所有/任意关联实体是否满足条件

### 2. 权限控制
使用 `Attributive` 实现细粒度的权限控制：
- 管理员权限：创建宿舍、分配成员、最终审批
- 宿舍长权限：审批申请、记录积分、申请踢出成员
- 学生权限：申请入住、取消申请

### 3. 数据一致性
通过关系和计算属性自动维护数据一致性：
- 宿舍入住人数自动更新
- 成员积分自动汇总
- 状态变更自动触发相关更新

## 运行测试

```bash
# 安装依赖
npm install

# 运行测试
npm run test:dormitory-management

# 或运行简化测试
npm test -- examples/dormitory-management/tests/simple.test.ts
```

## 项目结构

```
dormitory-management/
├── src/
│   ├── entities.ts          # 实体定义
│   ├── entities-computed.ts # 计算属性定义
│   ├── relations.ts         # 关系定义
│   ├── interactions.ts      # 交互定义
│   ├── activities.ts        # 活动定义（说明）
│   └── index.ts            # 导出入口
├── tests/
│   ├── simple.test.ts      # 简化测试（使用直接的存储操作）
│   ├── basic.test.ts       # 基础功能测试
│   ├── activity.test.ts    # 活动流程测试
│   └── test-utils.ts       # 测试工具函数
├── requirement.md          # 需求文档
├── IMPLEMENTATION_NOTES.md # 实现笔记
└── README.md              # 本文档
```

## 使用说明

### 1. 直接使用存储层操作

由于 @interaqt/runtime 框架的交互（Interaction）主要用于定义接口和权限，实际的数据操作需要通过存储层直接进行：

```typescript
// 创建用户
const user = await system.storage.create('User', {
  name: '张三',
  role: 'student'
});

// 更新数据
await system.storage.update('DormitoryApplication', 
  BoolExp.atom({ key: 'id', value: ['=', applicationId] }),
  { status: 'approved' }
);

// 查询数据（需要指定返回字段）
const dormitory = await system.storage.findOne('Dormitory',
  MatchExp.atom({ key: 'id', value: ['=', dormId] }),
  undefined,
  ['*']  // 返回所有字段
);
```

### 2. 响应式计算

系统中的许多属性会自动计算和更新：

```typescript
// 当创建宿舍成员关系时
await system.storage.create('DormitoryMember', {
  user: student,
  dormitory: dormitory,
  status: 'active'
});

// 以下属性会自动更新：
// - dormitory.currentOccupancy（当前入住人数）
// - dormitory.availableBeds（可用床位）
// - user.hasActiveDormitory（用户是否有活跃宿舍）
```

### 3. 查询注意事项

使用框架的查询功能时需要注意：
- 必须使用 `MatchExp` 或 `BoolExp` 构建查询条件
- 查询时最好指定要返回的字段（使用 `['*']` 返回所有字段）
- 计算属性可能不会在创建时立即可用，需要重新查询

## 已知限制

1. **交互的业务逻辑**：框架的 Interaction 主要用于定义接口，实际的业务逻辑需要通过其他方式实现（如直接操作存储层）。

2. **活动流程**：框架的 Activity 要求严格的单一起始和结束节点，对于复杂的非线性流程可能不太适用。

3. **计算属性的限制**：
   - `Count` 只能计算总数，不支持条件过滤
   - 复杂的条件计数需要使用 `WeightedSummation`
   - `Any`/`Every` 必须指定 `attributeQuery`

## 高级功能

### 状态机实现

在 `entities-computed.ts` 中，我们为 `DormitoryMember` 的 `status` 属性实现了状态机：

```typescript
const memberStatusStateMachine = StateMachine.create({
  states: [activeState, kickedState],
  transfers: [activeToKickedTransfer],
  defaultState: activeState
})
```

这个状态机定义了成员状态的自动转换规则：
- 当管理员批准踢出申请时（触发 `ApproveKickRequest` 交互），对应成员的状态会自动从 `active` 转换为 `kicked`
- 状态机通过监听交互事件，自动维护数据的一致性

**注意**: 完整的状态机功能需要运行时环境的支持。在简化的测试中，我们只测试了基本的数据操作功能。

## 测试覆盖

项目包含完整的测试套件 (`tests/simple.test.ts`)，覆盖了：
- 基本的 CRUD 操作
- 宿舍申请流程
- 积分管理系统
- 踢出申请处理（不包含状态机自动更新）

运行测试：
```bash
npm test
```

## 总结

这个示例展示了如何使用 @interaqt/runtime 框架构建一个功能完整的宿舍管理系统。虽然框架在某些方面有限制，但其响应式编程模型和声明式的设计方式能够有效地简化复杂业务逻辑的实现。 