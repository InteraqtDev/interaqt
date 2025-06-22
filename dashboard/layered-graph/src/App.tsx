import { RenderContext } from "axii";
import { Graph, GraphNodeData } from "./Graph";

export function App({}, {createElement}: RenderContext)  {
    // 增加更多节点例子，测试各种情况
    const graphData: GraphNodeData[] = [
        // 第1层：用户系统（根节点）
        { 
            id: 'user', 
            content: 'User System\n- Authentication\n- Profile Management\n- User Preferences' 
        },
        
        // 第2层：主要功能模块
        { 
            id: 'profile', 
            content: 'User Profile\n- Basic Info\n- Avatar\n- Biography\n- Social Links', 
            parentId: 'user'
        },
        { 
            id: 'content', 
            content: 'Content Management\n- Posts\n- Media\n- Categories\n- Publishing', 
            parentId: 'user'
        },
        { 
            id: 'social', 
            content: 'Social Features\n- Friends\n- Followers\n- Groups\n- Messages', 
            parentId: 'user'
        },
        { 
            id: 'settings', 
            content: 'User Settings\n- Privacy\n- Notifications\n- Preferences\n- Security', 
            parentId: 'user'
        },
        
        // 第3层：详细功能
        { 
            id: 'posts', 
            content: 'Posts\n- Text Posts\n- Image Posts\n- Video Posts\n- Drafts', 
            parentId: 'content'
        },
        { 
            id: 'media', 
            content: 'Media Library\n- Images\n- Videos\n- Documents\n- Storage', 
            parentId: 'content'
        },
        { 
            id: 'friends', 
            content: 'Friends System\n- Friend Requests\n- Friend Lists\n- Mutual Friends', 
            parentId: 'social'
        },
        { 
            id: 'messages', 
            content: 'Messaging\n- Direct Messages\n- Group Chats\n- Voice Messages', 
            parentId: 'social'
        },
        { 
            id: 'notifications', 
            content: 'Notification System\n- Push Notifications\n- Email Alerts\n- In-App Notifications', 
            parentId: 'settings'
        },
        
        // 第4层：具体实现
        { 
            id: 'comments', 
            content: 'Comments\n- Post Comments\n- Replies\n- Reactions\n- Moderation', 
            parentId: 'posts'
        },
        { 
            id: 'analytics', 
            content: 'Post Analytics\n- Views\n- Likes\n- Shares\n- Engagement', 
            parentId: 'posts'
        },
        { 
            id: 'chat-rooms', 
            content: 'Chat Rooms\n- Public Rooms\n- Private Rooms\n- Moderation\n- History', 
            parentId: 'messages'
        },
        
        // 新增节点：测试不同高度的情况
        { 
            id: 'short-node', 
            content: 'Short', 
            parentId: 'profile'
        },
        { 
            id: 'very-long-node', 
            content: 'Very Long Content Node\n- This is a much longer content block\n- With multiple lines of text\n- To test how the layout handles\n- Nodes with significantly different heights\n- And more content here\n- Even more lines\n- Testing vertical alignment\n- Last line here', 
            parentId: 'profile'
        },
        
        // 新增一个独立的子树
        { 
            id: 'admin', 
            content: 'Admin System\n- System Management\n- User Management\n- Security'
        },
        { 
            id: 'dashboard', 
            content: 'Admin Dashboard\n- Statistics\n- Reports\n- Monitoring', 
            parentId: 'admin'
        },
        { 
            id: 'logs', 
            content: 'System Logs\n- Access Logs\n- Error Logs\n- Audit Trail', 
            parentId: 'admin'
        },
        
        // 测试叶子节点的情况
        { 
            id: 'single-leaf', 
            content: 'Single Leaf Node\nNo children'
        },
        
        // 测试深层嵌套
        { 
            id: 'deep-parent', 
            content: 'Deep Parent\nTesting deep nesting', 
            parentId: 'dashboard'
        },
        { 
            id: 'deep-child', 
            content: 'Deep Child\nLevel 4 node', 
            parentId: 'deep-parent'
        }
    ];

    return (
        <div style={{ 
            fontFamily: 'system-ui, sans-serif', 
            padding: '20px',
            backgroundColor: '#f9fafb',
            minHeight: '100vh'
        }}>
            <Graph
                nodes={graphData}
                width={1400}
                height={700}
                onLayoutComplete={() => console.log('Layout completed!')}
            />
        </div>
    )
}
