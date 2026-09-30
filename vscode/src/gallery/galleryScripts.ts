/// <reference lib="dom" />

interface GalleryFigure {
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

interface GalleryCatalogMessage {
    type: "setCatalog";
    figures: GalleryFigure[];
    selectedKey?: string;
    scope: "notebook" | "all" | "starred" | "selected";
    notebookName?: string;
    notebooks?: Array<{ uri: string; name: string; kind: string }>;
    selectedSourceUris?: string[];
    activeSourceUri?: string;
    totalFigures: number;
    settings?: GallerySettings;
    historyMode?: boolean;
}

interface GalleryThumbnailMessage {
    type: "thumbnail";
    key: string;
    mimeType: string;
    data: string;
    version: string;
}

interface GalleryPreviewMessage {
    type: "preview";
    key: string;
    mimeType: string;
    data: string;
    version: string;
}

interface GallerySettings {
    buttonStyle: "icons" | "labels";
    thumbnailSize: "small" | "medium" | "large";
    compareLayout: "auto" | "grid" | "stack";
    previewBackground: "transparent" | "white";
}

interface GallerySettingsMessage {
    type: "setSettings";
    settings: GallerySettings;
}

type GalleryWebviewMessage =
    | GalleryCatalogMessage
    | GalleryThumbnailMessage
    | GalleryPreviewMessage
    | GallerySettingsMessage
    | { type: "revalidatePreview" };

interface GalleryVsCodeMessage {
    type:
        | "webviewReady"
        | "requestThumbnail"
        | "requestPreview"
        | "selectFigure"
        | "setScope"
        | "setSelectedSources"
        | "scanSource"
        | "toggleStar"
        | "setStars"
        | "enterHistory"
        | "exitHistory"
        | "copyVersionCode"
        | "restoreVersionCode"
        | "revealCell"
        | "savePNG"
        | "download"
        | "exportPdf"
        | "copyImage"
        | "exportAllPng"
        | "exportAllPdf"
        | "updateSettings";

    key?: string;

    keys?: string[];

    scope?: "notebook" | "all" | "starred" | "selected";

    uris?: string[];

    kind?: "notebook" | "images" | "folder";

    pngData?: string;

    settings?: GallerySettings;

    starred?: boolean;
}

interface VsCodeApi {
    postMessage(message: GalleryVsCodeMessage): void;
    getState(): { editorPaneRatio?: number } | undefined;
    setState(state: { editorPaneRatio?: number }): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const imageIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 18 5-5 3.5 3.5 2.5-2.5 5.5 5.5"/></svg>';
const pdfIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5"/><text x="7" y="16" textLength="10" lengthAdjust="spacingAndGlyphs">PDF</text></svg>';
const saveIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 20v-6h8v6"/></svg>';
const fullscreenIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
const historyIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/><path d="M5.5 5.5 3 8V3h5"/></svg>';

interface FigureFocusState {
    viewport: HTMLElement;
    parent: Node;
    nextSibling: ChildNode | null;
    overlay: HTMLDivElement;
}

let focusedFigure: FigureFocusState | undefined;

function exitFigureFullscreen(): void {
    if (!focusedFigure) {
        return;
    }

    const { viewport, parent, nextSibling, overlay } = focusedFigure;
    if (nextSibling?.parentNode === parent) {
        parent.insertBefore(viewport, nextSibling);
    } else {
        parent.appendChild(viewport);
    }
    overlay.remove();
    focusedFigure = undefined;
}

function toggleFigureFullscreen(viewport: HTMLElement): void {
    if (focusedFigure?.viewport === viewport) {
        exitFigureFullscreen();
        return;
    }

    exitFigureFullscreen();
    const overlay = document.createElement("div");
    overlay.className = "figure-focus-overlay";
    const parent = viewport.parentNode;

    if (!parent) {
        return;
    }

    focusedFigure = {
        viewport,
        parent,
        nextSibling: viewport.nextSibling,
        overlay,
    };
    document.body.append(overlay);
    overlay.append(viewport);
}

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && focusedFigure) {
        event.preventDefault();
        exitFigureFullscreen();
    }
});

let catalog: GalleryFigure[] = [];
let selectedKey: string | undefined;
let scope: "notebook" | "all" | "starred" | "selected" = "notebook";
const sourcePicker = document.getElementById("notebook-picker") as HTMLElement;
const sourcePickerButton = document.getElementById("source-picker-button") as HTMLButtonElement;
const sourcePickerLabel = document.getElementById("source-picker-label") as HTMLElement;
const sourcePickerPanel = document.getElementById("source-picker-panel") as HTMLElement;
let sourceOptions: Array<{ uri: string; name: string; kind: string }> = [];
let selectedSourceUris = new Set<string>();
let activeSourceUri: string | undefined;
let titleFilter: "all" | "titled" | "untitled" = "all";
let activeTags: string[] = [];

let selectedKeys: string[] = [];
let selectionAnchorKey: string | undefined;
let comparisonMode = false;
let historyMode = false;
let gallerySettings: GallerySettings = {
    buttonStyle: "icons",
    thumbnailSize: "medium",
    compareLayout: "auto",
    previewBackground: "transparent",
};

const previewImages =
    new Map<string, string>();

const MAX_CONCURRENT_THUMBNAIL_LOADS = 4;
const MAX_THUMBNAIL_SIDE = 320;
const queuedThumbnails = new Map<string, HTMLImageElement>();
const loadingThumbnailKeys = new Set<string>();
const thumbnailUrls = new Map<string, { url: string; version: string }>();



let pendingCopyKey: string | undefined;
const pendingPdfKeys = new Set<string>();
const pendingDownloadKeys = new Set<string>();


let isGalleryDragging = false;
let galleryDragStartX = 0;
let galleryDragStartY = 0;
let galleryDragAdditive = false;

let selectionRectangle: HTMLDivElement | undefined;
/* ─────────────────────────────────────────────
   Preview zoom / pan
   ───────────────────────────────────────────── */

let previewZoom = 1;
let previewPanX = 0;
let previewPanY = 0;

let previewDragging = false;
let previewDragStartX = 0;
let previewDragStartY = 0;
let previewDragPanX = 0;
let previewDragPanY = 0;

const MIN_PREVIEW_ZOOM = 1;
const MAX_PREVIEW_ZOOM = 8;
const ZOOM_FACTOR = 1.08;

interface ComparisonImageTransform {
    zoom: number;
    panX: number;
    panY: number;
}

const comparisonTransforms =
    new Map<string, ComparisonImageTransform>();

const comparisonCardSizes = new Map<string, number>();

let comparisonDragging = false;
let comparisonDragKey: string | undefined;
let comparisonDragStartX = 0;
let comparisonDragStartY = 0;
let comparisonDragPanX = 0;
let comparisonDragPanY = 0;

/* ─────────────────────────────────────────────
   DOM elements
   ───────────────────────────────────────────── */

const search =
    getElement<HTMLInputElement>("#search");

const clearSearch =
    getElement<HTMLButtonElement>("#clear-search");

const activeFilters =
    getElement<HTMLDivElement>("#active-filters");

const addTag =
    getElement<HTMLButtonElement>("#add-tag");

const tagPanel =
    getElement<HTMLDivElement>("#tag-panel");

const title =
    getElement<HTMLHeadingElement>("#title");

const count =
    getElement<HTMLSpanElement>("#count");

const thumbnails =
    getElement<HTMLElement>("#thumbnails");

const galleryDivider =
    getElement<HTMLElement>("#gallery-divider");

const preview =
    getElement<HTMLElement>("#preview");

const source =
    getElement<HTMLElement>("#source");

const reveal =
    getElement<HTMLButtonElement>("#reveal");

const downloadSelected =
    getElement<HTMLButtonElement>("#download-selected");

const starSelected =
    getElement<HTMLButtonElement>("#star-selected");

const exitHistory =
    getElement<HTMLButtonElement>("#exit-history");

const scanButton =
    getElement<HTMLButtonElement>("#scan-button");

const scanPanel =
    getElement<HTMLElement>("#scan-panel");

const filtersButton =
    getElement<HTMLButtonElement>("#filters-button");

const filterPanel =
    getElement<HTMLElement>("#filter-panel");

const compare =
    getElement<HTMLButtonElement>("#compare");

const settingsButton =
    getElement<HTMLButtonElement>("#settings-button");

const settingsPanel =
    getElement<HTMLElement>("#settings-panel");

if (
    !thumbnails ||
    !galleryDivider ||
    !search ||
    !clearSearch ||
    !activeFilters ||
    !addTag ||
    !tagPanel ||
    !title ||
    !count ||
    !preview ||
    !source ||
    !reveal ||
    !downloadSelected ||
    !starSelected ||
    !exitHistory ||
    !compare ||
    !settingsButton ||
    !settingsPanel ||
    !filtersButton ||
    !filterPanel ||
    !scanButton ||
    !scanPanel ||
    !sourcePicker ||
    !sourcePickerButton ||
    !sourcePickerLabel ||
    !sourcePickerPanel
) {
    throw new Error("Clio gallery DOM is incomplete.");
}

function setEditorPaneRatio(ratio: number, remember = false): void {
    if (!document.body.classList.contains("editor-mode")) {
        return;
    }

    const bodyWidth = document.body.clientWidth;
    if (bodyWidth <= 0) {
        return;
    }
    const availableWidth =
        bodyWidth - galleryDivider.getBoundingClientRect().width;
    const minimumPreview = Math.min(280, availableWidth * 0.4);
    const minimumFigures = Math.min(220, availableWidth * 0.4);
    const minimumRatio = minimumPreview / bodyWidth;
    const maximumRatio =
        (availableWidth - minimumFigures) / bodyWidth;
    const nextRatio = Math.max(
        minimumRatio,
        Math.min(maximumRatio, ratio)
    );

    document.body.style.setProperty(
        "--editor-preview-width",
        `${(nextRatio * 100).toFixed(2)}%`
    );
    galleryDivider.setAttribute("aria-valuemin", String(Math.round(minimumRatio * 100)));
    galleryDivider.setAttribute("aria-valuemax", String(Math.round(maximumRatio * 100)));
    galleryDivider.setAttribute("aria-valuenow", String(Math.round(nextRatio * 100)));

    if (remember) {
        vscode.setState({
            ...(vscode.getState() ?? {}),
            editorPaneRatio: nextRatio,
        });
    }
}

if (document.body.classList.contains("editor-mode")) {
    const rememberedRatio = vscode.getState()?.editorPaneRatio;
    setEditorPaneRatio(
        typeof rememberedRatio === "number" && Number.isFinite(rememberedRatio)
            ? rememberedRatio
            : 0.65
    );

    galleryDivider.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || document.body.classList.contains("comparison-mode")) {
            return;
        }

        event.preventDefault();
        galleryDivider.setPointerCapture(event.pointerId);
        galleryDivider.classList.add("resizing");
        document.body.classList.add("resizing-gallery-panes");
    });

    galleryDivider.addEventListener("pointermove", (event) => {
        if (!galleryDivider.hasPointerCapture(event.pointerId)) {
            return;
        }

        const left = document.body.getBoundingClientRect().left;
        setEditorPaneRatio(
            (event.clientX - left) / document.body.clientWidth
        );
    });

    const finishResize = (event: PointerEvent): void => {
        if (!galleryDivider.hasPointerCapture(event.pointerId)) {
            return;
        }
        galleryDivider.releasePointerCapture(event.pointerId);
        galleryDivider.classList.remove("resizing");
        document.body.classList.remove("resizing-gallery-panes");
        const value = parseFloat(
            document.body.style.getPropertyValue("--editor-preview-width")
        );
        setEditorPaneRatio(value / 100, true);
    };
    galleryDivider.addEventListener("pointerup", finishResize);
    galleryDivider.addEventListener("pointercancel", finishResize);

    galleryDivider.addEventListener("dblclick", () => {
        setEditorPaneRatio(0.65, true);
    });

    galleryDivider.addEventListener("keydown", (event) => {
        const current =
            parseFloat(galleryDivider.getAttribute("aria-valuenow") ?? "65") / 100;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setEditorPaneRatio(
                current + (event.key === "ArrowRight" ? 0.025 : -0.025),
                true
            );
        } else if (event.key === "Home") {
            event.preventDefault();
            setEditorPaneRatio(0.65, true);
        }
    });

    window.addEventListener("resize", () => {
        const current =
            parseFloat(galleryDivider.getAttribute("aria-valuenow") ?? "65") / 100;
        setEditorPaneRatio(current);
    });
}

