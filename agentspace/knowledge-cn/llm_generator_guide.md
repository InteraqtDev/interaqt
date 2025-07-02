# LLM Generator Guide - 用例驱动的 interaqt 应用生成指南

## 核心原则：用例驱动开发（Test-Case Driven Development）

在使用 LLM 生成 interaqt 应用时，必须遵循**用例驱动**的开发流程。这能确保：
1. 生成的代码没有幻觉，每个功能都有明确的验收标准
2. 所有交互和计算都被测试覆盖
3. **前后端功能完全对齐：前端是后端的精确映射，不多不少**
4. 前端所有功能都从后端用例衍生，没有独立存在的前端功能

## 一、后端生成流程

### 1. 深入学习框架（必须完成）
1. **理解核心理念**：详细阅读 `agentspace/knowledge/usage/00-mindset-shift.md`，理解从"操作数据"到"声明数据本质"的思维转换
2. **学习框架概念**：阅读 `agentspace/knowledge` 下的所有文档，掌握 Entity、Relation、Interaction、Computation 等核心概念
3. **研究示例代码**：学习 `tests` 和 `examples` 下的源码，理解响应式计算的实际应用

### 2. 需求分析与用例设计（关键步骤）
1. **需求梳理**：
   - 分析用户的业务需求，补充模糊或缺失的细节
   - 从数据角度分析：识别所有实体、属性、关系
   - 从交互角度分析：列出所有用户操作、权限要求、业务流程
   - 创建 `requirements/detailed-requirements.md` 文档

2. **用例文档编写**（新增关键步骤）：
   - 创建 `requirements/test-cases.md` 文档
   - 为每个实体编写 CRUD 测试用例
   - 为每个交互编写完整的测试场景
   - 为每个计算属性编写验证用例
   - 为每个业务流程编写端到端用例
   - 示例格式：
   ```markdown
   ## TC001: 创建文章
   - 前置条件：用户已登录且有发布权限
   - 输入数据：title="技术分享", content="内容...", tags=["前端", "React"]
   - 预期结果：
     1. 创建新文章记录
     2. 文章状态为 draft（草稿）
     3. 创建时间为当前时间
     4. 作者关联到当前用户
     5. 用户的文章数量自动 +1
   - 后置验证：文章出现在用户的文章列表中
   
   ## TC002: 点赞文章
   - 前置条件：文章存在且用户未点赞过该文章
   - 输入数据：postId="post123"
   - 预期结果：
     1. 创建点赞关系记录
     2. 文章的点赞数自动 +1
     3. 用户的点赞列表包含该文章
   - 异常场景：重复点赞应该失败
   ```

3. **交互矩阵**（确保完整性）：
   创建 `requirements/interaction-matrix.md`，确保：
   - 每个用户角色的所有操作都有对应的 Interaction
   - 每个 Interaction 都有明确的权限控制
   - 每个 Interaction 都有对应的测试用例

### 3. 代码生成与实现
1. **项目结构**：
   ```
   generated-project/
   ├── requirements/          # 需求和用例文档
   │   ├── detailed-requirements.md
   │   ├── test-cases.md
   │   └── interaction-matrix.md
   ├── backend/                   # 后端源码
   │   ├── entities/
   │   ├── relations/
   │   ├── interactions/
   │   ├── computations/
   │   └── index.ts
   ├── tests/                 # 测试代码
   │   ├── entities/
   │   ├── interactions/
   │   ├── computations/
   │   └── e2e/
   └── frontend/             # 前端代码
   ```

2. **实现顺序**（严格遵循）：
   - 先实现所有 Entity 和 Property
   - 再实现所有 Relation
   - 然后实现所有 Computation（Count、Transform 等）
   - 最后实现所有 Interaction 和 Activity
   - 每完成一个模块，立即编写对应的测试

### 4. 测试驱动验证
1. **测试框架配置**：
   - 使用 vitest 作为测试框架
   - 配置测试数据库（使用 PGLite 的内存模式）
   - 创建测试工具函数和数据工厂

