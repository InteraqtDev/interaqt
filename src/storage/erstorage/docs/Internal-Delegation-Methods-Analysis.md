# 内部委托方法详细分析

## 目标

分析以下 4 个内部委托方法是否可以删除：
1. `flashOutCombinedRecordsAndMergedLinks`
2. `relocateCombinedRecordDataForLink`
3. `insertSameRowData`
4. `handleCreationReliance`

---

## 方法依赖分析

### 1️⃣ flashOutCombinedRecordsAndMergedLinks

#### 定义位置
```typescript
// RecordQueryAgent.ts: lines 186-188
async flashOutCombinedRecordsAndMergedLinks(newEntityData: NewRecordData, events?: RecordMutationEvent[], reason = ''): Promise<{ [k: string]: RawEntityData }> {
    return this.creationExecutor.flashOutCombinedRecordsAndMergedLinks(newEntityData, events, reason)
}
```

#### 内部调用点
**RecordQueryAgent.preprocessSameRowData (line 176)**
```typescript
async preprocessSameRowData(newEntityData: NewRecordData, isUpdate = false, ...) {
    // ...
    // 更新场景中调用
    const flashOutRecordRasData = await this.flashOutCombinedRecordsAndMergedLinks(
        newEntityData,
        events,
        `finding combined records for ${newEntityData.recordName} to flash out...`
    )
    return newEntityDataWithIds.merge(flashOutRecordRasData)
}
```

#### 外部调用
❌ **无外部调用** (EntityQueryHandle, tests 均无调用)

#### 用途
处理合并记录的"闪出"操作 - 当更新操作需要"抢夺"其他记录的 combined record 时使用

#### 删除影响
🔴 **不能删除**
- **内部依赖**: `preprocessSameRowData` 的更新场景需要
- **影响**: 删除会导致更新操作中的 combined records 处理失败
- **结论**: 必须保留

---

### 2️⃣ relocateCombinedRecordDataForLink

#### 定义位置
```typescript
// RecordQueryAgent.ts: lines 191-193
async relocateCombinedRecordDataForLink(linkName: string, matchExpressionData: MatchExpressionData, moveSource = false, events?: RecordMutationEvent[]) {
    return this.creationExecutor.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
}
```

#### 内部调用点
**RecordQueryAgent.unlink (line 622)**
```typescript
async unlink(linkName: string, matchExpressionData: MatchExpressionData, ...) {
    const linkInfo = this.map.getLinkInfoByName(linkName)
    assert(!linkInfo.isTargetReliance, `cannot unlink reliance data...`)

    if (linkInfo.isCombined()) {
        // 对于 combined link，需要重定位数据
        return this.relocateCombinedRecordDataForLink(linkName, matchExpressionData, moveSource, events)
    }

    return this.deleteRecord(linkName, matchExpressionData, events)
}
```

#### 外部调用
❌ **无外部调用** (EntityQueryHandle, tests 均无调用)

#### 用途
当解除 combined 类型的关系时，需要将合并的数据重新定位到新的行

#### 删除影响
🔴 **不能删除**
- **内部依赖**: `unlink` 方法处理 combined link 时需要
- **影响**: 删除会导致 combined link 的 unlink 操作失败
- **结论**: 必须保留

---

### 3️⃣ insertSameRowData

#### 定义位置
```typescript
// RecordQueryAgent.ts: lines 196-198
async insertSameRowData(newEntityData: NewRecordData, queryName?: string, events?: RecordMutationEvent[]): Promise<EntityIdRef> {
    return this.creationExecutor.insertSameRowData(newEntityData, queryName, events)
}
```

#### 内部调用点
❌ **无内部调用** (在 RecordQueryAgent 中未找到调用)

#### 实际调用关系
```
CreationExecutor.createRecord()
    └─> CreationExecutor.insertSameRowData()  ✅ 内部调用
```
该方法仅在 CreationExecutor 内部被 createRecord 调用

#### 外部调用
❌ **无外部调用** (EntityQueryHandle, tests 均无调用)

#### 用途
插入同行数据到数据库（CreationExecutor 的内部实现细节）

