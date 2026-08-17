import { FigureRecord, imageStore, NotebookFigures } from "@clio/shared";
import { Widget } from "@lumino/widgets";
import { PDFDocument } from "pdf-lib";
import tagSvg from "../style/tag.svg";

type Scope = "notebook" | "all";
type TitleFilter = "all" | "titled" | "untitled";
type GalleryIcon = "tag" | "image" | "pdf" | "download" | "notebook" | "notebooks" | "locate";

const tagIconSvg = tagSvg.replaceAll("black", "currentColor");

function galleryIcon(icon: GalleryIcon): string {
    const icons: Record<GalleryIcon, string> = {
        tag: tagIconSvg,
        image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 18 5-5 3.5 3.5 2.5-2.5 5.5 5.5"/></svg>',
        pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5"/><text x="7" y="16" textLength="10" lengthAdjust="spacingAndGlyphs">PDF</text></svg>',
        download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 20v-6h8v6"/></svg>',
        notebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h11a2 2 0 0 1 2 2v15H6a2 2 0 0 0-2 2V5a2 2 0 0 1 2-2Z"/><path d="M7 7h8M7 11h8M7 15h5"/><path d="M4 5v17"/></svg>',
        notebooks: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h11a2 2 0 0 1 2 2v13H7a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M5 7H3v13a2 2 0 0 0 2 2h11"/></svg>',
        locate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M8 12h8M12 8v8"/></svg>',
    };
    return icons[icon];
}

export class FigureExplorerWidget extends Widget {
    private notebooks: readonly NotebookFigures[] = [];
    private currentNotebookUri: string | undefined;
    private scope: Scope;
    private query = "";
    private selectedFigureId: string | undefined;
    private readonly selectedFigureIds = new Set<string>();
    private selectionAnchorId: string | undefined;
    private comparisonMode = false;
    private tagMenuOpen = false;
    private filterMenuOpen = false;
    private titleFilter: TitleFilter = "all";
    private previewFigureId: string | undefined;
    private previewZoom = 1;
    private previewPanX = 0;
    private previewPanY = 0;
    private thumbnailScrollTop = 0;
    private scrollSelectionIntoView = false;
    private readonly comparisonTransforms = new Map<string, {
        zoom: number;
        panX: number;
        panY: number;
    }>();
    private readonly comparisonCardSizes = new Map<string, number>();
    private readonly activeTags = new Set<string>();
    private readonly objectUrls = new Map<string, { url: string; version: string }>();
    private readonly previewCropUrls = new Map<string, { url: string; version: string }>();

    constructor(
        private readonly onRevealCell: (figure: FigureRecord) => void,
        initialScope: Scope = "notebook",
        isExternalWindow = false
    ) {
        super();
        this.scope = initialScope;
        this.addClass("jp-FigureExplorer");
        if (isExternalWindow) {
            this.addClass("jp-mod-externalWindow");
        }
        this.title.label = "Clio";
        this.title.closable = true;
        this.node.tabIndex = 0;
        this.node.addEventListener("keydown", (event) => this.handleKeyDown(event));
        this.render();
    }

    setNotebooks(
        notebooks: readonly NotebookFigures[],
        currentNotebookUri?: string
    ): void {
        if (this.catalogMatches(notebooks, currentNotebookUri)) {
            return;
        }

        this.notebooks = notebooks;
        this.currentNotebookUri = currentNotebookUri;
        this.pruneObjectUrls();
        const figures = this.figuresForScope();
        if (!figures.some((figure) => figure.id === this.selectedFigureId)) {
            this.selectedFigureId = figures[0]?.id;
            this.selectedFigureIds.clear();
            if (this.selectedFigureId) {
                this.selectedFigureIds.add(this.selectedFigureId);
            }
        }
        this.render();
    }

    selectFigure(id: string): void {
        this.selectedFigureId = id;
        this.selectedFigureIds.clear();
        this.selectedFigureIds.add(id);
        this.selectionAnchorId = id;
        this.render();
        this.focusGallery();
    }

    showNotebook(uri: string): void {
        this.scope = "notebook";
        this.currentNotebookUri = uri;
        const figures = this.figuresForScope();
        this.selectedFigureId = figures[0]?.id;
        this.selectedFigureIds.clear();
        if (this.selectedFigureId) {
            this.selectedFigureIds.add(this.selectedFigureId);
        }
        this.render();
        this.focusGallery();
    }

    dispose(): void {
        this.revokeObjectUrls();
        super.dispose();
    }

