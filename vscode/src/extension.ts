import * as vscode from "vscode";
import { scanNotebookCommand } from "./commands/scanNotebook";
import { FigureRecord, NotebookFigures } from "../../shared/notebook/types";
import { scanNotebookDocument } from "./notebook/scanner";
import { figureRegistry } from "../../shared/registry/figureRegistry";
import { FigureGalleryViewProvider } from "./gallery/figureGalleryView";
import {
    FigureTreeItem,
    FigureTreeProvider,
} from "./views/figureTreeProvider";
import {
    exportFigureAsPdf,
    saveFigureAsPng,
} from "./commands/figureActions";

const refreshDelayMs = 300;
let lastNotebookEditorColumn: vscode.ViewColumn | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const provider = new FigureTreeProvider();
    const gallery = new FigureGalleryViewProvider((figure: FigureRecord) => {
        void revealNotebookCell(figure);
    });

    const treeView = vscode.window.createTreeView("figureExplorer.figures", {
        treeDataProvider: provider,
        showCollapseAll: true,
    });

    const pendingRefreshes = new Map<string, ReturnType<typeof setTimeout>>();

    const isJupyterNotebook = (document: vscode.NotebookDocument): boolean =>
        document.uri.path.toLowerCase().endsWith(".ipynb");

    const isNotebookTabOpen = (notebookUri: string): boolean =>
        vscode.window.tabGroups.all.some((group) =>
            group.tabs.some((tab) => {
                const input = tab.input;

                return (
                    input instanceof vscode.TabInputNotebook &&
                    input.uri.toString() === notebookUri
                );
            })
        );

    const updateNotebook = async (
        document: vscode.NotebookDocument
    ): Promise<void> => {
        if (!isJupyterNotebook(document)) {
            return;
        }

        const notebookUri = document.uri.toString();
        const notebookName = fileName(document.uri);

        let figures: FigureRecord[];

        try {
            figures = await scanNotebookDocument(document);
        } catch {
            return;
        }

        const isStillOpen = vscode.workspace.notebookDocuments.some(
            (notebook) => notebook.uri.toString() === notebookUri
        );

        if (!isStillOpen) {
            return;
        }

        figureRegistry.setNotebook(notebookUri, notebookName, figures);
        provider.refresh();

        const notebook = figureRegistry.getNotebook(notebookUri);

        if (notebook) {
            gallery.refreshIfShowing(notebook);
        }
    };

    const scheduleUpdate = (document: vscode.NotebookDocument): void => {
        if (!isJupyterNotebook(document)) {
            return;
        }

        const notebookUri = document.uri.toString();
        const existing = pendingRefreshes.get(notebookUri);

        if (existing) {
            clearTimeout(existing);
        }

        pendingRefreshes.set(
            notebookUri,
            setTimeout(() => {
                pendingRefreshes.delete(notebookUri);
                void updateNotebook(document);
            }, refreshDelayMs)
        );
    };

    const followActiveNotebook = (editor?: vscode.NotebookEditor): void => {
        const document = editor?.notebook;

        if (!document || !isJupyterNotebook(document)) {
            return;
        }

        lastNotebookEditorColumn = editor.viewColumn;

        const notebookUri = document.uri.toString();
        const registeredNotebook = figureRegistry.getNotebook(notebookUri);

        if (registeredNotebook) {
            gallery.showActiveNotebook(registeredNotebook);
            return;
        }

        void updateNotebook(document).then(() => {
            const scannedNotebook = figureRegistry.getNotebook(notebookUri);

            if (scannedNotebook) {
                gallery.showActiveNotebook(scannedNotebook);
            }
        });
    };

    for (const notebook of vscode.workspace.notebookDocuments) {
        if (isJupyterNotebook(notebook)) {
            void updateNotebook(notebook);
        }
    }

    followActiveNotebook(vscode.window.activeNotebookEditor);

    context.subscriptions.push(
        treeView,
        gallery,
        vscode.window.registerWebviewViewProvider(
            "figureExplorer.gallery",
            gallery
        ),
        vscode.commands.registerCommand("figure-explorer.scanNotebook", () =>
            scanNotebookCommand(provider, (notebook) => gallery.show(notebook))
        ),
        vscode.commands.registerCommand(
            "figure-explorer.revealFigureCell",
            (item: FigureTreeItem) => {
                if (!item?.figure) {
                    void vscode.window.showWarningMessage(
                        "No figure was selected."
                    );
                    return;
                }

                void revealNotebookCell(item.figure);
            }
        ),
        vscode.commands.registerCommand(
            "figure-explorer.openNotebookGallery",
            (notebook: NotebookFigures) => gallery.show(notebook)
        ),
        vscode.commands.registerCommand(
            "figure-explorer.openFigureGallery",
            (figure: FigureRecord) => {
                const notebook = figureRegistry.getNotebook(figure.notebookUri);

                if (notebook) {
                    gallery.show(notebook, figure.id);
                }
            }
        ),
        vscode.commands.registerCommand(
            "figure-explorer.openGalleryInEditor",
            () => gallery.openInEditor()
        ),
        vscode.commands.registerCommand(
            "figure-explorer.saveFigureAsPng",
            (item: FigureTreeItem) => {
                if (item?.figure) {
                    void saveFigureAsPng(item.figure);
                }
            }
        ),
        vscode.commands.registerCommand(
            "figure-explorer.exportFigureAsPdf",
            (item: FigureTreeItem) => {
                if (item?.figure) {
                    void exportFigureAsPdf(item.figure);
                }
            }
        ),
        vscode.workspace.onDidOpenNotebookDocument((document) => {
            if (isJupyterNotebook(document)) {
                void updateNotebook(document);
            }
        }),
        vscode.workspace.onDidChangeNotebookDocument((event) => {
            const figuresMayHaveChanged =
                event.contentChanges.length > 0 ||
                event.cellChanges.some((change) => change.outputs !== undefined);

            if (figuresMayHaveChanged) {
                scheduleUpdate(event.notebook);
            }
        }),
        vscode.window.onDidChangeActiveNotebookEditor((editor) => {
            followActiveNotebook(editor);
        }),
        vscode.workspace.onDidCloseNotebookDocument((document) => {
            if (!isJupyterNotebook(document)) {
                return;
            }

            const notebookUri = document.uri.toString();
            const pending = pendingRefreshes.get(notebookUri);

            if (pending) {
                clearTimeout(pending);
                pendingRefreshes.delete(notebookUri);
            }

            figureRegistry.removeNotebook(notebookUri);
            provider.refresh();
            gallery.refreshRegistry();
        }),
        vscode.window.tabGroups.onDidChangeTabs(() => {
            for (const notebook of figureRegistry.getNotebooks()) {
                if (!isNotebookTabOpen(notebook.uri)) {
                    figureRegistry.removeNotebook(notebook.uri);
                }
            }

            provider.refresh();
            gallery.refreshRegistry();
        }),
        {
            dispose: () => {
                pendingRefreshes.forEach((timer) => clearTimeout(timer));
            },
        }
    );
}

