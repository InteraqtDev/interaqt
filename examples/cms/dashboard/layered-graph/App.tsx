import { RenderContext, RxList } from "axii";
import { Graph } from "./Graph";
import { EntityInstance, RelationInstance } from '@shared';

// 导入实体和关系数据

type AppProps = {
    entities: EntityInstance[]
    relations: RelationInstance[]
}

export function App({entities, relations}: AppProps, {createElement}: RenderContext)  {
    console.log(entities, relations)
    // 示例实体和关系数据（模拟 @social-content-network 的结构）
    return (
        <div style={{ 
            fontFamily: 'system-ui, sans-serif', 
            backgroundColor: '#0a0a0a',
            color: '#fff',
            minHeight: '100vh',
            padding: '24px'
        }}>
            <Graph
                entities={new RxList(entities)}
                relations={new RxList(relations)}
                entityWidth={300}
            />
        </div>
    )
}
