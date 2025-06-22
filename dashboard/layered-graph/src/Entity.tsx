import { atom, RenderContext, RxDOMRect, RxList } from 'axii';
import { Connection, EntityTreeNode } from './DataProcessor';

// Entity节点的props接口
export interface EntityProps {
  id: string;
  entityNode?: EntityTreeNode;
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
  width = DEFAULT_WIDTH,
  connections,
}: EntityProps, { createElement }: RenderContext) {

  // 创建 DOM 矩形状态用于连线
  const domRect = new RxDOMRect(atom(null), {type: 'interval', duration:500});
  

  // 容器样式
  const containerStyle = {
    width: `${width}px`,
    minHeight: '50px',
    padding: `${DEFAULT_PADDING}px`,
    border: '2px solid #e1e5e9',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  };

  const titleStyle = {
    margin: '0 0 12px 0',
    fontSize: '16px',
    fontWeight: '700',
    color: '#1f2937',
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: '8px'
  };

  const propertyStyle = {
    margin: '4px 0',
    fontSize: '12px',
    color: '#6b7280',
    lineHeight: '1.4'
  };

  const relationPropertyStyle = {
    margin: '4px 0',
    fontSize: '12px',
    color: '#7c3aed',
    lineHeight: '1.4',
    fontWeight: 'bold'
  };

  const sectionTitleStyle = {
    margin: '8px 0 4px 0',
    fontSize: '11px',
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase' as const
  };

  // 渲染属性列表
  const renderProperties = (properties: any[], isRelationProperty = false) => {
    return properties.map((prop, index) => (
      <div 
        key={`${prop.name}-${index}`}
        style={propertyStyle}
        data-property={prop.name}
        data-entity={id}
      >
        <strong>{prop.name}:</strong> {prop.type}
        {prop.collection && '[]'}
      </div>
    ));
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

  return (
    <div 
      ref={domRect.ref}
      style={containerStyle}
      data-testid={`entity-${id}`}
      data-entity-id={id}
    >
      {/* 实体名称 */}
      <div style={titleStyle}>
        {entityNode ? entityNode.name : id}
      </div>

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