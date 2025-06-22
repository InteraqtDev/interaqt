import { RenderContext } from 'axii';

// Entity节点的props接口
export interface EntityProps {
  id: string;
  content: string;
  width?: number;
}

// 常量定义
const DEFAULT_WIDTH = 200;
const DEFAULT_PADDING = 16;

export function Entity({ 
  id, 
  content, 
  width = DEFAULT_WIDTH 
}: EntityProps, { createElement }: RenderContext) {

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

  const contentStyle = {
    wordWrap: 'break-word' as const,
    overflow: 'hidden' as const,
    lineHeight: '1.5',
    fontSize: '14px',
    color: '#374151'
  };

  const titleStyle = {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937'
  };

  return (
    <div 
      style={containerStyle}
      data-testid={`entity-${id}`}
      data-entity-id={id}
    >
      <div style={titleStyle}>
        {id}
      </div>
      <div style={contentStyle}>
        {content}
      </div>
    </div>
  );
}