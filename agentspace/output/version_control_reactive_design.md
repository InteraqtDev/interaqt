# 响应式框架中版本控制的设计指南

## 核心范式转换

### 用户思维 vs 响应式思维

用户通常会用**命令式思维**来描述版本控制需求：
- "保存快照" → 执行一个操作
- "回滚到某版本" → 恢复之前的状态
- "查看当前版本" → 读取当前数据

但在响应式框架中，我们需要转换为**声明式思维**：
- 所有版本的数据都是**持久存在**的事实
- "当前版本"是一个**计算出来的视图**
- 版本切换是**创建新数据**，而不是修改现有数据

## 识别版本控制需求的信号

当用户提到以下关键词时，应该考虑版本控制模式：
- 快照（snapshot）、版本（version）、历史（history）
- 回滚（rollback）、恢复（restore）、撤销（undo）
- 发布（publish）、归档（archive）、审计（audit）
- 时间旅行（time travel）、时间点（point-in-time）

## 标准实现模式

### 1. 数据模型设计

```typescript
// 原始需求：Product 实体支持版本控制
// 响应式设计：VersionedProduct + 过滤出的 Product

// 步骤1：定义版本化实体（存储所有版本）
const VersionedProduct = Entity.create({
  name: 'VersionedProduct',
  properties: [
    // 原始业务字段
    Property.create({ name: 'name', type: 'string' }),
    Property.create({ name: 'price', type: 'number' }),
    Property.create({ name: 'description', type: 'string' }),
    
    // 版本控制字段
    Property.create({ name: 'version', type: 'number' }),
    Property.create({ name: 'isDeleted', type: 'boolean', defaultValue: () => false }),
    Property.create({ name: 'createdAt', type: 'number', defaultValue: () => Math.floor(Date.now()/1000) }),
    
    // 可选：版本元信息
    Property.create({ name: 'versionNote', type: 'string' }),
    Property.create({ name: 'createdBy', type: 'string' })
  ]
});

// 步骤2：定义全局版本指针
const CurrentVersionDict = Dictionary.create({
  name: 'currentVersion',
  type: 'json',  // 存储复杂结构
  collection: false,
  defaultValue: () => ({
    version: 0,
    rollbackFrom: null  // 记录是否是回滚创建的
  })
});

// 步骤3：定义当前版本的过滤实体
const Product = Entity.create({
  name: 'Product',
  baseEntity: VersionedProduct,
  matchExpression: MatchExp.atom({
    key: 'version',
    value: ['=', 0]  // 这里会通过 Transform 动态更新
  }).and(
    MatchExp.atom({
      key: 'isDeleted',
      value: ['=', false]
    })
  )
});
```

### 2. 交互设计原则

```typescript
// 原则：所有操作都是创建新数据，而不是修改

// 创建新产品
const CreateProduct = Interaction.create({
  name: 'CreateProduct',
  action: Action.create({ name: 'createProduct' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'name', type: 'string' }),
      PayloadItem.create({ name: 'price', type: 'number' }),
      PayloadItem.create({ name: 'description', type: 'string' })
    ]
  })
});

// 发布快照（创建新版本）
const PublishSnapshot = Interaction.create({
  name: 'PublishSnapshot',
  action: Action.create({ name: 'publishSnapshot' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'note', type: 'string' })
    ]
  })
});

// 回滚版本（也是创建新数据）
const RollbackVersion = Interaction.create({
  name: 'RollbackVersion',  
  action: Action.create({ name: 'rollbackVersion' }),
  payload: Payload.create({
    items: [
      PayloadItem.create({ name: 'targetVersion', type: 'number' })
    ]
  })
});
```

### 3. 计算逻辑设计

