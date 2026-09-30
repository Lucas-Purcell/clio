export interface FigureRecord {
    id: string;
    /** Set for a saved image rather than a notebook output. */
    imageUri?: string;
    notebookUri: string;
    notebookName: string;
    /** Stable host cell identity used for session history and safe restoration. */
    cellId?: string;
    cellIndex: number;
    outputIndex: number;
    itemIndex: number;
    mimeType: string;
    version: string;
    title?: string;
    codeSnippet: string;
    cellSource: string;
    /** Cell source observed when this image version was produced. */
    sourceSnapshot?: string;
    searchText: string;
    tags: string[];
}

export interface NotebookFigures {
    uri: string;
    name: string;
    kind?: "notebook" | "folder" | "images";
    figures: readonly FigureRecord[];
}

export interface StarredFigureRecord {
    figure: FigureRecord;
    starredAt: number;
}

export interface FigureHistoryEntry {
    sourceKey: string;
    figure: FigureRecord;
    capturedAt: number;
}
