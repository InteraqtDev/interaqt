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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const dataDesignEditorProvider_1 = require("./dataDesignEditorProvider");
const requirementsAnalysisEditorProvider_1 = require("./requirementsAnalysisEditorProvider");
const interactionsDesignEditorProvider_1 = require("./interactionsDesignEditorProvider");
const computationAnalysisEditorProvider_1 = require("./computationAnalysisEditorProvider");
function activate(context) {
    console.log('interaqt Visualizer extension is now active!');
    // Register the Data Design custom editor provider
    const dataDesignProvider = new dataDesignEditorProvider_1.DataDesignEditorProvider(context);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(dataDesignEditorProvider_1.DataDesignEditorProvider.viewType, dataDesignProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    }));
    // Register the Requirements Analysis custom editor provider
    const requirementsProvider = new requirementsAnalysisEditorProvider_1.RequirementsAnalysisEditorProvider(context);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(requirementsAnalysisEditorProvider_1.RequirementsAnalysisEditorProvider.viewType, requirementsProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    }));
    // Register the Interactions Design custom editor provider
    const interactionsProvider = new interactionsDesignEditorProvider_1.InteractionsDesignEditorProvider(context);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(interactionsDesignEditorProvider_1.InteractionsDesignEditorProvider.viewType, interactionsProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    }));
    // Register command to open Data Design viewer
    context.subscriptions.push(vscode.commands.registerCommand('interaqt.openDataDesignViewer', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.endsWith('.data-design.json')) {
            await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, dataDesignEditorProvider_1.DataDesignEditorProvider.viewType);
        }
        else {
            vscode.window.showInformationMessage('Please open a .data-design.json file first');
        }
    }));
    // Register command to open Requirements Analysis viewer
    context.subscriptions.push(vscode.commands.registerCommand('interaqt.openRequirementsAnalysisViewer', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.endsWith('.requirements-analysis.json')) {
            await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, requirementsAnalysisEditorProvider_1.RequirementsAnalysisEditorProvider.viewType);
        }
        else {
            vscode.window.showInformationMessage('Please open a .requirements-analysis.json file first');
        }
    }));
    // Register command to open Interactions Design viewer
    context.subscriptions.push(vscode.commands.registerCommand('interaqt.openInteractionsDesignViewer', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.endsWith('.interactions-design.json')) {
            await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, interactionsDesignEditorProvider_1.InteractionsDesignEditorProvider.viewType);
        }
        else {
            vscode.window.showInformationMessage('Please open a .interactions-design.json file first');
        }
    }));
    // Register the Computation Analysis custom editor provider
    const computationProvider = new computationAnalysisEditorProvider_1.ComputationAnalysisEditorProvider(context);
    context.subscriptions.push(vscode.window.registerCustomEditorProvider(computationAnalysisEditorProvider_1.ComputationAnalysisEditorProvider.viewType, computationProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: false
    }));
    // Register command to open Computation Analysis viewer
    context.subscriptions.push(vscode.commands.registerCommand('interaqt.openComputationAnalysisViewer', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.endsWith('.computation-analysis.json')) {
            await vscode.commands.executeCommand('vscode.openWith', editor.document.uri, computationAnalysisEditorProvider_1.ComputationAnalysisEditorProvider.viewType);
        }
        else {
            vscode.window.showInformationMessage('Please open a .computation-analysis.json file first');
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map