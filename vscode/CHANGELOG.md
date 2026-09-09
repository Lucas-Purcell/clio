# Changelog

All notable changes to Clio for VS Code are documented in this file.

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
