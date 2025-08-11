# Entity and Relation Design

## Overview

本文档定义了宿舍管理系统的所有实体和关系，遵循interaqt框架的设计原则。

## Entities

### User
- **Purpose**: 系统用户，包括管理员、宿舍长和普通学生
- **Properties**:
  - id: string (系统自动生成)
  - name: string (用户姓名)
  - email: string (用户邮箱，唯一标识)
  - role: string (用户角色: admin/dormHead/student)
  - status: string (用户状态: active/inactive/evicted，默认active)
  - violationScore: number (累计违规分数，默认0)
  - createdAt: number (创建时间戳)
  - updatedAt: number (更新时间戳)

### Dormitory
- **Purpose**: 宿舍房间
- **Properties**:
  - id: string (系统自动生成)
  - name: string (宿舍名称，如"A栋301"，必须唯一)
  - capacity: number (床位容量，4-6)
  - status: string (宿舍状态: active/inactive，默认active)
  - createdAt: number (创建时间戳)
  - updatedAt: number (更新时间戳)

### Bed
- **Purpose**: 宿舍内的床位
- **Properties**:
  - id: string (系统自动生成)
  - number: number (床位编号，1-6)
  - status: string (床位状态: available/occupied，默认available)
  - createdAt: number (创建时间戳)
  - updatedAt: number (更新时间戳)

### ViolationRecord
- **Purpose**: 用户的违规记录
- **Properties**:
  - id: string (系统自动生成)
  - reason: string (违规原因描述)
  - score: number (扣分值，1-10分)
  - createdAt: number (记录时间戳)

### EvictionRequest
- **Purpose**: 宿舍长对违规用户的踢出申请
- **Properties**:
  - id: string (系统自动生成)
  - reason: string (申请理由)
  - status: string (申请状态: pending/approved/rejected，默认pending)
  - createdAt: number (申请时间戳)
  - processedAt: number (处理时间戳，可选)
  - adminComment: string (管理员处理意见，可选)

## Relations

### UserDormitoryRelation
- **Type**: n:1 (多个用户对应一个宿舍)
- **Purpose**: 用户被分配到的宿舍
- **Source**: User
- **Target**: Dormitory
- **Source Property**: dormitory (在User实体上访问分配的宿舍)
- **Target Property**: users (在Dormitory实体上访问所有居住用户)
- **Properties**:
  - assignedAt: number (分配时间戳)
  - assignedBy: string (分配人ID)

### UserBedRelation
- **Type**: 1:1 (一个用户对应一个床位)
- **Purpose**: 用户占用的具体床位
- **Source**: User
- **Target**: Bed
- **Source Property**: bed (在User实体上访问占用的床位)
- **Target Property**: occupant (在Bed实体上访问占用的用户)
- **Properties**:
  - assignedAt: number (分配时间戳)

### DormitoryBedsRelation
- **Type**: 1:n (一个宿舍对应多个床位)
- **Purpose**: 宿舍包含的所有床位
- **Source**: Dormitory
- **Target**: Bed
- **Source Property**: beds (在Dormitory实体上访问所有床位)
- **Target Property**: dormitory (在Bed实体上访问所属宿舍)

### DormitoryDormHeadRelation
- **Type**: 1:1 (一个宿舍对应一个宿舍长)
- **Purpose**: 负责管理该宿舍的宿舍长
- **Source**: Dormitory
- **Target**: User
- **Source Property**: dormHead (在Dormitory实体上访问宿舍长)
- **Target Property**: managedDormitory (在User实体上访问管理的宿舍)
- **Properties**:
  - appointedAt: number (任命时间戳)

### UserViolationRelation
- **Type**: 1:n (一个用户对应多个违规记录)
- **Purpose**: 用户的所有违规记录
- **Source**: User
- **Target**: ViolationRecord
- **Source Property**: violations (在User实体上访问所有违规记录)
- **Target Property**: user (在ViolationRecord实体上访问违规用户)

