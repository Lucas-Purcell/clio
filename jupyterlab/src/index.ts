import {
    JupyterFrontEnd,
    JupyterFrontEndPlugin,
} from "@jupyterlab/application";
import { ICommandPalette, MainAreaWidget } from "@jupyterlab/apputils";
import { IDefaultFileBrowser } from "@jupyterlab/filebrowser";
import { INotebookTracker, NotebookPanel } from "@jupyterlab/notebook";
import {
    FigureRecord,
    imageStore,
    NotebookFigures,
    figureRegistry,
} from "@clio/shared";
import { FigureExplorerSidebar } from "./figureExplorerSidebar";
import { FigureExplorerWidget } from "./figureExplorerWidget";
import { clioIcon } from "./icon";
import {
    figureImageInputs,
    notebookJson,
    sameFigureImageInputs,
    scanNotebookJson,
    type FigureImageInput,
} from "./notebookScanner";
import "../style/index.css";

const openGalleryCommand = "figure-explorer:open-gallery";
const openGalleryInSidePanelCommand = "figure-explorer:open-gallery-in-side-panel";
const openGalleryInNewWindowCommand = "figure-explorer:open-gallery-in-new-window";
const refreshGalleryCommand = "figure-explorer:refresh-gallery";
const galleryWindowQuery = "figureExplorerGallery";
const galleryWindowSourceQuery = "figureExplorerSource";

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
    images: readonly { id: string; data: string }[];
    currentNotebookUri?: string;
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

type GalleryWindowMessage =
    | GalleryWindowCatalog
    | GalleryWindowReady
    | GalleryWindowReveal
    | GalleryWindowSelect
    | GalleryWindowShowNotebook
    | GalleryWindowClosed;

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
    description: "Clio: browse PNG figures generated in Jupyter notebooks.",
    autoStart: true,
    requires: [INotebookTracker, IDefaultFileBrowser],
    optional: [ICommandPalette],
    activate: (app, notebooks, fileBrowser, palette) => {
        let gallery: MainAreaWidget<FigureExplorerWidget> | undefined;
        let sideGallery: FigureExplorerWidget | undefined;
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;
        const notebookImageInputs = new Map<string, readonly FigureImageInput[]>();
        let galleryWindowChannel: BroadcastChannel | undefined;
        let externalGalleryWindow: Window | null | undefined;
        let externalGalleryConnected = false;
        const popupSourceId = galleryWindowSourceId();
        const isExternalGallery = Boolean(popupSourceId || window.opener);

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
                return;
            }

            panel.content.activeCellIndex = figure.cellIndex;
            (panel.content as unknown as { scrollToItem?(index: number): void })
                .scrollToItem?.(figure.cellIndex);
        };

        const scanNotebook = (panel: NotebookPanel, force = false): boolean => {
            const notebookUri = panel.context.path;
            const notebookName = notebookUri.split("/").pop() ?? notebookUri;
            const notebook = notebookJson(panel.context.model);
            const inputs = figureImageInputs(notebook);

            if (!force && sameFigureImageInputs(notebookImageInputs.get(notebookUri), inputs)) {
                return false;
            }

            const figures = scanNotebookJson(
                notebook,
                notebookUri,
                notebookName
            );

            figureRegistry.setNotebook(notebookUri, notebookName, figures);
            notebookImageInputs.set(notebookUri, inputs);
            return true;
        };

        const scanOpenNotebooks = (): void => {
            notebooks.forEach((panel: NotebookPanel) => scanNotebook(panel));
        };

        let sidebar: FigureExplorerSidebar | undefined;

        const hasExternalGallery = (): boolean =>
            externalGalleryConnected &&
            (!externalGalleryWindow || !externalGalleryWindow.closed);

        const sendGalleryWindowCatalog = (
            current = getActiveNotebook()
        ): void => {
            if (!galleryWindowChannel || popupSourceId) {
                return;
            }

            const notebooks = figureRegistry.getNotebooks();
            const images = notebooks.flatMap((notebook) =>
                notebook.figures.flatMap((figure) => {
                    const bytes = imageStore.get(figure.id);
                    return bytes
                        ? [{ id: figure.id, data: encodeImage(bytes) }]
                        : [];
                })
            );

            const message: GalleryWindowCatalog = {
                type: "catalog",
                notebooks,
                images,
                currentNotebookUri: current?.context.path,
            };
            galleryWindowChannel.postMessage(message);
        };

        const updateViews = (current = getActiveNotebook()): void => {
            const allNotebooks = figureRegistry.getNotebooks();
            sidebar?.setNotebooks(allNotebooks);

            if (gallery && !gallery.isDisposed) {
                gallery.content.setNotebooks(allNotebooks, current?.context.path);
            }

            if (sideGallery && !sideGallery.isDisposed) {
                sideGallery.setNotebooks(allNotebooks, current?.context.path);
            }

            sendGalleryWindowCatalog(current);
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
                let changed = false;

                if (changedPanel && !changedPanel.isDisposed) {
                    changed = scanNotebook(changedPanel);
                }

                if (changed) {
                    updateViews();
                }
            }, 150);
        };

        const observeNotebook = (panel: NotebookPanel): void => {
            scanNotebook(panel);
            updateViews();
            panel.context.model.contentChanged.connect(() => scheduleRefresh(panel));
            panel.disposed.connect(() => {
                figureRegistry.removeNotebook(panel.context.path);
                notebookImageInputs.delete(panel.context.path);
                updateViews();
            });
        };

        const ensureGallery = (): MainAreaWidget<FigureExplorerWidget> => {
            if (!gallery || gallery.isDisposed) {
                gallery = new MainAreaWidget({
                    content: new FigureExplorerWidget(
                        revealCell,
                        popupSourceId ? "all" : "notebook",
                        isExternalGallery
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
                sideGallery = new FigureExplorerWidget(revealCell);
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

            if (message.type !== "catalog" || !popupSourceId) {
                return;
            }

            for (const notebook of figureRegistry.getNotebooks()) {
                figureRegistry.removeNotebook(notebook.uri);
            }
            imageStore.clear();

            for (const notebook of message.notebooks) {
                figureRegistry.setNotebook(
                    notebook.uri,
                    notebook.name,
                    notebook.figures
                );
            }

            for (const image of message.images) {
                imageStore.put(image.id, decodeImage(image.data));
            }

            const allNotebooks = figureRegistry.getNotebooks();
            sidebar?.setNotebooks(allNotebooks);
            if (gallery && !gallery.isDisposed) {
                gallery.content.setNotebooks(
                    allNotebooks,
                    message.currentNotebookUri
                );
            }
            if (sideGallery && !sideGallery.isDisposed) {
                sideGallery.setNotebooks(
                    allNotebooks,
                    message.currentNotebookUri
                );
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

        notebooks.currentChanged.connect(() => scheduleRefresh());

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
