# 实体和关系设计文档

## 概述
基于需求分析和测试用例，设计宿舍管理系统的实体和关系结构。

---

## 实体设计

### 1. User 实体
**目的**: 系统中的所有用户（管理员、宿舍长、学生）

**属性**:
- `id`: string (系统生成的唯一标识符)  
- `name`: string (用户姓名)
- `email`: string (邮箱地址，唯一标识)
- `role`: string (用户角色: 'admin'/'dormHead'/'student')
- `status`: string (用户状态: 'active'/'kicked', 默认'active')
- `createdAt`: number (创建时间戳)

**业务含义**: 
- 所有用户共用一个实体，通过role字段区分权限
- status字段用于管理被踢出的学生状态
- email作为唯一标识，用于登录验证

### 2. Dormitory 实体  
**目的**: 宿舍建筑的基本信息

**属性**:
- `id`: string (宿舍唯一标识符)
- `name`: string (宿舍名称，如"A栋101")
- `capacity`: number (床位总数，限制4-6)
- `createdAt`: number (创建时间戳)

**业务含义**:
- 每个宿舍有固定数量的床位
- capacity用于业务规则验证
- 宿舍的实际使用情况通过关系和计算属性获得

### 3. Bed 实体
**目的**: 宿舍内的具体床位

**属性**:
- `id`: string (床位唯一标识符)
- `number`: number (床位号，1-6)
- `createdAt`: number (创建时间戳)

**业务含义**:
- 每个床位在宿舍内有唯一编号
- 床位的占用状态通过关系确定
- 支持精确的床位分配管理

### 4. DeductionRule 实体
**目的**: 扣分规则的定义

**属性**:
- `id`: string (规则唯一标识符)
- `name`: string (规则名称，如"晚归")
- `description`: string (规则详细描述)
- `points`: number (扣分数，必须>0)
- `isActive`: boolean (规则是否启用，默认true)
- `createdAt`: number (创建时间戳)

**业务含义**:
- 管理员预定义的扣分标准
- isActive控制规则的有效性
- points用于自动计算总扣分

### 5. DeductionRecord 实体
**目的**: 具体的扣分记录

**属性**:
- `id`: string (记录唯一标识符)
- `reason`: string (具体扣分原因)
- `points`: number (扣分数，从规则继承)
- `status`: string (记录状态: 'active'/'cancelled', 默认'active')
- `createdAt`: number (记录创建时间戳)

**业务含义**:
- 每次扣分的详细记录
- status支持扣分撤销功能
- reason记录具体违规情况

### 6. KickoutRequest 实体
**目的**: 踢出学生的申请

**属性**:
- `id`: string (申请唯一标识符)
- `reason`: string (申请理由)
- `status`: string (申请状态: 'pending'/'approved'/'rejected', 默认'pending')
- `createdAt`: number (申请创建时间戳)
- `processedAt`: number (处理时间戳，可选)

**业务含义**:
- 宿舍长发起的踢出申请
- 管理员处理后更新状态
- processedAt记录处理时间

---

## 关系设计

### 1. UserDormitoryRelation (用户-宿舍关系)
**类型**: n:1 (多个用户对应一个宿舍)
**目的**: 用户分配到宿舍

**源实体**: User
**目标实体**: Dormitory
**源属性名**: `dormitory` (在User上创建dormitory属性)
**目标属性名**: `users` (在Dormitory上创建users属性)

**关系属性**:
- `assignedAt`: number (分配时间戳)
- `status`: string (分配状态: 'active'/'inactive', 默认'active')

**业务含义**:
- 通过user.dormitory访问用户所在宿舍
- 通过dormitory.users访问宿舍所有成员
- status支持用户离开宿舍的历史记录

### 2. UserBedRelation (用户-床位关系)
**类型**: 1:1 (一个用户对应一个床位)
**目的**: 用户分配到具体床位

**源实体**: User  
**目标实体**: Bed
**源属性名**: `bed` (在User上创建bed属性)
**目标属性名**: `user` (在Bed上创建user属性)

**关系属性**:
- `assignedAt`: number (分配时间戳)
- `status`: string (分配状态: 'active'/'inactive', 默认'active')

