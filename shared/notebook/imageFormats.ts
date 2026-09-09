export const supportedImageMimeTypes = [
    "image/svg+xml",
    "image/png",
    "image/jpeg",
    "image/webp",
] as const;

export type SupportedImageMimeType = typeof supportedImageMimeTypes[number];

export interface NotebookImageOutput {
    mimeType: SupportedImageMimeType;
    value: string | string[];
}

export function isSupportedImageMimeType(
    mimeType: string
): mimeType is SupportedImageMimeType {
    return supportedImageMimeTypes.includes(mimeType as SupportedImageMimeType);
}

/** Select one preferred representation when an output publishes several. */
export function notebookImageOutput(
    data: Record<string, string | string[]> | undefined
): NotebookImageOutput | undefined {
    if (!data) {
        return undefined;
    }

    for (const mimeType of supportedImageMimeTypes) {
        const value = data[mimeType];

        if (value !== undefined) {
            return { mimeType, value };
        }
    }

    return undefined;
}

export function imageExtension(mimeType: string): "png" | "jpg" | "webp" | "svg" {
    switch (mimeType) {
        case "image/jpeg":
            return "jpg";
        case "image/webp":
            return "webp";
        case "image/svg+xml":
            return "svg";
        default:
            return "png";
    }
}

export function imageFormatLabel(mimeType: string): string {
    switch (mimeType) {
        case "image/jpeg":
            return "JPEG";
        case "image/webp":
            return "WebP";
        case "image/svg+xml":
            return "SVG";
        default:
            return "PNG";
    }
}

export function notebookImageText(value: string | string[]): string {
    return Array.isArray(value) ? value.join("") : value;
}
