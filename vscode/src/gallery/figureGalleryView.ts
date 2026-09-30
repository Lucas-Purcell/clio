import * as vscode from "vscode";
import {
    FigureRecord,
    NotebookFigures,
    StarredFigureRecord,
} from "../../../shared/notebook/types";
import { figureRegistry } from "../../../shared/registry/figureRegistry";
import { imageStore } from "../../../shared/registry/imageStore";
import {
    figureHistorySourceKey,
    figureHistoryStore,
} from "../../../shared/registry/figureHistoryStore";
import { galleryShellHtml } from "./galleryHtml";
import {
    saveFigureAsPng,
    exportFigureAsPdf,
    downloadFigure,
    saveFiguresAsPng,
    exportFiguresAsPdf,
} from "../commands/figureActions";

type SearchScope = "notebook" | "all" | "starred" | "selected";
type ButtonStyle = "icons" | "labels";
type ThumbnailSize = "small" | "medium" | "large";
type CompareLayout = "auto" | "grid" | "stack";
type PreviewBackground = "transparent" | "white";

interface GallerySettings {
    buttonStyle: ButtonStyle;
    thumbnailSize: ThumbnailSize;
    compareLayout: CompareLayout;
    previewBackground: PreviewBackground;
}

type GalleryMessage =
    | { type: "webviewReady" }
    | { type: "selectFigure"; key: string }
    | { type: "setScope"; scope: SearchScope }
    | { type: "setSelectedSources"; uris: string[] }
    | { type: "scanSource"; kind: "notebook" | "images" | "folder" }
    | { type: "toggleStar"; key: string }
    | { type: "setStars"; keys: string[]; starred: boolean }
    | { type: "enterHistory"; key: string }
    | { type: "exitHistory" }
    | { type: "copyVersionCode"; key: string }
    | { type: "restoreVersionCode"; key: string }
    | { type: "revealCell" }
    | { type: "requestThumbnail"; key: string }
    | { type: "requestPreview"; key: string }
    | { type: "exportPdf"; key: string; pngData?: string }
    | { type: "savePNG"; key: string }
    | { type: "download"; key: string; pngData?: string }
    | { type: "copyImage"; key: string }
    | { type: "exportAllPng"; keys: string[] }
    | { type: "exportAllPdf"; keys: string[] }
    | { type: "updateSettings"; settings: GallerySettings };

interface FigurePayload {
    key: string;
    notebookName: string;
    number: number;
    title?: string;
    tags: string[];
    cellIndex: number;
    imageUri?: string;
    sourceKind: "notebook" | "folder" | "images";
    mimeType: string;
    codeSnippet: string;
    cellSource: string;
    searchText: string;
    version: string;
    starred: boolean;
    available: boolean;
    hasHistory: boolean;
    historyPosition?: number;
    historyTotal?: number;
}

