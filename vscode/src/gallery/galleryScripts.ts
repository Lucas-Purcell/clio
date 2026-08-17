/// <reference lib="dom" />

interface GalleryFigure {
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

interface GalleryCatalogMessage {
    type: "setCatalog";
    figures: GalleryFigure[];
    selectedKey?: string;
    scope: "notebook" | "all";
    notebookName?: string;
    totalFigures: number;
}

interface GalleryThumbnailMessage {
    type: "thumbnail";
    key: string;
    mimeType: string;
    data: string;
}

interface GalleryPreviewMessage {
    type: "preview";
    key: string;
    mimeType: string;
    data: string;
    version: string;
}

type GalleryWebviewMessage =
    | GalleryCatalogMessage
    | GalleryThumbnailMessage
    | GalleryPreviewMessage;

interface GalleryVsCodeMessage {
    type:
        | "requestThumbnail"
        | "requestPreview"
        | "selectFigure"
        | "setScope"
        | "revealCell"
        | "savePNG"
        | "download"
        | "exportPdf"
        | "copyImage"
        | "exportAllPng"
        | "exportAllPdf";

    key?: string;

    keys?: string[];

    scope?: "notebook" | "all";
}

interface VsCodeApi {
    postMessage(message: GalleryVsCodeMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();

const imageIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 18 5-5 3.5 3.5 2.5-2.5 5.5 5.5"/></svg>';
const pdfIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5"/><text x="7" y="16" textLength="10" lengthAdjust="spacingAndGlyphs">PDF</text></svg>';
const saveIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 20v-6h8v6"/></svg>';

let catalog: GalleryFigure[] = [];
let selectedKey: string | undefined;
let scope: "notebook" | "all" = "notebook";
let titleFilter: "all" | "titled" | "untitled" = "all";
let activeTags: string[] = [];

let selectedKeys: string[] = [];
let selectionAnchorKey: string | undefined;
let comparisonMode = false;

const previewImages =
    new Map<string, string>();

const previewVersions =
    new Map<string, string>();

const previewCropUrls =
    new Map<string, { url: string; version: string }>();

let pendingCopyKey: string | undefined;


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

const preview =
    getElement<HTMLElement>("#preview");

const source =
    getElement<HTMLElement>("#source");

const reveal =
    getElement<HTMLButtonElement>("#reveal");

const downloadSelected =
    getElement<HTMLButtonElement>("#download-selected");

const filtersButton =
    getElement<HTMLButtonElement>("#filters-button");

const filterPanel =
    getElement<HTMLElement>("#filter-panel");

const compare =
    getElement<HTMLButtonElement>("#compare");

if (
    !thumbnails ||
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
    !compare ||
    !filtersButton ||
    !filterPanel
) {
    throw new Error("Clio gallery DOM is incomplete.");
}

setupGalleryDragSelection();

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

                vscode.postMessage({
                    type: "requestThumbnail",
                    key,
                });

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

        if (message.type === "thumbnail") {
            const img =
                document.querySelector<HTMLImageElement>(
                    `img[data-key="${CSS.escape(message.key)}"]`
                );

            if (!img) {
                return;
            }

            img.src =
                "data:" +
                message.mimeType +
                ";base64," +
                message.data;

            img.dataset.loaded = "1";

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

            const previousVersion = previewVersions.get(message.key);
            if (previousVersion && previousVersion !== message.version) {
                const cropped = previewCropUrls.get(message.key);
                if (cropped) {
                    URL.revokeObjectURL(cropped.url);
                    previewCropUrls.delete(message.key);
                }
            }

            previewVersions.set(
                message.key,
                message.version
            );

            if (pendingCopyKey === message.key) {
                pendingCopyKey = undefined;

                void copyImageToClipboard(
                    imageData,
                    message.mimeType
                );
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
                void trimPreviewMargins(message.key, message.version, img);
            };

            const cropped = previewCropUrls.get(message.key);
            img.src = cropped?.version === message.version
                ? cropped.url
                : "data:" + message.mimeType + ";base64," + message.data;

            return;
        }

        if (message.type !== "setCatalog") {
            return;
        }

        console.log(
            "GALLERY setCatalog:",
            message.figures.length,
            message.scope,
            message.notebookName
        );

        catalog = message.figures;
        selectedKey = message.selectedKey;
        scope = message.scope;

        title.textContent =
            scope === "all"
                ? "All open notebooks"
                : message.notebookName || "Clio";

        console.log(
            "GALLERY catalog after assignment:",
            catalog.length
        );

        render();
    }
);

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
                buttonScope !== "all"
            ) {
                return;
            }

            vscode.postMessage({
                type: "setScope",
                scope: buttonScope,
            });
        });
    });