    private render(focusSearch = false, caretPosition?: number): void {
        const previousGrid = this.node.querySelector<HTMLElement>(
            ".jp-FigureExplorer-grid"
        );
        if (previousGrid) {
            this.thumbnailScrollTop = previousGrid.scrollTop;
        }
        this.node.replaceChildren();

        const header = document.createElement("header");
        header.className = "jp-FigureExplorer-header";

        const heading = document.createElement("h2");
        heading.textContent = this.headingText();
        header.append(heading);

        const controls = document.createElement("div");
        controls.className = "jp-FigureExplorer-controls";
        const searchWrap = document.createElement("div");
        searchWrap.className = "jp-FigureExplorer-searchWrap";
        const search = document.createElement("input");
        search.className = "jp-FigureExplorer-search";
        search.type = "search";
        search.placeholder = "Search figures…";
        search.value = this.query;
        search.addEventListener("input", () => {
            this.query = search.value;
            this.render(true, search.selectionStart ?? search.value.length);
        });
        searchWrap.append(search);

        if (this.query) {
            const clearSearch = document.createElement("button");
            clearSearch.type = "button";
            clearSearch.className = "jp-FigureExplorer-clearSearch";
            clearSearch.textContent = "×";
            clearSearch.setAttribute("aria-label", "Clear search");
            clearSearch.addEventListener("click", () => {
                this.query = "";
                this.render(true, 0);
            });
            searchWrap.append(clearSearch);
        }

        controls.append(searchWrap);

        const availableTags = [...new Set(this.figuresForScope().flatMap((figure) => figure.tags))]
            .sort((left, right) => left.localeCompare(right));

        if (availableTags.length > 0) {
            controls.append(this.createTagPicker(availableTags));
        }

        controls.append(this.createScopeButton("notebook", "This notebook"));
        controls.append(this.createScopeButton("all", "All open"));
        controls.append(this.createFilterPicker());
        header.append(controls);

        const activeFilters = this.createActiveFilters();
        if (activeFilters) {
            header.append(activeFilters);
        }

        if (focusSearch) {
            queueMicrotask(() => {
                search.focus();
                const caret = caretPosition ?? search.value.length;
                search.setSelectionRange(caret, caret);
            });
        }

        this.node.append(header);

        const figures = this.filteredFigures();
        const resultRow = document.createElement("div");
        resultRow.className = "jp-FigureExplorer-resultRow";
        const count = document.createElement("p");
        count.className = "jp-FigureExplorer-count";
        count.textContent = `${figures.length} figure${figures.length === 1 ? "" : "s"}`;
        resultRow.append(count);
        resultRow.append(this.createSelectionActions(figures));
        this.node.append(resultRow);

        if (figures.length === 0) {
            const empty = document.createElement("p");
            empty.className = "jp-FigureExplorer-empty";
            empty.textContent = this.emptyText();
            this.node.append(empty);
            return;
        }

        if (this.comparisonMode) {
            this.node.append(this.createComparison(figures));
            return;
        }

        const content = document.createElement("div");
        content.className = "jp-FigureExplorer-content";

        const grid = document.createElement("div");
        grid.className = "jp-FigureExplorer-grid";

        for (const [index, figure] of figures.entries()) {
            grid.append(this.createCard(figure, index + 1));
        }
        this.setupGridSelection(grid, figures);
        grid.addEventListener("scroll", () => {
            this.thumbnailScrollTop = grid.scrollTop;
        });

        content.append(grid);
        content.append(this.createPreview(figures));
        this.node.append(content);

        queueMicrotask(() => {
            grid.scrollTop = this.thumbnailScrollTop;
        });
    }

    private createSelectionActions(figures: readonly FigureRecord[]): HTMLElement {
        const actions = document.createElement("div");
        actions.className = "jp-FigureExplorer-resultActions";
        const selected = figures.filter((figure) => this.selectedFigureIds.has(figure.id));

        const addButton = (
            icon: GalleryIcon | string,
            label: string,
            action: () => void | Promise<void>,
            disabled = false,
            textButton = false
        ): void => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = textButton
                ? "jp-FigureExplorer-textAction"
                : "jp-FigureExplorer-iconButton";
            if (icon === "tag" || icon === "image" || icon === "pdf" || icon === "download") {
                button.innerHTML = galleryIcon(icon);
            } else {
                button.textContent = icon;
            }
            button.title = label;
            button.setAttribute("aria-label", label);
            button.disabled = disabled;
            button.addEventListener("click", () => { void action(); });
            actions.append(button);
        };

