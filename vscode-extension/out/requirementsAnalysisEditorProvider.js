"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirementsAnalysisEditorProvider = void 0;
const vscode = __importStar(require("vscode"));
const requirementsWebviewContent_1 = require("./requirementsWebviewContent");
class RequirementsAnalysisEditorProvider {
    context;
    static viewType = 'interaqt.requirementsAnalysisViewer';
    constructor(context) {
        this.context = context;
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };
        const updateWebview = () => {
            try {
                const data = JSON.parse(document.getText());
                webviewPanel.webview.html = (0, requirementsWebviewContent_1.getRequirementsWebviewContent)(data, webviewPanel.webview);
            }
            catch (e) {
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
    getErrorContent(error) {
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
exports.RequirementsAnalysisEditorProvider = RequirementsAnalysisEditorProvider;
//# sourceMappingURL=requirementsAnalysisEditorProvider.js.map