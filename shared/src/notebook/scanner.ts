import { FigureRecord } from "./types";

const figureTitlePattern = /^\s*#\s*figure\s*:\s*(.+?)\s*$/i;
const figureTagsPattern = /^\s*#\s*tags\s*:\s*(.+?)\s*$/i;

export function figureMetadata(
    source: string,
    notebookName: string
): Pick<
    FigureRecord,
    "title" | "tags" | "codeSnippet" | "cellSource" | "searchText"
> {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    const firstNonEmptyIndex = lines.findIndex((line) => line.trim().length > 0);
    const firstLine = firstNonEmptyIndex >= 0 ? lines[firstNonEmptyIndex] : "";
    const title = firstLine.match(figureTitlePattern)?.[1].trim();

    const tagsLine = lines.find((line) => figureTagsPattern.test(line));
    const tags = tagsLine
        ? tagsLine
            .match(figureTagsPattern)?.[1]
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean) ?? []
        : [];

    const snippetLines = lines
        .slice(title ? firstNonEmptyIndex + 1 : 0)
        .filter((line) => line.trim().length > 0)
        .slice(0, 4);

    const codeSnippet = snippetLines.join("\n") || "No code available.";

    return {
        ...(title ? { title } : {}),
        tags,
        codeSnippet,
        cellSource: source,
        searchText: [notebookName, title ?? "", tags.join(" "), codeSnippet, source]
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