#### 删除影响
✅ **可以删除**
- **无内部依赖**: RecordQueryAgent 中无调用
- **无外部依赖**: 外部代码不直接调用
- **影响**: 无影响，该方法仅用于 CreationExecutor 内部
- **结论**: 可以安全删除

---

### 4️⃣ handleCreationReliance

#### 定义位置
```typescript
// RecordQueryAgent.ts: lines 203-205
async handleCreationReliance(newEntityData: NewRecordData, events?: RecordMutationEvent[]): Promise<object> {
    return this.creationExecutor.handleCreationReliance(newEntityData, events)
}
```

#### 内部调用点
❌ **无内部调用** (在 RecordQueryAgent 中未找到调用)

#### 实际调用关系
```
CreationExecutor.createRecord()
    └─> CreationExecutor.handleCreationReliance()  ✅ 内部调用
```
该方法仅在 CreationExecutor 内部被 createRecord 调用

#### 外部调用
❌ **无外部调用** (EntityQueryHandle, tests 均无调用)

#### 用途
处理创建时的关联关系（CreationExecutor 的内部实现细节）

#### 删除影响
✅ **可以删除**
- **无内部依赖**: RecordQueryAgent 中无调用
- **无外部依赖**: 外部代码不直接调用
- **影响**: 无影响，该方法仅用于 CreationExecutor 内部
- **结论**: 可以安全删除

---

## 总结表

| 方法名 | 内部调用 | 外部调用 | 可否删除 | 理由 |
|--------|---------|---------|---------|------|
| `flashOutCombinedRecordsAndMergedLinks` | ✅ Yes (preprocessSameRowData) | ❌ No | 🔴 **不能** | 更新场景需要 |
| `relocateCombinedRecordDataForLink` | ✅ Yes (unlink) | ❌ No | 🔴 **不能** | unlink combined 需要 |
| `insertSameRowData` | ❌ No | ❌ No | ✅ **可以** | 仅 CreationExecutor 内部用 |
| `handleCreationReliance` | ❌ No | ❌ No | ✅ **可以** | 仅 CreationExecutor 内部用 |

---

## 详细说明

### 🔴 必须保留的方法 (2个)

#### A. flashOutCombinedRecordsAndMergedLinks
**原因**:
1. RecordQueryAgent.preprocessSameRowData 在更新场景调用
2. 更新操作需要处理 combined records 的"抢夺"逻辑
3. 删除会破坏更新功能

**调用链**:
```
updateRecord()
  └─> updateSameRowData()
      └─> preprocessSameRowData(isUpdate=true)
          └─> flashOutCombinedRecordsAndMergedLinks()  ⚠️ 必需
```

#### B. relocateCombinedRecordDataForLink
**原因**:
1. RecordQueryAgent.unlink 在处理 combined link 时调用
2. Combined link 的 unlink 需要重定位数据
3. 删除会破坏 unlink 功能

**调用链**:
```
unlink(combinedLink)
  └─> relocateCombinedRecordDataForLink()  ⚠️ 必需
```

### ✅ 可以删除的方法 (2个)

#### C. insertSameRowData
**原因**:
1. RecordQueryAgent 中无任何调用
2. 仅在 CreationExecutor.createRecord 内部使用
3. 是 CreationExecutor 的实现细节，不需要暴露

**当前调用链**:
```
createRecord() (in CreationExecutor)
  └─> insertSameRowData()  ← 内部实现细节
```

**删除后**:
- CreationExecutor 自己调用自己的 insertSameRowData
- RecordQueryAgent 不受影响

#### D. handleCreationReliance
**原因**:
1. RecordQueryAgent 中无任何调用
2. 仅在 CreationExecutor.createRecord 内部使用
3. 是 CreationExecutor 的实现细节，不需要暴露

**当前调用链**:
```
createRecord() (in CreationExecutor)
  └─> handleCreationReliance()  ← 内部实现细节
```

**删除后**:
- CreationExecutor 自己调用自己的 handleCreationReliance
- RecordQueryAgent 不受影响

---

## 建议操作

### 第一步：删除不必要的委托方法

删除以下 2 个方法（安全）:

