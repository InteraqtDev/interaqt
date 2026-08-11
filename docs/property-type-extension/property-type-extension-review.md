# 设计评审 — property-type-extension（Task 1 additional task 1）

**结论：通过**

评审角色：独立设计评审者。依据：Task 1 全文、当前设计 `property-type-extension.md`（`design-round: 1/15`）、`AGENTS.md`、相关源码与本轮实测。结论在完成源码/探针/基线测试核对后形成。

---

## 复审范围与方法

逐项检查「设计复审条件」六类问题。对本轮可验证事实执行了：

1. **源码阅读**
   - 声明：`src/core/Property.ts`、`src/core/RealDictionary.ts`（`ALLOWED_PROPERTY_TYPES` / create 守卫）、`src/builtins/interaction/PayloadItem.ts`（独立 `allowedTypes`）
   - 拓扑：`src/runtime/System.ts` `DictionaryEntity`（`key:string` + `value:json`）、`src/runtime/MonoSystem.ts` `setDictionaryValue`（`{ key, value: { raw: value } }`）
   - 列路径：`src/storage/erstorage/Setup.ts` 全部 `mapToDBFieldType` 调用点（仅 Entity/Relation 属性与 link/pk，无 dictionary 列编译）、`EntityToTableMap.ValueAttribute`（无 `args`）、`SQLBuilder.prepareFieldValue`、`QueryExecutor` 读归一、`MatchExp.getFinalFieldValue`
   - 驱动：四驱动 `mapToDBFieldType` 的 `else { return type }`；SQLite 对 `json` 已并入 object 分支，PG/PGLite/MySQL 的 `json` 仍走 fallback 产出小写 `json`
   - 方言：`SchemaDialectName = 'postgres' | 'sqlite' | 'mysql'`，`getSchemaDialect`
   - 迁移：`createMigrationManifest` 的 property/dictionary 逻辑字段（`type`/`collection`/`computed`，**无** `args`）；property/dictionary changed 比较谓词（约 `migration.ts` 1587–1590、1662）
   - 扩展点检索：全库无 `definePropertyType` / `PropertyTypeRegistry`
   - 导出：`src/index.ts` 聚合 core/runtime/storage/builtins；`src/storage/index.ts` 尚未导出扩展 API（符合「待实现」）

2. **基线测试**（revision `de1dece`）  
   `npx vitest run tests/runtime/review-fixes-2026-07-12-r23.spec.ts tests/storage/driverDialectConsistency.spec.ts` → **16/16 通过**。

3. **最小探针**（`tsx`，本轮临时执行，未入库）  
   - `Property.create({ type:'vector' })` / `Dictionary.create({ type:'vector' })`：声明期拒绝，文案仅列内置 allowed，无扩展指引。  
   - `strng` / `String` / `vectr` / `JSON`：均拒绝。  
   - 全部 `ALLOWED_PROPERTY_TYPES`：Property create 成功。  
   - `PayloadItem.create({ type:'vector' })`：独立 payload 错误文案。  
   - 四驱动 `mapToDBFieldType('vector')` → 字面 `'vector'`；`object`→`JSON`；`json`：SQLite→`JSON`，PG/PGLite/MySQL→`json`。  
   - Property 实例无 `args` 键；Dictionary `args: { dimensions: 3 }` 保留在实例上。  
   - `DictionaryEntity.properties` = `key:string,value:json`。  
   - 与设计 §1.2–§1.4 / F17 / E 类结论一致。

---

## 需要复审的问题

**无。**

当前设计在六类复审条件上未发现会使方案整体失效、目标受损或里程碑不可执行的问题。上一轮已识别的 Dictionary 拓扑问题（扩展物理模型误与 Property 列同构）在现行正文中已以**决策 A** 收口，并贯通求证表、目标、§3.2 合同表、生命周期闸门、里程碑与实现清单；本轮复验源码后确认该收口与真实读者一致，不再构成阻塞。

---

## 实现注意事项（不触发复审）

以下有价值，但按协议不得影响「通过」结论：

1. **`json` 显式映射必须钉死现网字符串**（设计 §3.9 已写表）：SQLite `json`→`JSON`；PG/PGLite/MySQL `json`→小写 `json`，`object`→`JSON`。删除 `else { return type }` 前先并入 if/switch，否则内置 `json` 列与 r25 方言自洽/migration `modelHash` 会无意义漂移。M-01 验收应直接断言四驱动映射字符串。

2. **Setup 全部列 `mapToDBFieldType` 调用点改走 `resolveFieldType`**（设计 §7）：至少包括 entity/relation properties、value attribute 回填、link 端点 source/target fieldType（`Setup.ts` 约 267、339、1197、1237–1248 等）。`pk` 可继续走驱动 map；扩展名不得再进入 `mapToDBFieldType`。

3. **Match 编译器契约在 M-03 钉死到现有 placeholder API**：设计草图写 `{ fieldValue, fieldParams }`，现网 `getFinalFieldValue` 返回 `[string, unknown[]]` 并经 `p()` 占位。实现时应统一为与 `MatchExp` 相同的防注入绑定路径，避免手写拼接 SQL。

