import { RenderContext, atom, RxList, Atom } from "axii";
import { InteractionInstance } from "@shared";
import { Router } from "router0";

type InteractionListProps = {
    interactions: RxList<InteractionInstance>;
    selectedInteraction: Atom<InteractionInstance | null>;
    router: Router<any>;
}

export function InteractionList({ 
    interactions, 
    selectedInteraction,
    router
}: InteractionListProps, { createElement }: RenderContext) {
    
    const listStyle = {
        flex: '0 0 300px',
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        padding: '20px',
        overflowY: 'auto' as const,
        maxHeight: '100%',
        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
        '@keyframes slideInLeft': {
            from: { opacity: 0, transform: 'translateX(-20px)' },
            to: { opacity: 1, transform: 'translateX(0)' }
        },
        animation: 'slideInLeft 0.3s ease-out',
        '& h2': {
            margin: '0 0 20px 0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            '& .count': {
                fontSize: '14px',
                color: '#6b7280',
                backgroundColor: '#374151',
                padding: '2px 8px',
                borderRadius: '4px'
            }
        }
    };

    const interactionItemStyle = (isSelected: boolean) => ({
        padding: '12px 16px',
        marginBottom: '8px',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#2563eb' : '#262626',
        border: `2px solid ${isSelected ? '#3b82f6' : 'transparent'}`,
        transition: 'all 0.2s ease',
        position: 'relative' as const,
        overflow: 'hidden',
        '&:hover': {
            backgroundColor: isSelected ? '#2563eb' : '#333333',
            borderColor: isSelected ? '#3b82f6' : '#444444',
            transform: 'translateX(2px)',
            '&::before': {
                content: '""',
                position: 'absolute' as const,
                top: 0,
                left: 0,
                width: '3px',
                height: '100%',
                backgroundColor: '#3b82f6',
                '@keyframes slideInHeight': {
                    from: { height: 0 },
                    to: { height: '100%' }
                },
                animation: 'slideInHeight 0.3s ease-out'
            }
        },
        '& .name': {
            fontSize: '14px',
            fontWeight: '600',
            color: '#fff',
            marginBottom: '4px'
        },
        '& .action': {
            fontSize: '12px',
            color: '#9ca3af',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            '& .badge': {
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: '600',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                transition: 'all 0.2s ease',
                '&:hover': {
                    backgroundColor: 'rgba(59, 130, 246, 0.3)',
                    transform: 'scale(1.05)'
                }
            }
        }
    });

    const actionIconMap: Record<string, string> = {
        create: '✨',
        createStyle: '✨',
        update: '📝',
        updateStyle: '📝',
        delete: '🗑️',
        deleteStyle: '🗑️',
        publish: '🚀',
        publishStyle: '🚀',
        get: '🔍',
        list: '📋',
        upload: '📤',
        rollback: '⏪'
    };

    const getActionIcon = (interaction: InteractionInstance): string => {
        const actionName = interaction.action?.name || '';
        return actionIconMap[actionName] || actionIconMap[interaction.name.toLowerCase()] || '📋';
    };

    const handleInteractionClick = (interaction: InteractionInstance) => {
        // Navigate to the interaction using router
        router.push(`/${interaction.name}`);
    };

    return (
        <div style={listStyle}>
            <h2>
                Interactions 
                <span className="count">{interactions.length}</span>
            </h2>
            <div>
                {interactions.map(interaction => (
                    <div
                        key={interaction.name}
                        style={() =>interactionItemStyle(selectedInteraction() === interaction)}
                        onClick={() => handleInteractionClick(interaction)}
                        className="interaction-item"
                    >
                        <div className="name">
                            {getActionIcon(interaction)} {interaction.name}
                        </div>
                        <div className="action">
                            Action: {interaction.action?.name || 'unknown'}
                            {interaction.userAttributives && <span className="badge">Permissions</span>}
                        </div>
                    </div>
                ))}
            </div>
            
        </div>
    );
} 