import { Atom, RenderContext, atom, computed } from "axii";
import { InteractionInstance } from "@shared";

export type InteractionData = {
    id: string;
    name: string;
    action: string;
    hasPermissions: boolean;
    hasPayload: boolean;
    description?: string;
    _instance?: InteractionInstance; // Full interaction instance
}

type InteractionDetailProps = {
    interaction: Atom<InteractionData | null>;
}

export function InteractionDetail({ interaction }: InteractionDetailProps, { createElement }: RenderContext) {
    // Advanced styles with Axii features
    const detailStyle = {
        flex: 1,
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
        overflowY: 'auto' as const,
        '& h3': {
            margin: '0 0 24px 0',
            fontSize: '24px',
            fontWeight: '700',
            color: '#fff',
            '@keyframes slideIn': {
                from: { opacity: 0, transform: 'translateY(-10px)' },
                to: { opacity: 1, transform: 'translateY(0)' }
            },
            animation: 'slideIn 0.3s ease-out'
        },
        '& .section': {
            marginBottom: '24px',
            '& h4': {
                margin: '0 0 12px 0',
                fontSize: '14px',
                fontWeight: '600',
                color: '#9ca3af',
                textTransform: 'uppercase' as const
            },
            '& p': {
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#e5e7eb'
            }
        },
        '& .badges': {
            display: 'flex',
            gap: '12px',
            marginTop: '12px',
            flexWrap: 'wrap' as const,
            '& .badge': {
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: '#1e3a8a',
                color: '#60a5fa',
                '@keyframes fadeIn': {
                    from: { opacity: 0, transform: 'scale(0.8)' },
                    to: { opacity: 1, transform: 'scale(1)' }
                },
                animation: 'fadeIn 0.3s ease-out',
                '&:hover': {
                    backgroundColor: '#2563eb',
                    transform: 'scale(1.05)',
                    transition: 'all 0.2s ease'
                }
            }
        },
        '& .payload-items': {
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '8px',
            '& .payload-item': {
                padding: '8px 12px',
                backgroundColor: '#262626',
                borderRadius: '6px',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                '& .item-name': {
                    color: '#e5e7eb',
                    fontWeight: '500'
                },
                '& .item-meta': {
                    display: 'flex',
                    gap: '8px',
                    '& .tag': {
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        '&.required': {
                            backgroundColor: '#7c2d12',
                            color: '#fca5a5'
                        },
                        '&.optional': {
                            backgroundColor: '#1e3a8a',
                            color: '#93c5fd'
                        },
                        '&.collection': {
                            backgroundColor: '#4c1d95',
                            color: '#c4b5fd'
                        },
                        '&.reference': {
                            backgroundColor: '#064e3b',
                            color: '#6ee7b7'
                        }
                    }
                }
            }
        },
        '& .code-block': {
            backgroundColor: '#0a0a0a',
            padding: '16px',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
            lineHeight: '1.6',
            color: '#e5e7eb',
            overflowX: 'auto' as const
        }
    };

    const emptyStateStyle = {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#6b7280',
        gap: '16px',
        '& .icon': {
            fontSize: '48px',
            opacity: 0.5,
            '@keyframes pulse': {
                '0%, 100%': { opacity: 0.5 },
                '50%': { opacity: 0.8 }
            },
            animation: 'pulse 2s ease-in-out infinite'
        },
        '& h3': {
            margin: 0,
            fontSize: '20px',
            fontWeight: '600'
        },
        '& p': {
            margin: 0,
            fontSize: '14px'
        }
    };

    // Computed action label with styling
    const actionBadgeStyle = computed(() => {
        if (!interaction) return {};
        
        const colors = {
            create: { bg: '#065f46', color: '#34d399' },
            createStyle: { bg: '#065f46', color: '#34d399' },
            update: { bg: '#1e3a8a', color: '#60a5fa' },
            updateStyle: { bg: '#1e3a8a', color: '#60a5fa' },
            delete: { bg: '#7c2d12', color: '#f87171' },
            deleteStyle: { bg: '#7c2d12', color: '#f87171' },
            publish: { bg: '#5b21b6', color: '#a78bfa' },
            publishStyle: { bg: '#5b21b6', color: '#a78bfa' },
            get: { bg: '#0f766e', color: '#2dd4bf' },
            list: { bg: '#0f766e', color: '#2dd4bf' },
            upload: { bg: '#7c3aed', color: '#c4b5fd' }
        };
        
        const actionKey = interaction()?.action as keyof typeof colors;
        const style = colors[actionKey] || colors[interaction()?._instance?.action?.name as keyof typeof colors] || { bg: '#374151', color: '#9ca3af' };
        
        return {
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '600',
            backgroundColor: style.bg,
            color: style.color,
            textTransform: 'uppercase' as const
        };
    });

    // Render payload items details
    const renderPayloadItems = () => {
        if (!interaction()?._instance?.payload?.items) return null;
        
        return interaction()?._instance?.payload?.items.map((item, index) => (
            <div key={index} className="payload-item">
                <span className="item-name">{item.name}</span>
                <div className="item-meta">
                    {item.required && <span className="tag required">Required</span>}
                    {!item.required && <span className="tag optional">Optional</span>}
                    {item.isCollection && <span className="tag collection">Array</span>}
                    {item.isRef && <span className="tag reference">Reference</span>}
                    {item.base && <span className="tag reference">{item.base.name}</span>}
                </div>
            </div>
        ));
    };

    // Render attributives information
    const renderAttributives = () => {
        const instance = interaction()?._instance;
        if (!instance) return null;
        
        const attrs = [];
        
        if (instance.userAttributives) {
            attrs.push(
                <div key="user" className="section">
                    <h4>User Permissions</h4>
                    <p>{formatAttributive(instance.userAttributives)}</p>
                </div>
            );
        }
        
        // Check payload attributives
        if (instance.payload?.items) {
            const payloadAttrs = instance.payload.items.filter(item => item.attributives);
            if (payloadAttrs.length > 0) {
                attrs.push(
                    <div key="payload" className="section">
                        <h4>Payload Validations</h4>
                        {payloadAttrs.map((item, index) => (
                            <p key={index}>
                                <strong>{item.name}:</strong> {formatAttributive(item.attributives)}
                            </p>
                        ))}
                    </div>
                );
            }
        }
        
        return attrs.length > 0 ? attrs : null;
    };

    // Format attributive for display
    const formatAttributive = (attr: any): string => {
        if (!attr) return 'None';
        if (attr.name) return attr.name;
        if (attr.content && attr.content.name) return attr.content.name;
        return 'Custom validation';
    };

    return (
        <div style={detailStyle}>
            {() => interaction() ? (
                <div>
                    <h3>{interaction.name}</h3>
                    
                    <div className="section">
                        <h4>Description</h4>
                        <p>{interaction()?.description}</p>
                    </div>

                    <div className="section">
                        <h4>Action Type</h4>
                        <div style={actionBadgeStyle()}>{interaction()?.action}</div>
                    </div>

                    <div className="section">
                        <h4>Features</h4>
                        <div className="badges">
                            {interaction()?.hasPermissions && (
                                <div className="badge">User Permissions</div>
                            )}
                            {interaction()?.hasPayload && (
                                <div className="badge">Payload Required</div>
                            )}
                            {interaction()?._instance?.query && (
                                <div className="badge">Query Support</div>
                            )}
                            {interaction()?._instance?.sideEffects && (
                                <div className="badge">Side Effects</div>
                            )}
                        </div>
                    </div>

                    {/* Payload Details */}
                    {interaction()?._instance?.payload?.items && interaction()?._instance?.payload?.items?.length && (
                        <div className="section">
                            <h4>Payload Items</h4>
                            <div className="payload-items">
                                {renderPayloadItems()}
                            </div>
                        </div>
                    )}

                    {/* Permissions Details */}
                    {renderAttributives()}

                    {/* Code Example */}
                    <div className="section">
                        <h4>Usage Example</h4>
                        <div className="code-block">
                            {`await controller.callInteraction('${interaction()?.name}', {
  user: currentUser,
  payload: {${interaction()?._instance?.payload?.items?.map(item => 
    `\n    ${item.name}: ${item.isRef ? `{ id: '${item.name}-id' }` : item.isCollection ? '[]' : `'value'`}`
  ).join(',') || ''}
  }
});`}
                        </div>
                    </div>
                </div>
            ) : (
                <div style={emptyStateStyle}>
                    <div className="icon">⚡</div>
                    <h3>Select an Interaction</h3>
                    <p>Choose an interaction from the list to view details</p>
                </div>
            )}
        </div>
    );
} 