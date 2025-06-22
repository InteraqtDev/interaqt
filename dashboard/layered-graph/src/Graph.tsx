import { RenderContext } from 'axii';
import { Entity } from './Entity';

// Graph组件的节点数据接口
export interface GraphNodeData {
  id: string;
  content: string;
  parentId?: string;
  initialHeight?: number;
}

// Graph组件的props接口
export interface GraphProps {
  nodes: GraphNodeData[];
  onLayoutComplete?: () => void;
}


// 树节点类型定义
interface TreeNode {
  id: string;
  content: string;
  children: TreeNode[];
}

export function Graph({ 
  nodes, 
  onLayoutComplete
}: GraphProps, { createElement }: RenderContext) {

  // 将平坦的节点数组转换为树结构
  const buildTree = (nodes: GraphNodeData[]): TreeNode[] => {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // 创建所有节点
    nodes.forEach(nodeData => {
      nodeMap.set(nodeData.id, {
        id: nodeData.id,
        content: nodeData.content,
        children: []
      });
    });

    // 建立父子关系
    nodes.forEach(nodeData => {
      const node = nodeMap.get(nodeData.id)!;
      if (nodeData.parentId) {
        const parent = nodeMap.get(nodeData.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // 递归渲染节点
  const renderNode = (node: TreeNode): any => {
    if (node.children.length === 0) {
      // 叶子节点：直接渲染实体
      return (
        <Entity
          id={node.id}
          content={node.content}
          width={200}
        />
      );
    }

    // 父节点：使用 flexbox 水平中线对齐
    const children = node.children.map(child => renderNode(child));

    return (
      <div key={node.id} style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        {/* 父节点 */}
        <Entity
          id={node.id}
          content={node.content}
          width={200}
        />
        
        {/* 子节点容器 */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          {children}
        </div>
      </div>
    );
  };

  // 构建树结构
  const tree = buildTree(nodes);

  // 触发布局完成回调
  if (onLayoutComplete) {
    setTimeout(onLayoutComplete, 0);
  }

  return (
    <div 
      style={{
        width: `100%`,
        height: `100%`,
        overflow: 'auto',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
      data-testid="layered-graph"
    >
      {tree.map(rootNode => renderNode(rootNode))}
    </div>
  );
}