```typescript
// Transform 处理版本创建
VersionedProduct.computation = Transform.create({
  records: [
    {
      recordName: InteractionEventEntity,
      matchExpression: MatchExp.atom({
        key: 'interactionName',
        value: ['=', 'CreateProduct']
      })
    },
    {
      recordName: InteractionEventEntity,
      matchExpression: MatchExp.atom({
        key: 'interactionName', 
        value: ['=', 'PublishSnapshot']
      })
    },
    {
      recordName: InteractionEventEntity,
      matchExpression: MatchExp.atom({
        key: 'interactionName',
        value: ['=', 'RollbackVersion']
      })
    }
  ],
  callback: async function(this: Controller, event: any) {
    const currentVersionInfo = await this.system.storage.get(
      'currentVersion',
      DICTIONARY_RECORD.id,
      ['value']
    );
    const currentVersion = currentVersionInfo.value.version;

    if (event.interactionName === 'CreateProduct') {
      // 直接创建当前版本的产品
      return {
        ...event.payload,
        version: currentVersion,
        isDeleted: false
      };
    } 
    
    if (event.interactionName === 'PublishSnapshot') {
      // 获取当前版本所有产品
      const currentProducts = await this.system.storage.find(
        'VersionedProduct',
        MatchExp.atom({ key: 'version', value: ['=', currentVersion] })
          .and(MatchExp.atom({ key: 'isDeleted', value: ['=', false] })),
        undefined,
        ['*']
      );
      
      const newVersion = currentVersion + 1;
      
      // 更新版本指针
      await this.system.storage.update(
        'currentVersion',
        DICTIONARY_RECORD.id,
        { value: { version: newVersion, rollbackFrom: null } }
      );
      
      // 复制所有当前产品到新版本
      return currentProducts.map(product => ({
        ...product,
        version: newVersion,
        versionNote: event.payload.note,
        createdAt: Math.floor(Date.now()/1000)
      }));
    }
    
    if (event.interactionName === 'RollbackVersion') {
      // 标记当前版本为删除
      const currentProducts = await this.system.storage.find(
        'VersionedProduct',
        MatchExp.atom({ key: 'version', value: ['=', currentVersion] })
          .and(MatchExp.atom({ key: 'isDeleted', value: ['=', false] }))
      );
      
      for (const product of currentProducts) {
        await this.system.storage.update(
          'VersionedProduct',
          product.id,
          { isDeleted: true }
        );
      }
      
      // 获取目标版本的产品
      const targetProducts = await this.system.storage.find(
        'VersionedProduct',
        MatchExp.atom({ key: 'version', value: ['=', event.payload.targetVersion] })
          .and(MatchExp.atom({ key: 'isDeleted', value: ['=', false] })),
        undefined,
        ['*']
      );
      
      const newVersion = currentVersion + 1;
      
      // 更新版本指针
      await this.system.storage.update(
        'currentVersion',
        DICTIONARY_RECORD.id,
        { 
          value: { 
            version: newVersion, 
            rollbackFrom: event.payload.targetVersion 
          } 
        }
      );
      
      // 复制目标版本到新版本
      return targetProducts.map(product => ({
        ...product,
        version: newVersion,
        createdAt: Math.floor(Date.now()/1000)
      }));
    }
  }
});
```

## 关键设计原则

### 1. 数据不可变性
- **永远不修改历史数据**：所有版本的数据都是不可变的历史记录
- **创建而非更新**：版本切换通过创建新数据实现，而不是修改现有数据
- **软删除**：使用 `isDeleted` 标记而不是物理删除

### 2. 版本指针管理
- **全局唯一版本号**：使用递增的版本号标识每个版本
- **版本元信息**：记录版本创建的原因（正常发布 vs 回滚）
- **动态过滤**：当前版本通过过滤计算得出，而不是存储标记

### 3. 关系处理
- **版本化关系**：如果关系也需要版本控制，创建 VersionedRelation
- **跨版本引用**：避免直接引用特定版本的数据
- **一致性保证**：确保版本切换时关系的完整性

## 实现步骤清单

当遇到版本控制需求时，按以下步骤实现：

1. **识别版本化实体**
   - 哪些实体需要版本控制？
   - 版本的粒度是什么？（单个实体 vs 整体快照）

2. **设计版本化数据模型**
   - 创建 VersionedXXX 实体
   - 添加版本控制字段（version, isDeleted, createdAt）
   - 定义版本元信息字段

3. **创建版本指针**
   - 使用 Dictionary 存储当前版本信息
   - 记录版本切换的原因和历史

4. **定义过滤实体**
   - 基于 VersionedXXX 创建当前版本的视图
   - 使用 matchExpression 过滤当前版本和未删除的数据

5. **设计交互**
   - 创建数据的交互
   - 发布版本的交互
   - 回滚版本的交互
   - 查询历史的交互（可选）

6. **实现计算逻辑**
   - 使用 Transform 处理版本创建
   - 确保版本号正确递增
   - 处理数据复制和标记删除

7. **测试验证**
   - 测试正常的版本发布流程
   - 测试回滚功能
   - 验证数据一致性

## 常见误区和解决方案

### 误区1：试图修改历史数据
**错误**：在回滚时尝试删除新版本，恢复旧版本
**正确**：创建新版本，内容复制自旧版本

### 误区2：使用复杂的版本树
**错误**：实现分支、合并等复杂版本控制
**正确**：保持线性版本历史，简化实现

### 误区3：混淆当前数据和历史数据
**错误**：在同一个实体中混合当前和历史数据
**正确**：清晰分离 VersionedXXX（所有版本）和 XXX（当前版本）

### 误区4：忽视性能影响
**错误**：每次查询都过滤大量历史数据
**正确**：为当前版本创建索引，优化查询性能

## 扩展模式

### 1. 部分版本控制
某些字段需要版本控制，某些不需要：
- 将实体拆分为版本化部分和非版本化部分
- 使用关系连接两部分

### 2. 版本对比
需要比较不同版本的差异：
- 创建专门的 Computation 计算版本差异
- 使用 Transform 生成差异报告

### 3. 版本审批流程
版本发布需要审批：
- 结合 Activity 实现审批工作流
- 使用 StateMachine 管理版本状态

## 总结

在响应式框架中实现版本控制的核心是：
1. **思维转换**：从"修改数据"到"创建新数据"
2. **数据设计**：版本化实体 + 版本指针 + 过滤视图
3. **交互设计**：所有操作都是创建操作
4. **一致性保证**：通过 Transform 确保数据完整性

记住：我们描述的是"数据是什么"，而不是"如何操作数据"。版本控制在响应式框架中是通过声明式的数据关系和计算来实现的。