4. **写路径「扩展优先于 json 启发式」**：现网判定是 `fieldType?.toLowerCase() === 'json'`（相等，非子串）。扩展逻辑 type 分支必须先于该启发式，防止扩展 `fieldType` 恰好为 `json` 时被二次 `canonicalJSONStringify`。

5. **Dictionary 内置类型 + `args` 拒绝**（§3.2/§3.5「实现期统一」）：当前 Dictionary 允许保留无消费方的 `args`。若 M-01 对内置 Dictionary 一律拒绝 `args`，属于小范围破坏性收紧；实现前用测试/检索确认仓库内无依赖，并在 CHANGELOG/升级说明写一句。与「扩展名不可用于 Dictionary」的硬合同无关，勿绑成同一错误文案。

6. **方言族 ≠ 扩展插件已安装**：`SchemaDialectName` 合并 PG/PGLite 正确；真实 pgvector 是否可用不能单靠 `storage.postgres` 注册断言。主证明用 mock（P-mock）即可；可选真 PG 证明须环境门控，且不得用 PGLite 冒充扩展可用。适配包若需要「未 `CREATE EXTENSION` 即失败」，可在自身 setup 钩子完成，不必塞进框架 resolve 的最小合同。

7. **migration 双点修改**：manifest 增加 property `args` 时，**同步** property changed 比较谓词（及若纳入 dictionary `args` 的 dictionary 分支）。否则可能出现 modelHash 已变但 change list 无 property changed。

8. **注册表测试隔离**：进程级单例 + `resetPropertyTypeRegistryForTests()`；相关 suite 的 `beforeEach`/`afterEach` 必须调用，避免并行/序间串扰。

9. **`Property.public.type.options` 与动态扩展**：执行面以 create 守卫/注册表为准；静态 options 保持内置并注释扩展走 registry，避免生成器/文档误读为封闭全集即全部合法运行时集合的反面。

10. **import 顺序**：适配包 `definePropertyType` 必须在任何 `Property.create({ type: 扩展名 })` 之前执行；错误文案与 usage 已规划强调 side-effect import。

11. **半侧 codec**：仅 `toDB` 或仅 `fromDB` 在 resolve 拒绝（设计 §3.4.5）应保留，并在 M-02 钉测试。

12. **规范证明命名**：测试类型用 `pte_vector`（或等价）避免与真实 pgvector 混淆；文档示例可用 `vector`。

---

## 六类条件检查摘要

| 类别 | 结果 |
|------|------|
| 1. 关键事实错误 | **未命中**。白名单、fallback、Dictionary JSON KV 拓扑、Setup 仅列路径、PayloadItem 独立宇宙、无现成注册表、`ValueAttribute`/manifest 无 args、四驱动 `json`/`vector` 映射等与设计 §1 及本轮探针一致。决策 A 与 F17/MonoSystem 路径一致。 |
| 2. 内部逻辑矛盾 | **未命中**。逻辑表（core）/物理表（storage）分离与「create 可无 Database、setup 绑 storage」一致；Dictionary 仅内置与「不解析 dictionary fieldType」一致；删 fallback 与「先显式映射 json」顺序一致；Match 未注册算子失败与 opaque 默认不冲突。 |
| 3. 违反项目原则 | **未命中**。显式注册、禁止静默透传、core 不依赖 drivers、分层 `storage → core`、不 hardcode 单一 plugin、破坏性收敛 fallback 均符合 `AGENTS.md`。 |
| 4. 违反任务目标 | **未命中**。封闭默认 + 显式扩展、语义/物理分离、绑定闸门、读写/Match/migration 合同（按真实读者拆分 Property vs Dictionary）、pgvector 类规范证明（mock 主路径）、教义收敛与非目标边界均覆盖 Task 要求 1–10。PayloadItem 明确排除并论证。 |
| 5. 里程碑不可执行 | **未命中**。M=5；M-01 最小闭环（注册→Property 声明→绑定 DDL/失败→fallback 错误化→Dictionary 负向）可独立验收；M-02..M-04 前置清晰；M-05 文档/导出可并行收尾。验收命令具体。 |
| 6. 必须提前验证的重大风险 | **未命中**。设计期求证与基线测试本轮已复验；剩余风险（json 映射、Setup 汇合点、migration 谓词、注册表隔离、真扩展环境）均可在实现环境用既有 Vitest/驱动探针验证，不构成「推迟则整体失效」。 |

---

## 总评

现行设计将扩展能力正确收束为 **Entity/Relation 的 Property 列路径**：`definePropertyType`（core 逻辑注册 + storage 按 `SchemaDialectName` 的 storage/codec/match）、create 期逻辑名（及 args）校验、setup 期 `resolveFieldType` 能力闸门、四驱动未知类型错误化（并先显式保持 `json` 现网字符串）、扩展默认 opaque、Match 仅显式算子、migration 纳入 property `args` 与物理 `fieldType`、Dictionary 保持 `_Dictionary_` JSON KV 且拒绝扩展逻辑名、PayloadItem 保持独立校验宇宙。规范证明以可 CI 的 mock Property 为主、真 PG/pgvector 为可选门控，符合 Task「不把 plugin 写进 core 必装」与「不得假完成」。

**结论：通过。** 不修改设计文档。设计裁决轮可将 `status` 置为实现中并计算 `N = 5 × 5 = 25` 后进入实现循环。

**本文件为覆盖写入。**