/* ─────────────────────────────────────────────
   Filter menu
   ───────────────────────────────────────────── */

function positionFilterPanel(): void {
    filterPanel.classList.remove("open-left");

    const menuBounds = filterPanel.parentElement?.getBoundingClientRect();
    const panelWidth = filterPanel.getBoundingClientRect().width;

    if (!menuBounds || panelWidth === 0) {
        return;
    }

    const spaceOnRight = window.innerWidth - menuBounds.left;
    const spaceOnLeft = menuBounds.right;

    if (spaceOnRight < panelWidth && spaceOnLeft >= panelWidth) {
        filterPanel.classList.add("open-left");
    }
}

filtersButton.addEventListener("click", (event) => {
    event.stopPropagation();

    const willOpen = !filterPanel.classList.contains("open");
    filterPanel.classList.toggle("open", willOpen);

    if (willOpen) {
        positionFilterPanel();
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

window.addEventListener("resize", () => {
    if (filterPanel.classList.contains("open")) {
        positionFilterPanel();
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
    tagPanel.classList.toggle("open");
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

/* ─────────────────────────────────────────────
   Reveal
   ───────────────────────────────────────────── */

reveal.addEventListener("click", () => {
    vscode.postMessage({
        type: "revealCell",
    });
});

downloadSelected.addEventListener("click", () => {
    if (selectedKey) {
        vscode.postMessage({ type: "download", key: selectedKey });
    }
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
    downloadSelected.disabled = !selectedKey;
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
        });

    updateSelectionUI();
}

function updateComparisonUI(): void {
    compare.disabled = selectedKeys.length < 2;
    downloadSelected.disabled = !selectedKey;
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

    source.innerHTML = "";

    const comparisonLayout = figures.length === 2
        ? "comparison-grid--resizable"
        : figures.length > 4
            ? "comparison-grid--scrollable"
            : "comparison-grid--stacked";

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
                    "Save all PNG" +
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

                vscode.postMessage({
                    type: "download",
                    key,
                });
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

        selectedKeys.forEach((key) => {
            vscode.postMessage({
                type: "savePNG",
                key,
            });
        });
    });

    const exportAllPdf =
        document.querySelector<HTMLButtonElement>(
            "#export-all-pdf"
        );

    exportAllPdf?.addEventListener("click", () => {
        if (selectedKeys.length === 0) {
            return;
        }

        selectedKeys.forEach((key) => {
            vscode.postMessage({
                type: "exportPdf",
                key,
            });
        });
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

    /*
     * Determine the number of columns from the
     * actual rendered thumbnail positions.
     *
     * Buttons in the same row have the same offsetTop.
     */
    const currentTop = currentButton.offsetTop;

    const rowLength = thumbnailButtons.filter(
        (button) =>
            button.offsetTop === currentTop
    ).length;

    let nextIndex: number;

    switch (direction) {
        case "left":
            nextIndex = currentIndex - 1;
            break;

        case "right":
            nextIndex = currentIndex + 1;
            break;

        case "up":
            nextIndex = currentIndex - rowLength;
            break;

        case "down":
            nextIndex = currentIndex + rowLength;
            break;
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
            if (comparisonMode) {
                exitComparisonMode();
            } else if (selectedKeys.length > 1) {
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

/**
 * Trim a uniform outer PNG canvas for the on-screen preview only. The original
 * image data remains in previewImages, so copying, downloading, and exporting
 * preserve the source figure exactly as produced by the notebook.
 */
async function trimPreviewMargins(
    key: string,
    version: string,
    image: HTMLImageElement
): Promise<void> {
    if (previewCropUrls.get(key)?.version === version ||
        image.naturalWidth < 16 || image.naturalHeight < 16) {
        return;
    }

    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const sampleScale = Math.min(1, 1024 / longestSide);
    const sampleWidth = Math.max(1, Math.round(image.naturalWidth * sampleScale));
    const sampleHeight = Math.max(1, Math.round(image.naturalHeight * sampleScale));
    const sample = document.createElement("canvas");
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) {
        return;
    }

    context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const colorAt = (x: number, y: number): [number, number, number] => {
        const offset = (y * sampleWidth + x) * 4;
        return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    };
    const corners = [
        colorAt(0, 0),
        colorAt(sampleWidth - 1, 0),
        colorAt(0, sampleHeight - 1),
        colorAt(sampleWidth - 1, sampleHeight - 1),
    ];
    const background = [0, 1, 2].map((channel) =>
        Math.round(corners.reduce((total, color) => total + color[channel], 0) / corners.length)
    );

    let left = sampleWidth;
    let top = sampleHeight;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < sampleHeight; y += 1) {
        for (let x = 0; x < sampleWidth; x += 1) {
            const offset = (y * sampleWidth + x) * 4;
            const alpha = pixels[offset + 3];
            const distance = Math.abs(pixels[offset] - background[0]) +
                Math.abs(pixels[offset + 1] - background[1]) +
                Math.abs(pixels[offset + 2] - background[2]);
            if (alpha < 20 || distance < 42) {
                continue;
            }
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }

    if (right < left || bottom < top) {
        return;
    }

    const safetyPadding = 8;
    left = Math.max(0, left - safetyPadding);
    top = Math.max(0, top - safetyPadding);
    right = Math.min(sampleWidth - 1, right + safetyPadding);
    bottom = Math.min(sampleHeight - 1, bottom + safetyPadding);
    const cropWidth = right - left + 1;
    const cropHeight = bottom - top + 1;
    const removedFraction = 1 - (cropWidth * cropHeight) / (sampleWidth * sampleHeight);
    if (removedFraction < 0.08) {
        return;
    }

    const sourceX = Math.floor(left / sampleScale);
    const sourceY = Math.floor(top / sampleScale);
    const sourceWidth = Math.min(image.naturalWidth - sourceX, Math.ceil(cropWidth / sampleScale));
    const sourceHeight = Math.min(image.naturalHeight - sourceY, Math.ceil(cropHeight / sampleScale));
    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = sourceWidth;
    croppedCanvas.height = sourceHeight;
    const croppedContext = croppedCanvas.getContext("2d");
    if (!croppedContext) {
        return;
    }
    croppedContext.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
    );
    const blob = await new Promise<Blob | null>((resolve) =>
        croppedCanvas.toBlob(resolve, "image/png")
    );
    if (!blob) {
        return;
    }
    const url = URL.createObjectURL(blob);
    previewCropUrls.set(key, { url, version });

    if (selectedKey === key && image.isConnected) {
        image.src = url;
    }
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

    const figureTitle =
        selected.title ||
        "Figure " + selected.number;

    const tags = selected.tags || [];

    const existingImage =
        preview.querySelector<HTMLImageElement>(
            "#preview-image"
        );

    const existingFigureKey =
        preview.dataset.figureKey;

    /*
     * If the same figure is still selected,
     * don't rebuild the preview DOM.
     *
     * This is what prevents the preview from
     * flickering whenever the notebook changes.
     */
    if (
        existingFigureKey === selected.key &&
        existingImage
    ) {
        updatePreviewMetadata(selected);
        reveal.disabled = false;
        if (document.body.classList.contains("editor-mode")) {
            preview.querySelector(".preview-actions")?.append(reveal);
        }

        return;
    }

    preview.dataset.figureKey = selected.key;

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
                '<button id="reset-preview-zoom" type="button" title="Reset zoom" aria-label="Reset zoom">↻</button>' +
                '<button id="download-preview-figure" class="icon-button" type="button" title="Download figure" aria-label="Download figure">' + saveIcon + '</button>' +
            "</div>" +
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
            vscode.postMessage({ type: "download", key: selected.key });
        });

    preview
        .querySelector<HTMLButtonElement>("#download-preview-figure")
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
}

async function copyFigureToClipboard(
    key: string
): Promise<void> {
    console.log("COPY: started", key);

    const imageData = previewImages.get(key);

    console.log(
        "COPY: image available:",
        Boolean(imageData)
    );

    if (!imageData) {
        console.log(
            "COPY: requesting preview"
        );

        pendingCopyKey = key;

        vscode.postMessage({
            type: "requestPreview",
            key,
        });

        return;
    }

    try {
        console.log("COPY: fetching image");

        const response = await fetch(imageData);

        console.log(
            "COPY: fetch response",
            response.ok,
            response.status,
            response.type
        );

        const blob = await response.blob();

        console.log(
            "COPY: blob",
            blob.type,
            blob.size
        );

        console.log(
            "COPY: clipboard object",
            Boolean(navigator.clipboard)
        );

        console.log(
            "COPY: ClipboardItem",
            typeof ClipboardItem
        );

        const clipboardItem =
            new ClipboardItem({
                "image/png": blob,
            });

        console.log(
            "COPY: ClipboardItem created"
        );

        await navigator.clipboard.write([
            clipboardItem,
        ]);

        console.log(
            "COPY: clipboard write succeeded"
        );
    } catch (error) {
        console.error(
            "COPY: FAILED",
            error
        );
    }
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

    menu.innerHTML =
        '<button type="button" data-action="copy-image">' +
            "Copy Image" +
        "</button>" +
        '<button type="button" data-action="save-png">' +
            "Save PNG" +
        "</button>" +
        '<button type="button" data-action="export-pdf">' +
            "Export PDF" +
        "</button>";

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
            vscode.postMessage({
                type: "savePNG",
                key,
            });

            menu.remove();
        });

    menu
        .querySelector<HTMLButtonElement>(
            '[data-action="export-pdf"]'
        )
        ?.addEventListener("click", () => {
            vscode.postMessage({
                type: "exportPdf",
                key,
            });

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
    } catch (error) {
        console.error(
            "Failed to copy image to clipboard:",
            error
        );

        window.alert(
            "Could not copy the image to the clipboard."
        );
    }
}

function updatePreviewMetadata(
    selected: GalleryFigure
): void {
    const figureTitle =
        selected.title ||
        "Figure " + selected.number;

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
    console.log(
        "GALLERY render:",
        "catalog =", catalog.length,
        "filtered =", filteredCatalog().length,
        "selected =", selectedKey
    );

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

    count.textContent =
        results.length +
        " of " +
        catalog.length +
        " figures";

    updateThumbnailElements(results);


    updateSearchUI();
    updatePreview();
}

function updateThumbnailElements(
    results: GalleryFigure[]
): void {
    console.log(
        "GALLERY thumbnails:",
        results.length
    );
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

        const label =
            scope === "all"
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

        console.log(
            "GALLERY thumbnail label:",
            label
        );

        /*
         * Preserve the existing image if this figure
         * has not changed.
         */
        if (
            img.dataset.figureVersion !==
            figureVersion(figure)
        ) {
            img.dataset.figureVersion =
                figureVersion(figure);

            img.src = "";
            img.dataset.loaded = "0";
            img.classList.remove("loaded");

            thumbnailObserver.observe(img);
        }

        button.classList.toggle(
            "selected",
            figure.key === selectedKey
        );

        button.classList.toggle(
            "comparison-selected",
            selectedKeys.includes(figure.key)
        );

        fragment.appendChild(button);

        existingButtons.delete(
            figure.key
        );
    });

    /*
     * Anything left in existingButtons no longer
     * exists in the catalog.
     */
    existingButtons.forEach((button) => {
        button.remove();
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

        if (target.closest(".thumbnail")) {
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
            String(figure.cellIndex + 1);

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
