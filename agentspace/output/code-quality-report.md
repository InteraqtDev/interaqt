# interaqt 代码质量评估报告

> 评估时间：2026-03-01  
> 评估范围：`src/` 全部源码，`tests/` 测试代码，构建与工具链配置

---

## 一、项目概况

| 指标 | 数据 |
|------|------|
| 源码文件数 | 110 个 `.ts` 文件 |
| 源码总行数 | ~20,500 行 |
| 测试文件数 | 86 个 `.spec.ts` 文件 |
| 测试总行数 | ~45,300 行（测试代码量约为源码的 2.2 倍） |
| 运行时依赖 | 0（所有依赖均为 devDependencies） |
| 构建产物 | ESM 单入口 `dist/index.js` + 类型声明 |

### 架构分层

```
src/
├── core/       (26 文件, ~4,050 行)  — 领域模型定义
├── runtime/    (34 文件, ~8,225 行)  — 执行引擎
├── storage/    (25 文件, ~7,060 行)  — 持久化层
├── builtins/   (20 文件, ~2,500 行)  — 内置 Interaction/Activity
└── drivers/    (5 文件, ~670 行)     — 数据库驱动适配
```

依赖方向：`builtins → runtime → storage → core`，整体分层清晰。

---

## 二、综合评分

| 维度 | 评分 (1-10) | 说明 |
|------|:-----------:|------|
| **架构设计** | 8 | 分层清晰，依赖方向明确，Klass 模式统一 |
| **类型安全** | 4 | `any` 使用泛滥（358 处），关键接口弱类型 |
| **错误处理** | 6 | 有自定义错误体系，但分布不均匀 |
| **代码重复** | 5 | 多处可提取的重复模式 |
| **函数复杂度** | 5 | 存在多个超长函数（100+ 行） |
| **测试质量** | 6 | 覆盖面广，但存在规范性问题 |
| **工具链** | 5 | 无 linter/formatter，依赖人工一致性 |
| **文档与注释** | 4 | 中英混杂，JSDoc 覆盖不足 |
| **安全性** | 6 | 存在 SQL 插值和 `new Function` 隐患 |
| **总体** | **5.4** | 可维护但有明显改进空间 |

---

## 三、详细分析

### 3.1 类型安全

**`any` 使用统计：共 358 处**

| 层 | 数量 | 占比 |
|----|:----:|:----:|
| runtime | 180 | 50.3% |
| storage | 63 | 17.6% |
| builtins | 52 | 14.5% |
| core | 47 | 13.1% |
| drivers | 16 | 4.5% |

**高风险区域：**

1. **`System.ts` — Storage/Database 接口**：`map: any`, `Promise<any>`, `data: any`, `...arg: any[]`。这些是系统核心接口，弱类型会向所有消费者传播。

2. **`Controller.ts`**：`InteractionContext` 定义为 `[k: string]: any`，`dispatch<TArgs = any, TResult = any>`，`addEventListener` 的 callback 参数为 `(...args: any[]) => any`。

3. **`Scheduler.ts`**：`computationHandleMap: Map<any, {...}>`，`handle as any` 类型断言，`dataDeps: any`。

4. **`EventSource.ts`（core）**：泛型默认值 `TArgs = any`，callback 类型 `(this: any, args: TArgs)`。

5. **通用模式**：`Record<string, any>` 在全代码库中广泛使用，未定义领域专用类型。

**积极面：**
- 启用了 `strict: true`
- 无 `@ts-ignore` 或 `@ts-nocheck`（0 处）
- 核心层的 `*Instance` 和 `*CreateArgs` 接口定义清晰

**建议：**
- 为 `Storage` 和 `Database` 接口定义精确的泛型类型
- 将 `InteractionContext` 替换为具名类型
- 用 `unknown` 替代入口点处的 `any`，强制调用方做类型收窄

---

### 3.2 错误处理

**优势：**
- 建立了自定义错误体系：`FrameworkError` → `ComputationError` / `SchedulerError` / `SideEffectError` / `ConditionError`
- `Controller.dispatch()` 实现了 try/catch + 事务回滚
- `Scheduler` 的错误包装包含上下文信息（handle 名、计算名、数据上下文）
- builtins 层有 `InteractionGuardError` 和 `ActivityErrors`

**问题：**

1. **MonoSystem/MonoStorage 无错误处理**：作为 `System` 和 `Storage` 的实现，完全无 try/catch。

2. **Driver 层错误处理不一致**：仅 `PGLite` 有 try/catch（捕获后 rethrow）；`SQLite`、`PostgreSQL`、`Mysql` 的错误直接传播，无上下文包装。

3. **Storage 层使用 plain `Error`**：无自定义 Storage 错误类型，不利于调用方区分错误来源。

4. **`new Function()` / `JSON.parse` 无保护**：`Property.ts`、`Custom.ts`、`Condition.ts`、`Attributive.ts` 中的反序列化路径未用 try/catch 保护。

---

### 3.3 代码重复

**1. UUID 重复检查（18+ 个类中重复）**

