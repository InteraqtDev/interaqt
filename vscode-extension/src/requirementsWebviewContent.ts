import * as vscode from 'vscode';

interface RequirementsAnalysis {
    analysis_metadata?: {
        timestamp?: string;
        methodology?: string;
        version?: string;
    };
    root_read_requirements?: Requirement[];
    derived_requirements?: Record<string, Requirement[]>;
    completeness_check?: {
        total_requirements?: number;
        read_requirements?: number;
        write_requirements?: number;
        requirements_with_children?: number;
        leaf_requirements?: number;
    };
}

interface Requirement {
    id: string;
    type: 'read' | 'create' | 'update' | 'delete';
    title: string;
    goal?: string;
    parent?: string;
    role: string;
    data?: {
        type?: string;
        description?: string;
    };
    constraints?: string[];
    business_constraints?: string[];
    data_constraints?: string[];
    deletion_type?: string;
    deletion_rules?: string[];
    is_future_requirement?: boolean;
    note?: string;
}

interface RequirementNode extends Requirement {
    children: RequirementNode[];
    level: number;
}

function buildRequirementTree(data: RequirementsAnalysis): RequirementNode[] {
    const rootRequirements = data.root_read_requirements || [];
    const derivedRequirements = data.derived_requirements || {};
    
    function buildNode(req: Requirement, level: number): RequirementNode {
        const node: RequirementNode = { ...req, children: [], level };
        const derivedKey = `from_${req.id}`;
        const children = derivedRequirements[derivedKey] || [];
        node.children = children.map(child => buildNode(child, level + 1));
        return node;
    }
    
    return rootRequirements.map(req => buildNode(req, 0));
}

function getAllRequirements(data: RequirementsAnalysis): Requirement[] {
    const all: Requirement[] = [...(data.root_read_requirements || [])];
    const derived = data.derived_requirements || {};
    Object.values(derived).forEach(reqs => {
        all.push(...reqs);
    });
    return all;
}

