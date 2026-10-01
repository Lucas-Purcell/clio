# Changelog

All notable changes to Clio for VS Code are documented in this file.

## [0.1.23] - 2026-10-01

### Added

- Scan GIF and PDF files individually or recursively in folders alongside the existing image formats.
- Show still GIF thumbnails while keeping animated GIF previews; render the first page of PDFs for thumbnails and previews while retaining the original PDF for opening and saving.

## [0.1.22] - 2026-09-30

### Added

- Scan individual PNG, JPEG, WebP, and SVG files or entire folders recursively, with confirmation before loading folders containing more than 200 images.
- Browse saved-image folders and individual files in the Clio explorer and Gallery source picker; open the original image in an editor tab from the reveal action.
- Keep manually added image sources for the current VS Code session and allow removing or rescanning them from the explorer.
- Choose multiple scanned notebooks and image folders in the Gallery source dropdown, including quick All sources and None actions.
- Add a Gallery Scan dropdown for notebooks, individual images, and folders, without using the Command Palette.

### Fixed

- Remove multi-image clipboard copying because paste targets handled it inconsistently and large selections could pause the gallery; single-image copy and batch save/export remain available.
- Let the editor Gallery search field shrink to keep it alongside the source and action controls at medium tab widths; retain stacked rows only in narrow tabs.
- Keep notebook image data while its tab is still open in another window, and revalidate/retry a missing editor-window preview when the webview becomes active.


## [0.1.21] - 2026-09-23

- Redesigned the editor-tab Gallery with a compact toolbar and separate, evenly padded toolbar, preview, and thumbnail cards.
- Added a draggable, keyboard-accessible divider between the editor Gallery preview and thumbnails; its position is remembered for that Gallery.
- Restored sidebar-sized editor thumbnails, moved the Figures heading out of the thumbnail grid overlay, and made selected cards visually distinct.
- Added a star/unstar control to each Gallery thumbnail in the sidebar and editor tab; toolbar and thumbnail stars now use the same icon as the Starred scope.
- Added a transparent or white preview-background setting for plots with transparent pixels.
- Restored row-aware Up/Down thumbnail navigation and made Escape return from a focused comparison figure to comparison mode.
- Changed the notebook picker reset entry to All notebooks once a notebook is selected.
- Unified gallery button heights and corner radii, removed gaps in the scope selector, and stabilized toolbar wrapping in narrow panels.
- Aligned the editor gallery search field with the toolbar when the header wraps at narrower widths, including the toolbar's changing width during resize.
- Gave the Filters dropdown a matching chevron and a compact filter icon in icon-button mode.
- Made the sidebar gallery action buttons equal-sized, including the Reveal Cell control, while keeping Exit History hidden outside history mode.
- Added breathing room between editor-gallery thumbnail images and their star controls.

- Keep notebooks scanned through the command palette in the gallery when switching or closing notebook tabs.
- Allow selecting multiple notebooks in the Scan Notebook dialog.
- Add an inline remove action to notebook rows in the Clio explorer.
- Add a gallery picker for viewing a particular scanned notebook.
- Rescan a notebook normally when it is opened in the editor after being removed from the Clio explorer.

## [0.1.20] - 2026-08-26

### Added

- Added full-screen figure controls beside the reset-zoom and download actions in editor-window gallery previews and comparison views.
- Added Focus Figure to sidebar gallery previews and comparison figures, temporarily using the entire Clio panel for the selected plot.
- Added a Gallery settings menu for button labels, fixed thumbnail size, and comparison layout preferences.
- Added JPEG, WebP, and SVG discovery, previews, original-format downloads, PDF export, and PNG clipboard conversion alongside PNG figures.
- Added persistent starred figures with a dedicated Starred gallery scope, thumbnail markers, preview and context actions, and retained metadata for figures in closed notebooks.
- Added session-only figure history: rerunning a figure-producing cell preserves earlier plot versions for preview navigation, comparison, copying, and export until VS Code closes.
- Added history-version code viewing, copying, and safe restoration with stable cell targeting and normal editor Undo support.

### Changed

- Update figure titles and tags immediately when their notebook metadata comments change, without rescanning or reloading image data.
- Apply toolbar and context-menu save/export and star/unstar actions to all selected thumbnails.

### Fixed

- Rehydrate the separate-window Gallery after VS Code suspends or recreates its background webview, without requiring the user to revisit a notebook.
- Route thumbnail and preview responses only to the Gallery surface that requested them, avoiding duplicate image transfers between the sidebar and editor-window Gallery.
- Replaced the embedded-host browser fullscreen request with a reliable in-gallery focus mode; Escape restores the regular gallery layout.
- Kept Gallery controls and dropdown menus within narrow or resized panel bounds.
- Preserve the previous plot across the transient output-clearing stage of a cell rerun, so figure history becomes available when the replacement output arrives.
- Detect rerun images even when VS Code reuses an output byte buffer, while retaining an immutable snapshot of the preceding plot for history.
- Use one shared history and image-store instance throughout the VS Code bundle, allowing captured versions to activate the Gallery history controls.
- Preserve Focus Figure and update its visible image when navigating between history versions.

## [0.1.19] - 2026-08-19

### Changed

- Made gallery image loading more responsive for figure-heavy notebooks with bounded, lazy thumbnail generation and smaller cached thumbnails.
- Avoided gallery rescans and catalog messages when notebook edits do not change figure outputs.

### Fixed

- Refresh the currently selected preview and comparison images immediately when a notebook cell reruns with updated figure output.

## [0.1.18] - 2026-08-18

### Fixed

- Preserved complete notebook figures in gallery previews by removing automatic image cropping that could cut off axis labels, legends, ticks, and annotations.
- Updated the VS Code Marketplace icon with the new Clio logo.

## [0.1.17] - 2026-08-18

### Fixed

- Restored preview rendering after margin trimming by permitting Clio's local generated preview images in the VS Code webview security policy.

## [0.1.16] - 2026-08-17

### Fixed

- Minor gallery bug fixes, including fixed-size sparse thumbnails and stacked comparison cards.
- Reveal Cell from a detached gallery now opens in a notebook editor column instead of the gallery window.

## [0.1.15] - 2026-08-17

### Changed

- Updated the public repository and package metadata for Clio.
- Added draggable dividers in editor-window comparison mode so adjacent figures can be resized independently.
- Added adaptive external comparison layouts: two figures resize side by side, three or four stack in a grid, and five or more scroll within the comparison area.
- Removed external-gallery viewport caps so previews and comparisons use the full available window height.
- Fixed stacked comparison cards overlapping when three or four figures are selected.
- Kept sparse-gallery thumbnails at the same fixed card size as fuller galleries.
- Routed Reveal Cell from a detached gallery back to notebook editor columns instead of the gallery window.
- Updated the add-tag control with the shared Clio tag icon.

## [0.1.14] - 2026-08-17

### Added

- First packaged Clio release for VS Code.
- Gallery views in the Clio sidebar and as an editor tab for multi-window workflows.
- PNG figure discovery for open notebooks and manually scanned notebook files.
- Search, tag filtering, keyboard navigation, multi-selection, and comparison mode.
- Zoomable and pannable figure previews and comparison views.
- PNG export, PDF export, image copy, context actions, and source-cell reveal shortcuts.

### Changed

- Rebranded the extension as **Clio**.
