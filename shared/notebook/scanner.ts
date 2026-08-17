import { FigureRecord } from "./types";

const figureTitlePattern = /^\s*#\s*figure\s*:\s*(.+?)\s*$/i;
const figureTagsPattern = /^\s*#\s*tags\s*:\s*(.+?)\s*$/i;

export interface CellFigureMetadata {
    titles: readonly string[];
    tags: string[];
    codeSnippet: string;
    cellSource: string;
    notebookName: string;
}

export function figureMetadata(
    source: string,
    notebookName: string
): CellFigureMetadata {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
    const firstLine = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex] : "";
    const titles = firstLine.match(figureTitlePattern)?.[1]
        .split(",")
        .map((title) => title.trim())
        .filter(Boolean) ?? [];
    const tagsLine = lines.find((line) => figureTagsPattern.test(line));
    const tags = tagsLine
        ? tagsLine.match(figureTagsPattern)?.[1]
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean) ?? []
        : [];
    const snippetLines = lines
        .slice(titles.length > 0 ? firstNonEmptyIndex + 1 : 0)
        .filter(
            (line) =>
                line.trim().length > 0 &&
                !figureTagsPattern.test(line)
        )
        .slice(0, 4);
    const codeSnippet = snippetLines.join("\n") || "No code available.";

    return {
        titles,
        tags,
        codeSnippet,
        cellSource: source,
        notebookName,
    };
}

export function figureRecordMetadata(
    metadata: CellFigureMetadata,
    figureIndex: number
): Pick<
    FigureRecord,
    "title" | "tags" | "codeSnippet" | "cellSource" | "searchText"
> {
    const title = metadata.titles.length === 1
        ? metadata.titles[0]
        : metadata.titles[figureIndex];

    return {
        ...(title ? { title } : {}),
        tags: metadata.tags,
        codeSnippet: metadata.codeSnippet,
        cellSource: metadata.cellSource,
        searchText: [
            metadata.notebookName,
            title ?? "",
            metadata.tags.join(" "),
            metadata.codeSnippet,
            metadata.cellSource,
        ]
            .join("\n")
            .toLowerCase(),
    };
}

export function sourceText(source: string | string[] | undefined): string {
    return Array.isArray(source) ? source.join("") : source ?? "";
}

export function imageId(
    notebookUri: string,
    cellIndex: number,
    outputIndex: number,
    itemIndex: number
): string {
    return `${notebookUri}::${cellIndex}:${outputIndex}:${itemIndex}`;
}
