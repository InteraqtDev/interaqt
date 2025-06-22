import { atom, computed } from "axii";

// 常量定义
const VERTICAL_SPACING = 20;
const COLUMN_WIDTH = 200;

// 核心数据结构
export interface EntityNode {
  id: string;
  height: ReturnType<typeof atom<number>>;  // 响应式高度
  y: ReturnType<typeof computed<number>>;   // 计算属性Y坐标
  x: number;                                // X坐标（基于层级）
  level: number;                            // 层级
  children: EntityNode[];
  parent: EntityNode | null;
}

export class LayeredEntityGraph {
  private nodes = new Map<string, EntityNode>();
  private levelNodes = new Map<number, EntityNode[]>();
  private rootNode: EntityNode | null = null;
  private batchMode = false;
  private pendingComputedCreation: (() => void)[] = [];

  constructor(enableBatchMode = false) {
    this.batchMode = enableBatchMode;
  }

  // 创建节点
  createNode(id: string, parentId?: string, initialHeight: number = 50): EntityNode {
    const parent = parentId ? (this.nodes.get(parentId) || null) : null;
    const level = parent ? parent.level + 1 : 0;
    
    const height = atom(initialHeight);
    
    // 先创建一个临时的节点对象，不包含computed属性
    const tempNode = {
      id,
      height,
      x: level * COLUMN_WIDTH,
      level,
      children: [] as EntityNode[],
      parent,
      y: null as any, // 临时占位符
    };

    // 先将节点添加到maps中
    this.nodes.set(id, tempNode as EntityNode);
    
    // 添加到层级索引
    if (!this.levelNodes.has(level)) {
      this.levelNodes.set(level, []);
    }
    this.levelNodes.get(level)!.push(tempNode as EntityNode);

    // 建立父子关系
    if (parent) {
      parent.children.push(tempNode as EntityNode);
    } else {
      this.rootNode = tempNode as EntityNode;
    }

    if (this.batchMode) {
      // 批量模式：延迟创建computed属性，先使用null占位
      tempNode.y = null as any;
      const node = tempNode as EntityNode;

      // 保存创建computed的回调，稍后批量执行
      this.pendingComputedCreation.push(() => {
        const y = computed<number>(() => {
          try {
            const fullNode = this.nodes.get(id);
            if (!fullNode) {
              return 0;
            }
            const result = this.calculateNodeY(fullNode);
            return result;
          } catch (error) {
            console.error('Error in computed Y for node', id, error);
            return 0;
          }
        });
        node.y = y;
      });

      return node;
    } else {
      // 正常模式：立即创建computed属性
      const y = computed(() => {
        try {
          const fullNode = this.nodes.get(id);
          if (!fullNode) {
            return 0;
          }
          const result = this.calculateNodeY(fullNode);
          return result;
        } catch (error) {
          console.error('Error in computed Y for node', id, error);
          return 0;
        }
      });

      // 现在更新节点对象，替换临时的y属性
      tempNode.y = y;
      const node = tempNode as EntityNode;

      // 更新所有的引用
      this.nodes.set(id, node);

      return node;
    }
  }

  // 批量创建节点
  batchCreateNodes(nodeConfigs: Array<{id: string, parentId?: string, height: number}>): EntityNode[] {
    const wasInBatchMode = this.batchMode;
    this.batchMode = true;
    
    const createdNodes: EntityNode[] = [];
    
    try {
      // 创建所有节点但不计算computed属性
      for (const config of nodeConfigs) {
        const node = this.createNode(config.id, config.parentId, config.height);
        createdNodes.push(node);
      }
      
      // 完成批量添加后，批量创建computed属性
      this.finalizeBatch();
      
    } finally {
      // 如果原来不在批量模式，确保退出批量模式
      if (!wasInBatchMode) {
        this.batchMode = false;
      }
    }
    
    return createdNodes;
  }

  // 完成批量处理，创建所有delayed computed属性
  finalizeBatch(): void {
    if (!this.batchMode && this.pendingComputedCreation.length === 0) {
      return;
    }

    // 批量创建所有computed属性
    for (const createComputed of this.pendingComputedCreation) {
      createComputed();
    }
    
    // 清空待处理列表
    this.pendingComputedCreation = [];
    
    // 退出批量模式
    this.batchMode = false;
  }

