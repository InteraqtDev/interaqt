import * as vscode from 'vscode';
import { getComputationWebviewContent } from './computationWebviewContent';

export class ComputationAnalysisEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'interaqt.computationAnalysisViewer';

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
                webviewPanel.webview.html = getComputationWebviewContent(data, webviewPanel.webview);
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
                        background: #0a0e14;
                        color: #e6edf3;
                    }
                    .error {
                        background: #3d1f1f;
                        border: 1px solid #8b3a3a;
                        border-radius: 12px;
                        padding: 24px;
                        color: #ff6b6b;
                    }
                    h2 { margin-top: 0; }
                    pre {
                        background: #1a1f26;
                        padding: 16px;
                        border-radius: 8px;
                        overflow-x: auto;
                        color: #e6edf3;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h2>⚠️ Parse Error</h2>
                    <p>Failed to parse the computation-analysis.json file:</p>
                    <pre>${error instanceof Error ? error.message : String(error)}</pre>
                </div>
            </body>
            </html>
        `;
    }
}

