import { FigureRecord, NotebookFigures } from "@clio/shared";
import { Widget } from "@lumino/widgets";
import { clioIcon } from "./icon";

export class FigureExplorerSidebar extends Widget {
    private notebooks: readonly NotebookFigures[] = [];
    private readonly expandedNotebookUris = new Set<string>();
    private readonly knownNotebookUris = new Set<string>();

    constructor(
        private readonly onOpenNotebook: (notebook: NotebookFigures) => void,
        private readonly onOpenFigure: (figure: FigureRecord) => void
    ) {
        super();
        this.id = "figure-explorer:sidebar";
        this.title.label = "Clio";
        this.title.icon = clioIcon;
        this.title.caption = "Browse figures from open notebooks";
        this.title.closable = false;
        this.addClass("jp-FigureExplorerSidebar");
        this.render();
    }

    setNotebooks(notebooks: readonly NotebookFigures[]): void {
        this.notebooks = notebooks;
        const openUris = new Set(notebooks.map((notebook) => notebook.uri));

        for (const uri of this.expandedNotebookUris) {
            if (!openUris.has(uri)) {
                this.expandedNotebookUris.delete(uri);
                this.knownNotebookUris.delete(uri);
            }
        }

        for (const notebook of notebooks) {
            if (!this.knownNotebookUris.has(notebook.uri)) {
                this.knownNotebookUris.add(notebook.uri);
                this.expandedNotebookUris.add(notebook.uri);
            }
        }
        this.render();
    }

    private render(): void {
        this.node.replaceChildren();

        if (this.notebooks.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = "Open a notebook to discover its PNG figures.";
            empty.className = "jp-FigureExplorer-empty";
            this.node.append(empty);
            return;
        }

        for (const notebook of this.notebooks) {
            const section = document.createElement("section");
            section.className = "jp-FigureExplorerSidebar-notebook";

            const notebookHeader = document.createElement("div");
            notebookHeader.className = "jp-FigureExplorerSidebar-notebookHeader";

            const disclosure = document.createElement("button");
            disclosure.type = "button";
            disclosure.className = "jp-FigureExplorerSidebar-disclosure";
            const expanded = this.expandedNotebookUris.has(notebook.uri);
            disclosure.textContent = expanded ? "▾" : "▸";
            disclosure.setAttribute("aria-label", expanded ? "Hide figures" : "Show figures");
            disclosure.setAttribute("aria-expanded", String(expanded));
            disclosure.addEventListener("click", () => {
                if (this.expandedNotebookUris.has(notebook.uri)) {
                    this.expandedNotebookUris.delete(notebook.uri);
                } else {
                    this.expandedNotebookUris.add(notebook.uri);
                }
                this.render();
            });
            notebookHeader.append(disclosure);

            const open = document.createElement("button");
            open.type = "button";
            open.className = "jp-FigureExplorerSidebar-notebookButton";
            open.textContent = `${notebook.name} (${notebook.figures.length})`;
            open.addEventListener("click", () => this.onOpenNotebook(notebook));
            notebookHeader.append(open);
            section.append(notebookHeader);

            if (!expanded) {
                this.node.append(section);
                continue;
            }

            for (const [index, figure] of notebook.figures.entries()) {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "jp-FigureExplorerSidebar-figureButton";
                item.textContent = figure.title ?? `Figure ${index + 1}`;
                item.title = `Cell ${figure.cellIndex + 1}`;
                item.addEventListener("click", () => this.onOpenFigure(figure));
                section.append(item);
            }

            this.node.append(section);
        }
    }
}
