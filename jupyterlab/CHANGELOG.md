# Changelog

All notable changes to Clio for JupyterLab are documented in this file.

## [0.1.17] - 2026-08-26

### Added

- Added Focus Figure to gallery previews and comparison figures in the side panel, tab, and separate-window layouts.
- Added a Gallery settings menu for button labels, fixed thumbnail size, and comparison layout preferences shared by the side panel, tab, and external window.
- Added JPEG, WebP, and SVG discovery, previews, original-format downloads, PDF export, and PNG clipboard conversion alongside PNG figures.
- Added browser-persistent starred figures with a dedicated Starred gallery scope, thumbnail markers, preview and context actions, and retained metadata for figures in closed notebooks.
- Added session-only figure history in the side panel, tab, and separate window, with version navigation, comparison, copying, export, and Escape-based history exit.
- Added history-version code viewing, copying, and safe restoration with stable cell targeting and normal notebook Undo support.

### Changed

- Update figure titles and tags immediately when their notebook metadata comments change, without rescanning or reloading image data.
- Apply toolbar and context-menu save, PDF export, and star/unstar actions to all selected thumbnails.
- Update This notebook mode immediately when the active JupyterLab notebook changes.

### Fixed

- Render Tags, Filters, and Settings menus in an unclipped application-level popup layer in side-panel, tab, and separate-window galleries.
- Support `title:`, `tag:`/`tags:`, `code:`, `cell:`, and `figure:` search qualifiers.
- Replaced browser fullscreen requests that embedded hosts may block with a reliable in-gallery focus mode; press Escape to restore the regular gallery.
- Kept Gallery controls and dropdown menus within narrow or resized panel bounds.
- Preserve the previous plot across the transient output-clearing stage of a cell rerun, so the history clock activates for the replacement output.
- Keep history-version images in the lazy thumbnail catalog so their thumbnails remain visible while browsing history.
- Keep the focused figure view open when moving between history versions with the preview arrows.

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
