# Changelog

All notable changes to the published Clio JupyterLab package are documented here.

## [0.1.17] - 2026-08-26

### Added

- Added Focus Figure to gallery previews and comparison figures in side-panel, tab, and separate-window layouts.
- Added JPEG, WebP, and SVG discovery, previews, original-format downloads, PDF export, and PNG clipboard conversion alongside PNG figures.
- Added browser-persistent starred figures with a dedicated Starred gallery scope and retained metadata for figures in closed notebooks.
- Added session-only figure history across JupyterLab gallery hosts, with version navigation, comparison, copying, and export.
- Added history-version code viewing, copying, and safe restoration with stable cell targeting and normal notebook Undo support.

### Fixed

- Restored the Tags, Filters, and Settings popup menus across JupyterLab gallery layouts.
- Restored qualified search and immediate active-notebook synchronization in This notebook mode.
- Applied save, PDF export, and star/unstar actions to all selected thumbnails.
- Replaced browser fullscreen requests that embedded hosts may block with a reliable in-gallery focus mode; press Escape to restore the regular gallery.
- Preserve the previous plot while a rerun temporarily clears its cell output, allowing the replacement plot to expose its session history.
- Keep history-version thumbnails available while browsing and comparing earlier plots.
- Preserve Focus Figure while navigating backward or forward through plot history.

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
