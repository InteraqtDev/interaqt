import * as vscode from 'vscode';

interface ComputationAnalysis {
    analysis_metadata?: {
        timestamp?: string;
        module?: string;
        source_file?: string;
        version?: string;
    };
    entities?: EntityAnalysis[];
    relations?: RelationAnalysis[];
    dictionaries?: DictionaryAnalysis[];
    validation?: Record<string, boolean>;
}

interface EntityAnalysis {
    name: string;
    entityAnalysis: {
        purpose: string;
        entityType: string;
        lifecycle: {
            creation: {
                type: string;
                parent?: string | null;
                relatedBusinessEntity?: string;
                creationInteractions?: Array<{
                    name: string;
                    description: string;
                    dependencies?: string[];
                }>;
            };
            deletion: {
                canBeDeleted: boolean;
                deletionType: string;
                deletionInteractions?: Array<{
                    name: string;
                    description: string;
                    dependencies?: string[];
                }>;
            };
        };
        dependencies: string[];
        computationDecision: string;
        reasoning: string;
        calculationMethod: string;
    };
    propertyAnalysis: PropertyAnalysis[];
}

interface PropertyAnalysis {
    propertyName: string;
    type: string;
    purpose: string;
    controlType: string;
    dataSource: string;
    computationDecision: string;
    reasoning: string;
    dependencies: string[];
    interactionDependencies: string[];
    calculationMethod: string;
}

interface RelationAnalysis {
    name: string;
    relationAnalysis: {
        purpose: string;
        type: string;
        sourceEntity: string;
        targetEntity: string;
        lifecycle: {
            creation: {
                type: string;
                parent?: string | null;
                creationInteractions?: Array<{
                    name: string;
                    description: string;
                    dependencies?: string[];
                }>;
            };
            deletion: {
                canBeDeleted: boolean;
                deletionType: string;
                deletionInteractions?: Array<{
                    name: string;
                    description: string;
                    dependencies?: string[];
                }>;
            };
        };
        dependencies: string[];
        computationDecision: string;
        reasoning: string;
        calculationMethod: string;
    };
    propertyAnalysis?: PropertyAnalysis[];
}

interface DictionaryAnalysis {
    name: string;
    dictionaryAnalysis: {
        purpose: string;
        type: string;
        collection: string;
        computationDecision: string;
        reasoning: string;
        dependencies: string[];
        interactionDependencies: string[];
        calculationMethod: string;
    };
}

