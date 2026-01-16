import * as vscode from 'vscode';

interface DataDesign {
    analysis_metadata?: {
        timestamp?: string;
        module?: string;
        source_files?: string[];
        version?: string;
    };
    entities?: Record<string, Entity>;
    relations?: Record<string, Relation>;
    dictionaries?: Record<string, Dictionary>;
    verification?: Record<string, boolean>;
}

interface Entity {
    purpose?: string;
    entityType?: string;
    dataDependencies?: string[];
    computationMethod?: string;
    lifecycle?: {
        creation?: {
            type?: string;
            parent?: string | null;
            creationInteractions?: Array<{
                name: string;
                description?: string;
                dependencies?: string[];
            }>;
        };
        deletion?: {
            canBeDeleted?: boolean;
            deletionType?: string;
            deletionInteractions?: Array<{
                name: string;
                description?: string;
            }>;
        };
    };
    properties?: Record<string, Property>;
}

interface Property {
    type?: string;
    purpose?: string;
    controlType?: string;
    dataDependencies?: string[];
    interactionDependencies?: string[];
    computationMethod?: string;
    initialValue?: string;
    attributes?: Record<string, string>;
}

interface Relation {
    type?: string;
    purpose?: string;
    sourceEntity?: string;
    targetEntity?: string;
    sourceProperty?: string;
    targetProperty?: string;
    dataDependencies?: string[];
    computationMethod?: string;
    lifecycle?: Entity['lifecycle'];
    properties?: Record<string, Property>;
}

interface Dictionary {
    purpose?: string;
    type?: string;
    dataDependencies?: string[];
    interactionDependencies?: string[];
    computationMethod?: string;
    keys?: Record<string, Property>;
}

