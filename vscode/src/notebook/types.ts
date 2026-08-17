export interface FigureRecord {
    id: string;
    notebookUri: string;
    notebookName: string;
    cellIndex: number;
    outputIndex: number;
    itemIndex: number;
    mimeType: string;
    version: string;
    title?: string;
    codeSnippet: string;
    cellSource: string;
    searchText: string;
    tags: string[];
}

export interface NotebookFigures {
    uri: string;
    name: string;
    figures: readonly FigureRecord[];
}