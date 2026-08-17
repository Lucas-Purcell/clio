import * as vscode from "vscode";
import { FigureRecord, NotebookFigures } from "../../../shared/notebook/types";
import { figureRegistry } from "../../../shared/registry/figureRegistry";
import { imageStore } from "../../../shared/registry/imageStore";
import { galleryShellHtml } from "./galleryHtml";
import {
    saveFigureAsPng,
    exportFigureAsPdf,
    downloadFigure,
    saveFiguresAsPng,
    exportFiguresAsPdf,
} from "../commands/figureActions";

type SearchScope = "notebook" | "all";

type GalleryMessage =
    | { type: "selectFigure"; key: string }
    | { type: "setScope"; scope: SearchScope }
    | { type: "revealCell" }
    | { type: "requestThumbnail"; key: string }
    | { type: "requestPreview"; key: string }
    | { type: "exportPdf"; key: string }
    | { type: "savePNG"; key: string }
    | { type: "download"; key: string }
    | { type: "copyImage"; key: string }
    | { type: "exportAllPng"; keys: string[] }
    | { type: "exportAllPdf"; keys: string[] };

interface FigurePayload {
    key: string;
    notebookName: string;
    number: number;
    title?: string;
    tags: string[];
    cellIndex: number;
    mimeType: string;
    codeSnippet: string;
    cellSource: string;
    searchText: string;
    version: string;
}

