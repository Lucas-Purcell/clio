import { FigureHistoryEntry, FigureRecord } from "../notebook/types";
import { imageStore } from "./imageStore";

export function figureHistorySourceKey(figure: FigureRecord): string {
    const cellKey = figure.cellId ?? `index:${figure.cellIndex}`;
    return `${figure.notebookUri}::${cellKey}:${figure.outputIndex}`;
}

function historyImageId(figure: FigureRecord, sequence: number): string {
    return `${figure.id}::history:${sequence}:${figure.version}`;
}

function cloneFigure(figure: FigureRecord, id = figure.id): FigureRecord {
    return {
        ...figure,
        id,
        tags: [...figure.tags],
    };
}

export class FigureHistoryStore {
    private readonly entriesBySource = new Map<string, FigureHistoryEntry[]>();
    private readonly pendingBySource = new Map<string, {
        figure: FigureRecord;
        bytes: Readonly<Uint8Array>;
    }>();
    private nextSequence = 1;

    capture(figure: FigureRecord, bytes: Readonly<Uint8Array>): boolean {
        const sourceKey = figureHistorySourceKey(figure);
        const entries = this.entriesBySource.get(sourceKey) ?? [];

        if (entries.at(-1)?.figure.version === figure.version) {
            return false;
        }

        const id = historyImageId(figure, this.nextSequence);
        this.nextSequence += 1;
        const imageBytes = Uint8Array.from(bytes);
        imageStore.put(id, imageBytes);
        entries.push({
            sourceKey,
            figure: cloneFigure(figure, id),
            capturedAt: Date.now(),
        });
        this.entriesBySource.set(sourceKey, entries);
        return true;
    }

    captureChanges(
        previousFigures: readonly FigureRecord[],
        nextFigures: readonly FigureRecord[],
        previousImages: ReadonlyMap<string, Readonly<Uint8Array>>
    ): boolean {
        const nextBySource = new Map(
            nextFigures.map((figure) => [figureHistorySourceKey(figure), figure])
        );
        let changed = false;
        const reconciledSources = new Set<string>();

        for (const previous of previousFigures) {
            const sourceKey = figureHistorySourceKey(previous);
            const next = nextBySource.get(sourceKey);
            const bytes = previousImages.get(previous.id);

            if (next) {
                reconciledSources.add(sourceKey);
                this.pendingBySource.delete(sourceKey);

                if (bytes && next.version !== previous.version) {
                    changed = this.capture(previous, bytes) || changed;
                }
            } else if (bytes) {
                // Notebook runtimes commonly clear an output before publishing its
                // replacement. Preserve that last live image until the same output
                // position returns, so the intermediate empty scan cannot erase
                // the version that should become history.
                this.pendingBySource.set(sourceKey, {
                    figure: cloneFigure(previous),
                    bytes: Uint8Array.from(bytes),
                });
            }
        }

        for (const next of nextFigures) {
            const sourceKey = figureHistorySourceKey(next);

            if (reconciledSources.has(sourceKey)) {
                continue;
            }

            const pending = this.pendingBySource.get(sourceKey);

            if (!pending) {
                continue;
            }

            this.pendingBySource.delete(sourceKey);

            if (next.version !== pending.figure.version) {
                changed = this.capture(pending.figure, pending.bytes) || changed;
            }
        }

        return changed;
    }

    getVersions(current: FigureRecord): FigureRecord[] {
        const entries = this.entriesBySource.get(figureHistorySourceKey(current)) ?? [];
        const versions = entries.map((entry) => cloneFigure(entry.figure));

        versions.push(current);

        return versions;
    }

    hasHistory(figure: FigureRecord): boolean {
        return (this.entriesBySource.get(figureHistorySourceKey(figure))?.length ?? 0) > 0;
    }

    getEntries(): FigureHistoryEntry[] {
        return [...this.entriesBySource.values()]
            .flat()
            .map((entry) => ({
                ...entry,
                figure: cloneFigure(entry.figure),
            }));
    }

    replace(entries: readonly FigureHistoryEntry[]): void {
        this.entriesBySource.clear();
        this.pendingBySource.clear();

        for (const entry of entries) {
            const existing = this.entriesBySource.get(entry.sourceKey) ?? [];
            existing.push({
                ...entry,
                figure: cloneFigure(entry.figure),
            });
            this.entriesBySource.set(entry.sourceKey, existing);
        }
    }

    clear(): void {
        for (const entry of this.getEntries()) {
            imageStore.remove(entry.figure.id);
        }
        this.entriesBySource.clear();
        this.pendingBySource.clear();
        this.nextSequence = 1;
    }
}

export const figureHistoryStore = new FigureHistoryStore();
