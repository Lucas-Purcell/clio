import { FigureRecord, NotebookFigures } from "../notebook/types";

export class FigureRegistry {
    private readonly notebooks = new Map<string, NotebookFigures>();

    setNotebook(uri: string, name: string, figures: readonly FigureRecord[], kind: NotebookFigures["kind"] = "notebook"): void {
        this.notebooks.set(uri, {
            uri,
            name,
            kind,
            figures: figures.map((figure) => ({ ...figure, tags: [...figure.tags] })),
        });
    }

    removeNotebook(uri: string): void {
        this.notebooks.delete(uri);
    }

    clear(): void {
        this.notebooks.clear();
    }

    getNotebook(uri: string): NotebookFigures | undefined {
        return this.notebooks.get(uri);
    }

    getNotebooks(): readonly NotebookFigures[] {
        return [...this.notebooks.values()].sort((left, right) =>
            left.name.localeCompare(right.name)
        );
    }
}

export const figureRegistry = new FigureRegistry();
