import { atom, RenderContext, RxDOMRect, RxList } from 'axii';
import { Entity } from './Entity';
import { Connection, ConnectionManager, convertEntitiesToGraphData, EntityManager, EntityTreeNode, getRelationName, RelationConnection } from './DataProcessor';
import { ConnectionLines } from './ConnectionLines';
import { EntityInstance, RelationInstance } from '@shared'
// Graph组件的节点数据接口（保持向后兼容）
export interface GraphNodeData {
  id: string;
  name: string;
  parentId?: string;
  initialHeight?: number;
}




// 树节点类型定义
interface TreeNode {
  id: string;
  name: string;
  entityNode?: EntityTreeNode; // 添加原始实体节点引用
  children: TreeNode[];
  connections: Connection[]
}

// 新的基于 EntityTreeNode 的 props 接口
export interface EntityGraphProps {
  entities: RxList<EntityInstance>;
  relations: RxList<RelationInstance>;
  entityWidth?: number;
}

export function Graph(props: EntityGraphProps, { createElement, useLayoutEffect }: RenderContext) {

  const containerRect = new RxDOMRect(atom(null), {type: 'interval', duration:500})
  const {entityWidth = 200, entities, relations} = props
  // 使用新的数据转换器
  const { entityManager, connectionManager } = convertEntitiesToGraphData(entities, relations, 'User');
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
        const sourceEntity = relation.source as EntityInstance;
        const targetEntity = relation.target as EntityInstance;
        const relationName = `${sourceEntity.name}-${relation.sourceProperty}-${targetEntity.name}-${relation.targetProperty}`;
        return connectionManager.connectionsByName.get(relationName)!
      })
    };
  };


  // 递归渲染节点
  const renderNode = (node: TreeNode): any => {
    // Find the entity instance
    const entity = entities.raw.find(e => e.name === node.name);
    
    if (node.children.length === 0) {
      const connections = node
      // 叶子节点：直接渲染实体
      return (
        <Entity
          id={node.id}
          entityNode={node.entityNode}
          entity={entity}
          allEntities={entities.raw}
          width={entityWidth}
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
          entity={entity}
          allEntities={entities.raw}
          width={entityWidth}
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

  
  useLayoutEffect(() => {
    connectionManager.connections.forEach(connection => {
      console.log(connection.name, connection.sourceRect.value(), connection.targetRect.value())
    })

  })

  return (
    <div 
      ref={containerRect.ref}
      style={{
        width: `100%`,
        height: `100%`,
        overflow: 'auto',
        backgroundColor: 'transparent',
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
        containerRect={containerRect}
        connections={connectionManager.connections}
        containerWidth={1400}
        containerHeight={800}
        entityRects={entityRects}
      />
    </div>
  );
}

