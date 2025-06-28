import { RenderContext, computed, atom, RxDOMRect, RxList } from 'axii';
import { Connection } from './DataProcessor';

// 连线组件的 props 接口
export interface ConnectionLinesProps {
  connections: RxList<Connection>;
  containerWidth: number;
  containerHeight: number;
  entityRects?: Map<string, RxDOMRect>; // 新增：实体位置信息
  containerRect: RxDOMRect;
}

// 连线点坐标接口
interface LinePoint {
  x: number;
  y: number;
}

// 连线路径接口
interface ConnectionLine {
  id: string;
  points: LinePoint[];
  sourceProperty: string;
  targetProperty: string;
  type: [string, string];
}

const LINE_ENDPOINT_GAP = 15;

export function ConnectionLines({ 
  connections, 
  containerWidth, 
  containerHeight,
  entityRects,
  containerRect
}: ConnectionLinesProps, { createSVGElement:createElement, useLayoutEffect }: RenderContext) {

  // 获取属性元素的位置信息
  const getPropertyRect = (entityName: string, propertyName: string): DOMRect | null => {
    const propertyElement = document.querySelector(
      `[data-entity="${entityName}"] [data-property="${propertyName}"]`
    ) as HTMLElement;
    
    if (propertyElement) {
      return propertyElement.getBoundingClientRect();
    }
    return null;
  };

  // 获取容器的位置信息
  const getContainerRect = (): DOMRect | null => {
    const container = document.querySelector('[data-testid="layered-graph"]') as HTMLElement;
    return container ? container.getBoundingClientRect() : null;
  };

  // 使用 RxDOMRect 获取实体位置
  const getEntityRect = (entityName: string) => {
    if (!entityRects) return null;
    const domRect = entityRects.get(entityName);
    return domRect ? domRect.value() : null;
  };

  // 计算连线路径
  const calculateConnectionLines = connections.map(connection => computed<ConnectionLine>(() => {

    if(!connection.sourceRect.value() || !connection.targetRect.value()||!containerRect.value()) {
      return null;
    }

    const isLeftToRight = Math.abs(connection.sourceEntityNode.level - connection.targetEntityNode.level) === 1;
    const containerLeft = containerRect.value.raw!.left
    const containerTop = containerRect.value.raw!.top


    if (isLeftToRight) {

      const isLeftSource = connection.sourceEntityNode.level < connection.targetEntityNode.level;
      // 折线模式
      const leftRect = isLeftSource ? connection.sourceRect.value()! : connection.targetRect.value()!;
      const rightRect = isLeftSource ? connection.targetRect.value()! : connection.sourceRect.value()!;
  

      const leftPoint: LinePoint = {
        x: leftRect.right + LINE_ENDPOINT_GAP - containerLeft, // 右边
        y: leftRect.top + leftRect.height / 2 - containerTop // 中心
      };

      const rightPoint: LinePoint = {
        x: rightRect.left - LINE_ENDPOINT_GAP - containerLeft, // 左边
        y: rightRect.top + rightRect.height / 2 - containerTop // 中心
      };

      // 创建折线路径（从右边到左边）
      const midX = leftPoint.x + (rightPoint.x - leftPoint.x) / 2;
      
      const points: LinePoint[] = [
        leftPoint,
        { x: midX, y: leftPoint.y },
        { x: midX, y: rightPoint.y },
        rightPoint
      ];

      return {
        id: connection.name,
        points,
        sourceProperty: connection.relation.sourceProperty,
        targetProperty: connection.relation.targetProperty,
        type: isLeftSource ? connection.relation.type.split(':') : [...connection.relation.type.split(':')].reverse(),
      };

    } else {
      // 直线模式
      const isLeftSource = connection.sourceEntityNode.level < connection.targetEntityNode.level;

      const leftRect = isLeftSource ? connection.sourceRect.value()! : connection.targetRect.value()!;
      const rightRect = isLeftSource ? connection.targetRect.value()! : connection.sourceRect.value()!;

      const leftPoint: LinePoint = {
        x: leftRect.right + LINE_ENDPOINT_GAP - containerLeft,
        y: leftRect.top + leftRect.height / 2 - containerTop
      };

      const rightPoint: LinePoint = {
        x: rightRect.left - LINE_ENDPOINT_GAP - containerLeft,
        y: rightRect.top + rightRect.height / 2 - containerTop
      };

      const points: LinePoint[] = [leftPoint, rightPoint];
      const typeText = connection.relation.type.split(':')
      console.log(typeText)

      return {
        id: connection.name,
        points,
        sourceProperty: connection.relation.sourceProperty,
        targetProperty: connection.relation.targetProperty,
        type: isLeftSource ? typeText: [...typeText].reverse(),
      };
    }
    
  }));

  // 生成 SVG 路径字符串
  const generatePath = (points: LinePoint[]): string => {
    if (points.length === 0) return '';
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  };

  // 获取连线颜色
  const getLineColor = (type: [string, string]): string => {
    return '#6b7280';

    // switch (type) {
    //   case '1:1': return '#3b82f6'; // 蓝色
    //   case '1:n': return '#10b981'; // 绿色
    //   case 'n:1': return '#f59e0b'; // 橙色
    //   case 'n:n': return '#8b5cf6'; // 紫色
    //   default: return '#6b7280'; // 灰色
    // }
  };


  return (
    <svg
      style={() => ({
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${containerRect.value()?.width||0}px`,
        height: `${containerRect.value()?.height||0}px`,
        pointerEvents: 'none',
        zIndex: 2
      })}
    >
      {calculateConnectionLines.map(computedLine => {
        if (!computedLine()) {
          return null;
        }
        const line = computedLine();
        return (
          <g key={line.id}>
            {/* 连线路径 */}
            <path
              d={generatePath(line.points)}
              stroke={getLineColor(line.type)}
              strokeWidth="2"
              fill="none"
              strokeDasharray={line.points.length ===2 ? '5,5' : 'none'}
              opacity="0.7"
            />
            
            
            {/* 连线类型标签 */}
            <text
              x={line.points[0].x-10}
              y={line.points[0].y+5}
              fontSize="8"
              fill={getLineColor(line.type)}
              textAnchor="middle"
              opacity="0.8"
            >
              {line.type[0]}
            </text>
            <text
              x={line.points.at(-1)!.x+5}
              y={line.points.at(-1)!.y+5}
              fontSize="8"
              fill={getLineColor(line.type)}
              textAnchor="middle"
              opacity="0.8"
            >
              {line.type[1]}
            </text>
          </g>
        )
      })}
    </svg>
  );
}