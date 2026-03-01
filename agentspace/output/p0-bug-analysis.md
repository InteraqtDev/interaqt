# P0 Bug 深度分析报告

> 基于 code-quality-report.md 中的三项 P0 建议逐一验证

---

## P0-1: `applyResultPatch` 循环中的 `return` bug

### 结论：真实 bug，当前影响有限，但必须修复

### 代码定位

`src/runtime/Controller.ts` 第 220-257 行：

```typescript
async applyResultPatch(dataContext: DataContext, patch: ...|ComputationResultPatch[]|undefined, record?: any) {
    if (patch instanceof ComputationResultSkip||patch === undefined) return

    const patches = Array.isArray(patch) ? patch : [patch]
    for(const patch of patches) {
            if (dataContext.type === 'global') {
                return this.system.storage.dict.set(dataContext.id.name, patch)  // <-- BUG
        } else if (dataContext.type === 'entity'||dataContext.type === 'relation') {
            // ... await ... (正确)
        } else {
            // ... await ... (正确)
        }
    }
}
```

### 分析

1. **循环结构**：第 223 行将 `patch` 规范化为数组 `patches`，第 224 行 `for(const patch of patches)` 遍历。

2. **Bug 所在**：第 226 行 `return this.system.storage.dict.set(...)` 在处理第一个 `global` 类型 patch 后直接 `return`，退出整个方法。如果 `patches` 数组有多个元素，后续元素全部丢失。

3. **其他分支正确**：`entity`/`relation` 分支（第 230-236 行）和 `property` 分支（第 245-251 行）均使用 `await`，能正确继续循环。

4. **复制粘贴来源**：对比同一文件中的 `applyResult` 方法（第 190-219 行），该方法**没有循环**，其 `global` 分支也使用 `return`——在无循环场景下完全正确。`applyResultPatch` 的 `return` 显然是从 `applyResult` 复制时未修改。

### 为何当前影响有限

- `dataContext.type` 在整个循环中是常量（同一次调用的所有 patch 走同一个分支）
- 当前 global computation 实际使用中通常只产生单值，不太会触发多 patch 场景
- `dict.set` 是简单的 key-value 覆盖

### 潜在风险

- 如果未来 `GlobalRealTimeComputation` 或 global `Custom` computation 返回 `ComputationResultPatch[]`，将发生**静默数据丢失**——不会报错，只应用第一个 patch
- 函数签名明确接受 `ComputationResultPatch[]`，说明多 patch 是设计预期

### 修复建议

将第 226 行：

```typescript
return this.system.storage.dict.set(dataContext.id.name, patch)
```

改为：

```typescript
await this.system.storage.dict.set(dataContext.id.name, patch)
```

一行改动，零风险。与其他分支行为一致。

---

## P0-2: 核心接口类型安全（`Storage` / `Database` / `InteractionContext` / `dispatch`）

### 结论：不是 bug，是类型安全改进。建议降级为 P2

### 代码现状

| 接口 | 位置 | `any` 使用情况 |
|------|------|---------------|
| `InteractionContext` | `Controller.ts:45-48` | `{ logContext?: any; [k: string]: any }` |
| `dispatch` | `Controller.ts:263` | `<TArgs = any, TResult = any>` |
| `Storage` | `System.ts:10-42` | `map: any`, `Promise<any>`, `data: any`, `...arg: any[]` |
| `Database` | `System.ts:94-110` | `Promise<any>`, `values: any[]`, `query<T extends any>` |
| `addEventListener` | `Controller.ts:360` | `callback: (...args: any[]) => any` |

### 判断依据

1. **无运行时错误**：所有接口在当前实现中工作正常，`any` 不会导致任何运行时异常或数据错误。
2. **影响范围是编译时**：缺少精确类型意味着 TypeScript 编译器无法帮助捕获类型不匹配，但代码行为正确。
3. **P0 应保留给正确性/安全性问题**：这些 `any` 影响的是可维护性和开发体验，不是程序正确性。
4. **改进价值确实存在**：`any` 从这些核心接口传播到整个代码库（报告统计 358 处），改进后能大幅提升重构安全性。

### 建议

维持改进意图，但降级为 **P2**（技术债务），在日常迭代中逐步收紧类型。优先级低于实际 bug 修复。

---

## P0-3: `Property` / `RealDictionary` 的名称长度限制

### 结论：真实 bug（错误的元数据定义），但当前为死代码

### 代码定位

**`src/core/Property.ts` 第 61-63 行：**

```typescript
length: ({name}: { name: string }) => {
  return name.length > 1 && name.length < 5;
}
```

**`src/core/RealDictionary.ts` 第 67-69 行：**（完全相同）

```typescript
length: ({name}: { name: string }) => {
  return name.length > 1 && name.length < 5;
}
```

### 分析

1. **约束含义**：`name.length > 1 && name.length < 5` 仅允许 2-4 个字符的名称。

2. **会被错误拒绝的合法名称**：

   | 名称 | 长度 | 通过？ |
   |------|:----:|:------:|
   | `age` | 3 | 是 |
   | `name` | 4 | 是 |
   | `email` | 5 | **否** |
   | `title` | 5 | **否** |
   | `status` | 6 | **否** |
   | `price` | 5 | **否** |
   | `createdAt` | 9 | **否** |
   | `description` | 11 | **否** |
   | `x` | 1 | **否** |

3. **对比 `Entity.ts`**：`Entity.ts` 第 56-65 行的 `static public` 只有 `nameFormat` 约束（正则），**没有 `length` 约束**。这说明 `length` 约束是 Property/Dictionary 特有的异常添加。

4. **当前为死代码**：`static public` 中的 `constraints` 是元数据描述符，当前无任何代码调用这些约束函数。`Property.create()` 和 `Dictionary.create()` 不会执行这些检查。测试中大量使用超过 4 字符的属性名，全部正常创建。

5. **潜在风险**：如果未来有可视化编辑器、代码生成器或验证层读取 `static public` 的 `constraints`（这是 `static public` 存在的设计意图），将错误拒绝绝大多数合法属性名。

### 修复建议

**方案 A（推荐）：移除 `length` 约束，与 Entity.ts 保持一致**

```typescript
constraints: {
  format: ({name}: { name: string }) => {
    return validNameFormatExp.test(name);
  }
}
```

`format` 正则 `/^[a-zA-Z0-9_]+$/` 已隐含要求至少 1 个字符，无需额外长度检查。

**方案 B：如果确实需要长度约束，使用合理范围**

```typescript
length: ({name}: { name: string }) => {
  return name.length >= 1 && name.length <= 64;
}
```

推荐方案 A，理由：与 Entity.ts 一致，最小化代码差异。

---

## 总结

| P0 项 | 是否真实 bug | 当前影响 | 建议优先级 | 修复难度 |
|-------|:-----------:|:-------:|:---------:|:-------:|
| `applyResultPatch` 的 `return` | **是** | 低（暂未触发多 patch 场景） | **P0** | 1 行改动 |
| 核心接口 `any` 类型 | **否**（改进项） | 无运行时影响 | **P2** | 大范围重构 |
| Property/Dictionary 名称长度 | **是**（死代码中的错误定义） | 无（约束未被调用） | **P1** | 2 处删除 |

### 实际修复行动

1. **立即修复**：`applyResultPatch` 的 `return` → `await`（1 行，零风险）
2. **顺手修复**：删除 Property.ts 和 RealDictionary.ts 中的 `length` 约束（2 处，零风险）
3. **长期规划**：核心接口类型收紧，纳入技术债务迭代计划
