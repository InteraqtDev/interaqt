import {atom, RenderContext, computed} from "axii";
import {Input, Button} from "axii-ui";
import {styleSystem as s} from "axii-ui-theme-inc";
import { LayeredEntityGraph } from "./LayeredEntityGraph";

export function App({}, {createElement}: RenderContext)  {
    // 创建层级实体图实例（启用批量模式用于初始化）
    const graph = new LayeredEntityGraph(true);
    
    // 使用批量创建示例数据 - 性能更好
    const nodes = graph.batchCreateNodes([
        { id: 'user', height: 80 },
        { id: 'profile', parentId: 'user', height: 60 },
        { id: 'posts', parentId: 'user', height: 100 },
        { id: 'comments', parentId: 'user', height: 40 },
        { id: 'post-details', parentId: 'posts', height: 70 },
        { id: 'likes', parentId: 'posts', height: 50 },
        { id: 'replies', parentId: 'comments', height: 45 }
    ]);

    // 获取节点引用
    const [userNode, profileNode, postsNode, commentsNode, postDetailsNode, likesNode, commentRepliesNode] = nodes;

    // 用于控制的响应式状态
    const selectedNodeId = atom<string>('user');
    const newHeight = atom<string>('60');

    const updateHeight = () => {
        const height = parseInt(newHeight(), 10);
        if (!isNaN(height) && height > 0) {
            graph.updateNodeHeight(selectedNodeId(), height);
        }
    };

    const addNewNode = () => {
        const parentId = selectedNodeId();
        const newId = `node-${Date.now()}`;
        graph.createNode(newId, parentId, 50);
    };

    // 计算图形边界
    const bounds = computed(() => graph.getBounds());

    return (
        <div style={s.layout.column({gap:20, padding: 20})}>
            <h1 style={s.heading()}>层级实体图布局算法演示</h1>
            
            {/* 控制面板 */}
            <div style={s.layout.column({gap:10, padding: 15, backgroundColor: '#f5f5f5', borderRadius: 8})}>
                <h3>控制面板</h3>
                <div style={s.layout.row({gap:10})}>
                    <select 
                        value={selectedNodeId} 
                        $main:onChange={(e: any) => selectedNodeId(e.target.value)}
                        style={{padding: 8}}
                    >
                        {graph.getAllNodes().map(node => (
                            <option value={node.id}>{node.id} (Level {node.level})</option>
                        ))}
                    </select>
                    <Input value={newHeight} placeholder="新高度" $main:type="number" />
                    <Button $root:onClick={updateHeight}>更新高度</Button>
                    <Button $root:onClick={addNewNode}>添加子节点</Button>
                </div>
            </div>

            {/* 图形信息 */}
            <div style={s.layout.row({gap:20})}>
                <div>总节点数: {graph.getAllNodes().length}</div>
                <div>图形宽度: {bounds().width.toFixed(0)}px</div>
                <div>图形高度: {bounds().height.toFixed(0)}px</div>
            </div>

            {/* 节点列表 */}
            <div style={s.layout.column({gap:10})}>
                <h3>节点状态</h3>
                <div style={s.table()}>
                    <table>
                        <thead>
                            <tr>
                                <th>节点ID</th>
                                <th>层级</th>
                                <th>X坐标</th>
                                <th>Y坐标</th>
                                <th>高度</th>
                                <th>子节点数</th>
                            </tr>
                        </thead>
                        <tbody>
                            {graph.getAllNodes().map(node => (
                                <tr>
                                    <td>{node.id}</td>
                                    <td>{node.level}</td>
                                    <td>{node.x}</td>
                                    <td>{node.y().toFixed(1)}</td>
                                    <td>{node.height()}</td>
                                    <td>{node.children.length}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 可视化展示区域 */}
            <div style={s.layout.column({gap:10})}>
                <h3>可视化布局</h3>
                <div 
                    style={{
                        position: 'relative',
                        border: '1px solid #ccc',
                        backgroundColor: '#fafafa',
                        minHeight: '400px',
                        width: '100%',
                        overflow: 'auto'
                    }}
                >
                    {graph.getAllNodes().map(node => (
                        <div
                            key={node.id}
                            style={{
                                position: 'absolute',
                                left: `${node.x + 10}px`,
                                top: `${node.y() + 10}px`,
                                width: '180px',
                                height: `${node.height()}px`,
                                backgroundColor: node.id === selectedNodeId() ? '#e3f2fd' : '#fff',
                                border: node.id === selectedNodeId() ? '2px solid #2196f3' : '1px solid #ddd',
                                borderRadius: '4px',
                                padding: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'center',
                                fontSize: '12px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                cursor: 'pointer'
                            }}
                            $main:onClick={() => selectedNodeId(node.id)}
                        >
                            <div style={{fontWeight: 'bold'}}>{node.id}</div>
                            <div style={{color: '#666'}}>Level {node.level}</div>
                            <div style={{color: '#999', fontSize: '10px'}}>
                                Y: {node.y().toFixed(1)}
                            </div>
                        </div>
                    ))}
                    
                    {/* 绘制连线 */}
                    <svg 
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none'
                        }}
                    >
                        {graph.getAllNodes().filter(node => node.parent).map(node => {
                            const parent = node.parent!;
                            return (
                                <line
                                    key={`${parent.id}-${node.id}`}
                                    x1={parent.x + 190 + 10}
                                    y1={parent.y() + parent.height() / 2 + 10}
                                    x2={node.x + 10}
                                    y2={node.y() + node.height() / 2 + 10}
                                    stroke="#999"
                                    strokeWidth={1}
                                />
                            );
                        })}
                    </svg>
                </div>
            </div>
        </div>
    )
}
