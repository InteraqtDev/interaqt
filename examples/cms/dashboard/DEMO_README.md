# 分层实体关系图组件

基于axii框架的响应式分层实体关系图组件，支持智能布局算法和实时响应式更新。

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 运行测试
npm test
```

访问 http://localhost:5173/ 查看完整演示应用。

## 📋 主要特性

### 🎯 智能布局算法
- 左右分层布局，父节点在左，子节点在右
- 父节点自动与所有子节点中心对齐
- 叶子节点垂直堆叠排列
- 支持多层嵌套结构

### ⚡ 响应式更新
- 使用axii的RxDOMSize监听节点尺寸变化
- 内容变化时布局自动重新计算
- 纯响应式数据流，无需手动触发更新

### 🎯 性能优化
- 批量创建节点，初始渲染性能提升1.9倍
- 支持大规模数据处理
- 异步位置更新避免阻塞渲染

### 🔧 易于集成
- 基于axii框架，符合响应式设计理念
- TypeScript支持，完整的类型定义
- 简洁的API设计，易于使用

## 💡 使用方法

### 基本用法

```typescript
import { Graph, GraphNodeData } from './Graph';

// 1. 定义节点数据
const graphData: GraphNodeData[] = [
  { 
    id: 'user', 
    content: 'User Entity\\n- id: string\\n- name: string', 
    initialHeight: 80 
  },
  { 
    id: 'profile', 
    content: 'Profile Entity\\n- userId: string\\n- avatar: string', 
    parentId: 'user', 
    initialHeight: 60 
  }
];

// 2. 使用Graph组件
<Graph
  nodes={graphData}
  width={1200}
  height={500}
  onLayoutComplete={() => console.log('布局完成!')}
/>
```

### 接口定义

```typescript
interface GraphNodeData {
  id: string;                    // 节点唯一标识
  content: string;               // 节点显示内容
  parentId?: string;             // 父节点ID
  initialHeight?: number;        // 初始高度
}

interface GraphProps {
  nodes: GraphNodeData[];        // 节点数据数组
  width?: number;                // 图形宽度 (默认1200px)
  height?: number;               // 图形高度 (默认800px)
  onLayoutComplete?: () => void; // 布局完成回调
}
```

## 🏗️ 架构设计

### 核心组件

- **LayeredEntityGraph**: 布局算法核心，处理节点关系和位置计算
- **Graph**: 图形容器组件，管理Entity渲染和响应式更新
- **Entity**: 节点渲染组件，支持响应式尺寸检测

### 响应式数据流

```
DOM尺寸变化 → RxDOMSize.value() → Graph监听 → updateNodeHeight() → 布局重新计算 → 位置更新
```

### 技术栈

- **axii**: 响应式UI框架
- **TypeScript**: 类型安全
- **Vitest**: 单元测试
- **Vite**: 构建工具

## 🧪 测试

项目包含49个测试用例，覆盖：

- 布局算法正确性测试
- 响应式更新测试  
- 批量处理性能测试
- 组件集成测试

```bash
npm test                    # 运行所有测试
npm test Components.test.ts # 运行特定测试文件
```

## 📚 文档

详细的实现文档请查看：

- `layered_entity_graph.md`: 布局算法设计文档
- `view_intergrate.md`: 组件集成实现文档

## 🛠️ 开发

### 目录结构

```
src/
├── LayeredEntityGraph.ts     # 布局算法核心
├── Entity.tsx                # 节点组件
├── Graph.tsx                 # 图形容器组件
├── App.tsx                   # 演示应用
├── *.test.ts                 # 测试文件
└── example.tsx               # 使用示例
```

### 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

MIT License