setupGalleryDragSelection();

function applyGallerySettings(settings: GallerySettings): void {
    gallerySettings = {
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

    document.body.classList.toggle(
        "button-style-labels",
        gallerySettings.buttonStyle === "labels"
    );
    document.body.dataset.thumbnailSize = gallerySettings.thumbnailSize;
    document.body.dataset.previewBackground = gallerySettings.previewBackground;

    settingsPanel.querySelectorAll<HTMLButtonElement>("[data-setting]")
        .forEach((button) => {
            const setting = button.dataset.setting as keyof GallerySettings | undefined;
            button.classList.toggle(
                "active",
                Boolean(setting && button.dataset.value === gallerySettings[setting])
            );
        });

    if (comparisonMode) {
        renderComparison();
    }
}

function closeSettings(): void {
    settingsPanel.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
}

function positionPopup(popup: HTMLElement, anchor: HTMLElement): void {
    const margin = 8;
    const gap = 5;
    const anchorBounds = anchor.getBoundingClientRect();
    const availableBelow = window.innerHeight - anchorBounds.bottom - margin - gap;
    const availableAbove = anchorBounds.top - margin - gap;
    const openAbove = availableBelow < 96 && availableAbove > availableBelow;

    popup.style.position = "fixed";
    popup.style.right = "auto";
    popup.style.maxWidth = `${Math.max(0, window.innerWidth - margin * 2)}px`;
    popup.style.maxHeight = `${Math.max(0, Math.min(240, openAbove ? availableAbove : availableBelow))}px`;
    popup.style.left = "0";
    popup.style.top = "0";

    const popupBounds = popup.getBoundingClientRect();
    const left = Math.max(
        margin,
        Math.min(anchorBounds.left, window.innerWidth - popupBounds.width - margin)
    );
    const top = openAbove
        ? Math.max(margin, anchorBounds.top - popupBounds.height - gap)
        : Math.min(
            Math.max(margin, anchorBounds.bottom + gap),
            window.innerHeight - popupBounds.height - margin
        );

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

function positionOpenPopups(): void {
    if (tagPanel.classList.contains("open")) {
        positionPopup(tagPanel, addTag);
    }

    if (filterPanel.classList.contains("open")) {
        positionPopup(filterPanel, filtersButton);
    }

    if (scanPanel.classList.contains("open")) {
        positionPopup(scanPanel, scanButton);
    }

    if (!settingsPanel.hidden) {
        positionPopup(settingsPanel, settingsButton);
    }

    if (sourcePickerPanel.classList.contains("open")) {
        positionPopup(sourcePickerPanel, sourcePickerButton);
    }
}

settingsButton.setAttribute("aria-expanded", "false");
settingsButton.addEventListener("click", () => {
    const opening = settingsPanel.hidden;
    if (opening) closeScanMenu();
    settingsPanel.hidden = !opening;
    settingsButton.setAttribute("aria-expanded", String(opening));

    if (opening) {
        requestAnimationFrame(() => positionPopup(settingsPanel, settingsButton));
    }
});

settingsPanel.querySelectorAll<HTMLButtonElement>("[data-setting]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const setting = button.dataset.setting as keyof GallerySettings | undefined;
            const value = button.dataset.value;

            if (!setting || !value) {
                return;
            }

            const settings = { ...gallerySettings, [setting]: value } as GallerySettings;
            applyGallerySettings(settings);
            vscode.postMessage({ type: "updateSettings", settings });
        });
    });

document.addEventListener("pointerdown", (event) => {
    const target = event.target as Node;
    if (!settingsPanel.hidden && !settingsPanel.contains(target) && !settingsButton.contains(target)) {
        closeSettings();
    }
});

window.addEventListener("resize", positionOpenPopups);

/* ─────────────────────────────────────────────
   Lazy thumbnail loading
   ───────────────────────────────────────────── */

const thumbnailObserver =
    new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {

            entries.forEach((entry) => {

                if (!entry.isIntersecting) {
                    return;
                }

                const img =
                    entry.target as HTMLImageElement;

                if (img.dataset.loaded === "1") {
                    return;
                }

                const key = img.dataset.key;

                if (!key) {
                    return;
                }

                queueThumbnailLoad(key, img);

                thumbnailObserver.unobserve(img);
            });
        },
        {
            root: thumbnails,
            threshold: 0.05,
        }
    );


/* ─────────────────────────────────────────────
   Messages from extension
   ───────────────────────────────────────────── */

window.addEventListener(
    "message",
    (event: MessageEvent<GalleryWebviewMessage>) => {
        const message = event.data;

        if (message.type === "revalidatePreview") {
            requestCurrentPreview();
            return;
        }

        if (message.type === "setSettings") {
            applyGallerySettings(message.settings);
            return;
        }

        if (message.type === "thumbnail") {
            const img =
                document.querySelector<HTMLImageElement>(
                    `img[data-key="${CSS.escape(message.key)}"]`
                );

            if (!img) {
                finishThumbnailLoad(message.key);
                return;
            }

            void setThumbnailImage(
                img,
                message.key,
                message.mimeType,
                message.data,
                message.version
            );

            return;
        }

        if (message.type === "preview") {
            const imageData =
                "data:" +
                message.mimeType +
                ";base64," +
                message.data;

            previewImages.set(
                message.key,
                imageData
            );

            if (pendingCopyKey === message.key) {
                pendingCopyKey = undefined;

                void copyImageToClipboard(
                    imageData,
                    message.mimeType
                );
            }

            if (pendingPdfKeys.delete(message.key)) {
                void postPdfExport(message.key);
            }

            if (pendingDownloadKeys.delete(message.key)) {
                void postDownload(message.key);
            }

            if (comparisonMode) {
                renderComparison();
                return;
            }

            if (message.key !== selectedKey) {
                return;
            }

            const img =
                document.querySelector<HTMLImageElement>(
                    "#preview-image"
                );

            if (!img) {
                return;
            }

            img.classList.remove("loaded");

            img.onload = () => {
                img.classList.add("loaded");

                clampPreviewPan();
                applyPreviewTransform();
            };

            img.src = imageData;

            return;
        }

        if (message.type !== "setCatalog") {
            return;
        }

        if (message.settings) {
            applyGallerySettings(message.settings);
        }

        pruneThumbnailUrls(message.figures);

        const previousVersions = new Map(
            catalog.map((figure) => [figure.key, figure.version])
        );

        const nextVersions = new Map(
            message.figures.map((figure) => [figure.key, figure.version])
        );

        for (const [key] of previewImages) {
            if (previousVersions.get(key) !== nextVersions.get(key)) {
                previewImages.delete(key);
            }
        }

        catalog = message.figures;
        selectedKey = message.selectedKey;
        const availableKeys = new Set(catalog.map((figure) => figure.key));
        selectedKeys = selectedKeys.filter((key) => availableKeys.has(key));
        if (selectionAnchorKey && !availableKeys.has(selectionAnchorKey)) {
            selectionAnchorKey = selectedKey;
        }
        if (comparisonMode && selectedKeys.length < 2) {
            exitComparisonMode();
        }
        scope = message.scope;
        sourceOptions = message.notebooks ?? [];
        activeSourceUri = message.activeSourceUri;
        selectedSourceUris = scope === "all"
            ? new Set(sourceOptions.map((source) => source.uri))
            : scope === "notebook" && activeSourceUri
                ? new Set([activeSourceUri])
                : scope === "selected"
                    ? new Set(message.selectedSourceUris ?? [])
                    : new Set();
        renderSourcePicker();
        historyMode = Boolean(message.historyMode);
        document.body.classList.toggle("history-mode", historyMode);
        exitHistory.hidden = !historyMode;

        title.textContent =
            historyMode
                ? "Figure history"
                : scope === "all"
                    ? "All scanned sources"
                    : scope === "starred"
                        ? "Starred figures"
                        : message.notebookName || "Clio";

        render();
    }
);

// VS Code can discard and recreate a background webview. The extension host
// retains the figures, but this page's image caches begin empty after revival.
vscode.postMessage({ type: "webviewReady" });

/* ─────────────────────────────────────────────
   Search
   ───────────────────────────────────────────── */

search.addEventListener("input", () => {
    updateSearchUI();
    render();
});

clearSearch.addEventListener("click", () => {
    search.value = "";
    updateSearchUI();
    search.focus();
    render();
});

/* ─────────────────────────────────────────────
   Scope
   ───────────────────────────────────────────── */

document
    .querySelectorAll<HTMLButtonElement>(".scope")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const buttonScope = button.dataset.scope;

            if (
                buttonScope !== "notebook" &&
                buttonScope !== "all" &&
                buttonScope !== "starred"
            ) {
                return;
            }

            vscode.postMessage({
                type: "setScope",
                scope: buttonScope,
            });
        });
    });

function closeSourcePicker(): void {
    sourcePickerPanel.classList.remove("open");
    sourcePickerButton.setAttribute("aria-expanded", "false");
}

function renderSourcePicker(): void {
    sourcePickerButton.disabled = sourceOptions.length === 0;
    if (sourcePickerButton.disabled) closeSourcePicker();

    const selected = sourceOptions.filter((source) => selectedSourceUris.has(source.uri));
    const label = scope === "starred"
        ? "Choose sources…"
        : scope === "all"
            ? "All sources"
            : selected.length === 0
                ? "No sources"
                : selected.length === 1
                    ? selected[0].name
                    : `${selected.length} sources`;
    sourcePickerLabel.textContent = label;
    sourcePickerButton.title = `Choose scanned sources: ${label}`;

    const focusedUri = document.activeElement instanceof HTMLInputElement
        ? document.activeElement.dataset.sourceUri : undefined;
    const actions = document.createElement("div");
    actions.className = "source-picker-actions";
    const all = document.createElement("button");
    all.type = "button";
    all.textContent = "All sources";
    all.addEventListener("click", () => {
        vscode.postMessage({ type: "setScope", scope: "all" });
    });
    const none = document.createElement("button");
    none.type = "button";
    none.textContent = "None";
    none.addEventListener("click", () => {
        selectedSourceUris = new Set();
        scope = "selected";
        renderSourcePicker();
        vscode.postMessage({ type: "setSelectedSources", uris: [] });
    });
    actions.append(all, none);
    const rows = sourceOptions.map((source) => {
        const row = document.createElement("label");
        row.className = "source-picker-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.sourceUri = source.uri;
        checkbox.checked = selectedSourceUris.has(source.uri);
        checkbox.addEventListener("change", () => {
            const next = new Set(selectedSourceUris);
            if (checkbox.checked) next.add(source.uri);
            else next.delete(source.uri);
            selectedSourceUris = next;
            scope = "selected";
            renderSourcePicker();
            vscode.postMessage({ type: "setSelectedSources", uris: [...next] });
        });
        const name = document.createElement("span");
        name.textContent = source.name;
        name.title = source.uri;
        row.append(checkbox, name);
        return row;
    });
    sourcePickerPanel.replaceChildren(actions, ...rows);
    if (focusedUri && sourcePickerPanel.classList.contains("open")) {
        const focused = [...sourcePickerPanel.querySelectorAll<HTMLInputElement>("input[data-source-uri]")]
            .find((input) => input.dataset.sourceUri === focusedUri);
        focused?.focus();
    }
}

sourcePickerButton.addEventListener("click", () => {
    const opening = !sourcePickerPanel.classList.contains("open");
    if (opening) {
        filterPanel.classList.remove("open");
        tagPanel.classList.remove("open");
        closeSettings();
        closeScanMenu();
    }
    sourcePickerPanel.classList.toggle("open", opening);
    sourcePickerButton.setAttribute("aria-expanded", String(opening));
    if (opening) requestAnimationFrame(() => positionPopup(sourcePickerPanel, sourcePickerButton));
});

sourcePickerButton.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSourcePicker();
});

document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node && !sourcePicker.contains(event.target) &&
        !sourcePickerPanel.contains(event.target)) {
        closeSourcePicker();
    }
});
sourcePickerPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        event.preventDefault();
        closeSourcePicker();
        sourcePickerButton.focus();
    }
});

/* ─────────────────────────────────────────────
   Scan menu
   ───────────────────────────────────────────── */

function closeScanMenu(): void {
    scanPanel.classList.remove("open");
    scanButton.setAttribute("aria-expanded", "false");
}

