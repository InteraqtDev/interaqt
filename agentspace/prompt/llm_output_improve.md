# LLM Output Improve

## Prompt

`examples` 目录下是我使用大模型根据 `agentspace/examples.md` 的指导生成的示例。但是我发现生成的例子中有非常多的错误，现在你来帮我找出下面这些错误出错的原因。你需要：
1. 先仔细阅读 `agentspace/knowledge` 下的文档。理解当前项目。
2. 仔细阅读 `agentspace/prompt/examples.md` ，理解我给 LLM agent 的具体任务。
3. 帮我找到下面我指出的问题的原因。特别观察是否是文档有错误、有遗漏。把原因记录在下面的 Log 章节中。

### 错误1 定义了错误的 Action
在当前项目中，Action 其实只是是代表 Interaction 中动作的名字，没有"要执行什么操作"的含义。项目里的所有数据变化都是一种"声明式"的，是通过表达"数据是什么，按照定义应该如何变化"而不是"直接描述数据如何变化"来实现的响应式。所以不需要设计 Action 中的具体数据变化动作。
为什么 LLM 的输出里面有大量 Action 具体操作数据的信息？是我的文档有问题吗？

### 错误2 生成的项目跑不起来
生成里面还有工程上的引用错误等，测试用例没有通过。你可以通过 `npm run test:social-network` 看到错误信息。为什么项目中的测试用例已经写得很完善了，都能通过。LLM Agent 生成的代码和用例还是跑不起来。

### 错误3 生成了没必要的用户注册和登录交互
在我们的系统中，管理是用户登录之后的业务部分，不包含用户注册登录，但生成的代码中还是有了注册登录。

## Log

### 错误1的原因分析：定义了错误的 Action

经过调查发现，文档 `agentspace/knowledge/usage/05-interactions.md` 中存在严重的错误示例。文档中展示的 Action 包含了 `operation` 数组，例如：

```javascript
const CreatePost = Interaction.create({
  action: Action.create({
    name: 'createPost',
    operation: [  // 这是错误的！
      {
        type: 'create',
        entity: 'Post',
        payload: { ... }
      }
    ]
  })
})
```

但实际上，查看源代码 `src/shared/activity/Activity.ts` 中的 Action 定义，Action 类只有一个 `name` 属性：

```typescript
export const Action = createClass({
    name: 'Action',
    public: {
        name: {
            type: 'string',
            required: true
        }
    }
})
```

正确的做法是：
- Action 只是交互动作的名字标识
- 实际的数据变化通过 Relation 和 Property 的 `computation` 来声明式地定义
- 使用 `Transform.create()` 来监听交互事件并创建关系或更新数据

### 错误2的原因分析：生成的项目跑不起来

主要问题包括：

1. **依赖了错误的文档模式**：LLM 生成的代码中，Action 包含了不存在的 `operation` 数组，这不符合框架的实际设计。

2. **实体属性初始化问题**：例如 User 实体的 `isActive` 属性没有默认值，导致测试中 `expect(user.isActive).toBe(true)` 失败。

3. **响应式计算错误**：例如 `friendCount` 计算结果是 3 而不是预期的 2，说明计算逻辑有误（可能是包含了 pending 状态的好友请求）。

4. **系统实体重复注册**：出现 "entity name _Activity_ is duplicated" 错误，说明测试 setup 中多次注册了系统内置实体。

### 错误3的原因分析：生成了没必要的用户注册和登录交互

1. **文档示例误导**：文档中的很多示例包含了用户认证相关的交互，没有明确说明这些只是示例。

2. **缺少业务边界说明**：在 `agentspace/prompt/examples.md` 中没有明确说明"系统只处理登录后的业务逻辑，不包含注册登录功能"。

3. **LLM 的常识推理**：LLM 基于常见的系统设计模式，自然地认为一个完整的社交网络系统应该包含用户注册和登录功能。

### 建议的改进措施

1. **修正文档错误**：
   - 更新 `05-interactions.md` 中的所有示例，移除 Action 中的 `operation` 数组
   - 增加正确的示例，展示如何使用 `Transform` 和 `computation` 来处理数据变化

2. **完善示例指导**：
   - 在 `examples.md` 中明确说明系统的业务边界
   - 提供更清晰的需求说明，避免 LLM 做过多的推理

3. **增加框架使用指南**：
   - 创建一个"常见错误"文档，列出容易误解的地方
   - 提供从"传统命令式"到"响应式声明式"的思维转换指南

4. **改进测试示例**：
   - 提供更多正确的测试用例作为参考
   - 确保所有文档中的代码示例都是可运行的