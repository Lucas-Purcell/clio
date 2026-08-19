import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { FigureRecord } from "../../../shared/notebook/types";
import {
    figureMetadata,
    figureRecordMetadata,
    imageId,
    sourceText,
} from "../../../shared/notebook/scanner";
import { imageStore } from "../../../shared/registry/imageStore";

const pngMimeType = "image/png";
const imageVersionCache = new WeakMap<Uint8Array, string>();

export async function scanNotebookDocument(
    notebook: vscode.NotebookDocument
): Promise<FigureRecord[]> {
    const figures: FigureRecord[] = [];
    const notebookUri = notebook.uri.toString();
    const notebookName = fileName(notebook.uri);

    for (const [cellIndex, cell] of notebook.getCells().entries()) {
        const metadata = figureMetadata(cell.document.getText(), notebookName);
        let figureIndex = 0;

        for (const [outputIndex, output] of cell.outputs.entries()) {
            for (const [itemIndex, item] of output.items.entries()) {
                if (item.mime !== pngMimeType) {
                    continue;
                }

                const id = imageId(notebookUri, cellIndex, outputIndex, itemIndex);
                imageStore.put(id, item.data);

                figures.push({
                    id,
                    notebookUri,
                    notebookName,
                    cellIndex,
                    outputIndex,
                    itemIndex,
                    mimeType: item.mime,
                    version: imageVersion(item.data),
                    ...figureRecordMetadata(metadata, figureIndex),
                });
                figureIndex += 1;
            }
        }
    }

    return figures;
}

export async function scanNotebookFile(
    uri: vscode.Uri
): Promise<FigureRecord[]> {
    const fileBytes = await vscode.workspace.fs.readFile(uri);
    const notebook = JSON.parse(new TextDecoder().decode(fileBytes)) as {
        cells?: Array<{
            source?: string | string[];
            outputs?: Array<{ data?: Record<string, string | string[]> }>;
        }>;
    };

    const figures: FigureRecord[] = [];
    const notebookUri = uri.toString();
    const notebookName = fileName(uri);

    for (const [cellIndex, cell] of (notebook.cells ?? []).entries()) {
        const metadata = figureMetadata(sourceText(cell.source), notebookName);
        let figureIndex = 0;

        for (const [outputIndex, output] of (cell.outputs ?? []).entries()) {
            const image = output.data?.[pngMimeType];

            if (!image) {
                continue;
            }

            const id = imageId(notebookUri, cellIndex, outputIndex, 0);
            const imageBytes = Buffer.from(
                Array.isArray(image) ? image.join("") : image,
                "base64"
            );

            imageStore.put(id, imageBytes);

            figures.push({
                id,
                notebookUri,
                notebookName,
                cellIndex,
                outputIndex,
                itemIndex: 0,
                mimeType: pngMimeType,
                version: imageVersion(imageBytes),
                ...figureRecordMetadata(metadata, figureIndex),
            });
            figureIndex += 1;
        }
    }

    return figures;
}

function fileName(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.toString();
}

function imageVersion(bytes: Uint8Array): string {
    const cached = imageVersionCache.get(bytes);

    if (cached) {
        return cached;
    }

    const version = createHash("sha1").update(bytes).digest("hex");
    imageVersionCache.set(bytes, version);
    return version;
}