scanButton.addEventListener("click", () => {
    const opening = !scanPanel.classList.contains("open");
    scanPanel.classList.toggle("open", opening);
    scanButton.setAttribute("aria-expanded", String(opening));
    if (opening) {
        filterPanel.classList.remove("open");
        tagPanel.classList.remove("open");
        closeSourcePicker();
        closeSettings();
        requestAnimationFrame(() => positionPopup(scanPanel, scanButton));
    }
});

scanPanel.querySelectorAll<HTMLButtonElement>("[data-scan-kind]").forEach((button) => {
    button.addEventListener("click", () => {
        const kind = button.dataset.scanKind;
        if (kind !== "notebook" && kind !== "images" && kind !== "folder") return;
        closeScanMenu();
        vscode.postMessage({ type: "scanSource", kind });
    });
});

document.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Node &&
        !scanPanel.contains(event.target) &&
        !scanButton.contains(event.target)) {
        closeScanMenu();
    }
});

scanButton.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeScanMenu();
});

scanPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        event.preventDefault();
        closeScanMenu();
        scanButton.focus();
    }
});

/* ─────────────────────────────────────────────
   Filter menu
   ───────────────────────────────────────────── */

function positionFilterPanel(): void {
    positionPopup(filterPanel, filtersButton);
}

filtersButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const willOpen = !filterPanel.classList.contains("open");
    filterPanel.classList.toggle("open", willOpen);

    if (willOpen) {
        requestAnimationFrame(positionFilterPanel);
    } else {
        filterPanel.classList.remove("open-left");
    }
});

document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Node)) {
        return;
    }

    if (
        !filterPanel.contains(target) &&
        !filtersButton.contains(target)
    ) {
        filterPanel.classList.remove("open");
        filterPanel.classList.remove("open-left");
    }
});

document
    .querySelectorAll<HTMLButtonElement>(".filter-option")
    .forEach((button) => {
        button.addEventListener("click", () => {
            const filter = button.dataset.filter;

            if (
                filter !== "all" &&
                filter !== "titled" &&
                filter !== "untitled"
            ) {
                return;
            }

            titleFilter = filter;

            filterPanel.classList.remove("open");
            filterPanel.classList.remove("open-left");

            render();
        });
    });

/* ─────────────────────────────────────────────
   Tag filters
   ───────────────────────────────────────────── */

addTag.addEventListener("click", (event) => {
    event.stopPropagation();

    renderTagPanel();
    const willOpen = !tagPanel.classList.contains("open");
    tagPanel.classList.toggle("open", willOpen);

    if (willOpen) {
        requestAnimationFrame(() => positionPopup(tagPanel, addTag));
    }
});

document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Node)) {
        return;
    }

    if (
        !tagPanel.contains(target) &&
        target !== addTag
    ) {
        tagPanel.classList.remove("open");
    }
});

function renderTagPanel(): void {
    const tags = Array.from(
        new Set(
            catalog.flatMap(
                (figure) => figure.tags || []
            )
        )
    ).sort((a, b) => a.localeCompare(b));

    if (tags.length === 0) {
        tagPanel.innerHTML =
            '<div class="tag-empty">No tags available</div>';

        return;
    }

    tagPanel.innerHTML = tags
        .map((tag) => {
            const active = activeTags.some(
                (activeTag) =>
                    activeTag.toLowerCase() ===
                    tag.toLowerCase()
            );

            return (
                '<button ' +
                'class="tag-option' +
                (active ? " active" : "") +
                '" ' +
                'type="button" ' +
                'data-tag="' +
                escapeHtml(tag) +
                '"' +
                (active ? " disabled" : "") +
                '>' +
                escapeHtml(tag) +
                "</button>"
            );
        })
        .join("");

    tagPanel
        .querySelectorAll<HTMLButtonElement>(
            ".tag-option:not(:disabled)"
        )
        .forEach((button) => {
            button.addEventListener("click", () => {
                const tag = button.dataset.tag;

                if (tag) {
                    addTagFilter(tag);
                }
            });
        });
}

function getElement<T extends HTMLElement>(
    selector: string
): T {
    const element = document.querySelector<T>(selector);

    if (!element) {
        throw new Error(
            `Gallery element not found: ${selector}`
        );
    }

    return element;
}

function addTagFilter(tag: string): void {
    const normalized = tag.trim().toLowerCase();

    if (!normalized) {
        return;
    }

    const alreadyActive = activeTags.some(
        (activeTag) =>
            activeTag.toLowerCase() === normalized
    );

    if (alreadyActive) {
        return;
    }

    activeTags.push(tag.trim());

    renderTagPanel();
    updateSearchUI();
    render();
}

function removeTagFilter(tag: string): void {
    activeTags = activeTags.filter(
        (activeTag) =>
            activeTag.toLowerCase() !==
            tag.toLowerCase()
    );

    renderTagPanel();
    updateSearchUI();
    render();
}

function queueThumbnailLoad(key: string, image: HTMLImageElement): void {
    if (image.dataset.loaded === "1" || loadingThumbnailKeys.has(key) || queuedThumbnails.has(key)) {
        return;
    }

    queuedThumbnails.set(key, image);
    pumpThumbnailQueue();
}

function pumpThumbnailQueue(): void {
    while (loadingThumbnailKeys.size < MAX_CONCURRENT_THUMBNAIL_LOADS && queuedThumbnails.size > 0) {
        const next = queuedThumbnails.entries().next().value as [string, HTMLImageElement] | undefined;

        if (!next) {
            return;
        }

        const [key, image] = next;
        queuedThumbnails.delete(key);

        if (!image.isConnected || image.dataset.loaded === "1") {
            continue;
        }

        loadingThumbnailKeys.add(key);
        vscode.postMessage({ type: "requestThumbnail", key });
    }
}

function finishThumbnailLoad(key: string): void {
    loadingThumbnailKeys.delete(key);
    pumpThumbnailQueue();
}

async function setThumbnailImage(
    image: HTMLImageElement,
    key: string,
    mimeType: string,
    data: string,
    version: string
): Promise<void> {
    if (image.dataset.figureVersion !== version) {
        finishThumbnailLoad(key);
        return;
    }

    const source = `data:${mimeType};base64,${data}`;

    try {
        const sourceBlob = await (await fetch(source)).blob();
        const bitmap = await createImageBitmap(sourceBlob);
        const scale = Math.min(1, MAX_THUMBNAIL_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();

        const thumbnailBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png")
        );

        if (!thumbnailBlob || image.dataset.figureVersion !== version) {
            finishThumbnailLoad(key);
            return;
        }

        const existing = thumbnailUrls.get(key);
        if (existing) {
            URL.revokeObjectURL(existing.url);
        }

        const url = URL.createObjectURL(thumbnailBlob);
        thumbnailUrls.set(key, { url, version });
        applyThumbnailSource(image, key, url);
    } catch {
        applyThumbnailSource(image, key, source);
    }
}

function applyThumbnailSource(image: HTMLImageElement, key: string, source: string): void {
    image.onload = () => {
        image.dataset.loaded = "1";
        finishThumbnailLoad(key);
    };
    image.onerror = () => finishThumbnailLoad(key);
    image.src = source;
}

function pruneThumbnailUrls(figures: readonly GalleryFigure[]): void {
    const versions = new Map(figures.map((figure) => [figure.key, figure.version]));

    for (const [key, cached] of thumbnailUrls) {
        if (versions.get(key) !== cached.version) {
            URL.revokeObjectURL(cached.url);
            thumbnailUrls.delete(key);
        }
    }
}

/* ─────────────────────────────────────────────
   Reveal
   ───────────────────────────────────────────── */

reveal.addEventListener("click", () => {
    vscode.postMessage({
        type: "revealCell",
    });
});

downloadSelected.addEventListener("click", () => {
    const keys = selectedKeys.filter((key) =>
        catalog.some((figure) => figure.key === key && figure.available)
    );
    if (keys.length > 1) {
        vscode.postMessage({ type: "exportAllPng", keys });
    } else if (keys[0]) {
        void postDownload(keys[0]);
    }
});

starSelected.addEventListener("click", () => {
    const figures = catalog.filter((figure) => selectedKeys.includes(figure.key));
    if (figures.length > 0) {
        const starred = figures.some((figure) => !figure.starred);
        vscode.postMessage({
            type: "setStars",
            keys: figures.map((figure) => figure.key),
            starred,
        });
    }
});

exitHistory.addEventListener("click", () => {
    vscode.postMessage({ type: "exitHistory" });
});

/* ─────────────────────────────────────────────
   Comparison mode
   ───────────────────────────────────────────── */

compare.addEventListener("click", () => {
    if (comparisonMode) {
        exitComparisonMode();
        return;
    }

    enterComparisonMode();
});

/* ─────────────────────────────────────────────
   Thumbnail selection
   ───────────────────────────────────────────── */

function selectThumbnail(key: string): void {
    selectedKey = key;
    selectedKeys = [key];
    selectionAnchorKey = key;

    renderThumbnailSelection();

    vscode.postMessage({
        type: "selectFigure",
        key,
    });

    if (!comparisonMode) {
        updatePreview();
    }
}

