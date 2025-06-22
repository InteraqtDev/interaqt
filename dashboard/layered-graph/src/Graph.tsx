import { RenderContext, RxDOMRect } from 'axii';
import { Entity } from './Entity';
import { Connection, ConnectionManager, EntityManager, EntityTreeNode, getRelationName, RelationConnection } from './DataProcessor';
import { ConnectionLines } from './ConnectionLines';

// Graph组件的节点数据接口（保持向后兼容）
export interface GraphNodeData {
  id: string;
  name: string;
  parentId?: string;
  initialHeight?: number;
}

// 新的基于 EntityTreeNode 的 props 接口
export interface EntityGraphProps {
  entityManager: EntityManager;
  connectionManager: ConnectionManager;
  onLayoutComplete?: () => void;
}



// 树节点类型定义
interface TreeNode {
  id: string;
  name: string;
  entityNode?: EntityTreeNode; // 添加原始实体节点引用
  children: TreeNode[];
  connections: Connection[]
}


export function Graph(props: EntityGraphProps, { createElement, useLayoutEffect }: RenderContext) {
  const { connectionManager, onLayoutComplete, entityManager } = props;
  // 存储所有 Entity 的位置信息
  const entityRects = new Map<string, RxDOMRect>();
  
  
  // 将 EntityTreeNode 转换为 TreeNode
  const convertEntityNodeToTreeNode = (entityNode: EntityTreeNode): TreeNode => {
    return {
      id: entityNode.id,
      name: entityNode.name,
      entityNode: entityNode,
      children: entityNode.children.map(child => convertEntityNodeToTreeNode(child)),
      connections: entityNode.relations.map(relation => {
        return connectionManager.connectionsByName.get(getRelationName(relation))!
      })
    };
  };


  // 递归渲染节点
  const renderNode = (node: TreeNode): any => {
    if (node.children.length === 0) {
      const connections = node
      // 叶子节点：直接渲染实体
      return (
        <Entity
          id={node.id}
          entityNode={node.entityNode}
          width={200}
          connections={node.connections}
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
          entityNode={node.entityNode}
          width={200}
          connections={node.connections}
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
  const tree = entityManager.treeNodes.map(entityNode => convertEntityNodeToTreeNode(entityNode));

  if (onLayoutComplete) {
    setTimeout(onLayoutComplete, 0);
  }
  
  useLayoutEffect(() => {
    connectionManager.connections.forEach(connection => {
      console.log(connection.name, connection.sourceRect.value(), connection.targetRect.value())
    })

  })

  return (
    <div 
      style={{
        width: `100%`,
        height: `100%`,
        overflow: 'auto',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        position: 'relative'
      }}
      data-testid="layered-graph"
    >
      
      
      {/* 实体节点层 */}
      <div style={{ position: 'relative', zIndex: 2 }}>
        {tree.map(rootNode => renderNode(rootNode))}
      </div>
      <ConnectionLines
        connections={connectionManager.connections}
        containerWidth={1400}
        containerHeight={800}
        entityRects={entityRects}
      />
    </div>
  );
}