  // 进入批量模式
  enableBatchMode(): void {
    this.batchMode = true;
  }

  // 退出批量模式并完成所有延迟计算
  disableBatchMode(): void {
    this.finalizeBatch();
  }

  // 检查是否在批量模式
  isBatchMode(): boolean {
    return this.batchMode;
  }

  // 计算节点Y坐标
  private calculateNodeY(node: EntityNode): number {
    // 处理循环依赖的安全检查
    try {
      if (node.children.length === 0) {
        // 叶子节点：基于同层级的累积位置
        return this.calculateLeafNodeY(node);
      }
      
      // 父节点：基于子节点的中心对齐
      if (node.children.length > 0) {
        // 避免循环依赖：直接计算子节点的Y坐标而不是调用computed
        const childrenInfo = node.children.map(child => {
          let childY;
          if (child.children.length === 0) {
            // 叶子节点，直接计算
            childY = this.calculateLeafNodeY(child);
          } else {
            // 递归计算，但注意避免无限循环
            childY = this.calculateNodeY(child);
          }
          return { y: childY, height: child.height() };
        });
        
        if (childrenInfo.length === 0) return 0;
        
        const minY = Math.min(...childrenInfo.map(info => info.y));
        const maxY = Math.max(...childrenInfo.map(info => info.y + info.height!));
        
        return minY + (maxY - minY) / 2 - node.height()! / 2;
      }
      
      return 0;
    } catch (error) {
      // 在计算过程中出现错误时返回默认值
      return 0;
    }
  }

  // 计算叶子节点Y坐标
  private calculateLeafNodeY(node: EntityNode): number {
    const sameLevel = this.levelNodes.get(node.level) || [];
    
    // 找到所有叶子节点并按照它们在levelNodes中的顺序排序
    const leafNodes = sameLevel.filter(n => n.children.length === 0);
    const nodeIndex = leafNodes.indexOf(node);
    
    if (nodeIndex === -1) return 0; // 节点不在叶子节点列表中
    
    let accumulatedY = 0;
    for (let i = 0; i < nodeIndex; i++) {
      accumulatedY += leafNodes[i].height()! + VERTICAL_SPACING;
    }
    
    return accumulatedY;
  }

  // 响应式更新机制
  // 由于使用了computed属性，axii会自动处理依赖更新
  // 当节点高度变化时，相关的Y坐标会自动重新计算

  // 获取节点
  getNode(id: string): EntityNode | undefined {
    return this.nodes.get(id);
  }

  // 获取所有节点
  getAllNodes(): EntityNode[] {
    return Array.from(this.nodes.values());
  }

  // 获取特定层级的节点
  getNodesAtLevel(level: number): EntityNode[] {
    return this.levelNodes.get(level) || [];
  }

  // 获取根节点
  getRootNode(): EntityNode | null {
    return this.rootNode;
  }

  // 更新节点高度
  updateNodeHeight(id: string, newHeight: number) {
    const node = this.nodes.get(id);
    if (node) {
      node.height(newHeight);
    }
  }

  // 获取图形边界
  getBounds() {
    const allNodes = this.getAllNodes();
    if (allNodes.length === 0) {
      return { width: 0, height: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    const positions = allNodes.map(node => ({
      x: node.x,
      y: node.y(),
      width: COLUMN_WIDTH,
      height: node.height()
    }));

    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x + p.width));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y + p.height!));

    return {
      width: maxX - minX,
      height: maxY - minY,
      minX,
      maxX,
      minY,
      maxY
    };
  }

  // 删除节点
  removeNode(id: string) {
    const node = this.nodes.get(id);
    if (!node) return;

    // 从父节点移除
    if (node.parent) {
      const index = node.parent.children.indexOf(node);
      if (index > -1) {
        node.parent.children.splice(index, 1);
      }
    }

    // 递归删除子节点
    [...node.children].forEach(child => {
      this.removeNode(child.id);
    });

    // 从层级索引中移除
    const levelNodes = this.levelNodes.get(node.level);
    if (levelNodes) {
      const index = levelNodes.indexOf(node);
      if (index > -1) {
        levelNodes.splice(index, 1);
      }
    }

    // 从节点映射中移除
    this.nodes.delete(id);

    // 如果是根节点，清空根节点引用
    if (this.rootNode === node) {
      this.rootNode = null;
    }
  }
}