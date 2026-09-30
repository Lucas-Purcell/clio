import * as vscode from "vscode";
import { scanNotebookCommand } from "./commands/scanNotebook";
import { chooseImageFiles, chooseImageFolders, collectImagesRecursively, individualImagesSourceUri, scanImageSource } from "./commands/scanImages";
import {
    FigureRecord,
    NotebookFigures,
    StarredFigureRecord,
} from "../../shared/notebook/types";
import {
    figureMetadataSignature,
    updateCellFigureMetadata,
} from "../../shared/notebook/scanner";
import { figureHistoryStore } from "../../shared/registry/figureHistoryStore";
import { scanNotebookDocument } from "./notebook/scanner";
import { figureRegistry } from "../../shared/registry/figureRegistry";
import { imageStore } from "../../shared/registry/imageStore";
import { FigureGalleryViewProvider } from "./gallery/figureGalleryView";
import {
    FigureTreeItem,
    FigureTreeProvider,
    NotebookTreeItem,
} from "./views/figureTreeProvider";
import {
    exportFigureAsPdf,
    saveFigureAsPng,
} from "./commands/figureActions";

const refreshDelayMs = 300;
const starredFiguresStorageKey = "clio.starredFigures";
let lastNotebookEditorColumn: vscode.ViewColumn | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const provider = new FigureTreeProvider();
    let starredFigures = normalizeStarredFigures(
        context.workspaceState.get<unknown>(starredFiguresStorageKey)
    );
    const persistStarredFigures = async (): Promise<void> => {
        await context.workspaceState.update(starredFiguresStorageKey, starredFigures);
    };
    const toggleStarredFigure = async (figure: FigureRecord): Promise<void> => {
        const existingIndex = starredFigures.findIndex(
            (entry) => entry.figure.id === figure.id
        );

        if (existingIndex >= 0) {
            starredFigures = starredFigures.filter((_, index) => index !== existingIndex);
        } else {
            starredFigures = [
                ...starredFigures,
                { figure: cloneFigure(figure), starredAt: Date.now() },
            ];
        }

        await persistStarredFigures();
    };
    const refreshStarredSnapshots = async (
        figures: readonly FigureRecord[]
    ): Promise<void> => {
        const current = new Map(figures.map((figure) => [figure.id, figure]));
        let changed = false;
        starredFigures = starredFigures.map((entry) => {
            const figure = current.get(entry.figure.id);

            if (!figure || sameFigureSnapshot(entry.figure, figure)) {
                return entry;
            }

            changed = true;
            return { ...entry, figure: cloneFigure(figure) };
        });

        if (changed) {
            await persistStarredFigures();
        }
    };
    const gallery = new FigureGalleryViewProvider(
        (figure: FigureRecord) => {
            void revealNotebookCell(figure);
        },
        () => starredFigures,
        toggleStarredFigure,
        restoreNotebookCellSource
    );

    const treeView = vscode.window.createTreeView("figureExplorer.figures", {
        treeDataProvider: provider,
        showCollapseAll: true,
    });

    const pendingRefreshes = new Map<string, ReturnType<typeof setTimeout>>();
    const pendingMetadataRefreshes = new Map<string, ReturnType<typeof setTimeout>>();
    const metadataSignatures = new Map<string, string>();
    const manuallyScannedNotebooks = new Set<string>();
    const excludedOpenNotebooks = new Set<string>();
    const individualImages = new Map<string, vscode.Uri>();

    const registerImageSource = async (source: NotebookFigures): Promise<void> => {
        const previous = figureRegistry.getNotebook(source.uri);
        const liveIds = new Set(source.figures.map((figure) => figure.id));
        for (const figure of previous?.figures ?? []) {
            if (!liveIds.has(figure.id)) imageStore.remove(figure.id);
        }
        figureRegistry.setNotebook(source.uri, source.name, source.figures, source.kind);
        await refreshStarredSnapshots(source.figures);
        provider.refresh();
        gallery.refreshRegistry();
        const registered = figureRegistry.getNotebook(source.uri);
        if (registered) gallery.show(registered);
    };

    const scanFolder = async (folder: vscode.Uri): Promise<void> => {
        const images = await collectImagesRecursively(folder);
        if (!images) return;
        const uri = folder.toString();
        const source = await scanImageSource(uri, fileName(folder), "folder", images);
        if (!source) return;
        await registerImageSource(source);
    };

    const scanIndividualImages = async (images: readonly vscode.Uri[]): Promise<void> => {
        for (const image of images) individualImages.set(image.toString(), image);
        const source = await scanImageSource(
            individualImagesSourceUri,
            "Individual images",
            "images",
            [...individualImages.values()]
        );
        if (source) await registerImageSource(source);
    };

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
        if (excludedOpenNotebooks.has(notebookUri)) {
            return;
        }
        const notebookName = fileName(document.uri);
        const previousFigures = figureRegistry.getNotebook(notebookUri)?.figures ?? [];
        const previousImages = new Map(
            previousFigures.flatMap((figure) => {
                const bytes = imageStore.get(figure.id);
                return bytes
                    ? [[figure.id, Uint8Array.from(bytes)] as const]
                    : [];
            })
        );

        let figures: FigureRecord[];

        try {
            figures = await scanNotebookDocument(document);
        } catch {
            return;
        }

        const isStillOpen = vscode.workspace.notebookDocuments.some(
            (notebook) => notebook.uri.toString() === notebookUri
        );

        if (!isStillOpen || excludedOpenNotebooks.has(notebookUri)) {
            return;
        }

        figureHistoryStore.captureChanges(
            previousFigures,
            figures,
            previousImages
        );
        figureRegistry.setNotebook(notebookUri, notebookName, figures);
        await refreshStarredSnapshots(figures);
        cacheNotebookMetadata(document);
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
        if (excludedOpenNotebooks.has(notebookUri)) {
            return;
        }
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

    const cacheNotebookMetadata = (document: vscode.NotebookDocument): void => {
        const prefix = `${document.uri.toString()}::`;

        for (const key of metadataSignatures.keys()) {
            if (key.startsWith(prefix)) {
                metadataSignatures.delete(key);
            }
        }

        for (const [cellIndex, cell] of document.getCells().entries()) {
            metadataSignatures.set(
                metadataSignatureKey(document.uri.toString(), cellIndex),
                figureMetadataSignature(cell.document.getText())
            );
        }
    };

    const updateCellMetadata = (textDocument: vscode.TextDocument): void => {
        for (const document of vscode.workspace.notebookDocuments) {
            if (!isJupyterNotebook(document)) {
                continue;
            }

            const cellIndex = document.getCells().findIndex(
                (cell) => cell.document.uri.toString() === textDocument.uri.toString()
            );

            if (cellIndex < 0) {
                continue;
            }

            const notebookUri = document.uri.toString();
            const signatureKey = metadataSignatureKey(notebookUri, cellIndex);
            const signature = figureMetadataSignature(textDocument.getText());

            if (metadataSignatures.get(signatureKey) === signature) {
                return;
            }

            metadataSignatures.set(signatureKey, signature);
            const registered = figureRegistry.getNotebook(notebookUri);

            if (!registered) {
                void updateNotebook(document);
                return;
            }

            const figures = updateCellFigureMetadata(
                registered.figures,
                cellIndex,
                textDocument.getText(),
                registered.name
            );
            figureRegistry.setNotebook(notebookUri, registered.name, figures);
            void refreshStarredSnapshots(figures);
            provider.refresh();

            const updated = figureRegistry.getNotebook(notebookUri);
            if (updated) {
                gallery.refreshIfShowing(updated);
            }
            return;
        }
    };

    const scheduleMetadataUpdate = (textDocument: vscode.TextDocument): void => {
        const key = textDocument.uri.toString();
        const existing = pendingMetadataRefreshes.get(key);

        if (existing) {
            clearTimeout(existing);
        }

        pendingMetadataRefreshes.set(
            key,
            setTimeout(() => {
                pendingMetadataRefreshes.delete(key);
                updateCellMetadata(textDocument);
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
        if (excludedOpenNotebooks.has(notebookUri)) {
            return;
        }
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
            scanNotebookCommand(provider, (notebook) => {
                manuallyScannedNotebooks.add(notebook.uri);
                excludedOpenNotebooks.delete(notebook.uri);
                gallery.show(notebook);
            })
        ),
        vscode.commands.registerCommand("figure-explorer.scanImages", async () => {
            const images = await chooseImageFiles();
            if (images?.length) await scanIndividualImages(images);
        }),
        vscode.commands.registerCommand("figure-explorer.scanFolder", async () => {
            const folders = await chooseImageFolders();
            for (const folder of folders ?? []) await scanFolder(folder);
        }),
        vscode.commands.registerCommand("figure-explorer.rescanSource", async (item: NotebookTreeItem) => {
            const source = item?.notebook;
            if (!source) return;
            if (source.kind === "folder") {
                await scanFolder(vscode.Uri.parse(source.uri));
            } else if (source.kind === "images") {
                await scanIndividualImages([...individualImages.values()]);
            }
        }),
        vscode.commands.registerCommand(
            "figure-explorer.unscanNotebook",
            (item: NotebookTreeItem) => {
                const uri = item?.notebook?.uri;
                if (!uri) {
                    return;
                }
                manuallyScannedNotebooks.delete(uri);
                if (uri === individualImagesSourceUri) individualImages.clear();
                if (item.notebook.kind === "notebook" && isNotebookTabOpen(uri)) {
                    // Keep an already open editor removed until its tab closes.
                    excludedOpenNotebooks.add(uri);
                } else {
                    excludedOpenNotebooks.delete(uri);
                }
                figureRegistry.removeNotebook(uri);
                imageStore.clearNotebook(uri);
                provider.refresh();
                gallery.refreshRegistry();
            }
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
            "figure-explorer.openSavedImage",
            (item: FigureTreeItem) => {
                if (item?.figure?.imageUri) void revealNotebookCell(item.figure);
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
        vscode.workspace.onDidChangeTextDocument((event) => {
            scheduleMetadataUpdate(event.document);
        }),
        vscode.window.onDidChangeActiveNotebookEditor((editor) => {
            followActiveNotebook(editor);
        }),
        vscode.workspace.onDidCloseNotebookDocument((document) => {
            if (!isJupyterNotebook(document)) {
                return;
            }

            const notebookUri = document.uri.toString();
            excludedOpenNotebooks.delete(notebookUri);
            const pending = pendingRefreshes.get(notebookUri);

            if (pending) {
                clearTimeout(pending);
                pendingRefreshes.delete(notebookUri);
            }

            const metadataPrefix = `${notebookUri}::`;
            for (const [key, timer] of pendingMetadataRefreshes) {
                if (key.startsWith(metadataPrefix)) {
                    clearTimeout(timer);
                    pendingMetadataRefreshes.delete(key);
                }
            }
            for (const key of metadataSignatures.keys()) {
                if (key.startsWith(metadataPrefix)) {
                    metadataSignatures.delete(key);
                }
            }

            if (!manuallyScannedNotebooks.has(notebookUri) &&
                !isNotebookTabOpen(notebookUri)) {
                figureRegistry.removeNotebook(notebookUri);
                imageStore.clearNotebook(notebookUri);
            }
            provider.refresh();
            gallery.refreshRegistry();
        }),
        vscode.window.tabGroups.onDidChangeTabs((event) => {
            for (const uri of excludedOpenNotebooks) {
                if (!isNotebookTabOpen(uri) || event.opened.some((tab) =>
                    tab.input instanceof vscode.TabInputNotebook &&
                    tab.input.uri.toString() === uri
                )) {
                    excludedOpenNotebooks.delete(uri);
                }
            }

            for (const tab of event.opened) {
                if (!(tab.input instanceof vscode.TabInputNotebook)) {
                    continue;
                }
                const uri = tab.input.uri.toString();
                const document = vscode.workspace.notebookDocuments.find(
                    (notebook) => notebook.uri.toString() === uri
                );
                if (document && !figureRegistry.getNotebook(uri)) {
                    void updateNotebook(document);
                }
            }

            for (const notebook of figureRegistry.getNotebooks()) {
                if ((notebook.kind ?? "notebook") === "notebook" &&
                    !manuallyScannedNotebooks.has(notebook.uri) &&
                    !isNotebookTabOpen(notebook.uri)) {
                    figureRegistry.removeNotebook(notebook.uri);
                    imageStore.clearNotebook(notebook.uri);
                }
            }

            provider.refresh();
            gallery.refreshRegistry();
        }),
        {
            dispose: () => {
                pendingRefreshes.forEach((timer) => clearTimeout(timer));
                pendingMetadataRefreshes.forEach((timer) => clearTimeout(timer));
            },
        }
    );
}

async function revealNotebookCell(
    figure: FigureRecord
): Promise<void> {
    if (figure.imageUri) {
        try {
            const imageUri = vscode.Uri.parse(figure.imageUri);
            const column = vscode.window.activeTextEditor?.viewColumn ??
                lastNotebookEditorColumn ?? vscode.ViewColumn.One;
            await vscode.commands.executeCommand("vscode.open", imageUri, {
                viewColumn: column,
                preserveFocus: false,
            });
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`Could not open image: ${detail}`);
        }
        return;
    }

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

async function restoreNotebookCellSource(figure: FigureRecord): Promise<boolean> {
    const source = figure.sourceSnapshot ?? figure.cellSource;
    const notebook = vscode.workspace.notebookDocuments.find(
        (document) => document.uri.toString() === figure.notebookUri
    );

    if (!notebook) {
        void vscode.window.showWarningMessage(
            "Open the original notebook before restoring this version's code."
        );
        return false;
    }

    const cells = notebook.getCells();
    const cell = figure.cellId
        ? cells.find((candidate) => candidate.document.uri.toString() === figure.cellId)
        : cells[figure.cellIndex];

    if (!cell) {
        void vscode.window.showWarningMessage(
            "Clio could not safely identify the original cell. You can still copy the historical code."
        );
        return false;
    }

    if (cell.document.getText() === source) {
        return true;
    }

    const choice = await vscode.window.showWarningMessage(
        `Replace the current code in ${figure.notebookName}, cell ${cell.index + 1}, with this historical version?`,
        { modal: true },
        "Restore Code"
    );

    if (choice !== "Restore Code") {
        return false;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
        cell.document.uri,
        new vscode.Range(
            cell.document.positionAt(0),
            cell.document.positionAt(cell.document.getText().length)
        ),
        source
    );

    if (!await vscode.workspace.applyEdit(edit)) {
        void vscode.window.showErrorMessage("Clio could not restore the cell code.");
        return false;
    }

    await revealNotebookCell({ ...figure, cellIndex: cell.index });
    return true;
}

function fileName(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.toString();
}

function metadataSignatureKey(notebookUri: string, cellIndex: number): string {
    return `${notebookUri}::${cellIndex}`;
}

function normalizeStarredFigures(value: unknown): StarredFigureRecord[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!entry || typeof entry !== "object") {
            return [];
        }

        const candidate = entry as Partial<StarredFigureRecord>;
        const figure = candidate.figure;

        if (
            !figure ||
            typeof figure.id !== "string" ||
            typeof figure.notebookUri !== "string" ||
            typeof figure.notebookName !== "string"
        ) {
            return [];
        }

        return [{
            figure: cloneFigure(figure),
            starredAt: typeof candidate.starredAt === "number"
                ? candidate.starredAt
                : Date.now(),
        }];
    });
}

function cloneFigure(figure: FigureRecord): FigureRecord {
    return { ...figure, tags: [...figure.tags] };
}

function sameFigureSnapshot(left: FigureRecord, right: FigureRecord): boolean {
    return left.version === right.version &&
        left.mimeType === right.mimeType &&
        left.title === right.title &&
        left.searchText === right.searchText &&
        left.tags.join("\u0000") === right.tags.join("\u0000");
}

export function deactivate(): void {}