2. **测试覆盖要求**：
   - 所有 Entity 的 CRUD 操作必须有测试
   - 所有 Interaction 必须有至少一个成功用例和一个失败用例
   - 所有带 computation 的属性必须验证其自动计算逻辑
   - 所有权限控制必须有正面和负面测试

3. **测试执行**：
   ```bash
   npm test                    # 运行所有测试
   npm test -- --coverage      # 查看测试覆盖率
   ```

### 5. 文档生成
创建 `docs/` 目录，包含：
- `architecture.md`：从需求到实现的架构设计文档
- `api-reference.md`：所有 Interaction 的 API 文档
- `data-model.md`：实体关系图和数据字典
- `computation-logic.md`：所有响应式计算的逻辑说明

### 6. 后端质量保证清单

- [ ] 所有需求都有对应的测试用例
- [ ] 所有测试用例都有对应的测试代码
- [ ] 测试覆盖率达到 100% 
- [ ] 没有虚构不存在的 Entity 或 Interaction
- [ ] 所有响应式计算都正确触发
- [ ] 权限控制测试完整
- [ ] 所有 Entity 的 CRUD 操作都有测试
- [ ] 所有 Interaction 都有成功和失败用例
- [ ] 所有 computation 属性都验证了自动计算逻辑
- [ ] test-cases.md 文档完整且与代码一致
- [ ] interaction-matrix.md 覆盖所有用户角色和操作
- [ ] 所有关系（Relation）都有正确的级联行为测试

## 二、前端生成流程

### 1. 前端项目初始化
```bash
cd generated-project
npx create-axii-app frontend
cd frontend
```

### 2. 学习前端框架
- 仔细阅读 `frontend/cursor.json` 中的 axii 框架指引
- 理解 axii 的响应式 UI 编程模型
- 不要使用其他框架的经验，axii 是独特的

### 3. 前端用例设计（关键步骤）

**核心原则：前端用例必须完全从后端用例衍生**
- 前端不能有后端不存在的功能
- 后端的每个功能都必须在前端有对应的界面
- 前端用例是后端用例的 UI 表现形式

1. **用例映射分析**：
   创建 `frontend/requirements/backend-frontend-mapping.md`：
   ```markdown
   ## 后端到前端的用例映射
   
   ### TC001: 创建文章 → UTC001: 文章创建界面
   - 后端交互：CreatePost
   - 前端页面：/posts/new
   - UI 元素：标题输入框、内容编辑器、标签选择器、提交按钮
   - 数据验证：与后端保持一致
   
   ### TC002: 点赞文章 → UTC002: 点赞按钮
   - 后端交互：LikePost
   - 前端位置：文章详情页、文章列表项
   - UI 元素：点赞图标、点赞数显示
   - 状态管理：已点赞/未点赞状态
   ```

2. **页面规划**：
   创建 `frontend/requirements/page-plan.md`：
   - 基于后端 Interaction 规划页面
   - 每个页面明确列出调用的后端 API
   - 确保没有虚构的功能或缺失的功能

3. **UI 测试用例**：
   创建 `frontend/requirements/ui-test-cases.md`：
   - **必须基于 `test-cases.md` 中的后端用例**
   - 每个后端测试用例都要有对应的 UI 测试用例
   - 不能添加后端没有的功能测试
   
   示例：
   ```markdown
   ## UTC001: 文章创建界面（对应 TC001）
   - 前置条件：用户已登录且有发布权限
   - 页面：/posts/new
   - 步骤：
     1. 填写标题："技术分享"
     2. 输入内容："内容..."
     3. 选择标签："前端"、"React"
     4. 点击"保存草稿"按钮
   - 预期结果：
     1. 调用 CreatePost API
     2. 显示加载状态
     3. 成功后跳转到文章详情页
     4. 文章状态显示为"草稿"
   - 验证点：与 TC001 的预期结果完全对应
   
   ## UTC002: 点赞功能（对应 TC002）
   - 前置条件：查看未点赞的文章
   - 页面：/posts/:id
   - 步骤：
     1. 点击点赞按钮
   - 预期结果：
     1. 调用 LikePost API
     2. 点赞数 +1
     3. 按钮状态变为已点赞
   - 异常测试：重复点击应显示"已点赞"提示
   ```

