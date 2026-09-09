import {
    FigureRecord,
    figureMetadata,
    figureRecordMetadata,
    imageId,
    imageStore,
    notebookImageOutput,
    notebookImageText,
    sourceText,
} from "@clio/shared";

interface NotebookJson {
    cells?: CellJson[];
}

interface CellJson {
    id?: string;
    source?: string | string[];
    outputs?: OutputJson[];
}

interface OutputJson {
    data?: Record<string, string | string[]>;
}

export interface FigureImageInput {
    id: string;
    mimeType: string;
    data: string;
}

export interface FigureMetadataInput {
    cellIndex: number;
    source: string;
    signature: string;
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
            const image = notebookImageOutput(output.data);

            if (!image) {
                continue;
            }

            const imageText = notebookImageText(image.value);
            const bytes = image.mimeType === "image/svg+xml"
                ? new TextEncoder().encode(imageText)
                : decodeBase64(imageText);
            const id = imageId(notebookUri, cellIndex, outputIndex, 0);
            const version = imageVersion(bytes);

            imageStore.put(id, bytes, version);

            figures.push({
                id,
                notebookUri,
                notebookName,
                ...(cell.id ? { cellId: cell.id } : {}),
                cellIndex,
                outputIndex,
                itemIndex: 0,
                mimeType: image.mimeType,
                version,
                sourceSnapshot: metadata.cellSource,
                ...figureRecordMetadata(metadata, figureIndex),
            });
            figureIndex += 1;
        }
    }

    return figures;
}

/**
 * Return the raw supported image output values without decoding them. This lets the
 * JupyterLab adapter ignore ordinary source edits and only rescan when a
 * notebook figure has actually changed.
 */
export function figureImageInputs(notebook: NotebookJson): FigureImageInput[] {
    const inputs: FigureImageInput[] = [];

    for (const [cellIndex, cell] of (notebook.cells ?? []).entries()) {
        for (const [outputIndex, output] of (cell.outputs ?? []).entries()) {
            const image = notebookImageOutput(output.data);

            if (image) {
                inputs.push({
                    id: `${cellIndex}:${outputIndex}`,
                    mimeType: image.mimeType,
                    data: notebookImageText(image.value),
                });
            }
        }
    }

    return inputs;
}

export function sameFigureImageInputs(
    left: readonly FigureImageInput[] | undefined,
    right: readonly FigureImageInput[]
): boolean {
    if (!left || left.length !== right.length) {
        return false;
    }

    return left.every((input, index) =>
        input.id === right[index]?.id &&
        input.mimeType === right[index]?.mimeType &&
        input.data === right[index]?.data
    );
}

/**
 * Snapshot only the title/tag portion of each cell. This keeps source edits
 * cheap while allowing Clio metadata to update without touching image bytes.
 */
export function figureMetadataInputs(
    notebook: NotebookJson
): FigureMetadataInput[] {
    return (notebook.cells ?? []).map((cell, cellIndex) => {
        const source = sourceText(cell.source);

        return {
            cellIndex,
            source,
            signature: metadataSignature(source),
        };
    });
}

export function sameFigureMetadataInputs(
    left: readonly FigureMetadataInput[] | undefined,
    right: readonly FigureMetadataInput[]
): boolean {
    if (!left || left.length !== right.length) {
        return false;
    }

    return left.every((input, index) =>
        input.cellIndex === right[index]?.cellIndex &&
        input.signature === right[index]?.signature
    );
}

export function updateChangedFigureMetadata(
    figures: readonly FigureRecord[],
    previous: readonly FigureMetadataInput[] | undefined,
    next: readonly FigureMetadataInput[],
    notebookName: string
): FigureRecord[] {
    const previousSignatures = new Map(
        previous?.map((input) => [input.cellIndex, input.signature]) ?? []
    );

    return next.reduce(
        (updated, input) => previousSignatures.get(input.cellIndex) === input.signature
            ? updated
            : updateCellMetadata(
                updated,
                input.cellIndex,
                input.source,
                notebookName
            ),
        [...figures]
    );
}

function metadataSignature(source: string): string {
    const metadata = figureMetadata(source, "");
    return JSON.stringify([metadata.titles, metadata.tags]);
}

function updateCellMetadata(
    figures: readonly FigureRecord[],
    cellIndex: number,
    source: string,
    notebookName: string
): FigureRecord[] {
    const metadata = figureMetadata(source, notebookName);
    let figureIndex = 0;

    return figures.map((figure) => {
        if (figure.cellIndex !== cellIndex) {
            return figure;
        }

        const { title: _previousTitle, ...record } = figure;
        const updated = {
            ...record,
            ...figureRecordMetadata(metadata, figureIndex),
        };
        figureIndex += 1;
        return updated;
    });
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
