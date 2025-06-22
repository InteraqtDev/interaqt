# View Intergrate

## Prompt

分层 ER 图布局算法已经写好，接下来你来帮我开始整合到前端视图中。为了完成工作，你需要：
1. 学习 axii 前端框架的使用规则。可以通过当前目录下的 `cursor.json` 来学习。
2. 开始写 Entity 节点组件，节点应该是宽度一开始就指定，高度是由内容撑开的。节点的真实高度应该在渲染之后可以通过 axii 提供的 RxSize 等方法拿到。Entity 应该接受具体布局的响应式数据，使用 absolute 布局到具体位置。
3. 写 Graph 组件，它根据数据来渲染 Entity 组件，传入布局相关的响应式数据（一开始可以都初始化为 0）。渲染完成后才调用布局算法，更新所有布局响应式数据。因为数据是响应式的，所以组件在响应式数据更新后应该就自动到相应位置了。
4. 利用 vitest 写测试用例来测试这些组件，看看初始布局、动态添加节点后的布局是否正确。
5. 将实现细节记录在下面的章节中。

## Document

### 实现概述

已成功实现Entity节点组件和Graph组件，将LayeredEntityGraph算法集成到axii前端框架中。

### Entity组件实现 (`src/Entity.tsx`)

#### 核心特性
- **固定宽度**：默认200px宽度，可通过props配置
- **内容撑开高度**：高度由内容自动决定，最小50px
- **RxSize集成**：使用axii-ui的RxSize组件监听真实渲染高度
- **响应式位置**：接受atom类型的x, y坐标，支持动态位置更新
- **绝对定位**：使用CSS absolute定位到具体坐标

#### 接口设计
```typescript
export interface EntityProps {
  id: string;
  content: string;
  x: ReturnType<typeof atom<number>>;
  y: ReturnType<typeof atom<number>>;
  sizeState: RxDOMSize;
  width?: number;
}
```

#### 高度检测机制
- 使用axii的`RxDOMSize`类监听DOM元素尺寸变化
- **Graph组件**为每个节点创建独立的RxDOMSize实例
- **Entity组件**接收sizeState并使用`sizeState.ref`作为DOM元素的ref属性
- **Graph组件**通过`sizeState.value()`响应式监听尺寸变化
- 移除回调机制，采用纯响应式数据流设计

#### 样式设计
- 使用内联样式，避免外部样式库依赖
- 卡片式设计，带阴影和圆角边框
- 支持过渡动画，提供良好的视觉反馈
- 响应式绝对定位布局

### Graph组件实现 (`src/Graph.tsx`)

#### 核心特性
- **批量初始化**：使用LayeredEntityGraph的批量创建优化初始渲染性能
- **响应式布局**：Entity位置通过atom状态管理，自动响应布局变化
- **动态节点添加**：支持运行时添加新节点并更新布局
- **高度响应**：监听Entity高度变化，自动触发布局重新计算

#### 接口设计
```typescript
export interface GraphNodeData {
  id: string;
  content: string;
  parentId?: string;
  initialHeight?: number;
}

export interface GraphProps {
  nodes: GraphNodeData[];
  width?: number;
  height?: number;
  onLayoutComplete?: () => void;
}
```

#### 初始化流程
1. 创建LayeredEntityGraph实例
2. 将GraphNodeData转换为算法所需的配置格式
3. 使用batchCreateNodes批量创建布局节点
4. 为每个节点创建响应式的x, y atom状态
5. 将布局节点映射到渲染节点列表

#### 响应式更新机制
- 使用RxList管理渲染节点集合
- 每个renderNode包含Entity组件所需的响应式状态和独立的RxDOMSize实例
- 使用`autorun(() => { sizeState.value() })`响应式监听每个节点的尺寸变化
- 尺寸变化自动触发layoutGraph.updateNodeHeight()
- 无需手动回调，纯响应式数据流驱动布局更新

#### 性能优化
- 初始化使用批量创建减少computed属性创建开销
- 使用requestAnimationFrame异步更新位置避免阻塞渲染
- 延迟初始化确保DOM准备完成

### 集成测试 (`src/Components.test.ts`)

#### 测试覆盖范围
- Entity组件的响应式属性验证
- Graph组件与LayeredEntityGraph的集成测试
- 复杂层级结构的布局验证
- 动态节点添加和高度更新的响应式行为
- 批量创建与单独操作的混合使用场景

