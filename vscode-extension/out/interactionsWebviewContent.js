"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInteractionsWebviewContent = getInteractionsWebviewContent;
function getInteractionsWebviewContent(data, _webview) {
    const metadata = data.design_metadata || {};
    const interactions = data.interactions || [];
    const matrix = data.interaction_matrix || {};
    const coverage = data.coverage_analysis || {};
    const rawJson = JSON.stringify(data, null, 2);
    // Count by type
    const typeCounts = {
        read: interactions.filter(i => i.type === 'read').length,
        create: interactions.filter(i => i.type === 'create').length,
        update: interactions.filter(i => i.type === 'update').length,
        delete: interactions.filter(i => i.type === 'delete').length
    };
    // Group by role
    const roleGroups = {};
    interactions.forEach(interaction => {
        const role = interaction.specification?.role || 'Unknown';
        if (!roleGroups[role])
            roleGroups[role] = [];
        roleGroups[role].push(interaction);
    });
    const coveragePercentage = coverage.coverage_percentage ??
        (coverage.total_requirements && coverage.covered_requirements
            ? Math.round((coverage.covered_requirements / coverage.total_requirements) * 100)
            : 100);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interactions Design Viewer</title>
    <style>
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border-color: #30363d;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --text-muted: #484f58;
            --accent-blue: #58a6ff;
            --accent-green: #3fb950;
            --accent-purple: #a371f7;
            --accent-orange: #d29922;
            --accent-red: #f85149;
            --accent-cyan: #39c5cf;
            --accent-pink: #db61a2;
            --accent-teal: #2dd4bf;
            --accent-yellow: #f0c14b;
            --type-read: #58a6ff;
            --type-create: #3fb950;
            --type-update: #d29922;
            --type-delete: #f85149;
            --shadow: 0 8px 24px rgba(0,0,0,0.4);
            --glow-blue: 0 0 20px rgba(88, 166, 255, 0.15);
            --glow-green: 0 0 20px rgba(63, 185, 80, 0.15);
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
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-pink));
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
            content: '⚡';
            font-size: 1.3rem;
            -webkit-text-fill-color: initial;
        }

        .metadata-bar {
            display: flex;
            gap: 16px;
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
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-pink));
            color: #fff;
            box-shadow: 0 2px 8px rgba(163, 113, 247, 0.3);
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
            min-width: 120px;
            padding: 16px 20px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            text-align: center;
            transition: all 0.2s ease;
        }

        .stat-card:hover {
            border-color: var(--accent-purple);
            box-shadow: 0 0 20px rgba(163, 113, 247, 0.15);
            transform: translateY(-2px);
        }

        .stat-number {
            font-size: 2rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-purple), var(--accent-pink));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .stat-card.read .stat-number { background: linear-gradient(135deg, var(--type-read), #79c0ff); -webkit-background-clip: text; background-clip: text; }
        .stat-card.create .stat-number { background: linear-gradient(135deg, var(--type-create), #7ee787); -webkit-background-clip: text; background-clip: text; }
        .stat-card.update .stat-number { background: linear-gradient(135deg, var(--type-update), #e3b341); -webkit-background-clip: text; background-clip: text; }
        .stat-card.delete .stat-number { background: linear-gradient(135deg, var(--type-delete), #ff7b72); -webkit-background-clip: text; background-clip: text; }
        .stat-card.coverage .stat-number { background: linear-gradient(135deg, var(--accent-green), var(--accent-teal)); -webkit-background-clip: text; background-clip: text; }

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
            overflow-x: auto;
        }

        .tab-btn {
            padding: 12px 20px;
            border-radius: 8px;
            background: transparent;
            border: 1px solid transparent;
            color: var(--text-secondary);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.85rem;
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
            border-color: var(--accent-purple);
            color: var(--accent-purple);
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
            animation: fadeIn 0.3s ease;
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
            border-color: var(--accent-purple);
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

        /* Interaction Cards */
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
            gap: 20px;
        }

        .interaction-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .interaction-card:hover {
            border-color: var(--accent-purple);
            box-shadow: var(--shadow), 0 0 20px rgba(163, 113, 247, 0.15);
            transform: translateY(-3px);
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
            flex-wrap: wrap;
        }

        .card-id {
            font-family: 'SF Mono', monospace;
            font-size: 1rem;
            font-weight: 700;
            color: var(--accent-purple);
        }

        .card-action {
            font-size: 0.85rem;
            color: var(--text-secondary);
            background: var(--bg-tertiary);
            padding: 4px 10px;
            border-radius: 6px;
        }

        .card-role {
            font-size: 0.75rem;
            color: var(--accent-orange);
            background: rgba(210, 153, 34, 0.15);
            padding: 4px 10px;
            border-radius: 6px;
            font-weight: 600;
        }

        .fulfills-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }

        .fulfills-badge {
            font-size: 0.7rem;
            padding: 2px 8px;
            background: rgba(57, 197, 207, 0.15);
            color: var(--accent-cyan);
            border-radius: 4px;
            font-family: 'SF Mono', monospace;
            font-weight: 600;
        }

        .card-body {
            padding: 20px 24px;
        }

        /* Sections within card */
        .card-section {
            margin-bottom: 16px;
        }

        .card-section:last-child {
            margin-bottom: 0;
        }

        .section-title {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* Conditions */
        .conditions-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .condition-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .condition-item::before {
            content: '⚡';
            flex-shrink: 0;
        }

        /* Payload */
        .payload-grid {
            display: grid;
            gap: 8px;
        }

        .payload-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 10px 14px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }

        .payload-name {
            font-family: 'SF Mono', monospace;
            font-size: 0.85rem;
            color: var(--accent-pink);
            font-weight: 600;
            min-width: 100px;
        }

        .payload-type {
            font-size: 0.75rem;
            color: var(--accent-cyan);
            background: rgba(57, 197, 207, 0.1);
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 600;
        }

        .payload-desc {
            font-size: 0.8rem;
            color: var(--text-secondary);
            flex: 1;
        }

        .payload-required {
            font-size: 0.65rem;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            text-transform: uppercase;
        }

        .payload-required.yes {
            background: rgba(248, 81, 73, 0.15);
            color: var(--accent-red);
        }

        .payload-required.no {
            background: rgba(139, 148, 158, 0.15);
            color: var(--text-muted);
        }

        /* Data Operations */
        .data-ops-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .data-op-group {
            background: var(--bg-tertiary);
            border-radius: 10px;
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        .data-op-header {
            padding: 10px 14px;
            background: var(--bg-primary);
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .data-op-header.reads { color: var(--type-read); }
        .data-op-header.creates { color: var(--type-create); }
        .data-op-header.updates { color: var(--type-update); }
        .data-op-header.deletes { color: var(--type-delete); }

        .data-op-body {
            padding: 12px 14px;
        }

        .data-op-item {
            padding: 8px 0;
            border-bottom: 1px solid var(--border-color);
        }

        .data-op-item:last-child {
            border-bottom: none;
        }

        .data-op-target {
            font-family: 'SF Mono', monospace;
            font-size: 0.85rem;
            color: var(--accent-yellow);
            font-weight: 600;
            margin-bottom: 4px;
        }

        .data-op-desc {
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-bottom: 6px;
        }

        .data-op-deps {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }

        .dep-badge {
            font-size: 0.65rem;
            padding: 2px 6px;
            background: rgba(163, 113, 247, 0.15);
            color: var(--accent-purple);
            border-radius: 4px;
            font-family: 'SF Mono', monospace;
        }

        .read-item {
            font-family: 'SF Mono', monospace;
            font-size: 0.85rem;
            color: var(--text-secondary);
            padding: 4px 0;
        }

        /* Data Constraints */
        .constraints-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .constraint-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px 12px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .constraint-item::before {
            content: '📌';
            flex-shrink: 0;
        }

        /* Validation Rules */
        .validation-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(248, 81, 73, 0.08);
            border: 1px solid rgba(248, 81, 73, 0.2);
            border-radius: 8px;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .validation-item::before {
            content: '✓';
            color: var(--accent-red);
            font-weight: bold;
        }

        /* Matrix View */
        .matrix-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
        }

        .matrix-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .matrix-grid {
            display: grid;
            gap: 12px;
        }

        .matrix-row {
            display: flex;
            align-items: flex-start;
            gap: 16px;
            padding: 16px;
            background: var(--bg-tertiary);
            border-radius: 10px;
            border: 1px solid var(--border-color);
        }

        .matrix-key {
            min-width: 180px;
            font-family: 'SF Mono', monospace;
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--accent-cyan);
            padding: 4px 0;
        }

        .matrix-values {
            flex: 1;
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .matrix-value {
            padding: 6px 12px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: 0.8rem;
            color: var(--text-secondary);
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .matrix-value:hover {
            border-color: var(--accent-purple);
            color: var(--accent-purple);
        }

        /* Coverage View */
        .coverage-container {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 24px;
        }

        .coverage-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
        }

        .coverage-title {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .coverage-title::before {
            content: '📊';
        }

        .coverage-percentage {
            font-size: 2.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, var(--accent-green), var(--accent-teal));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .coverage-progress {
            height: 12px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            overflow: hidden;
            margin-bottom: 24px;
        }

        .coverage-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, var(--accent-green), var(--accent-teal));
            border-radius: 6px;
            transition: width 0.5s ease;
        }

        .coverage-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .coverage-stat {
            text-align: center;
            padding: 20px;
            background: var(--bg-tertiary);
            border-radius: 12px;
            border: 1px solid var(--border-color);
        }

        .coverage-stat-value {
            font-size: 2rem;
            font-weight: 800;
            color: var(--accent-cyan);
        }

        .coverage-stat-label {
            font-size: 0.8rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 8px;
            font-weight: 600;
        }

        .uncovered-section {
            margin-top: 24px;
        }

        .uncovered-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--accent-red);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .uncovered-title::before {
            content: '⚠️';
        }

        .uncovered-list {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .uncovered-item {
            padding: 6px 12px;
            background: rgba(248, 81, 73, 0.15);
            border: 1px solid var(--accent-red);
            border-radius: 6px;
            font-size: 0.85rem;
            color: var(--accent-red);
            font-family: 'SF Mono', monospace;
            font-weight: 600;
        }

        .notes-section {
            margin-top: 24px;
        }

        .notes-title {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--text-secondary);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .notes-title::before {
            content: '📝';
        }

        .note-item {
            padding: 12px 16px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            margin-bottom: 8px;
            font-size: 0.85rem;
            color: var(--text-secondary);
            border-left: 3px solid var(--accent-cyan);
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
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, var(--accent-orange), var(--accent-pink));
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
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
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <div class="header-left">
                <h1>Interactions Design</h1>
                <div class="metadata-bar">
                    <span class="meta-badge">
                        📋 Source: <span class="value">${metadata.source_requirements || 'N/A'}</span>
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
                    <div class="stat-number">${interactions.length}</div>
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
                <div class="stat-card coverage">
                    <div class="stat-number">${coveragePercentage}%</div>
                    <div class="stat-label">Coverage</div>
                </div>
            </div>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-nav">
            <button class="tab-btn active" data-tab="list">
                ⚡ Interactions <span class="badge">${interactions.length}</span>
            </button>
            <button class="tab-btn" data-tab="roles">
                👥 By Role <span class="badge">${Object.keys(roleGroups).length}</span>
            </button>
            <button class="tab-btn" data-tab="by-requirement">
                📋 By Requirement <span class="badge">${Object.keys(matrix.by_requirement || {}).length}</span>
            </button>
            <button class="tab-btn" data-tab="by-entity">
                🗃️ By Entity <span class="badge">${Object.keys(matrix.by_data_entity || {}).length}</span>
            </button>
            <button class="tab-btn" data-tab="coverage">
                📊 Coverage
            </button>
        </div>

        <div class="main-container">
            <!-- List Tab -->
            <div class="tab-content active" id="list">
                <div class="cards-grid">
                    ${generateInteractionCards(interactions)}
                </div>
            </div>

            <!-- Roles Tab -->
            <div class="tab-content" id="roles">
                ${generateRoleGroups(roleGroups)}
            </div>

            <!-- By Requirement Tab -->
            <div class="tab-content" id="by-requirement">
                ${generateMatrixView('Requirements', '📋', matrix.by_requirement || {})}
            </div>

            <!-- By Entity Tab -->
            <div class="tab-content" id="by-entity">
                ${generateMatrixView('Data Entities', '🗃️', matrix.by_data_entity || {})}
            </div>

            <!-- Coverage Tab -->
            <div class="tab-content" id="coverage">
                ${generateCoverageView(coverage, coveragePercentage)}
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

        // Matrix value click - scroll to interaction card
        document.querySelectorAll('.matrix-value').forEach(item => {
            item.addEventListener('click', () => {
                const interactionId = item.dataset.interaction;
                if (interactionId) {
                    // Switch to list tab
                    document.querySelector('[data-tab="list"]').click();
                    setTimeout(() => {
                        const card = document.getElementById('interaction-' + interactionId);
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            card.style.boxShadow = '0 0 0 3px var(--accent-purple), var(--shadow)';
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
function generateInteractionCards(interactions) {
    if (interactions.length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">⚡</div><div class="empty-state-text">No interactions defined</div></div>';
    }
    return interactions.map(interaction => {
        const spec = interaction.specification || {};
        const data = spec.data || {};
        // Generate conditions HTML
        const conditionsHtml = spec.conditions && spec.conditions.length > 0 ? `
            <div class="card-section">
                <div class="section-title">⚡ Conditions</div>
                <div class="conditions-list">
                    ${spec.conditions.map(c => `<div class="condition-item">${escapeHtml(c)}</div>`).join('')}
                </div>
            </div>
        ` : '';
        // Generate payload HTML
        const payloadHtml = spec.payload && Object.keys(spec.payload).length > 0 ? `
            <div class="card-section">
                <div class="section-title">📦 Payload</div>
                <div class="payload-grid">
                    ${Object.entries(spec.payload).map(([name, field]) => `
                        <div class="payload-item">
                            <span class="payload-name">${escapeHtml(name)}</span>
                            <span class="payload-type">${escapeHtml(field.type || 'any')}</span>
                            <span class="payload-desc">${escapeHtml(field.description || '')}</span>
                            <span class="payload-required ${field.required ? 'yes' : 'no'}">${field.required ? 'required' : 'optional'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';
        // Generate data operations HTML
        const dataOpsHtml = generateDataOperationsHtml(data);
        // Generate data constraints HTML
        const dataConstraintsHtml = spec.dataConstraints && spec.dataConstraints.length > 0 ? `
            <div class="card-section">
                <div class="section-title">📌 Data Constraints</div>
                <div class="constraints-list">
                    ${spec.dataConstraints.map(c => `<div class="constraint-item">${escapeHtml(c)}</div>`).join('')}
                </div>
            </div>
        ` : '';
        // Generate validation rules HTML
        const validationHtml = interaction.validation_rules && interaction.validation_rules.length > 0 ? `
            <div class="card-section">
                <div class="section-title">✓ Validation Rules</div>
                <div class="constraints-list">
                    ${interaction.validation_rules.map(r => `<div class="validation-item">${escapeHtml(r)}</div>`).join('')}
                </div>
            </div>
        ` : '';
        return `
            <div class="interaction-card" id="interaction-${interaction.id}">
                <div class="card-header">
                    <div class="card-header-left">
                        <div class="card-title-row">
                            <span class="card-id">${escapeHtml(interaction.id)}</span>
                            <span class="type-badge ${interaction.type}">${interaction.type}</span>
                            <span class="card-action">${escapeHtml(spec.action || '')}</span>
                            <span class="card-role">${escapeHtml(spec.role || 'Unknown')}</span>
                        </div>
                        <div class="fulfills-row">
                            ${(interaction.fulfills_requirements || []).map(r => `<span class="fulfills-badge">${escapeHtml(r)}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    ${conditionsHtml}
                    ${payloadHtml}
                    ${dataOpsHtml}
                    ${dataConstraintsHtml}
                    ${validationHtml}
                </div>
            </div>
        `;
    }).join('');
}
function generateDataOperationsHtml(data) {
    const sections = [];
    if (data.reads && data.reads.length > 0) {
        sections.push(`
            <div class="data-op-group">
                <div class="data-op-header reads">📖 Reads</div>
                <div class="data-op-body">
                    ${data.reads.map(r => `<div class="read-item">${escapeHtml(r)}</div>`).join('')}
                </div>
            </div>
        `);
    }
    if (data.creates && data.creates.length > 0) {
        sections.push(`
            <div class="data-op-group">
                <div class="data-op-header creates">➕ Creates</div>
                <div class="data-op-body">
                    ${data.creates.map(op => `
                        <div class="data-op-item">
                            <div class="data-op-target">${escapeHtml(op.target)}</div>
                            <div class="data-op-desc">${escapeHtml(op.description)}</div>
                            ${op.dependencies && op.dependencies.length > 0 ? `
                                <div class="data-op-deps">
                                    ${op.dependencies.map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `);
    }
    if (data.updates && data.updates.length > 0) {
        sections.push(`
            <div class="data-op-group">
                <div class="data-op-header updates">✏️ Updates</div>
                <div class="data-op-body">
                    ${data.updates.map(op => `
                        <div class="data-op-item">
                            <div class="data-op-target">${escapeHtml(op.target)}</div>
                            <div class="data-op-desc">${escapeHtml(op.description)}</div>
                            ${op.dependencies && op.dependencies.length > 0 ? `
                                <div class="data-op-deps">
                                    ${op.dependencies.map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `);
    }
    if (data.deletes && data.deletes.length > 0) {
        sections.push(`
            <div class="data-op-group">
                <div class="data-op-header deletes">🗑️ Deletes</div>
                <div class="data-op-body">
                    ${data.deletes.map(op => `
                        <div class="data-op-item">
                            <div class="data-op-target">${escapeHtml(op.target)}</div>
                            <div class="data-op-desc">${escapeHtml(op.description)}</div>
                            ${op.dependencies && op.dependencies.length > 0 ? `
                                <div class="data-op-deps">
                                    ${op.dependencies.map(d => `<span class="dep-badge">${escapeHtml(d)}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `);
    }
    if (sections.length === 0) {
        return '';
    }
    return `
        <div class="card-section">
            <div class="section-title">🗃️ Data Operations</div>
            <div class="data-ops-container">
                ${sections.join('')}
            </div>
        </div>
    `;
}
function generateRoleGroups(roleGroups) {
    if (Object.keys(roleGroups).length === 0) {
        return '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No roles found</div></div>';
    }
    return Object.entries(roleGroups).map(([role, interactions]) => {
        return `
            <div class="role-section">
                <div class="role-header">
                    <div class="role-icon">👤</div>
                    <span class="role-name">${escapeHtml(role)}</span>
                    <span class="role-count">${interactions.length} interactions</span>
                </div>
                <div class="role-body">
                    <div class="cards-grid">
                        ${generateInteractionCards(interactions)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}
function generateMatrixView(title, icon, matrix) {
    if (Object.keys(matrix).length === 0) {
        return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-text">No ${title.toLowerCase()} mapping found</div></div>`;
    }
    return `
        <div class="matrix-container">
            <div class="matrix-title">${icon} ${title} → Interactions</div>
            <div class="matrix-grid">
                ${Object.entries(matrix).map(([key, values]) => `
                    <div class="matrix-row">
                        <div class="matrix-key">${escapeHtml(key)}</div>
                        <div class="matrix-values">
                            ${values.map(v => `<span class="matrix-value" data-interaction="${escapeHtml(v)}">${escapeHtml(v)}</span>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
function generateCoverageView(coverage, percentage) {
    const cov = coverage || {};
    return `
        <div class="coverage-container">
            <div class="coverage-header">
                <div class="coverage-title">Requirements Coverage</div>
                <div class="coverage-percentage">${percentage}%</div>
            </div>
            
            <div class="coverage-progress">
                <div class="coverage-progress-bar" style="width: ${percentage}%"></div>
            </div>
            
            <div class="coverage-stats">
                <div class="coverage-stat">
                    <div class="coverage-stat-value">${cov.total_requirements || 0}</div>
                    <div class="coverage-stat-label">Total Requirements</div>
                </div>
                <div class="coverage-stat">
                    <div class="coverage-stat-value">${cov.covered_requirements || 0}</div>
                    <div class="coverage-stat-label">Covered</div>
                </div>
                <div class="coverage-stat">
                    <div class="coverage-stat-value">${(cov.uncovered_requirements || []).length}</div>
                    <div class="coverage-stat-label">Uncovered</div>
                </div>
            </div>

            ${cov.uncovered_requirements && cov.uncovered_requirements.length > 0 ? `
                <div class="uncovered-section">
                    <div class="uncovered-title">Uncovered Requirements</div>
                    <div class="uncovered-list">
                        ${cov.uncovered_requirements.map(r => `<span class="uncovered-item">${escapeHtml(r)}</span>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${cov.notes && cov.notes.length > 0 ? `
                <div class="notes-section">
                    <div class="notes-title">Notes</div>
                    ${cov.notes.map(n => `<div class="note-item">${escapeHtml(n)}</div>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}
function escapeHtml(text) {
    if (!text)
        return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
//# sourceMappingURL=interactionsWebviewContent.js.map