**业务含义**:
- 通过user.bed访问用户的床位
- 通过bed.user访问床位的使用者
- 支持床位历史分配记录

### 3. DormitoryBedRelation (宿舍-床位关系)
**类型**: 1:n (一个宿舍对应多个床位)
**目的**: 床位归属于特定宿舍

**源实体**: Dormitory
**目标实体**: Bed  
**源属性名**: `beds` (在Dormitory上创建beds属性)
**目标属性名**: `dormitory` (在Bed上创建dormitory属性)

**关系属性**:
- 无额外属性

**业务含义**:
- 通过dormitory.beds访问宿舍所有床位
- 通过bed.dormitory访问床位所属宿舍
- 建立宿舍和床位的归属关系

### 4. DormitoryHeadRelation (宿舍-宿舍长关系)
**类型**: 1:1 (一个宿舍对应一个宿舍长)
**目的**: 指定宿舍的管理者

**源实体**: Dormitory
**目标实体**: User
**源属性名**: `dormHead` (在Dormitory上创建dormHead属性)
**目标属性名**: `managedDormitory` (在User上创建managedDormitory属性)

**关系属性**:
- `appointedAt`: number (任命时间戳)
- `status`: string (任职状态: 'active'/'inactive', 默认'active')

**业务含义**:
- 通过dormitory.dormHead访问宿舍长
- 通过user.managedDormitory访问用户管理的宿舍
- 支持宿舍长更换的历史记录

### 5. UserDeductionRecordRelation (用户-扣分记录关系)
**类型**: 1:n (一个用户对应多个扣分记录)
**目的**: 扣分记录归属于特定用户

**源实体**: User
**目标实体**: DeductionRecord
**源属性名**: `deductionRecords` (在User上创建deductionRecords属性)
**目标属性名**: `user` (在DeductionRecord上创建user属性)

**关系属性**:
- 无额外属性

**业务含义**:
- 通过user.deductionRecords访问用户所有扣分记录
- 通过deductionRecord.user访问被扣分的用户
- 用于计算用户总扣分

### 6. DeductionRuleRecordRelation (扣分规则-扣分记录关系)
**类型**: 1:n (一个规则对应多个记录)
**目的**: 记录基于哪个规则进行扣分

**源实体**: DeductionRule
**目标实体**: DeductionRecord
**源属性名**: `records` (在DeductionRule上创建records属性)
**目标属性名**: `rule` (在DeductionRecord上创建rule属性)

**关系属性**:
- 无额外属性

**业务含义**:
- 通过rule.records访问基于该规则的所有扣分记录
- 通过record.rule访问扣分记录对应的规则
- 确保扣分的规则依据

### 7. RecorderDeductionRelation (记录者-扣分记录关系)
**类型**: 1:n (一个宿舍长记录多个扣分)
**目的**: 记录是谁进行的扣分操作

**源实体**: User (记录者，通常是宿舍长)
**目标实体**: DeductionRecord
**源属性名**: `recordedDeductions` (在User上创建recordedDeductions属性)
**目标属性名**: `recorder` (在DeductionRecord上创建recorder属性)

**关系属性**:
- 无额外属性

**业务含义**:
- 通过user.recordedDeductions访问宿舍长记录的所有扣分
- 通过record.recorder访问记录扣分的宿舍长
- 用于权限控制和扣分撤销

### 8. KickoutRequestRelations (踢出申请相关关系)

#### 8.1 ApplicantKickoutRelation (申请人-踢出申请关系)
**类型**: 1:n (一个宿舍长发起多个申请)
**源实体**: User (申请人)
**目标实体**: KickoutRequest
**源属性名**: `kickoutRequests` (在User上创建kickoutRequests属性)
**目标属性名**: `applicant` (在KickoutRequest上创建applicant属性)

#### 8.2 TargetKickoutRelation (被申请人-踢出申请关系)
**类型**: 1:n (一个学生可能被多次申请)
**源实体**: User (被申请人)
**目标实体**: KickoutRequest
**源属性名**: `kickoutRequestsAgainst` (在User上创建kickoutRequestsAgainst属性)
**目标属性名**: `target` (在KickoutRequest上创建target属性)