function selectHistoryVersion(direction: -1 | 1): void {
    if (!historyMode || !selectedKey) {
        return;
    }

    const index = catalog.findIndex((figure) => figure.key === selectedKey);
    const next = catalog[Math.max(0, Math.min(catalog.length - 1, index + direction))];

    if (next && next.key !== selectedKey) {
        const restoreFocusedPreview = Boolean(
            focusedFigure?.viewport.classList.contains(
                "preview-image-viewport"
            )
        );

        if (restoreFocusedPreview) {
            // Return the focused viewport to the preview before it is rebuilt.
            // Otherwise updatePreview cannot find or replace the visible image,
            // because the current viewport lives under the document overlay.
            exitFigureFullscreen();
        }

        selectThumbnail(next.key);

        if (restoreFocusedPreview) {
            const viewport = preview.querySelector<HTMLElement>(
                ".preview-image-viewport"
            );

            if (viewport) {
                toggleFigureFullscreen(viewport);
            }
        }

        thumbnails
            .querySelector<HTMLElement>(`.thumbnail[data-key="${CSS.escape(next.key)}"]`)
            ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
}

function toggleSelectedFigure(key: string): void {
    const index = selectedKeys.indexOf(key);

    if (index >= 0) {
        selectedKeys.splice(index, 1);

        /*
         * If the primary selection was removed,
         * use the last remaining selection as the
         * preview/current figure.
         */
        if (selectedKey === key) {
            selectedKey =
                selectedKeys[selectedKeys.length - 1];
        }
    } else {
        selectedKeys.push(key);
        selectedKey = key;
    }

    /*
     * Cmd/Ctrl-click becomes the new Shift-click
     * anchor.
     */
    selectionAnchorKey = key;

    renderThumbnailSelection();

    if (selectedKey) {
        vscode.postMessage({
            type: "selectFigure",
            key: selectedKey,
        });
    }

    if (!comparisonMode) {
        updatePreview();
    }
}

function selectFigureRange(key: string): void {
    const results = filteredCatalog();

    const clickedIndex =
        results.findIndex(
            (figure) => figure.key === key
        );

    if (clickedIndex === -1) {
        return;
    }

    const anchorKey =
        selectionAnchorKey || selectedKey;

    const anchorIndex =
        anchorKey
            ? results.findIndex(
                  (figure) =>
                      figure.key === anchorKey
              )
            : -1;

    if (anchorIndex === -1) {
        selectThumbnail(key);
        return;
    }

    const start =
        Math.min(anchorIndex, clickedIndex);

    const end =
        Math.max(anchorIndex, clickedIndex);

    selectedKeys = results
        .slice(start, end + 1)
        .map((figure) => figure.key);

    selectedKey = key;

    /*
     * Keep the original anchor so repeated Shift-clicks
     * behave like a file manager.
     */
    selectionAnchorKey = anchorKey;

    renderThumbnailSelection();

    vscode.postMessage({
        type: "selectFigure",
        key,
    });

    if (!comparisonMode) {
        updatePreview();
    }
}

function updateSelectionUI(): void {
    compare.disabled = selectedKeys.length < 2;
    const selected = catalog.filter((figure) => selectedKeys.includes(figure.key));
    downloadSelected.disabled = !selected.some((figure) => figure.available);
    starSelected.disabled = selected.length === 0 || historyMode;
    const shouldStar = selected.some((figure) => !figure.starred);
    starSelected.setAttribute("aria-pressed", String(selected.length > 0 && !shouldStar));
    const starLabel = `${shouldStar ? "Star" : "Unstar"} ${selected.length > 1 ? `${selected.length} figures` : "figure"}`;
    starSelected.title = starLabel;
    starSelected.setAttribute("aria-label", starLabel);
    const compareLabel = selectedKeys.length > 0
        ? "Compare " + selectedKeys.length + " selected figures"
        : "Compare selected figures";
    compare.title = compareLabel;
    compare.setAttribute("aria-label", compareLabel);

    compare.classList.toggle(
        "active",
        comparisonMode
    );
}

function renderThumbnailSelection(): void {
    document
        .querySelectorAll<HTMLButtonElement>(".thumbnail")
        .forEach((button) => {
            const key = button.dataset.key;

            if (!key) {
                return;
            }

            const isPrimary =
                key === selectedKey;

            const isSelected =
                selectedKeys.includes(key);

            button.classList.toggle(
                "selected",
                isPrimary
            );

            button.classList.toggle(
                "comparison-selected",
                isSelected
            );
            button.parentElement?.classList.toggle("selected", isPrimary);
            button.parentElement?.classList.toggle("comparison-selected", isSelected);
        });

    updateSelectionUI();
}

function updateComparisonUI(): void {
    compare.disabled = selectedKeys.length < 2;
    const selected = catalog.filter((figure) => selectedKeys.includes(figure.key));
    downloadSelected.disabled = !selected.some((figure) => figure.available);
    starSelected.disabled = selected.length === 0 || historyMode;
    const shouldStar = selected.some((figure) => !figure.starred);
    starSelected.setAttribute("aria-pressed", String(selected.length > 0 && !shouldStar));
    const starLabel = `${shouldStar ? "Star" : "Unstar"} ${selected.length > 1 ? `${selected.length} figures` : "figure"}`;
    starSelected.title = starLabel;
    starSelected.setAttribute("aria-label", starLabel);
    const compareLabel = selectedKeys.length > 0
        ? "Compare " + selectedKeys.length + " selected figures"
        : "Compare selected figures";
    compare.title = compareLabel;
    compare.setAttribute("aria-label", compareLabel);

    compare.classList.toggle(
        "active",
        comparisonMode
    );
}

function requestComparisonImages(): void {
    selectedKeys.forEach((key) => {
        if (!previewImages.has(key)) {
            vscode.postMessage({
                type: "requestPreview",
                key,
            });
        }
    });
}

function enterComparisonMode(): void {
    if (selectedKeys.length < 2) {
        return;
    }

    comparisonMode = true;

    document.body.classList.add(
        "comparison-mode"
    );

    thumbnails.style.display = "none";
    source.style.display = "none";

    requestComparisonImages();
    renderComparison();
    updateSelectionUI();
}

function exitComparisonMode(): void {
    comparisonMode = false;

    document.body.classList.remove(
        "comparison-mode"
    );

    thumbnails.style.display = "";
    source.style.display = "";

    updateSelectionUI();
    renderThumbnailSelection();
    updatePreview();
}

function renderComparison(): void {
    if (!comparisonMode) {
        return;
    }

    exitFigureFullscreen();

    const figures = selectedKeys
        .map((key) =>
            catalog.find(
                (figure) => figure.key === key
            )
        )
        .filter(
            (figure): figure is GalleryFigure =>
                figure !== undefined
        );

    if (figures.length < 2) {
        exitComparisonMode();
        return;
    }

    requestComparisonImages();

    source.innerHTML = "";

    const comparisonLayout = gallerySettings.compareLayout === "stack"
        ? "comparison-grid--force-stack"
        : gallerySettings.compareLayout === "grid"
            ? "comparison-grid--force-grid"
            : figures.length === 2
                ? "comparison-grid--resizable"
                : figures.length > 4
                    ? "comparison-grid--scrollable"
                    : "comparison-grid--stacked";
    const fullscreenAction =
        '<button class="comparison-fullscreen-figure icon-button" type="button" title="Focus figure" aria-label="Focus figure">' + fullscreenIcon + "</button>";

    preview.innerHTML =
        '<div class="comparison-header">' +
            "<div>" +
                "<h2>Figure Comparison</h2>" +
                '<span class="comparison-count">' +
                    figures.length +
                    " figures" +
                "</span>" +
            "</div>" +

            '<div class="comparison-header-actions">' +

                '<button id="export-all-png" type="button">' +
                    "Save all images" +
                "</button>" +

                '<button id="export-all-pdf" type="button">' +
                    "Export all PDF" +
                "</button>" +

                '<button id="exit-comparison" class="icon-button" type="button" title="Exit comparison" aria-label="Exit comparison">' +
                    "×" +
                "</button>" +

            "</div>" +

        "</div>" +

        '<div class="comparison-grid ' + comparisonLayout + '">' +
            figures
                .map((figure, index) => {
                    const figureTitle =
                        figure.title ||
                        "Figure " +
                        figure.number;

                    const image =
                        previewImages.get(
                            figure.key
                        );

                    const imageHtml = image
                        ? '<div class="comparison-image-viewport" ' +
                            'data-key="' +
                            escapeHtml(figure.key) +
                            '">' +
                            '<img class="comparison-image loaded" ' +
                            'src="' +
                            escapeHtml(image) +
                            '" ' +
                            'alt="' +
                            escapeHtml(figureTitle) +
                            '">' +
                            '<div class="image-hover-actions">' +
                                '<button class="comparison-reset-zoom" type="button" title="Reset zoom" aria-label="Reset zoom" data-key="' +
                                    escapeHtml(figure.key) +
                                    '">↻</button>' +
                                '<button class="comparison-action download-figure icon-button" type="button" title="Download figure" aria-label="Download figure" data-key="' +
                                    escapeHtml(figure.key) +
                                    '">' + saveIcon + '</button>' +
                                fullscreenAction +
                            "</div>" +
                            "</div>"
                        : '<div class="comparison-image-viewport">' +
                            '<div class="comparison-image-loading">' +
                            "Loading…" +
                            "</div>" +
                            "</div>";

                    const tags =
                        figure.tags || [];

                    const tagsHtml =
                        tags.length > 0
                            ? '<div class="tags">' +
                              tags
                                  .map(
                                      (tag) =>
                                          '<span class="tag">' +
                                          escapeHtml(
                                              tag
                                          ) +
                                          "</span>"
                                  )
                                  .join("") +
                              "</div>"
                            : "";

                    const comparisonSize =
                        comparisonCardSizes.get(figure.key) ?? 1;
                    const card =
                        '<article class="comparison-card" data-key="' +
                            escapeHtml(figure.key) +
                            '" style="--comparison-card-size: ' +
                            comparisonSize +
                            '">' +

                            imageHtml +

                            '<div class="comparison-card-content">' +

                                '<div class="comparison-card-header">' +

                                    '<h3>' +
                                        escapeHtml(figureTitle) +
                                    "</h3>" +

                                "</div>" +

                                tagsHtml +

                            "</div>" +

                        "</article>";

                    const nextFigure = figures[index + 1];
                    const divider = figures.length === 2 && nextFigure
                        ? '<div class="comparison-divider" role="separator" aria-orientation="vertical" title="Drag to resize figures" data-left-key="' +
                            escapeHtml(figure.key) +
                            '" data-right-key="' +
                            escapeHtml(nextFigure.key) +
                            '"></div>'
                        : "";

                    return card + divider;
                })
                .join("") +
        "</div>";
    
    preview
        .querySelectorAll<HTMLElement>(
            ".comparison-image-viewport[data-key]"
        )
        .forEach((viewport) => {
            const key =
                viewport.dataset.key;

            if (!key) {
                return;
            }

            const image =
                viewport.querySelector<HTMLImageElement>(
                    ".comparison-image"
                );

            if (!image) {
                return;
            }

            setupComparisonImageInteractions(
                key,
                viewport,
                image
            );
        });

    setupComparisonDividers();

    preview
        .querySelectorAll<HTMLButtonElement>(".comparison-reset-zoom")
        .forEach((button) => {
            button.addEventListener("pointerdown", (event) => event.stopPropagation());
            button.addEventListener("click", () => {
                const key = button.dataset.key;

                if (key) {
                    comparisonTransforms.delete(key);
                    renderComparison();
                }
            });
        });

    preview
        .querySelectorAll<HTMLButtonElement>(".image-hover-actions button")
        .forEach((button) => {
            button.addEventListener("pointerdown", (event) => event.stopPropagation());
        });

    preview
        .querySelectorAll<HTMLButtonElement>(
            ".comparison-action.download-figure"
        )
        .forEach((button) => {
            button.addEventListener("click", () => {
                const key = button.dataset.key;

                if (!key) {
                    return;
                }

                void postDownload(key);
            });
        });

    preview
        .querySelectorAll<HTMLButtonElement>(
            ".comparison-fullscreen-figure"
        )
        .forEach((button) => {
            button.addEventListener("click", () => {
                const viewport = button.closest<HTMLElement>(
                    ".comparison-image-viewport"
                );

                if (viewport) {
                    toggleFigureFullscreen(viewport);
                }
            });
        });

    const exportAllPng =
        document.querySelector<HTMLButtonElement>(
            "#export-all-png"
        );

    exportAllPng?.addEventListener("click", () => {
        if (selectedKeys.length === 0) {
            return;
        }

        vscode.postMessage({ type: "exportAllPng", keys: selectedKeys });
    });

    const exportAllPdf =
        document.querySelector<HTMLButtonElement>(
            "#export-all-pdf"
        );

    exportAllPdf?.addEventListener("click", () => {
        if (selectedKeys.length === 0) {
            return;
        }

        vscode.postMessage({ type: "exportAllPdf", keys: selectedKeys });
    });
    const exitButton =
        document.querySelector<HTMLButtonElement>(
            "#exit-comparison"
        );

    exitButton?.addEventListener(
        "click",
        exitComparisonMode
    );
}

function setupComparisonDividers(): void {
    if (!document.body.classList.contains("editor-mode")) {
        return;
    }

    preview
        .querySelectorAll<HTMLElement>(".comparison-divider")
        .forEach((divider) => {
            divider.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) {
                    return;
                }

                const grid = divider.parentElement;
                const leftKey = divider.dataset.leftKey;
                const rightKey = divider.dataset.rightKey;
                const cards = Array.from(
                    grid?.querySelectorAll<HTMLElement>(".comparison-card") ?? []
                );
                const leftCard = cards.find((card) => card.dataset.key === leftKey);
                const rightCard = cards.find((card) => card.dataset.key === rightKey);

                if (!leftKey || !rightKey || !leftCard || !rightCard) {
                    return;
                }

                event.preventDefault();
                const leftBounds = leftCard.getBoundingClientRect();
                const rightBounds = rightCard.getBoundingClientRect();
                const combinedWidth = leftBounds.width + rightBounds.width;
                const minimumWidth = 180;

                if (combinedWidth <= minimumWidth * 2) {
                    return;
                }

                const startX = event.clientX;
                const leftWeight = comparisonCardSizes.get(leftKey) ?? 1;
                const rightWeight = comparisonCardSizes.get(rightKey) ?? 1;
                const combinedWeight = leftWeight + rightWeight;
                divider.setPointerCapture(event.pointerId);
                divider.classList.add("resizing");

                const resize = (moveEvent: PointerEvent): void => {
                    const nextLeftWidth = Math.min(
                        combinedWidth - minimumWidth,
                        Math.max(
                            minimumWidth,
                            leftBounds.width + moveEvent.clientX - startX
                        )
                    );
                    const nextLeftWeight =
                        combinedWeight * nextLeftWidth / combinedWidth;
                    const nextRightWeight = combinedWeight - nextLeftWeight;

                    comparisonCardSizes.set(leftKey, nextLeftWeight);
                    comparisonCardSizes.set(rightKey, nextRightWeight);
                    leftCard.style.setProperty(
                        "--comparison-card-size",
                        String(nextLeftWeight)
                    );
                    rightCard.style.setProperty(
                        "--comparison-card-size",
                        String(nextRightWeight)
                    );
                };

                const stop = (): void => {
                    divider.classList.remove("resizing");
                    divider.removeEventListener("pointermove", resize);
                    divider.removeEventListener("pointerup", stop);
                    divider.removeEventListener("pointercancel", stop);
                };

                divider.addEventListener("pointermove", resize);
                divider.addEventListener("pointerup", stop);
                divider.addEventListener("pointercancel", stop);
            });
        });
}