```typescript
// ❌ 删除这两个方法
// RecordQueryAgent.ts

// 删除 lines 196-198
async insertSameRowData(...) {
    return this.creationExecutor.insertSameRowData(...)
}

// 删除 lines 203-205
async handleCreationReliance(...) {
    return this.creationExecutor.handleCreationReliance(...)
}
```

### 第二步：保留必要的委托方法

保留以下 2 个方法（必需）:

```typescript
// ✅ 保留这两个方法
// RecordQueryAgent.ts

// 保留 lines 186-188
async flashOutCombinedRecordsAndMergedLinks(...) {
    return this.creationExecutor.flashOutCombinedRecordsAndMergedLinks(...)
}

// 保留 lines 191-193
async relocateCombinedRecordDataForLink(...) {
    return this.creationExecutor.relocateCombinedRecordDataForLink(...)
}
```

---

## 优化效果

### 删除前
- RecordQueryAgent: 640 行
- 委托方法: 9 个 (createRecord, addLink 等 + 这 4 个内部方法)

### 删除后
- RecordQueryAgent: ~634 行 (减少 6 行)
- 委托方法: 7 个 (删除 2 个内部实现细节方法)

### 收益
✅ **代码更清晰**: 只暴露真正需要的方法  
✅ **职责更明确**: 内部实现细节不暴露  
✅ **零风险**: 不影响任何功能  

---

## 验证步骤

### 1. 运行测试确保安全
```bash
npm run test:storage
```

### 2. 检查是否有遗漏的调用
```bash
# 搜索可能的调用
grep -r "insertSameRowData" src/
grep -r "handleCreationReliance" src/
```

### 3. 确认 CreationExecutor 独立性
- CreationExecutor 应该能独立使用这两个方法
- 不依赖 RecordQueryAgent 的委托

---

## 结论

**可以安全删除 2 个方法**:
- ✅ `insertSameRowData` - CreationExecutor 内部实现
- ✅ `handleCreationReliance` - CreationExecutor 内部实现

**必须保留 2 个方法**:
- 🔴 `flashOutCombinedRecordsAndMergedLinks` - 更新场景需要
- 🔴 `relocateCombinedRecordDataForLink` - unlink 场景需要

**删除这 2 个方法是安全且有益的**:
1. 减少不必要的暴露
2. 使职责更清晰
3. 无任何功能影响
4. 符合最小暴露原则

---

**建议**: 立即删除这 2 个不必要的委托方法 ✨

---

## ✅ 执行结果

### 已完成操作
**日期**: 2025-01-05

✅ **已删除** `insertSameRowData` (原 lines 196-198)  
✅ **已删除** `handleCreationReliance` (原 lines 203-205)  
✅ **已保留** `flashOutCombinedRecordsAndMergedLinks` (必需)  
✅ **已保留** `relocateCombinedRecordDataForLink` (必需)  

### 测试结果
```
✅ Test Files  29 passed (29)
✅ Tests      222 passed (222)
✅ Linter     No errors
```

### 代码统计
| 指标 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| RecordQueryAgent 行数 | 640 行 | 628 行 | **-12 行** ✅ |
| 委托方法数量 | 9 个 | 7 个 | **-2 个** ✅ |
| 测试通过率 | 100% | 100% | 无变化 ✅ |

### 优化效果
1. ✅ **更清晰** - 只保留真正需要的公开方法
2. ✅ **更专业** - 内部实现细节不暴露
3. ✅ **零风险** - 所有测试通过，功能完整
4. ✅ **符合原则** - 遵循最小暴露原则

### 最终保留的委托方法列表
1. `createRecord` - 公开 API ✅
2. `createRecordDependency` - 内部需要（update 依赖）✅
3. `addLink` - 公开 API ✅
4. `addLinkFromRecord` - 公开 API ✅
5. `flashOutCombinedRecordsAndMergedLinks` - 内部需要（update 依赖）✅
6. `relocateCombinedRecordDataForLink` - 内部需要（unlink 依赖）✅
7. `preprocessSameRowData` - 内部需要（update 和 create 共用）✅

**总计**: 7 个必要的委托方法，职责清晰 🎯

