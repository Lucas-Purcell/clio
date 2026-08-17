import * as vscode from "vscode";
import { PDFDocument } from "pdf-lib";
import { FigureRecord } from "../../../shared/notebook/types";
import { imageStore } from "../../../shared/registry/imageStore";

export async function saveFigureAsPng(
    figure: FigureRecord
): Promise<void> {

    const bytes = imageStore.get(figure.id);

    if (!bytes) {
        vscode.window.showErrorMessage(
            "Image data is no longer available."
        );
        return;
    }

    const target = await vscode.window.showSaveDialog({
        defaultUri: defaultUri(figure, "png"),
        filters: { "PNG image": ["png"] },
        saveLabel: "Save PNG",
    });

    if (!target) {
        return;
    }

    await vscode.workspace.fs.writeFile(target, bytes);

    vscode.window.showInformationMessage(
        "Figure saved as PNG."
    );
}

/** Opens one native save dialog where the user can choose PNG or PDF. */
export async function downloadFigure(figure: FigureRecord): Promise<void> {
    const bytes = imageStore.get(figure.id);

    if (!bytes) {
        vscode.window.showErrorMessage("Image data is no longer available.");
        return;
    }

    const target = await vscode.window.showSaveDialog({
        defaultUri: defaultUri(figure, "png"),
        filters: {
            "PNG image": ["png"],
            "PDF document": ["pdf"],
        },
        saveLabel: "Download Figure",
    });

    if (!target) {
        return;
    }

    if (target.path.toLowerCase().endsWith(".pdf")) {
        await vscode.workspace.fs.writeFile(target, await createFigurePdf(bytes));
        vscode.window.showInformationMessage("Figure exported as PDF.");
        return;
    }

    await vscode.workspace.fs.writeFile(target, bytes);
    vscode.window.showInformationMessage("Figure saved as PNG.");
}

export async function exportFigureAsPdf(
    figure: FigureRecord
): Promise<void> {

    const bytes = imageStore.get(figure.id);

    if (!bytes) {
        vscode.window.showErrorMessage(
            "Image data is no longer available."
        );
        return;
    }

    const target = await vscode.window.showSaveDialog({
        defaultUri: defaultUri(figure, "pdf"),
        filters: { "PDF document": ["pdf"] },
        saveLabel: "Export PDF",
    });

    if (!target) {
        return;
    }

    const pdfBytes =
        await createFigurePdf(bytes);

    await vscode.workspace.fs.writeFile(
        target,
        pdfBytes
    );

    vscode.window.showInformationMessage(
        "Figure exported as PDF."
    );
}

/* ─────────────────────────────────────────────
   Bulk PNG export
   ───────────────────────────────────────────── */

export async function saveFiguresAsPng(
    figures: FigureRecord[]
): Promise<void> {

    if (figures.length === 0) {
        return;
    }

    const folder =
        await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Export Folder",
        });

    if (!folder || folder.length === 0) {
        return;
    }

    const targetFolder = folder[0];

    let exported = 0;
    let missing = 0;

    for (const figure of figures) {
        const bytes = imageStore.get(figure.id);

        if (!bytes) {
            missing += 1;
            continue;
        }

        const target = vscode.Uri.joinPath(
            targetFolder,
            exportFileName(figure, "png")
        );

        await vscode.workspace.fs.writeFile(
            target,
            bytes
        );

        exported += 1;
    }

    showBulkResult(
        "PNG",
        exported,
        missing
    );
}

/* ─────────────────────────────────────────────
   Bulk PDF export
   ───────────────────────────────────────────── */

export async function exportFiguresAsPdf(
    figures: FigureRecord[]
): Promise<void> {

    if (figures.length === 0) {
        return;
    }

    const folder =
        await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Export Folder",
        });

    if (!folder || folder.length === 0) {
        return;
    }

    const targetFolder = folder[0];

    let exported = 0;
    let missing = 0;

    for (const figure of figures) {
        const bytes = imageStore.get(figure.id);

        if (!bytes) {
            missing += 1;
            continue;
        }

        const pdfBytes =
            await createFigurePdf(bytes);

        const target = vscode.Uri.joinPath(
            targetFolder,
            exportFileName(figure, "pdf")
        );

        await vscode.workspace.fs.writeFile(
            target,
            pdfBytes
        );

        exported += 1;
    }

    showBulkResult(
        "PDF",
        exported,
        missing
    );
}

/* ─────────────────────────────────────────────
   PDF creation
   ───────────────────────────────────────────── */

async function createFigurePdf(
    bytes: Uint8Array
): Promise<Uint8Array> {

    const pdf =
        await PDFDocument.create();

    const image =
        await pdf.embedPng(
            Buffer.from(bytes)
        );

    const margin = 36;

    const pageWidth = 595.28;
    const pageHeight = 841.89;

    const scale = Math.min(
        (pageWidth - margin * 2) / image.width,
        (pageHeight - margin * 2) / image.height,
        1
    );

    const width =
        image.width * scale;

    const height =
        image.height * scale;

    const page =
        pdf.addPage([
            pageWidth,
            pageHeight,
        ]);

    page.drawImage(image, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height,
    });

    return pdf.save();
}

/* ─────────────────────────────────────────────
   File naming
   ───────────────────────────────────────────── */

function exportFileName(
    figure: FigureRecord,
    extension: string
): string {

    const notebook =
        figure.notebookName
            .replace(/\.ipynb$/i, "");

    return (
        `${sanitizeFileName(notebook)}` +
        `-cell-${figure.cellIndex + 1}` +
        `.${extension}`
    );
}

function defaultUri(
    figure: FigureRecord,
    extension: string
): vscode.Uri | undefined {
    const folder =
        vscode.workspace.workspaceFolders?.[0]?.uri;

    if (!folder) {
        return undefined;
    }

    const notebook =
        figure.notebookName.replace(/\.ipynb$/i, "");

    const name =
        `${notebook}-cell-${figure.cellIndex + 1}` +
        `-output-${figure.outputIndex + 1}` +
        `-item-${figure.itemIndex + 1}` +
        `.${extension}`;

    return vscode.Uri.joinPath(folder, name);
}

function sanitizeFileName(
    name: string
): string {

    return name
        .replace(/[<>:"/\\|?*]/g, "_")
        .trim();
}

/* ─────────────────────────────────────────────
   Bulk export feedback
   ───────────────────────────────────────────── */

function showBulkResult(
    format: string,
    exported: number,
    missing: number
): void {

    if (exported === 0) {
        vscode.window.showErrorMessage(
            `No figures could be exported as ${format}.`
        );
        return;
    }

    if (missing > 0) {
        vscode.window.showWarningMessage(
            `${exported} figure${exported === 1 ? "" : "s"} ` +
            `exported as ${format}; ` +
            `${missing} figure${missing === 1 ? "" : "s"} ` +
            `could not be exported because their image data ` +
            `was unavailable.`
        );
        return;
    }

    vscode.window.showInformationMessage(
        `${exported} figure${exported === 1 ? "" : "s"} ` +
        `exported as ${format}.`
    );
}