function setupComparisonImageInteractions(
    key: string,
    viewport: HTMLElement,
    image: HTMLImageElement
): void {
    let transform =
        comparisonTransforms.get(key);

    if (!transform) {
        transform = {
            zoom: 1,
            panX: 0,
            panY: 0,
        };

        comparisonTransforms.set(
            key,
            transform
        );
    }

    viewport.style.touchAction = "none";

    const applyTransform = () => {
        image.style.transform =
            `translate3d(${transform!.panX}px, ${transform!.panY}px, 0) ` +
            `scale(${transform!.zoom})`;

        image.classList.toggle(
            "zoomed",
            transform!.zoom > 1.001
        );
    };

    const clampPan = () => {
        if (transform!.zoom <= 1) {
            transform!.panX = 0;
            transform!.panY = 0;
            return;
        }

        const viewportWidth =
            viewport.clientWidth;

        const viewportHeight =
            viewport.clientHeight;

        const imageWidth =
            image.offsetWidth *
            transform!.zoom;

        const imageHeight =
            image.offsetHeight *
            transform!.zoom;

        const maxPanX =
            Math.max(
                0,
                (imageWidth - viewportWidth) / 2
            );

        const maxPanY =
            Math.max(
                0,
                (imageHeight - viewportHeight) / 2
            );

        transform!.panX =
            Math.max(
                -maxPanX,
                Math.min(
                    maxPanX,
                    transform!.panX
                )
            );

        transform!.panY =
            Math.max(
                -maxPanY,
                Math.min(
                    maxPanY,
                    transform!.panY
                )
            );
    };

    const zoomAtPoint = (
        delta: number,
        clientX: number,
        clientY: number
    ) => {
        const oldZoom =
            transform!.zoom;

        const direction =
            delta < 0
                ? ZOOM_FACTOR
                : 1 / ZOOM_FACTOR;

        const newZoom =
            Math.max(
                MIN_PREVIEW_ZOOM,
                Math.min(
                    MAX_PREVIEW_ZOOM,
                    oldZoom * direction
                )
            );

        if (newZoom === oldZoom) {
            return;
        }

        const rect =
            viewport.getBoundingClientRect();

        const x =
            clientX -
            rect.left -
            rect.width / 2;

        const y =
            clientY -
            rect.top -
            rect.height / 2;

        const zoomRatio =
            newZoom / oldZoom;

        transform!.panX =
            x -
            (x - transform!.panX) *
                zoomRatio;

        transform!.panY =
            y -
            (y - transform!.panY) *
                zoomRatio;

        transform!.zoom = newZoom;

        if (newZoom === 1) {
            transform!.panX = 0;
            transform!.panY = 0;
        }

        clampPan();
        applyTransform();
    };

    viewport.addEventListener(
        "wheel",
        (event) => {
            /*
            * Ctrl + wheel is trackpad pinch in Chromium.
            * Use it to zoom around the cursor.
            */
            if (event.ctrlKey) {
                event.preventDefault();

                zoomAtPoint(
                    event.deltaY,
                    event.clientX,
                    event.clientY
                );

                return;
            }

            /*
            * When zoomed, normal wheel/trackpad movement
            * pans around the image.
            */
            if (transform!.zoom > 1) {
                event.preventDefault();

                transform!.panX -= event.deltaX;
                transform!.panY -= event.deltaY;

                clampPan();
                applyTransform();
            }
        },
        { passive: false }
    );

    viewport.addEventListener(
        "pointerdown",
        (event) => {
            if (event.button !== 0) {
                return;
            }

            if (transform!.zoom <= 1) {
                return;
            }

            comparisonDragging = true;
            comparisonDragKey = key;

            comparisonDragStartX =
                event.clientX;

            comparisonDragStartY =
                event.clientY;

            comparisonDragPanX =
                transform!.panX;

            comparisonDragPanY =
                transform!.panY;

            viewport.setPointerCapture(
                event.pointerId
            );

            viewport.classList.add(
                "panning"
            );

            event.preventDefault();
        }
    );

    viewport.addEventListener(
        "pointermove",
        (event) => {
            if (
                !comparisonDragging ||
                comparisonDragKey !== key
            ) {
                return;
            }

            transform!.panX =
                comparisonDragPanX +
                (
                    event.clientX -
                    comparisonDragStartX
                );

            transform!.panY =
                comparisonDragPanY +
                (
                    event.clientY -
                    comparisonDragStartY
                );

            clampPan();
            applyTransform();
        }
    );

    const stopDragging = (
        event?: PointerEvent
    ) => {
        if (
            comparisonDragKey !== key
        ) {
            return;
        }

        comparisonDragging = false;
        comparisonDragKey = undefined;

        viewport.classList.remove(
            "panning"
        );

        if (
            event &&
            viewport.hasPointerCapture(
                event.pointerId
            )
        ) {
            viewport.releasePointerCapture(
                event.pointerId
            );
        }
    };

    viewport.addEventListener(
        "pointerup",
        stopDragging
    );

    viewport.addEventListener(
        "pointercancel",
        stopDragging
    );

    viewport.addEventListener(
        "dblclick",
        () => {
            transform!.zoom = 1;
            transform!.panX = 0;
            transform!.panY = 0;

            applyTransform();
        }
    );

    /*
     * The image dimensions may not be available when
     * this function is initially called.
     */
    image.addEventListener(
        "load",
        () => {
            clampPan();
            applyTransform();
        }
    );

    clampPan();
    applyTransform();
}

function selectAdjacentFigure(
    direction: "left" | "right" | "up" | "down"
): void {
    const results = filteredCatalog();

    if (results.length === 0) {
        return;
    }

    const currentIndex = results.findIndex(
        (figure) => figure.key === selectedKey
    );

    if (currentIndex === -1) {
        selectThumbnail(results[0].key);
        return;
    }

    const thumbnailButtons =
        Array.from(
            thumbnails.querySelectorAll<HTMLButtonElement>(
                ".thumbnail"
            )
        );

    const currentButton = thumbnailButtons.find(
        (button) =>
            button.dataset.key === selectedKey
    );

    if (!currentButton) {
        return;
    }

    // The buttons sit inside cards, so measure card positions in the grid.
    const currentCard = currentButton.closest<HTMLElement>(".thumbnail-card");
    const currentTop = currentCard?.offsetTop ?? currentButton.offsetTop;
    const currentCenter = (currentCard?.offsetLeft ?? currentButton.offsetLeft)
        + (currentCard?.offsetWidth ?? currentButton.offsetWidth) / 2;
    let nextIndex: number;

    switch (direction) {
        case "left":
            nextIndex = currentIndex - 1;
            break;

        case "right":
            nextIndex = currentIndex + 1;
            break;

        case "up":
        case "down": {
            const rows = new Map<number, HTMLButtonElement[]>();
            for (const button of thumbnailButtons) {
                const top = button.closest<HTMLElement>(".thumbnail-card")?.offsetTop
                    ?? button.offsetTop;
                rows.set(top, [...(rows.get(top) ?? []), button]);
            }
            const rowTops = [...rows.keys()].sort((left, right) => left - right);
            const rowIndex = rowTops.indexOf(currentTop);
            const nextTop = rowTops[rowIndex + (direction === "up" ? -1 : 1)];
            if (nextTop === undefined) {
                return;
            }
            const target = rows.get(nextTop)?.reduce((closest, button) => {
                const card = button.closest<HTMLElement>(".thumbnail-card");
                const center = (card?.offsetLeft ?? button.offsetLeft)
                    + (card?.offsetWidth ?? button.offsetWidth) / 2;
                const closestCard = closest.closest<HTMLElement>(".thumbnail-card");
                const closestCenter = (closestCard?.offsetLeft ?? closest.offsetLeft)
                    + (closestCard?.offsetWidth ?? closest.offsetWidth) / 2;
                return Math.abs(center - currentCenter) < Math.abs(closestCenter - currentCenter)
                    ? button : closest;
            });
            nextIndex = results.findIndex((figure) => figure.key === target?.dataset.key);
            break;
        }
    }

    /*
     * Don't wrap between rows.
     *
     * Left on the first item stays there.
     * Right on the last item stays there.
     * Up/down stay put when there is no corresponding row.
     */
    if (
        nextIndex < 0 ||
        nextIndex >= results.length
    ) {
        return;
    }

    const nextFigure = results[nextIndex];

    if (!nextFigure) {
        return;
    }

    selectThumbnail(nextFigure.key);

    const button =
        thumbnails.querySelector<HTMLButtonElement>(
            `.thumbnail[data-key="${CSS.escape(nextFigure.key)}"]`
        );

    button?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
    });
}

/* ─────────────────────────────────────────────
   Keyboard navigation
   ───────────────────────────────────────────── */

document.addEventListener("keydown", (event) => {
    const target = event.target;

    if (event.key === "Escape" && focusedFigure) {
        event.preventDefault();
        event.stopPropagation();
        exitFigureFullscreen();
        return;
    }

    if (event.key === "Escape" && comparisonMode) {
        event.preventDefault();
        exitComparisonMode();
        return;
    }

    if (event.key === "Escape" && historyMode) {
        event.preventDefault();
        vscode.postMessage({ type: "exitHistory" });
        return;
    }

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement &&
            target.isContentEditable)
    ) {
        return;
    }

    switch (event.key) {
        case "ArrowLeft":
            event.preventDefault();
            selectAdjacentFigure("left");
            break;

        case "ArrowRight":
            event.preventDefault();
            selectAdjacentFigure("right");
            break;

        case "ArrowUp":
            event.preventDefault();
            selectAdjacentFigure("up");
            break;

        case "ArrowDown":
            event.preventDefault();
            selectAdjacentFigure("down");
            break;
        
        case "Escape":
            if (selectedKeys.length > 1) {
                /*
                * Keep the primary figure selected, but clear
                * the additional selections.
                */
                selectedKeys =
                    selectedKey
                        ? [selectedKey]
                        : [];

                selectionAnchorKey =
                    selectedKey;

                renderThumbnailSelection();
            }
            break;
    }
});

function resetPreviewTransform(): void {
    previewZoom = 1;
    previewPanX = 0;
    previewPanY = 0;

    applyPreviewTransform();
}

function applyPreviewTransform(): void {
    const image =
        preview.querySelector<HTMLImageElement>(
            "#preview-image"
        );

    if (!image) {
        return;
    }

    image.style.transform =
        `translate3d(${previewPanX}px, ${previewPanY}px, 0) ` +
        `scale(${previewZoom})`;

    image.classList.toggle(
        "zoomed",
        previewZoom > 1.001
    );
}

function clampPreviewPan(): void {
    const image =
        preview.querySelector<HTMLImageElement>(
            "#preview-image"
        );

    const viewport =
        preview.querySelector<HTMLElement>(
            ".preview-image-viewport"
        );

    if (!image || !viewport) {
        return;
    }

    if (previewZoom <= 1) {
        previewPanX = 0;
        previewPanY = 0;
        return;
    }

    const viewportWidth =
        viewport.clientWidth;

    const viewportHeight =
        viewport.clientHeight;

    const imageWidth =
        image.offsetWidth * previewZoom;

    const imageHeight =
        image.offsetHeight * previewZoom;

    const maxPanX =
        Math.max(
            0,
            (imageWidth - viewportWidth) / 2
        );

    const maxPanY =
        Math.max(
            0,
            (imageHeight - viewportHeight) / 2
        );

    previewPanX = Math.max(
        -maxPanX,
        Math.min(maxPanX, previewPanX)
    );

    previewPanY = Math.max(
        -maxPanY,
        Math.min(maxPanY, previewPanY)
    );
}

function setPreviewZoom(
    newZoom: number,
    cursorX?: number,
    cursorY?: number
): void {
    const image =
        preview.querySelector<HTMLImageElement>(
            "#preview-image"
        );

    const viewport =
        preview.querySelector<HTMLElement>(
            ".preview-image-viewport"
        );

    if (!image || !viewport) {
        return;
    }

    const oldZoom = previewZoom;

    previewZoom = Math.max(
        MIN_PREVIEW_ZOOM,
        Math.min(MAX_PREVIEW_ZOOM, newZoom)
    );

    if (previewZoom === oldZoom) {
        return;
    }

    /*
     * Keep the point underneath the cursor
     * stationary while zooming.
     */
    if (
        cursorX !== undefined &&
        cursorY !== undefined
    ) {
        const rect =
            viewport.getBoundingClientRect();

        const x =
            cursorX - rect.left - rect.width / 2;

        const y =
            cursorY - rect.top - rect.height / 2;

        const zoomRatio =
            previewZoom / oldZoom;

        previewPanX =
            x -
            (x - previewPanX) * zoomRatio;

        previewPanY =
            y -
            (y - previewPanY) * zoomRatio;
    }

    if (previewZoom === 1) {
        previewPanX = 0;
        previewPanY = 0;
    }

    clampPreviewPan();
    applyPreviewTransform();
}

