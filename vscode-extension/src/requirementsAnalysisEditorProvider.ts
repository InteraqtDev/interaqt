import * as vscode from 'vscode';
import { getRequirementsWebviewContent } from './requirementsWebviewContent';

export class RequirementsAnalysisEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'interaqt.requirementsAnalysisViewer';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        const updateWebview = () => {
            try {
                const data = JSON.parse(document.getText());
                webviewPanel.webview.html = getRequirementsWebviewContent(data, webviewPanel.webview);
            } catch (e) {
                webviewPanel.webview.html = this.getErrorContent(e);
            }
        };

        // Initial update
        updateWebview();

        // Listen for document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private getErrorContent(error: unknown): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 40px;
                        background: #1e1e1e;
                        color: #f0f0f0;
                    }
                    .error {
                        background: #3d1f1f;
                        border: 1px solid #8b3a3a;
                        border-radius: 8px;
                        padding: 20px;
                        color: #ff6b6b;
                    }
                    h2 { margin-top: 0; }
                    pre {
                        background: #2d2d2d;
                        padding: 15px;
                        border-radius: 4px;
                        overflow-x: auto;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>⚠️ Parse Error</h2>
                    <p>Failed to parse the requirements-analysis.json file:</p>
                    <pre>${error instanceof Error ? error.message : String(error)}</pre>
                </div>
            </body>
            </html>
        `;
    }
}


