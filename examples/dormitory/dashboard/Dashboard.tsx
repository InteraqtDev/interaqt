import { RenderContext, atom, ContextProvider } from "axii";
import { Router, createMemoryHistory, createBrowserHistory } from 'router0';
import { App as EntityRelationPanel } from './layered-graph/App';
import { InteractionPanel } from './interaction-panel/InteractionPanel';
import { EntityInstance, RelationInstance, InteractionInstance } from '@shared';

type DashboardProps = {
    entities: EntityInstance[]
    relations: RelationInstance[]
    interactions: InteractionInstance[]
}

type NavigationItem = {
    path: string;
    label: string;
    icon?: string;
}

const navigationItems: NavigationItem[] = [
    { path: '/entity-relation', label: 'Entity & Relation', icon: '🔗' },
    { path: '/interactions', label: 'Interactions', icon: '⚡' },
];

// Router Context for nested components to access router
export const RouterContext = Symbol('RouterContext');

// Route handler type
type RouteHandler = (props: { entities: EntityInstance[], relations: RelationInstance[] }) => any;

export function Dashboard({ entities, relations, interactions }: DashboardProps, { createElement, useLayoutEffect }: RenderContext) {
    // Create router with route configurations
    const router = new Router<RouteHandler>([
        {
            path: '/entity-relation',
            handler: () => <EntityRelationPanel entities={entities} relations={relations} />
        },
        {
            path: '/interactions', 
            handler: () => <InteractionPanel interactions={interactions} />
        },
        {
            path: '/',
            redirect: '/entity-relation'
        }
    ], createBrowserHistory());

    // Navigate to default route on mount
    useLayoutEffect(() => {
        if (router.pathname() === '/') {
            router.push('/entity-relation');
        }
        
        // Cleanup
        return () => {
            router.destroy();
        };
    });

    // Navigation item style using Axii's advanced features
    const navItemStyle = (isActive: boolean) => ({
        padding: '12px 20px',
        marginBottom: '4px',
        borderRadius: '8px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '14px',
        fontWeight: isActive ? '600' : '400',
        color: isActive ? '#fff' : '#9ca3af',
        backgroundColor: isActive ? '#3b82f6' : 'transparent',
        transition: 'all 0.2s ease',
        '&:hover': {
            backgroundColor: isActive ? '#3b82f6' : '#374151',
            color: '#fff'
        }
    });

    const darkThemeStyles = {
        container: {
            display: 'flex',
            height: '100vh',
            backgroundColor: '#0f0f0f',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, sans-serif',
        },
        sidebar: {
            width: '260px',
            backgroundColor: '#1a1a1a',
            borderRight: '1px solid #2a2a2a',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '24px',
        },
        logo: {
            fontSize: '20px',
            fontWeight: '700',
            color: '#fff',
            paddingLeft: '20px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        navigation: {
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '2px',
        },
        content: {
            flex: 1,
            backgroundColor: '#0a0a0a',
            overflow: 'hidden',
            position: 'relative' as const,
        },
        footer: {
            marginTop: 'auto',
            padding: '20px',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center' as const,
            '& div:last-child': {
                marginTop: '4px',
                opacity: 0.7
            }
        }
    };

    // Render current route handler
    const renderContent = () => {
        console.log('router.path', router.path());
        switch (router.path()) {
            case '/entity-relation':
                return <EntityRelationPanel entities={entities} relations={relations} />;
            case '/interactions':
                // Create derived router for interactions panel
                const SubRouter = router.derive('/interactions');
                return (
                    <ContextProvider contextType={RouterContext} value={SubRouter}>
                        <InteractionPanel interactions={interactions} />
                    </ContextProvider>
                );
            default:
                return <EntityRelationPanel entities={entities} relations={relations} />;
        }
    };

    return (
        <ContextProvider contextType={RouterContext} value={router}>
            <div style={darkThemeStyles.container}>
                {/* Sidebar Navigation */}
                <div style={darkThemeStyles.sidebar}>
                    <div style={darkThemeStyles.logo}>
                        <span style={{ fontSize: '24px' }}>🚀</span>
                        <span>InterAQT Dashboard</span>
                    </div>
                    
                    <nav style={darkThemeStyles.navigation}>
                        {navigationItems.map(item => (
                            <div
                                key={item.path}
                                onClick={() => router.push(item.path)}
                                style={() =>navItemStyle(router.path() === item.path)}
                            >
                                {item.icon && <span style={{ fontSize: '18px' }}>{item.icon}</span>}
                                <span>{item.label}</span>
                            </div>
                        ))}
                    </nav>

                    {/* Footer */}
                    <div style={darkThemeStyles.footer}>
                        <div>Powered by InterAQT</div>
                        <div>v1.0.0</div>
                    </div>
                </div>

                {/* Main Content */}
                <div style={darkThemeStyles.content}>
                    {renderContent}
                </div>
            </div>
        </ContextProvider>
    );
} 