function zoomPreviewAtPoint(
    delta: number,
    clientX: number,
    clientY: number
): void {
    const direction =
        delta < 0
            ? ZOOM_FACTOR
            : 1 / ZOOM_FACTOR;

    setPreviewZoom(
        previewZoom * direction,
        clientX,
        clientY
    );
}

function setupPreviewInteractions(): void {
    const viewport =
        preview.querySelector<HTMLElement>(
            ".preview-image-viewport"
        );

    const image =
        preview.querySelector<HTMLImageElement>(
            "#preview-image"
        );

    if (!viewport || !image) {
        return;
    }

    /*
     * Prevent the browser/webview from interpreting
     * pointer gestures as text/image dragging.
     */
    viewport.style.touchAction = "none";

    viewport.addEventListener(
        "wheel",
        (event) => {
            /*
            * Chromium reports trackpad pinch gestures
            * as ctrlKey + wheel.
            */
            if (event.ctrlKey) {
                event.preventDefault();

                zoomPreviewAtPoint(
                    event.deltaY,
                    event.clientX,
                    event.clientY
                );

                return;
            }

            /*
            * At 1x, allow the normal preview scrolling.
            *
            * When zoomed, use the wheel/trackpad to pan
            * around the image.
            */
            if (previewZoom > 1) {
                event.preventDefault();

                previewPanX -= event.deltaX;
                previewPanY -= event.deltaY;

                clampPreviewPan();
                applyPreviewTransform();
            }
        },
        { passive: false }
    );

    viewport.addEventListener(
        "pointerdown",
        (event) => {
            if (event.button !== 0) {
                return;
            }

            if (previewZoom <= 1) {
                return;
            }

            previewDragging = true;

            previewDragStartX =
                event.clientX;

            previewDragStartY =
                event.clientY;

            previewDragPanX =
                previewPanX;

            previewDragPanY =
                previewPanY;

            viewport.setPointerCapture(
                event.pointerId
            );

            viewport.classList.add("panning");
        }
    );

    viewport.addEventListener(
        "pointermove",
        (event) => {
            if (!previewDragging) {
                return;
            }

            previewPanX =
                previewDragPanX +
                (event.clientX -
                    previewDragStartX);

            previewPanY =
                previewDragPanY +
                (event.clientY -
                    previewDragStartY);

            clampPreviewPan();
            applyPreviewTransform();
        }
    );

    const stopDragging = () => {
        previewDragging = false;
        viewport.classList.remove("panning");
    };

    viewport.addEventListener(
        "pointerup",
        stopDragging
    );

    viewport.addEventListener(
        "pointercancel",
        stopDragging
    );

    viewport.addEventListener(
        "dblclick",
        () => {
            resetPreviewTransform();
        }
    );

    window.addEventListener(
        "resize",
        () => {
            clampPreviewPan();
            applyPreviewTransform();
        }
    );
}

/* ─────────────────────────────────────────────
   Preview
   ───────────────────────────────────────────── */

function updatePreview(): void {
    if (comparisonMode) {
        renderComparison();
        return;
    }

    const selected = catalog.find(
        (figure) => figure.key === selectedKey
    );

    if (!selected) {
        preview.innerHTML =
            '<p class="empty">' +
            "No figures match the current search." +
            "</p>";

        source.innerHTML = "";
        reveal.disabled = true;

        return;
    }

    if (!selected.available) {
        const figureTitle = selected.title || "Figure " + selected.number;
        preview.dataset.figureKey = selected.key;
        preview.dataset.figureVersion = selected.version;
        preview.innerHTML =
            '<div class="preview-header"><h2>' + escapeHtml(figureTitle) + '</h2></div>' +
            '<div class="preview-unavailable">Reopen or rescan this source to load the starred image.</div>';
        source.innerHTML = "";
        reveal.disabled = false;
        return;
    }

    const baseFigureTitle = selected.title || "Figure " + selected.number;
    const figureTitle = historyMode && selected.historyPosition
        ? `${baseFigureTitle} · Version ${selected.historyPosition} of ${selected.historyTotal}`
        : baseFigureTitle;

    const tags = selected.tags || [];
    const fullscreenAction =
        '<button id="fullscreen-preview-figure" class="icon-button" type="button" title="Focus figure" aria-label="Focus figure">' + fullscreenIcon + "</button>";
    const historyAction = historyMode
        ? ""
        : '<button id="open-figure-history" class="icon-button" type="button" title="Figure history" aria-label="Figure history"' +
          (selected.hasHistory ? "" : " disabled") + ">" + historyIcon + "</button>";
    const historyNavigation = historyMode
        ? '<button id="history-previous" class="history-navigation history-navigation--previous" type="button" title="Previous version" aria-label="Previous version"' +
          ((selected.historyPosition ?? 1) <= 1 ? " disabled" : "") + '>‹</button>' +
          '<button id="history-next" class="history-navigation history-navigation--next" type="button" title="Next version" aria-label="Next version"' +
          ((selected.historyPosition ?? 1) >= (selected.historyTotal ?? 1) ? " disabled" : "") + '>›</button>'
        : "";

    const existingImage =
        preview.querySelector<HTMLImageElement>(
            "#preview-image"
        );

    const existingFigureKey =
        preview.dataset.figureKey;
    const existingFigureVersion =
        preview.dataset.figureVersion;
    const existingHistoryMode =
        preview.dataset.historyMode === "true";

    /*
     * If the same figure is still selected,
     * don't rebuild the preview DOM.
     *
     * This is what prevents the preview from
     * flickering whenever the notebook changes.
     */
    if (
        existingFigureKey === selected.key &&
        existingFigureVersion === selected.version &&
        existingHistoryMode === historyMode &&
        existingImage
    ) {
        updatePreviewMetadata(selected);
        reveal.disabled = false;
        updateRevealAction(selected);
        if (!existingImage.complete || existingImage.naturalWidth === 0) {
            requestCurrentPreview();
        }
        if (document.body.classList.contains("editor-mode")) {
            preview.querySelector(".preview-actions")?.append(reveal);
        }

        return;
    }

    preview.dataset.figureKey = selected.key;
    preview.dataset.figureVersion = selected.version;
    preview.dataset.historyMode = String(historyMode);

    const tagHtml =
        tags.length > 0
            ? '<div class="tags">' +
              tags
                  .map(
                      (tag) =>
                          '<span class="tag" data-tag="' +
                          escapeHtml(tag) +
                          '">' +
                          escapeHtml(tag) +
                          "</span>"
                  )
                  .join("") +
              "</div>"
            : "";

    preview.innerHTML =
        '<div class="preview-header">' +
            "<h2>" +
                escapeHtml(figureTitle) +
            "</h2>" +
            '<div class="preview-actions">' +
                '<button id="preview-zoom-out" class="preview-action" type="button" title="Zoom out" aria-label="Zoom out">−</button>' +
                '<button id="preview-zoom-in" class="preview-action" type="button" title="Zoom in" aria-label="Zoom in">+</button>' +
            "</div>" +
        "</div>" +

        tagHtml +

        '<div class="preview-image-viewport">' +
            '<img id="preview-image" ' +
            'class="main-image" ' +
            'alt="preview">' +
            '<div class="image-hover-actions">' +
                historyAction +
                '<button id="reset-preview-zoom" type="button" title="Reset zoom" aria-label="Reset zoom">↻</button>' +
                '<button id="download-preview-figure" class="icon-button" type="button" title="Download figure" aria-label="Download figure">' + saveIcon + '</button>' +
                fullscreenAction +
            "</div>" +
            historyNavigation +
        "</div>";

    if (document.body.classList.contains("editor-mode")) {
        preview.querySelector(".preview-actions")?.append(reveal);
    }
    
    const imageViewport =
        preview.querySelector<HTMLElement>(
            ".preview-image-viewport"
        );

    imageViewport?.addEventListener(
        "contextmenu",
        (event) => {
            showFigureContextMenu(
                event,
                selected.key
            );
        }
    );

    preview
        .querySelector<HTMLButtonElement>("#open-figure-history")
        ?.addEventListener("click", () => {
            vscode.postMessage({ type: "enterHistory", key: selected.key });
        });

    preview
        .querySelector<HTMLButtonElement>("#history-previous")
        ?.addEventListener("click", () => selectHistoryVersion(-1));

    preview
        .querySelector<HTMLButtonElement>("#history-next")
        ?.addEventListener("click", () => selectHistoryVersion(1));

    preview
        .querySelector<HTMLButtonElement>("#reset-preview-zoom")
        ?.addEventListener("click", resetPreviewTransform);

    preview
        .querySelector<HTMLButtonElement>("#reset-preview-zoom")
        ?.addEventListener("pointerdown", (event) => event.stopPropagation());

    preview
        .querySelector<HTMLButtonElement>("#preview-zoom-out")
        ?.addEventListener("click", () => {
            setPreviewZoom(previewZoom / ZOOM_FACTOR);
        });

    preview
        .querySelector<HTMLButtonElement>("#preview-zoom-in")
        ?.addEventListener("click", () => {
            setPreviewZoom(previewZoom * ZOOM_FACTOR);
        });

    preview
        .querySelector<HTMLButtonElement>("#download-preview-figure")
        ?.addEventListener("click", () => {
            void postDownload(selected.key);
        });

    preview
        .querySelector<HTMLButtonElement>("#download-preview-figure")
        ?.addEventListener("pointerdown", (event) => event.stopPropagation());

    preview
        .querySelector<HTMLButtonElement>("#fullscreen-preview-figure")
        ?.addEventListener("click", () => {
            if (imageViewport) {
                toggleFigureFullscreen(imageViewport);
            }
        });

    preview
        .querySelector<HTMLButtonElement>("#fullscreen-preview-figure")
        ?.addEventListener("pointerdown", (event) => event.stopPropagation());
    
    preview
        .querySelectorAll<HTMLElement>(".tag")
        .forEach((tagElement) => {
            tagElement.addEventListener("click", () => {
                const tag = tagElement.dataset.tag;

                if (tag) {
                    addTagFilter(tag);
                }
            });
        });

    resetPreviewTransform();
    setupPreviewInteractions();

    vscode.postMessage({
        type: "requestPreview",
        key: selected.key,
    });

    updatePreviewMetadata(selected);

    reveal.disabled = false;
    updateRevealAction(selected);
}

function updateRevealAction(figure: GalleryFigure): void {
    const label = figure.imageUri ? "Open image" : "Reveal cell";
    reveal.title = label;
    reveal.setAttribute("aria-label", label);
    reveal.dataset.buttonLabel = label;
}

function requestCurrentPreview(): void {
    if (comparisonMode) {
        for (const key of selectedKeys) {
            if (catalog.find((figure) => figure.key === key)?.available) {
                vscode.postMessage({ type: "requestPreview", key });
            }
        }
        return;
    }
    if (!selectedKey) return;
    const selected = catalog.find((figure) => figure.key === selectedKey);
    if (!selected?.available) return;
    vscode.postMessage({ type: "requestPreview", key: selectedKey });
}

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestCurrentPreview();
});
window.addEventListener("focus", requestCurrentPreview);

// Only retry when the selected preview is actually missing; a healthy gallery
// does not generate periodic image traffic.
window.setInterval(() => {
    if (document.hidden || comparisonMode || !selectedKey) return;
    const selected = catalog.find((figure) => figure.key === selectedKey);
    if (!selected?.available) return;
    const image = preview.querySelector<HTMLImageElement>("#preview-image");
    if (!image || !image.complete || image.naturalWidth === 0) {
        requestCurrentPreview();
    }
}, 3000);

async function copyFigureToClipboard(
    key: string
): Promise<void> {
    const imageData = previewImages.get(key);

    if (!imageData) {
        pendingCopyKey = key;

        vscode.postMessage({
            type: "requestPreview",
            key,
        });

        return;
    }

    const figure = catalog.find((candidate) => candidate.key === key);
    await copyImageToClipboard(imageData, figure?.mimeType ?? "image/png");
}

