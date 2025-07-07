import { RenderContext, Atom, Fragment } from "axii";
import { InteractionInstance } from "@shared";

type InteractionDetailProps = {
    interaction: Atom<InteractionInstance | null>;
}

export function InteractionDetail({ interaction }: InteractionDetailProps, { createElement }: RenderContext) {
    const detailStyle = {
        flex: '1',
        backgroundColor: '#1a1a1a',
        borderRadius: '12px',
        padding: '24px',
        overflowY: 'auto' as const,
        maxHeight: '100%',
        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
        '@keyframes fadeIn': {
            from: { opacity: 0 },
            to: { opacity: 1 }
        },
        animation: 'fadeIn 0.3s ease-out',
        '& h2': {
            margin: '0 0 20px 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            '& .action-badge': {
                fontSize: '14px',
                padding: '4px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                color: '#60a5fa',
                fontWeight: '500'
            }
        },
        '& .empty-state': {
            display: 'flex',
            flexDirection: 'column' as const,
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '400px',
            color: '#6b7280',
            textAlign: 'center' as const,
            gap: '16px',
            '& .icon': {
                fontSize: '48px',
                opacity: 0.5
            },
            '& .message': {
                fontSize: '16px'
            }
        },
        '& .section': {
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: '#262626',
            borderRadius: '8px',
            '& h3': {
                margin: '0 0 12px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            },
            '& .content': {
                color: '#e5e7eb',
                lineHeight: 1.6
            }
        },
        '& .payload-item': {
            padding: '12px',
            marginBottom: '8px',
            backgroundColor: '#333333',
            borderRadius: '6px',
            position: 'relative' as const,
            paddingLeft: '20px',
            '&::before': {
                content: '""',
                position: 'absolute' as const,
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '4px',
                height: '4px',
                backgroundColor: '#60a5fa',
                borderRadius: '50%'
            },
            '& .name': {
                fontSize: '14px',
                fontWeight: '600',
                color: '#fff',
                marginBottom: '4px'
            },
            '& .type': {
                fontSize: '12px',
                color: '#9ca3af',
                marginBottom: '4px'
            },
            '& .attributive': {
                fontSize: '12px',
                color: '#fbbf24',
                marginTop: '4px',
                fontStyle: 'italic'
            },
            '& .badges': {
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap' as const,
                marginTop: '8px',
                '& .badge': {
                    fontSize: '10px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: '600',
                    '&.required': {
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                        color: '#f87171'
                    },
                    '&.optional': {
                        backgroundColor: 'rgba(34, 197, 94, 0.2)',
                        color: '#4ade80'
                    },
                    '&.collection': {
                        backgroundColor: 'rgba(168, 85, 247, 0.2)',
                        color: '#c084fc'
                    },
                    '&.reference': {
                        backgroundColor: 'rgba(251, 191, 36, 0.2)',
                        color: '#fbbf24'
                    }
                }
            }
        },
        '& .code-block': {
            backgroundColor: '#0f0f0f',
            padding: '16px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '12px',
            overflowX: 'auto' as const,
            border: '1px solid #333333'
        }
    };

    const formatCode = (code: string) => {
        return code.replace(/\n/g, '<br/>').replace(/  /g, '&nbsp;&nbsp;');
    };

    return (
        <div style={detailStyle}>
            {() => {
                const current = interaction();
                if (!current) {
                    return (
                        <div className="empty-state">
                            <div className="icon">📋</div>
                            <div className="message">Select an interaction to view details</div>
                        </div>
                    );
                }

                // Generate usage example
                const generateUsageExample = () => {
                    const params = [''];
                    if (current.payload?.items && current.payload.items.length > 0) {
                        const examplePayload: any = {};
                        current.payload.items.forEach(item => {
                            if (item.base?.name === 'string') {
                                examplePayload[item.name] = item.isCollection ? '["value1", "value2"]' : '"example"';
                            } else if (item.base?.name === 'number') {
                                examplePayload[item.name] = item.isCollection ? '[1, 2, 3]' : '123';
                            } else if (item.base?.name === 'boolean') {
                                examplePayload[item.name] = 'true';
                            } else if (item.base?.name === 'object' && item.isRef) {
                                examplePayload[item.name] = '{ id: "existing-id" }';
                            }
                        });
                        params.push(`  payload: ${JSON.stringify(examplePayload, null, 2).replace(/"/g, '')}`);
                    }
                    if (current.userAttributives) {
                        params.push('  user: { id: "user-id", role: "admin" }');
                    }
                    return `await controller.callInteraction('${current.name}', {${params.join(',\n')}
});`;
                };

                return (
                    <Fragment>
                        <h2>
                            {current.name}
                            <span className="action-badge">{current.action?.name || 'Action'}</span>
                        </h2>

                        {current.action ? (
                            <div className="section">
                                <h3>🎯 Action</h3>
                                <div className="content">
                                    <strong>Type:</strong> {current.action.name}
                                </div>
                            </div>
                        ) : null}

                        {current.payload?.items && current.payload.items.length > 0 ? (
                            <div className="section">
                                <h3>📦 Payload</h3>
                                <div className="content">
                                    {current.payload.items.map((item: any) => (
                                        <div key={item.name} className="payload-item">
                                            <div className="name">{item.name}</div>
                                            <div className="type">Type: {item.base?.name || 'unknown'}</div>
                                            <div className="badges">
                                                {item.required === false ? <span className="badge optional">Optional</span> : null}
                                                {item.required === true ? <span className="badge required">Required</span> : null}
                                                {item.isCollection ? <span className="badge collection">Collection</span> : null}
                                                {item.isRef ? <span className="badge reference">Reference</span> : null}
                                            </div>
                                            {item.attributives ? (
                                                <div className="attributive">
                                                    Validation: {
                                                        (item.attributives as any).name ? 
                                                        (item.attributives as any).name : 
                                                        'Custom validation'
                                                    }
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {current.userAttributives ? (
                            <div className="section">
                                <h3>🔒 User Permissions</h3>
                                <div className="content">
                                    This interaction requires user authentication and permissions.
                                    <div className="payload-item" style={{ marginTop: '12px' }}>
                                        <div className="name">User</div>
                                        <div className="type">Required user object with role</div>
                                        {current.userAttributives ? (
                                            (current.userAttributives as any).name ? (
                                                <div className="attributive">
                                                    Permission: {(current.userAttributives as any).name}
                                                </div>
                                            ) : (
                                                <div className="attributive">
                                                    Permission: Custom permission rules
                                                </div>
                                            )
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        <div className="section">
                            <h3>💻 Usage Example</h3>
                            <div className="content">
                                <div className="code-block" dangerouslySetInnerHTML={formatCode(generateUsageExample()) } />
                            </div>
                        </div>
                    </Fragment>
                );
            }}
        </div>
    );
} 