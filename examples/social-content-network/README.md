# Example 1: 社交+内容网络

这个示例展示了如何使用 @interaqt/runtime 构建一个基本的社交内容网络系统，包含以下核心功能：

## 功能特性

### 1. 好友关系实现
- 用户注册和档案管理
- 发送/接受/拒绝好友请求
- 对称的好友关系管理
- 好友列表查询

### 2. 内容发布功能  
- 创建和编辑文章/帖子
- 发布状态管理（草稿/已发布）
- 内容分类和标签
- 内容浏览和搜索

### 3. 点赞功能的实现
- 对内容进行点赞/取消点赞
- 响应式点赞计数
- 点赞历史记录
- 用户点赞活动统计

## 响应式特性展示

该示例充分展示了框架的响应式特性：

- **自动计数更新**：当用户点赞时，帖子的点赞数自动更新
- **关系统计**：用户的好友数量、发帖数量等自动维护
- **活跃度计算**：基于用户行为自动计算用户活跃度
- **内容推荐**：基于用户关系和互动自动计算推荐内容

## 技术要点

1. **实体设计**：User、Post、Like、Friendship 等核心实体
2. **关系设计**：一对多、多对多、对称关系的应用
3. **计算属性**：Count、Transform 等响应式计算的使用
4. **交互设计**：用户操作的标准化处理
5. **权限控制**：基于角色和所有权的访问控制

## 目录结构

```
social-content-network/
├── README.md                 # 本文档
├── requirements.md           # 详细需求规格
├── src/
│   ├── entities.ts          # 实体定义
│   ├── relations.ts         # 关系定义  
│   ├── interactions.ts      # 交互定义
│   ├── computations.ts      # 响应式计算
│   └── index.ts             # 系统入口
├── tests/
│   ├── entities.test.ts     # 实体测试
│   ├── relations.test.ts    # 关系测试
│   ├── interactions.test.ts # 交互测试
│   ├── computations.test.ts # 计算测试
│   └── integration.test.ts  # 集成测试
└── docs/
    ├── api.md               # API 文档
    └── usage.md             # 使用指南
```

## 快速开始

1. 安装依赖
```bash
npm install
```

2. 运行测试
```bash
npm run test:social-network
```

3. 启动示例
```bash
npm run start:social-network
```

## 学习重点

通过这个示例，您将学会：

1. 如何设计响应式的数据模型
2. 如何处理复杂的关系逻辑
3. 如何实现自动化的数据同步
4. 如何编写高质量的测试用例
5. 如何优化响应式计算的性能

这个示例是理解 @interaqt/runtime 框架核心概念的最佳起点。