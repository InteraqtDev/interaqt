# 实现审计 — property-type-extension（Task 1 additional task 4）

审计角色：独立实现审计者。依据：设计 `property-type-extension.md`（交审时 `implementation-round: 9/25`，`current-milestone: M-05` 待审）、Task 1 要求 7/8、源码、独立复验命令与对抗性文档合同探针。不信任里程碑状态或实现者结论。

## 1. 范围与基线

- 当前里程碑：M-05 — 公开教义、导出与破坏性说明
- 已完成且本轮复验邻近：M-01（注册/绑定）、M-02（codec）、M-03（Match）、M-04（migration）
- 上轮 reopen：M-05 `reopen-count: 0`，领域空
- 本轮 `convergence-mode`：normal（无实现缺陷 reopen）

## 2. 独立复验

### 2.1 验收命令（M-05）

```bash
npm run check
npx vitest run tests/core/propertyTypeExtensionPublicSurface.spec.ts
```

结果：

- `npm run check` → **exit 0**
- 公开面规格：初审 **2/2 passed**；审计加强 per-file 文档合同钉后仍 **2/2 passed**

### 2.2 邻近回归（M-01..M-05 + 基线）

```bash
npx vitest run \
  tests/core/propertyTypeExtension.spec.ts \
  tests/core/propertyTypeExtensionPublicSurface.spec.ts \
  tests/storage/propertyTypeExtensionBind.spec.ts \
  tests/storage/propertyTypeExtensionCodec.spec.ts \
  tests/storage/propertyTypeExtensionMatch.spec.ts \
  tests/runtime/propertyTypeExtensionMigration.spec.ts \
  tests/storage/driverDialectConsistency.spec.ts \
  tests/runtime/review-fixes-2026-07-12-r23.spec.ts
```

结果：**68/68 passed**。

### 2.3 最终核验（全部里程碑已关闭时执行）

| 命令 | 结果 |
|------|------|
| M-01 `propertyTypeExtension.spec.ts` + `propertyTypeExtensionBind.spec.ts` | **22/22** |
| M-02 `propertyTypeExtensionCodec.spec.ts` | **11/11** |
| M-03 Match + `driverDialectConsistency` | **18/18** |
| M-04 `propertyTypeExtensionMigration.spec.ts` | **7/7** |
| M-05 public surface + `npm run check` | **2/2** + exit 0 |
| `review-fixes-2026-07-12-r23` + `migration.spec.ts` + `simple-refactored.spec.ts` | **116/116** |

## 3. 设计 / Task 合同对照（M-05）

| 合同 | 结论 |
|------|------|
| 公开导出：`definePropertyType`、`PropertyTypes`、`ALLOWED_PROPERTY_TYPES`、`resetPropertyTypeRegistryForTests`、resolve/codec 类型与 helpers 可从 `interaqt` 导入 | 成立（runtime 断言 + `src/core/index.ts` / `src/storage/index.ts` 再导出） |
| usage：内置列表、`definePropertyType`、import 顺序、opaque、缺 dialect 失败、三叉类型宇宙 | 成立（`02-define-entities-properties.md`） |
| Dictionary Decision A：仅内置 type；JSON KV；禁 builtin args；扩展名拒绝 | 成立（`11-global-dictionaries.md`） |
| PayloadItem 独立白名单，不因扩展加宽 | 成立（`07-payload-parameters.md`） |
| Match 算子非默认继承 | 成立（`12-data-querying.md`、`14`、`19`、generator API） |
| 禁止/删除透传技巧；CHANGELOG Breaking 写明 `mapToDBFieldType` | 成立（`CHANGELOG.md` Unreleased Features + Breaking + Docs；anti-patterns） |
| generator + storage USAGE_GUIDE 同步 | 成立 |
| `npm run check` | 成立 |

## 4. 实现路径复核（教义 / 导出）

### 4.1 导出面

- `src/core/propertyTypes.ts`：内置常量、逻辑注册表、错误文案 helpers；经 `core/index` 进入主包。
- `src/storage/definePropertyType.ts`：公开 `definePropertyType` + 测试 reset + resolve/codec 再导出；经 `storage/index` 进入主包。
- 公开用法与设计 §3.3 一致：`import { definePropertyType, Property } from 'interaqt'`。