export class FigureGalleryViewProvider
    implements vscode.WebviewViewProvider, vscode.Disposable {
    private view: vscode.WebviewView | undefined;
    private panel: vscode.WebviewPanel | undefined;
    private notebook: NotebookFigures | undefined;
    private selectedKey: string | undefined;
    private scope: SearchScope = "notebook";
    private selectedSourceUris = new Set<string>();
    private historySourceKey: string | undefined;
    private historySourceFallback: FigureRecord | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private viewCatalogSignature: string | undefined;
    private panelCatalogSignature: string | undefined;

    private currentFigures: Array<{
        notebook: NotebookFigures;
        figure: FigureRecord;
        number: number;
        historyPosition?: number;
        historyTotal?: number;
    }> = [];

    constructor(
        private readonly revealCell: (figure: FigureRecord) => void,
        private readonly getStarredFigures: () => readonly StarredFigureRecord[],
        private readonly toggleStarredFigure: (figure: FigureRecord) => Promise<void>,
        private readonly restoreCellSource: (figure: FigureRecord) => Promise<boolean>
    ) {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration("clio.gallery")) {
                    this.sendSettings();
                }
            })
        );
    }

    getEditorViewColumn(): vscode.ViewColumn | undefined {
        return this.panel?.viewColumn;
    }

    getEditorColumn(): vscode.ViewColumn | undefined {
        return this.panel?.viewColumn;
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        this.viewCatalogSignature = undefined;
        webviewView.webview.options = { enableScripts: true };

        webviewView.webview.onDidReceiveMessage(
            (message: GalleryMessage) => this.handleMessage(message, webviewView.webview),
            undefined,
            this.disposables
        );

        webviewView.webview.html = galleryShellHtml();

        webviewView.onDidDispose(
            () => {
                this.view = undefined;
                this.viewCatalogSignature = undefined;
            },
            undefined,
            this.disposables
        );

        this.sendCatalog();
        this.sendSettings();
    }

    openInEditor(): void {
        if (this.panel) {
            this.panel.reveal();
            this.sendCatalog();
            void this.panel.webview.postMessage({ type: "revalidatePreview" });
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
        this.panelCatalogSignature = undefined;

        this.panel.webview.onDidReceiveMessage(
            (message: GalleryMessage) => {
                if (this.panel) {
                    void this.handleMessage(message, this.panel.webview);
                }
            },
            undefined,
            this.disposables
        );

        this.panel.webview.html = galleryShellHtml(true);

        this.panel.onDidChangeViewState((event) => {
            if (event.webviewPanel.visible) {
                this.sendCatalog(event.webviewPanel.webview, true);
                void event.webviewPanel.webview.postMessage({ type: "revalidatePreview" });
            }
        }, undefined, this.disposables);

        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.panelCatalogSignature = undefined;
            },
            undefined,
            this.disposables
        );

        this.sendCatalog();
        this.sendSettings();
    }

    show(notebook: NotebookFigures, selectedFigureId?: string): void {
        this.notebook = notebook;
        this.selectedSourceUris = new Set([notebook.uri]);
        this.scope = "selected";
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

        if (this.scope === "all" || this.scope === "starred" ||
            this.scope === "selected" || isCurrentNotebook) {
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
        this.selectedSourceUris = new Set(
            [...this.selectedSourceUris].filter((uri) => figureRegistry.getNotebook(uri))
        );
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

    private sendImage(
        key: string,
        type: "thumbnail" | "preview",
        target: vscode.Webview
    ): void {
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

        void target.postMessage(message);
    }

    private sendThumbnail(key: string, target: vscode.Webview): void {
        this.sendImage(key, "thumbnail", target);
    }

    private sendPreview(key: string, target: vscode.Webview): void {
        this.sendImage(key, "preview", target);
    }

    private async handleMessage(
        message: GalleryMessage,
        source: vscode.Webview
    ): Promise<void> {
        switch (message.type) {
            case "webviewReady":
                this.sendCatalog(source, true);
                this.sendSettings(source);
                break;

            case "selectFigure":
                this.selectedKey = message.key;
                break;

            case "setScope":
                this.historySourceKey = undefined;
                this.historySourceFallback = undefined;
                this.scope = message.scope;
                this.rebuildFigureList();
                this.ensureSelection();
                this.sendCatalog();
                break;

            case "scanSource": {
                const command = message.kind === "notebook"
                    ? "figure-explorer.scanNotebook"
                    : message.kind === "images"
                        ? "figure-explorer.scanImages"
                        : "figure-explorer.scanFolder";
                await vscode.commands.executeCommand(command);
                break;
            }

            case "setSelectedSources": {
                this.historySourceKey = undefined;
                this.historySourceFallback = undefined;
                const available = new Set(
                    figureRegistry.getNotebooks().map((notebook) => notebook.uri)
                );
                this.selectedSourceUris = new Set(
                    message.uris.filter((uri) => available.has(uri))
                );
                this.scope = "selected";
                this.rebuildFigureList();
                this.ensureSelection();
                this.sendCatalog();
                break;
            }

            case "enterHistory": {
                const match = this.findFigureByKey(message.key);

                if (match) {
                    this.historySourceKey = figureHistorySourceKey(match.figure);
                    this.historySourceFallback = match.figure;
                    this.rebuildFigureList();
                    const latest = this.currentFigures[this.currentFigures.length - 1];
                    this.selectedKey = latest
                        ? figureKey(latest.notebook, latest.figure.id)
                        : undefined;
                    this.sendCatalog();
                }
                break;
            }

            case "exitHistory": {
                const sourceKey = this.historySourceKey;
                this.historySourceKey = undefined;
                this.historySourceFallback = undefined;
                this.rebuildFigureList();
                const current = sourceKey
                    ? this.currentFigures.find(({ figure }) =>
                        figureHistorySourceKey(figure) === sourceKey
                    )
                    : undefined;
                this.selectedKey = current
                    ? figureKey(current.notebook, current.figure.id)
                    : this.selectedKey;
                this.ensureSelection();
                this.sendCatalog();
                break;
            }

            case "copyVersionCode": {
                const match = this.findFigureByKey(message.key);

                if (match) {
                    await vscode.env.clipboard.writeText(
                        match.figure.sourceSnapshot ?? match.figure.cellSource
                    );
                    void vscode.window.showInformationMessage("Version code copied.");
                }
                break;
            }

            case "restoreVersionCode": {
                if (!this.historySourceKey) {
                    break;
                }

                const match = this.findFigureByKey(message.key);

                if (match && await this.restoreCellSource(match.figure)) {
                    void vscode.window.showInformationMessage(
                        `Restored code for ${match.figure.notebookName}, cell ${match.figure.cellIndex + 1}.`
                    );
                }
                break;
            }

            case "toggleStar": {
                if (this.historySourceKey) {
                    break;
                }

                const match = this.findFigureByKey(message.key);

                if (match) {
                    await this.toggleStarredFigure(match.figure);
                    this.rebuildFigureList();
                    this.ensureSelection();
                    this.sendCatalog();
                }
                break;
            }

            case "setStars": {
                if (this.historySourceKey) {
                    break;
                }

                const starredIds = new Set(
                    this.getStarredFigures().map((entry) => entry.figure.id)
                );
                const figures = message.keys
                    .map((key) => this.findFigureByKey(key)?.figure)
                    .filter((figure): figure is FigureRecord => figure !== undefined);

                for (const figure of figures) {
                    if (starredIds.has(figure.id) !== message.starred) {
                        await this.toggleStarredFigure(figure);
                    }
                }

                this.rebuildFigureList();
                this.ensureSelection();
                this.sendCatalog();
                break;
            }

            case "requestThumbnail":
                this.sendThumbnail(message.key, source);
                break;

            case "requestPreview":
                this.sendPreview(message.key, source);
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
                    await downloadFigure(
                        match.figure,
                        message.pngData
                            ? Buffer.from(message.pngData, "base64")
                            : undefined
                    );
                }

                break;
            }

            case "exportPdf": {
                const match = this.findFigureByKey(message.key);

                if (match) {
                    await exportFigureAsPdf(
                        match.figure,
                        message.pngData
                            ? Buffer.from(message.pngData, "base64")
                            : undefined
                    );
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

            case "updateSettings": {
                const settings = normalizeGallerySettings(message.settings);
                const configuration = vscode.workspace.getConfiguration("clio.gallery");

                await Promise.all([
                    configuration.update("buttonStyle", settings.buttonStyle, vscode.ConfigurationTarget.Global),
                    configuration.update("thumbnailSize", settings.thumbnailSize, vscode.ConfigurationTarget.Global),
                    configuration.update("compareLayout", settings.compareLayout, vscode.ConfigurationTarget.Global),
                    configuration.update("previewBackground", settings.previewBackground, vscode.ConfigurationTarget.Global),
                ]);
                break;
            }
        }
    }

    private gallerySettings(): GallerySettings {
        const configuration = vscode.workspace.getConfiguration("clio.gallery");

        return normalizeGallerySettings({
            buttonStyle: configuration.get<ButtonStyle>("buttonStyle"),
            thumbnailSize: configuration.get<ThumbnailSize>("thumbnailSize"),
            compareLayout: configuration.get<CompareLayout>("compareLayout"),
            previewBackground: configuration.get<PreviewBackground>("previewBackground"),
        });
    }

    private sendSettings(target?: vscode.Webview): void {
        const message = {
            type: "setSettings" as const,
            settings: this.gallerySettings(),
        };

        if (this.view && (!target || target === this.view.webview)) {
            void this.view.webview.postMessage(message);
        }

        if (this.panel && (!target || target === this.panel.webview)) {
            void this.panel.webview.postMessage(message);
        }
    }

    private rebuildFigureList(): void {
        if (this.historySourceKey) {
            const current = figureRegistry.getNotebooks()
                .flatMap((notebook) => notebook.figures)
                .find((figure) =>
                    figureHistorySourceKey(figure) === this.historySourceKey
                ) ?? this.historySourceFallback;

            if (!current) {
                this.currentFigures = [];
                return;
            }

            this.historySourceFallback = current;
            const versions = figureHistoryStore.getVersions(current);
            const total = versions.length;
            const notebook: NotebookFigures = {
                uri: current.notebookUri,
                name: current.notebookName,
                figures: versions,
            };
            this.currentFigures = versions.map((figure, index) => ({
                notebook,
                figure,
                number: index + 1,
                historyPosition: index + 1,
                historyTotal: total,
            }));
            return;
        }

        if (this.scope === "starred") {
            const liveFigures = new Map(
                figureRegistry.getNotebooks().flatMap((notebook) =>
                    notebook.figures.map((figure) => [figure.id, figure] as const)
                )
            );

            this.currentFigures = [...this.getStarredFigures()]
                .sort((left, right) => right.starredAt - left.starredAt)
                .map((entry, index) => {
                    const figure = liveFigures.get(entry.figure.id) ?? entry.figure;
                    const notebook: NotebookFigures = {
                        uri: figure.notebookUri,
                        name: figure.notebookName,
                        kind: figure.imageUri ? "images" : "notebook",
                        figures: [figure],
                    };

                    return { notebook, figure, number: index + 1 };
                });
            return;
        }

        const notebooks =
            this.scope === "all"
                ? figureRegistry.getNotebooks()
                : this.scope === "selected"
                    ? figureRegistry.getNotebooks().filter(
                        (notebook) => this.selectedSourceUris.has(notebook.uri)
                    )
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

    private sendCatalog(target?: vscode.Webview, force = false): void {
        if (!this.view && !this.panel) {
            return;
        }

        const figures: FigurePayload[] = this.currentFigures.map(
            ({ notebook, figure, number, historyPosition, historyTotal }) => ({
                key: figureKey(notebook, figure.id),
                notebookName: notebook.name,
                number,
                title: figure.title,
                tags: figure.tags,
                cellIndex: figure.cellIndex,
                imageUri: figure.imageUri,
                sourceKind: notebook.kind ?? "notebook",
                mimeType: figure.mimeType,
                codeSnippet: figure.codeSnippet,
                cellSource: figure.sourceSnapshot ?? figure.cellSource,
                searchText: figure.searchText,
                version: figure.version,
                starred: this.getStarredFigures().some(
                    (entry) => entry.figure.id === figure.id
                ),
                available: imageStore.get(figure.id) !== undefined,
                hasHistory: !figure.imageUri && figureHistoryStore.hasHistory(figure),
                ...(historyPosition
                    ? { historyPosition, historyTotal }
                    : {}),
            })
        );

        const message = {
            type: "setCatalog",
            scope: this.scope,
            selectedKey: this.selectedKey,
            notebookName: this.scope === "selected"
                ? this.selectedSourceUris.size === 1
                    ? figureRegistry.getNotebook([...this.selectedSourceUris][0])?.name ?? ""
                    : this.selectedSourceUris.size === 0
                        ? "No sources selected"
                        : `${this.selectedSourceUris.size} selected sources`
                : this.notebook?.name ?? "",
            notebooks: figureRegistry.getNotebooks().map(({ uri, name, kind }) => ({ uri, name, kind: kind ?? "notebook" })),
            selectedSourceUris: [...this.selectedSourceUris],
            activeSourceUri: this.notebook?.uri,
            totalFigures: figures.length,
            figures,
            settings: this.gallerySettings(),
            historyMode: Boolean(this.historySourceKey),
        };

        const signature = JSON.stringify({
            scope: message.scope,
            historyMode: message.historyMode,
            selectedKey: message.selectedKey,
            notebookName: message.notebookName,
            notebooks: message.notebooks,
            selectedSourceUris: message.selectedSourceUris,
            activeSourceUri: message.activeSourceUri,
            settings: message.settings,
            figures: figures.map((figure) => [
                figure.key,
                figure.version,
                figure.sourceKind,
                figure.imageUri,
                figure.title,
                figure.tags,
                figure.codeSnippet,
                figure.searchText,
                figure.starred,
                figure.available,
                figure.hasHistory,
                figure.historyPosition,
                figure.historyTotal,
            ]),
        });

        if (
            this.view &&
            (!target || target === this.view.webview) &&
            (force || this.viewCatalogSignature !== signature)
        ) {
            void this.view.webview.postMessage(message).then((posted) => {
                if (posted) this.viewCatalogSignature = signature;
            });
        }

        if (
            this.panel &&
            (!target || target === this.panel.webview) &&
            (force || this.panelCatalogSignature !== signature)
        ) {
            void this.panel.webview.postMessage(message).then((posted) => {
                if (posted) this.panelCatalogSignature = signature;
            });
        }
    }
}

function figureKey(notebook: NotebookFigures, figureId: string): string {
    return `${notebook.uri}::${figureId}`;
}

function normalizeGallerySettings(settings: Partial<GallerySettings>): GallerySettings {
    return {
        buttonStyle: settings.buttonStyle === "labels" ? "labels" : "icons",
        thumbnailSize:
            settings.thumbnailSize === "small" || settings.thumbnailSize === "large"
                ? settings.thumbnailSize
                : "medium",
        compareLayout:
            settings.compareLayout === "grid" || settings.compareLayout === "stack"
                ? settings.compareLayout
                : "auto",
        previewBackground: settings.previewBackground === "white" ? "white" : "transparent",
    };
}