export function getWebviewContent(data: DataDesign, _webview: vscode.Webview): string {
    const entities = data.entities || {};
    const relations = data.relations || {};
    const dictionaries = data.dictionaries || {};
    const metadata = data.analysis_metadata || {};
    const rawJson = JSON.stringify(data, null, 2);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Design Viewer</title>
    <style>
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border-color: #30363d;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --text-muted: #656d76;
            --accent-blue: #58a6ff;
            --accent-green: #3fb950;
            --accent-purple: #a371f7;
            --accent-orange: #d29922;
            --accent-red: #f85149;
            --accent-cyan: #39c5cf;
            --accent-pink: #db61a2;
            --entity-business: #238636;
            --entity-api-call: #1f6feb;
            --entity-api-event: #a371f7;
            --entity-user-profile: #d29922;
            --entity-polymorphic: #db61a2;
            --shadow: 0 8px 24px rgba(0,0,0,0.4);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
            border-bottom: 1px solid var(--border-color);
            padding: 24px 32px;
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
        }

        .header-left {
            flex: 1;
        }

        .header h1 {
            font-size: 1.75rem;
            font-weight: 600;
            background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .header h1::before {
            content: '◈';
            font-size: 1.5rem;
        }

        .metadata {
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
        }

        .meta-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .meta-item .label {
            color: var(--text-muted);
        }

        .meta-item .value {
            color: var(--accent-cyan);
            font-weight: 500;
        }

        /* View Toggle Button */
        .view-toggle {
            display: flex;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
        }

        .view-toggle-btn {
            padding: 10px 18px;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .view-toggle-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .view-toggle-btn.active {
            background: var(--accent-blue);
            color: #fff;
        }

        .view-toggle-btn:first-child {
            border-right: 1px solid var(--border-color);
        }

        /* Navigation Tabs */
        .nav-tabs {
            display: flex;
            gap: 4px;
            padding: 16px 32px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 92px;
            z-index: 99;
        }

        .nav-tab {
            padding: 10px 20px;
            border-radius: 8px;
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .nav-tab:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .nav-tab.active {
            background: var(--bg-tertiary);
            border-color: var(--accent-blue);
            color: var(--accent-blue);
        }

        .nav-tab .count {
            background: var(--bg-primary);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.75rem;
        }

        /* Main Container */
        .main-container {
            max-width: 1800px;
            margin: 0 auto;
            padding: 32px;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Source Code View */
        .source-view {
            display: none;
            padding: 32px;
            max-width: 1800px;
            margin: 0 auto;
        }

        .source-view.active {
            display: block;
        }

        .source-code-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
        }

        .source-code-header {
            padding: 12px 20px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .source-code-title {
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-weight: 500;
        }

        .copy-btn {
            padding: 6px 12px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.8rem;
            transition: all 0.2s ease;
        }

        .copy-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
            border-color: var(--accent-blue);
        }

        .copy-btn.copied {
            background: var(--accent-green);
            color: #fff;
            border-color: var(--accent-green);
        }

        .source-code {
            padding: 20px;
            overflow-x: auto;
            max-height: calc(100vh - 250px);
            overflow-y: auto;
        }

        .source-code pre {
            margin: 0;
            font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
            font-size: 0.85rem;
            line-height: 1.5;
            color: var(--text-primary);
        }

        .source-code .json-key {
            color: var(--accent-cyan);
        }

        .source-code .json-string {
            color: var(--accent-green);
        }

        .source-code .json-number {
            color: var(--accent-orange);
        }

        .source-code .json-boolean {
            color: var(--accent-purple);
        }

        .source-code .json-null {
            color: var(--text-muted);
        }

        /* Visual View Container */
        .visual-view {
            display: block;
        }

        .visual-view.hidden {
            display: none;
        }

        /* ER Diagram Container */
        .er-diagram-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            margin-bottom: 32px;
        }

        .er-diagram-header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .er-diagram-title {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        .er-diagram-legend {
            display: flex;
            gap: 16px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        .legend-dot {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }

        .legend-dot.business { background: var(--entity-business); }
        .legend-dot.api-call { background: var(--entity-api-call); }
        .legend-dot.api-event { background: var(--entity-api-event); }

        #er-canvas {
            width: 100%;
            height: 500px;
            background: 
                radial-gradient(circle at 20% 50%, rgba(88, 166, 255, 0.03) 0%, transparent 40%),
                linear-gradient(var(--bg-tertiary) 1px, transparent 1px),
                linear-gradient(90deg, var(--bg-tertiary) 1px, transparent 1px);
            background-size: 100% 100%, 40px 40px, 40px 40px;
        }

        /* Entity Cards Grid */
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
            gap: 24px;
        }

        .entity-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .entity-card:hover {
            border-color: var(--accent-blue);
            box-shadow: var(--shadow), 0 0 0 1px var(--accent-blue);
            transform: translateY(-2px);
        }

        .card-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .card-title-section {
            flex: 1;
        }

        .card-title {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .entity-type-badge {
            font-size: 0.7rem;
            padding: 4px 10px;
            border-radius: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .entity-type-badge.business {
            background: rgba(35, 134, 54, 0.2);
            color: var(--entity-business);
            border: 1px solid var(--entity-business);
        }

        .entity-type-badge.api-call {
            background: rgba(31, 111, 235, 0.2);
            color: var(--entity-api-call);
            border: 1px solid var(--entity-api-call);
        }

        .entity-type-badge.api-event {
            background: rgba(163, 113, 247, 0.2);
            color: var(--entity-api-event);
            border: 1px solid var(--entity-api-event);
        }

        .entity-type-badge.user-profile {
            background: rgba(210, 153, 34, 0.2);
            color: var(--entity-user-profile);
            border: 1px solid var(--entity-user-profile);
        }

        .entity-type-badge.polymorphic {
            background: rgba(219, 97, 162, 0.2);
            color: var(--entity-polymorphic);
            border: 1px solid var(--entity-polymorphic);
        }

        .card-purpose {
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.5;
        }

        .card-body {
            padding: 0;
        }

        /* Collapsible Sections */
        .section {
            border-bottom: 1px solid var(--border-color);
        }

        .section:last-child {
            border-bottom: none;
        }

        .section-header {
            padding: 14px 24px;
            background: var(--bg-tertiary);
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background 0.2s ease;
            user-select: none;
        }

        .section-header:hover {
            background: rgba(88, 166, 255, 0.1);
        }

        .section-title {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .section-toggle {
            color: var(--text-muted);
            font-size: 0.8rem;
            transition: transform 0.2s ease;
        }

        .section.collapsed .section-toggle {
            transform: rotate(-90deg);
        }

        .section-content {
            padding: 16px 24px;
            background: var(--bg-primary);
        }

        .section.collapsed .section-content {
            display: none;
        }

        /* Properties Table */
        .properties-table {
            width: 100%;
            border-collapse: collapse;
        }

        .properties-table th,
        .properties-table td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
            font-size: 0.85rem;
        }

        .properties-table th {
            color: var(--text-muted);
            font-weight: 500;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .properties-table tr:last-child td {
            border-bottom: none;
        }

        .properties-table tr:hover {
            background: rgba(88, 166, 255, 0.05);
        }

        .prop-name {
            color: var(--accent-cyan);
            font-weight: 600;
        }

        .prop-type {
            color: var(--accent-purple);
            font-family: 'SF Mono', monospace;
            font-size: 0.8rem;
        }

        .prop-control {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 500;
        }

        .prop-control.creation-only {
            background: rgba(63, 185, 80, 0.15);
            color: var(--accent-green);
        }

        .prop-control.computed-reactive {
            background: rgba(163, 113, 247, 0.15);
            color: var(--accent-purple);
        }

        .prop-control.computed-aggregation {
            background: rgba(210, 153, 34, 0.15);
            color: var(--accent-orange);
        }

        /* Lifecycle Section */
        .lifecycle-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
        }

        .lifecycle-block {
            background: var(--bg-secondary);
            padding: 14px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .lifecycle-block h4 {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .lifecycle-value {
            color: var(--accent-blue);
            font-size: 0.9rem;
            font-weight: 500;
        }

        .interaction-list {
            margin-top: 8px;
        }

        .interaction-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 6px 0;
            font-size: 0.85rem;
        }

        .interaction-item::before {
            content: '→';
            color: var(--accent-green);
        }

        .interaction-name {
            color: var(--accent-cyan);
            font-weight: 500;
        }

        /* Relations Tab */
        .relation-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 16px;
            transition: all 0.2s ease;
        }

        .relation-card:hover {
            border-color: var(--accent-purple);
        }

        .relation-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }

        .relation-name {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--accent-purple);
        }

        .relation-type {
            background: rgba(163, 113, 247, 0.2);
            color: var(--accent-purple);
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
            font-weight: 600;
        }

        .relation-diagram {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            padding: 20px;
            background: var(--bg-primary);
            border-radius: 8px;
            margin-bottom: 16px;
        }

        .relation-entity {
            background: var(--bg-tertiary);
            padding: 12px 20px;
            border-radius: 8px;
            border: 2px solid var(--accent-blue);
            text-align: center;
        }

        .relation-entity-name {
            color: var(--accent-cyan);
            font-weight: 600;
            font-size: 1rem;
        }

        .relation-entity-prop {
            color: var(--text-muted);
            font-size: 0.8rem;
            margin-top: 4px;
        }

        .relation-arrow {
            display: flex;
            flex-direction: column;
            align-items: center;
            color: var(--accent-purple);
            font-size: 0.8rem;
        }

        .relation-arrow-line {
            width: 80px;
            height: 2px;
            background: linear-gradient(90deg, var(--accent-blue), var(--accent-purple));
            position: relative;
        }

        .relation-arrow-line::after {
            content: '';
            position: absolute;
            right: 0;
            top: -4px;
            border: 5px solid transparent;
            border-left-color: var(--accent-purple);
        }

        /* Dictionary Card */
        .dictionary-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 16px;
        }

        .dictionary-header {
            padding: 16px 24px;
            background: linear-gradient(135deg, rgba(210, 153, 34, 0.1), transparent);
            border-bottom: 1px solid var(--border-color);
        }

        .dictionary-name {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--accent-orange);
            margin-bottom: 6px;
        }

        .dictionary-purpose {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        .dictionary-body {
            padding: 16px 24px;
        }

        /* Verification Section */
        .verification-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 12px;
        }

        .verification-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .verification-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
        }

        .verification-icon.pass {
            background: rgba(63, 185, 80, 0.2);
            color: var(--accent-green);
        }

        .verification-icon.fail {
            background: rgba(248, 81, 73, 0.2);
            color: var(--accent-red);
        }

        .verification-label {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 60px 40px;
            color: var(--text-muted);
        }

        .empty-state-icon {
            font-size: 3rem;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        /* Tooltip */
        .tooltip {
            position: fixed;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: var(--shadow);
            z-index: 1000;
            max-width: 300px;
            font-size: 0.85rem;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .tooltip.visible {
            opacity: 1;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
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

        /* Computation Method */
        .computation-method {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 4px;
            font-style: italic;
        }

        /* Dependencies */
        .dependencies {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 8px;
        }

        .dep-tag {
            background: var(--bg-tertiary);
            color: var(--accent-cyan);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            border: 1px solid var(--border-color);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="header-left">
                <h1>${metadata.module || 'Data Design'} Module</h1>
                <div class="metadata">
                    <div class="meta-item">
                        <span class="label">Version:</span>
                        <span class="value">${metadata.version || 'N/A'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">Generated:</span>
                        <span class="value">${metadata.timestamp || 'N/A'}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">Entities:</span>
                        <span class="value">${Object.keys(entities).length}</span>
                    </div>
                    <div class="meta-item">
                        <span class="label">Relations:</span>
                        <span class="value">${Object.keys(relations).length}</span>
                    </div>
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
        <div class="nav-tabs">
            <button class="nav-tab active" data-tab="diagram">
                ◇ ER Diagram
            </button>
            <button class="nav-tab" data-tab="entities">
                ◆ Entities <span class="count">${Object.keys(entities).length}</span>
            </button>
            <button class="nav-tab" data-tab="relations">
                ↔ Relations <span class="count">${Object.keys(relations).length}</span>
            </button>
            <button class="nav-tab" data-tab="dictionaries">
                ▤ Dictionaries <span class="count">${Object.keys(dictionaries).length}</span>
            </button>
            <button class="nav-tab" data-tab="verification">
                ✓ Verification
            </button>
        </div>

        <div class="main-container">
            <!-- ER Diagram Tab -->
            <div class="tab-content active" id="diagram">
                <div class="er-diagram-container">
                    <div class="er-diagram-header">
                        <span class="er-diagram-title">Entity-Relationship Diagram</span>
                        <div class="er-diagram-legend">
                            <div class="legend-item">
                                <div class="legend-dot business"></div>
                                <span>Business</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-dot api-call"></div>
                                <span>API Call</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-dot api-event"></div>
                                <span>API Event</span>
                            </div>
                        </div>
                    </div>
                    <svg id="er-canvas"></svg>
                </div>
            </div>

            <!-- Entities Tab -->
            <div class="tab-content" id="entities">
                <div class="cards-grid">
                    ${generateEntityCards(entities)}
                </div>
            </div>

            <!-- Relations Tab -->
            <div class="tab-content" id="relations">
                ${generateRelationCards(relations)}
            </div>

            <!-- Dictionaries Tab -->
            <div class="tab-content" id="dictionaries">
                ${Object.keys(dictionaries).length > 0 
                    ? generateDictionaryCards(dictionaries)
                    : '<div class="empty-state"><div class="empty-state-icon">▤</div><p>No dictionaries defined</p></div>'
                }
            </div>

            <!-- Verification Tab -->
            <div class="tab-content" id="verification">
                ${generateVerificationSection(data.verification || {})}
            </div>
        </div>
    </div>

    <!-- Source Code View -->
    <div class="source-view" id="source-view">
        <div class="source-code-container">
            <div class="source-code-header">
                <span class="source-code-title">JSON Source</span>
                <button class="copy-btn" id="copy-btn">Copy to Clipboard</button>
            </div>
            <div class="source-code">
                <pre id="json-source"></pre>
            </div>
        </div>
    </div>

    <div id="tooltip" class="tooltip"></div>

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
            setTimeout(initERDiagram, 50);
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
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = 'Copy to Clipboard';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch (err) {
                copyBtn.textContent = 'Failed to copy';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy to Clipboard';
                }, 2000);
            }
        });

        // Tab switching
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab).classList.add('active');
                
                // Initialize ER diagram when tab is shown
                if (tab.dataset.tab === 'diagram') {
                    initERDiagram();
                }
            });
        });

        // Section collapse/expand
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('collapsed');
            });
        });

        // ER Diagram with hierarchical left-to-right layout
        const entities = ${JSON.stringify(entities)};
        const relations = ${JSON.stringify(relations)};

        function initERDiagram() {
            const canvas = document.getElementById('er-canvas');
            const rect = canvas.getBoundingClientRect();
            const width = rect.width;
            const height = 500;
            canvas.setAttribute('width', width);
            canvas.setAttribute('height', height);
            
            const entityNames = Object.keys(entities);
            if (entityNames.length === 0) return;

            // Build adjacency list from relations
            const adjacency = {};
            entityNames.forEach(name => adjacency[name] = new Set());
            
            Object.values(relations).forEach(rel => {
                if (rel.sourceEntity && rel.targetEntity) {
                    adjacency[rel.sourceEntity]?.add(rel.targetEntity);
                }
            });

            // Calculate levels using BFS from User (or first entity)
            const levels = {};
            const startEntity = entityNames.includes('User') ? 'User' : entityNames[0];
            
            // BFS to assign levels
            const visited = new Set();
            const queue = [[startEntity, 0]];
            visited.add(startEntity);
            levels[startEntity] = 0;
            
            while (queue.length > 0) {
                const [current, level] = queue.shift();
                
                // Check outgoing edges
                adjacency[current]?.forEach(neighbor => {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        levels[neighbor] = level + 1;
                        queue.push([neighbor, level + 1]);
                    }
                });
                
                // Check incoming edges (for entities that point to current)
                Object.entries(adjacency).forEach(([source, targets]) => {
                    if (targets.has(current) && !visited.has(source)) {
                        visited.add(source);
                        levels[source] = level + 1;
                        queue.push([source, level + 1]);
                    }
                });
            }
            
            // Assign unvisited entities to the last level
            const maxLevel = Math.max(...Object.values(levels), 0);
            entityNames.forEach(name => {
                if (levels[name] === undefined) {
                    levels[name] = maxLevel + 1;
                }
            });

            // Group entities by level
            const levelGroups = {};
            entityNames.forEach(name => {
                const level = levels[name];
                if (!levelGroups[level]) levelGroups[level] = [];
                levelGroups[level].push(name);
            });

            // Calculate positions
            const numLevels = Object.keys(levelGroups).length;
            const paddingX = 120;
            const paddingY = 60;
            const levelWidth = (width - paddingX * 2) / Math.max(numLevels - 1, 1);
            
            const nodePositions = {};
            
            Object.entries(levelGroups).forEach(([level, names]) => {
                const levelNum = parseInt(level);
                const x = paddingX + levelNum * levelWidth;
                const levelHeight = height - paddingY * 2;
                const nodeSpacing = levelHeight / (names.length + 1);
                
                names.forEach((name, idx) => {
                    nodePositions[name] = {
                        x: x,
                        y: paddingY + (idx + 1) * nodeSpacing
                    };
                });
            });

            // Clear canvas
            canvas.innerHTML = '';
            
            // Create defs for gradients and markers
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            
            // Arrow markers for different directions
            const createArrowMarker = (id, refX) => {
                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.setAttribute('id', id);
                marker.setAttribute('markerWidth', '10');
                marker.setAttribute('markerHeight', '7');
                marker.setAttribute('refX', refX);
                marker.setAttribute('refY', '3.5');
                marker.setAttribute('orient', 'auto');
                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
                polygon.setAttribute('fill', '#a371f7');
                marker.appendChild(polygon);
                return marker;
            };
            
            defs.appendChild(createArrowMarker('arrowhead', '10'));
            defs.appendChild(createArrowMarker('arrowhead-close', '10'));
            canvas.appendChild(defs);

            // Draw relations (edges) with curved lines
            Object.entries(relations).forEach(([relName, rel]) => {
                const source = nodePositions[rel.sourceEntity];
                const target = nodePositions[rel.targetEntity];
                if (!source || !target) return;
                
                // Calculate node dimensions
                const sourceWidth = Math.max((rel.sourceEntity?.length || 0) * 9 + 30, 100);
                const targetWidth = Math.max((rel.targetEntity?.length || 0) * 9 + 30, 100);
                const nodeHeight = 40;
                
                let startX, startY, endX, endY, d, labelX, labelY;
                
                // Check if entities are at the same level (same x position)
                const isSameLevel = Math.abs(source.x - target.x) < 50;
                
                if (isSameLevel) {
                    // Same level: draw curved line from right side of source to right side of target
                    const curveOffset = 60; // How far the curve extends to the right
                    
                    if (source.y < target.y) {
                        // Source is above target
                        startX = source.x + sourceWidth / 2;
                        startY = source.y;
                        endX = target.x + targetWidth / 2;
                        endY = target.y - nodeHeight / 2; // Connect to top of target
                    } else {
                        // Source is below target
                        startX = source.x + sourceWidth / 2;
                        startY = source.y;
                        endX = target.x + targetWidth / 2;
                        endY = target.y + nodeHeight / 2; // Connect to bottom of target
                    }
                    
                    // Create a curved path that goes out to the right and curves back
                    const controlX = Math.max(startX, endX) + curveOffset;
                    d = \`M \${startX} \${startY} C \${controlX} \${startY}, \${controlX} \${endY}, \${endX} \${endY}\`;
                    labelX = controlX - 10;
                    labelY = (startY + endY) / 2;
                } else if (target.x > source.x) {
                    // Target is to the right of source (normal case)
                    startX = source.x + sourceWidth / 2;
                    startY = source.y;
                    endX = target.x - targetWidth / 2;
                    endY = target.y;
                    
                    // Create curved path
                    const midX = (startX + endX) / 2;
                    d = \`M \${startX} \${startY} C \${midX} \${startY}, \${midX} \${endY}, \${endX} \${endY}\`;
                    labelX = midX;
                    labelY = (startY + endY) / 2 - 8;
                } else {
                    // Target is to the left of source
                    startX = source.x - sourceWidth / 2;
                    startY = source.y;
                    endX = target.x + targetWidth / 2;
                    endY = target.y;
                    
                    // Create curved path
                    const midX = (startX + endX) / 2;
                    d = \`M \${startX} \${startY} C \${midX} \${startY}, \${midX} \${endY}, \${endX} \${endY}\`;
                    labelX = midX;
                    labelY = (startY + endY) / 2 - 8;
                }
                
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#a371f7');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-opacity', '0.6');
                path.setAttribute('marker-end', 'url(#arrowhead)');
                
                // Add hover effect
                path.style.cursor = 'pointer';
                path.addEventListener('mouseenter', (e) => showTooltip(e, relName + ' (' + (rel.type || '1:1') + ')'));
                path.addEventListener('mouseleave', hideTooltip);
                
                canvas.appendChild(path);
                
                // Add relation label
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', labelX);
                label.setAttribute('y', labelY);
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('fill', '#8b949e');
                label.setAttribute('font-size', '10');
                label.setAttribute('font-family', 'SF Mono, monospace');
                label.textContent = rel.type || '1:1';
                canvas.appendChild(label);
            });

            // Draw entities (nodes)
            entityNames.forEach(name => {
                const pos = nodePositions[name];
                if (!pos) return;
                
                const entity = entities[name];
                const entityType = entity.entityType || 'business';
                
                const colors = {
                    'business': '#238636',
                    'api-call': '#1f6feb',
                    'api-event': '#a371f7',
                    'user-profile': '#d29922',
                    'polymorphic': '#db61a2'
                };
                
                const color = colors[entityType] || colors.business;
                
                // Node group
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.style.cursor = 'pointer';
                
                // Node rectangle
                const nodeWidth = Math.max(name.length * 9 + 30, 100);
                const nodeHeight = 40;
                const nodeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                nodeRect.setAttribute('x', pos.x - nodeWidth/2);
                nodeRect.setAttribute('y', pos.y - nodeHeight/2);
                nodeRect.setAttribute('width', nodeWidth);
                nodeRect.setAttribute('height', nodeHeight);
                nodeRect.setAttribute('rx', '8');
                nodeRect.setAttribute('fill', '#21262d');
                nodeRect.setAttribute('stroke', color);
                nodeRect.setAttribute('stroke-width', '2');
                
                // Node text
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', pos.x);
                text.setAttribute('y', pos.y + 5);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', color);
                text.setAttribute('font-size', '13');
                text.setAttribute('font-weight', '600');
                text.setAttribute('font-family', 'SF Mono, monospace');
                text.textContent = name;
                
                // Type indicator dot
                const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                dot.setAttribute('cx', pos.x - nodeWidth/2 + 14);
                dot.setAttribute('cy', pos.y);
                dot.setAttribute('r', '4');
                dot.setAttribute('fill', color);
                
                g.appendChild(nodeRect);
                g.appendChild(dot);
                g.appendChild(text);
                
                // Hover effect
                g.addEventListener('mouseenter', (e) => {
                    nodeRect.setAttribute('stroke-width', '3');
                    showTooltip(e, entity.purpose || name);
                });
                g.addEventListener('mouseleave', () => {
                    nodeRect.setAttribute('stroke-width', '2');
                    hideTooltip();
                });
                
                // Click to navigate
                g.addEventListener('click', () => {
                    document.querySelector('[data-tab="entities"]').click();
                    setTimeout(() => {
                        const card = document.getElementById('entity-' + name);
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            card.style.boxShadow = '0 0 0 3px #58a6ff';
                            setTimeout(() => card.style.boxShadow = '', 1500);
                        }
                    }, 100);
                });
                
                canvas.appendChild(g);
            });
        }

        function showTooltip(e, text) {
            const tooltip = document.getElementById('tooltip');
            tooltip.textContent = text;
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY + 10) + 'px';
            tooltip.classList.add('visible');
        }

        function hideTooltip() {
            document.getElementById('tooltip').classList.remove('visible');
        }

        // Initialize ER diagram on load
        setTimeout(initERDiagram, 100);
        
        // Reinitialize on resize
        window.addEventListener('resize', () => {
            if (document.querySelector('[data-tab="diagram"]').classList.contains('active') && 
                !document.getElementById('visual-view').classList.contains('hidden')) {
                initERDiagram();
            }
        });
    </script>
</body>
</html>`;
}

function generateEntityCards(entities: Record<string, Entity>): string {
    return Object.entries(entities).map(([name, entity]) => {
        const entityType = entity.entityType || 'business';
        const typeClass = entityType.replace(/[^a-z-]/gi, '-').toLowerCase();
        
        const propertiesHtml = entity.properties 
            ? generatePropertiesTable(entity.properties)
            : '<p style="color: var(--text-muted); font-style: italic;">No properties defined</p>';
            
        const lifecycleHtml = entity.lifecycle 
            ? generateLifecycleSection(entity.lifecycle)
            : '';
            
        const depsHtml = entity.dataDependencies && entity.dataDependencies.length > 0
            ? `<div class="dependencies">${entity.dataDependencies.map(d => `<span class="dep-tag">${d}</span>`).join('')}</div>`
            : '';

        return `
            <div class="entity-card" id="entity-${name}">
                <div class="card-header">
                    <div class="card-title-section">
                        <div class="card-title">
                            ${name}
                            <span class="entity-type-badge ${typeClass}">${entityType}</span>
                        </div>
                        <p class="card-purpose">${entity.purpose || 'No description'}</p>
                        ${depsHtml}
                    </div>
                </div>
                <div class="card-body">
                    <div class="section">
                        <div class="section-header">
                            <span class="section-title">◈ Properties</span>
                            <span class="section-toggle">▼</span>
                        </div>
                        <div class="section-content">
                            ${propertiesHtml}
                        </div>
                    </div>
                    ${lifecycleHtml ? `
                    <div class="section collapsed">
                        <div class="section-header">
                            <span class="section-title">⟳ Lifecycle</span>
                            <span class="section-toggle">▼</span>
                        </div>
                        <div class="section-content">
                            ${lifecycleHtml}
                        </div>
                    </div>
                    ` : ''}
                    ${entity.computationMethod ? `
                    <div class="section collapsed">
                        <div class="section-header">
                            <span class="section-title">⚙ Computation</span>
                            <span class="section-toggle">▼</span>
                        </div>
                        <div class="section-content">
                            <p class="computation-method">${entity.computationMethod}</p>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function generatePropertiesTable(properties: Record<string, Property>): string {
    const rows = Object.entries(properties).map(([propName, prop]) => {
        const controlClass = (prop.controlType || '').replace(/[^a-z-]/gi, '-').toLowerCase();
        return `
            <tr>
                <td><span class="prop-name">${propName}</span></td>
                <td><span class="prop-type">${prop.type || 'unknown'}</span></td>
                <td><span class="prop-control ${controlClass}">${prop.controlType || '-'}</span></td>
                <td>${prop.purpose || '-'}</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="properties-table">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Control</th>
                    <th>Purpose</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function generateLifecycleSection(lifecycle: Entity['lifecycle']): string {
    if (!lifecycle) return '';
    
    const creation = lifecycle.creation;
    const deletion = lifecycle.deletion;
    
    const creationInteractions = creation?.creationInteractions?.map(i => 
        `<div class="interaction-item"><span class="interaction-name">${i.name}</span></div>`
    ).join('') || '';
    
    return `
        <div class="lifecycle-info">
            <div class="lifecycle-block">
                <h4>Creation</h4>
                <div class="lifecycle-value">${creation?.type || 'N/A'}</div>
                ${creation?.parent ? `<div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">Parent: ${creation.parent}</div>` : ''}
                ${creationInteractions ? `<div class="interaction-list">${creationInteractions}</div>` : ''}
            </div>
            <div class="lifecycle-block">
                <h4>Deletion</h4>
                <div class="lifecycle-value">${deletion?.deletionType || 'none'}</div>
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 4px;">
                    Can delete: ${deletion?.canBeDeleted ? '✓ Yes' : '✗ No'}
                </div>
            </div>
        </div>
    `;
}

function generateRelationCards(relations: Record<string, Relation>): string {
    if (Object.keys(relations).length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">↔</div><p>No relations defined</p></div>';
    }
    
    return Object.entries(relations).map(([name, rel]) => {
        const propertiesHtml = rel.properties && Object.keys(rel.properties).length > 0
            ? `
                <div style="margin-top: 16px;">
                    <h4 style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 8px; text-transform: uppercase;">Relation Properties</h4>
                    ${generatePropertiesTable(rel.properties)}
                </div>
            ` : '';
            
        return `
            <div class="relation-card">
                <div class="relation-header">
                    <span class="relation-name">${name}</span>
                    <span class="relation-type">${rel.type || '1:1'}</span>
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 16px; font-size: 0.9rem;">${rel.purpose || ''}</p>
                <div class="relation-diagram">
                    <div class="relation-entity">
                        <div class="relation-entity-name">${rel.sourceEntity || '?'}</div>
                        <div class="relation-entity-prop">.${rel.sourceProperty || '?'}</div>
                    </div>
                    <div class="relation-arrow">
                        <div class="relation-arrow-line"></div>
                    </div>
                    <div class="relation-entity">
                        <div class="relation-entity-name">${rel.targetEntity || '?'}</div>
                        <div class="relation-entity-prop">.${rel.targetProperty || '?'}</div>
                    </div>
                </div>
                ${propertiesHtml}
            </div>
        `;
    }).join('');
}

function generateDictionaryCards(dictionaries: Record<string, Dictionary>): string {
    return Object.entries(dictionaries).map(([name, dict]) => {
        const keysHtml = dict.keys && Object.keys(dict.keys).length > 0
            ? generatePropertiesTable(dict.keys)
            : '<p style="color: var(--text-muted);">No keys defined</p>';
            
        return `
            <div class="dictionary-card">
                <div class="dictionary-header">
                    <div class="dictionary-name">${name}</div>
                    <p class="dictionary-purpose">${dict.purpose || ''}</p>
                </div>
                <div class="dictionary-body">
                    ${keysHtml}
                </div>
            </div>
        `;
    }).join('');
}

function generateVerificationSection(verification: Record<string, boolean>): string {
    if (Object.keys(verification).length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">✓</div><p>No verification data</p></div>';
    }
    
    const items = Object.entries(verification).map(([key, value]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `
            <div class="verification-item">
                <div class="verification-icon ${value ? 'pass' : 'fail'}">${value ? '✓' : '✗'}</div>
                <span class="verification-label">${label}</span>
            </div>
        `;
    }).join('');
    
    return `<div class="verification-grid">${items}</div>`;
}
