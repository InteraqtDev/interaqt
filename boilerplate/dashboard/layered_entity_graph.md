# Layered Entity Graph

## Prompt

我现在需要一个层级的ER布局算法，它的具体规则是这样的：
1. 从左到右Column布局，父节点在左，子节点在右。
2. 一定会有一个 User 实体节点作为根节点。然后依次往右填充。
3. 父节点在水平方向上总是所有子节点的水平中线对齐。

给我一个详细的算法实现描述。特别注意的是，我需要这个算法是响应式的，既当某一个节点的高度有所变化的时候，理论上应该只有它布局下面的兄弟节点，它的父节点位置可能发生变化，而不是全局重算。
你的步骤：
1. 先设计好响应式的布局算法。写在下一章节中。
2. 在当前目录下使用 `npx create-axii-app` 创建一个 axii 应用。
3. 在应用中实现这个算法。注意不需要页面和组件，只需要使用 axii 的响应式数据就够了。
4. 使用 vitest 对算法进行模拟测试，用例也写在 dashboard 目录下，看看能不能正确响应。

## 算法描述

### 核心数据结构

```typescript
interface EntityNode {
  id: string
  height: number        // 节点高度（响应式）
  y: number            // 节点Y坐标（计算属性）
  x: number            // 节点X坐标（基于层级）
  level: number        // 层级（从0开始）
  children: EntityNode[]
  parent: EntityNode | null
}

interface LayoutState {
  nodes: Map<string, EntityNode>
  levelNodes: Map<number, EntityNode[]>  // 按层级组织的节点
  columnWidth: number   // 列宽
}
```

### 响应式布局算法

#### 1. 初始化阶段
- 从User根节点开始构建树形结构
- 计算每个节点的层级（level）
- 设置每个节点的X坐标：`x = level * columnWidth`
- 按层级分组存储节点

#### 2. Y坐标计算算法
使用递归的方式计算每个节点的Y坐标：

```typescript
function calculateNodeY(node: EntityNode): number {
  if (node.children.length === 0) {
    // 叶子节点：Y坐标为其在同层级中的累积位置
    return calculateLeafNodeY(node)
  }
  
  // 父节点：Y坐标为所有子节点的中心位置
  const childrenYPositions = node.children.map(child => calculateNodeY(child))
  const minY = Math.min(...childrenYPositions)
  const maxY = Math.max(...childrenYPositions.map((y, i) => y + node.children[i].height))
  
  return minY + (maxY - minY) / 2 - node.height / 2
}

function calculateLeafNodeY(node: EntityNode): number {
  const sameLevel = levelNodes.get(node.level) || []
  const nodeIndex = sameLevel.indexOf(node)
  
  let accumulatedY = 0
  for (let i = 0; i < nodeIndex; i++) {
    accumulatedY += sameLevel[i].height + VERTICAL_SPACING
  }
  
  return accumulatedY
}
```

#### 3. 响应式更新机制
当某个节点的高度发生变化时，采用局部更新策略：

```typescript
function onNodeHeightChange(changedNode: EntityNode) {
  // 1. 重新计算该节点所在层级的所有节点Y坐标
  updateLevelLayout(changedNode.level)
  
  // 2. 向上递归更新父节点位置
  updateParentNodes(changedNode.parent)
  
  // 3. 向下递归更新子节点相对位置（如果必要）
  updateChildrenNodes(changedNode)
}

function updateLevelLayout(level: number) {
  const nodesAtLevel = levelNodes.get(level) || []
  let currentY = 0
  
  for (const node of nodesAtLevel) {
    node.y = currentY
    currentY += node.height + VERTICAL_SPACING
  }
}

function updateParentNodes(parent: EntityNode | null) {
  if (!parent) return
  
  // 重新计算父节点的Y坐标（基于子节点中心对齐）
  const childrenBounds = getChildrenBounds(parent.children)
  parent.y = childrenBounds.centerY - parent.height / 2
  
  // 递归更新父节点的父节点
  updateParentNodes(parent.parent)
}
```

#### 4. 性能优化策略
- **脏标记机制**：只重新计算被影响的节点
- **批量更新**：将多个变化合并到一次布局更新中
- **缓存计算结果**：缓存子树的边界信息
- **增量更新**：只更新变化的部分，而不是全局重排

#### 5. 算法特点
1. **局部性**：节点高度变化只影响其兄弟节点、父节点链和子节点
2. **响应式**：使用观察者模式，节点高度变化自动触发布局更新
3. **高效性**：避免全局重排，时间复杂度为O(affected_nodes)
4. **一致性**：保证父节点始终与子节点中心对齐

### 实现要点
- 使用响应式数据系统（如 axii）来监听节点高度变化
- 维护层级索引以快速定位同层节点
- 实现懒惰计算，避免不必要的重新布局
- 处理边界情况（单个节点、空子树等）