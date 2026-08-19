# Changelog

All notable changes to Clio for VS Code are documented in this file.

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
