import * as vscode from "vscode";
import { scanNotebookFile } from "../notebook/scanner";
import { figureRegistry } from "../../../shared/registry/figureRegistry";
import { figureHistoryStore } from "../../../shared/registry/figureHistoryStore";
import { imageStore } from "../../../shared/registry/imageStore";
import { NotebookFigures } from "../../../shared/notebook/types";
import { FigureTreeProvider } from "../views/figureTreeProvider";

export async function scanNotebookCommand(
    provider: FigureTreeProvider,
    onScanned?: (notebook: NotebookFigures) => void
): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { "Jupyter Notebook": ["ipynb"] },
        openLabel: "Scan Notebook",
    });

    const uri = selected?.[0];

    if (!uri) {
        return;
    }

    try {
        const notebookUri = uri.toString();
        const previousFigures = figureRegistry.getNotebook(notebookUri)?.figures ?? [];
        const previousImages = new Map(
            previousFigures.flatMap((figure) => {
                const bytes = imageStore.get(figure.id);
                return bytes
                    ? [[figure.id, Uint8Array.from(bytes)] as const]
                    : [];
            })
        );
        const figures = await scanNotebookFile(uri);

        figureHistoryStore.captureChanges(
            previousFigures,
            figures,
            previousImages
        );

        figureRegistry.setNotebook(
            notebookUri,
            fileName(uri),
            figures
        );

        provider.refresh();

        const notebook = figureRegistry.getNotebook(uri.toString());

        if (notebook) {
            onScanned?.(notebook);
        }

        void vscode.window.showInformationMessage(
            `Clio found ${figures.length} figure${
                figures.length === 1 ? "" : "s"
            }.`
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        void vscode.window.showErrorMessage(
            `Could not scan notebook: ${message}`
        );
    }
}

function fileName(uri: vscode.Uri): string {
    return uri.path.split("/").pop() ?? uri.toString();
}