### 4.2 文档面（逐文件）

| 文件 | 覆盖 |
|------|------|
| `02-define-entities-properties.md` | builtin 表、`definePropertyType` 示例、Property-only、Match not free、no passthrough、三叉表 |
| `11-global-dictionaries.md` | 固定 `_Dictionary_` JSON KV、扩展拒绝、omit builtin args |
| `07-payload-parameters.md` | 独立白名单；不接受 definePropertyType 名 |
| `12-data-querying.md` | 扩展列不默认继承算子 |
| `14-api-reference.md` | Property/Dictionary/`definePropertyType()` API |
| `18-api-exports-reference.md` | 导出表 + Property-only / opt-in Match / no unknown DDL |
| `19-common-anti-patterns.md` | raw SQL/plugin type、Dictionary/Payload 误用、正确注册路径 |
| generator `api-reference.md` | Property/Dictionary 参数与禁透传 |
| `src/storage/USAGE_GUIDE.md` | 扩展类型一句合同 |
| `CHANGELOG.md` Unreleased | Features + Docs + Breaking `mapToDBFieldType` |

## 5. 对抗探针

| 探针 | 结果 |
|------|------|
| 公开 API 可注册扩展名；`Property.create` 放行；`Dictionary.create` 拒扩展 | 通过（public surface 规格） |
| 残留「Custom Types / 任意 type 当 SQL」教义 | 未发现于已更新 usage 集；旧 Custom Types 段已改写为 object 形状 + definePropertyType |
| generator 仍写 Property 仅 string/number/boolean | 已修订 |
| Dictionary 文档仍教 builtin `args: { maxLength }` 为合法 | 已否定并写 omit |
| CHANGELOG Unreleased 是否含 feature + breaking（非仅 Features） | 含；审计钉强化 Unreleased 切片断言 |
| 联合语料断言可掩盖单文件漏写 | **验证缺口**（见 §6）— 已加强为 per-file 合同钉 |

## 6. 验证缺口（不计 reopen）

实现轮 `propertyTypeExtensionPublicSurface.spec.ts` 对文档使用**拼接语料**匹配（`definePropertyType` / Match / passthrough / Property-only 各至少出现一次）。该形状在「某一关键指南删掉本文件合同、其它文件仍保留关键词」时仍可通过。

产品文档在审计时已齐全；未发现实现缺陷。审计直接加强验收：

- 改为**逐文件**合同钉（`02` / `07` / `11` / `12` / `14` / `18` / `19` / generator / USAGE_GUIDE / CHANGELOG Unreleased）。
- 复验 **2/2** 通过；里程碑继续关闭，**不**因验证加强退回实现轮。

## 7. Task 要求逐项（最终核验）

| # | 要求 | 结论 |
|---|------|------|
| 1 | 求证入库 | 设计 §1 F1–F17 / E1–E14；实现未回退 |
| 2 | 封闭默认 + 显式扩展 | create 白名单 + definePropertyType；无硬编码 vector 终态 |
| 3 | 一等扩展模型 | core 逻辑表 + storage 物理表；分层完整 |
| 4 | 生命周期闸门 | create / setup / mapToDBFieldType 错误化 |
| 5 | 读写 / Match / migration | M-02..M-04 合同 + 本轮回归绿 |
| 6 | 规范证明 | mock 扩展 Property 全路径；Dictionary 负向；无依赖真 pgvector 作为唯一证据 |
| 7 | 公开教义与破坏性 | 本里程碑文档 + CHANGELOG Breaking |
| 8 | 验证纪律 | 分层测试 + 公开面钉 + check |
| 9–10 | 非目标 / 禁透传 | 未内置全部插件；fallback 删除 |

## 8. 分类与计数

- **实现缺陷**：无。
- **验证缺口**：1（文档合同 per-file 钉）— 已当场加强并复验通过。
- M-05：`待审` → **`已完成`**
- `reopen-count` / `reopen-domains`：不变（0；∅）
- `convergence-mode`：保持 **normal**

## 9. 状态写入

- 全部里程碑 **已完成**。
- `status`: **已完成**
- `current-milestone`: M-05
- `current-milestone-reopens`: 0
- `next-action`: **无**
- 最终核验已执行并通过；按协议完成 `retro.md` 并**终止**，不启动新的 chat。