#### 测试策略
- 使用vi.mock模拟axii-ui组件依赖
- 专注于数据结构和算法逻辑测试
- 验证响应式状态管理的正确性
- 避免DOM渲染测试，专注业务逻辑

### 技术要点

#### Axii框架集成
- 遵循cursor.json中的axii使用规范
- 正确使用atom, computed, RxList, autorun等响应式原语
- 使用axii核心的RxDOMSize进行DOM尺寸监听
- 使用autorun进行响应式监听，符合axii的响应式架构
- 符合axii组件的函数式编程模式

#### 响应式设计模式
- 使用atom管理可变状态（位置坐标）
- 使用computed处理派生状态（布局计算）
- 使用autorun + RxDOMSize.value()监听DOM尺寸变化
- 移除回调机制，采用纯响应式数据流架构
- Graph组件统一管理所有RxDOMSize实例，实现集中式响应式监听

#### 性能考虑
- 批量处理避免频繁的computed重新计算
- 延迟初始化确保渲染时机正确
- 使用异步更新避免同步阻塞
- 最小化不必要的响应式依赖

### 已知限制

1. **节点删除响应式问题**：删除节点时computed属性不会自动更新，这是axii响应式系统的限制
2. **手动位置同步**：需要手动同步EntityNode和renderNode的位置状态
3. **DOM依赖**：RxDOMSize需要真实DOM环境，测试时需要mock ResizeObserver

### 架构优势

#### 纯响应式设计
- **无回调污染**：移除了传统的onHeightChange回调机制
- **数据流清晰**：尺寸变化 → layoutGraph.updateNodeHeight() → 位置重新计算
- **集中管理**：Graph组件统一管理所有节点的RxDOMSize实例

#### 符合axii理念
- **响应式优先**：充分利用axii的响应式能力
- **组件职责清晰**：Entity专注渲染，Graph专注布局管理
- **API简洁**：减少了组件间的耦合度

### 修正记录

#### RxDOMSize使用修正

##### 第一阶段：组件设计错误
- **问题1**：初始实现错误地假设axii-ui提供RxSize组件
- **修正1**：改用axii核心的RxDOMSize类进行DOM尺寸监听
- **问题2**：错误地使用createRef+useLayoutEffect手动管理RxDOMSize
- **修正2**：直接使用RxDOMSize内置的ref方法

##### 第二阶段：架构设计优化
- **问题3**：Entity组件内部创建RxDOMSize，使用回调传递高度变化
- **修正3**：Graph组件创建RxDOMSize实例并传递给Entity组件
- **问题4**：错误地使用`sizeState.value(callback)`进行监听
- **修正4**：使用axii的`autorun`API进行响应式监听
- **效果**：采用纯响应式架构，符合axii框架设计理念

```typescript
// 最终正确的响应式监听方式

// Graph组件中：
import { autorun } from 'axii';

const sizeState = new RxDOMSize();
const renderNode = {
  id: entityNode.id,
  sizeState,
  // ... 其他属性
};

// 使用autorun响应式监听尺寸变化
autorun(() => {
  const sizeObject = sizeState.value();
  if (sizeObject) {
    const newHeight = sizeObject.height;
    layoutGraph.updateNodeHeight(entityNode.id, newHeight);
  }
});

// Entity组件中：
<div ref={sizeState.ref}>
  {/* 内容 */}
</div>
```

### 完整演示应用 (`src/App.tsx`)

#### 演示内容
- **双示例切换**：基本示例(3节点) vs 复杂示例(7节点)
- **实时Graph组件**：完整展示Entity和Graph的集成效果
- **特性展示**：智能布局、响应式更新、批量优化、易于集成
- **使用指南**：代码示例和API说明

#### 演示特点
```typescript
// 响应式示例切换
const currentExample = atom<'simple' | 'complex'>('simple');
const currentGraphData = computed(() => {
  return currentExample() === 'simple' ? simpleGraphData : complexGraphData;
});

// Graph组件使用
<Graph
  nodes={currentGraphData()}
  width={1200}
  height={500}
  onLayoutComplete={handleLayoutComplete}
/>
```

#### 访问方式
运行`npm run dev`后访问 http://localhost:5173/ 查看完整演示

### 后续优化方向

1. 实现更智能的响应式位置同步机制
2. 添加节点删除的布局响应支持
3. 支持更多的布局配置选项（间距、宽度等）
4. 添加动画过渡效果
5. 优化大规模节点的渲染性能
6. 添加节点选择和编辑功能
7. 支持自定义节点样式和主题