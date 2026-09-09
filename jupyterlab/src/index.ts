import {
    JupyterFrontEnd,
    JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette, MainAreaWidget } from "@jupyterlab/apputils";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import { INotebookTracker, NotebookPanel } from "@jupyterlab/notebook";
import {
    FigureHistoryEntry,
    FigureRecord,
    figureHistoryStore,
    imageStore,
    NotebookFigures,
    figureRegistry,
    StarredFigureRecord,
} from "@clio/shared";
import { FigureExplorerSidebar } from "./figureExplorerSidebar";
import {
    defaultGallerySettings,
    FigureExplorerWidget,
    GallerySettings,
} from "./figureExplorerWidget";
import { clioIcon } from "./icon";
import {
    figureImageInputs,
    figureMetadataInputs,
    notebookJson,
    sameFigureImageInputs,
    sameFigureMetadataInputs,
    scanNotebookJson,
    updateChangedFigureMetadata,
    type FigureImageInput,
    type FigureMetadataInput,
} from "./notebookScanner";
import "../style/index.css";

const openGalleryCommand = "figure-explorer:open-gallery";
const openGalleryInSidePanelCommand = "figure-explorer:open-gallery-in-side-panel";
const openGalleryInNewWindowCommand = "figure-explorer:open-gallery-in-new-window";
const refreshGalleryCommand = "figure-explorer:refresh-gallery";
const galleryWindowQuery = "figureExplorerGallery";
const galleryWindowSourceQuery = "figureExplorerSource";
const gallerySettingsStorageKey = "clio:gallery-settings";
const starredFiguresStorageKey = "clio:starred-figures";

function readStarredFigures(): StarredFigureRecord[] {
    try {
        const stored = JSON.parse(
            window.localStorage.getItem(starredFiguresStorageKey) ?? "[]"
        ) as unknown;

        if (!Array.isArray(stored)) {
            return [];
        }

        return stored.filter((entry): entry is StarredFigureRecord => {
            if (!entry || typeof entry !== "object") {
                return false;
            }

            const candidate = entry as Partial<StarredFigureRecord>;
            return Boolean(
                candidate.figure &&
                typeof candidate.figure.id === "string" &&
                typeof candidate.starredAt === "number"
            );
        });
    } catch {
        return [];
    }
}

function readGallerySettings(): GallerySettings {
    try {
        const stored = JSON.parse(
            window.localStorage.getItem(gallerySettingsStorageKey) ?? "{}"
        ) as Partial<GallerySettings>;

        return {
            buttonStyle: stored.buttonStyle === "labels" ? "labels" : "icons",
            thumbnailSize:
                stored.thumbnailSize === "small" || stored.thumbnailSize === "large"
                    ? stored.thumbnailSize
                    : "medium",
            compareLayout:
                stored.compareLayout === "grid" || stored.compareLayout === "stack"
                    ? stored.compareLayout
                    : "auto",
        };
    } catch {
        return defaultGallerySettings;
    }
}

function galleryWindowSourceId(): string | undefined {
    const fromQuery = new URLSearchParams(window.location.search)
        .get(galleryWindowSourceQuery);

    if (fromQuery) {
        return fromQuery;
    }

    const prefix = "figure-explorer-gallery:";
    return window.name.startsWith(prefix)
        ? window.name.slice(prefix.length)
        : undefined;
}

interface GalleryWindowCatalog {
    type: "catalog";
    notebooks: readonly NotebookFigures[];
    images?: readonly { id: string; data: string }[];
    history: readonly FigureHistoryEntry[];
    currentNotebookUri?: string;
    settings: GallerySettings;
    starredFigures: readonly StarredFigureRecord[];
}

interface GalleryWindowReady {
    type: "ready";
}

interface GalleryWindowReveal {
    type: "reveal";
    figure: FigureRecord;
}

interface GalleryWindowSelect {
    type: "select";
    figureId: string;
}

interface GalleryWindowShowNotebook {
    type: "showNotebook";
    notebookUri: string;
}

interface GalleryWindowClosed {
    type: "closed";
}

interface GalleryWindowSettings {
    type: "settings";
    settings: GallerySettings;
}

interface GalleryWindowToggleStar {
    type: "toggleStar";
    figure: FigureRecord;
}

interface GalleryWindowRestoreCode {
    type: "restoreCode";
    figure: FigureRecord;
}

