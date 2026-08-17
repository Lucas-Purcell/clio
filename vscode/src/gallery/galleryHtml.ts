import * as fs from "node:fs";
import * as path from "node:path";

const css = fs.readFileSync(
    path.join(__dirname, "gallery.css"),
    "utf8"
);

const script = fs.readFileSync(
    path.join(__dirname, "galleryScript.js"),
    "utf8"
);

function createNonce(): string {
    const alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    let value = "";

    for (let index = 0; index < 32; index += 1) {
        value += alphabet.charAt(
            Math.floor(Math.random() * alphabet.length)
        );
    }

    return value;
}

export function galleryShellHtml(editorMode = false): string {
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; connect-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
>
<style nonce="${nonce}">
${css}
</style>
</head>

<body class="${editorMode ? "editor-mode" : ""}">

<header>
    <h1 id="title">Clio</h1>

    <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle
                cx="7"
                cy="7"
                r="4.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
            />
            <path
                d="M10.5 10.5 L14 14"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
            />
        </svg>

        <input
            id="search"
            class="search"
            type="search"
            placeholder="Search figures…"
            autocomplete="off"
            spellcheck="false"
        >

        <button
            id="clear-search"
            class="clear-search"
            type="button"
            aria-label="Clear search"
        >
            ×
        </button>
    </div>

    <div id="active-filters" class="active-filters"></div>

    <div class="toolbar">
        <div class="tag-filter">
            <button
                id="add-tag"
                class="control add-tag icon-button"
                type="button"
                title="Add tag filter"
                aria-label="Add tag filter"
            >
                <svg class="tag-plus-icon" viewBox="0 0 24 24" aria-hidden="true"><path class="tag-plus" d="M2 12h5.5M4.75 9.25v5.5"/><path class="tag-fill" fill-rule="evenodd" d="M11 4h5l5 5-6 6-5-5V4Zm3.5 2.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"/></svg>
            </button>

            <div id="tag-panel" class="tag-panel"></div>
        </div>

        <div class="toolbar-group scope-group">
            <button class="control scope" data-scope="notebook" title="This notebook" aria-label="This notebook">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h11a2 2 0 0 1 2 2v15H6a2 2 0 0 0-2 2V5a2 2 0 0 1 2-2Z"/><path d="M7 7h8M7 11h8M7 15h5"/><path d="M4 5v17"/></svg>
                <span class="scope-label">This notebook</span>
            </button>

            <button class="control scope" data-scope="all" title="All open notebooks" aria-label="All open notebooks">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h11a2 2 0 0 1 2 2v13H7a2 2 0 0 0-2 2V6a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="M5 7H3v13a2 2 0 0 0 2 2h11"/></svg>
                <span class="scope-label">All open</span>
            </button>
        </div>

        <div class="filter-menu">
            <button
                id="filters-button"
                class="control filters-button"
                type="button"
            >
                Filters
                <span class="chevron">▼</span>
            </button>

            <div id="filter-panel" class="filter-panel">
                <button class="filter-option" data-filter="all">
                    All figures
                </button>

                <button class="filter-option" data-filter="titled">
                    Titled
                </button>

                <button class="filter-option" data-filter="untitled">
                    Untitled
                </button>
            </div>
        </div>
    </div>

    <div class="result-row">
        <span id="count">0 figures</span>

        <div class="result-actions">
            <button id="compare" disabled title="Compare selected figures" aria-label="Compare selected figures">⇄</button>
            <button id="download-selected" disabled title="Download selected figure" aria-label="Download selected figure"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 20v-6h8v6"/></svg></button>
            <button id="reveal" disabled title="Reveal cell" aria-label="Reveal cell"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M8 12h8M12 8v8"/></svg></button>
        </div>
    </div>
</header>

<section id="thumbnails" class="thumbnails"></section>
<section id="preview" class="preview"></section>
<section id="source" class="source"></section>

<script nonce="${nonce}">
${script}
</script>

</body>
</html>`;
}