export class FigureGalleryViewProvider
    implements vscode.WebviewViewProvider, vscode.Disposable {
    private view: vscode.WebviewView | undefined;
    private panel: vscode.WebviewPanel | undefined;
    private notebook: NotebookFigures | undefined;
    private selectedKey: string | undefined;
    private scope: SearchScope = "notebook";
    private readonly disposables: vscode.Disposable[] = [];

    private currentFigures: Array<{
        notebook: NotebookFigures;
        figure: FigureRecord;
        number: number;
    }> = [];

    constructor(private readonly revealCell: (figure: FigureRecord) => void) {}

    getEditorViewColumn(): vscode.ViewColumn | undefined {
        return this.panel?.viewColumn;
    }

    getEditorColumn(): vscode.ViewColumn | undefined {
        return this.panel?.viewColumn;
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = galleryShellHtml();

        webviewView.webview.onDidReceiveMessage(
            (message: GalleryMessage) => this.handleMessage(message),
            undefined,
            this.disposables
        );

        webviewView.onDidDispose(
            () => {
                this.view = undefined;
            },
            undefined,
            this.disposables
        );

        this.sendCatalog();
    }

    openInEditor(): void {
        if (this.panel) {
            this.panel.reveal();
            this.sendCatalog();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            "figureExplorer.galleryPanel",
            "Clio",
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = galleryShellHtml(true);

        this.panel.webview.onDidReceiveMessage(
            (message: GalleryMessage) => this.handleMessage(message),
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            undefined,
            this.disposables
        );

        this.sendCatalog();
    }

    show(notebook: NotebookFigures, selectedFigureId?: string): void {
        this.notebook = notebook;
        this.rebuildFigureList();

        if (selectedFigureId) {
            this.selectedKey = figureKey(notebook, selectedFigureId);
        }

        this.ensureSelection();

        if (this.panel) {
            this.panel.reveal();
        } else {
            this.view?.show(false);
        }

        this.sendCatalog();
    }

    /**
     * Keep the notebook-scoped gallery aligned with VS Code's active
     * notebook editor without changing an explicitly selected All open view.
     */
    showActiveNotebook(notebook: NotebookFigures): void {
        if (this.scope !== "notebook") {
            return;
        }

        this.notebook = notebook;
        this.rebuildFigureList();
        this.ensureSelection();
        this.sendCatalog();
    }

    refresh(): void {
        if (this.notebook && !figureRegistry.getNotebook(this.notebook.uri)) {
            this.notebook = undefined;
            this.selectedKey = undefined;
        }

        this.rebuildFigureList();
        this.ensureSelection();
        this.sendCatalog();
    }

    refreshIfShowing(notebook: NotebookFigures): void {
        const isCurrentNotebook = this.notebook?.uri === notebook.uri;

        if (isCurrentNotebook) {
            this.notebook = notebook;
        }

        if (this.scope === "all" || isCurrentNotebook) {
            this.rebuildFigureList();
            this.ensureSelection();
            this.sendCatalog();
        }
    }

    refreshAll(): void {
        if (
            this.scope === "notebook" &&
            this.notebook &&
            !figureRegistry.getNotebook(this.notebook.uri)
        ) {
            this.notebook = undefined;
        }

        if (!this.view && !this.panel) {
            return;
        }

        this.rebuildFigureList();
        this.ensureSelection();
        this.sendCatalog();
    }

    refreshRegistry(): void {
        if (this.notebook) {
            const updated = figureRegistry.getNotebook(this.notebook.uri);

            if (updated) {
                this.notebook = updated;
            } else {
                this.notebook = undefined;
                this.selectedKey = undefined;
            }
        }

        this.rebuildFigureList();
        this.ensureSelection();
        this.sendCatalog();
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    private findFigureByKey(key: string) {
        return this.currentFigures.find(
            ({ notebook, figure }) => figureKey(notebook, figure.id) === key
        );
    }

    private sendImage(key: string, type: "thumbnail" | "preview"): void {
        if (!this.view && !this.panel) {
            return;
        }

        const match = this.findFigureByKey(key);
        const bytes = match ? imageStore.get(match.figure.id) : undefined;

        if (!match || !bytes) {
            return;
        }

        const message = {
            type,
            key,
            mimeType: match.figure.mimeType,
            data: Buffer.from(bytes).toString("base64"),
            version: match.figure.version,
        };

        if (this.view) {
            void this.view.webview.postMessage(message);
        }

        if (this.panel) {
            void this.panel.webview.postMessage(message);
        }
    }

    private sendThumbnail(key: string): void {
        this.sendImage(key, "thumbnail");
    }

    private sendPreview(key: string): void {
        this.sendImage(key, "preview");
    }

    private async handleMessage(message: GalleryMessage): Promise<void> {
        switch (message.type) {
            case "selectFigure":
                this.selectedKey = message.key;
                break;

            case "setScope":
                this.scope = message.scope;
                this.rebuildFigureList();
                this.ensureSelection();
                this.sendCatalog();
                break;

            case "requestThumbnail":
                this.sendThumbnail(message.key);
                break;

            case "requestPreview":
                this.sendPreview(message.key);
                break;

            case "revealCell": {
                const figure = this.findSelectedFigure();

                if (figure) {
                    this.revealCell(figure);
                }

                break;
            }

            case "savePNG": {
                const match = this.findFigureByKey(message.key);

                if (match) {
                    await saveFigureAsPng(match.figure);
                }

                break;
            }

            case "download": {
                const match = this.findFigureByKey(message.key);

                if (match) {
                    await downloadFigure(match.figure);
                }

                break;
            }

            case "exportPdf": {
                const match = this.findFigureByKey(message.key);

                if (match) {
                    await exportFigureAsPdf(match.figure);
                }

                break;
            }

            case "exportAllPng": {
                const figures = message.keys
                    .map((key) => this.findFigureByKey(key)?.figure)
                    .filter(
                        (figure): figure is FigureRecord => figure !== undefined
                    );

                await saveFiguresAsPng(figures);
                break;
            }

            case "exportAllPdf": {
                const figures = message.keys
                    .map((key) => this.findFigureByKey(key)?.figure)
                    .filter(
                        (figure): figure is FigureRecord => figure !== undefined
                    );

                await exportFiguresAsPdf(figures);
                break;
            }

            case "copyImage":
                // Preserve the existing behavior: this message currently has no handler.
                break;
        }
    }

    private rebuildFigureList(): void {
        const notebooks =
            this.scope === "all"
                ? figureRegistry.getNotebooks()
                : this.notebook
                    ? [this.notebook]
                    : [];

        this.currentFigures = notebooks.flatMap((notebook) =>
            notebook.figures.map((figure, index) => ({
                notebook,
                figure,
                number: index + 1,
            }))
        );
    }

    private ensureSelection(): void {
        if (
            !this.currentFigures.some(
                ({ notebook, figure }) =>
                    figureKey(notebook, figure.id) === this.selectedKey
            )
        ) {
            const first = this.currentFigures[0];
            this.selectedKey = first
                ? figureKey(first.notebook, first.figure.id)
                : undefined;
        }
    }

    private findSelectedFigure(): FigureRecord | undefined {
        return this.currentFigures.find(
            ({ notebook, figure }) =>
                figureKey(notebook, figure.id) === this.selectedKey
        )?.figure;
    }

    private sendCatalog(): void {
        if (!this.view && !this.panel) {
            return;
        }

        const figures: FigurePayload[] = this.currentFigures.map(
            ({ notebook, figure, number }) => ({
                key: figureKey(notebook, figure.id),
                notebookName: notebook.name,
                number,
                title: figure.title,
                tags: figure.tags,
                cellIndex: figure.cellIndex,
                mimeType: figure.mimeType,
                codeSnippet: figure.codeSnippet,
                cellSource: figure.cellSource,
                searchText: figure.searchText,
                version: figure.version,
            })
        );

        const message = {
            type: "setCatalog",
            scope: this.scope,
            selectedKey: this.selectedKey,
            notebookName: this.notebook?.name ?? "",
            totalFigures: figures.length,
            figures,
        };

        if (this.view) {
            void this.view.webview.postMessage(message);
        }

        if (this.panel) {
            void this.panel.webview.postMessage(message);
        }
    }
}

function figureKey(notebook: NotebookFigures, figureId: string): string {
    return `${notebook.uri}::${figureId}`;
}