async function revealNotebookCell(
    figure: FigureRecord
): Promise<void> {
    if (!figure.notebookUri) {
        void vscode.window.showWarningMessage(
            "The selected figure does not have a valid notebook reference."
        );
        return;
    }

    try {
        const notebookUri = vscode.Uri.parse(figure.notebookUri);

        const document =
            vscode.workspace.notebookDocuments.find(
                (notebook) => notebook.uri.toString() === figure.notebookUri
            ) ?? (await vscode.workspace.openNotebookDocument(notebookUri));

        if (figure.cellIndex >= document.cellCount) {
            void vscode.window.showWarningMessage(
                "That figure's source cell is no longer in the notebook."
            );
            return;
        }

        const existingEditor = vscode.window.visibleNotebookEditors.find(
            (editor) => editor.notebook.uri.toString() === figure.notebookUri
        );

        const fallbackEditor = vscode.window.visibleNotebookEditors[0];

        const notebookColumn =
            existingEditor?.viewColumn ??
            fallbackEditor?.viewColumn ??
            lastNotebookEditorColumn ??
            vscode.ViewColumn.One;

        const editor = await vscode.window.showNotebookDocument(document, {
            viewColumn: notebookColumn,
            preserveFocus: false,
        });

        editor.revealRange(
            new vscode.NotebookRange(figure.cellIndex, figure.cellIndex + 1),
            vscode.NotebookEditorRevealType.InCenter
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        void vscode.window.showErrorMessage(
            `Could not reveal notebook cell: ${message}`
        );
    }
}

function fileName(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.toString();
}

export function deactivate(): void {}