async function pngBase64ForKey(key: string): Promise<string | undefined> {
    const imageData = previewImages.get(key);

    if (!imageData) {
        return undefined;
    }

    const response = await fetch(imageData);
    const source = await response.blob();
    const png = source.type === "image/png" ? source : await convertImageToPng(source);
    const bytes = new Uint8Array(await png.arrayBuffer());
    let binary = "";

    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }

    return btoa(binary);
}

async function postPdfExport(key: string): Promise<void> {
    const figure = catalog.find((candidate) => candidate.key === key);

    if (!figure) {
        return;
    }

    if (figure.mimeType === "image/png" || figure.mimeType === "image/jpeg") {
        vscode.postMessage({ type: "exportPdf", key });
        return;
    }

    const pngData = await pngBase64ForKey(key);

    if (!pngData) {
        pendingPdfKeys.add(key);
        vscode.postMessage({ type: "requestPreview", key });
        return;
    }

    vscode.postMessage({ type: "exportPdf", key, pngData });
}

async function postDownload(key: string): Promise<void> {
    const figure = catalog.find((candidate) => candidate.key === key);

    if (!figure) {
        return;
    }

    if (figure.mimeType === "image/png" || figure.mimeType === "image/jpeg") {
        vscode.postMessage({ type: "download", key });
        return;
    }

    const pngData = await pngBase64ForKey(key);

    if (!pngData) {
        pendingDownloadKeys.add(key);
        vscode.postMessage({ type: "requestPreview", key });
        return;
    }

    vscode.postMessage({ type: "download", key, pngData });
}

