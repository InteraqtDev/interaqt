// 数据处理模块：将 Entity/Relation 图转换为树形结构

import { atom, RxDOMRect, RxList, RxMap } from "axii";
import { EntityInstance, RelationInstance, PropertyInstance } from '@shared'

// 导入 Entity/Relation 数据的类型定义
export interface Entity {
  name: string;
  properties: Property[];
}

export interface Property {
  name: string;
  type: string;
  collection?: boolean;
  defaultValue?: () => any;
  computed?: (entity: any) => any;
  computation?: any;
}

export interface Relation {
  source: Entity;
  sourceProperty: string;
  target: Entity;
  targetProperty: string;
  type: string;
  properties?: Property[];
}

// 树节点接口
export interface EntityTreeNode {
  id: string;
  name: string;
  properties: PropertyInstance[];
  children: EntityTreeNode[];
  level: number;
  relations: RelationInstance[]; // 与该节点相关的关系
}

export function getRelationName(relation:Relation) {
  return `${relation.source.name}-${relation.sourceProperty}-${relation.target.name}-${relation.targetProperty}`
}

// 图转树算法
export class EntityManager {
  private globalVisited: Set<string> = new Set(); // 全局已访问的节点
  public entityNodesByName: RxMap<string, EntityTreeNode> = new RxMap([]);
  public treeNodes: EntityTreeNode[] = [];
  constructor(public entities: RxList<EntityInstance>, public relations: RxList<RelationInstance>, rootEntityName: string = 'User') {
    this.treeNodes = this.convertToTree(rootEntityName);
  }

  // 将图转换为以指定 Entity 为根的树结构
  convertToTree(rootEntityName: string): EntityTreeNode[] {
    this.globalVisited.clear();
    
    const rootEntity = this.entities.raw.find(e => e.name === rootEntityName);
    if (!rootEntity) {
      throw new Error(`Root entity "${rootEntityName}" not found`);
    }

    const rootNode = this.buildTreeNode(rootEntity, []);
    return rootNode ? [rootNode] : [];
  }

  // 递归构建树节点
  private buildTreeNode(entity: EntityInstance, parentPath: string[]): EntityTreeNode | null {
    // 环检测1：检测直接路径上的环（避免无限递归）
    if (parentPath.includes(entity.name)) {
      return null; // 不显示循环引用节点
    }

    // 环检测2：检测全局已访问的节点（避免重复显示）
    if (this.globalVisited.has(entity.name)) {
      return null; // 不显示已访问的节点
    }

    // 标记为已访问
    this.globalVisited.add(entity.name);
    
    const currentPath = [...parentPath, entity.name];
    
    const relatedRelations = this.getRelationsForEntity(entity);
    
    
    // 获取下一级的实体（通过关系连接的其他实体）
    const [childEntities, relations] = this.getConnectedEntities(entity, relatedRelations);
    
    // 递归构建子节点，过滤掉 null 结果
    const children = childEntities
      .map(childEntity => this.buildTreeNode(childEntity, currentPath))
      .filter((child): child is EntityTreeNode => child !== null);


    const entityTreeNode = {
      id: entity.name,
      name: entity.name,
      properties: entity.properties,
      children: children,
      level: currentPath.length,
      relations
    };
    this.entityNodesByName.set(entity.name, entityTreeNode);
    return entityTreeNode;
  }

  // 获取与指定 Entity 相关的所有关系
  private getRelationsForEntity(entity: EntityInstance): RelationInstance[] {
    return this.relations.raw.filter(relation => 
      relation.source === entity || relation.target === entity
    );
  }

  // 获取通过关系连接到当前实体的其他实体
  private getConnectedEntities(entity: EntityInstance, relations: RelationInstance[]): [EntityInstance[], RelationInstance[]] {
    const connectedEntities: EntityInstance[] = [];
    const connectedRelations: RelationInstance[] = []
    const seen = new Set<string>();

    relations.forEach(relation => {
      let targetEntity: EntityInstance | RelationInstance | null = null;
      
      if (relation.source === entity && relation.target !== entity) {
        targetEntity = relation.target;
      } else if (relation.target === entity && relation.source !== entity) {
        targetEntity = relation.source;
      }
      
      if (targetEntity && 'name' in targetEntity && targetEntity.name && !seen.has(targetEntity.name)) {
        seen.add(targetEntity.name);
        connectedEntities.push(targetEntity as EntityInstance);
        connectedRelations.push(relation)
      }
    });

    return [connectedEntities, connectedRelations];
  }

  // 获取特定关系的连接信息（用于绘制连线）
  static getRelationConnections(relations: RelationInstance[]): RelationConnection[] {
    return relations.map(relation => ({
      id: `${(relation.source as EntityInstance).name}-${(relation.target as EntityInstance).name}`,
      sourceEntity: (relation.source as EntityInstance).name,
      sourceProperty: relation.sourceProperty,
      targetEntity: (relation.target as EntityInstance).name,
      targetProperty: relation.targetProperty,
      type: relation.type,
      properties: relation.properties || []
    }));
  }
}

// 关系连接信息接口（用于绘制连线）
export interface RelationConnection {
  id: string;
  sourceEntity: string;
  sourceProperty: string;
  targetEntity: string;
  targetProperty: string;
  type: string;
  properties: PropertyInstance[];
}

export interface Connection {
  relation: RelationInstance;
  name: string;
  sourceEntityName: string;
  targetEntityName: string;
  sourceEntityNode: EntityTreeNode;
  targetEntityNode: EntityTreeNode;
  sourceProperty: string;
  targetProperty: string;
  sourceRect: RxDOMRect;
  targetRect: RxDOMRect;
}



export class ConnectionManager {
  public connections: RxList<Connection> = new RxList([]);
  public connectionsByName: RxMap<string, Connection> = new RxMap([])
  public connectionsBySourceEntityName: RxMap<string, RxList<Connection>> = new RxMap([]);
  public connectionsByTargetEntityName: RxMap<string, RxList<Connection>> = new RxMap([]);
  constructor(public relations: RxList<RelationInstance>, public entityManager: EntityManager) {
    this.connections = relations.map(relation => {
      const sourceEntity = relation.source as EntityInstance;
      const targetEntity = relation.target as EntityInstance;
      return {
        relation,
        name: `${sourceEntity.name}-${relation.sourceProperty}-${targetEntity.name}-${relation.targetProperty}`,
        sourceEntityNode: entityManager.entityNodesByName.get(sourceEntity.name)!,
        targetEntityNode: entityManager.entityNodesByName.get(targetEntity.name)!,
        sourceEntityName: sourceEntity.name,
        targetEntityName: targetEntity.name,
        sourceProperty: relation.sourceProperty,
        targetProperty: relation.targetProperty,
        sourceRect: new RxDOMRect(atom(null), {type: 'interval', duration:500}),
        targetRect: new RxDOMRect(atom(null), {type: 'interval', duration:500}),
      }
    });
    this.connectionsByName = this.connections.indexBy('name')
    this.connectionsBySourceEntityName = this.connections.groupBy(connection => connection.sourceEntityName);
    this.connectionsByTargetEntityName = this.connections.groupBy(connection => connection.targetEntityName);
  }
}

// 导出辅助函数 
export function convertEntitiesToGraphData(
  entities: RxList<EntityInstance>, 
  relations: RxList<RelationInstance>, 
  rootEntityName: string = 'User' 
): { entityManager: EntityManager, connectionManager: ConnectionManager } {
  const entityManager = new EntityManager(entities, relations, rootEntityName);
  const connectionManager = new ConnectionManager(relations, entityManager);
  
  return { entityManager, connectionManager };
}