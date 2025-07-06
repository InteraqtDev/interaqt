import { atom, RenderContext, RxDOMRect, RxList } from 'axii';
import { Connection, EntityTreeNode } from './DataProcessor';

// Entity节点的props接口
export interface EntityProps {
  id: string;
  entityNode?: EntityTreeNode;
  entity?: any; // Add entity instance to access computation
  allEntities?: any[]; // Add all entities to find filtered entities
  width?: number;
  connections?: Connection[];
  onRectChange?: (id: string, rect: RxDOMRect) => void; // 新增：位置变化回调
}

// 常量定义
const DEFAULT_WIDTH = 200;
const DEFAULT_PADDING = 16;

export function Entity({ 
  id, 
  entityNode,
  entity,
  allEntities = [],
  width = DEFAULT_WIDTH,
  connections,
}: EntityProps, { createElement }: RenderContext) {

  // 创建 DOM 矩形状态用于连线
  const domRect = new RxDOMRect(atom(null), {type: 'interval', duration:500});

  // 容器样式 - 使用 Axii's advanced style features
  const containerStyle = {
    width: `${width}px`,
    minHeight: '50px',
    padding: `${DEFAULT_PADDING}px`,
    border: '2px solid #2a2a2a',
    borderRadius: '8px',
    backgroundColor: '#1a1a1a',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    '&:hover': {
      border: '2px solid #3b82f6',
      backgroundColor: '#1f1f1f',
      boxShadow: '0 8px 16px rgba(59, 130, 246, 0.2), 0 0 0 1px rgba(59, 130, 246, 0.1)'
    }
  };

  const titleStyle = {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: '700',
    color: '#ffffff',
    borderBottom: '1px solid #333333',
    paddingBottom: '8px',
    transition: 'color 0.3s ease, border-color 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    '.entity-hover &': {
      color: '#60a5fa',
      borderBottom: '1px solid #3b82f6'
    }
  };

  const propertyStyle = {
    margin: '4px 0',
    fontSize: '12px',
    color: '#9ca3af',
    lineHeight: '1.4'
  };

  const relationPropertyStyle = {
    margin: '4px 0',
    fontSize: '12px',
    color: '#a78bfa',
    lineHeight: '1.4',
    fontWeight: 'bold',
    transition: 'color 0.3s ease',
    '.entity-hover &': {
      color: '#c4b5fd'
    }
  };

  const sectionTitleStyle = {
    margin: '8px 0 4px 0',
    fontSize: '11px',
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    transition: 'color 0.3s ease',
    '.entity-hover &': {
      color: '#9ca3af'
    }
  };

  const filteredEntityStyle = {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginBottom: '12px',
    paddingTop: '4px'
  };

  const filteredEntityBadgeStyle = {
    fontSize: '10px',
    color: '#8b5cf6',
    backgroundColor: '#1e1b4b',
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: '600',
    border: '1px solid #4c1d95',
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: '#2e1065',
      borderColor: '#6d28d9',
      transform: 'scale(1.05)'
    }
  };

  // 获取 computation 的类型名字
  const getComputationTypeName = (computation: any): string => {
    if (!computation) return '';
    
    // Check if it's a class instance with name
    if (computation.name) {
      return computation.name;
    }
    
    // Check constructor name
    if (computation.constructor && computation.constructor.name) {
      return computation.constructor.name;
    }
    
    // Check if it has a type property
    if (computation.type) {
      return computation.type;
    }
    
    // Check if it has _type property (internal type)
    if (computation._type) {
      return computation._type;
    }
    
    // Default return
    return 'Computed';
  };

  // Find all filtered entities based on current entity
  const findFilteredEntities = () => {
    if (!entity || !allEntities) return [];
    
    return allEntities.filter(e => 
      e.sourceEntity === entity && e.filterCondition
    );
  };

  // 渲染属性列表
  const renderProperties = (properties: any[], isRelationProperty = false) => {
    return properties.map((prop, index) => {
      const hasComputation = prop.computation;
      const hasComputed = prop.computed && typeof prop.computed === 'function';
      const computationType = hasComputation ? getComputationTypeName(prop.computation) : '';
      
      return (
        <div 
          key={`${prop.name}-${index}`}
          style={propertyStyle}
          data-property={prop.name}
          data-entity={id}
        >
          <strong>{prop.name}:</strong> {prop.type}
          {prop.collection && '[]'}
          
          {/* computation 标记 */}
          {hasComputation && (
            <span style={{
              marginLeft: '8px',
              fontSize: '10px',
              color: '#60a5fa',
              backgroundColor: '#1e3a8a',
              padding: '2px 6px',
              borderRadius: '3px',
              fontWeight: 'bold'
            }}>
              {computationType}
            </span>
          )}
          
          {/* computed 函数标记 */}
          {hasComputed && (
            <span style={{
              marginLeft: '8px',
              fontSize: '10px',
              color: '#34d399',
              backgroundColor: '#064e3b',
              padding: '2px 6px',
              borderRadius: '3px',
              fontWeight: 'bold'
            }}>
              computed
            </span>
          )}
        </div>
      );
    });
  };

  const renderConnections = (connections: Connection[]) => {
    return connections.map((connection) => {
      const isSource =  connection.sourceEntityName === entityNode?.name
      const isSymmetric = connection.sourceEntityName === connection.targetEntityName && connection.sourceProperty === connection.targetProperty
      if(!isSource&&isSymmetric) {
        return null
      }
      const refs = isSource&&isSymmetric ? [connection.sourceRect.ref, connection.targetRect.ref] : [connection[isSource ? 'sourceRect' : 'targetRect'].ref]
      const style = relationPropertyStyle
      return (
        <div ref={refs} style={style}>{isSource ? connection.sourceProperty : connection.targetProperty}</div>
      )
    });
  };

  // Check if entity has computation
  const entityComputation = entity?.computation;
  const entityComputationType = entityComputation ? getComputationTypeName(entityComputation) : '';
  
  // Get filtered entities
  const filteredEntities = findFilteredEntities();

  return (
    <div 
      ref={domRect.ref}
      style={containerStyle}
      data-testid={`entity-${id}`}
      data-entity-id={id}
      className="entity-hover"
    >
      {/* 实体名称 */}
      <div style={titleStyle}>
        <span>{entityNode ? entityNode.name : id}</span>
        {/* Entity computation badge */}
        {entityComputation && (
          <span style={{
            fontSize: '10px',
            color: '#f59e0b',
            backgroundColor: '#451a03',
            padding: '2px 6px',
            borderRadius: '3px',
            fontWeight: 'bold'
          }}>
            {entityComputationType}
          </span>
        )}
      </div>

      {/* Filtered Entities */}
      {filteredEntities.length > 0 && (
        <div style={filteredEntityStyle}>
          {filteredEntities.map((fe, index) => (
            <span 
              key={index} 
              style={filteredEntityBadgeStyle}
              title={`Filtered Entity: ${fe.name}`}
            >
              🔍 {fe.name}
            </span>
          ))}
        </div>
      )}

      {/* 实体属性 */}
      {entityNode && entityNode.properties.length > 0 && (
        <div>
          <div style={sectionTitleStyle}>Properties</div>
          {renderProperties(entityNode.properties)}
        </div>
      )}

      {connections?.length! > 0 && (
        <div>
          {renderConnections(connections!)}
        </div>
      )}
    </div>
  );
}