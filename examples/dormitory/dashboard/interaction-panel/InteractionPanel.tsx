import { RenderContext, atom, RxList, ContextProvider, computed } from "axii";
import { Router } from 'router0';
import { InteractionDetail } from "./InteractionDetail";
import { InteractionList } from "./InteractionList";
import { InteractionInstance } from "@shared";
import { RouterContext } from "../Dashboard";

type InteractionPanelProps = {
    interactions: InteractionInstance[]
}

// Create a sub-router context for interaction panel
export const InteractionRouterContext = Symbol('InteractionRouterContext');

export function InteractionPanel({ interactions }: InteractionPanelProps, { createElement, context }: RenderContext) {
    const interactionList = new RxList(interactions);
    
    // Get the derived router class from context
    const SubRouter = context.get(RouterContext) as typeof Router;
    
    // Create router instance for interaction panel
    const router = new SubRouter([
        {
            path: '/:name',
            handler: () => null, // We handle rendering in the panel itself
        },
        {
            path: '/',
            handler: () => null,
        }
    ]);
    
    // Compute selected interaction based on router pathname
    const selectedInteraction = computed<InteractionInstance | null>(() => {
        const params = router.params();
        const name = params?.name;
        
        if (name) {
            return interactions.find(i => i.name === name) || null;
        }
        return null;
    });

    // Container style with dark theme
    const containerStyle = {
        display: 'flex',
        height: '100%',
        backgroundColor: '#0a0a0a',
        color: '#fff',
        padding: '24px',
        gap: '24px',
        '@keyframes fadeIn': {
            from: { opacity: 0 },
            to: { opacity: 1 }
        },
        animation: 'fadeIn 0.3s ease-out'
    };

    return (
        <ContextProvider contextType={InteractionRouterContext} value={router}>
            <div style={containerStyle}>
                <InteractionList 
                    interactions={interactionList}
                    selectedInteraction={selectedInteraction}
                    router={router}
                />

                <InteractionDetail interaction={selectedInteraction} />
            </div>
        </ContextProvider>
    );
}

// Helper function to generate description based on interaction properties
function getInteractionDescription(interaction: InteractionInstance): string {
    const { name, action, userAttributives } = interaction;
    
    const actionName = action?.name || 'unknown';
    const hasPayload = interaction.payload && interaction.payload.items?.length > 0;
    
    // Generate description based on action and name
    const descriptions: Record<string, string> = {
        'CreateStyle': 'Creates a new style with draft status',
        'UpdateStyle': 'Updates existing style properties',
        'DeleteStyle': 'Soft deletes a style by changing status to offline',
        'PublishStyle': 'Changes style status from draft to published',
        'UnpublishStyle': 'Changes style status from published to offline',
        'ReorderStyles': 'Updates the priority order of multiple styles',
        'ListPublishedStyles': 'Retrieves all published styles',
        'ListAllStyles': 'Retrieves all styles with optional filtering',
        'GetStyleDetails': 'Gets detailed information about a specific style',
        'GetStyleVersions': 'Retrieves version history for a style',
        'RollbackStyleVersion': 'Rolls back a style to a previous version',
        'UploadStyleThumbnail': 'Uploads and associates a thumbnail image with a style'
    };
    
    return descriptions[name] || `Performs ${actionName} action${hasPayload ? ' with payload' : ''}${userAttributives ? ' (requires permissions)' : ''}`;
} 