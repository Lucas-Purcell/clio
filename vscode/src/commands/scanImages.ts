import * as vscode from "vscode";
import { createHash } from "crypto";
import { FigureRecord, NotebookFigures } from "../../../shared/notebook/types";
import { imageStore } from "../../../shared/registry/imageStore";
import { figureRegistry } from "../../../shared/registry/figureRegistry";

export const individualImagesSourceUri = "clio:individual-images";
const largeFolderThreshold = 200;
const pendingImageReads = new Map<string, Promise<Readonly<Uint8Array> | undefined>>();
const imageExtensions = new Map([
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".webp", "image/webp"],
    [".svg", "image/svg+xml"],
    [".gif", "image/gif"],
    [".pdf", "application/pdf"],
]);

function basename(uri: vscode.Uri): string {
    return uri.path.split("/").pop() || uri.toString();
}

function imageMime(uri: vscode.Uri): string | undefined {
    const extension = /\.[^.]+$/.exec(uri.path.toLowerCase())?.[0];
    return extension ? imageExtensions.get(extension) : undefined;
}

/** Read a scanned file only when its image data is actually needed. */
export async function loadScannedImage(figure: FigureRecord): Promise<Readonly<Uint8Array> | undefined> {
    const cached = imageStore.get(figure.id);
    if (cached || !figure.imageUri) return cached;

    const requestKey = `${figure.id}@${figure.version}`;
    let pending = pendingImageReads.get(requestKey);
    if (!pending) {
        pending = Promise.resolve(vscode.workspace.fs.readFile(vscode.Uri.parse(figure.imageUri)))
            .then((bytes) => {
                const current = figureRegistry.getNotebook(figure.notebookUri)?.figures
                    .find((item) => item.id === figure.id);
                if (current && current.version !== figure.version) return undefined;
                imageStore.put(figure.id, bytes, figure.version);
                return imageStore.get(figure.id)!;
            })
            .catch(() => undefined)
            .finally(() => pendingImageReads.delete(requestKey));
        pendingImageReads.set(requestKey, pending);
    }
    return pending;
}

export async function chooseImageFiles(): Promise<readonly vscode.Uri[] | undefined> {
    return vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { Images: ["png", "jpg", "jpeg", "webp", "svg", "gif", "pdf"] },
        openLabel: "Scan Images",
    });
}

export async function chooseImageFolders(): Promise<readonly vscode.Uri[] | undefined> {
    return vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: "Scan Folder",
    });
}

export async function collectImagesRecursively(
    folder: vscode.Uri
): Promise<readonly vscode.Uri[] | undefined> {
    const images: vscode.Uri[] = [];
    const pending = [folder];

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Finding images in ${basename(folder)}`,
            cancellable: true,
        }, async (progress, token) => {
            while (pending.length && !token.isCancellationRequested) {
                const directory = pending.pop()!;
                const entries = await vscode.workspace.fs.readDirectory(directory);

                for (const [name, type] of entries) {
                    if (token.isCancellationRequested) break;
                    const uri = vscode.Uri.joinPath(directory, name);
                    if (type & vscode.FileType.Directory) {
                        pending.push(uri);
                    } else if (type & vscode.FileType.File && imageMime(uri)) {
                        images.push(uri);
                    }
                }
                progress.report({ message: `${images.length} images found` });
            }
            if (token.isCancellationRequested) images.length = 0;
        });
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Could not scan ${basename(folder)}: ${detail}`);
        return;
    }

    if (!images.length) {
        void vscode.window.showInformationMessage(`No supported images found in ${basename(folder)}.`);
        return [];
    }

    if (images.length > largeFolderThreshold) {
        const answer = await vscode.window.showWarningMessage(
            `Scan all ${images.length} images in ${basename(folder)} and its subfolders? This may take a while.`,
            { modal: true },
            "Scan Images"
        );
        if (answer !== "Scan Images") return;
    }
    return images.sort((a, b) => a.path.localeCompare(b.path));
}

export async function scanImageSource(
    sourceUri: string,
    sourceName: string,
    kind: "folder" | "images",
    images: readonly vscode.Uri[]
): Promise<NotebookFigures | undefined> {
    const figures: FigureRecord[] = [];
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Scanning ${sourceName}`,
        cancellable: false,
    }, async (progress) => {
        // A small batch keeps scanning responsive without flooding remote filesystems.
        for (let offset = 0; offset < images.length; offset += 4) {
            const batch = images.slice(offset, offset + 4);
            const records = await Promise.all(batch.map(async (uri): Promise<FigureRecord | undefined> => {
                try {
                    const mimeType = imageMime(uri);
                    if (!mimeType) return undefined;
                    const imageUri = uri.toString();
                    const id = `${sourceUri}::${imageUri}`;
                    // PDF files can be large. File metadata is enough to list them;
                    // their bytes are loaded on demand when a thumbnail is visible.
                    let version: string;
                    if (mimeType === "application/pdf") {
                        const stat = await vscode.workspace.fs.stat(uri);
                        version = `${stat.mtime}:${stat.size}`;
                    } else {
                        const bytes = await vscode.workspace.fs.readFile(uri);
                        version = createHash("sha256").update(bytes).digest("hex");
                        imageStore.put(id, bytes, version);
                    }
                    const name = basename(uri);
                    return {
                        id, imageUri, notebookUri: sourceUri, notebookName: sourceName,
                        cellIndex: -1, outputIndex: -1, itemIndex: -1,
                        mimeType, version, title: name,
                        codeSnippet: uri.path, cellSource: "",
                        searchText: `${name} ${uri.path} ${sourceName}`,
                        tags: [],
                    } satisfies FigureRecord;
                } catch {
                    return undefined;
                }
            }));
            figures.push(...records.filter((record): record is FigureRecord => !!record));
            progress.report({ message: `${Math.min(offset + batch.length, images.length)} of ${images.length}` });
        }
    });

    return { uri: sourceUri, name: sourceName, kind, figures };
}