        if (this.comparisonMode) {
            addButton("Save all PNG", "Save all selected figures as PNG", () => this.savePng(selected), selected.length === 0, true);
            addButton("Export all PDF", "Export all selected figures as PDF", () => this.exportPdf(selected), selected.length === 0, true);
        } else {
            addButton(
                "download",
                selected.length > 1
                    ? `Download ${selected.length} selected figures`
                    : "Download figure",
                async () => {
                    for (const figure of selected) {
                        await this.downloadFigure(figure);
                    }
                },
                selected.length === 0
            );
        }
        addButton(
            this.comparisonMode ? "×" : "⇄",
            this.comparisonMode
                ? "Exit comparison"
                : `Compare ${selected.length} selected figure${selected.length === 1 ? "" : "s"}`,
            () => {
                this.comparisonMode = !this.comparisonMode;
                this.render();
            },
            !this.comparisonMode && selected.length < 2
        );
        return actions;
    }

    private createComparison(figures: readonly FigureRecord[]): HTMLElement {
        const selected = figures.filter((figure) => this.selectedFigureIds.has(figure.id));
        if (selected.length < 2) {
            this.comparisonMode = false;
            this.render();
            return document.createElement("div");
        }

        const comparison = document.createElement("section");
        comparison.className = "jp-FigureExplorer-comparison";
        const comparisonHeader = document.createElement("div");
        comparisonHeader.className = "jp-FigureExplorer-comparisonHeader";
        const heading = document.createElement("h3");
        heading.textContent = `Figure comparison · ${selected.length} figures`;
        comparisonHeader.append(heading);
        comparison.append(comparisonHeader);

        const grid = document.createElement("div");
        grid.className = "jp-FigureExplorer-comparisonGrid";
        const supportsResizableComparison =
            this.hasClass("jp-mod-externalWindow") ||
            this.hasClass("jp-mod-tabGallery");
        grid.classList.toggle(
            "jp-mod-resizable",
            supportsResizableComparison && selected.length === 2
        );
        grid.classList.toggle(
            "jp-mod-scrollable",
            supportsResizableComparison && selected.length > 4
        );
        for (const [index, figure] of selected.entries()) {
            if (index > 0 && grid.classList.contains("jp-mod-resizable")) {
                grid.append(this.createComparisonDivider(
                    selected[index - 1],
                    figure
                ));
            }

            const card = document.createElement("article");
            card.className = "jp-FigureExplorer-comparisonCard";
            card.dataset.figureId = figure.id;
            card.style.setProperty(
                "--jp-figure-explorer-comparison-size",
                String(this.comparisonCardSizes.get(figure.id) ?? 1)
            );
            const viewport = document.createElement("div");
            viewport.className = "jp-FigureExplorer-comparisonViewport";
            const image = document.createElement("img");
            image.alt = figure.title ?? `Figure ${index + 1}`;
            image.draggable = false;
            image.src = this.imageUrl(figure);
            viewport.append(image);
            this.setupComparisonZoom(viewport, image, figure.id);

            const hoverActions = document.createElement("div");
            hoverActions.className = "jp-FigureExplorer-imageHoverActions";
            const reset = document.createElement("button");
            reset.type = "button";
            reset.className = "jp-FigureExplorer-iconButton";
            reset.textContent = "↻";
            reset.title = "Reset zoom";
            reset.setAttribute("aria-label", "Reset zoom");
            reset.addEventListener("pointerdown", (event) => event.stopPropagation());
            reset.addEventListener("click", () => {
                this.comparisonTransforms.delete(figure.id);
                this.render();
            });
            const download = document.createElement("button");
            download.type = "button";
            download.className = "jp-FigureExplorer-iconButton";
            download.innerHTML = galleryIcon("download");
            download.title = "Download figure";
            download.setAttribute("aria-label", "Download figure");
            download.addEventListener("pointerdown", (event) => event.stopPropagation());
            download.addEventListener("click", () => { void this.downloadFigure(figure); });
            hoverActions.append(reset, download);
            viewport.append(hoverActions);
            card.append(viewport);

            const label = document.createElement("h4");
            label.textContent = figure.title ?? `Figure ${index + 1}`;
            card.append(label);

            grid.append(card);
        }
        comparison.append(grid);
        return comparison;
    }

    private createComparisonDivider(
        leftFigure: FigureRecord,
        rightFigure: FigureRecord
    ): HTMLElement {
        const divider = document.createElement("div");
        divider.className = "jp-FigureExplorer-comparisonDivider";
        divider.setAttribute("role", "separator");
        divider.setAttribute("aria-orientation", "vertical");
        divider.title = "Drag to resize figures";

        divider.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }

            const grid = divider.parentElement;
            const leftCard = grid?.querySelector<HTMLElement>(
                `[data-figure-id="${leftFigure.id}"]`
            );
            const rightCard = grid?.querySelector<HTMLElement>(
                `[data-figure-id="${rightFigure.id}"]`
            );

            if (!grid || !leftCard || !rightCard) {
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
            const leftWeight = this.comparisonCardSizes.get(leftFigure.id) ?? 1;
            const rightWeight = this.comparisonCardSizes.get(rightFigure.id) ?? 1;
            const combinedWeight = leftWeight + rightWeight;
            divider.setPointerCapture(event.pointerId);
            divider.classList.add("jp-mod-resizing");

            const resize = (moveEvent: PointerEvent): void => {
                const nextLeftWidth = Math.min(
                    combinedWidth - minimumWidth,
                    Math.max(minimumWidth, leftBounds.width + moveEvent.clientX - startX)
                );
                const nextLeftWeight = combinedWeight * nextLeftWidth / combinedWidth;
                const nextRightWeight = combinedWeight - nextLeftWeight;

                this.comparisonCardSizes.set(leftFigure.id, nextLeftWeight);
                this.comparisonCardSizes.set(rightFigure.id, nextRightWeight);
                leftCard.style.setProperty(
                    "--jp-figure-explorer-comparison-size",
                    String(nextLeftWeight)
                );
                rightCard.style.setProperty(
                    "--jp-figure-explorer-comparison-size",
                    String(nextRightWeight)
                );
            };

            const stop = (): void => {
                divider.classList.remove("jp-mod-resizing");
                divider.removeEventListener("pointermove", resize);
                divider.removeEventListener("pointerup", stop);
                divider.removeEventListener("pointercancel", stop);
            };

            divider.addEventListener("pointermove", resize);
            divider.addEventListener("pointerup", stop);
            divider.addEventListener("pointercancel", stop);
        });

        return divider;
    }

    private setupComparisonZoom(
        viewport: HTMLElement,
        image: HTMLImageElement,
        id: string
    ): void {
        const state = this.comparisonTransforms.get(id) ?? {
            zoom: 1,
            panX: 0,
            panY: 0,
        };
        this.comparisonTransforms.set(id, state);
        const update = (): void => {
            image.style.transform =
                `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
        };

        viewport.addEventListener("wheel", (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                state.zoom = Math.min(8, Math.max(1, state.zoom * Math.exp(-event.deltaY * 0.002)));
                if (state.zoom === 1) {
                    state.panX = 0;
                    state.panY = 0;
                }
                update();
            } else if (state.zoom > 1) {
                event.preventDefault();
                state.panX -= event.deltaX;
                state.panY -= event.deltaY;
                update();
            }
        }, { passive: false });

        viewport.addEventListener("dragstart", (event) => event.preventDefault());
        viewport.addEventListener("dblclick", () => {
            state.zoom = 1;
            state.panX = 0;
            state.panY = 0;
            update();
        });

        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        viewport.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || state.zoom <= 1) {
                return;
            }
            event.preventDefault();
            dragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
            viewport.setPointerCapture(event.pointerId);
        });
        viewport.addEventListener("pointermove", (event) => {
            if (!dragging) {
                return;
            }
            state.panX += event.clientX - lastX;
            state.panY += event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;
            update();
        });
        const stop = (): void => { dragging = false; };
        viewport.addEventListener("pointerup", stop);
        viewport.addEventListener("pointercancel", stop);
        update();
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape" && (this.tagMenuOpen || this.filterMenuOpen)) {
            event.preventDefault();
            this.tagMenuOpen = false;
            this.filterMenuOpen = false;
            this.render();
            return;
        }

        if (event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLButtonElement) {
            return;
        }

        const figures = this.filteredFigures();
        if (figures.length === 0) {
            return;
        }

        const index = Math.max(0, figures.findIndex((figure) => figure.id === this.selectedFigureId));
        const grid = this.node.querySelector<HTMLElement>(".jp-FigureExplorer-grid");
        const columns = grid
            ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length
            : 1;
        const direction = event.key === "ArrowLeft"
            ? -1
            : event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowUp"
                    ? -columns
                    : event.key === "ArrowDown"
                        ? columns
                        : 0;

        if (direction !== 0) {
            event.preventDefault();
            const nextIndex = Math.max(0, Math.min(figures.length - 1, index + direction));
            const next = figures[nextIndex];
            this.scrollSelectionIntoView = true;
            if (event.shiftKey) {
                this.selectRange(next.id, figures);
            } else {
                this.selectFigure(next.id);
            }
            return;
        }

        if (event.key === "Escape" && this.selectedFigureIds.size > 1) {
            event.preventDefault();
            this.selectedFigureIds.clear();
            if (this.selectedFigureId) {
                this.selectedFigureIds.add(this.selectedFigureId);
            }
            this.render();
        }
    }

    private createScopeButton(scope: Scope, label: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "jp-FigureExplorer-scope";
        button.innerHTML = `${galleryIcon(scope === "notebook" ? "notebook" : "notebooks")}<span class="jp-FigureExplorer-scopeLabel">${label}</span>`;
        button.title = label;
        button.setAttribute("aria-label", label);
        button.classList.toggle("jp-mod-active", this.scope === scope);
        button.disabled = scope === "notebook" && !this.currentNotebookUri;
        button.addEventListener("click", () => {
            this.scope = scope;
            this.tagMenuOpen = false;
            this.filterMenuOpen = false;
            this.render();
        });
        return button;
    }

    private createTagPicker(tags: readonly string[]): HTMLElement {
        const picker = document.createElement("div");
        picker.className = "jp-FigureExplorer-tagPicker";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "jp-FigureExplorer-addTag";
        button.innerHTML = galleryIcon("tag");
        const tagLabel = this.activeTags.size > 0
            ? `Add tag filter (${this.activeTags.size} active)`
            : "Add tag filter";
        button.title = tagLabel;
        button.setAttribute("aria-label", tagLabel);
        button.setAttribute("aria-expanded", String(this.tagMenuOpen));
        button.addEventListener("click", () => {
            this.tagMenuOpen = !this.tagMenuOpen;
            this.filterMenuOpen = false;
            this.render();
        });
        picker.append(button);

        if (!this.tagMenuOpen) {
            return picker;
        }

        const menu = document.createElement("div");
        menu.className = "jp-FigureExplorer-tagMenu";

        for (const tag of tags) {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "jp-FigureExplorer-tagOption";
            option.textContent = `#${tag}`;
            option.classList.toggle("jp-mod-active", this.activeTags.has(tag));
            option.addEventListener("click", () => {
                if (this.activeTags.has(tag)) {
                    this.activeTags.delete(tag);
                } else {
                    this.activeTags.add(tag);
                }
                this.render();
            });
            menu.append(option);
        }

        picker.append(menu);
        this.dismissMenuOnOutsidePointer(picker, "tag");
        return picker;
    }

    private createFilterPicker(): HTMLElement {
        const picker = document.createElement("div");
        picker.className = "jp-FigureExplorer-filterPicker";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "jp-FigureExplorer-filtersButton";
        button.textContent = "Filters ▾";
        button.setAttribute("aria-expanded", String(this.filterMenuOpen));
        button.addEventListener("click", () => {
            this.filterMenuOpen = !this.filterMenuOpen;
            this.tagMenuOpen = false;
            this.render();
        });
        picker.append(button);

        if (!this.filterMenuOpen) {
            return picker;
        }

        const menu = document.createElement("div");
        menu.className = "jp-FigureExplorer-filterMenu";
        const options: Array<[TitleFilter, string]> = [
            ["all", "All figures"],
            ["titled", "Titled"],
            ["untitled", "Untitled"],
        ];

        for (const [filter, label] of options) {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "jp-FigureExplorer-filterOption";
            option.textContent = label;
            option.classList.toggle("jp-mod-active", this.titleFilter === filter);
            option.addEventListener("click", () => {
                this.titleFilter = filter;
                this.filterMenuOpen = false;
                this.render();
            });
            menu.append(option);
        }

        picker.append(menu);
        this.dismissMenuOnOutsidePointer(picker, "filter");
        return picker;
    }

    private dismissMenuOnOutsidePointer(
        picker: HTMLElement,
        menu: "tag" | "filter"
    ): void {
        queueMicrotask(() => {
            document.addEventListener("pointerdown", (event) => {
                if (picker.contains(event.target as Node)) {
                    return;
                }

                if (menu === "tag") {
                    this.tagMenuOpen = false;
                } else {
                    this.filterMenuOpen = false;
                }
                this.render();
            }, { once: true });
        });
    }

    private createActiveFilters(): HTMLElement | undefined {
        if (this.activeTags.size === 0 && this.titleFilter === "all") {
            return undefined;
        }

        const container = document.createElement("div");
        container.className = "jp-FigureExplorer-activeFilters";

        const addChip = (label: string, remove: () => void): void => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "jp-FigureExplorer-filterChip";
            chip.textContent = `${label} ×`;
            chip.addEventListener("click", () => {
                remove();
                this.render();
            });
            container.append(chip);
        };

        for (const tag of this.activeTags) {
            addChip(`#${tag}`, () => this.activeTags.delete(tag));
        }

        if (this.titleFilter !== "all") {
            addChip(
                this.titleFilter === "titled" ? "Titled" : "Untitled",
                () => { this.titleFilter = "all"; }
            );
        }

        return container;
    }

    private createCard(figure: FigureRecord, number: number): HTMLElement {
        const card = document.createElement("article");
        card.className = "jp-FigureExplorer-card";
        card.classList.toggle("jp-mod-selected", figure.id === this.selectedFigureId);
        card.title = figure.title ?? `Figure ${number}`;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", figure.title ?? `Figure ${number}`);
        card.tabIndex = 0;
        card.dataset.figureId = figure.id;
        card.classList.toggle("jp-mod-multiSelected", this.selectedFigureIds.has(figure.id));
        let pendingClick: number | undefined;
        card.addEventListener("click", (event) => {
            if (event.detail === 2) {
                if (pendingClick) {
                    window.clearTimeout(pendingClick);
                }
                this.onRevealCell(figure);
                return;
            }

            pendingClick = window.setTimeout(() => {
                const figures = this.filteredFigures();
                if (event.shiftKey) {
                    this.selectRange(figure.id, figures);
                } else if (event.metaKey || event.ctrlKey) {
                    this.toggleFigureSelection(figure.id);
                } else {
                    this.selectFigure(figure.id);
                }
            }, 220);
        });
        card.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            this.showFigureContextMenu(event, figure);
        });

        const image = document.createElement("img");
        image.alt = figure.title ?? `Figure ${number}`;
        const cropped = this.previewCropUrls.get(figure.id);
        image.src = cropped?.version === figure.version
            ? cropped.url
            : this.imageUrl(figure);
        if (!cropped || cropped.version !== figure.version) {
            image.addEventListener("load", () => {
                void this.trimPreviewMargins(figure, image);
            }, { once: true });
        }
        card.append(image);

        const label = document.createElement("span");
        label.className = "jp-FigureExplorer-thumbnailLabel";
        label.textContent = figure.title ?? `Figure ${number}`;
        card.append(label);

        return card;
    }

    private toggleFigureSelection(id: string): void {
        if (this.selectedFigureIds.has(id)) {
            this.selectedFigureIds.delete(id);
        } else {
            this.selectedFigureIds.add(id);
        }
        this.selectedFigureId = id;
        this.selectionAnchorId = id;
        this.render();
        this.focusGallery();
    }

    private selectRange(id: string, figures: readonly FigureRecord[]): void {
        const anchor = this.selectionAnchorId ?? this.selectedFigureId;
        const anchorIndex = figures.findIndex((figure) => figure.id === anchor);
        const targetIndex = figures.findIndex((figure) => figure.id === id);
        if (anchorIndex < 0 || targetIndex < 0) {
            this.selectFigure(id);
            return;
        }

        this.selectedFigureIds.clear();
        for (const figure of figures.slice(
            Math.min(anchorIndex, targetIndex),
            Math.max(anchorIndex, targetIndex) + 1
        )) {
            this.selectedFigureIds.add(figure.id);
        }
        this.selectedFigureId = id;
        this.render();
        this.focusGallery();
    }

    private setupGridSelection(grid: HTMLElement, figures: readonly FigureRecord[]): void {
        grid.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || (event.target as HTMLElement).closest(".jp-FigureExplorer-card")) {
                return;
            }

            const startX = event.clientX;
            const startY = event.clientY;
            const selection = document.createElement("div");
            selection.className = "jp-FigureExplorer-selectionRectangle";
            grid.append(selection);
            grid.setPointerCapture(event.pointerId);

            const update = (moveEvent: PointerEvent): string[] => {
                const left = Math.min(startX, moveEvent.clientX);
                const top = Math.min(startY, moveEvent.clientY);
                const width = Math.abs(moveEvent.clientX - startX);
                const height = Math.abs(moveEvent.clientY - startY);
                const gridRect = grid.getBoundingClientRect();
                selection.style.left = `${left - gridRect.left + grid.scrollLeft}px`;
                selection.style.top = `${top - gridRect.top + grid.scrollTop}px`;
                selection.style.width = `${width}px`;
                selection.style.height = `${height}px`;
                const selected: string[] = [];
                grid.querySelectorAll<HTMLElement>(".jp-FigureExplorer-card").forEach((card) => {
                    const rect = card.getBoundingClientRect();
                    const intersects = rect.left < left + width && rect.right > left &&
                        rect.top < top + height && rect.bottom > top;
                    card.classList.toggle("jp-mod-multiSelected", intersects);
                    if (intersects && card.dataset.figureId) {
                        selected.push(card.dataset.figureId);
                    }
                });
                return selected;
            };

            let selected: string[] = [];
            const move = (moveEvent: PointerEvent): void => { selected = update(moveEvent); };
            const finish = (): void => {
                grid.removeEventListener("pointermove", move);
                selection.remove();
                if (selected.length > 0) {
                    this.selectedFigureIds.clear();
                    selected.forEach((id) => this.selectedFigureIds.add(id));
                    this.selectedFigureId = selected[selected.length - 1];
                    this.selectionAnchorId = this.selectedFigureId;
                    this.render();
                }
            };
            grid.addEventListener("pointermove", move);
            grid.addEventListener("pointerup", finish, { once: true });
            grid.addEventListener("pointercancel", finish, { once: true });
        });
    }

    private createPreview(figures: readonly FigureRecord[]): HTMLElement {
        const preview = document.createElement("aside");
        preview.className = "jp-FigureExplorer-preview";
        const figure = figures.find((item) => item.id === this.selectedFigureId);

        if (!figure) {
            preview.textContent = "Select a figure to preview it.";
            return preview;
        }

        const number = figures.indexOf(figure) + 1;

        if (this.previewFigureId !== figure.id) {
            this.previewFigureId = figure.id;
            this.previewZoom = 1;
            this.previewPanX = 0;
            this.previewPanY = 0;
        }

        const previewHeader = document.createElement("div");
        previewHeader.className = "jp-FigureExplorer-previewHeader";
        const heading = document.createElement("h3");
        heading.textContent = figure.title ?? `Figure ${number}`;
        previewHeader.append(heading);

        const viewport = document.createElement("div");
        viewport.className = "jp-FigureExplorer-previewViewport";

        const image = document.createElement("img");
        image.className = "jp-FigureExplorer-previewImage";
        image.alt = figure.title ?? "Selected figure";
        image.draggable = false;
        image.src = this.imageUrl(figure);
        viewport.append(image);

        const updateTransform = (): void => {
            image.style.transform =
                `translate(${this.previewPanX}px, ${this.previewPanY}px) scale(${this.previewZoom})`;
        };

        viewport.addEventListener("wheel", (event) => {
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                const factor = Math.exp(-event.deltaY * 0.002);
                this.previewZoom = Math.min(8, Math.max(1, this.previewZoom * factor));
                if (this.previewZoom === 1) {
                    this.previewPanX = 0;
                    this.previewPanY = 0;
                }
                updateTransform();
                return;
            }

            if (this.previewZoom > 1) {
                event.preventDefault();
                this.previewPanX -= event.deltaX;
                this.previewPanY -= event.deltaY;
                updateTransform();
            }
        }, { passive: false });

        viewport.addEventListener("dragstart", (event) => event.preventDefault());
        viewport.addEventListener("dblclick", () => {
            this.previewZoom = 1;
            this.previewPanX = 0;
            this.previewPanY = 0;
            updateTransform();
        });

        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        viewport.addEventListener("pointerdown", (event) => {
            if (this.previewZoom <= 1 || event.button !== 0) {
                return;
            }

            dragging = true;
            event.preventDefault();
            lastX = event.clientX;
            lastY = event.clientY;
            viewport.setPointerCapture(event.pointerId);
            viewport.classList.add("jp-mod-panning");
        });

        viewport.addEventListener("pointermove", (event) => {
            if (!dragging) {
                return;
            }

            this.previewPanX += event.clientX - lastX;
            this.previewPanY += event.clientY - lastY;
            lastX = event.clientX;
            lastY = event.clientY;
            updateTransform();
        });

        const stopPanning = (): void => {
            dragging = false;
            viewport.classList.remove("jp-mod-panning");
        };
        viewport.addEventListener("pointerup", stopPanning);
        viewport.addEventListener("pointercancel", stopPanning);
        updateTransform();

        const zoomControls = document.createElement("div");
        zoomControls.className = "jp-FigureExplorer-zoomControls";
        const addZoomButton = (
            label: string,
            action: () => void,
            title = label
        ): void => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.title = title;
            button.setAttribute("aria-label", title);
            button.addEventListener("click", () => {
                action();
                updateTransform();
            });
            zoomControls.append(button);
        };
        addZoomButton("−", () => {
            this.previewZoom = Math.max(1, this.previewZoom / 1.25);
            if (this.previewZoom === 1) {
                this.previewPanX = 0;
                this.previewPanY = 0;
            }
        });
        addZoomButton("+", () => { this.previewZoom = Math.min(8, this.previewZoom * 1.25); });
        previewHeader.append(zoomControls);

        const hoverActions = document.createElement("div");
        hoverActions.className = "jp-FigureExplorer-imageHoverActions";
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "jp-FigureExplorer-iconButton";
        reset.textContent = "↻";
        reset.title = "Reset zoom";
        reset.setAttribute("aria-label", "Reset zoom");
        reset.addEventListener("pointerdown", (event) => event.stopPropagation());
        reset.addEventListener("click", () => {
            this.previewZoom = 1;
            this.previewPanX = 0;
            this.previewPanY = 0;
            updateTransform();
        });
        const download = document.createElement("button");
        download.type = "button";
        download.className = "jp-FigureExplorer-iconButton";
        download.innerHTML = galleryIcon("download");
        download.title = "Download figure";
        download.setAttribute("aria-label", "Download figure");
        download.addEventListener("pointerdown", (event) => event.stopPropagation());
        download.addEventListener("click", () => { void this.downloadFigure(figure); });
        hoverActions.append(reset, download);
        viewport.append(hoverActions);

        const reveal = document.createElement("button");
        reveal.type = "button";
        reveal.className = "jp-FigureExplorer-reveal";
        reveal.innerHTML = galleryIcon("locate");
        reveal.title = "Reveal cell";
        reveal.setAttribute("aria-label", "Reveal cell");
        reveal.addEventListener("click", () => this.onRevealCell(figure));
        previewHeader.append(reveal);

        preview.append(previewHeader);
        preview.append(viewport);

        if (figure.tags.length > 0) {
            const tags = document.createElement("div");
            tags.className = "jp-FigureExplorer-tags";
            for (const tag of figure.tags) {
                const tagButton = document.createElement("button");
                tagButton.type = "button";
                tagButton.className = "jp-FigureExplorer-previewTag";
                tagButton.textContent = `#${tag}`;
                tagButton.title = `Filter by #${tag}`;
                tagButton.addEventListener("click", () => {
                    this.activeTags.add(tag);
                    this.tagMenuOpen = false;
                    this.render();
                });
                tags.append(tagButton);
            }
            preview.append(tags);
        }

        return preview;
    }

    private figuresForScope(): FigureRecord[] {
        const notebooks = this.scope === "all"
            ? this.notebooks
            : this.notebooks.filter((notebook) => notebook.uri === this.currentNotebookUri);

        return notebooks.flatMap((notebook) => [...notebook.figures]);
    }

    private filteredFigures(): FigureRecord[] {
        const query = this.query.trim().toLowerCase();

        return this.figuresForScope().filter((figure) => {
            const matchesQuery = !query || figure.searchText.includes(query);
            const matchesTags = [...this.activeTags].every((tag) => figure.tags.includes(tag));
            const matchesTitle = this.titleFilter === "all" ||
                (this.titleFilter === "titled" ? Boolean(figure.title) : !figure.title);
            return matchesQuery && matchesTags && matchesTitle;
        });
    }

    private headingText(): string {
        if (this.scope === "all") {
            return "All open notebooks";
        }

        return this.notebooks.find((notebook) => notebook.uri === this.currentNotebookUri)?.name
            ?? "Clio";
    }

    private emptyText(): string {
        if (this.query || this.activeTags.size > 0 || this.titleFilter !== "all") {
            return "No figures match the current filters.";
        }

        return this.scope === "all"
            ? "No PNG figures were found in open notebooks."
            : "No PNG figures were found in this notebook.";
    }

    private savePng(figures: readonly FigureRecord[]): void {
        for (const figure of figures) {
            const bytes = imageStore.get(figure.id);
            if (!bytes) {
                continue;
            }
            this.download(
                new Blob([Uint8Array.from(bytes)], { type: figure.mimeType }),
                this.exportFileName(figure, "png")
            );
        }
    }

    private async exportPdf(figures: readonly FigureRecord[]): Promise<void> {
        if (figures.length === 0) {
            return;
        }

        const output = await this.createPdfBytes(figures);
        const base = figures.length === 1
            ? this.exportFileName(figures[0], "pdf")
            : "clio-export.pdf";
        const blobBytes = new Uint8Array(output.length);
        blobBytes.set(output);
        this.download(new Blob([blobBytes.buffer], { type: "application/pdf" }), base);
    }

    private async downloadFigure(figure: FigureRecord): Promise<void> {
        const bytes = imageStore.get(figure.id);

        if (!bytes) {
            this.showNotice("Image data is no longer available.");
            return;
        }

        type SaveHandle = {
            name: string;
            createWritable: () => Promise<{
                write: (data: Uint8Array) => Promise<void>;
                close: () => Promise<void>;
            }>;
        };
        type PickerWindow = Window & {
            showSaveFilePicker?: (options: unknown) => Promise<SaveHandle>;
        };
        const picker = (window as PickerWindow).showSaveFilePicker;

        if (!picker) {
            this.showNotice("Choose PNG or PDF from the figure's right-click menu in this browser.");
            return;
        }

        try {
            const handle = await picker({
                suggestedName: this.exportFileName(figure, "png"),
                types: [
                    { description: "PNG image", accept: { "image/png": [".png"] } },
                    { description: "PDF document", accept: { "application/pdf": [".pdf"] } },
                ],
            });
            const output = handle.name.toLowerCase().endsWith(".pdf")
                ? await this.createPdfBytes([figure])
                : Uint8Array.from(bytes);
            const writable = await handle.createWritable();
            await writable.write(output);
            await writable.close();
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                this.showNotice("Could not download the figure.");
            }
        }
    }

    private async createPdfBytes(figures: readonly FigureRecord[]): Promise<Uint8Array> {
        const pdf = await PDFDocument.create();
        for (const figure of figures) {
            const bytes = imageStore.get(figure.id);
            if (!bytes) {
                continue;
            }
            const image = await pdf.embedPng(Uint8Array.from(bytes));
            const pageWidth = 595.28;
            const pageHeight = 841.89;
            const margin = 36;
            const scale = Math.min(
                (pageWidth - margin * 2) / image.width,
                (pageHeight - margin * 2) / image.height,
                1
            );
            const page = pdf.addPage([pageWidth, pageHeight]);
            page.drawImage(image, {
                x: (pageWidth - image.width * scale) / 2,
                y: (pageHeight - image.height * scale) / 2,
                width: image.width * scale,
                height: image.height * scale,
            });
        }

        const bytes = await pdf.save();
        return Uint8Array.from(bytes);
    }

    private async copyImage(figure: FigureRecord): Promise<void> {
        const bytes = imageStore.get(figure.id);
        if (!bytes || !navigator.clipboard || typeof ClipboardItem === "undefined") {
            this.showNotice("Image clipboard access is unavailable in this browser.");
            return;
        }
        try {
            const imageBytes = new Uint8Array(bytes.length);
            imageBytes.set(bytes);
            await navigator.clipboard.write([
                new ClipboardItem({
                    "image/png": new Blob([imageBytes.buffer], { type: "image/png" }),
                }),
            ]);
            this.showNotice("Image copied to the clipboard.");
        } catch {
            this.showNotice("Could not copy the image. Allow clipboard access and try again.");
        }
    }

    private showFigureContextMenu(event: MouseEvent, figure: FigureRecord): void {
        document.querySelector(".jp-FigureExplorer-contextMenu")?.remove();
        const menu = document.createElement("div");
        menu.className = "jp-FigureExplorer-contextMenu";
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;

        const addAction = (label: string, action: () => void | Promise<void>): void => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", () => {
                menu.remove();
                void action();
            });
            menu.append(button);
        };
        addAction("Reveal cell", () => this.onRevealCell(figure));
        addAction("Save PNG", () => this.savePng([figure]));
        addAction("Export PDF", () => this.exportPdf([figure]));
        addAction("Copy image", () => this.copyImage(figure));
        document.body.append(menu);
        window.setTimeout(() => {
            const closeOnOutsidePointer = (pointerEvent: PointerEvent): void => {
                if (!menu.contains(pointerEvent.target as Node)) {
                    menu.remove();
                    document.removeEventListener("pointerdown", closeOnOutsidePointer);
                }
            };
            document.addEventListener("pointerdown", closeOnOutsidePointer);
        });
    }

    private download(blob: Blob, name: string): void {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    private focusGallery(): void {
        queueMicrotask(() => {
            this.node.focus();
            if (!this.scrollSelectionIntoView) {
                return;
            }

            const selected = this.node.querySelector<HTMLElement>(
                ".jp-FigureExplorer-card.jp-mod-selected"
            );
            const grid = this.node.querySelector<HTMLElement>(
                ".jp-FigureExplorer-grid"
            );
            if (selected && grid) {
                const top = selected.offsetTop;
                const bottom = top + selected.offsetHeight;
                if (top < grid.scrollTop) {
                    grid.scrollTop = top;
                } else if (bottom > grid.scrollTop + grid.clientHeight) {
                    grid.scrollTop = bottom - grid.clientHeight;
                }
            }
            this.scrollSelectionIntoView = false;
        });
    }

    private showNotice(message: string): void {
        document.querySelector(".jp-FigureExplorer-notice")?.remove();
        const notice = document.createElement("div");
        notice.className = "jp-FigureExplorer-notice";
        notice.textContent = message;
        document.body.append(notice);
        window.setTimeout(() => notice.remove(), 3000);
    }

    private exportFileName(figure: FigureRecord, extension: string): string {
        const notebook = figure.notebookName
            .replace(/\.ipynb$/i, "")
            .replace(/[<>:"/\\|?*]/g, "_");
        return `${notebook}-cell-${figure.cellIndex + 1}.${extension}`;
    }

    private imageUrl(figure: FigureRecord): string {
        const existing = this.objectUrls.get(figure.id);
        if (existing?.version === figure.version) {
            return existing.url;
        }

        if (existing) {
            URL.revokeObjectURL(existing.url);
            this.objectUrls.delete(figure.id);
        }

        const bytes = imageStore.get(figure.id);

        if (!bytes) {
            return "";
        }

        const url = URL.createObjectURL(
            new Blob([Uint8Array.from(bytes)], { type: figure.mimeType })
        );
        this.objectUrls.set(figure.id, { url, version: figure.version });
        return url;
    }

    /**
     * Remove only uniform canvas margins for the on-screen preview. Downloads
     * and exports continue to use the original bytes in the image store.
     */
    private async trimPreviewMargins(
        figure: FigureRecord,
        image: HTMLImageElement
    ): Promise<void> {
        if (this.previewCropUrls.get(figure.id)?.version === figure.version ||
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
        this.previewCropUrls.set(figure.id, { url, version: figure.version });

        if (this.previewFigureId === figure.id && image.isConnected) {
            image.src = url;
        }
    }

    private catalogMatches(
        notebooks: readonly NotebookFigures[],
        currentNotebookUri?: string
    ): boolean {
        if (this.currentNotebookUri !== currentNotebookUri ||
            this.notebooks.length !== notebooks.length) {
            return false;
        }

        return this.notebooks.every((notebook, notebookIndex) => {
            const next = notebooks[notebookIndex];
            return next !== undefined &&
                notebook.uri === next.uri &&
                notebook.name === next.name &&
                notebook.figures.length === next.figures.length &&
                notebook.figures.every((figure, figureIndex) => {
                    const nextFigure = next.figures[figureIndex];
                    return nextFigure !== undefined &&
                        figure.id === nextFigure.id &&
                        figure.version === nextFigure.version &&
                        figure.searchText === nextFigure.searchText &&
                        figure.tags.join("\u0000") === nextFigure.tags.join("\u0000");
                });
        });
    }

    private pruneObjectUrls(): void {
        const figures = new Map(
            this.notebooks.flatMap((notebook) =>
                notebook.figures.map((figure) => [figure.id, figure])
            )
        );

        for (const [id, cached] of this.objectUrls) {
            if (figures.get(id)?.version !== cached.version) {
                URL.revokeObjectURL(cached.url);
                this.objectUrls.delete(id);
            }
        }

        for (const [id, cached] of this.previewCropUrls) {
            if (figures.get(id)?.version !== cached.version) {
                URL.revokeObjectURL(cached.url);
                this.previewCropUrls.delete(id);
            }
        }
    }

    private revokeObjectUrls(): void {
        for (const { url } of this.objectUrls.values()) {
            URL.revokeObjectURL(url);
        }
        this.objectUrls.clear();
        for (const { url } of this.previewCropUrls.values()) {
            URL.revokeObjectURL(url);
        }
        this.previewCropUrls.clear();
    }
}
