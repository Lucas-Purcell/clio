import { FigureRecord, NotebookFigures } from "./types";

export class FigureRegistry {
    private readonly notebooks = new Map<string, NotebookFigures>();

    setNotebook(
        uri: string,
        name: string,
        figures: readonly FigureRecord[]
    ): void {
        this.notebooks.set(uri, {
            uri,
            name,
            figures: figures.map((figure) => ({
                ...figure,
                tags: [...figure.tags],
            })),
        });
    }

    removeNotebook(uri: string): void {
        this.notebooks.delete(uri);
    }

    getNotebook(uri: string): NotebookFigures | undefined {
        return this.notebooks.get(uri);
    }

    getNotebooks(): readonly NotebookFigures[] {
        return [...this.notebooks.values()].sort((left, right) =>
            left.name.localeCompare(right.name)
        );
    }

    clear(): void {
        this.notebooks.clear();
    }
}

export const figureRegistry = new FigureRegistry();