```typescript
const existing = this.instances.find(i => i.uuid === instance.uuid);
if (existing) {
    throw new Error(`duplicate uuid in options ${instance.uuid}, ${TypeName}`);
}
this.instances.push(instance);
```

所有 Klass 类（Entity、Relation、Property、Condition 等）都有这段几乎相同的代码。`interfaces.ts` 中已定义了 `BaseKlass` 和 `createBase()` 但未被使用。

**2. 函数反序列化（8+ 个文件中重复）**

```typescript
if (typeof args.callback === 'string' && (args.callback as any).startsWith('func::')) {
    args.callback = new Function('return ' + (args.callback as any).substring(6))();
}
```

出现在 `SideEffect.ts`、`Every.ts`、`Any.ts`、`WeightedSummation.ts`、`Count.ts`、`Property.ts`、`Condition.ts`、`Attributive.ts` 等。

**3. `is()` / `check()` 静态方法**：每个 Klass 都有近乎相同的实例检测逻辑。

**4. Scheduler 构造函数中的 AsyncTaskEntity 创建**：四段结构相似的代码（property / global / entity / relation），仅字段名不同。

**建议：**
- 使用 `BaseKlass.createBase()` 或提取注册辅助函数
- 提取 `deserializeFunction(value: unknown)` 到 `utils.ts`
- 将 `is()` / `check()` 生成为模式或使用 mixin

---

### 3.4 函数复杂度

**超长函数（>50 行）：**

| 文件 | 函数 | 行数 | 建议 |
|------|------|:----:|------|
| `Scheduler.ts` | 构造函数 | ~175 | 提取 AsyncTaskEntity 创建为工厂方法 |
| `Scheduler.ts` | `runComputation` | ~140 | 按计算类型拆分子方法 |
| `Setup.ts` | 多个方法 | 1,065 总计 | 文件过大，需拆分为多个模块 |
| `MergedItemProcessor.ts` | 合并逻辑 | 554 总计 | 提取子处理器 |
| `SQLBuilder.ts` | SQL 构建 | 543 总计 | 按 SQL 语句类型拆分 |
| `EntityToTableMap.ts` | 映射逻辑 | 529 总计 | 职责单一化 |
| `Scheduler.ts` | `resolveDataDeps` | ~75 | 可接受但值得简化 |
| `BoolExp.ts` | `evaluate` / `evaluateAsync` | 各 ~60 | 近乎重复的同步/异步逻辑 |

---

### 3.5 测试质量

**覆盖率数据（基于已有的 coverage 报告）：**

| 指标 | 覆盖率 |
|------|:------:|
| 语句覆盖 | 54.3% |
| 分支覆盖 | 77.8% |
| 函数覆盖 | 41.2% |

语句和函数覆盖率偏低，分支覆盖率尚可。

**测试组织：**
- 按层划分：`tests/core/`（18 文件）、`tests/runtime/`（38 文件）、`tests/storage/`（38 文件）
- 使用 Vitest 框架，支持 `describe` / `it` / `expect`
- 测试数据放在 `data/` 子目录中

**问题：**

1. **资源清理缺失**：多个 runtime 测试未调用 `storage.close()`（如 `transform.spec.ts`、`controller.spec.ts`），可能导致数据库连接泄漏。

2. **违反项目约定**：`transform.spec.ts` 中多处 `storage.find()` 调用未指定 `attributeQuery`（项目规则要求必须指定）。

3. **setup/teardown 不一致**：storage 测试普遍使用 `beforeEach`/`afterEach` + 新数据库实例保证隔离；runtime 测试则多在每个 `it` 内部 inline 设置，且跳过清理。

4. **大测试文件**：`stateMachine.spec.ts`（2,563 行）、`filteredRelation.spec.ts`（2,232 行）、`count.spec.ts`（1,547 行）——单文件测试场景过多，不利于定位失败。

5. **测试中的 `any`**：回调参数常用 `(x: any)` 而非具体类型。

---

### 3.6 安全性

**1. SQL 注入风险**

Driver 层的 `IDSystem` 实现使用字符串插值构建 SQL：

```typescript
// SQLite.ts, PostgreSQL.ts, Mysql.ts
`WHERE name = '${recordName}'`
`VALUES ('${recordName}', ${newId})`
`CREATE DATABASE ${this.database}`
```

虽然 `recordName` 来自 schema 而非用户输入，但直接插值是不安全的编码实践。Storage 层的主查询使用了参数化占位符（`p()` 函数），这部分是安全的。

**2. `new Function()` 执行风险**

反序列化路径中 8+ 处使用 `new Function('return ' + content)()`，等效于 `eval()`。若序列化数据被污染，可导致任意代码执行。

**建议：**
- IDSystem 改用参数化查询
- 数据库名使用白名单验证
- 评估是否可以用更安全的反序列化替代 `new Function()`

---

### 3.7 工具链与工程实践

**缺失项：**

