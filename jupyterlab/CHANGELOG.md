# Changelog

All notable changes to Clio for JupyterLab are documented in this file.

## [0.1.16] - 2026-08-17

### Fixed

- Minor gallery bug fixes, including fixed-size sparse thumbnails and stable stacked comparison cards.

## [0.1.15] - 2026-08-17

### Changed

- Updated the public repository and package metadata for Clio.
- Added draggable dividers in tab and external-window comparison modes so adjacent figures can be resized independently.
- Added adaptive tab and external-window comparison layouts: two figures resize side by side, three or four stack in a grid, and five or more scroll within the comparison area.
- Removed external-gallery viewport caps so previews and comparisons use the full available window height.
- Fixed stacked comparison cards overlapping when three or four figures are selected.
- Kept sparse-gallery thumbnails at the same fixed card size as fuller galleries.
- Updated the add-tag control with the shared Clio tag icon.

## [0.1.14] - 2026-08-17

### Added

- First packaged Clio release for JupyterLab 4.
- Gallery views in the main area, side panel, and a separate browser window.
- PNG figure discovery across open notebooks.
- Search, tag filtering, title filtering, keyboard navigation, multi-selection, and comparison mode.
- Zoomable and pannable figure previews and comparison views.
- PNG export, PDF export, image copy, context actions, and cell reveal shortcuts.

### Changed

- Rebranded the JupyterLab extension as **Clio**.
