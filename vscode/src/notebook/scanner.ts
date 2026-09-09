import * as vscode from "vscode";
import { createHash } from "node:crypto";
import { FigureRecord } from "../../../shared/notebook/types";
import {
    figureMetadata,
    figureRecordMetadata,
    imageId,
    sourceText,
} from "../../../shared/notebook/scanner";
import {
    isSupportedImageMimeType,
    notebookImageOutput,
    notebookImageText,
    supportedImageMimeTypes,
} from "../../../shared/notebook/imageFormats";
import { imageStore } from "../../../shared/registry/imageStore";

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
            const preferredMimeType = supportedImageMimeTypes.find((mimeType) =>
                output.items.some((item) => item.mime === mimeType)
            );
            const itemIndex = preferredMimeType
                ? output.items.findIndex((item) => item.mime === preferredMimeType)
                : -1;
            const item = itemIndex >= 0 ? output.items[itemIndex] : undefined;

            if (!item || !isSupportedImageMimeType(item.mime)) {
                continue;
            }

            const id = imageId(notebookUri, cellIndex, outputIndex, itemIndex);
            const version = imageVersion(item.data);
            imageStore.put(id, item.data, version);

            figures.push({
                id,
                notebookUri,
                notebookName,
                cellId: cell.document.uri.toString(),
                cellIndex,
                outputIndex,
                itemIndex,
                mimeType: item.mime,
                version,
                sourceSnapshot: metadata.cellSource,
                ...figureRecordMetadata(metadata, figureIndex),
            });
            figureIndex += 1;
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
            id?: string;
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
            const image = notebookImageOutput(output.data);

            if (!image) {
                continue;
            }

            const id = imageId(notebookUri, cellIndex, outputIndex, 0);
            const imageText = notebookImageText(image.value);
            const imageBytes = image.mimeType === "image/svg+xml"
                ? new TextEncoder().encode(imageText)
                : Buffer.from(imageText, "base64");
            const version = imageVersion(imageBytes);

            imageStore.put(id, imageBytes, version);

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

function fileName(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.toString();
}

function imageVersion(bytes: Uint8Array): string {
    return createHash("sha1").update(bytes).digest("hex");
}
