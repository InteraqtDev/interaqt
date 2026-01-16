import * as vscode from 'vscode';
import { DataDesignEditorProvider } from './dataDesignEditorProvider';
import { RequirementsAnalysisEditorProvider } from './requirementsAnalysisEditorProvider';
import { InteractionsDesignEditorProvider } from './interactionsDesignEditorProvider';
import { ComputationAnalysisEditorProvider } from './computationAnalysisEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('interaqt Visualizer extension is now active!');

    // Register the Data Design custom editor provider
    const dataDesignProvider = new DataDesignEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            DataDesignEditorProvider.viewType,
            dataDesignProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register the Requirements Analysis custom editor provider
    const requirementsProvider = new RequirementsAnalysisEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            RequirementsAnalysisEditorProvider.viewType,
            requirementsProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register the Interactions Design custom editor provider
    const interactionsProvider = new InteractionsDesignEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            InteractionsDesignEditorProvider.viewType,
            interactionsProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register command to open Data Design viewer
    context.subscriptions.push(
        vscode.commands.registerCommand('interaqt.openDataDesignViewer', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('.data-design.json')) {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    editor.document.uri,
                    DataDesignEditorProvider.viewType
                );
            } else {
                vscode.window.showInformationMessage(
                    'Please open a .data-design.json file first'
                );
            }
        })
    );

    // Register command to open Requirements Analysis viewer
    context.subscriptions.push(
        vscode.commands.registerCommand('interaqt.openRequirementsAnalysisViewer', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('.requirements-analysis.json')) {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    editor.document.uri,
                    RequirementsAnalysisEditorProvider.viewType
                );
            } else {
                vscode.window.showInformationMessage(
                    'Please open a .requirements-analysis.json file first'
                );
            }
        })
    );

    // Register command to open Interactions Design viewer
    context.subscriptions.push(
        vscode.commands.registerCommand('interaqt.openInteractionsDesignViewer', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('.interactions-design.json')) {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    editor.document.uri,
                    InteractionsDesignEditorProvider.viewType
                );
            } else {
                vscode.window.showInformationMessage(
                    'Please open a .interactions-design.json file first'
                );
            }
        })
    );

    // Register the Computation Analysis custom editor provider
    const computationProvider = new ComputationAnalysisEditorProvider(context);
    
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            ComputationAnalysisEditorProvider.viewType,
            computationProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register command to open Computation Analysis viewer
    context.subscriptions.push(
        vscode.commands.registerCommand('interaqt.openComputationAnalysisViewer', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.fileName.endsWith('.computation-analysis.json')) {
                await vscode.commands.executeCommand(
                    'vscode.openWith',
                    editor.document.uri,
                    ComputationAnalysisEditorProvider.viewType
                );
            } else {
                vscode.window.showInformationMessage(
                    'Please open a .computation-analysis.json file first'
                );
            }
        })
    );
}

export function deactivate() {}