| 工具 | 状态 | 影响 |
|------|:----:|------|
| ESLint | ❌ 未配置 | 无自动代码规范检查 |
| Prettier | ❌ 未配置 | 代码格式一致性依赖人工 |
| Pre-commit hooks | ❌ 未配置 | 无提交前自动检查 |
| CI/CD 配置 | ❌ 未发现 | 无自动构建/测试流水线 |

**已有项：**
- TypeScript `strict: true` ✅
- 分层 tsconfig（core/runtime/storage/drivers/prod）✅
- Vitest + 分层测试命令 ✅
- Vite 构建 + `vite-plugin-dts` 类型生成 ✅
- API Extractor 配置 ✅
- release-it 发布配置 ✅
- Coverage 收集（`@vitest/coverage-v8`）✅

---

### 3.8 文档与注释

**问题：**

1. **中英混杂**：代码注释混合使用中文和英文，缺乏统一标准。例如 `Scheduler.ts` 中有中文注释（`// 占位符生成器`），而 `Controller.ts` 使用英文 JSDoc。

2. **JSDoc 覆盖不足**：仅 `Controller.dispatch()`、`RefContainer` 部分方法有 JSDoc。大多数公共 API 缺乏文档。

3. **TODO/FIXME 积压**：共 39 处，分布于 storage（最多）、runtime、builtins。部分 TODO 可能已长期未处理。

4. **无 API 文档生成**：虽配置了 API Extractor，但缺少文档生成流程。

---

### 3.9 命名一致性

**优势：**
- Klass 模式命名统一：`*Instance`、`*CreateArgs`、`static create()`
- 文件名与类名一致
- PascalCase 用于类型/类，camelCase 用于变量/函数

**问题：**
- `EtityMutationEvent`（拼写错误，应为 `EntityMutationEvent`）
- `Relation._name` 私有属性通过 `(instance as any)._name` 在外部访问

---

### 3.10 死代码与未使用定义

| 位置 | 内容 | 说明 |
|------|------|------|
| `types.ts:40-44` | `IInstance` with `__type`/`__uuid` | 与 `interfaces.ts` 中的 `IInstance`(`_type`/`uuid`) 冲突 |
| `Computation.ts:26-30` | `DictionaryDataDep` | 注释标记"现在没用" |
| `utils.ts:78-80` | `removeAllInstance()` | 空函数（no-op） |
| `utils.ts:130-134` | `createClass()` | 已弃用，仅打印 warning |
| `interfaces.ts:42-54` | `BaseKlass`、`createBase`、`isBase`、`checkBase` | 已定义但未被使用 |

---

## 四、优先改进建议

### P1（中优先级）

1. **引入 ESLint + Prettier**：配置统一的代码风格和规范检查，配合 pre-commit hook 自动执行。

2. **消除代码重复**：
   - 提取 `deserializeFunction()` 工具函数
   - 使用 `BaseKlass` 或 mixin 统一 UUID 检查和 `is()`/`check()` 实现
   - 重构 Scheduler 构造函数中的重复创建逻辑

3. **修复 SQL 插值**：Driver 层 IDSystem 改用参数化查询。

4. **统一测试规范**：
   - 确保所有测试调用 `storage.close()`
   - `storage.find()`/`findOne()` 必须指定 `attributeQuery`
   - 建立统一的 setup/teardown 模式

### P2（低优先级）

5. **为核心接口添加精确类型**：优先处理 `Storage`、`Database`、`InteractionContext`、`dispatch` 的泛型参数，减少 `any` 传播。

6. **拆分大文件**：`Setup.ts`（1,065 行）、`Scheduler.ts`（854 行）、`MergedItemProcessor.ts`（554 行）。

7. **清理死代码**：移除 `DictionaryDataDep`、`removeAllInstance()`、`createClass()`，统一 `IInstance` 定义。

8. **统一注释语言**：选择中文或英文之一作为注释标准，逐步迁移。

9. **处理 TODO/FIXME 积压**：清点 39 处 TODO/FIXME，分类为"仍需处理"和"已不再适用"。

10. **提升测试覆盖率**：函数覆盖率（41.2%）和语句覆盖率（54.3%）有较大提升空间。

---

## 五、总结

interaqt 项目在架构设计上表现良好——分层清晰、Klass 模式统一、零运行时依赖的设计体现了对外部耦合的控制。测试代码量充足（源码的 2.2 倍），表明团队重视测试。

主要短板集中在**类型安全**和**工程规范**上。358 处 `any` 使用显著削弱了 TypeScript `strict: true` 的价值，尤其是核心接口（`Storage`、`Database`、`InteractionContext`）的弱类型会向整个代码库传播。缺乏 ESLint/Prettier 意味着代码风格一致性完全依赖人工维护。

原有 P0 bug 已全部修复（`applyResultPatch` 循环中的 `return` bug、Property/RealDictionary 名称长度限制 bug）。核心接口类型化经评估为改进项而非 bug，已降级为 P2。建议以 P1 项（工具链 + 代码重复消除 + SQL 插值修复）为当前优先，配合 P2 项逐步提升代码质量。