### ViolationRecorderRelation
- **Type**: n:1 (多个违规记录对应一个记录人)
- **Purpose**: 记录违规的宿舍长
- **Source**: ViolationRecord
- **Target**: User
- **Source Property**: recordedBy (在ViolationRecord实体上访问记录人)
- **Target Property**: recordedViolations (在User实体上访问记录的所有违规)

### EvictionRequestUserRelation
- **Type**: n:1 (多个申请对应一个用户)
- **Purpose**: 被申请踢出的用户
- **Source**: EvictionRequest
- **Target**: User
- **Source Property**: targetUser (在EvictionRequest实体上访问目标用户)
- **Target Property**: evictionRequests (在User实体上访问所有踢出申请)

### EvictionRequestDormHeadRelation
- **Type**: n:1 (多个申请对应一个宿舍长)
- **Purpose**: 发起申请的宿舍长
- **Source**: EvictionRequest
- **Target**: User
- **Source Property**: requestedBy (在EvictionRequest实体上访问申请人)
- **Target Property**: submittedEvictions (在User实体上访问提交的所有申请)

### EvictionRequestAdminRelation
- **Type**: n:1 (多个申请对应一个管理员)
- **Purpose**: 处理申请的管理员
- **Source**: EvictionRequest
- **Target**: User
- **Source Property**: processedBy (在EvictionRequest实体上访问处理人)
- **Target Property**: processedEvictions (在User实体上访问处理的所有申请)

## Data Flow Diagram

```
┌─────────────────────────────────────────────┐
│                  System Flow                 │
├─────────────────────────────────────────────┤
│                                             │
│  User ──1:1──> Bed                         │
│   │                                         │
│   ├──n:1──> Dormitory ──1:n──> Beds       │
│   │            │                            │
│   │            └──1:1──> DormHead (User)   │
│   │                                         │
│   ├──1:n──> ViolationRecords               │
│   │            │                            │
│   │            └──n:1──> Recorder (User)   │
│   │                                         │
│   └──1:n──> EvictionRequests               │
│                │                            │
│                ├──n:1──> DormHead (User)   │
│                │                            │
│                └──n:1──> Admin (User)      │
│                                             │
└─────────────────────────────────────────────┘
```

## Design Rationale

### 为什么不在实体中包含引用ID字段？

遵循interaqt框架的最佳实践，我们不在实体属性中包含任何引用其他实体的ID字段（如User中不包含dormitoryId）。所有实体间的关联都通过Relation定义来实现。这种设计有以下优势：

1. **清晰的关系管理**：所有关系都在Relation定义中明确声明
2. **避免数据不一致**：框架自动维护关系的完整性
3. **更好的响应式支持**：关系变化可以触发相应的计算
4. **灵活的查询**：通过关系属性可以方便地访问相关实体

### 关系属性设计

每个关系都定义了源和目标属性名，使得代码更具可读性：
- `user.dormitory` - 用户访问自己的宿舍
- `dormitory.users` - 宿舍访问所有居住用户
- `user.bed` - 用户访问自己的床位
- `bed.occupant` - 床位访问占用的用户

### 状态管理设计

不同实体有不同的状态字段，用于业务流程控制：
- User.status: active/inactive/evicted
- Bed.status: available/occupied
- EvictionRequest.status: pending/approved/rejected
- Dormitory.status: active/inactive

这些状态将通过StateMachine进行管理，确保状态转换的正确性。

## Implementation Notes

1. **ID生成**：所有实体的ID都由框架自动生成，不需要手动指定
2. **时间戳**：使用number类型存储Unix时间戳（秒），便于计算和比较
3. **默认值**：所有默认值必须使用函数形式，如`defaultValue: () => 'active'`
4. **唯一性约束**：User.email和Dormitory.name需要在业务逻辑中保证唯一性
5. **关系类型**：严格使用'1:1'、'1:n'、'n:1'、'n:n'格式，不要使用其他格式

## Next Steps

基于这个设计文档，下一步将：
1. 设计所有的Interactions（交互）
2. 分析需要的Computations（计算）
3. 生成实际的TypeScript代码实现
