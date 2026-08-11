# property-type-extension — 运行记录

generated-by: cyclic-task-prompt | template-sha256: 6cfe19e4e81c | generated-at: 2026-08-11

| 轮次 | 角色 | 摘要 |
|------|------|------|
| d0 | 设计初稿 | 求证 F1–F16 + E1–E10；唯一方案 definePropertyType（core 逻辑表 + storage 物理表）；PayloadItem 排除；fallback 错误化；里程碑 M-01..M-05；基线 de1dece。启动 additional task 1。 |
| d1 | 设计裁决 | 评审结论「需要修订」。采纳 R1（类别 1 关键事实错误 / 连带 4）：Dictionary 为固定 JSON KV（DictionaryEntity key+value json；MonoSystem `{raw}`），非插件列；决策 A——扩展 storage/DDL/codec/Match 仅 Property；Dictionary.create 仅内置。贯通 §1 读者表/F17、§2 目标拆分、§3.2 合同表、M-01..M-05、实现清单。顺带吸收实现注意：json 映射钉死现网字符串、Match 默认无 `=`、migration 比较谓词。基线 16/16 复验通过。`design-round: 1/15`。下一步：additional task 1 再评。 |
| d1 | 设计评审 | 结论「通过」。六类复审条件均未命中阻塞项。复验：Dictionary 决策 A 与 F17/MonoSystem/Setup 读者一致；白名单/fallback/json 映射/无注册表/ValueAttribute 无 args 与设计一致；基线 16/16；tsx 探针 E1–E5/驱动 map/DictionaryEntity 与 §1.4 一致。实现注意写入 review（不阻塞）：json 现网字符串、Setup 全调用点、Match placeholder API、Dictionary 内置 args 破坏面、方言族≠插件已装、migration 双点修改等。未改设计。启动 additional task 2。 |
| d2 | 设计裁决 | 评审结论「通过」。独立核验：review「需要复审的问题」为空，六类均未命中阻塞。源码复核 F1–F17（白名单、fallback、Setup 仅列路径、DictionaryEntity JSON KV、MonoSystem `{raw}`、manifest 无 args、ValueAttribute 无 args、Payload 独立宇宙、无 definePropertyType）。E13 基线 16/16；E14 tsx 探针与 §1.4 一致。**未采纳**任何需复审问题；实现注意事项保持实现期约束、不升格阻塞。设计通过：`status: 实现中`，`design-round: 2/15`，`N=25`，`implementation-round: 0/25`，`next-action: M-01`。启动 additional task 3。 |
| k1 | 实现 | M-01 最小闭环落地：`definePropertyType`（core 逻辑表 + storage 物理表）、Property create 扩展放行 + args/validateArgs、Dictionary 扩展名/内置 args 拒绝、Setup `resolveFieldType` 汇合、四驱动 fallback 抛错且 json 现网字符串钉死、`ValueAttribute.args`、验收测试 21/21 通过；邻近 r23/dialect/dbSetup/defaultValue/JSONfield/simple-refactored 绿。`implementation-round: 1/25`，M-01→待审。启动 additional task 4。 |
| k1 | 审计 | M-01 验收 21/21 与邻近回归绿，但对抗探针发现实现缺陷 D1：`definePropertyType` 先 commit 逻辑名再校验 storage，半侧 codec/空 fieldType 失败后逻辑名残留、Property.create 放行、同名无法重试。领域 `registration-atomicity`。M-01 待审→开放，reopen-count=1。启动 additional task 3。 |
| k2 | 实现 | 修复 D1：`assertPropertyTypeStorageEntries` 先于逻辑/物理 commit；失败 define 两表无残留，同名完整定义可重试。回归钉死半侧 codec/空 fieldType + Property/setup。验收 22/22、邻近 45/45。M-01→待审，`implementation-round: 2/25`。启动 additional task 4。 |
| k2 | 审计 | M-01 独立复验 22/22、邻近 45/45 通过；D1 all-or-nothing 修复成立（半侧 codec/空 fieldType 无残留、同名可重试）；对抗探针：Relation 属性绑定、逻辑-only/错 dialect 可行动失败、Dictionary 拓扑不变、四驱动 json 钉死。无实现缺陷。M-01→已完成。推进 M-02。启动 additional task 3。 |
| k3 | 实现 | M-02：`applyExtendedPropertyTypeToDB/FromDB` 汇合；SQLBuilder 写路径与 QueryExecutor 读路径在内置 json/timestamp 之前按逻辑扩展 type 编码/解码或 opaque；半接线 define 拒绝保持。验收 `propertyTypeExtensionCodec.spec.ts` 9/9；邻近含 M-01/dialect/JSON/sqlBuilder/r23 等 99/99。M-02→待审，`implementation-round: 3/25`。启动 additional task 4。 |
| k3 | 审计 | M-02 交审验收原 9/9，但对抗探针发现实现缺陷 D2（领域 `codec-args-lookup`）：1:1 合表关系属性嵌套 create 时 prepareFieldValue 用父实体 recordName lookup 逻辑属性名，拿不到 ValueAttribute.args，toDB 崩溃。独立实体/独立关系表/n:n 路径正常。失败复现写入 propertyTypeExtensionCodec.spec.ts（10 测 1 红）。M-02 待审→开放，reopen-count=1。启动 additional task 3。 |
| k4 | 实现 | 修复 D2：`FieldAndValue.args` 自 ValueAttribute 写出；SQLBuilder prepareFieldValue 优先行元数据 args；UpdateExecutor 透传。合表 create 复现转绿并补合表 update 钉。验收 codec 11/11，M-01+邻近 92/92。M-02→待审，`implementation-round: 4/25`。启动 additional task 4。 |
| k4 | 审计 | M-02 独立复验 codec 11/11、邻近 92/92 通过；D2 合表 create/update 转绿；对抗探针 n:1/target 侧 1:1/n:n/reliance/defaultValue/null/opaque/Dictionary 通过。无新实现缺陷。M-02→已完成。推进 M-03。启动 additional task 3。 |
| k5 | 实现 | M-03：`applyExtendedPropertyTypeMatch` 汇合；MatchExp 扩展 type 先于 builtin 算子路径；未注册算子（含默认无 `=`/`in`）编译期失败；注册 `=` 与自定义 `<#>` mock 可执行；compiler 收 args。验收 match+dialect 15/15，邻近 58/58。M-03→待审，`implementation-round: 5/25`。启动 additional task 4。 |
| k5 | 审计 | M-03 验收 15/15 与邻近 73/73 绿，但对抗探针发现实现缺陷 D3（领域 `match-resolveCtx-collection`）：Match 路径未将 `ValueAttribute.collection` 写入 match `resolveCtx`，与写路径/设计 `PropertyTypeResolveContext` 不对称；`collection:true` 扩展列 compiler 见 `undefined`。M-03 待审→开放，reopen-count=1。启动 additional task 3。 |
| k6 | 实现 | 修复 D3：MatchExp.getFinalFieldValue 两处 callsite 传入 ValueAttribute.collection → applyExtendedPropertyTypeMatch/resolveCtx；验收钉 collection:true 可执行 find。验收 16/16，邻近 74/74。M-03→待审，`implementation-round: 6/25`。启动 additional task 4。 |
| k6 | 审计 | M-03：D3（match-resolveCtx-collection）独立复验通过并关闭该领域；对抗探针发现实现缺陷 D4（领域 `match-builtin-precheck-bypass`）：`buildFieldMatchExpression` 的 builtin `contains`+`!isCollection` 门禁在扩展汇合点之前抢先拒绝，非 collection 扩展列注册的 `contains` 不可达 compiler。D4 钉入 `propertyTypeExtensionMatch.spec.ts`（红）。M-03 待审→开放，reopen-count=2；convergence-mode 仍 normal。启动 additional task 3。 |
| k7 | 实现 | 修复 D4：`buildFieldMatchExpression` 对扩展逻辑 type 跳过 builtin JSON-collection `contains` 门禁，使注册/未注册 `contains` 均达 `applyExtendedPropertyTypeMatch`；内置非 collection object 门禁保持。验收 Match+dialect 17/17（D4 钉绿），邻近 75/75，r7 contains 6/6。M-03→待审，`implementation-round: 7/25`。启动 additional task 4。 |
| k7 | 审计 | M-03：D4（match-builtin-precheck-bypass）独立复验与对抗通过；builtin collection 门禁与 D3 不退化。验证缺口：钉入 D4b（未注册 contains 必须扩展错误文案）后 18/18 绿。无新实现缺陷。M-03→已完成。推进 M-04。启动 additional task 3。 |
| k8 | 实现 | M-04：migration 逻辑签名纳入 property/dictionary `args`；changed 谓词双点同步；验收 `propertyTypeExtensionMigration.spec.ts` 6/6；邻近 extension 65/65 + migration.spec 90/90。M-04→待审，`implementation-round: 8/25`。启动 additional task 4。 |
| k8 | 审计 | M-04：独立复验验收 6/6→加强后 7/7、邻近 155/155 通过；manifest/changed 双点与物理 blocking 合同成立；对抗 A1–A8 通过。验证缺口：钉入 relation property args 路径。无实现缺陷。M-04→已完成。推进 M-05。启动 additional task 3。 |
| k9 | 实现 | M-05：公开教义/导出/破坏性说明。usage+generator+USAGE_GUIDE+CHANGELOG 写清 definePropertyType、Property vs Dictionary KV vs PayloadItem、Match 算子非默认、mapToDBFieldType 透传删除；公开导出面断言测试 2/2；`npm run check` 绿（codec spec TS 标注修复）。M-05→待审，`implementation-round: 9/25`。启动 additional task 4。 |
| k9 | 审计 | M-05：check + public surface 2/2、邻近 68/68 通过；最终核验 M-01..M-05 与 r23/migration/simple-refactored 全绿。验证缺口：文档合同改为 per-file 钉（不计 reopen）。无实现缺陷。M-05→已完成。全部里程碑完成；`status: 已完成`。终止，不启动新 chat。 |

## 终止总结

- **结果**：`status: 已完成`
- **设计轮**：d = 2 / 15（d1 修订 Dictionary 决策 A；d2 通过）
- **实现轮**：k = 9 / 25
- **里程碑终态**：M-01..M-05 全部 `已完成`
- **reopen**：
  - M-01 `registration-atomicity` ×1（k1）
  - M-02 `codec-args-lookup` ×1（k3）
  - M-03 `match-resolveCtx-collection` ×1（k5）、`match-builtin-precheck-bypass` ×1（k6）→ reopen-count 2，未触发收敛
  - M-04 / M-05：0
- **收敛模式**：始终 `normal`（无 domain-review / milestone-review）
- **审计统计（约）**：实现缺陷 4（D1–D4，均在同里程碑后续实现轮关闭）；验证缺口若干（relation migration 钉、Match D4b、M-05 per-file 文档钉）— 审计当场加强，不计 reopen
- **自动调整里程碑**：0
- **交付要点**：`definePropertyType`（core 逻辑表 + storage 物理表）；Property 列 DDL/codec/Match/migration args；Dictionary 仅内置 JSON KV；PayloadItem 独立宇宙；驱动未知类型不再透传；usage/API/CHANGELOG 教义与 Breaking 说明齐全