type GalleryWindowMessage =
    | GalleryWindowCatalog
    | GalleryWindowReady
    | GalleryWindowReveal
    | GalleryWindowSelect
    | GalleryWindowShowNotebook
    | GalleryWindowClosed
    | GalleryWindowSettings
    | GalleryWindowToggleStar
    | GalleryWindowRestoreCode;

function encodeImage(bytes: Readonly<Uint8Array>): string {
    const chunkSize = 8192;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }

    return btoa(binary);
}

function decodeImage(data: string): Uint8Array {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

const plugin: JupyterFrontEndPlugin<void> = {
    id: "@clio/jupyter:plugin",
    description: "Clio: browse figures generated in Jupyter notebooks.",
    autoStart: true,
    requires: [INotebookTracker, IDefaultFileBrowser],
    optional: [ICommandPalette],
    activate: (app, notebooks, fileBrowser, palette) => {
        let gallery: MainAreaWidget<FigureExplorerWidget> | undefined;
        let sideGallery: FigureExplorerWidget | undefined;
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const notebookImageInputs = new Map<string, readonly FigureImageInput[]>();
        const notebookMetadataInputs = new Map<string, readonly FigureMetadataInput[]>();
        let galleryWindowChannel: BroadcastChannel | undefined;
        let externalGalleryWindow: Window | null | undefined;
        let externalGalleryConnected = false;
        let gallerySettings = readGallerySettings();
        let starredFigures = readStarredFigures();
        const popupSourceId = galleryWindowSourceId();
        const isExternalGallery = Boolean(popupSourceId || window.opener);

        const persistStarredFigures = (): void => {
            try {
                window.localStorage.setItem(
                    starredFiguresStorageKey,
                    JSON.stringify(starredFigures)
                );
            } catch {
                // Keep stars available for this session if browser storage is blocked.
            }
        };

        const cloneFigure = (figure: FigureRecord): FigureRecord => ({
            ...figure,
            tags: [...figure.tags],
        });

        const refreshStarredSnapshots = (figures: readonly FigureRecord[]): void => {
            const current = new Map(figures.map((figure) => [figure.id, figure]));
            let changed = false;
            starredFigures = starredFigures.map((entry) => {
                const figure = current.get(entry.figure.id);

                if (!figure || (
                    entry.figure.version === figure.version &&
                    entry.figure.title === figure.title &&
                    entry.figure.searchText === figure.searchText &&
                    JSON.stringify(entry.figure.tags) === JSON.stringify(figure.tags)
                )) {
                    return entry;
                }

                changed = true;
                return { ...entry, figure: cloneFigure(figure) };
            });

            if (changed) {
                persistStarredFigures();
            }
        };

        const getActiveNotebook = (): NotebookPanel | undefined =>
            notebooks.currentWidget ?? undefined;

        const findNotebook = (uri: string): NotebookPanel | undefined => {
            let match: NotebookPanel | undefined;
            notebooks.forEach((panel: NotebookPanel) => {
                if (panel.context.path === uri) {
                    match = panel;
                }
            });
            return match;
        };

        const focusNotebook = (uri: string): NotebookPanel | undefined => {
            const panel = findNotebook(uri);

            if (panel) {
                app.shell.activateById(panel.id);
            }

            return panel;
        };

        const revealCell = (figure: FigureRecord): void => {
            if (popupSourceId && galleryWindowChannel) {
                galleryWindowChannel.postMessage({ type: "reveal", figure });
                return;
            }

            const panel = focusNotebook(figure.notebookUri);

            if (!panel) {
                void app.commands.execute("docmanager:open", {
                    path: figure.notebookUri,
                }).then(() => {
                    window.setTimeout(() => {
                        const opened = focusNotebook(figure.notebookUri);
                        if (opened) {
                            opened.content.activeCellIndex = figure.cellIndex;
                            (opened.content as unknown as { scrollToItem?(index: number): void })
                                .scrollToItem?.(figure.cellIndex);
                        }
                    }, 150);
                });
                return;
            }

            panel.content.activeCellIndex = figure.cellIndex;
            (panel.content as unknown as { scrollToItem?(index: number): void })
                .scrollToItem?.(figure.cellIndex);
        };

        const restoreCellSource = (figure: FigureRecord): boolean => {
            if (popupSourceId && galleryWindowChannel) {
                galleryWindowChannel.postMessage({
                    type: "restoreCode",
                    figure,
                } satisfies GalleryWindowRestoreCode);
                return true;
            }

            const panel = focusNotebook(figure.notebookUri);
            const cells = panel?.content.model?.cells;
            const source = figure.sourceSnapshot ?? figure.cellSource;

            if (!panel || !cells) {
                window.alert(
                    "Open the original notebook before restoring this version's code."
                );
                return false;
            }

            let cellIndex = -1;

            if (figure.cellId) {
                for (let index = 0; index < cells.length; index += 1) {
                    if (cells.get(index).id === figure.cellId) {
                        cellIndex = index;
                        break;
                    }
                }
            } else if (figure.cellIndex >= 0 && figure.cellIndex < cells.length) {
                cellIndex = figure.cellIndex;
            }

            if (cellIndex < 0) {
                window.alert(
                    "Clio could not safely identify the original cell. You can still copy the historical code."
                );
                return false;
            }

            const cell = cells.get(cellIndex);
            panel.context.model.sharedModel.transact(() => {
                cell.sharedModel.setSource(source);
            }, true);
            panel.content.activeCellIndex = cellIndex;
            (panel.content as unknown as { scrollToItem?(index: number): void })
                .scrollToItem?.(cellIndex);
            return true;
        };

        const scanNotebook = (
            panel: NotebookPanel,
            force = false
        ): "none" | "images" | "metadata" => {
            const notebookUri = panel.context.path;
            const notebookName = notebookUri.split("/").pop() ?? notebookUri;
            const notebook = notebookJson(panel.context.model);
            const imageInputs = figureImageInputs(notebook);
            const metadataInputs = figureMetadataInputs(notebook);
            const imagesChanged = force || !sameFigureImageInputs(
                notebookImageInputs.get(notebookUri),
                imageInputs
            );
            const metadataChanged = !sameFigureMetadataInputs(
                notebookMetadataInputs.get(notebookUri),
                metadataInputs
            );

            if (!imagesChanged && !metadataChanged) {
                return "none";
            }

            if (imagesChanged) {
                const previousFigures = figureRegistry.getNotebook(notebookUri)?.figures ?? [];
                const previousImages = new Map(
                    previousFigures.flatMap((figure) => {
                        const bytes = imageStore.get(figure.id);
                        return bytes
                            ? [[figure.id, Uint8Array.from(bytes)] as const]
                            : [];
                    })
                );
                const figures = scanNotebookJson(
                    notebook,
                    notebookUri,
                    notebookName
                );

                figureHistoryStore.captureChanges(
                    previousFigures,
                    figures,
                    previousImages
                );
                figureRegistry.setNotebook(notebookUri, notebookName, figures);
                refreshStarredSnapshots(figures);
                notebookImageInputs.set(notebookUri, imageInputs);
                notebookMetadataInputs.set(notebookUri, metadataInputs);
                return "images";
            }

            const registered = figureRegistry.getNotebook(notebookUri);
            if (!registered) {
                return "none";
            }

            const figures = updateChangedFigureMetadata(
                registered.figures,
                notebookMetadataInputs.get(notebookUri),
                metadataInputs,
                notebookName
            );
            figureRegistry.setNotebook(notebookUri, notebookName, figures);
            refreshStarredSnapshots(figures);
            notebookMetadataInputs.set(notebookUri, metadataInputs);
            return "metadata";
        };

        const scanOpenNotebooks = (): void => {
            notebooks.forEach((panel: NotebookPanel) => scanNotebook(panel));
        };

        let sidebar: FigureExplorerSidebar | undefined;

        const hasExternalGallery = (): boolean =>
            externalGalleryConnected &&
            (!externalGalleryWindow || !externalGalleryWindow.closed);

        const applyGallerySettings = (
            settings: GallerySettings,
            broadcast = true
        ): void => {
            gallerySettings = settings;

            try {
                window.localStorage.setItem(
                    gallerySettingsStorageKey,
                    JSON.stringify(gallerySettings)
                );
            } catch {
                // Settings remain available for this session when browser storage is unavailable.
            }

            if (gallery && !gallery.isDisposed) {
                gallery.content.setSettings(gallerySettings);
            }

            if (sideGallery && !sideGallery.isDisposed) {
                sideGallery.setSettings(gallerySettings);
            }

            if (broadcast && galleryWindowChannel) {
                galleryWindowChannel.postMessage({
                    type: "settings",
                    settings: gallerySettings,
                } satisfies GalleryWindowSettings);
            }
        };

        const sendGalleryWindowCatalog = (
            current = getActiveNotebook(),
            includeImages = true
        ): void => {
            if (!galleryWindowChannel || popupSourceId) {
                return;
            }

            const notebooks = figureRegistry.getNotebooks();
            const history = figureHistoryStore.getEntries();
            const imageRecords = includeImages
                ? [
                    ...notebooks.flatMap((notebook) => notebook.figures),
                    ...history.map((entry) => entry.figure),
                ]
                : [];
            const images = includeImages
                ? [...new Map(imageRecords.map((figure) => {
                    const bytes = imageStore.get(figure.id);
                    return [
                        figure.id,
                        bytes ? { id: figure.id, data: encodeImage(bytes) } : undefined,
                    ] as const;
                })).values()].filter(
                    (image): image is { id: string; data: string } => image !== undefined
                )
                : undefined;

            const message: GalleryWindowCatalog = {
                type: "catalog",
                notebooks,
                images,
                history,
                currentNotebookUri: current?.context.path,
                settings: gallerySettings,
                starredFigures,
            };
            galleryWindowChannel.postMessage(message);
        };

        const updateViews = (
            current = getActiveNotebook(),
            includeImages = true
        ): void => {
            const allNotebooks = figureRegistry.getNotebooks();
            sidebar?.setNotebooks(allNotebooks);

            if (gallery && !gallery.isDisposed) {
                gallery.content.setNotebooks(allNotebooks, current?.context.path);
                gallery.content.setStarredFigures(starredFigures);
            }

            if (sideGallery && !sideGallery.isDisposed) {
                sideGallery.setNotebooks(allNotebooks, current?.context.path);
                sideGallery.setStarredFigures(starredFigures);
            }

            sendGalleryWindowCatalog(current, includeImages);
        };

        const toggleStarredFigure = (figure: FigureRecord): void => {
            if (popupSourceId && galleryWindowChannel) {
                galleryWindowChannel.postMessage({
                    type: "toggleStar",
                    figure,
                } satisfies GalleryWindowToggleStar);
                return;
            }

            const existing = starredFigures.some(
                (entry) => entry.figure.id === figure.id
            );
            starredFigures = existing
                ? starredFigures.filter((entry) => entry.figure.id !== figure.id)
                : [...starredFigures, {
                    figure: cloneFigure(figure),
                    starredAt: Date.now(),
                }];
            persistStarredFigures();
            updateViews(undefined, false);
        };

        const refreshGallery = (force = false): void => {
            const current = getActiveNotebook();

            if (current) {
                scanNotebook(current, force);
            }

            updateViews(current);
        };

        const scheduleRefresh = (changedPanel?: NotebookPanel): void => {
            if (refreshTimer) {
                clearTimeout(refreshTimer);
            }

            refreshTimer = setTimeout(() => {
                refreshTimer = undefined;
                let change: "none" | "images" | "metadata" = "none";

                if (changedPanel && !changedPanel.isDisposed) {
                    change = scanNotebook(changedPanel);
                }

                if (change !== "none") {
                    updateViews(undefined, change === "images");
                }
            }, 150);
        };

        const observeNotebook = (panel: NotebookPanel): void => {
            scanNotebook(panel);
            updateViews();
            panel.context.model.contentChanged.connect(() => scheduleRefresh(panel));
            panel.disposed.connect(() => {
                figureRegistry.removeNotebook(panel.context.path);
                imageStore.clearNotebook(panel.context.path);
                notebookImageInputs.delete(panel.context.path);
                notebookMetadataInputs.delete(panel.context.path);
                updateViews();
            });
        };

        const ensureGallery = (): MainAreaWidget<FigureExplorerWidget> => {
            if (!gallery || gallery.isDisposed) {
                gallery = new MainAreaWidget({
                    content: new FigureExplorerWidget(
                        revealCell,
                        popupSourceId ? "all" : "notebook",
                        isExternalGallery,
                        gallerySettings,
                        applyGallerySettings,
                        starredFigures,
                        toggleStarredFigure,
                        restoreCellSource
                    ),
                });
                gallery.id = "figure-explorer:gallery";
                gallery.title.label = "Clio";
                gallery.title.icon = clioIcon;
                gallery.content.addClass("jp-mod-tabGallery");
                app.shell.add(gallery, "main", { rank: 850 });
            } else {
                app.shell.add(gallery, "main", { rank: 850 });
            }

            return gallery;
        };

        const ensureSideGallery = (): FigureExplorerWidget => {
            if (!sideGallery || sideGallery.isDisposed) {
                sideGallery = new FigureExplorerWidget(
                    revealCell,
                    "notebook",
                    false,
                    gallerySettings,
                    applyGallerySettings,
                    starredFigures,
                    toggleStarredFigure,
                    restoreCellSource
                );
                sideGallery.id = "figure-explorer:gallery-sidebar";
                sideGallery.title.label = "Clio";
                sideGallery.title.icon = clioIcon;
                sideGallery.title.closable = false;
                app.shell.add(sideGallery, "right", { rank: 850 });
            }

            return sideGallery;
        };

        const openGallery = (
            notebookUri?: string,
            figureId?: string
        ): void => {
            const panel = notebookUri ? focusNotebook(notebookUri) : getActiveNotebook();

            if (!panel) {
                if (isExternalGallery) {
                    const galleryWidget = ensureGallery();
                    updateViews();
                    app.shell.activateById(galleryWidget.id);
                }
                return;
            }

            scanNotebook(panel);
            const galleryWidget = ensureGallery();
            updateViews(panel);

            if (figureId) {
                galleryWidget.content.selectFigure(figureId);
            }

            app.shell.activateById(galleryWidget.id);
        };

        const focusExternalGallery = (): void => {
            externalGalleryWindow?.focus();
        };

        sidebar = new FigureExplorerSidebar(
            (notebook) => {
                if (isExternalGallery) {
                    const galleryWidget = ensureGallery();
                    galleryWidget.content.showNotebook(notebook.uri);
                    app.shell.activateById(galleryWidget.id);
                    return;
                }

                if (hasExternalGallery() && galleryWindowChannel) {
                    galleryWindowChannel.postMessage({
                        type: "showNotebook",
                        notebookUri: notebook.uri,
                    } satisfies GalleryWindowShowNotebook);
                    focusExternalGallery();
                    return;
                }

                focusNotebook(notebook.uri);
            },
            (figure) => {
                if (isExternalGallery) {
                    const galleryWidget = ensureGallery();
                    galleryWidget.content.selectFigure(figure.id);
                    app.shell.activateById(galleryWidget.id);
                    return;
                }

                if (hasExternalGallery() && galleryWindowChannel) {
                    galleryWindowChannel.postMessage({
                        type: "select",
                        figureId: figure.id,
                    } satisfies GalleryWindowSelect);
                    focusExternalGallery();
                    return;
                }

                revealCell(figure);
            }
        );
        fileBrowser.addSection(sidebar);

        const receiveGalleryWindowMessage = (
            event: MessageEvent<GalleryWindowMessage>
        ): void => {
            const message = event.data;

            if (message.type === "ready" && !popupSourceId) {
                externalGalleryConnected = true;
                sendGalleryWindowCatalog();
                return;
            }

            if (message.type === "closed" && !popupSourceId) {
                externalGalleryConnected = false;
                externalGalleryWindow = undefined;
                return;
            }

            if (message.type === "reveal" && !popupSourceId) {
                revealCell(message.figure);
                return;
            }

            if (message.type === "select" && popupSourceId) {
                gallery?.content.selectFigure(message.figureId);
                return;
            }

            if (message.type === "showNotebook" && popupSourceId) {
                gallery?.content.showNotebook(message.notebookUri);
                return;
            }

            if (message.type === "settings") {
                applyGallerySettings(message.settings, false);
                return;
            }

            if (message.type === "toggleStar" && !popupSourceId) {
                toggleStarredFigure(message.figure);
                return;
            }

            if (message.type === "restoreCode" && !popupSourceId) {
                restoreCellSource(message.figure);
                return;
            }

            if (message.type !== "catalog" || !popupSourceId) {
                return;
            }

            for (const notebook of figureRegistry.getNotebooks()) {
                figureRegistry.removeNotebook(notebook.uri);
            }
            if (message.images) {
                figureHistoryStore.clear();
                imageStore.clear();
            }

            for (const notebook of message.notebooks) {
                figureRegistry.setNotebook(
                    notebook.uri,
                    notebook.name,
                    notebook.figures
                );
            }

            for (const image of message.images ?? []) {
                imageStore.put(image.id, decodeImage(image.data));
            }
            figureHistoryStore.replace(message.history);

            applyGallerySettings(message.settings, false);
            starredFigures = [...message.starredFigures];

            const allNotebooks = figureRegistry.getNotebooks();
            sidebar?.setNotebooks(allNotebooks);
            if (gallery && !gallery.isDisposed) {
                gallery.content.setNotebooks(
                    allNotebooks,
                    message.currentNotebookUri
                );
                gallery.content.setStarredFigures(starredFigures);
            }
            if (sideGallery && !sideGallery.isDisposed) {
                sideGallery.setNotebooks(
                    allNotebooks,
                    message.currentNotebookUri
                );
                sideGallery.setStarredFigures(starredFigures);
            }
        };

        if (popupSourceId) {
            galleryWindowChannel = new BroadcastChannel(
                `figure-explorer-gallery:${popupSourceId}`
            );
            galleryWindowChannel.addEventListener(
                "message",
                receiveGalleryWindowMessage
            );
            galleryWindowChannel.postMessage({ type: "ready" } satisfies GalleryWindowReady);
            window.addEventListener("beforeunload", () => {
                galleryWindowChannel?.postMessage({ type: "closed" } satisfies GalleryWindowClosed);
                galleryWindowChannel?.close();
            });
        }

        notebooks.forEach(observeNotebook);
        notebooks.widgetAdded.connect(
            (_: INotebookTracker, panel: NotebookPanel) => observeNotebook(panel)
        );

        if (!isExternalGallery) {
            ensureSideGallery();
            updateViews();
        }

        app.commands.addCommand(openGalleryCommand, {
            label: "Clio: Open Gallery as Tab",
            isEnabled: () => Boolean(getActiveNotebook()),
            execute: () => openGallery(),
        });

        app.commands.addCommand(openGalleryInSidePanelCommand, {
            label: "Clio: Open Gallery in Side Panel",
            isEnabled: () => Boolean(getActiveNotebook()),
            execute: () => {
                const panel = getActiveNotebook();
                if (!panel) {
                    return;
                }

                scanNotebook(panel);
                const widget = ensureSideGallery();
                updateViews(panel);
                app.shell.activateById(widget.id);
            },
        });

        app.commands.addCommand(openGalleryInNewWindowCommand, {
            label: "Clio: Open Gallery in New Window",
            isEnabled: () => !popupSourceId && Boolean(getActiveNotebook()),
            execute: () => {
                scanOpenNotebooks();
                const url = new URL(window.location.href);
                const sourceId = crypto.randomUUID();
                const labIndex = url.pathname.indexOf("/lab");
                if (labIndex >= 0) {
                    const basePath = url.pathname.slice(0, labIndex);
                    url.pathname =
                        `${basePath}/lab/workspaces/figure-explorer-${sourceId}`;
                }
                url.hash = "";
                url.searchParams.set(galleryWindowQuery, "1");
                url.searchParams.set(galleryWindowSourceQuery, sourceId);

                galleryWindowChannel?.close();
                externalGalleryConnected = false;
                galleryWindowChannel = new BroadcastChannel(
                    `figure-explorer-gallery:${sourceId}`
                );
                galleryWindowChannel.addEventListener(
                    "message",
                    receiveGalleryWindowMessage
                );
                externalGalleryWindow = window.open(
                    url.toString(),
                    `figure-explorer-gallery:${sourceId}`,
                    "popup=yes,width=1200,height=900"
                );
            },
        });

        app.commands.addCommand(refreshGalleryCommand, {
            label: "Clio: Refresh Gallery",
            isEnabled: () => Boolean(getActiveNotebook()),
            execute: () => refreshGallery(),
        });

        notebooks.currentChanged.connect((_: INotebookTracker, current: NotebookPanel | null) => {
            if (popupSourceId) {
                return;
            }

            const change = current ? scanNotebook(current) : "none";
            updateViews(current ?? undefined, change === "images");
        });

        palette?.addItem({ command: openGalleryCommand, category: "Notebook" });
        palette?.addItem({
            command: openGalleryInSidePanelCommand,
            category: "Notebook",
        });
        palette?.addItem({
            command: openGalleryInNewWindowCommand,
            category: "Notebook",
        });
        palette?.addItem({ command: refreshGalleryCommand, category: "Notebook" });

        if (isExternalGallery) {
            void app.restored.then(() => openGallery());
        }
    },
};

export default plugin;
