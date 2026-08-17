import {
    FigureRecord,
    figureMetadata,
    figureRecordMetadata,
    imageId,
    imageStore,
    sourceText,
} from "@clio/shared";

const pngMimeType = "image/png";

interface NotebookJson {
    cells?: CellJson[];
}

interface CellJson {
    source?: string | string[];
    outputs?: OutputJson[];
}

interface OutputJson {
    data?: Record<string, string | string[]>;
}

/**
 * Convert Jupyter's serializable notebook model into shared FigureRecords.
 * The JupyterLab adapter deliberately works with nbformat JSON, avoiding
 * platform-specific output widget classes in the shared layer.
 */
export function scanNotebookJson(
    notebook: NotebookJson,
    notebookUri: string,
    notebookName: string
): FigureRecord[] {
    const figures: FigureRecord[] = [];

    for (const [cellIndex, cell] of (notebook.cells ?? []).entries()) {
        const metadata = figureMetadata(sourceText(cell.source), notebookName);
        let figureIndex = 0;

        for (const [outputIndex, output] of (cell.outputs ?? []).entries()) {
            const image = output.data?.[pngMimeType];

            if (!image) {
                continue;
            }

            const bytes = decodeBase64(
                Array.isArray(image) ? image.join("") : image
            );
            const id = imageId(notebookUri, cellIndex, outputIndex, 0);

            imageStore.put(id, bytes);

            figures.push({
                id,
                notebookUri,
                notebookName,
                cellIndex,
                outputIndex,
                itemIndex: 0,
                mimeType: pngMimeType,
                version: imageVersion(bytes),
                ...figureRecordMetadata(metadata, figureIndex),
            });
            figureIndex += 1;
        }
    }

    return figures;
}

export function notebookJson(model: { toJSON(): unknown }): NotebookJson {
    return model.toJSON() as NotebookJson;
}

function decodeBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
}

function imageVersion(bytes: Uint8Array): string {
    let hash = 2166136261;

    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
}