export function getComputationWebviewContent(data: ComputationAnalysis, _webview: vscode.Webview): string {
    const metadata = data.analysis_metadata || {};
    const entities = data.entities || [];
    const relations = data.relations || [];
    const dictionaries = data.dictionaries || [];
    const validation = data.validation || {};
    const rawJson = JSON.stringify(data, null, 2);

    // Count by entity type
    const typeCounts = {
        business: entities.filter(e => e.entityAnalysis?.entityType === 'business').length,
        apiCall: entities.filter(e => e.entityAnalysis?.entityType === 'api-call').length,
        apiEvent: entities.filter(e => e.entityAnalysis?.entityType === 'api-event').length
    };

    // Count computations
    const computationCounts: Record<string, number> = {};
    entities.forEach(e => {
        const decision = e.entityAnalysis?.computationDecision || 'Unknown';
        computationCounts[decision] = (computationCounts[decision] || 0) + 1;
    });

    // Validation summary
    const validationResults = Object.entries(validation);
    const passedCount = validationResults.filter(([, v]) => v === true).length;
    const totalValidations = validationResults.length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Computation Analysis Viewer</title>
    <style>
        :root {
            --bg-primary: #0a0e14;
            --bg-secondary: #0f1419;
            --bg-tertiary: #1a1f26;
            --bg-card: #141921;
            --border-color: #2d3640;
            --border-highlight: #3d4a57;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --text-muted: #484f58;
            --accent-emerald: #10b981;
            --accent-cyan: #06b6d4;
            --accent-violet: #8b5cf6;
            --accent-amber: #f59e0b;
            --accent-rose: #f43f5e;
            --accent-sky: #0ea5e9;
            --accent-lime: #84cc16;
            --accent-fuchsia: #d946ef;
            --accent-teal: #14b8a6;
            --entity-business: #3b82f6;
            --entity-api-call: #f97316;
            --entity-api-event: #a855f7;
            --control-creation: #22c55e;
            --control-reactive: #eab308;
            --control-aggregation: #06b6d4;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
            --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
            --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
            --shadow-glow: 0 0 30px rgba(16, 185, 129, 0.1);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'IBM Plex Sans', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* Header */
        .header {
            background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
            border-bottom: 1px solid var(--border-color);
            padding: 24px 40px;
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(10px);
        }

        .header-content {
            max-width: 1800px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 24px;
        }

        .header-left {
            flex: 1;
        }

        .header h1 {
            font-size: 1.6rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent-emerald), var(--accent-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 12px;
            letter-spacing: -0.02em;
        }

        .header h1::before {
            content: '⚙️';
            font-size: 1.4rem;
            -webkit-text-fill-color: initial;
        }

        .metadata-bar {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .meta-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        .meta-badge .value {
            color: var(--accent-cyan);
            font-weight: 600;
        }

        /* View Toggle */
        .view-toggle {
            display: flex;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            overflow: hidden;
        }

        .view-toggle-btn {
            padding: 10px 18px;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.82rem;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .view-toggle-btn:hover {
            background: rgba(255,255,255,0.05);
            color: var(--text-primary);
        }

        .view-toggle-btn.active {
            background: linear-gradient(135deg, var(--accent-emerald), var(--accent-teal));
            color: #fff;
        }

        .view-toggle-btn:first-child {
            border-right: 1px solid var(--border-color);
        }

        /* Stats Bar */
        .stats-bar {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: 18px 40px;
        }

        .stats-container {
            max-width: 1800px;
            margin: 0 auto;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        .stat-card {
            flex: 1;
            min-width: 100px;
            padding: 14px 18px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            text-align: center;
            transition: all 0.2s ease;
        }

        .stat-card:hover {
            border-color: var(--accent-emerald);
            transform: translateY(-2px);
            box-shadow: var(--shadow-glow);
        }

        .stat-number {
            font-size: 1.8rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-emerald), var(--accent-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .stat-card.business .stat-number { 
            background: linear-gradient(135deg, var(--entity-business), #60a5fa); 
            -webkit-background-clip: text; 
            background-clip: text; 
        }
        .stat-card.api-call .stat-number { 
            background: linear-gradient(135deg, var(--entity-api-call), #fb923c); 
            -webkit-background-clip: text; 
            background-clip: text; 
        }
        .stat-card.api-event .stat-number { 
            background: linear-gradient(135deg, var(--entity-api-event), #c084fc); 
            -webkit-background-clip: text; 
            background-clip: text; 
        }
        .stat-card.relations .stat-number {
            background: linear-gradient(135deg, var(--accent-fuchsia), var(--accent-rose));
            -webkit-background-clip: text;
            background-clip: text;
        }
        .stat-card.validation .stat-number {
            background: linear-gradient(135deg, var(--accent-lime), var(--accent-emerald));
            -webkit-background-clip: text;
            background-clip: text;
        }

        .stat-label {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-top: 4px;
            font-weight: 600;
        }

        /* Tab Navigation */
        .tab-nav {
            display: flex;
            gap: 4px;
            padding: 14px 40px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 90px;
            z-index: 99;
            overflow-x: auto;
        }

        .tab-btn {
            padding: 10px 18px;
            border-radius: 8px;
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.82rem;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
        }

        .tab-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .tab-btn.active {
            background: var(--bg-tertiary);
            border-color: var(--accent-emerald);
            color: var(--accent-emerald);
        }

        .tab-btn .badge {
            background: var(--bg-primary);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.72rem;
            font-weight: 700;
        }

        /* Main Container */
        .main-container {
            max-width: 1800px;
            margin: 0 auto;
            padding: 28px 40px;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
            animation: fadeIn 0.25s ease;
        }

        /* Visual View */
        .visual-view {
            display: block;
        }

        .visual-view.hidden {
            display: none;
        }

        /* Source View */
        .source-view {
            display: none;
            padding: 28px 40px;
            max-width: 1800px;
            margin: 0 auto;
        }

        .source-view.active {
            display: block;
        }

        .source-code-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            overflow: hidden;
        }

        .source-code-header {
            padding: 14px 20px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .source-code-title {
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-weight: 600;
        }

        .copy-btn {
            padding: 7px 14px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 7px;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            transition: all 0.2s ease;
        }

        .copy-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border-color: var(--accent-emerald);
        }

        .copy-btn.copied {
            background: var(--accent-emerald);
            color: #fff;
            border-color: var(--accent-emerald);
        }

        .source-code {
            padding: 20px;
            overflow-x: auto;
            max-height: calc(100vh - 280px);
            overflow-y: auto;
        }

        .source-code pre {
            margin: 0;
            font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;
            font-size: 0.82rem;
            line-height: 1.6;
            color: var(--text-primary);
        }

        .source-code .json-key { color: var(--accent-cyan); }
        .source-code .json-string { color: var(--accent-lime); }
        .source-code .json-number { color: var(--accent-amber); }
        .source-code .json-boolean { color: var(--accent-violet); }
        .source-code .json-null { color: var(--text-muted); }

        /* Entity Cards */
        .entity-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
            gap: 20px;
        }

        .entity-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            overflow: hidden;
            transition: all 0.25s ease;
        }

        .entity-card:hover {
            border-color: var(--border-highlight);
            box-shadow: var(--shadow-lg);
            transform: translateY(-2px);
        }

        .entity-card.business { border-top: 3px solid var(--entity-business); }
        .entity-card.api-call { border-top: 3px solid var(--entity-api-call); }
        .entity-card.api-event { border-top: 3px solid var(--entity-api-event); }

        .entity-header {
            padding: 18px 22px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
        }

        .entity-header-left {
            flex: 1;
        }

        .entity-name-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 8px;
        }

        .entity-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.05rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .entity-type-badge {
            padding: 3px 10px;
            border-radius: 5px;
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .entity-type-badge.business {
            background: rgba(59, 130, 246, 0.15);
            color: var(--entity-business);
            border: 1px solid var(--entity-business);
        }

        .entity-type-badge.api-call {
            background: rgba(249, 115, 22, 0.15);
            color: var(--entity-api-call);
            border: 1px solid var(--entity-api-call);
        }

        .entity-type-badge.api-event {
            background: rgba(168, 85, 247, 0.15);
            color: var(--entity-api-event);
            border: 1px solid var(--entity-api-event);
        }

        .entity-purpose {
            font-size: 0.82rem;
            color: var(--text-secondary);
        }

        .entity-body {
            padding: 18px 22px;
        }

        /* Computation Decision Badge */
        .computation-badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 5px 12px;
            border-radius: 6px;
            font-size: 0.72rem;
            font-weight: 700;
        }

        .computation-badge.transform {
            background: rgba(16, 185, 129, 0.15);
            color: var(--accent-emerald);
            border: 1px solid var(--accent-emerald);
        }

        .computation-badge.statemachine {
            background: rgba(234, 179, 8, 0.15);
            color: var(--control-reactive);
            border: 1px solid var(--control-reactive);
        }

        .computation-badge.count {
            background: rgba(6, 182, 212, 0.15);
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
        }

        .computation-badge.none {
            background: rgba(139, 148, 158, 0.15);
            color: var(--text-secondary);
            border: 1px solid var(--text-muted);
        }

        .computation-badge.owner {
            background: rgba(132, 204, 22, 0.15);
            color: var(--accent-lime);
            border: 1px solid var(--accent-lime);
        }

        .computation-badge.parent {
            background: rgba(217, 70, 239, 0.15);
            color: var(--accent-fuchsia);
            border: 1px solid var(--accent-fuchsia);
        }

        .computation-badge.static {
            background: rgba(139, 148, 158, 0.1);
            color: var(--text-muted);
            border: 1px solid var(--text-muted);
        }

        /* Section Styles */
        .section {
            margin-bottom: 16px;
        }

        .section:last-child {
            margin-bottom: 0;
        }

        .section-title {
            font-size: 0.68rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* Lifecycle Section */
        .lifecycle-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        .lifecycle-box {
            background: var(--bg-tertiary);
            border-radius: 8px;
            padding: 12px 14px;
            border: 1px solid var(--border-color);
        }

        .lifecycle-label {
            font-size: 0.68rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
            font-weight: 700;
        }

        .lifecycle-type {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--accent-cyan);
            margin-bottom: 4px;
        }

        .lifecycle-detail {
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        /* Dependencies */
        .deps-container {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .dep-badge {
            padding: 3px 8px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 5px;
            font-size: 0.72rem;
            font-family: 'JetBrains Mono', monospace;
            color: var(--accent-violet);
            font-weight: 600;
        }

        .interaction-dep {
            color: var(--accent-amber);
        }

        /* Reasoning Box */
        .reasoning-box {
            background: var(--bg-tertiary);
            border-left: 3px solid var(--accent-emerald);
            border-radius: 0 8px 8px 0;
            padding: 12px 14px;
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        /* Properties List */
        .properties-container {
            margin-top: 16px;
            border-top: 1px solid var(--border-color);
            padding-top: 16px;
        }

        .properties-toggle {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            font-size: 0.8rem;
            font-weight: 600;
            transition: all 0.2s ease;
        }

        .properties-toggle:hover {
            background: var(--bg-primary);
            color: var(--text-primary);
        }

        .properties-toggle .arrow {
            transition: transform 0.2s ease;
        }

        .properties-toggle.expanded .arrow {
            transform: rotate(90deg);
        }

        .properties-list {
            margin-top: 12px;
            display: none;
        }

        .properties-list.expanded {
            display: block;
            animation: slideDown 0.2s ease;
        }

        .property-item {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 10px;
        }

        .property-item:last-child {
            margin-bottom: 0;
        }

        .property-header {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 8px;
        }

        .property-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.88rem;
            font-weight: 600;
            color: var(--accent-fuchsia);
        }

        .property-type {
            font-size: 0.7rem;
            padding: 2px 8px;
            background: rgba(6, 182, 212, 0.1);
            color: var(--accent-cyan);
            border-radius: 4px;
            font-weight: 600;
        }

        .control-type-badge {
            font-size: 0.65rem;
            padding: 2px 7px;
            border-radius: 4px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .control-type-badge.creation-only {
            background: rgba(34, 197, 94, 0.15);
            color: var(--control-creation);
        }

        .control-type-badge.computed-reactive {
            background: rgba(234, 179, 8, 0.15);
            color: var(--control-reactive);
        }

        .control-type-badge.computed-aggregation {
            background: rgba(6, 182, 212, 0.15);
            color: var(--control-aggregation);
        }

        .property-purpose {
            font-size: 0.78rem;
            color: var(--text-secondary);
            margin-bottom: 10px;
        }

        .property-details {
            display: grid;
            gap: 8px;
        }

        .property-detail-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            font-size: 0.75rem;
        }

        .detail-label {
            min-width: 90px;
            color: var(--text-muted);
            font-weight: 600;
        }

        .detail-value {
            color: var(--text-secondary);
            flex: 1;
        }

        /* Relation Cards */
        .relation-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 20px 22px;
            margin-bottom: 16px;
            border-left: 3px solid var(--accent-fuchsia);
            transition: all 0.2s ease;
        }

        .relation-card:hover {
            border-color: var(--border-highlight);
            box-shadow: var(--shadow-md);
        }

        .relation-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
            flex-wrap: wrap;
            gap: 12px;
        }

        .relation-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .relation-type-badge {
            font-size: 0.7rem;
            padding: 3px 10px;
            background: rgba(217, 70, 239, 0.15);
            color: var(--accent-fuchsia);
            border: 1px solid var(--accent-fuchsia);
            border-radius: 5px;
            font-weight: 700;
        }

        .relation-flow {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            margin-bottom: 14px;
        }

        .relation-entity {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            font-weight: 600;
            padding: 6px 12px;
            background: var(--bg-primary);
            border-radius: 6px;
            color: var(--accent-sky);
        }

        .relation-arrow {
            color: var(--text-muted);
            font-size: 1.2rem;
        }

        /* Dictionary Cards */
        .dictionary-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 14px;
            padding: 20px 22px;
            margin-bottom: 16px;
            border-left: 3px solid var(--accent-amber);
        }

        .dictionary-name {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 10px;
        }

        /* Validation Section */
        .validation-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 12px;
        }

        .validation-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            transition: all 0.2s ease;
        }

        .validation-item:hover {
            border-color: var(--border-highlight);
        }

        .validation-icon {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            flex-shrink: 0;
        }

        .validation-icon.pass {
            background: rgba(34, 197, 94, 0.15);
            color: var(--accent-emerald);
        }

        .validation-icon.fail {
            background: rgba(244, 63, 94, 0.15);
            color: var(--accent-rose);
        }

        .validation-text {
            font-size: 0.82rem;
            color: var(--text-secondary);
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 60px 40px;
            color: var(--text-muted);
        }

        .empty-state-icon {
            font-size: 3.5rem;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .empty-state-text {
            font-size: 1rem;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 7px;
            height: 7px;
        }

        ::-webkit-scrollbar-track {
            background: var(--bg-primary);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--text-muted);
        }

        /* Animations */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideDown {
            from { opacity: 0; max-height: 0; }
            to { opacity: 1; max-height: 2000px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="header-left">
                <h1>Computation Analysis</h1>
                <div class="metadata-bar">
                    <span class="meta-badge">
                        📦 Module: <span class="value">${escapeHtml(metadata.module || 'N/A')}</span>
                    </span>
                    <span class="meta-badge">
                        📄 Source: <span class="value">${escapeHtml(metadata.source_file || 'N/A')}</span>
                    </span>
                    <span class="meta-badge">
                        📅 Generated: <span class="value">${escapeHtml(metadata.timestamp || 'N/A')}</span>
                    </span>
                    <span class="meta-badge">
                        🏷️ Version: <span class="value">${escapeHtml(metadata.version || 'N/A')}</span>
                    </span>
                </div>
            </div>
            <div class="view-toggle">
                <button class="view-toggle-btn active" id="visual-btn">
                    ◈ Visual
                </button>
                <button class="view-toggle-btn" id="source-btn">
                    { } Source
                </button>
            </div>
        </div>
    </div>

    <!-- Visual View -->
    <div class="visual-view" id="visual-view">
        <!-- Stats Bar -->
        <div class="stats-bar">
            <div class="stats-container">
                <div class="stat-card">
                    <div class="stat-number">${entities.length}</div>
                    <div class="stat-label">Entities</div>
                </div>
                <div class="stat-card business">
                    <div class="stat-number">${typeCounts.business}</div>
                    <div class="stat-label">Business</div>
                </div>
                <div class="stat-card api-call">
                    <div class="stat-number">${typeCounts.apiCall}</div>
                    <div class="stat-label">API Call</div>
                </div>
                <div class="stat-card api-event">
                    <div class="stat-number">${typeCounts.apiEvent}</div>
                    <div class="stat-label">API Event</div>
                </div>
                <div class="stat-card relations">
                    <div class="stat-number">${relations.length}</div>
                    <div class="stat-label">Relations</div>
                </div>
                <div class="stat-card validation">
                    <div class="stat-number">${passedCount}/${totalValidations}</div>
                    <div class="stat-label">Validation</div>
                </div>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-nav">
            <button class="tab-btn active" data-tab="entities">
                🧩 Entities <span class="badge">${entities.length}</span>
            </button>
            <button class="tab-btn" data-tab="relations">
                🔗 Relations <span class="badge">${relations.length}</span>
            </button>
            <button class="tab-btn" data-tab="dictionaries">
                📚 Dictionaries <span class="badge">${dictionaries.length}</span>
            </button>
            <button class="tab-btn" data-tab="validation">
                ✅ Validation <span class="badge">${passedCount}/${totalValidations}</span>
            </button>
        </div>

        <div class="main-container">
            <!-- Entities Tab -->
            <div class="tab-content active" id="entities">
                <div class="entity-grid">
                    ${generateEntityCards(entities)}
                </div>
            </div>

            <!-- Relations Tab -->
            <div class="tab-content" id="relations">
                ${generateRelationCards(relations)}
            </div>

            <!-- Dictionaries Tab -->
            <div class="tab-content" id="dictionaries">
                ${generateDictionaryCards(dictionaries)}
            </div>

            <!-- Validation Tab -->
            <div class="tab-content" id="validation">
                ${generateValidationView(validation)}
            </div>
        </div>
    </div>

    <!-- Source View -->
    <div class="source-view" id="source-view">
        <div class="source-code-container">
            <div class="source-code-header">
                <span class="source-code-title">JSON Source</span>
                <button class="copy-btn" id="copy-btn">📋 Copy to Clipboard</button>
            </div>
            <div class="source-code">
                <pre id="json-source"></pre>
            </div>
        </div>
    </div>

    <script>
        // Raw JSON for source view
        const rawJson = ${JSON.stringify(rawJson)};

        // Syntax highlighting for JSON
        function syntaxHighlight(json) {
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function (match) {
                let cls = 'json-number';
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
        }

        // Initialize source view
        document.getElementById('json-source').innerHTML = syntaxHighlight(rawJson);

        // View toggle
        const visualBtn = document.getElementById('visual-btn');
        const sourceBtn = document.getElementById('source-btn');
        const visualView = document.getElementById('visual-view');
        const sourceView = document.getElementById('source-view');

        visualBtn.addEventListener('click', () => {
            visualBtn.classList.add('active');
            sourceBtn.classList.remove('active');
            visualView.classList.remove('hidden');
            sourceView.classList.remove('active');
        });

        sourceBtn.addEventListener('click', () => {
            sourceBtn.classList.add('active');
            visualBtn.classList.remove('active');
            visualView.classList.add('hidden');
            sourceView.classList.add('active');
        });

        // Copy button
        const copyBtn = document.getElementById('copy-btn');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(rawJson);
                copyBtn.textContent = '✅ Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy to Clipboard';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (err) {
                copyBtn.textContent = '❌ Failed';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy to Clipboard';
                }, 2000);
            }
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
            });
        });

        // Properties toggle
        document.querySelectorAll('.properties-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('expanded');
                const list = toggle.nextElementSibling;
                list.classList.toggle('expanded');
            });
        });
    </script>
