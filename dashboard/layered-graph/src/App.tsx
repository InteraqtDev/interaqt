import { RenderContext, RxList } from "axii";
import { Graph } from "./Graph";
import { convertEntitiesToGraphData, Entity, Relation } from "./DataProcessor";
import { Entity as EntityType, Relation as RelationType, KlassInstance} from '@shared'

// 导入实体和关系数据

type AppProps = {
    entities: KlassInstance<typeof EntityType>[]
    relations: KlassInstance<typeof RelationType>[]
}

export function App({entities, relations}: AppProps, {createElement}: RenderContext)  {
    console.log(entities, relations)
    // 示例实体和关系数据（模拟 @social-content-network 的结构）

    // 使用新的数据转换器
    const { entityManager, connectionManager } = convertEntitiesToGraphData(new RxList(entities), new RxList(relations), 'User');

    return (
        <div style={{ 
            fontFamily: 'system-ui, sans-serif', 
            backgroundColor: '#f9fafb',
            minHeight: '100vh'
        }}>
            {/* 使用新的实体关系数据 */}
            <Graph
                entityManager={entityManager}
                connectionManager={connectionManager}
                onLayoutComplete={() => console.log('Entity graph layout completed!')}
            />
        </div>
    )
}
