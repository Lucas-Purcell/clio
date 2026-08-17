import * as vscode from "vscode";
import {
    FigureRecord,
    NotebookFigures,
} from "../../../shared/notebook/types";
import { figureRegistry } from "../../../shared/registry/figureRegistry";

type ExplorerItem = NotebookTreeItem | FigureTreeItem;

export class FigureTreeProvider
    implements vscode.TreeDataProvider<ExplorerItem> {
    private readonly changeEmitter =
        new vscode.EventEmitter<ExplorerItem | undefined>();

    readonly onDidChangeTreeData = this.changeEmitter.event;

    refresh(): void {
        this.changeEmitter.fire(undefined);
    }

    getTreeItem(element: ExplorerItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ExplorerItem): vscode.ProviderResult<ExplorerItem[]> {
        if (!element) {
            return figureRegistry
                .getNotebooks()
                .map((notebook) => new NotebookTreeItem(notebook));
        }

        if (element instanceof NotebookTreeItem) {
            return element.notebook.figures.map(
                (figure, index) => new FigureTreeItem(figure, index + 1)
            );
        }

        return [];
    }
}

export class NotebookTreeItem extends vscode.TreeItem {
    constructor(readonly notebook: NotebookFigures) {
        super(
            notebook.name,
            notebook.figures.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );

        this.description = `${notebook.figures.length} figure${
            notebook.figures.length === 1 ? "" : "s"
        }`;

        this.tooltip = notebookPathLabel(notebook.uri);
        this.iconPath = new vscode.ThemeIcon("notebook");

        this.command = {
            command: "figure-explorer.openNotebookGallery",
            title: "Open Figure Gallery",
            arguments: [notebook],
        };
    }
}

export class FigureTreeItem extends vscode.TreeItem {
    constructor(readonly figure: FigureRecord, number: number) {
        super(
            figure.title ?? `Figure ${number}`,
            vscode.TreeItemCollapsibleState.None
        );

        const defaultTitle = `Figure ${number}`;

        this.description = figure.title
            ? `${defaultTitle} · Cell ${figure.cellIndex + 1}`
            : `Cell ${figure.cellIndex + 1}`;

        this.tooltip =
            `${figure.notebookName} — Cell ${figure.cellIndex + 1}\n` +
            figure.codeSnippet;

        this.iconPath = new vscode.ThemeIcon("graph-line");

        this.command = {
            command: "figure-explorer.openFigureGallery",
            title: "Open Figure in Gallery",
            arguments: [figure],
        };

        this.contextValue = "figureExplorer.figure";
    }
}

function notebookPathLabel(notebookUri: string): string {
    const uri = vscode.Uri.parse(notebookUri);

    return uri.scheme === "file" ? uri.fsPath : notebookUri;
}