</body>
</html>`;
}

function generateEntityCards(entities: EntityAnalysis[]): string {
    if (entities.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">🧩</div><div class="empty-state-text">No entities defined</div></div>';
    }

    return entities.map(entity => {
        const analysis = entity.entityAnalysis || {};
        const entityType = analysis.entityType || 'business';
        const lifecycle = analysis.lifecycle || {};
        const creation = lifecycle.creation || {};
        const deletion = lifecycle.deletion || {};
        const properties = entity.propertyAnalysis || [];

        const computationClass = getComputationClass(analysis.computationDecision);

        return `
            <div class="entity-card ${entityType}">
                <div class="entity-header">
                    <div class="entity-header-left">
                        <div class="entity-name-row">
                            <span class="entity-name">${escapeHtml(entity.name)}</span>
                            <span class="entity-type-badge ${entityType}">${escapeHtml(entityType)}</span>
                            <span class="computation-badge ${computationClass}">${escapeHtml(analysis.computationDecision || 'Unknown')}</span>
                        </div>
                        <div class="entity-purpose">${escapeHtml(analysis.purpose || '')}</div>
                    </div>
                </div>
                <div class="entity-body">
                    <!-- Lifecycle Section -->
                    <div class="section">
                        <div class="section-title">🔄 Lifecycle</div>
                        <div class="lifecycle-container">
                            <div class="lifecycle-box">
                                <div class="lifecycle-label">Creation</div>
                                <div class="lifecycle-type">${escapeHtml(creation.type || 'N/A')}</div>
                                ${creation.parent ? `<div class="lifecycle-detail">Parent: ${escapeHtml(creation.parent)}</div>` : ''}
                                ${creation.relatedBusinessEntity ? `<div class="lifecycle-detail">Related: ${escapeHtml(creation.relatedBusinessEntity)}</div>` : ''}
                            </div>
                            <div class="lifecycle-box">
                                <div class="lifecycle-label">Deletion</div>
                                <div class="lifecycle-type">${escapeHtml(deletion.deletionType || 'N/A')}</div>
                                <div class="lifecycle-detail">${deletion.canBeDeleted ? '✓ Can be deleted' : '✗ Cannot be deleted'}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Dependencies Section -->
                    ${analysis.dependencies && analysis.dependencies.length > 0 ? `
                    <div class="section">
                        <div class="section-title">🔗 Dependencies</div>
                        <div class="deps-container">
                            ${analysis.dependencies.map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Reasoning Section -->
                    <div class="section">
                        <div class="section-title">💡 Reasoning</div>
                        <div class="reasoning-box">${escapeHtml(analysis.reasoning || 'No reasoning provided')}</div>
                    </div>

                    <!-- Calculation Method -->
                    <div class="section">
                        <div class="section-title">⚙️ Calculation Method</div>
                        <div class="reasoning-box">${escapeHtml(analysis.calculationMethod || 'No method specified')}</div>
                    </div>

                    <!-- Properties Section -->
                    ${properties.length > 0 ? `
                    <div class="properties-container">
                        <div class="properties-toggle">
                            <span class="arrow">▶</span>
                            <span>Properties (${properties.length})</span>
                        </div>
                        <div class="properties-list">
                            ${generatePropertyItems(properties)}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function generatePropertyItems(properties: PropertyAnalysis[]): string {
    return properties.map(prop => {
        const controlTypeClass = prop.controlType?.replace(/[^a-z-]/gi, '-').toLowerCase() || '';
        const computationClass = getComputationClass(prop.computationDecision);

        return `
            <div class="property-item">
                <div class="property-header">
                    <span class="property-name">${escapeHtml(prop.propertyName)}</span>
                    <span class="property-type">${escapeHtml(prop.type)}</span>
                    <span class="control-type-badge ${controlTypeClass}">${escapeHtml(prop.controlType)}</span>
                    <span class="computation-badge ${computationClass}">${escapeHtml(prop.computationDecision)}</span>
                </div>
                <div class="property-purpose">${escapeHtml(prop.purpose)}</div>
                <div class="property-details">
                    ${prop.dataSource ? `
                    <div class="property-detail-row">
                        <span class="detail-label">Data Source:</span>
                        <span class="detail-value">${escapeHtml(prop.dataSource)}</span>
                    </div>
                    ` : ''}
                    ${prop.dependencies && prop.dependencies.length > 0 ? `
                    <div class="property-detail-row">
                        <span class="detail-label">Deps:</span>
                        <span class="detail-value">
                            <div class="deps-container">
                                ${prop.dependencies.map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('')}
                            </div>
                        </span>
                    </div>
                    ` : ''}
                    ${prop.interactionDependencies && prop.interactionDependencies.length > 0 ? `
                    <div class="property-detail-row">
                        <span class="detail-label">Interactions:</span>
                        <span class="detail-value">
                            <div class="deps-container">
                                ${prop.interactionDependencies.map(d => `<span class="dep-badge interaction-dep">${escapeHtml(d)}</span>`).join('')}
                            </div>
                        </span>
                    </div>
                    ` : ''}
                    ${prop.calculationMethod ? `
                    <div class="property-detail-row">
                        <span class="detail-label">Method:</span>
                        <span class="detail-value">${escapeHtml(prop.calculationMethod)}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function generateRelationCards(relations: RelationAnalysis[]): string {
    if (relations.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">🔗</div><div class="empty-state-text">No relations defined</div></div>';
    }

    return relations.map(relation => {
        const analysis = relation.relationAnalysis || {};
        const lifecycle = analysis.lifecycle || {};
        const creation = lifecycle.creation || {};
        const deletion = lifecycle.deletion || {};
        const properties = relation.propertyAnalysis || [];
        const computationClass = getComputationClass(analysis.computationDecision);

        return `
            <div class="relation-card">
                <div class="relation-header">
                    <span class="relation-name">${escapeHtml(relation.name)}</span>
                    <span class="relation-type-badge">${escapeHtml(analysis.type || 'N/A')}</span>
                    <span class="computation-badge ${computationClass}">${escapeHtml(analysis.computationDecision || 'Unknown')}</span>
                </div>

                <div class="relation-flow">
                    <span class="relation-entity">${escapeHtml(analysis.sourceEntity || '?')}</span>
                    <span class="relation-arrow">→</span>
                    <span class="relation-entity">${escapeHtml(analysis.targetEntity || '?')}</span>
                </div>

                <div class="entity-purpose" style="margin-bottom: 14px;">${escapeHtml(analysis.purpose || '')}</div>

                <div class="lifecycle-container" style="margin-bottom: 14px;">
                    <div class="lifecycle-box">
                        <div class="lifecycle-label">Creation</div>
                        <div class="lifecycle-type">${escapeHtml(creation.type || 'N/A')}</div>
                        ${creation.parent ? `<div class="lifecycle-detail">Parent: ${escapeHtml(creation.parent)}</div>` : ''}
                    </div>
                    <div class="lifecycle-box">
                        <div class="lifecycle-label">Deletion</div>
                        <div class="lifecycle-type">${escapeHtml(deletion.deletionType || 'N/A')}</div>
                        <div class="lifecycle-detail">${deletion.canBeDeleted ? '✓ Can be deleted' : '✗ Cannot be deleted'}</div>
                    </div>
                </div>

                ${analysis.dependencies && analysis.dependencies.length > 0 ? `
                <div class="section">
                    <div class="section-title">🔗 Dependencies</div>
                    <div class="deps-container">
                        ${analysis.dependencies.map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                <div class="section">
                    <div class="section-title">💡 Reasoning</div>
                    <div class="reasoning-box">${escapeHtml(analysis.reasoning || 'No reasoning provided')}</div>
                </div>

                ${properties.length > 0 ? `
                <div class="properties-container" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-color);">
                    <div class="properties-toggle">
                        <span class="arrow">▶</span>
                        <span>Relation Properties (${properties.length})</span>
                    </div>
                    <div class="properties-list">
                        ${generatePropertyItems(properties)}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function generateDictionaryCards(dictionaries: DictionaryAnalysis[]): string {
    if (dictionaries.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">📚</div><div class="empty-state-text">No dictionaries defined</div></div>';
    }

    return dictionaries.map(dict => {
        const analysis = dict.dictionaryAnalysis || {};
        const computationClass = getComputationClass(analysis.computationDecision);

        return `
            <div class="dictionary-card">
                <div class="relation-header">
                    <span class="dictionary-name">${escapeHtml(dict.name)}</span>
                    <span class="computation-badge ${computationClass}">${escapeHtml(analysis.computationDecision || 'Unknown')}</span>
                </div>

                <div class="entity-purpose" style="margin-bottom: 14px;">${escapeHtml(analysis.purpose || '')}</div>

                <div class="property-details">
                    <div class="property-detail-row">
                        <span class="detail-label">Type:</span>
                        <span class="detail-value">${escapeHtml(analysis.type || 'N/A')}</span>
                    </div>
                    <div class="property-detail-row">
                        <span class="detail-label">Collection:</span>
                        <span class="detail-value">${escapeHtml(analysis.collection || 'N/A')}</span>
                    </div>
                    ${analysis.interactionDependencies && analysis.interactionDependencies.length > 0 ? `
                    <div class="property-detail-row">
                        <span class="detail-label">Interactions:</span>
                        <span class="detail-value">
                            <div class="deps-container">
                                ${analysis.interactionDependencies.map(d => `<span class="dep-badge interaction-dep">${escapeHtml(d)}</span>`).join('')}
                            </div>
                        </span>
                    </div>
                    ` : ''}
                </div>

                <div class="section" style="margin-top: 14px;">
                    <div class="section-title">💡 Reasoning</div>
                    <div class="reasoning-box">${escapeHtml(analysis.reasoning || 'No reasoning provided')}</div>
                </div>
            </div>
        `;
    }).join('');
}

function generateValidationView(validation: Record<string, boolean>): string {
    const entries = Object.entries(validation);
    
    if (entries.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No validation rules defined</div></div>';
    }

    return `
        <div class="validation-grid">
            ${entries.map(([key, value]) => `
                <div class="validation-item">
                    <div class="validation-icon ${value ? 'pass' : 'fail'}">
                        ${value ? '✓' : '✗'}
                    </div>
                    <div class="validation-text">${formatValidationKey(key)}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function getComputationClass(decision: string | undefined): string {
    if (!decision) return 'none';
    const lower = decision.toLowerCase();
    if (lower.includes('transform')) return 'transform';
    if (lower.includes('statemachine')) return 'statemachine';
    if (lower.includes('count') || lower.includes('summation') || lower.includes('every')) return 'count';
    if (lower.includes('_owner') || lower === 'owner') return 'owner';
    if (lower.includes('_parent') || lower.startsWith('parent')) return 'parent';
    if (lower.includes('static') || lower === 'none') return 'static';
    return 'none';
}

function formatValidationKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(text: string): string {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