#### 8.3 ProcessorKickoutRelation (处理人-踢出申请关系)
**类型**: 1:n (一个管理员处理多个申请)
**源实体**: User (处理人)
**目标实体**: KickoutRequest
**源属性名**: `processedKickoutRequests` (在User上创建processedKickoutRequests属性)
**目标属性名**: `processor` (在KickoutRequest上创建processor属性)

**关系属性**:
- 所有踢出申请关系都无额外属性

**业务含义**:
- 完整记录踢出申请的参与者
- 支持复杂的查询和权限控制
- 便于生成申请历史和统计信息

---

## 计算属性设计

### User 实体计算属性
- `totalScore`: number - 所有有效扣分记录的总分
- `currentOccupancy`: number - 用户当前床位占用状态(0或1)

### Dormitory 实体计算属性  
- `currentOccupancy`: number - 当前入住人数
- `availableBeds`: number - 可用床位数 (capacity - currentOccupancy)
- `occupancyRate`: number - 入住率百分比

### Bed 实体计算属性
- `isOccupied`: boolean - 床位是否被占用

### DeductionRule 实体计算属性
- `usageCount`: number - 基于该规则的记录总数
- `totalPointsDeducted`: number - 基于该规则的总扣分

---

## 数据流图

```
用户分配流程:
User → UserDormitoryRelation → Dormitory
  ↓
User → UserBedRelation → Bed → DormitoryBedRelation → Dormitory

扣分流程:
User(宿舍长) → RecorderDeductionRelation → DeductionRecord
                                              ↓
User(学生) ← UserDeductionRecordRelation ← DeductionRecord
                                              ↑
DeductionRule ← DeductionRuleRecordRelation ←

踢出申请流程:
User(宿舍长) → ApplicantKickoutRelation → KickoutRequest
                                             ↓
User(学生) ← TargetKickoutRelation ← KickoutRequest
                                             ↓
User(管理员) ← ProcessorKickoutRelation ← KickoutRequest
```

---

## 重要设计原则

### 1. 无ID引用规则
**✅ 正确**:
```typescript
// 通过关系访问相关实体
const user = await storage.get('User', userId);
const dormitory = user.dormitory; // 通过关系获取
const bedNumber = user.bed?.number; // 通过关系获取床位号
```

**❌ 错误**:
```typescript
// 不要在实体中存储ID引用
const User = Entity.create({
  properties: [
    Property.create({ name: 'dormitoryId', type: 'string' }), // 错误!
    Property.create({ name: 'bedId', type: 'string' })        // 错误!
  ]
});
```

### 2. 关系属性命名
- 通过`sourceProperty`和`targetProperty`定义访问名称
- 命名应该反映业务关系的语义
- 避免使用ID后缀，使用业务含义的名称

### 3. 状态管理
- 使用`status`字段管理实体状态
- 支持软删除和历史记录
- 状态值使用字符串枚举

### 4. 时间戳管理
- 所有实体都有`createdAt`字段
- 关系根据需要添加时间戳属性
- 使用数字类型存储Unix时间戳

### 5. 计算属性原则
- 基于关系和其他属性动态计算
- 避免存储可计算的冗余数据
- 保证数据一致性

---

## 验证清单

### 实体验证
- [ ] 所有实体名称为PascalCase单数形式
- [ ] 所有属性都有正确的类型定义
- [ ] 所有defaultValue都是函数而非静态值
- [ ] 没有ID引用字段在实体属性中
- [ ] 时间戳字段使用number类型

### 关系验证
- [ ] 所有关系都没有name属性（自动生成）
- [ ] 关系类型格式正确('1:1', '1:n', 'n:1', 'n:n')
- [ ] sourceProperty和targetProperty命名有意义
- [ ] 关系属性按需定义
- [ ] 循环依赖已避免

### 业务逻辑验证
- [ ] 支持所有需求场景
- [ ] 计算属性覆盖所有需要的派生数据
- [ ] 状态管理支持完整的业务流程
- [ ] 权限控制有足够的数据支持

这个设计确保了系统的完整性、一致性和可扩展性，为后续的交互设计和实现提供了坚实的基础。