export function getRequirementsWebviewContent(data: RequirementsAnalysis, _webview: vscode.Webview): string {
    const metadata = data.analysis_metadata || {};
    const completeness = data.completeness_check || {};
    const requirementTree = buildRequirementTree(data);
    const allRequirements = getAllRequirements(data);
    const rawJson = JSON.stringify(data, null, 2);

    // Count by type
    const typeCounts = {
        read: allRequirements.filter(r => r.type === 'read').length,
        create: allRequirements.filter(r => r.type === 'create').length,
        update: allRequirements.filter(r => r.type === 'update').length,
        delete: allRequirements.filter(r => r.type === 'delete').length
    };

    // Group by role
    const roleGroups: Record<string, Requirement[]> = {};
    allRequirements.forEach(req => {
        if (!roleGroups[req.role]) roleGroups[req.role] = [];
        roleGroups[req.role].push(req);
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Requirements Analysis Viewer</title>
    <style>
        :root {
            --bg-primary: #0a0e14;
            --bg-secondary: #131920;
            --bg-tertiary: #1a2028;
            --border-color: #2a3440;
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
            --accent-teal: #2dd4bf;
            --type-read: #58a6ff;
            --type-create: #3fb950;
            --type-update: #d29922;
            --type-delete: #f85149;
            --shadow: 0 8px 24px rgba(0,0,0,0.5);
            --glow-blue: 0 0 20px rgba(88, 166, 255, 0.15);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* Header */
        .header {
            background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
            border-bottom: 1px solid var(--border-color);
            padding: 28px 40px;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .header-content {
            max-width: 1600px;
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
            font-size: 1.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue));
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
            content: '📋';
            font-size: 1.3rem;
            -webkit-text-fill-color: initial;
        }

        .metadata-bar {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            align-items: center;
        }

        .meta-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 20px;
            font-size: 0.8rem;
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
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
        }

        .view-toggle-btn {
            padding: 12px 20px;
            background: transparent;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            transition: all 0.25s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .view-toggle-btn:hover {
            background: rgba(255,255,255,0.05);
            color: var(--text-primary);
        }

        .view-toggle-btn.active {
            background: linear-gradient(135deg, var(--accent-blue), var(--accent-teal));
            color: #fff;
            box-shadow: 0 2px 8px rgba(88, 166, 255, 0.3);
        }

        .view-toggle-btn:first-child {
            border-right: 1px solid var(--border-color);
        }

        /* Stats Bar */
        .stats-bar {
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: 20px 40px;
        }

        .stats-container {
            max-width: 1600px;
            margin: 0 auto;
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
        }

        .stat-card {
            flex: 1;
            min-width: 140px;
            padding: 16px 20px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            text-align: center;
            transition: all 0.2s ease;
        }

        .stat-card:hover {
            border-color: var(--accent-blue);
            box-shadow: var(--glow-blue);
            transform: translateY(-2px);
        }

        .stat-number {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .stat-card.read .stat-number { background: linear-gradient(135deg, var(--type-read), #79c0ff); -webkit-background-clip: text; background-clip: text; }
        .stat-card.create .stat-number { background: linear-gradient(135deg, var(--type-create), #7ee787); -webkit-background-clip: text; background-clip: text; }
        .stat-card.update .stat-number { background: linear-gradient(135deg, var(--type-update), #e3b341); -webkit-background-clip: text; background-clip: text; }
        .stat-card.delete .stat-number { background: linear-gradient(135deg, var(--type-delete), #ff7b72); -webkit-background-clip: text; background-clip: text; }

        .stat-label {
            font-size: 0.75rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 4px;
            font-weight: 600;
        }

        /* Tab Navigation */
        .tab-nav {
            display: flex;
            gap: 4px;
            padding: 16px 40px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            position: sticky;
            top: 100px;
            z-index: 99;
        }

        .tab-btn {
            padding: 12px 24px;
            border-radius: 8px;
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 600;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tab-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .tab-btn.active {
            background: var(--bg-tertiary);
            border-color: var(--accent-blue);
            color: var(--accent-blue);
        }

        .tab-btn .badge {
            background: var(--bg-primary);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.75rem;
            font-weight: 700;
        }

        /* Main Container */
        .main-container {
            max-width: 1600px;
            margin: 0 auto;
            padding: 32px 40px;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        /* Visual View Container */
        .visual-view {
            display: block;
        }

        .visual-view.hidden {
            display: none;
        }

        /* Source View */
        .source-view {
            display: none;
            padding: 32px 40px;
            max-width: 1600px;
            margin: 0 auto;
        }

        .source-view.active {
            display: block;
        }

        .source-code-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
        }

        .source-code-header {
            padding: 16px 24px;
            background: var(--bg-tertiary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .source-code-title {
            color: var(--text-secondary);
            font-size: 0.9rem;
            font-weight: 600;
        }

        .copy-btn {
            padding: 8px 16px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
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
            padding: 24px;
            overflow-x: auto;
            max-height: calc(100vh - 280px);
            overflow-y: auto;
        }

        .source-code pre {
            margin: 0;
            font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace;
            font-size: 0.85rem;
            line-height: 1.6;
            color: var(--text-primary);
        }

        .source-code .json-key { color: var(--accent-cyan); }
        .source-code .json-string { color: var(--accent-green); }
        .source-code .json-number { color: var(--accent-orange); }
        .source-code .json-boolean { color: var(--accent-purple); }
        .source-code .json-null { color: var(--text-muted); }

        /* Tree View */
        .tree-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
        }

        .tree-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .tree-title::before {
            content: '🌳';
        }

        .tree-node {
            position: relative;
            padding-left: 24px;
        }

        .tree-node::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 50%;
            width: 16px;
            border-left: 2px solid var(--border-color);
            border-bottom: 2px solid var(--border-color);
            border-radius: 0 0 0 8px;
        }

        .tree-node:last-child::before {
            bottom: calc(50% + 1px);
        }

        .tree-node.root {
            padding-left: 0;
        }

        .tree-node.root::before {
            display: none;
        }

        .tree-node.root::after {
            display: none;
        }

        .tree-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            margin-bottom: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .tree-item:hover {
            border-color: var(--accent-blue);
            box-shadow: var(--glow-blue);
            transform: translateX(4px);
        }

        .tree-children {
            margin-left: 20px;
            padding-left: 20px;
            border-left: 2px dashed var(--border-color);
        }

        /* Type Badge */
        .type-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .type-badge.read {
            background: rgba(88, 166, 255, 0.15);
            color: var(--type-read);
            border: 1px solid var(--type-read);
        }

        .type-badge.create {
            background: rgba(63, 185, 80, 0.15);
            color: var(--type-create);
            border: 1px solid var(--type-create);
        }

        .type-badge.update {
            background: rgba(210, 153, 34, 0.15);
            color: var(--type-update);
            border: 1px solid var(--type-update);
        }

        .type-badge.delete {
            background: rgba(248, 81, 73, 0.15);
            color: var(--type-delete);
            border: 1px solid var(--type-delete);
        }

        /* Requirement ID */
        .req-id {
            font-family: 'SF Mono', monospace;
            font-size: 0.8rem;
            color: var(--accent-purple);
            font-weight: 700;
            min-width: 50px;
        }

        .req-title {
            flex: 1;
            font-size: 0.9rem;
            color: var(--text-primary);
            font-weight: 500;
        }

        .req-role {
            font-size: 0.75rem;
            color: var(--accent-orange);
            background: rgba(210, 153, 34, 0.15);
            padding: 2px 8px;
            border-radius: 4px;
        }

        /* Requirement Cards */
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
            gap: 20px;
        }

        .req-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .req-card:hover {
            border-color: var(--accent-blue);
            box-shadow: var(--shadow), var(--glow-blue);
            transform: translateY(-3px);
        }

        .req-card.future {
            opacity: 0.7;
            border-style: dashed;
        }

        .card-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
        }

        .card-header-left {
            flex: 1;
        }

        .card-title-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .card-title {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .card-description {
            font-size: 0.9rem;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        .card-body {
            padding: 20px 24px;
        }

        /* Info Row */
        .info-row {
            display: flex;
            gap: 16px;
            flex-wrap: wrap;
            margin-bottom: 16px;
        }

        .info-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85rem;
        }

        .info-label {
            color: var(--text-muted);
        }

        .info-value {
            color: var(--accent-cyan);
            font-weight: 600;
        }

        .info-value.goal {
            color: var(--accent-green);
        }

        .info-value.parent {
            color: var(--accent-purple);
            font-family: 'SF Mono', monospace;
        }

        /* Constraints */
        .constraints-section {
            margin-top: 16px;
        }

        .constraints-title {
            font-size: 0.75rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .constraints-title::before {
            content: '⚡';
        }

        .constraint-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            margin-bottom: 6px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .constraint-item::before {
            content: '•';
            color: var(--accent-orange);
            font-weight: bold;
        }

        .constraint-item.data::before {
            color: var(--accent-blue);
        }

        .constraint-item.deletion::before {
            color: var(--accent-red);
        }

        /* Data Info */
        .data-info {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 14px 16px;
            margin-top: 12px;
        }

        .data-type {
            display: inline-flex;
            align-items: center;
            padding: 3px 10px;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            background: rgba(57, 197, 207, 0.15);
            color: var(--accent-cyan);
            border: 1px solid var(--accent-cyan);
            margin-bottom: 8px;
        }

        .data-desc {
            font-size: 0.85rem;
            color: var(--text-secondary);
            line-height: 1.5;
        }

        /* Future Badge */
        .future-badge {
            background: rgba(163, 113, 247, 0.2);
            color: var(--accent-purple);
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            border: 1px solid var(--accent-purple);
        }

        /* Role Groups */
        .role-section {
            margin-bottom: 32px;
        }

        .role-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px 12px 0 0;
            margin-bottom: -1px;
        }

        .role-icon {
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, var(--accent-orange), var(--accent-pink));
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.1rem;
        }

        .role-name {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary);
        }

        .role-count {
            background: var(--bg-tertiary);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            color: var(--text-secondary);
            font-weight: 600;
        }

        .role-body {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 0 0 12px 12px;
            padding: 20px;
        }

        /* Completeness Check */
        .completeness-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
        }

        .completeness-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .completeness-title::before {
            content: '✅';
        }

        .completeness-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
        }

        .completeness-item {
            text-align: center;
            padding: 20px;
            background: var(--bg-tertiary);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }

        .completeness-value {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-green), var(--accent-teal));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .completeness-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 8px;
            font-weight: 600;
        }

        /* Empty State */
        .empty-state {
            text-align: center;
            padding: 80px 40px;
            color: var(--text-muted);
        }

        .empty-state-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            opacity: 0.5;
        }

        .empty-state-text {
            font-size: 1.1rem;
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

        /* Animation */
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .tab-content.active {
            animation: fadeIn 0.3s ease;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="header-left">
                <h1>Requirements Analysis</h1>
                <div class="metadata-bar">
                    <span class="meta-badge">
                        📊 Methodology: <span class="value">${metadata.methodology || 'N/A'}</span>
                    </span>
                    <span class="meta-badge">
                        📅 Generated: <span class="value">${metadata.timestamp || 'N/A'}</span>
                    </span>
                    <span class="meta-badge">
                        🏷️ Version: <span class="value">${metadata.version || 'N/A'}</span>
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
                    <div class="stat-number">${completeness.total_requirements || allRequirements.length}</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat-card read">
                    <div class="stat-number">${typeCounts.read}</div>
                    <div class="stat-label">Read</div>
                </div>
                <div class="stat-card create">
                    <div class="stat-number">${typeCounts.create}</div>
                    <div class="stat-label">Create</div>
                </div>
                <div class="stat-card update">
                    <div class="stat-number">${typeCounts.update}</div>
                    <div class="stat-label">Update</div>
                </div>
                <div class="stat-card delete">
                    <div class="stat-number">${typeCounts.delete}</div>
                    <div class="stat-label">Delete</div>
                </div>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-nav">
            <button class="tab-btn active" data-tab="tree">
                🌳 Hierarchy
            </button>
            <button class="tab-btn" data-tab="list">
                📋 All Requirements <span class="badge">${allRequirements.length}</span>
            </button>
            <button class="tab-btn" data-tab="roles">
                👥 By Role <span class="badge">${Object.keys(roleGroups).length}</span>
            </button>
            <button class="tab-btn" data-tab="completeness">
                ✅ Completeness
            </button>
        </div>

        <div class="main-container">
            <!-- Tree Tab -->
            <div class="tab-content active" id="tree">
                <div class="tree-container">
                    <div class="tree-title">Requirements Hierarchy</div>
                    ${generateTreeHtml(requirementTree)}
                </div>
            </div>

            <!-- List Tab -->
            <div class="tab-content" id="list">
                <div class="cards-grid">
                    ${generateRequirementCards(allRequirements)}
                </div>
            </div>

            <!-- Roles Tab -->
            <div class="tab-content" id="roles">
                ${generateRoleGroups(roleGroups)}
            </div>

            <!-- Completeness Tab -->
            <div class="tab-content" id="completeness">
                <div class="completeness-container">
                    <div class="completeness-title">Completeness Check</div>
                    <div class="completeness-grid">
                        <div class="completeness-item">
                            <div class="completeness-value">${completeness.total_requirements || 0}</div>
                            <div class="completeness-label">Total Requirements</div>
                        </div>
                        <div class="completeness-item">
                            <div class="completeness-value">${completeness.read_requirements || 0}</div>
                            <div class="completeness-label">Read Requirements</div>
                        </div>
                        <div class="completeness-item">
                            <div class="completeness-value">${completeness.write_requirements || 0}</div>
                            <div class="completeness-label">Write Requirements</div>
                        </div>
                        <div class="completeness-item">
                            <div class="completeness-value">${completeness.requirements_with_children || 0}</div>
                            <div class="completeness-label">With Children</div>
                        </div>
                        <div class="completeness-item">
                            <div class="completeness-value">${completeness.leaf_requirements || 0}</div>
                            <div class="completeness-label">Leaf Requirements</div>
                        </div>
                    </div>
                </div>
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

        // Tree node click to highlight
        document.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', () => {
                const reqId = item.dataset.reqId;
                if (reqId) {
                    // Switch to list tab and scroll to card
                    document.querySelector('[data-tab="list"]').click();
                    setTimeout(() => {
                        const card = document.getElementById('req-card-' + reqId);
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            card.style.boxShadow = '0 0 0 3px var(--accent-blue), var(--shadow)';
                            setTimeout(() => card.style.boxShadow = '', 2000);
                        }
                    }, 100);
                }
            });
        });
    </script>
</body>
</html>`;
}

function generateTreeHtml(nodes: RequirementNode[]): string {
    if (nodes.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">🌳</div><div class="empty-state-text">No requirements found</div></div>';
    }

    function renderNode(node: RequirementNode): string {
        const childrenHtml = node.children.length > 0 
            ? `<div class="tree-children">${node.children.map(child => renderNode(child)).join('')}</div>`
            : '';

        return `
            <div class="tree-node ${node.level === 0 ? 'root' : ''}">
                <div class="tree-item" data-req-id="${node.id}">
                    <span class="req-id">${node.id}</span>
                    <span class="type-badge ${node.type}">${node.type}</span>
                    <span class="req-title">${node.title}</span>
                    <span class="req-role">${node.role}</span>
                </div>
                ${childrenHtml}
            </div>
        `;
    }

    return nodes.map(node => renderNode(node)).join('');
}

function generateRequirementCards(requirements: Requirement[]): string {
    if (requirements.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No requirements defined</div></div>';
    }

    return requirements.map(req => {
        const isFuture = req.is_future_requirement;
        const allConstraints = [
            ...(req.constraints || []).map(c => ({ text: c, type: 'normal' })),
            ...(req.business_constraints || []).map(c => ({ text: c, type: 'business' })),
            ...(req.data_constraints || []).map(c => ({ text: c, type: 'data' })),
            ...(req.deletion_rules || []).map(c => ({ text: c, type: 'deletion' }))
        ];

        const constraintsHtml = allConstraints.length > 0 ? `
            <div class="constraints-section">
                <div class="constraints-title">Constraints</div>
                ${allConstraints.map(c => `<div class="constraint-item ${c.type}">${c.text}</div>`).join('')}
            </div>
        ` : '';

        const dataHtml = req.data ? `
            <div class="data-info">
                <span class="data-type">${req.data.type || 'unknown'}</span>
                <div class="data-desc">${req.data.description || ''}</div>
            </div>
        ` : '';

        return `
            <div class="req-card ${isFuture ? 'future' : ''}" id="req-card-${req.id}">
                <div class="card-header">
                    <div class="card-header-left">
                        <div class="card-title-row">
                            <span class="req-id">${req.id}</span>
                            <span class="type-badge ${req.type}">${req.type}</span>
                            ${isFuture ? '<span class="future-badge">Future</span>' : ''}
                        </div>
                        <div class="card-title">${req.title}</div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="info-row">
                        <div class="info-item">
                            <span class="info-label">Role:</span>
                            <span class="info-value">${req.role}</span>
                        </div>
                        ${req.goal ? `
                        <div class="info-item">
                            <span class="info-label">Goal:</span>
                            <span class="info-value goal">${req.goal}</span>
                        </div>
                        ` : ''}
                        ${req.parent ? `
                        <div class="info-item">
                            <span class="info-label">Parent:</span>
                            <span class="info-value parent">${req.parent}</span>
                        </div>
                        ` : ''}
                        ${req.deletion_type ? `
                        <div class="info-item">
                            <span class="info-label">Deletion:</span>
                            <span class="info-value">${req.deletion_type}</span>
                        </div>
                        ` : ''}
                    </div>
                    ${dataHtml}
                    ${constraintsHtml}
                    ${req.note ? `<div class="data-desc" style="margin-top: 12px; font-style: italic;">${req.note}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function generateRoleGroups(roleGroups: Record<string, Requirement[]>): string {
    if (Object.keys(roleGroups).length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No roles found</div></div>';
    }

    return Object.entries(roleGroups).map(([role, reqs]) => {
        return `
            <div class="role-section">
                <div class="role-header">
                    <div class="role-icon">👤</div>
                    <span class="role-name">${role}</span>
                    <span class="role-count">${reqs.length} requirements</span>
                </div>
                <div class="role-body">
                    <div class="cards-grid">
                        ${generateRequirementCards(reqs)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