function showFigureContextMenu(
    event: MouseEvent,
    key: string
): void {
    event.preventDefault();
    
    if (!previewImages.has(key)) {
        vscode.postMessage({
            type: "requestPreview",
            key,
        });
    }
    
    const existing =
        document.querySelector<HTMLElement>(
            ".figure-context-menu"
        );

    existing?.remove();

    const menu =
        document.createElement("div");

    menu.className = "figure-context-menu";

    const actionKeys = selectedKeys.includes(key) && selectedKeys.length > 1
        ? [...selectedKeys]
        : [key];
    const actionFigures = catalog.filter((figure) => actionKeys.includes(figure.key));
    const plural = actionFigures.length > 1;
    const shouldStar = actionFigures.some((figure) => !figure.starred);

    const starAction = historyMode
        ? ""
        : '<button type="button" data-action="toggle-star">' +
            (shouldStar
                ? (plural ? "Star Selected Figures" : "Star Figure")
                : (plural ? "Unstar Selected Figures" : "Unstar Figure")) +
          "</button>";
    const historyActions = historyMode
        ? '<button type="button" data-action="view-version-code">View/restore version code…</button>' +
          '<button type="button" data-action="copy-version-code">Copy version code</button>' +
          '<button type="button" data-action="restore-version-code">Restore cell code…</button>'
        : "";

    menu.innerHTML =
        (plural ? "" : '<button type="button" data-action="copy-image">Copy Image</button>') +
        '<button type="button" data-action="save-png">' +
            (plural ? "Save Selected Images" : "Save Image") +
        "</button>" +
        '<button type="button" data-action="export-pdf">' +
            (plural ? "Export Selected as PDF" : "Export PDF") +
        "</button>" +
        historyActions +
        starAction;

    document.body.appendChild(menu);

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    menu.style.left =
        Math.min(
            event.clientX,
            window.innerWidth - menuWidth - 8
        ) + "px";

    menu.style.top =
        Math.min(
            event.clientY,
            window.innerHeight - menuHeight - 8
        ) + "px";

    menu
        .querySelector<HTMLButtonElement>(
            '[data-action="copy-image"]'
        )
        ?.addEventListener("click", async () => {
            await copyFigureToClipboard(key);
            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>(
            '[data-action="save-png"]'
        )
        ?.addEventListener("click", () => {
            if (plural) {
                vscode.postMessage({ type: "exportAllPng", keys: actionKeys });
            } else {
                void postDownload(key);
            }

            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>(
            '[data-action="export-pdf"]'
        )
        ?.addEventListener("click", () => {
            if (plural) {
                vscode.postMessage({ type: "exportAllPdf", keys: actionKeys });
            } else {
                void postPdfExport(key);
            }

            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>('[data-action="toggle-star"]')
        ?.addEventListener("click", () => {
            vscode.postMessage({
                type: "setStars",
                keys: actionKeys,
                starred: shouldStar,
            });
            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>('[data-action="view-version-code"]')
        ?.addEventListener("click", () => {
            showVersionCodePanel(key);
            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>('[data-action="copy-version-code"]')
        ?.addEventListener("click", () => {
            vscode.postMessage({ type: "copyVersionCode", key });
            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>('[data-action="restore-version-code"]')
        ?.addEventListener("click", () => {
            vscode.postMessage({ type: "restoreVersionCode", key });
            menu.remove();
        });

    const closeMenu = (closeEvent: MouseEvent) => {
        if (!menu.contains(closeEvent.target as Node)) {
            menu.remove();
            document.removeEventListener(
                "mousedown",
                closeMenu
            );
        }
    };

    setTimeout(() => {
        document.addEventListener(
            "mousedown",
            closeMenu
        );
    }, 0);
}

async function copyImageToClipboard(
    dataUrl: string,
    mimeType: string
): Promise<void> {
    try {
        if (
            !navigator.clipboard ||
            typeof ClipboardItem === "undefined"
        ) {
            throw new Error(
                "Image clipboard access is not supported."
            );
        }

        const response =
            await fetch(dataUrl);

        const blob =
            await response.blob();

        let clipboardBlob = blob;

        if (mimeType !== "image/png") {
            clipboardBlob =
                await convertImageToPng(blob);
        }

        await navigator.clipboard.write([
            new ClipboardItem({
                "image/png": clipboardBlob,
            }),
        ]);
    } catch {
        window.alert(
            "Could not copy the image to the clipboard."
        );
    }
}

function updatePreviewMetadata(
    selected: GalleryFigure
): void {
    const baseFigureTitle = selected.title || "Figure " + selected.number;
    const figureTitle = historyMode && selected.historyPosition
        ? `${baseFigureTitle} · Version ${selected.historyPosition} of ${selected.historyTotal}`
        : baseFigureTitle;

    const heading =
        preview.querySelector<HTMLHeadingElement>("h2");

    if (heading) {
        heading.textContent = figureTitle;
    }

    const tags = selected.tags || [];

    let tagsContainer =
        preview.querySelector<HTMLElement>(".tags");

    if (tags.length === 0) {
        tagsContainer?.remove();
    } else {
        if (!tagsContainer) {
            tagsContainer =
                document.createElement("div");

            tagsContainer.className = "tags";

            const imageViewport =
                preview.querySelector<HTMLElement>(
                    ".preview-image-viewport"
                );

            if (imageViewport) {
                imageViewport.before(tagsContainer);
            }
        }

        tagsContainer.innerHTML = tags
            .map(
                (tag) =>
                    '<span class="tag" data-tag="' +
                    escapeHtml(tag) +
                    '">' +
                    escapeHtml(tag) +
                    "</span>"
            )
            .join("");

        tagsContainer
            .querySelectorAll<HTMLElement>(".tag")
            .forEach((tagElement) => {
                tagElement.addEventListener("click", () => {
                    const tag =
                        tagElement.dataset.tag;

                    if (tag) {
                        addTagFilter(tag);
                    }
                });
            });
    }

    source.innerHTML = "";
}

/* ─────────────────────────────────────────────
   Render
   ───────────────────────────────────────────── */

function render(): void {
    exitFigureFullscreen();

    if (comparisonMode) {
        updateComparisonUI();
        renderComparison();
        return;
    }

    const results = filteredCatalog();

    if (
        !results.some(
            (figure) => figure.key === selectedKey
        )
    ) {
        selectedKey = results[0]?.key;

        if (selectedKey) {
            selectedKeys = [selectedKey];
            selectionAnchorKey = selectedKey;

            vscode.postMessage({
                type: "selectFigure",
                key: selectedKey,
            });
        } else {
            selectedKeys = [];
            selectionAnchorKey = undefined;
        }
    }

    document
        .querySelectorAll<HTMLButtonElement>(".scope")
        .forEach((button) => {
            button.classList.toggle(
                "active",
                button.dataset.scope === scope
            );
        });

    document
        .querySelectorAll<HTMLButtonElement>(
            ".filter-option"
        )
        .forEach((button) => {
            button.classList.toggle(
                "active",
                button.dataset.filter === titleFilter
            );
        });

    filtersButton.classList.toggle(
        "active",
        titleFilter !== "all"
    );

    addTag.classList.toggle(
        "active",
        activeTags.length > 0
    );

    count.textContent = historyMode
        ? `${results.length} of ${catalog.length} versions`
        : results.length + " of " + catalog.length + " figures";

    updateThumbnailElements(results);


    updateSearchUI();
    updatePreview();
}

function updateThumbnailElements(
    results: GalleryFigure[]
): void {
    const existingButtons =
        new Map<string, HTMLButtonElement>();

    thumbnails
        .querySelectorAll<HTMLButtonElement>(".thumbnail")
        .forEach((button) => {
            const key = button.dataset.key;

            if (key) {
                existingButtons.set(key, button);
            }
        });

    const fragment = document.createDocumentFragment();

    results.forEach((figure) => {
        const figureTitle =
            figure.title ||
            "Figure " + figure.number;

        const label = historyMode && figure.historyPosition
            ? `Version ${figure.historyPosition}`
            : scope === "all"
                ? figureTitle +
                  " · " +
                  figure.notebookName
                : figureTitle;

        let button = existingButtons.get(figure.key);

        if (!button) {
            const newButton =
                document.createElement("button");

            newButton.className = "thumbnail";
            newButton.dataset.key = figure.key;

            const img =
                document.createElement("img");

            img.className = "lazy";
            img.dataset.key = figure.key;
            img.alt = "thumbnail";
            img.draggable = false;

            const labelElement =
                document.createElement("span");

            labelElement.className = "thumbnail-label";

            newButton.appendChild(img);
            newButton.appendChild(labelElement);

            const card = document.createElement("div");
            card.className = "thumbnail-card";
            card.appendChild(newButton);

            const starButton = document.createElement("button");
            starButton.type = "button";
            starButton.className = "thumbnail-star-button";
            const starIcon = document.querySelector<SVGSVGElement>(".scope[data-scope='starred'] .star-icon");
            if (starIcon) {
                starButton.appendChild(starIcon.cloneNode(true));
            }
            starButton.addEventListener("click", (event) => {
                event.stopPropagation();
                const key = newButton.dataset.key;
                if (key) {
                    vscode.postMessage({ type: "toggleStar", key });
                }
            });
            card.appendChild(starButton);

            newButton.addEventListener("click", (event) => {
                const key = newButton.dataset.key;

                if (!key) {
                    return;
                }

                const mouseEvent =
                    event as MouseEvent;

                const modifier =
                    mouseEvent.ctrlKey ||
                    mouseEvent.metaKey;

                if (mouseEvent.shiftKey) {
                    selectFigureRange(key);
                    return;
                }

                if (modifier) {
                    toggleSelectedFigure(key);
                    return;
                }

                selectThumbnail(key);
            });

            newButton.addEventListener("dblclick", () => {
                const key = newButton.dataset.key;

                if (!key) {
                    return;
                }

                selectThumbnail(key);

                vscode.postMessage({
                    type: "revealCell",
                });
            });

            newButton.addEventListener(
                "contextmenu",
                (event) => {
                    const key = newButton.dataset.key;

                    if (!key) {
                        return;
                    }

                    showFigureContextMenu(
                        event,
                        key
                    );
                }
            );

            button = newButton;
        }

        const img =
            button.querySelector<HTMLImageElement>(
                "img"
            );

        const labelElement =
            button.querySelector<HTMLSpanElement>(
                ".thumbnail-label"
            );

        if (!img || !labelElement) {
            return;
        }

        labelElement.textContent = label;
        const card = button.parentElement;
        const starButton = card?.querySelector<HTMLButtonElement>(
            ".thumbnail-star-button"
        );
        if (starButton) {
            starButton.title = figure.starred ? "Unstar figure" : "Star figure";
            starButton.setAttribute("aria-label", starButton.title);
            starButton.setAttribute("aria-pressed", String(figure.starred));
            starButton.hidden = historyMode;
        }
        button.classList.toggle("starred", figure.starred);
        button.classList.toggle("unavailable", !figure.available);
        button.title = figure.available
            ? figureTitle
            : `${figureTitle} — reopen or rescan the source to load the image`;
        img.style.visibility = figure.available ? "" : "hidden";

        /*
         * Preserve the existing image if this figure
         * has not changed.
         */
        if (figure.available &&
            img.dataset.figureVersion !==
            figureVersion(figure)
        ) {
            img.dataset.figureVersion =
                figureVersion(figure);

            img.src = "";
            img.dataset.loaded = "0";
            img.classList.remove("loaded");

            const cached = thumbnailUrls.get(figure.key);
            if (cached?.version === figure.version) {
                img.src = cached.url;
                img.dataset.loaded = "1";
            } else {
                thumbnailObserver.observe(img);
            }
        } else if (!figure.available) {
            thumbnailObserver.unobserve(img);
            img.src = "";
            img.dataset.loaded = "0";
        }

        button.classList.toggle(
            "selected",
            figure.key === selectedKey
        );

        button.classList.toggle(
            "comparison-selected",
            selectedKeys.includes(figure.key)
        );
        card?.classList.toggle("selected", figure.key === selectedKey);
        card?.classList.toggle(
            "comparison-selected",
            selectedKeys.includes(figure.key)
        );

        fragment.appendChild(card ?? button);

        existingButtons.delete(
            figure.key
        );
    });

    /*
     * Anything left in existingButtons no longer
     * exists in the catalog.
     */
    existingButtons.forEach((button) => {
        (button.parentElement?.classList.contains("thumbnail-card")
            ? button.parentElement
            : button)?.remove();
    });

    thumbnails.appendChild(fragment);
}

function setupGalleryDragSelection(): void {
    const gallery = thumbnails;

    gallery.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
            return;
        }

        const target = event.target as HTMLElement;

        if (target.closest(".thumbnail, .thumbnail-star-button")) {
            return;
        }

        isGalleryDragging = true;

        const rect = gallery.getBoundingClientRect();

        galleryDragStartX =
            event.clientX - rect.left + gallery.scrollLeft;

        galleryDragStartY =
            event.clientY - rect.top + gallery.scrollTop;

        galleryDragAdditive =
            event.metaKey || event.ctrlKey;

        selectionRectangle =
            document.createElement("div");

        selectionRectangle.className =
            "gallery-selection-rectangle";

        selectionRectangle.style.left =
            `${galleryDragStartX}px`;

        selectionRectangle.style.top =
            `${galleryDragStartY}px`;

        selectionRectangle.style.width = "0px";
        selectionRectangle.style.height = "0px";

        gallery.appendChild(selectionRectangle);

        gallery.setPointerCapture(event.pointerId);

        event.preventDefault();
    });

    gallery.addEventListener("pointermove", (event) => {
        if (!isGalleryDragging) {
            return;
        }

        updateGallerySelectionRectangle(
            event.clientX,
            event.clientY
        );

        updateDragSelectedThumbnails();
    });

    const finishDrag = (event: PointerEvent) => {
        if (!isGalleryDragging) {
            return;
        }

        updateGallerySelectionRectangle(
            event.clientX,
            event.clientY
        );

        updateDragSelectedThumbnails();

        isGalleryDragging = false;

        selectionRectangle?.remove();
        selectionRectangle = undefined;

        if (gallery.hasPointerCapture(event.pointerId)) {
            gallery.releasePointerCapture(event.pointerId);
        }
    };

    gallery.addEventListener("pointerup", finishDrag);
    gallery.addEventListener("pointercancel", finishDrag);
}

function updateGallerySelectionRectangle(
    clientX: number,
    clientY: number
): void {
    if (!selectionRectangle) {
        return;
    }

    const rect =
        thumbnails.getBoundingClientRect();

    const currentX =
        clientX -
        rect.left +
        thumbnails.scrollLeft;

    const currentY =
        clientY -
        rect.top +
        thumbnails.scrollTop;

    const left =
        Math.min(
            galleryDragStartX,
            currentX
        );

    const top =
        Math.min(
            galleryDragStartY,
            currentY
        );

    const width =
        Math.abs(
            currentX -
            galleryDragStartX
        );

    const height =
        Math.abs(
            currentY -
            galleryDragStartY
        );

    selectionRectangle.style.left =
        `${left}px`;

    selectionRectangle.style.top =
        `${top}px`;

    selectionRectangle.style.width =
        `${width}px`;

    selectionRectangle.style.height =
        `${height}px`;
}

function updateDragSelectedThumbnails(): void {
    if (!selectionRectangle) {
        return;
    }

    const selectionRect =
        selectionRectangle.getBoundingClientRect();

    const buttons =
        Array.from(
            thumbnails.querySelectorAll<HTMLButtonElement>(
                ".thumbnail"
            )
        );

    const intersectingKeys: string[] = [];

    buttons.forEach((button) => {
        const rect =
            button.getBoundingClientRect();

        const intersects =
            rect.left < selectionRect.right &&
            rect.right > selectionRect.left &&
            rect.top < selectionRect.bottom &&
            rect.bottom > selectionRect.top;

        if (intersects && button.dataset.key) {
            intersectingKeys.push(
                button.dataset.key
            );
        }
    });

    if (intersectingKeys.length === 0) {
        if (!galleryDragAdditive) {
            selectedKeys = [];
            selectedKey = undefined;
            selectionAnchorKey = undefined;
            renderThumbnailSelection();
        }

        return;
    }

    if (galleryDragAdditive) {
        const combined =
            new Set(selectedKeys);

        intersectingKeys.forEach((key) => {
            combined.add(key);
        });

        selectedKeys =
            Array.from(combined);
    } else {
        selectedKeys =
            intersectingKeys;
    }

    /*
     * The last item under the drag becomes the
     * current/preview figure.
     */
    selectedKey =
        intersectingKeys[
            intersectingKeys.length - 1
        ];

    renderThumbnailSelection();
}

function figureVersion(
    figure: GalleryFigure
): string {
    return figure.version;
}

/* ─────────────────────────────────────────────
   Search UI
   ───────────────────────────────────────────── */

function updateSearchUI(): void {
    const query = search.value.trim();

    clearSearch.classList.toggle(
        "visible",
        query.length > 0
    );

    activeFilters.innerHTML = "";

    let hasFilters = false;

    if (query) {
        let label = "";

        const tagMatch =
            query.match(/^tag:(.+)$/i);

        const titleMatch =
            query.match(/^title:(.+)$/i);

        const cellMatch =
            query.match(/^cell:(.+)$/i);

        const figureMatch =
            query.match(/^figure:(.+)$/i);

        const codeMatch =
            query.match(/^code:(.+)$/i);

        if (tagMatch) {
            label =
                "Tag: " +
                tagMatch[1].trim();
        } else if (titleMatch) {
            label =
                "Title: " +
                titleMatch[1].trim();
        } else if (cellMatch) {
            label =
                "Cell: " +
                cellMatch[1].trim();
        } else if (figureMatch) {
            label =
                "Figure: " +
                figureMatch[1].trim();
        } else if (codeMatch) {
            label =
                "Code: " +
                codeMatch[1].trim();
        }

        if (label) {
            appendFilterChip(label, () => {
                search.value = "";
                updateSearchUI();
                render();
                search.focus();
            });

            hasFilters = true;
        }
    }

    activeTags.forEach((tag) => {
        appendFilterChip(tag, () => {
            removeTagFilter(tag);
        });

        hasFilters = true;
    });

    activeFilters.classList.toggle(
        "visible",
        hasFilters
    );
}

function appendFilterChip(
    label: string,
    onRemove: () => void
): void {
    const chip =
        document.createElement("div");

    chip.className = "filter-chip";

    const labelElement =
        document.createElement("span");

    labelElement.className =
        "filter-chip-label";

    labelElement.textContent = label;

    const remove =
        document.createElement("button");

    remove.className =
        "filter-chip-remove";

    remove.type = "button";
    remove.textContent = "×";

    remove.setAttribute(
        "aria-label",
        "Remove " + label
    );

    remove.addEventListener(
        "click",
        onRemove
    );

    chip.appendChild(labelElement);
    chip.appendChild(remove);

    activeFilters.appendChild(chip);
}

/* ─────────────────────────────────────────────
   Filtering
   ───────────────────────────────────────────── */

function filteredCatalog(): GalleryFigure[] {
    const query =
        search.value.trim().toLowerCase();

    return catalog.filter((figure) => {
        const isTitled =
            Boolean(figure.title);

        if (
            titleFilter === "titled" &&
            !isTitled
        ) {
            return false;
        }

        if (
            titleFilter === "untitled" &&
            isTitled
        ) {
            return false;
        }

        const figureTags =
            (figure.tags || []).map(
                (tag) => tag.toLowerCase()
            );

        const matchesTags =
            activeTags.every(
                (activeTag) =>
                    figureTags.includes(
                        activeTag.toLowerCase()
                    )
            );

        if (!matchesTags) {
            return false;
        }

        if (!query) {
            return true;
        }

        const title =
            figure.title || "";

        const tags =
            (figure.tags || []).join(" ");

        const code =
            figure.searchText || "";

        const cell =
            figure.imageUri ? "" : String(figure.cellIndex + 1);

        const number =
            String(figure.number);

        if (query.startsWith("cell:")) {
            return (
                cell ===
                query.slice(5).trim()
            );
        }

        if (query.startsWith("figure:")) {
            return (
                number ===
                query.slice(7).trim()
            );
        }

        if (query.startsWith("title:")) {
            return title
                .toLowerCase()
                .includes(
                    query.slice(6).trim()
                );
        }

        if (query.startsWith("tag:")) {
            const tagQuery =
                query
                    .slice(4)
                    .trim()
                    .toLowerCase();

            return figureTags.includes(
                tagQuery
            );
        }

        if (query.startsWith("code:")) {
            return code
                .toLowerCase()
                .includes(
                    query.slice(5).trim()
                );
        }

        return (
            code
                .toLowerCase()
                .includes(query) ||
            tags
                .toLowerCase()
                .includes(query) ||
            title
                .toLowerCase()
                .includes(query) ||
            cell === query ||
            number === query
        );
    });
}

function showVersionCodePanel(key: string): void {
    const figure = catalog.find((candidate) => candidate.key === key);

    if (!figure || !historyMode) {
        return;
    }

    document.querySelector(".version-code-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "version-code-overlay";
    const panel = document.createElement("section");
    panel.className = "version-code-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Historical cell code");

    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.textContent = `Cell code · Version ${figure.historyPosition ?? ""}`.trim();
    const close = document.createElement("button");
    close.type = "button";
    close.className = "version-code-close";
    close.textContent = "×";
    close.title = "Close";
    close.setAttribute("aria-label", "Close code panel");
    header.append(title, close);

    const location = document.createElement("p");
    location.className = "version-code-location";
    location.textContent = `${figure.notebookName} · Cell ${figure.cellIndex + 1}`;
    const code = document.createElement("pre");
    code.className = "version-code-source";
    code.textContent = figure.cellSource || "No source code was captured for this version.";
    const actions = document.createElement("footer");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy code";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "primary";
    restore.textContent = "Restore to cell";
    restore.disabled = !figure.cellSource;
    actions.append(copy, restore);
    panel.append(header, location, code, actions);
    overlay.append(panel);
    document.body.append(overlay);

    const dismiss = (): void => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            dismiss();
        }
    };
    close.addEventListener("click", dismiss);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) {
            dismiss();
        }
    });
    copy.addEventListener("click", () => {
        vscode.postMessage({ type: "copyVersionCode", key });
    });
    restore.addEventListener("click", () => {
        vscode.postMessage({ type: "restoreVersionCode", key });
        dismiss();
    });
    document.addEventListener("keydown", onKeyDown, true);
    close.focus();
}

/* ─────────────────────────────────────────────
   HTML escaping
   ───────────────────────────────────────────── */

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function convertImageToPng(
    blob: Blob
): Promise<Blob> {
    const bitmap =
        await createImageBitmap(blob);

    const canvas =
        document.createElement("canvas");

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context =
        canvas.getContext("2d");

    if (!context) {
        bitmap.close();

        throw new Error(
            "Could not create canvas context."
        );
    }

    context.drawImage(
        bitmap,
        0,
        0
    );

    bitmap.close();

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (result) => {
                if (result) {
                    resolve(result);
                } else {
                    reject(
                        new Error(
                            "Could not convert image to PNG."
                        )
                    );
                }
            },
            "image/png"
        );
    });
}