4. **功能完整性检查**：
   创建 `frontend/requirements/completeness-check.md`：
   ```markdown
   ## 后端功能覆盖检查表
   
   ### Interactions
   - [ ] CreatePost → 新建文章页面
   - [ ] UpdatePost → 编辑文章页面
   - [ ] DeletePost → 删除按钮
   - [ ] LikePost → 点赞按钮
   - [ ] GetPosts → 文章列表页
   - [ ] GetPostDetail → 文章详情页
   
   ### Computed Properties
   - [ ] postCount → 用户资料页显示
   - [ ] likeCount → 文章卡片显示
   - [ ] isLiked → 点赞按钮状态
   
   ### 确认事项
   - [ ] 没有后端不存在的功能
   - [ ] 没有遗漏的后端功能
   - [ ] 所有数据展示都来自后端 API
   ```

### 4. 前端实现
1. **Mock 数据先行**：
   - 先使用模拟数据实现所有页面
   - 确保 UI 交互流程完整
   - 验证所有用例可以走通

2. **集成真实 API**：
   - 创建 API 客户端封装
   - 将模拟数据替换为真实的后端调用
   - 处理加载状态和错误情况

3. **前端测试**：
   - 使用 vitest 编写组件测试
   - 使用 @testing-library/user-event 模拟用户交互
   - 确保所有 UI 测试用例通过

### 5. 前端质量保证清单

- [ ] **每个后端 Interaction 都有且仅有一个对应的 UI 入口**
- [ ] **每个前端功能都能在后端找到对应的 Interaction**
- [ ] 所有数据展示都对应真实的 Entity/Relation
- [ ] 错误处理和加载状态完整
- [ ] UI 测试用例全部通过
- [ ] 没有调用不存在的 API
- [ ] **completeness-check.md 中的所有项都已勾选**
- [ ] 后端 test-cases.md 与前端 ui-test-cases.md 一一对应
- [ ] backend-frontend-mapping.md 完整且准确
- [ ] 没有前端独有的功能（如前端验证必须与后端一致）
- [ ] 没有后端功能在前端缺失
- [ ] API 参数、返回值与前端使用完全匹配
- [ ] 权限控制逻辑前后端完全一致

## 三、集成测试与验收

### 1. 集成测试
- 前后端联调测试
- 端到端业务流程测试
- 性能测试和压力测试

### 2. 集成检查清单
- [ ] 前后端数据模型一致
- [ ] API 调用参数匹配
- [ ] 权限控制前后端一致
- [ ] 端到端测试用例通过
- [ ] 所有业务流程可以完整走通
- [ ] 错误处理机制完善

## 四、常见错误预防

1. **避免命令式思维**：
   - ❌ 不要在 Interaction 中写业务逻辑
   - ✅ 使用 Computation 声明数据关系

2. **避免虚构功能**：
   - ❌ 不要凭空创造后端不存在的 API
   - ✅ 严格基于 test-cases.md 实现功能

3. **避免过度设计**：
   - ❌ 不要创建用例中没有的功能
   - ✅ 严格按照用例实现，不多不少

4. **避免测试遗漏**：
   - ❌ 不要先写代码后补测试
   - ✅ 用例驱动，测试先行

5. **避免前后端脱节**：
   - ❌ 不要在前端添加后端没有的功能（如本地筛选、排序）
   - ❌ 不要遗漏后端功能的 UI 实现
   - ❌ 不要在前端做与后端不一致的数据验证
   - ✅ 前端功能严格从后端用例衍生
   - ✅ 使用 backend-frontend-mapping.md 确保对齐
   - ✅ 前端验证规则必须与后端保持一致

通过严格遵循这个用例驱动的流程，确保前端功能完全从后端用例衍生，可以生成功能完整、前后端高度对齐、质量可靠的 interaqt 应用。